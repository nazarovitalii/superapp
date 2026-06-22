-- Фикс: test2 не видел ленту (даже свои объекты), т.к. user_context.city_id = NULL
-- → get_feed бросает 'city_id could not be determined' (docs/database.md:113-114).
-- Ставим Dubai (где и созданы его объекты). Запись в user_context уже есть.

UPDATE user_context
SET city_id = '81ff77a4-5660-475c-a621-c2a74b474edd'  -- Dubai
WHERE user_id = 'b0000002-0000-0000-0000-000000000002';

-- Подстраховка: если записи не было — создать (defaults закроют NOT NULL поля).
INSERT INTO user_context (user_id, city_id)
SELECT 'b0000002-0000-0000-0000-000000000002', '81ff77a4-5660-475c-a621-c2a74b474edd'
WHERE NOT EXISTS (
  SELECT 1 FROM user_context WHERE user_id = 'b0000002-0000-0000-0000-000000000002'
);
