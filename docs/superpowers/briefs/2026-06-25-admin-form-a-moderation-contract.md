# Контракт для Админки: модерация Official-листингов (Form A)

> **Дата:** 2026-06-25 · **Статус:** контракт передаётся в репо `~/Projects/admin` (отдельная сессия) · **Источник:** SP-B (superapp). Общая Supabase self-hosted.
> **Зачем:** SP-B (superapp) научил агентов создавать **Official-листинги** с прикреплённым **Form A (PDF)**. Official **всегда** уходит на модерацию (`properties.status='pending_review'`). Эти листинги должен **апрувить/реджектить модератор в Админке**. Этот файл — что именно Админка читает/пишет.
>
> ⚠️ Реализация — в **admin-сессии** (не из superapp). Здесь — только контракт (данные + действия). Точная UI-интеграция зависит от уже существующей модерации в Админке (если она есть для public-листингов — переиспользовать, добавив Form A-блок).

## 1. Где брать очередь на модерацию

Official-листинги, ждущие решения:

```sql
SELECT p.id, p.owner_id, p.listing_type, p.is_exclusive, p.visibility, p.created_at
FROM public.properties p
WHERE p.listing_type = 'official'
  AND p.status = 'pending_review'
ORDER BY p.created_at;
```

К каждому — последняя (или все) строки Form A (insert-only история):

```sql
SELECT fa.id, fa.contract_number, fa.listing_start, fa.listing_end,
       fa.file_url,            -- storage-path PDF в приватном бакете property_form_a
       fa.pdf_password,        -- пароль к PDF (⚠️ чувствительное — см. §4)
       fa.uploaded_by, fa.uploaded_at,
       fa.approved_at, fa.approved_by, fa.moderation_note
FROM public.property_form_a fa
WHERE fa.property_id = $1
ORDER BY fa.uploaded_at DESC;
```

Модератор ходит под **service_role** → RLS на `property_form_a` его не ограничивает (на клиенте таблица только select+insert владельцу; update/delete — нет вовсе).

## 2. Просмотр Form A PDF

- PDF лежит в **приватном** бакете `property_form_a`, путь `{owner_id}/{property_id}/<uuid>.pdf` (значение в `property_form_a.file_url`).
- Бакет приватный → нужен **signed URL** под service_role (Supabase Storage `createSignedUrl`), либо проксировать скачивание через бэкенд Админки.
- PDF **запаролен** → модератору показать `pdf_password`, чтобы открыть файл. (Пароль вводит агент при создании листинга.)

## 3. Действия модератора (что писать)

**Approve:**

> ⚠️ **ПОРЯДОК ОБЯЗАТЕЛЕН:** сначала Form A, потом properties. На `properties` стоит BEFORE-триггер
> `trg_official_requires_approved_forma`: при `UPDATE status='active'` он проверяет `property_form_a.approved_at`.
> Если форма ещё не помечена — статус принудительно откатывается в `pending_review`. Выполнять ОБЯЗАТЕЛЬНО
> в одной транзакции или строго в таком порядке.

```sql
BEGIN;
-- 1) СНАЧАЛА пометить конкретную строку Form A одобренной
UPDATE public.property_form_a
   SET approved_at = now(), approved_by = $moderator_id
 WHERE id = $form_a_id;
-- 2) ЗАТЕМ активировать листинг (триггер проверит approved_at в шаге 1 и пропустит)
UPDATE public.properties
   SET status = 'active'
 WHERE id = $property_id;
COMMIT;
```

**Reject:**

```sql
UPDATE public.properties
   SET status = 'rejected', rejection_reason = $reason
 WHERE id = $property_id;
UPDATE public.property_form_a
   SET moderation_note = $reason          -- approved_at ОСТАЁТСЯ NULL
 WHERE id = $form_a_id;
```

⚠️ **Обязательно писать в строку `property_form_a`, не только в `properties`.** Фронт (superapp) выводит статус Form A в карточке из полей строки:

- `approved_at IS NULL` и `moderation_note IS NULL` → «на проверке»
- `approved_at IS NOT NULL` → «approved»
- `moderation_note IS NOT NULL` и `approved_at IS NULL` → «rejected»

## 4. Безопасность

- `pdf_password` — **чувствительное**: показывать только модератору (авторизованный админ), **не логировать**, не отдавать наружу. В `get_property` (клиент) он НЕ возвращается — это намеренно.
- Бакет `property_form_a` приватный; не делать его public; signed URL — с коротким TTL.

## 5. Уже решено на стороне superapp (НЕ дублировать в Админке)

- RT-2-триггеры на `properties` ловят **и INSERT active, и UPDATE status→active** ([[listing-active-via-update-not-only-insert]]) → апрув (UPDATE status→active) сам запустит match-fan-out. Отдельный триггер «по апруву» не нужен.
- Лайфсайкл `property_form_a.status` (`active/expired/replaced`) и продление/expiry — это **SP-C** (движок сценариев), не текущая задача модерации.

## 6. Связь с SP-C (на будущее)

Флоу **«Add new»** (SP-C): агент прикрепляет НОВЫЙ Form A к уже существующему листингу → новая строка `property_form_a` + листинг снова `pending_review`. Та же очередь модерации §1 это покроет (фильтр по `pending_review` + наличие строки Form A без `approved_at`). Дополнительной логики на стороне Админки, скорее всего, не нужно — подтвердить при реализации SP-C.

## 7. Чеклист для admin-сессии

- [ ] Очередь: official + pending_review + join `property_form_a` (§1).
- [ ] Карточка модерации: contract_number, listing_start/end, is_exclusive, агент; кнопка «открыть Form A PDF» (signed URL) + показ `pdf_password`.
- [ ] Approve → UPDATE properties.status=active + property_form_a.approved_at/approved_by (§3).
- [ ] Reject → UPDATE properties.status=rejected+rejection_reason + property_form_a.moderation_note (§3).
- [ ] Переиспользовать существующую модерацию public-листингов, если есть; добавить только Form A-блок.
- [ ] `pdf_password` не логировать; signed URL короткий TTL (§4).
