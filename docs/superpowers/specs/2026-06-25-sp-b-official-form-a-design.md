# Дизайн: SP-B — Official / Form A фундамент (лёгкий вариант)

> **Дата:** 2026-06-25 · **Статус:** дизайн утверждён к планированию · **Эпик:** A (мастер edit, задеплоен) → **B (этот)** → C (движок сценариев).
> **Контекст:** Official-листинги в Дубае требуют Form A (RERA-разрешение брокеру выставлять объект). Форма Official сейчас собирает поля права собственности (Title Deed/Plot/Municipality) — не то. SP-B заменяет их на поля договора + Form A PDF и закладывает фундамент: схема, приватный Storage, захват и показ.
> **Принцип:** следуем существующим паттернам приложения (прямой `insert` + RLS, как у `property_photos`). Без кастомных RPC, без лайфсайкл-машинерии, без фаз. Минимум кода, решающий задачу.

## 0. Цель

Агент в форме Official вводит данные договора и прикрепляет **Form A (PDF)**. Хранится надёжно (PDF в приватном бакете; пароль в колонке под RLS — читает только владелец/модератор). В карточке-детали показывается **список строк Form A** (`Form A 22.03.2026–22.06.2026 · approved`), строки копятся (история, insert-only), файл в панели не показываем. Official всегда уходит на модерацию. Модерация (approve/reject) — в Админке (их репо), читает строку напрямую под service_role.

## 1. Закрытые решения

| # | Решение |
| --- | --- |
| Без RPC | Form A пишется **прямым `insert`** в `property_form_a` (RLS «владелец своего объекта»), как `property_photos`. `properties.status='pending_review'` ставит сам фронт в payload (форма уже так делает). |
| История | **Insert-only.** Каждый Form A = новая строка; строки НЕ удаляются и НЕ помечаются. Панель перечисляет их. (Лайфсайкл `replaced`/`expired` и продление — SP-C.) |
| Показ в панели | **Строка, не файл:** `Form A {listing_start}–{listing_end} · {статус модерации}`. Статус = производное от `approved_at`/`moderation_note` (NULL approved_at → «на проверке»; approved_at → «approved»; moderation_note без approved → «rejected»). Файл/пароль в панель НЕ отдаём. |
| Пароль | Колонка `pdf_password` под RLS таблицы (владелец читает свою строку, чужой/anon — нет; модератор — service_role). В `get_property` НЕ возвращаем вовсе (панель его не показывает). Модератор читает строку напрямую в Админке. |
| Старые поля | Убрать из формы `add-property` (`title_deed_number/year`, `plot_number`, `municipality_number`). DROP колонок — **отдельная тривиальная уборка** после выката (4 пустые колонки, 0 данных; см. §6). |
| Official → модерация | Official **всегда** `status='pending_review'` (и Friends, и Public). Pocket-правила прежние. |
| Бакет | Новый приватный `property_form_a` (PDF-only). Чтения файла из фронта нет (панель не показывает) → signed URL во фронте не нужен; PDF читает модератор под service_role. |

## 2. Данные

### `property_form_a` (ALTER; в проде пустая, 0 строк)
Текущие колонки переиспользуем: `property_id`, `file_url` (storage-path PDF), `listing_start`=Contract Start, `listing_end`=Contract End, `status` (lifecycle `active/expired/replaced` — в SP-B всегда `'active'`), `uploaded_by`, `approved_by`/`approved_at`/`moderation_note` (модерация, пишет Админка), `uploaded_at`.
**Добавляем:** `contract_number text`, `pdf_password text`.

### `properties`
**Добавляем:** `is_exclusive boolean NOT NULL DEFAULT false`.
**Старые official-колонки** (`title_deed_number/year`, `plot_number`, `municipality_number`) — DROP отдельной уборкой (§6).

### RLS
- `property_form_a` (таблица дормантная — добавить клиентские политики): **insert/select/update/delete для владельца объекта** — `EXISTS (SELECT 1 FROM properties WHERE id=property_id AND owner_id=auth.uid())`. Чужой/anon — нет. (Урок WP-M: на RLS-таблице нужна политика на каждый cmd, иначе молчаливый no-op.)
- Storage `property_form_a` (приватный бакет): владелец — все операции над своими (`{owner_id}/{property_id}/...`), модератор — service_role, чужой/anon — нет.

## 3. `get_property` (один staleness-proof патч)
Добавить в JSON объекта:
- `'is_exclusive', p.is_exclusive`;
- `'form_a'` = **массив строк** (история, insert-only), без файла и пароля:
  ```sql
  'form_a', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'contract_number', fa.contract_number,
      'listing_start',   fa.listing_start,
      'listing_end',     fa.listing_end,
      'approved_at',     fa.approved_at,
      'moderation_note', fa.moderation_note
    ) ORDER BY fa.uploaded_at DESC), '[]'::jsonb)
    FROM public.property_form_a fa WHERE fa.property_id = p.id
  )
  ```
`get_feed` НЕ трогаем (бейдж Exclusive в ленте — позже).

## 4. UI

### `add-property`, шаг Листинг (official)
- **Убрать:** Title Deed №/год, Plot number, Municipality number.
- **Добавить:** Contract Number · Contract Start/End (даты) · Is Exclusive (тоггл) · Form A PDF (загрузка, только PDF) · Password to Form A.
- Сабмит: создать объект (status `pending_review` для official) → загрузить PDF в бакет (`{owner}/{id}/...pdf`) → `insert` строки `property_form_a` (status `'active'`). Перестать слать title_deed.
- Валидация official: Contract Number + Form A PDF обязательны.

### `property-detail` (панель)
- **Список строк Form A** (`form_a` из get_property): `Form A {start}–{end} · {статус}`. Файл/пароль не показываем.
- Бейдж **Exclusive** при `is_exclusive`.
- Кнопка **Add new** и её флоу (новый Form A → «Опубликовать», Cancel) — **SP-C**, не здесь.

### `edit-property`
В SP-B **не трогаем** (Form A заводится при создании; переподача нового Form A — «Add new» в SP-C). is_exclusive-правка — при необходимости позже.

## 5. Граница scope
**SP-B:** схема (ALTER + бакет + RLS), `get_property` (form_a-массив + is_exclusive), захват Form A в `add-property`, показ строк + бейджа в панели. Official → `pending_review`.
**SP-C:** «Add new» (переподача нового Form A) + кнопка «Опубликовать вместо Сохранить» + Cancel, движок сценариев (статусы/expiry/«Form A <30 дней»), approve/reject — Админка.

## 6. Уборка (после выката SP-B, отдельный DDL-гейт)
Когда новый `add-property` live (не пишет/не читает title_deed): убрать ключи `title_deed_number/year/plot_number/municipality_number` из тела `get_property`, затем `DROP COLUMN` эти 4 (пустые, 0 данных → безопасно). Тривиально, не блокирует фичу.

## 7. Безопасность
- `pdf_password` — чувствительный: RLS таблицы; **не в `get_property`**, не в ленту, не чужим; **не логировать** (sync-rule 9).
- RLS под каждую операцию (таблица + бакет). DDL только с «да» + показ финального SQL; роль `supabase_admin`; чужие бакеты (`wa-media`)/таблицы не трогать.
- Без `any`, OnPush, signals; стиль формы — общий партиал `_property-form.scss`.

## 8. Тестирование
- Миграция: ROLLBACK-смоук — ALTER/бакет/политики/патч `get_property` без ошибок; `get_property('<owner>') ? 'form_a'`.
- RLS: владелец insert/select своей строки; чужой агент — нет; anon — нет. Бакет: владелец грузит свой PDF; не-PDF отклоняется.
- UI: official-шаг рендерит новые поля, прячет старые; PDF-валидация; обязательность; панель рендерит строки form_a + бейдж Exclusive; пароль/файл не показываются.
- `checkFile` на каждый тронутый файл (вкл. `.html`/`.spec.ts`); `lint`+`buildFrontend:prodWeb` перед пушем.

## 9. Файлы
- Миграция `docs/migrations/2026-06-25-sp-b-form-a.sql` (ALTER property_form_a/properties; бакет+storage RLS; table RLS; патч get_property).
- Сервис `src/app/mrsqm/services/property-form-a.service.ts` (upload PDF в бакет + insert строки).
- `add-property-page.component.{ts,html,spec.ts}` (поля Official, сабмит, убрать title_deed); `types/database.ts` (PropertyFormA, form_a/is_exclusive в PropertyDetail; убрать title_deed из PropertyInsert, +is_exclusive).
- `property-detail.component.{ts,html,spec.ts}` (строки Form A + бейдж).
- Уборка (§6): `docs/migrations/2026-06-25-sp-b-drop-title-deed.sql` (после выката).
