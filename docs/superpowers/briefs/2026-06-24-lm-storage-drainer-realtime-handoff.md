# Бриф realtime: дренер чистки Storage при удалении листинга (LM follow-up)

> **Кому:** realtime-команде (`~/Projects/realtime`). **От:** superapp (MrSQM).
> **Дата:** 2026-06-24. **Статус:** контракт superapp задеплоен; realtime пишет воркер.
> **Почему realtime, не DB-pg_net:** у realtime уже есть service-role key + always-on воркер + supabase-js;
> удаление файлов = асинхронный внешний I/O (работа воркера); держим powerful-ключ вне БД/Vault.

## Зачем

LM-эпик добавил `delete_property(uuid)` — владелец полностью удаляет свой архивный листинг.
БД-следы стираются каскадом FK (11 таблиц) + явным DELETE. Но **физические файлы фото в Storage
каскад не трогает** — их надо удалить отдельно. Все файлы объекта лежат под префиксом
`{property_id}/` в бакете `property_photos` (`{id}/0_full.webp`, `{id}/0_thumb.webp`,
`{id}/fp_0_full.webp` …). `property_photos`-строки хранят `full_url`/`thumb_url`, НЕ путь — поэтому
чистим **по префиксу объекта**, а не по пути каждого фото.

## Контракт superapp (УЖЕ В ПРОДЕ — менять не нужно)

```sql
-- Таблица-очередь (RLS on; REVOKE с anon/authenticated; пишет DEFINER-триггер):
public.storage_cleanup_queue (
  id          bigserial PK,
  prefix      text NOT NULL,        -- '{property_id}/'
  enqueued_at timestamptz DEFAULT now(),
  attempts    int  DEFAULT 0,
  last_error  text
)

-- Триггер AFTER DELETE ON properties → INSERT prefix '{OLD.id}/' в очередь (в той же транзакции).
-- → при ЛЮБОМ удалении объекта префикс durable-захвачен; ничего не теряется при краше воркера.
```

## Задача realtime: воркер-дренер

Цикл (раз в ~60с поллингом, ИЛИ по `pg_notify` — см. «опционально» ниже):

1. Взять пачку строк: `SELECT id, prefix FROM storage_cleanup_queue ORDER BY id LIMIT 50;`
2. Для каждого `prefix`:
   a. Список ключей под префиксом: `supabase.storage.from('property_photos').list(prefix)`
   (или `SELECT name FROM storage.objects WHERE bucket_id='property_photos' AND name LIKE prefix||'%'`).
   b. Если ключей нет (объект был без фото) → сразу удалить строку очереди, continue.
   c. Удалить файлы: `supabase.storage.from('property_photos').remove([...ключи])` (service-role key).
   d. Успех (2xx) → `DELETE FROM storage_cleanup_queue WHERE id = <id>;`
   Ошибка → `UPDATE … SET attempts = attempts + 1, last_error = <msg> WHERE id = <id>;` (ретрай в след. цикл).
3. Идемпотентно: повторный прогон безопасен; отсутствующий файл — не ошибка.

## Доступ / безопасность

- Воркер ходит под **service_role** (или своей привилегированной DB-ролью). Очередь закрыта
  `REVOKE ALL … FROM anon, authenticated` — обычные клиенты её не видят.
- ⚠️ **Проверить грант:** если роль воркера ≠ service_role/supabase_admin, нужен `GRANT SELECT, DELETE, UPDATE
ON public.storage_cleanup_queue TO <роль>;` — **скажите superapp, добавим миграцией** (это наша таблица).
- service-role key уже у realtime (используется для доставки) — НЕ дублировать в БД/Vault.

## Опционально (если realtime предпочитает LISTEN вместо поллинга)

superapp может добавить в enqueue-триггер `pg_notify('storage_cleanup', OLD.id::text)` — тогда воркер
`LISTEN storage_cleanup` и дренит по событию. Скажите — добавим маленькой миграцией. По умолчанию —
поллинг (проще, не теряет события при рестарте воркера, очередь и так durable).

## Эджи

- Объект без фото → префикс в очереди, ключей 0 → строка снимается без HTTP.
- Параллельные воркеры → брать строки `FOR UPDATE SKIP LOCKED`, чтобы не дублировать удаление.
- Бакет `property_photos` (`public=t`). Удаление по списку ключей (`remove`) — не «папки».

## Граница

superapp realtime-репо не трогает. Что нужно от superapp (грант роли / `pg_notify` в триггере) —
**одна строка нам, добавим миграцией**. Сам воркер пишет realtime.
