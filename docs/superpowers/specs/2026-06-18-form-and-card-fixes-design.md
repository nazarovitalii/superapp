# Form + Card fixes — design (2026-06-18)

**Контекст.** Пользователь дал правки по форме добавления и карточке объекта ещё раньше, я их
**не зафиксировал и не выполнил** (процессный косяк — нашли при `прочитай /remember`: в истории
`.remember/` этих просьб нет). Этот документ — единый источник правды по правкам, чтобы не гадать
в третий раз. Слой 3 (метрика «контакт просмотрен») и комментарии **на паузе**, пока форма и
карточка не закрыты.

Все 5 правок — **клиентские, без миграций БД**. `location_developers.project_status` уже есть в
БД, нужно лишь добавить его в `BuildingInfo` (тип + select).

---

## Решения (приняты, можно вето)

- **Иконка** блока «Характеристики»: `tune` → `info` (вместо иконки фильтров).
- **Раскладка kv-list — Вариант A** (подтверждено: «1 — вариант а»): построчно, левостороннее,
  `Label: Value`, без правой колонки. Применяется к общему стилю `.kv-list` → затрагивает и блок
  **Проект** (3a) — для единообразия.
- **Новый порядок шагов формы** (8 шагов, было 8):
  `Категория(+Сделка)` · `Адрес` · `Параметры(без планировки)` · `Цена` · `Состояние` ·
  `Листинг` · `Фото и планировка` · `Описание`.
- **Ready/Off-Plan**: если `project_status='completed'` у выбранной локации — Off-Plan заблокирован
  (Ready принудительно). Если `project_status` пуст (нет строки `location_developers`) —
  **ограничений нет** (свободный выбор).
- **Планировка** в новом шаге — пока существующий селектор-чипсы из `community_layouts`
  (автокомплит/fuzzy — это Слой 4, отдельная миграция).

---

## 1. Карточка — блок «Характеристики» (property-detail)

**Файлы:** `property-detail.component.html`, `property-detail.component.scss`.

- Заменить `<mat-icon>tune</mat-icon>` → `info` в `.section-label` блока «Характеристики».
- `.kv-row`: `justify-content: space-between` → левостороннее (`flex-start`, маленький `gap`);
  `.kv-value` убрать `text-align: right`.
- Двоеточие после метки: `.kv-label::after { content: ':'; }` (разметку не трогаем).
- Результат (Вариант A):
  ```
  Deal: Sale
  Type: Residential Apartment - Flat (hotel apartment)
  Bedrooms: 1 + maid
  Bathrooms: 2
  BUA: 1,200 sqft
  ```
- Bedrooms-строка уже инлайнит `+ maid`/`+ vastu` — не трогаем.

## 2. Форма, шаг «Параметры» — maid / hotel apartment / vastu

**Файлы:** `add-property-page.component.html`, `.scss`.

- Три строки (как сейчас, условно по типу через `fields().maid/hotelPool/vastu`), но **галочка
  рядом с меткой**, не на правом краю. Сейчас `.toggle-row { justify-content: space-between }`.
- Сделать отдельный компактный класс для этой тройки: чекбокс непосредственно у метки,
  левостороннее, три строки подряд.
- Гейтинг типов не меняем: vastu — только residential `apartment`/`house` (см.
  `property-type-fields.ts`).

## 3. Форма — валидация Ready / Off-Plan по project_status

**Файлы:** `types/database.ts` (BuildingInfo +`project_status`), `property-create.service.ts`
(добавить поле в `.select`), `add-property-page.component.ts/.html` (шаг «Состояние»).

- `BuildingInfo` += `project_status: string | null`; `getBuildingInfo().select(... , project_status)`.
- На шаге «Состояние»: если `buildingInfo()?.project_status === 'completed'` — чип **Off-Plan**
  задизейблить (или скрыть) и форснуть `handover='ready'`. `null`/прочее — без ограничений.
- Источник статуса — `location_developers` по выбранной leaf-локации (уже грузится в `buildingInfo`).

## 4. Форма — структура шагов

**Файлы:** `add-property-page.component.ts` (`STEPS`, `STEP_ICONS`, `_validateStep` индексы),
`.html` (`@if (step() === N)` перенумеровать).

- **Слить «Сделка» в «Категория»** (бывший шаг 2 → внутрь шага 1; deal type + price period
  добавить в блок step 0).
- **Вынести «Планировка»** из шага «Параметры» и **«Фото»** из шага «Описание» в **новый шаг
  «Фото и планировка»**.
- `STEPS` = `['Категория','Адрес','Параметры','Цена','Состояние','Листинг','Фото и планировка','Описание']`.
- `STEP_ICONS` = `['category','place','tune','payments','event_available','verified','photo_library','description']`.
- Перенумеровать все `@if (step() === N)` и `case N` в `_validateStep()` (адрес, bua/plot, цена,
  title-deed). **Зона риска — сдвиг индексов; покрыть юнит-тестами.**

---

## Критерии успеха

- Карточка: «Характеристики» с иконкой `info`, все строки `Label: Value` левосторонне; Проект так же.
- Форма: 8 шагов в новом порядке; Сделка внутри Категории; новый шаг «Фото и планировка».
- maid/hotel/vastu — три строки, галочка рядом.
- Off-Plan недоступен, если у локации `project_status='completed'`.
- `npm run checkFile` зелёный на всех изменённых `.ts/.scss`; юнит-тесты на навигацию/валидацию
  шагов зелёные; полный сюит зелёный перед пушем.

## Реализация

Через **Subagent-Driven Development** (имплементер + ревьюер на задачу). Порядок:
A (карточка) → B (три чекбокса) → C1 (Ready/Off-Plan) → C2 (структура шагов, последней — самая
рискованная). БД-миграции не нужны.
