# Дизайн: SP-B — Official / Form A фундамент

> **Дата:** 2026-06-25 · **Статус:** дизайн утверждён к планированию (brainstorming пройден)
> **Эпик:** A (мастер edit, задеплоен) → **B (этот)** → C (движок сценариев публикации).
> **Контекст:** официальные листинги в Дубае требуют Form A (RERA-разрешение брокеру выставлять объект). Сейчас форма Official собирает поля про *право собственности* (Title Deed/Plot/Municipality), что не то. SP-B заменяет их на поля **договора листинга + Form A PDF** и закладывает фундамент: схема, приватный Storage, захват и хранение, контракт с Админкой-модератором.

## 0. Цель

Дать агенту в форме Official вводить данные договора и прикреплять **Form A (PDF)**, надёжно их хранить (включая чувствительный пароль к PDF), показывать владельцу и **отдавать модератору в Админке** для проверки. Реальная модерация (approve/reject) — в репозитории Админки; superApp даёт SQL-контракт и фронт-сторону. **Движок сценариев публикации (кнопки по статусу, expiry, «Form A < 30 дней») — НЕ здесь, это SP-C.**

## 1. Закрытые решения (brainstorming 2026-06-25)

| # | Решение |
| --- | --- |
| Пароль Form A | **Хранить, доступ строго ограничен.** Колонка `pdf_password` под жёстким RLS: читают ТОЛЬКО владелец объекта (в своём `get_property`) и модератор (service_role / DEFINER-RPC в Админке). Не хэшируем (модератору нужен в читаемом виде, чтобы открыть PDF). Не отдаём в ленту/чужим. Усиление шифрованием — позже, вне SP-B. |
| Старые official-поля | **Заменить И удалить.** `title_deed_number`, `title_deed_year`, `plot_number`, `municipality_number` на `properties` — все **пустые** (0 заполнено из 20, проверено на проде) → убираем из формы и **DROP-аем** колонки. Точный список DROP подтверждается на DDL-гейте с показом SQL. |
| Official → модерация | **Official ВСЕГДА идёт в модерацию** (и Friends, и Public). Сабмит/правка Official → `properties.status='pending_review'` + строка `property_form_a` со `status='pending'`. (Pocket-правила прежние: network без модерации, public → модерация.) |
| Модель данных | **Расширяем существующую `property_form_a`** (она в проде, дормантная, **0 строк** — ALTER безопасен), не плодим новую таблицу. |
| История Form A | **1:много.** Каждый договор/продление = новая строка `property_form_a`. «Текущий» Form A = последняя (по `listing_end`/`uploaded_at`). Задел под SP-C (продление, «Form A < 30 дней»). |

## 2. Модель данных

### 2.1 `property_form_a` (ALTER существующей; 0 строк в проде)

Текущие колонки (оставляем, все нужны): `id`, `property_id` (FK), `file_url` (PDF в бакете), `listing_start date` (= **Contract Start**), `listing_end date` (= **Contract End**), `status text` (модерация Form A, `property_form_a_status_check`), `uploaded_by uuid`, `approved_by text`, `approved_at timestamptz`, `moderation_note text`, `uploaded_at timestamptz`.

**Добавляем:**
- `contract_number text` — номер договора.
- `pdf_password text` — пароль к PDF (RLS-защищён, см. §4).

> На DDL-гейте дополнительно спросить создателя, не дропнуть ли что-то из текущих колонок `property_form_a` — по дизайну все 11 используются (файл, даты, модерация, аудит), рекомендация: оставить все. Решение фиксируется при показе SQL.

### 2.2 `properties`

- **Добавить:** `is_exclusive boolean NOT NULL DEFAULT false` — эксклюзивность листинга (бейдж на карточке/детали; атрибут уровня объекта для показа/фильтра — поэтому на `properties`, не на `property_form_a`).
- **DROP (пустые, убраны из формы):** `title_deed_number`, `title_deed_year`, `plot_number`, `municipality_number`.
  - ⚠️ Эти ключи отдаются в `get_property`/`get_feed` JSON (несколько мест) → перед DROP убрать их из тел функций (staleness-proof патч), иначе RPC упадут на несуществующих колонках. Это часть миграции SP-B.

### 2.3 Кардинальность / «текущий Form A»

`property_form_a` 1:много к `properties`. **Текущий Form A = `ORDER BY uploaded_at DESC LIMIT 1`** (детерминированно, последний загруженный). `get_property` отдаёт текущий. (Логику «approved + не истёкший» для публикации добавит SP-C — здесь только показ последнего.)

## 3. Storage — приватный бакет под Form A PDF

- Новый бакет **`property_form_a`** (нейминг как `property_photos`): `public=false`, `allowed_mime_types='{application/pdf}'`, лимит размера (напр. 10–20 МБ).
- Путь объекта: `{owner_id}/{property_id}/{uuid}.pdf` (owner-scoped по первому сегменту).
- RLS на `storage.objects` (bucket_id='property_form_a'):
  - **insert/select/update/delete для владельца:** `(storage.foldername(name))[1] = auth.uid()::text` (как привязка к своему `owner_id`).
  - **select для модератора:** через service_role (Админка ходит под service_role) — RLS не ограничивает service_role.
  - Чужой агент / anon — нет доступа.
- Клиент валидирует MIME=`application/pdf` и расширение `.pdf` ДО загрузки (бакет — второй барьер).

## 4. RPC / доступ

- **Запись Form A (whitelist-RPC, SECURITY DEFINER, owner-check)** — по аналогии с `edit_property`: принимает `p_property_id`, `p_contract_number`, `p_listing_start`, `p_listing_end`, `p_pdf_password`, `p_file_url`, `p_is_exclusive`. Создаёт строку `property_form_a` (`status='pending'`, `uploaded_by=auth.uid()`), пишет `properties.is_exclusive`, ставит `properties.status='pending_review'` (Official всегда модерация). PDF грузится клиентом в бакет до RPC; в RPC передаётся `file_url`.
- **`get_property`** дополнить: текущий Form A — `file_url`, `contract_number`, `listing_start`, `listing_end`, `status` (модерации Form A) + `properties.is_exclusive`.
  - **`pdf_password` отдаём ТОЛЬКО владельцу** (`WHEN is_owner THEN pdf_password ELSE NULL`). Никогда в ленту/чужим.
- **Контракт для Админки** (их репо `~/Projects/admin`, код не трогаем — только контракт-док):
  - модератор читает строку `property_form_a` (+ `pdf_password`) под service_role / через DEFINER-RPC;
  - пишет `status='approved'|'rejected'`, `approved_by`, `approved_at`, `moderation_note`;
  - approve листинга → `properties.status='active'` (существующий путь активации UPDATE-ом, RT-2 / [[listing-active-via-update-not-only-insert]]); reject → `status='rejected'` + `rejection_reason` (LM-3). Тонкая связка «active только если Form A approved» — Админка + SP-C, не SP-B.

## 5. UI

### 5.1 Форма добавления (`add-property`), шаг Листинг (official)

При `listing_type='official'`:
- **Убрать:** Title Deed №, год Title Deed, Plot number, Municipality number.
- **Добавить:**
  - Contract Number (текст).
  - Contract Start Date / End Date (даты).
  - Is Exclusive (тоггл/чекбокс yes-no).
  - Form A PDF — загрузка файла, **только PDF** (accept=application/pdf + валидация).
  - Password to Form A PDF (текст; чувствительное — не логировать, см. §7).
- Валидация Official: Form A PDF + Contract Number + даты обязательны (Official всегда модерация).
- Подпись: «Official-листинг уходит на проверку модератором».

### 5.2 Окно редактирования (`edit-property`), шаг Листинг (3)

Те же поля при `listing_type='official'` (мастер SP-A уже на месте). Правка Official → пересоздание/обновление текущего Form A + `pending_review` (Официальный всегда модерация). Переключение pocket→official тоже требует Form A.

### 5.3 Деталь-панель (`property-detail`)

- Владельцу: блок «Form A» — ссылка на PDF, Contract Number, срок (start–end), статус модерации Form A. (Пароль владелец видит — поле «пароль к PDF».)
- Всем: бейдж **Exclusive**, если `is_exclusive`.
- Чужим/в ленте: ни PDF-ссылки, ни пароля.

## 6. Граница scope

**SP-B делает:** схема (ALTER property_form_a, ALTER+DROP properties, патчи get_property/get_feed), приватный бакет+RLS, RPC записи Form A, захват полей в add/edit, показ в детали, контракт с Админкой. Official-сабмит создаёт `pending_review` + Form A `pending`.

**SP-B НЕ делает (→ SP-C):** движок сценариев — кнопки по статусу/типу/сроку, expiry, спец-флоу «Form A < 30 дней» (сценарий 2.1), матрица publish/renew/republish. Решение approve/reject — Админка (кросс-репо).

## 7. Безопасность / правила

- **Пароль Form A — чувствительный:** RLS под §4, отдаётся только владельцу+модератору; **никогда не логировать** (sync-rule 9: не логировать пользовательский контент). В `Log.log` не попадает.
- **RLS обязателен** под каждую операцию бакета и таблицы (урок WP-M: на RLS-таблице нужна политика на каждый cmd, иначе молчаливый no-op). Пре-флайт покрытия по `/migrate`.
- **Общая БД** — `property_form_a`/`properties` наши; `bayut_*`/parser-бакеты (`wa-media`) не трогать.
- **DDL только с «да»** создателя и показом финального SQL; зеро-даунтайм: аддитивное (ADD columns, bucket, RPC) — Фаза A; DROP старых колонок — после патча тел функций в той же транзакции/миграции (они уже не читаются формой). DROP безопасен по данным (всё пусто, проверено).

## 8. Тестирование

- **Миграция:** ROLLBACK-смоук — ALTER применяется, бакет создаётся, политики на месте; патч get_property/get_feed не ломает JSON; DROP колонок проходит после патча тел.
- **RLS:** владелец читает свой `pdf_password` (get_property), **чужой агент — NULL**, anon — нет; бакет: владелец грузит/читает свой PDF, чужой/anon — нет; не-PDF mime отклоняется.
- **RPC записи:** создаёт строку Form A pending + `properties.pending_review` + `is_exclusive`; owner-check (чужой не может).
- **UI:** Official-шаг рендерит новые поля, прячет старые; PDF-валидация (не-PDF отклоняется); обязательность Official-полей; деталь показывает Form A владельцу и бейдж Exclusive; пароль не виден чужому.
- `npm run checkFile` на каждый тронутый файл (вкл. `.html`/`.spec.ts`); `lint` + `buildFrontend:prodWeb` перед пушем.

## 9. Файлы (ориентир; точная разбивка — в плане)

- **Миграция(и)** `docs/migrations/2026-06-25-sp-b-*.sql`: ALTER `property_form_a` (+contract_number, +pdf_password); ALTER `properties` (+is_exclusive); патч тел `get_property`/`get_feed` (убрать title_deed/plot/municipality, добавить Form A + is_exclusive + owner-only password); DROP 4 колонок; `storage.buckets` insert + `storage.objects` policies; RPC `upsert_property_form_a` (или имя по плану).
- **Сервис(ы)** `src/app/mrsqm/services/`: загрузка Form A PDF в бакет + вызов RPC; чтение Form A (через get_property).
- **Компоненты:** `add-property` (шаг Листинг — поля Official), `edit-property` (шаг Листинг), `property-detail` (блок Form A + бейдж Exclusive). Типы — `types/database.ts`.
- **Контракт-док Админке** `docs/superpowers/briefs/2026-06-25-form-a-moderation-contract.md` (как модератор читает/пишет Form A; кросс-репо).

## 10. Открытые к подтверждению (на DDL-гейте)

- Точный список DROP-колонок (4 на `properties`; нужно ли что-то из `property_form_a` — рекомендация оставить всё).
- Имя бакета (`property_form_a`) и лимит размера PDF.
- Имя RPC записи Form A.
