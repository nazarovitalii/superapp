# Журнал тестов — MrSQM (superapp)

Фиксируем **успешные прод-тесты** с кодом запроса, ожидаемым и фактическим результатом.

---

## Рутина

После каждого прод-теста добавляй запись:

```
### T-<N>: <что проверяли>
**Дата:** YYYY-MM-DD
**Триггер:** <что изменилось / зачем тест>
**Запрос:** <curl / суть>
**Ожидали:** ...
**Получили:** ...
**Вывод:** ...
```

---

### T-S2: Таб «AI Chat» — сборка/юнит-гейты (S-2)

**Дата:** 2026-06-18
**Триггер:** новый таб AI Chat (стрим SSE + история + фолбэк), роут `mrsqm/chat` stub→ChatPageComponent.
**Запрос:** локальные гейты перед деплоем — `npm test`, `npm run buildFrontend:prodWeb`, `checkFile`.
**Ожидали:** зелёный сюит, прод-сборка без ошибок типов/бюджета.
**Получили:** сюит **11073 SUCCESS** (16 новых: 9 service + 7 component); prodWeb build complete (no errors); checkFile clean. Финальное ревью (opus) = merge (0 Critical/Important; XSS-санитайз и приватность `{text,channel}` подтверждены).
**Вывод:** ✅ собирается и проходит юнит-гейты. ⏳ **Лайв-стрим end-to-end** (ввод сообщения → SSE-печать → история) проверить под залогиненным юзером (нужен Supabase-токен) — отдельный прод-тест T-S2-live.

---

### T-S3: Редизайн таба «AI Chat» — ChatGPT-вид (S-3)

**Дата:** 2026-06-18
**Триггер:** визуальный редизайн таба чата (центр-колонка, ассистент без пузыря + аватар,
чипы-подсказки, композер-пилюля, авто-скролл/рост, пульс/shimmer) в теме SP. Реализация —
Subagent-Driven (2 задачи + 1 fix reduced-motion).
**Запрос:** локальные гейты — `npm run test:file` (chat spec), `npm run checkFile` (ts+scss),
`npm run buildFrontend:prodWeb`.
**Ожидали:** зелёный спек, прод-сборка без ошибок типов/бюджета, чистый prettier/eslint.
**Получили:** **18/18** тестов (13 логика + 5 DOM); checkFile ✅ ts+scss; prodWeb build ✅ (17.9s).
Финал-ревью (opus, 3 коммита) = **Ready to merge YES**, 0 Critical/0 Important; подтверждены
приватность (только `{text,channel}`+Bearer, без нового логирования), санитайз markdown
(нет `innerHTML`/`bypassSecurityTrust`), только токены SP, reduced-motion, a11y.
**Вывод:** ✅ собирается и проходит гейты. ⚠️ Доп.фикс `91d2f594f`: коммит `323f3a230` ушёл
через `--no-verify` с prettier-нарушением в спеке (строки >90) → CI-lint бы упал; переформатировано.
⏳ **Лайв-вид** под логином — визуально оценить после деплоя.

---

### T-GF1: Миграция `get_feed` v2 — новая сигнатура (Фильтры ленты v2)

**Дата:** 2026-06-21 · **Где:** прод Supabase (self-hosted), применено под `supabase_admin`
в одной транзакции (`--single-transaction -v ON_ERROR_STOP=1`).
**Что проверяли:** полный DROP+CREATE `get_feed` (смена сигнатуры) применился без потери функции;
новые параметры присутствуют; старый `p_is_distress` удалён; функция исполняется.
**Ожидали:** `DROP FUNCTION`+`CREATE FUNCTION`; в сигнатуре `p_floor_level_ids uuid[]`,
`p_floors_in_unit_ids uuid[]`, `p_cheques int[]`, `p_is_study`, `p_is_reduced`, `p_is_below_op`,
`p_is_vastu`; `p_is_distress` отсутствует; вызов `get_feed('sale', p_city_id=>…)` возвращает jsonb.
**Получили:** ✅ `DROP FUNCTION`+`CREATE FUNCTION`; `pg_get_function_arguments` подтвердил
7 новых/изменённых параметров и отсутствие `p_is_distress`; smoke-вызов вернул
`{count_total, limit}` без ошибок. Текущий прод-фронт не затронут (эти параметры не передаёт).
**Вывод:** ✅ миграция корректна. ⏳ Фильтрация по новым полям из UI — после Track 2 (панель).

---

### T-GF2: Миграция `get_feed` — заселённость мультиселект (`p_occupancy_status` → text[])

**Дата:** 2026-06-21 · **Где:** прод Supabase, под `supabase_admin`, в транзакции.
**Что:** DROP+CREATE `get_feed` — `p_occupancy_status text` → `text[]` (тело `= ANY(...)`).
**Получили:** ✅ `DROP`+`CREATE`; `pg_get_function_arguments` → `p_occupancy_status text[]`;
smoke `get_feed('rent', p_occupancy_status=>['vacant','occupied'])` вернул jsonb без ошибок.
**Вывод:** ✅ заселённость-мультиселект работает на сервере (соответствует UI-мультиселекту панели).

---

### T-US1: Стадия 1 unseen-трекинга — read-side (5 миграций)

**Дата:** 2026-06-22 · **Где:** прод Supabase (self-hosted), под `supabase_admin`, каждая в транзакции (`apply-migration.sh`).
**Что проверяли:** применение 5 миграций Стадии 1 и корректность read-side контракта (интроспекция + smoke).
**Ожидали:** `user_seen_listings.shown_at` есть; `seen_at` стал nullable; `mark_listings_shown(uuid[])` создан;
`get_feed` отдаёт `is_unseen`; `track_view` без гарда «раз в день», пишет `shown_at`, сохранил `search_path extensions`.
**Получили:** ✅ `shown_at`=YES, `seen_at` is_nullable=YES; `mark_listings_shown(p_property_ids uuid[])` существует;
`position('is_unseen' in pg_get_functiondef('get_feed'))>0`=t; `track_view`: `CURRENT_DATE` поз=0 (гард снят),
`shown_at` пишется=t, `extensions` в search_path=t. Pre-apply: типы ключей все uuid, дублей `(filter_id,property_id)`=0.
**Вывод:** ✅ read-side корректен, backward-compatible (текущий прод-фронт не затронут). ⏳ UI e2e (полоска+3с-fade) —
визуальная проверка на проде после раскатки фронта.

---

### T-US2: Стадия 2 (воронка) + realtime matched_at + overload + get_saved_filters live

**Дата:** 2026-06-22 · **Где:** прод Supabase, под `supabase_admin`, каждая в транзакции (`apply-migration.sh`).
**Что проверяли:** применение 6 миграций (Ст.2 ×3 + `filter_matches.matched_at` + `mark_listings_shown(uuid[],uuid)` + `get_saved_filters` live) и их корректность.
**Ожидали:** `contact_at` и `matched_at` есть; `mark_listing_contact`/`get_listing_delivery_stats` созданы; overload `mark_listings_shown(uuid[],uuid)` доступен ТОЛЬКО `service_role`; `get_saved_filters` считает `unseen_count` live по `MAX(matched_at)`.
**Получили:** ✅ `contact_at`=1, `matched_at`=1; обе RPC существуют; `mark_listings_shown` имеет 2 перегрузки; **гранты overload (aclexplode) = только `service_role`+owner-роли** (после явного `REVOKE` с `anon`/`authenticated` — Supabase вешает их через default privileges, не PUBLIC; первая проверка показала дыру, пофикшено); `get_saved_filters` — `sf.unseen_count` отсутствует, есть `max(fm.matched_at)`.
**Вывод:** ✅ read-side Стадий 2/3 корректен. 🟢 Live-бейдж заработает реально после деплоя matcher realtime (пишет `matched_at`). ⏳ UI-проверка воронки/бейджа — после пуша фронта.

---

---

### T-TU2: Создание тест-юзера 2 — полный чеклист (6 шагов)

**Дата:** 2026-06-22 · **Где:** прод Supabase, под `supabase_admin`.
**Что проверяли:** создание test2@mrsqm.dev (uuid b0000002-…002) и последовательное устранение трёх независимых точек отказа — GoTrue login, RLS-цепочка триггера, пустая лента.
**Шаги и результаты:**

1. `auth.users` создан (bcrypt пароль, email_confirmed_at, raw_app_meta_data) → `curl /auth/v1/token?grant_type=password` → **500** (нет identity).
2. `auth.identities` добавлен (provider=email, provider_id=user_id, identity_data jsonb, без GENERATED-колонки `email`) → повтор curl → **500** (NULL token fields).
3. Все token-поля (confirmation_token, recovery_token, …) обнулены `COALESCE(x,'')` → повтор curl → **200**, access_token получен ✅.
4. `public.users` (role=agent, is_active=true) уже был → вход в приложение ✅.
5. Создан первый объект → **42501** (RLS agent_activity). Исправлено: `ALTER FUNCTION activate_user() SECURITY DEFINER`. Повтор → объект создан ✅.
6. Лента пустая — `user_context.city_id = NULL`. `UPDATE user_context SET city_id=Dubai`. Лента показала 3 объекта test2 ✅.
   **Вывод:** ✅ все 6 шагов обязательны — без любого из них тихие падения. Чеклист в памяти `test-user-creation-checklist.md`.

---

### T-RT014: Owner-skip matching (014) — верификация

**Дата:** 2026-06-22 · **Где:** прод Supabase (psql через apply-migration.sh).
**Что проверяли:** `match_property`/`match_filter` с owner-skip не отдают владельцу его же объекты.
**Ожидали:** `match_filter('9ad6160b-…' — фильтр «Апарты» nazarovitalii)` = только объекты test2 (не nazarovitalii).
**Получили:** 2 результата — `7141534d…` и `5d7a8fea…` (оба от test2, unit_type = e39baf07 Apartment). Третий объект test2 `b9e3a5d3…` (unit_type = 4bd56ade, не совпадает с фильтром) — корректно исключён. 12 объектов nazarovitalii исключены owner-skip.
**Вывод:** ✅ owner-skip корректен, NULL-safe (`IS DISTINCT FROM`). GRANT service_role сохранён.

---

### T-FB1: Бейдж непросмотра по фильтру + owner-skip is_unseen — DB-верификация

**Дата:** 2026-06-23 · **Где:** прод Supabase (psql через SSH+docker, всё в `BEGIN … ROLLBACK`).
**Что проверяли:** функционально (не только наличие патчей) 4 применённые миграции.

1. **Патчи легли** (definition-check): `get_saved_filters` содержит `user_filter_seen`=t; `get_feed` содержит owner-skip предикат=t; `mark_filter_seen(uuid,uuid[])` существует=t; таблица `user_filter_seen` существует=t. → **4×t** ✅
2. **`mark_filter_seen` security guard** (impersonation через `set_config('request.jwt.claims')`): пометка СВОЕГО фильтра → вставлено `own_rows=1`; попытка пометить ЧУЖОЙ фильтр → `foreign_rows=0` (заблокировано EXISTS-guard). → ✅ нельзя пометить чужой фильтр.
3. **Бейдж частичное гашение** (Bug B): владелец фильтра с активными матчами, `get_saved_filters.unseen_count` **BEFORE=2** → `mark_filter_seen(fid,[1 матч])` → **AFTER=1** (ровно −1). → ✅ бейдж считает по `user_filter_seen`, тает частично; на `shown_at` (общую ленту) больше не завязан.

**Контекст:** в системе `fm_active_total=3` активных матчей. Всё прогнано в ROLLBACK — следов в БД нет.
**Вывод:** ✅ DB-уровень полностью. Критерий #1 (свои не светятся) доказан definition-check'ом + проверкой приоритета операторов (opus-ревью); визуальная проверка на проде (капсула, частичное гашение в UI) — **pending после деплоя Coolify**.

---

### T-FB2: Re-notify по updated_at — DB-верификация

**Дата:** 2026-06-23 · **Где:** прод Supabase (ROLLBACK-транзакция).
**Что проверяли:** 2 применённых патча — `mark_filter_seen` (`ON CONFLICT DO UPDATE seen_at=now()`) и `get_saved_filters.unseen_count` (`GREATEST(p.created_at,p.updated_at) > GREATEST(sf.created_at, COALESCE(seen_at,'epoch'))`).
**Цикл (один матч фильтра):**
- A: объект изменён (`last_actualized_at=now`), не просмотрен → `unseen_count=2` (считается).
- B: просмотрел в фильтре (`mark_filter_seen` → `seen_at=now`) → `=1` (**−1**, объект ушёл из счётчика).
- C: объект изменён ПОСЛЕ просмотра (симуляция: `seen_at` сдвинут в прошлое) → `=2` (**re-notify +1**).

**Вывод:** ✅ фильтр стартует с 0 (объекты старше фильтра исключены: `GREATEST(obj) ≤ sf.created_at`); объект, созданный/обновлённый позже фильтра — считается; повторное обновление после просмотра снова даёт +1. Доставка числа — pull (при чтении `get_saved_filters`/открытии панели), live-push отложен. Артефакт смоука: `now()` заморожен в транзакции, поэтому «изменён после просмотра» воспроизводится сдвигом `seen_at`, не баг.

---

### T-SC1: get_feed серверный scope + P2-фикс + единый проход

**Дата:** 2026-06-23 · **Где:** прод Supabase (ROLLBACK-смоук → реальное применение под supabase_admin).
**Тест-юзеры:** `nazarovitalii@gmail.com` (8db1f713, 15 active + 2 pending sale), `test2@mrsqm.dev` (b0000002, 3 active sale, visibility=network). Подружены обоюдно (`friendships` accepted → matview `user_network` обновлён триггером).
**Данные:** сид-база (18 active total, 2 owner, 0 public-объектов; сети были пусты до теста).

**Отрицательные/структурные (ROLLBACK-смоук):**
- A: сигнатура оканчивается на `p_scope text DEFAULT 'all'` + `p_my_status text DEFAULT 'all'` → ✅
- B: старый дубль `visibility IN ('public','network')` отсутствует (единый предикат) → ✅
- C: scope=my по статусам: `all=17` (15 active + 2 pending), `active=15`, `pending=2`, `archived=0` → ✅ маппинг верен
- D/E: scope=all `count_total = returned` → ✅
- G: невалидный `p_scope` И невалидный `p_my_status` → исключение (оба PASS) → ✅

**Положительный путь P2 (после дружбы, ROLLBACK-смоук):**
- nazarovitalii `friends` = **3** (network-объекты test2), все `owner=test2`, `is_network=true`, своих нет → ✅
- nazarovitalii `all` = **3** (0 public + 3 своя-сеть), своих нет → ✅
- test2 `friends` = **15** (network-объекты nazarovitalii) → ✅
- Чужой карман вне сети НЕ виден (старая функция отдавала 18 = свои+чужой network — утечка P2 закрыта).

**Применение (реально):** `DROP FUNCTION` + `CREATE FUNCTION` + `GRANT` без ошибок; пост-верификация: `has_scope=t`, `no_visibility_IN=t`, сигнатура с двумя новыми параметрами.
**Вывод:** ✅ Серверный охват (all/friends/my) и статус-фильтр My работают; P2 закрыт в обе стороны; единый проход (count(*) OVER()) корректен. Файл → `applied/`.

---

### T-SC2: get_saved_filters — unseen_count=0 для My-фильтров

**Дата:** 2026-06-23 · **Где:** прод Supabase (ROLLBACK-смоук → реальное применение).
**Что проверяли:** staleness-proof DO-патч: обёртка формулы re-notify в `CASE WHEN sf.filters->>'scope'='my' THEN 0 ELSE <re-notify> END`.
- Патч применён: NOTICE «my-scope → 0 применён»; `has_scope_case=t` (определение содержит `sf.filters->>'scope'`) → ✅
- Существующие фильтры не сломаны: `get_saved_filters(nazarovitalii)` = 2 строки (как и до патча) → ✅ правка меняет только скаляр unseen_count между якорями, число строк не меняется.
- My-scope фильтров в сид-данных нет (4 фильтра: 3 public + 1 null-scope) → ветка my→0 проверена логикой/смоуком вакуумно.
**Вывод:** ✅ Применено; My-фильтры получат `unseen_count=0` (жёлтого бейджа нет). Файл → `applied/`.

---

_Других тестов пока нет._
