# Фильтры ленты v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Расширить фильтры ленты под новые поля объекта (cheques, is_study, флаги цены, этажность-uuid), терминировать is_distress/is_negotiable, собрать динамическую по типу фильтр-панель.

**Architecture:** Два трека. Трек 1 — миграция `get_feed` (полный DROP+CREATE, смена сигнатуры). Трек 1b — терминирование is_distress/is_negotiable в коде (без БД). Трек 2 — фронт-панель поверх обновлённого RPC, модель «динамический фильтр по типу» через переиспользование `typeFieldsFor()`.

**Tech Stack:** Angular standalone + signals, Supabase RPC (PostgREST, named args), Jasmine/Karma, self-hosted Postgres.

## Global Constraints

- Весь код — в `src/app/mrsqm/`; комментарии и UI-строки на русском.
- Strict TS: без `any` (использовать `unknown`). NgRx state не мутировать.
- `npm run checkFile <path>` по каждому изменённому `.ts`/`.scss` перед сдачей.
- Дизайн = Super Productivity: переиспользовать темы/токены, без локальных оверрайдов Material (`.mat-*`/`.mdc-*`).
- `p_user_id` в RPC из клиента не передавать — RLS берёт `auth.uid()` из JWT.
- ⛔ Изменения БД (миграции) — только с явного согласия создателя. Применять под ролью `supabase_admin`.
- Коммиты: `type(scope): описание`; `test:` для изменений тестов (никогда `fix(test)`).

---

## ⚠️ КРИТИЧЕСКАЯ ТОЧКА ОСТАНОВКИ

**Task 1 (миграция `get_feed`) — это полный `DROP FUNCTION` + `CREATE`** (смена сигнатуры:
убираем `p_is_distress`, меняем `p_floor_level_id`→`p_floor_level_ids uuid[]`,
`p_floors_in_unit text[]`→`p_floors_in_unit_ids uuid[]`, добавляем 5 параметров).
Это не body-патч `get_property`-стиля. **Не применять без явного «применяй» от создателя.**
SQL пишем в `docs/migrations/`, ревьюим вместе, применяем под надзором.

Безопасно делать без БД: **Track 1b** (термин-код) и **Track 2** (фронт, unit-тесты мокают RPC).
Деплой/пуш фронта — только ПОСЛЕ применения миграции (иначе RPC получит неизвестные параметры).

---

## File Structure

| Файл | Ответственность |
|---|---|
| `docs/migrations/2026-06-21-get-feed-filters-v2.sql` | DROP+CREATE `get_feed` (новая сигнатура + тело) |
| `src/app/mrsqm/services/feed-filter.service.ts` | `FeedFilters` v2: новые поля, `EMPTY_FILTERS`, `activeFilterCount`, сеттеры |
| `src/app/mrsqm/pages/feed/feed-page.component.ts` | `buildParams`: маппинг v2 → новые параметры `get_feed` |
| `src/app/mrsqm/components/feed-filter-panel/feed-filter-panel.component.ts` | Динамические секции по типу; union-режим |
| `…/feed-filter-panel.component.html` | Разметка новых секций |
| `src/app/mrsqm/types/database.ts` | `FeedFilters`-зависимые типы; удалить `is_distress`/`is_negotiable` |
| `src/app/mrsqm/components/property-detail/*` | Удалить показ «Срочная продажа»/«Торг» |
| `src/app/mrsqm/pages/add-property/add-property-page.component.ts` | Убрать `is_distress`/`is_negotiable` из payload |

---

## Track 1 — миграция get_feed

### Task 1: Написать миграцию `get_feed` (DROP+CREATE) — НЕ ПРИМЕНЯТЬ без согласия

**Files:**
- Create: `docs/migrations/2026-06-21-get-feed-filters-v2.sql`

**Дельта сигнатуры** (база — текущая сигнатура из `docs/database.md`, строка 71):
- УБРАТЬ: `p_is_distress boolean`.
- ЗАМЕНИТЬ: `p_floor_level_id uuid` → `p_floor_level_ids uuid[] DEFAULT NULL`.
- ЗАМЕНИТЬ: `p_floors_in_unit text[]` → `p_floors_in_unit_ids uuid[] DEFAULT NULL`.
- ДОБАВИТЬ (в конец, с DEFAULT NULL): `p_cheques int[]`, `p_is_study boolean`,
  `p_is_reduced boolean`, `p_is_below_op boolean`, `p_is_vastu boolean`.

**Дельта тела** (две одинаковые правки — в COUNT, строки ~210-227, и в SELECT, ~377-394):
- `p_floor_level_id = p.floor_level_id` → `(p_floor_level_ids IS NULL OR p.floor_level_id = ANY(p_floor_level_ids))`.
- `p_floors_in_unit = ANY(...)` по `p.floors_in_unit` → `(p_floors_in_unit_ids IS NULL OR p.floors_in_unit_id = ANY(p_floors_in_unit_ids))`.
- Удалить строку `AND (p_is_distress IS NULL OR p.is_distress = p_is_distress)`.
- Добавить блок:
  ```sql
  AND (p_cheques      IS NULL OR p.cheques      = ANY(p_cheques))
  AND (p_is_study     IS NULL OR p.is_study     = p_is_study)
  AND (p_is_reduced   IS NULL OR p.is_reduced   = p_is_reduced)
  AND (p_is_below_op  IS NULL OR p.is_below_op  = p_is_below_op)
  AND (p_is_vastu     IS NULL OR p.is_vastu     = p_is_vastu)
  ```
- В jsonb-выводе (ШАГ 8): убрать `'is_distress', p.is_distress` и `'is_negotiable', p.is_negotiable`;
  `'floors_in_unit', p.floors_in_unit` → `'floors_in_unit_id', p.floors_in_unit_id`.

**Структура файла** (НЕ DO-патч — полный rewrite):
```sql
-- DROP старой сигнатуры (точная сигнатура из database.md:71)
DROP FUNCTION IF EXISTS public.get_feed(text, uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], text, integer[], integer[], boolean, boolean, text, uuid, text[], numeric, numeric, numeric, numeric, numeric, numeric, text, text, text[], text[], text[], text, boolean, text, text, integer[], text[], text, numeric, numeric, uuid[], text, integer, integer);
-- CREATE с новой сигнатурой + полное тело (скопировать тело из database.md, применить дельту выше)
CREATE OR REPLACE FUNCTION public.get_feed(...новая сигнатура...) ...
```

- [ ] **Step 1:** Скопировать полное тело `get_feed` из `docs/database.md` (строки 71-439) в файл.
- [ ] **Step 2:** Применить дельту сигнатуры и тела (см. выше). Дописать `DROP FUNCTION IF EXISTS` с точной старой сигнатурой перед `CREATE`.
- [ ] **Step 3:** Добавить блок верификации (комментарием): тест-вызов с `p_floors_in_unit_ids`, `p_cheques`, `p_is_study`; проверить, что `p_is_distress` больше не принимается.
- [ ] **Step 4: ⛔ STOP.** Не применять. Дождаться «применяй» от создателя → применить через `/migrate` под `supabase_admin` → прод-тест `T-N` → обновить `docs/database.md`.

**Замечание (карта связей):** `get_location_path` и `count_nearby_listings` делят те же
параметры (`p_floor_level_id`, `p_floors_in_unit text[]`, `p_is_distress`). Их фронт сейчас
не использует напрямую для этих полей, но контракт рассинхронится. Решение зафиксировать с
создателем при ревью миграции: привести их к новому контракту той же миграцией ИЛИ оставить
как есть (они продолжат работать со старой сигнатурой независимо). По умолчанию — оставить,
не раздувать риск; вынести в отдельную задачу.

---

## Track 1b — терминирование is_distress / is_negotiable (без БД)

### Task 2: Убрать is_distress и is_negotiable из кода

**Files:**
- Modify: `src/app/mrsqm/types/database.ts` (поля в `PropertyInsert`, `PropertyDetail`, `PropertyFeedItem`)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.{ts,html}`
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.spec.ts`
- Modify: `src/app/mrsqm/components/property-card/property-card.component.spec.ts`
- Modify: `src/app/mrsqm/pages/add-property/add-property-page.component.ts` (payload)
- Modify: `src/app/mrsqm/services/property-create.service.spec.ts`

- [ ] **Step 1:** `grep -rn "is_distress\|is_negotiable\|isDistress\|isNegotiable\|Срочная продажа\|Торг" src/app/mrsqm` — собрать полный список точек.
- [ ] **Step 2:** Удалить поля `is_distress`, `is_negotiable` из интерфейсов в `types/database.ts`.
- [ ] **Step 3:** Удалить из `property-detail` разметку «Срочная продажа»/«Торг» и связанные геттеры/поля в `.ts`. Убрать осиротевшие переменные/импорты.
- [ ] **Step 4:** В `add-property-page.component.ts` убрать `is_distress`/`is_negotiable` из payload-объекта.
- [ ] **Step 5:** Обновить специи (убрать ассерты на эти поля; payload-тесты не должны их ждать).
- [ ] **Step 6:** `npm run checkFile` по каждому `.ts`/`.html`-связанному; `npm test` — зелёный.
- [ ] **Step 7: Commit** `refactor(property): терминировать is_distress и is_negotiable из кода (колонки БД оставлены)`.

**Колонки БД `is_distress`/`is_negotiable` НЕ трогаем** (DROP — отдельной миграцией позже).

---

## Track 2 — фронт-панель

### Task 3: FeedFilters v2 (модель в feed-filter.service.ts)

**Files:**
- Modify: `src/app/mrsqm/services/feed-filter.service.ts`
- Test: `src/app/mrsqm/services/feed-filter.service.spec.ts` (создать, если нет)

**Produces:** интерфейс `FeedFilters` v2, `EMPTY_FILTERS`, `activeFilterCount` (computed),
сеттеры мультиселектов.

- [ ] **Step 1: Расширить `FeedFilters`** (добавить к существующим полям):

```typescript
export interface FeedFilters {
  unitTypeId: string | null;
  subTypeIds: string[];
  bedrooms: number[];
  bathrooms: number[];
  priceMin: number | null;
  priceMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  plotMin: number | null;          // p_plot_sqft_min
  plotMax: number | null;          // p_plot_sqft_max
  furnished: string | null;
  listingType: ListingType | 'all';
  developerIds: string[];          // p_developer_ids
  viewIds: string[];               // p_view_ids
  positionIds: string[];           // p_position_ids
  amenityIds: string[];            // p_amenity_ids
  floorLevelIds: string[];         // p_floor_level_ids
  floorsInUnitIds: string[];       // p_floors_in_unit_ids
  isMaid: boolean | null;          // p_is_maid
  isHotelPool: boolean | null;     // p_is_hotel_pool
  isVastu: boolean | null;         // p_is_vastu
  isStudy: boolean | null;         // p_is_study
  isReduced: boolean | null;       // p_is_reduced
  isBelowOp: boolean | null;       // p_is_below_op
  pricePeriod: string | null;      // p_price_period (аренда)
  occupancyStatus: string | null;  // p_occupancy_status
  completionYears: number[];       // p_completion_year (off-plan)
  completionQ: string[];           // p_completion_q (off-plan)
  cheques: number[];               // p_cheques (аренда)
}
```

- [ ] **Step 2: `EMPTY_FILTERS`** — все массивы `[]`, числа/строки/boolean `null`.
- [ ] **Step 3: `activeFilterCount`** — по +1 за каждую активную группу (непустой массив / не-null / `listingType !== 'all'`).
- [ ] **Step 4:** Тест: `EMPTY_FILTERS` → `activeFilterCount() === 0`; патч `viewIds:['x']` → `=== 1`.
- [ ] **Step 5:** `npm run test:file src/app/mrsqm/services/feed-filter.service.spec.ts` — PASS.
- [ ] **Step 6:** `npm run checkFile src/app/mrsqm/services/feed-filter.service.ts`.
- [ ] **Step 7: Commit** `feat(feed): FeedFilters v2 — застройщик, виды/позиции/удобства, этаж, off-plan, чеки`.

### Task 4: buildParams — маппинг v2 → get_feed

**Files:**
- Modify: `src/app/mrsqm/pages/feed/feed-page.component.ts` (метод `_buildParams`, ~строка 504)
- Test: `src/app/mrsqm/pages/feed/feed-page.component.spec.ts`

**Consumes:** `FeedFilters` v2 (Task 3).

- [ ] **Step 1:** Дополнить объект параметров в `_buildParams` (массивы → `len ? arr : null`):

```typescript
p_developer_ids:      f.developerIds.length ? f.developerIds : null,
p_view_ids:           f.viewIds.length ? f.viewIds : null,
p_position_ids:       f.positionIds.length ? f.positionIds : null,
p_amenity_ids:        f.amenityIds.length ? f.amenityIds : null,
p_floor_level_ids:    f.floorLevelIds.length ? f.floorLevelIds : null,
p_floors_in_unit_ids: f.floorsInUnitIds.length ? f.floorsInUnitIds : null,
p_is_maid:            f.isMaid,
p_is_hotel_pool:      f.isHotelPool,
p_is_vastu:           f.isVastu,
p_is_study:           f.isStudy,
p_is_reduced:         f.isReduced,
p_is_below_op:        f.isBelowOp,
p_plot_sqft_min:      f.plotMin,
p_plot_sqft_max:      f.plotMax,
p_occupancy_status:   f.occupancyStatus,
// контекст: только аренда
p_price_period:       this.filter.dealType() === 'rent' ? f.pricePeriod : null,
p_cheques:            this.filter.dealType() === 'rent' && f.cheques.length ? f.cheques : null,
// контекст: только off-plan
p_completion_year:    this.filter.handover() === 'offplan' && f.completionYears.length ? f.completionYears : null,
p_completion_q:       this.filter.handover() === 'offplan' && f.completionQ.length ? f.completionQ : null,
```

- [ ] **Step 2:** Убедиться, что `p_is_distress` нигде не передаётся (его в Task 1 удалили из RPC).
- [ ] **Step 3:** Тест: `dealType='sale'` + `cheques=[2]` → `p_cheques === null`; `dealType='rent'` + `cheques=[2]` → `p_cheques === [2]`. Аналогично off-plan/completion.
- [ ] **Step 4:** Тест: `floorLevelIds=['a']` → `p_floor_level_ids===['a']`; `floorsInUnitIds=['b']` → `p_floors_in_unit_ids===['b']`.
- [ ] **Step 5:** `npm run test:file …/feed-page.component.spec.ts` — PASS.
- [ ] **Step 6: Commit** `feat(feed): buildParams — новые фильтры + контекст rent/off-plan`.

### Task 5: Панель — динамические секции по типу

**Files:**
- Modify: `…/feed-filter-panel.component.ts`
- Modify: `…/feed-filter-panel.component.html`
- Modify: `…/feed-filter-panel.component.scss`
- Test: `…/feed-filter-panel.component.spec.ts` (создать)

**Consumes:** `typeFieldsFor()` из `add-property/property-type-fields.ts`; `FilterOptions` (get_filter_options); `FeedFilters` v2.

**Логика «этаж» (computed):**
- Если выбран `unitTypeId` → найти его `value` в `options.unit_types`, взять `typeFieldsFor(value)`.
  - `floorLevel===true` → показать `options.floor_levels`, чипы пишут в `floorLevelIds`.
  - `floorsInUnit===true` → показать `options.floors_in_unit_house`, чипы пишут в `floorsInUnitIds`.
- Если тип НЕ выбран (весь Residential) → union: `floor_levels ∪ floors_in_unit_apt ∪ floors_in_unit_house`;
  каждый чип помнит свою группу → клик кладёт в `floorLevelIds` (группа floor_level) или `floorsInUnitIds` (группы floors_in_unit_*).

- [ ] **Step 1:** computed `floorChips()` → `{ id, label, group: 'level' | 'units' }[]` по правилу выше.
- [ ] **Step 2:** `toggleFloorChip(chip)` → пишет в нужный массив черновика по `chip.group`.
- [ ] **Step 3:** Секции views/positions/amenities/maid/hotelPool/vastu рендерить по `typeFieldsFor()` (или показывать все при отсутствии типа).
- [ ] **Step 4:** Контекст-секции: cheques+pricePeriod видны при `dealType==='rent'`; completion при `handover==='offplan'`.
- [ ] **Step 5:** Тест: тип не выбран → `floorChips()` содержит и level-, и units-чипы; выбран apartment → только level; villa/house → только units.
- [ ] **Step 6:** Тест: `toggleFloorChip` с group='units' пишет в `floorsInUnitIds`, не в `floorLevelIds`.
- [ ] **Step 7:** `npm run checkFile` по `.ts`/`.scss`; `npm run test:file …` — PASS.
- [ ] **Step 8: Commit** `feat(feed): панель v2 — динамический по типу фильтр этажа + новые секции`.

### Task 6: Застройщик — автокомплит в панели

**Files:**
- Modify: `…/feed-filter-panel.component.{ts,html}`
- Modify: `src/app/mrsqm/services/property-create.service.ts` (если нет — добавить `searchDevelopers(query)` поверх RPC `search_developers`)

- [ ] **Step 1:** Метод `searchDevelopers(q)` → RPC `search_developers` (паттерн как `getFilterOptions`).
- [ ] **Step 2:** В панели — input с автокомплитом; выбранные пишутся в `draft.developerIds` (чипами, как локации).
- [ ] **Step 3:** Тест: выбор застройщика добавляет id в `developerIds`; повторный — снимает.
- [ ] **Step 4:** `npm run checkFile`; `npm run test:file …` — PASS.
- [ ] **Step 5: Commit** `feat(feed): фильтр по застройщику (search_developers автокомплит)`.

---

## Финализация (после применения миграции)

- [ ] Прод-тест `T-N` в `docs/tests.md`: этажность по uuid, cheques, is_study фильтруют; распределение пустого результата = empty-state.
- [ ] Обновить `docs/database.md` (новая сигнатура `get_feed`).
- [ ] Обновить `docs/TODO.md`: F-16f → ✅; API-2 district-автокомплит — отметить статус.
- [ ] Деплой через `/deploy` (после согласия) → TG-summary.

## Self-Review (выполнено)

- **Spec coverage:** все решения 1-6 спеки покрыты (1→Task1/3/4/5; 2→Task1; 3→Task2; 4→Task3/4/5; 5→Task5; 6→Task5). ✅
- **Placeholder scan:** нет TBD/«handle edge cases»; код в шагах полный. ✅
- **Type consistency:** имена полей `FeedFilters` (Task 3) совпадают с маппингом (Task 4) и панелью (Task 5): `floorLevelIds`/`floorsInUnitIds`/`cheques`/`completionYears`. ✅
- **Gap:** layout_id-фильтр — намеренно вне объёма (спека, «Отложено»). ✅
