-- Фикс: создание объекта новым агентом падало с RLS-ошибкой 42501 на agent_activity.
--
-- Цепочка: INSERT properties(status=active) → trg_activate_on_property → activate_user()
--   → INSERT agent_score_events → trg_sync_activity_score → sync_activity_score()
--   → INSERT agent_activity → RLS блок (таблица с RLS, без INSERT-политики).
--
-- activate_user() была SECURITY INVOKER (права юзера), но по смыслу это серверная
-- операция: активация аккаунта, начисление баллов и реферальных бонусов. Под правами
-- обычного юзера утыкается в RLS (agent_activity, а также молча в users.activated_at).
-- Уже активированные юзеры не натыкались — функция рано выходит (activated_at IS NOT NULL).
--
-- Владелец функции — supabase_admin (bypassrls), поэтому SECURITY DEFINER пропускает
-- всю цепочку (вложенные триггеры наследуют security-контекст) с серверными правами.
-- Тело функции не меняется.

ALTER FUNCTION public.activate_user() SECURITY DEFINER;
