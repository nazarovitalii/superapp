-- Миграция: починка триггерной функции activate_user()
-- Дата: 2026-06-11
--
-- ПРОБЛЕМА:
--   Функция activate_user() навешана на две таблицы:
--     - properties     (триггер trg_activate_on_property)  — поле owner_id
--     - saved_filters   (триггер trg_activate_on_filter)    — поле user_id
--   Тело функции жёстко читает NEW.user_id. На properties поля user_id нет →
--   любой INSERT в properties падал с ошибкой 42703
--   («record "new" has no field "user_id"»). Из-за этого НИКТО не мог добавить
--   объект (таблица properties оставалась пустой).
--
-- РЕШЕНИЕ:
--   Брать id из правильного поля по имени таблицы (TG_TABLE_NAME):
--     properties     → NEW.owner_id
--     saved_filters  → NEW.user_id
--   Реферальная логика (бонусы/баллы/рефералы) НЕ меняется — только источник
--   v_user_id. Для saved_filters поведение идентично прежнему.

CREATE OR REPLACE FUNCTION public.activate_user()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_user_id       UUID;
  v_referrer_id   UUID;
  v_ref_id        UUID;
  v_referrer_months INTEGER;
BEGIN
  -- properties использует owner_id, остальные таблицы — user_id
  IF TG_TABLE_NAME = 'properties' THEN
    v_user_id := NEW.owner_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;

  -- проверить что юзер ещё не активирован
  IF EXISTS (
    SELECT 1 FROM users WHERE id = v_user_id AND activated_at IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- активировать
  UPDATE users SET activated_at = now() WHERE id = v_user_id;

  -- начислить баллы за онбординг (первая публикация или первый фильтр)
  INSERT INTO agent_score_events (user_id, event_type, points, source_id)
  VALUES (v_user_id, 'user_activated', 0, NULL);

  -- если есть реферер со статусом pending
  SELECT r.referrer_id, r.id INTO v_referrer_id, v_ref_id
  FROM referrals r
  WHERE r.referred_id = v_user_id AND r.status = 'pending'
  LIMIT 1;

  IF v_referrer_id IS NOT NULL THEN

    -- подарок новому юзеру (+1 месяц всегда)
    INSERT INTO subscription_gifts (user_id, months, source, reason, ref_id)
    VALUES (v_user_id, 1, 'referral', 'Referral activation gift', v_ref_id);

    -- проверить лимит реферера (максимум 3 месяца суммарно)
    SELECT COALESCE(SUM(months), 0) INTO v_referrer_months
    FROM subscription_gifts
    WHERE user_id = v_referrer_id AND source = 'referral';

    IF v_referrer_months < 3 THEN
      INSERT INTO subscription_gifts (user_id, months, source, reason, ref_id)
      VALUES (v_referrer_id, 1, 'referral', 'Referral bonus — your referral activated', v_ref_id);
    END IF;

    -- начислить баллы рефереру за активацию (+20, но с учётом капа 3 мес)
    -- баллы начисляем всегда, кап только на подписку
    INSERT INTO agent_score_events (user_id, event_type, points, source_id)
    VALUES (v_referrer_id, 'referral_activated', 20, v_user_id);

    -- закрыть реферал
    UPDATE referrals
    SET status = 'completed'
    WHERE id = v_ref_id;

  END IF;

  RETURN NEW;
END;
$function$;
