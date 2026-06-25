# Задание для Админки: ЕДИНЫЙ список модерации листингов (Pocket-Public + Official-FormA)

> **Дата:** 2026-06-25 · **Репо:** `~/Projects/admin` · **Реализовать в отдельной admin-сессии**
> **Источник:** superapp (эпики SP-B, SP-C1 + базовая модель видимости). Общая Supabase self-hosted (`ubuntu@51.83.197.222`).
> **Связанный документ:** `docs/superpowers/briefs/2026-06-25-admin-task-form-a-moderation.md` — детали Official/Form A (signed-URL, PDF, пароль). Этот файл — НАДмножество: описывает **один** список модерации на оба типа.

---

## TL;DR (ответ на вопрос «можно ли в один список?»)

**Да.** Очередь модерации — это просто `properties.status = 'pending_review'`. В неё попадают **два разных типа** листингов, и их можно (и нужно) показывать в ОДНОМ списке. Различается только **действие Approve** — оно ветвится по `listing_type`.

| Тип в очереди | Что это | Form A? | Approve |
| --- | --- | --- | --- |
| **Pocket + Public** | обычный листинг (`listing_type='pocket'`), выставленный в публичную выдачу (`visibility='public'`) | ❌ нет | простой `UPDATE status='active'` |
| **Official** | официальный листинг (`listing_type='official'`) с прикреплённым Form A (PDF-договор) | ✅ да | **сначала** одобрить Form A, **потом** активировать (иначе триггер откатит) |

---

## Модель данных: почему именно эти два типа

В superapp **две независимые оси** у листинга:

| Ось | Значения | Смысл |
| --- | --- | --- |
| `listing_type` | `pocket` · `official` | pocket = обычный (без договора); official = с Form A (юр. договор листинга, PDF) |
| `visibility` | `network` · `public` | network = только своей группе; public = в общую публичную выдачу |

**Правило статуса при создании/правке** (superapp, [add-property](../../../src/app/mrsqm/pages/add-property/add-property-page.component.ts) и `republish_property`):

```
status = (listing_type='official'  ИЛИ  visibility <> 'network') ? 'pending_review' : 'active'
```

То есть:

| listing_type | visibility | → status | модерация? |
| --- | --- | --- | --- |
| pocket | network | `active` | ❌ нет (сразу в свою группу) |
| pocket | **public** | **`pending_review`** | ✅ **да** (этот файл) |
| official | network/public | `pending_review` | ✅ да (Form A) |

⛔ **Network-листинги модерацию НЕ проходят** — это by design (поправка создателя 2026-06-22): network = доверенная своя группа без модерации. Не «чинить» это.

---

## Очередь на модерацию (единый запрос)

`pending_review` + `LEFT JOIN` на Form A (NULL для pocket):

```sql
SELECT
  p.id            AS property_id,
  p.owner_id,
  p.listing_type,                       -- 'pocket' | 'official' → ветвление Approve
  p.visibility,
  p.status,
  p.created_at,
  p.price,
  p.price_currency,
  u.full_name     AS owner_name,
  u.phone         AS owner_phone,
  -- Form A только у official (для pocket все fa.* = NULL):
  fa.id           AS form_a_id,
  fa.contract_number,
  fa.listing_start,
  fa.listing_end,
  fa.file_url,                          -- путь PDF в приватном бакете property_form_a
  fa.pdf_password,                     -- ⚠️ ЧУВСТВИТЕЛЬНОЕ — только UI модератора, не логировать
  fa.uploaded_at,
  fa.approved_at
FROM public.properties p
JOIN public.users u ON u.id = p.owner_id
LEFT JOIN LATERAL (
  SELECT f.*
  FROM public.property_form_a f
  WHERE f.property_id = p.id
    AND f.approved_at IS NULL          -- последняя НЕодобренная Form A
  ORDER BY f.uploaded_at DESC
  LIMIT 1
) fa ON p.listing_type = 'official'
WHERE p.status = 'pending_review'
ORDER BY p.created_at;                  -- FIFO
```

Модератор ходит под **service_role** → RLS не ограничивает. (На клиенте `property_form_a` = select+insert только владельцу; update/delete запрещены вовсе.)

**UI-разделение в одном списке:** колонка/бейдж «Тип» (`Pocket` / `Official`) ИЛИ две вкладки одной очереди. Official-строки дополнительно раскрывают блок Form A (contract_number, даты, кнопка PDF, пароль). Pocket-строки — только данные листинга (локация, цена, фото, описание).

---

## Действия модератора

### ✅ Approve — Pocket + Public (простой путь)

Form A нет, триггера-ограничения нет → один UPDATE:

```sql
UPDATE public.properties
   SET status = 'active',
       published_at = COALESCE(published_at, NOW())
 WHERE id = $property_id
   AND listing_type = 'pocket';        -- guard: только pocket этим путём
-- expires_at НЕ ставить вручную: триггер trg_set_expires_on_activation
-- сам выставит now() + 30 дней при переходе в active.
```

### ✅ Approve — Official (путь Form A — ПОРЯДОК ОБЯЗАТЕЛЕН)

> ⚠️ На `properties` стоит BEFORE-триггер `trg_official_requires_approved_forma`: official может стать `active` ТОЛЬКО если последняя строка `property_form_a` имеет `approved_at IS NOT NULL`. Если не одобрить Form A ДО смены статуса — триггер откатит в `pending_review`.

```sql
BEGIN;
-- ШАГ 1 (СНАЧАЛА): одобрить Form A
UPDATE public.property_form_a
   SET approved_at = NOW(), approved_by = $moderator_user_id
 WHERE id = $form_a_id;
-- ШАГ 2 (ПОТОМ): активировать листинг
UPDATE public.properties
   SET status = 'active',
       published_at = COALESCE(published_at, NOW())
 WHERE id = $property_id
   AND listing_type = 'official';
COMMIT;
```

Детали Form A (signed-URL для PDF, пароль) — в `2026-06-25-admin-task-form-a-moderation.md`.

### ❌ Reject — одинаково для обоих типов

```sql
UPDATE public.properties
   SET status = 'rejected',
       rejection_reason = $reason       -- видит только владелец (superapp рендерит причину)
 WHERE id = $property_id;
```

Для **official** дополнительно (необязательно, но полезно) записать причину и в Form A — `approved_at` остаётся NULL:

```sql
UPDATE public.property_form_a
   SET moderation_note = $reason
 WHERE id = $form_a_id;
```

---

## После Approve

Переход `status → active` (UPDATE) ловят RT-2 DDL-триггеры → запускается match-fan-out по сохранённым фильтрам агентов. Дополнительно ничего не делать. ⚠️ Хук обязан ловить именно **UPDATE status→active**, не только INSERT (public/pocket-public активируются UPDATE-ом).

---

## ⛔ Чего НЕ делать

- **НЕ** activate network-листинги — они в очередь не попадают (и не должны).
- **НЕ** использовать простой `UPDATE status='active'` для **official** — триггер откатит (нет шага Form A).
- **НЕ** логировать `pdf_password` и не отдавать его в API-ответах — только UI модератора.
- **НЕ** трогать `expires_at` руками — ставит триггер при активации.

---

## Безопасность

- `service_role` key — только на сервере Админки, не в браузере.
- `pdf_password` — только UI модератора, не в логах/ответах.
- Signed URL Form A — TTL ≤ 10 минут.
- Модератор авторизован в Админке с ролью admin/moderator.

---

## Проверка после реализации

1. **Pocket+Public:** создать в superapp pocket-листинг с visibility=public → `pending_review`, появился в очереди (без блока Form A). Approve → `active`, виден в публичной выдаче.
2. **Official:** создать official + Form A → `pending_review`, в очереди с блоком Form A. Approve (Form A → properties) → `active`.
3. **Reject** (любой тип) → `rejected`; в superapp карточка владельца показывает причину.
4. **Network** pocket-листинг → `active` сразу, в очереди модерации НЕ появляется.

---

## Связанные файлы (superapp)

- Official/Form A детали: `docs/superpowers/briefs/2026-06-25-admin-task-form-a-moderation.md`
- Контракт Form A: `docs/superpowers/briefs/2026-06-25-admin-form-a-moderation-contract.md`
- Миграции: `docs/migrations/applied/2026-06-25-sp-b-form-a.sql`, `…/2026-06-25-spc1-official-invariant.sql`
- Триггер expires_at: `docs/migrations/applied/2026-06-24-lm-expiry-axis.sql`
- Колонка rejection_reason: `docs/migrations/applied/2026-06-24-lm3-rejection-reason.sql`
