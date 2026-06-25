# Задание для Админки: модерация Official-листингов (Form A)

> **Дата:** 2026-06-25 · **Репо:** `~/Projects/admin` · **Реализовать в отдельной admin-сессии**
> **Источник:** эпики SP-B + SP-C1 (superapp). Общая Supabase self-hosted (`ubuntu@51.83.197.222`).
> **Контракт (полный):** `docs/superpowers/briefs/2026-06-25-admin-form-a-moderation-contract.md`

---

## Что случилось в superapp (контекст)

SP-B (2026-06-25): агенты теперь могут создавать **Official-листинги** — тип с прикреплённым
Form A (юридический договор листинга в Дубае, PDF). Поля:

- `contract_number` — номер договора
- `listing_start` / `listing_end` — срок действия
- `is_exclusive` — эксклюзив
- PDF файл — в приватном бакете `property_form_a`
- `pdf_password` — пароль к PDF (если запаролен)

SP-C1 (2026-06-25): в БД стоит **BEFORE-триггер** `trg_official_requires_approved_forma` на таблице
`properties`. Инвариант: **Official-листинг может быть `active` ТОЛЬКО если его последняя строка
`property_form_a` имеет `approved_at IS NOT NULL`**. Если форма не одобрена → статус принудительно
`pending_review`, даже при UPDATE через devtools.

---

## Схема БД (читать, не менять)

### Таблица `property_form_a`

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'property_form_a'
ORDER BY ordinal_position;
```

Колонки:

- `id` uuid PK
- `property_id` uuid FK → properties
- `file_url` text — storage path: `{owner_id}/{property_id}/{uuid}.pdf`
- `contract_number` text NOT NULL
- `listing_start` date NOT NULL
- `listing_end` date NOT NULL
- `pdf_password` text — пароль к PDF (null если нет пароля)
- `status` text — жизненный цикл (SP-C, пока не используется активно)
- `uploaded_by` uuid FK → users
- `uploaded_at` timestamptz DEFAULT now()
- `approved_at` timestamptz — NULL = не одобрено, IS NOT NULL = одобрено
- `approved_by` uuid — кто одобрил
- `moderation_note` text — причина reject

**RLS (клиентский anon):** SELECT+INSERT только владелец. UPDATE/DELETE — запрещены. Админка ходит под
service_role → RLS не ограничивает.

---

## Очередь на модерацию

```sql
SELECT
  p.id AS property_id,
  p.owner_id,
  p.listing_type,
  p.is_exclusive,
  p.visibility,
  p.created_at,
  u.full_name AS owner_name,
  u.phone AS owner_phone,
  fa.id AS form_a_id,
  fa.contract_number,
  fa.listing_start,
  fa.listing_end,
  fa.file_url,
  fa.pdf_password,     -- ⚠️ ЧУВСТВИТЕЛЬНОЕ — только для модератора, не логировать
  fa.uploaded_at,
  fa.approved_at,
  fa.approved_by,
  fa.moderation_note
FROM public.properties p
JOIN public.users u ON u.id = p.owner_id
JOIN public.property_form_a fa ON fa.property_id = p.id
WHERE p.listing_type = 'official'
  AND p.status = 'pending_review'
  AND fa.approved_at IS NULL  -- только последняя неодобренная Form A
ORDER BY fa.uploaded_at ASC;   -- FIFO
```

---

## Просмотр PDF

Бакет **приватный** → нужен signed URL под service_role:

```js
// В бэкенде Админки (service_role)
const { data } = await supabase.storage
  .from('property_form_a')
  .createSignedUrl(fa.file_url, 600); // TTL 10 минут

// data.signedUrl — открыть в новой вкладке
```

После открытия — показать модератору `pdf_password` (если есть), чтобы разблокировать PDF.

---

## Действия модератора

### ✅ Approve

> ⚠️ **ПОРЯДОК ОБЯЗАТЕЛЕН.** BEFORE-триггер проверяет `approved_at` в момент `UPDATE properties`.
> Если Form A не помечена одобренной ДО смены статуса — триггер откатит статус в `pending_review`.

```sql
BEGIN;

-- ШАГ 1: пометить Form A одобренной (СНАЧАЛА)
UPDATE public.property_form_a
   SET approved_at = NOW(),
       approved_by = $moderator_user_id  -- uuid модератора из сессии
 WHERE id = $form_a_id;

-- ШАГ 2: активировать листинг (ПОСЛЕ шага 1)
UPDATE public.properties
   SET status = 'active',
       published_at = COALESCE(published_at, NOW()),
       expires_at = COALESCE(expires_at, NOW() + INTERVAL '30 days')
 WHERE id = $property_id
   AND listing_type = 'official';  -- доп. guard: только official

COMMIT;
```

После commit: RT-2 DDL-триггеры поймают UPDATE status→active и запустят match-fan-out (матчинг
по сохранённым фильтрам агентов). Дополнительно ничего делать не нужно.

### ❌ Reject

```sql
BEGIN;

-- Записать причину в Form A
UPDATE public.property_form_a
   SET moderation_note = $reason   -- approved_at ОСТАЁТСЯ NULL
 WHERE id = $form_a_id;

-- Выставить rejected + причину в properties
UPDATE public.properties
   SET status = 'rejected',
       rejection_reason = $reason
 WHERE id = $property_id;

COMMIT;
```

Агент видит статус Rejected + причину в карточке объекта (superapp уже это рендерит).

---

## UI — что показывать модератору

### Карточка модерации

| Поле          | Источник                              |
| ------------- | ------------------------------------- |
| Агент         | `owner_name` / `owner_phone`          |
| Contract №    | `fa.contract_number`                  |
| Срок договора | `fa.listing_start` — `fa.listing_end` |
| Эксклюзив     | `p.is_exclusive` (Да/Нет)             |
| Form A PDF    | Кнопка «Открыть» → signed URL         |
| Пароль к PDF  | `fa.pdf_password` (если не NULL)      |
| Загружено     | `fa.uploaded_at`                      |

### Кнопки действий

- **Одобрить** → Approve SQL (шаги 1+2, одна транзакция)
- **Отклонить** → Reject SQL с полем ввода причины

---

## Если в Админке уже есть модерация public-листингов

Нужно добавить:

1. Фильтр очереди: `listing_type='official'` — отдельная вкладка ИЛИ колонка типа в общей очереди
2. Блок «Form A» в карточке (contract_number, даты, ссылка PDF + пароль)
3. Кнопки Approve/Reject (отдельные от общей модерации — разная логика с триггером)

**НЕ переиспользовать простой `UPDATE properties SET status='active'`** — там нет шага Form A → триггер
откатит в pending_review.

---

## Безопасность

- `pdf_password` — только UI модератора, **не логировать**, не в API-ответах
- Signed URL — TTL ≤ 10 минут (auto-expire)
- Модератор должен быть авторизован в Админке с ролью admin/moderator
- service_role key — только на сервере Админки, не в браузере

---

## Проверка после реализации

1. Создать Official-листинг в superapp → статус `pending_review` — появился в очереди Админки
2. Открыть PDF через signed URL → разблокировать паролем
3. Нажать Approve → листинг стал `active`, Form A получила `approved_at`
4. Нажать Reject → листинг `rejected`, Form A получила `moderation_note`
5. В superapp: карточка Rejected показывает причину; Approved — статус Активен

---

## Связанные файлы в superapp

- Контракт: `docs/superpowers/briefs/2026-06-25-admin-form-a-moderation-contract.md`
- Миграция SP-B: `docs/migrations/applied/2026-06-25-sp-b-form-a.sql`
- Миграция SP-C1 (триггер): `docs/migrations/applied/2026-06-25-spc1-official-invariant.sql`
- Спека: `docs/superpowers/specs/2026-06-25-edit-official-form-a-design.md` (§5 Контракт Админки)
