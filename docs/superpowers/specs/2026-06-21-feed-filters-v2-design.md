# Дизайн: Фильтры ленты v2

Дата: 2026-06-21 · Статус: согласовано создателем · TODO: F-16f (расширение), API-2

## Проблема

UI-панель фильтров ([feed-filter-panel](../../../src/app/mrsqm/components/feed-filter-panel/))
выводит лишь часть того, что умеет `get_feed`. Но и сам `get_feed` **отстал от схемы**:
после раунда «новые поля» (2026-06-21) у объекта появились поля, по которым фильтровать
нечем, а одно фильтруется по мёртвой колонке.

**Дифф «что у объекта есть» (форма / `properties`) vs «по чему `get_feed` фильтрует»:**

| Поле объекта | Фильтр в get_feed? |
|---|---|
| тип/подтип/беды/санузлы/цена/площадь/участок/мебель/готовность/листинг/виды/расположение/удобства/застройщик/заселённость/maid/hotel pool/off-plan год-квартал | ✅ есть (часть не выведена в UI) |
| `is_study` (кабинет) — новое поле | ❌ нет фильтра |
| `cheques` (число чеков, аренда) — новое поле | ❌ нет фильтра |
| `is_reduced` / `is_below_op` (флаги цены, бейджи на карточках) | ❌ нет фильтра |
| `floors_in_unit_id` (uuid) | ⚠️ **баг устаревания:** get_feed фильтрует `p_floors_in_unit` как `text[]` по мёртвой legacy-колонке `p.floors_in_unit` (тело, строки 139/306), а живая колонка — uuid `floors_in_unit_id` |
| `is_vastu` | ❌ нет фильтра |
| `is_distress`, `is_negotiable` | по решению создателя — **терминировать**, не добавлять |

## Решения создателя (источник истины этой спеки)

1. Объём — **всё, что умеет get_feed**, плюс дотянуть сам `get_feed` под новые поля.
2. `get_feed` дополняем миграцией: `cheques`, `is_study`, `is_reduced`, `is_below_op`,
   `is_vastu`; этажность переводим на uuid (фикс бага).
3. **Терминировать `is_negotiable` и `is_distress`** из всей системы. Глубина:
   **код + RPC сейчас**, `DROP COLUMN` — отдельной миграцией позже (необратимо → после
   проверки, что ничто не отвалилось). Колонки на этом этапе остаются.
4. Вывести в UI недостающие фильтры, включая `is_maid` (есть в RPC, нет в панели).
5. Этажность домов (`floors_in_unit_house`, G+1…) фильтровать тоже, не только апартаменты.
6. **Динамический фильтр по типу** (рекомендованная модель): нет конкретного типа (весь
   Residential) → один объединённый фильтр (union опций apt+house); выбран тип → только
   релевантные ему опции. Клик по чипу сам кладёт значение в нужный параметр.

## Архитектура: два трека

**Трек 1 — миграция `get_feed`** (через `/migrate`, staleness-proof DO-патч, под `supabase_admin`).
**Трек 1b — терминирование `is_distress`/`is_negotiable` в коде** (без БД).
**Трек 2 — фронт-панель** поверх обновлённого RPC.

Зависимость: Трек 2 стартует после Трека 1 (фронт читает новые параметры RPC).

---

## Трек 1 — изменения `get_feed`

Одна миграция, патч живого тела через `pg_get_functiondef` + `regexp_replace` (как
`2026-06-21-get-property-leaf-in-path.sql`): guard на не-совпадение якоря (`RAISE NOTICE`)
и идемпотентность. Обратимо (вернуть прежнее тело).

**Добавить параметры:**

| Параметр | Тип | Семантика |
|---|---|---|
| `p_cheques` | `int[]` | число чеков (аренда); `p.cheques = ANY(p_cheques)` |
| `p_is_study` | `boolean` | кабинет |
| `p_is_reduced` | `boolean` | цена снижена (sticky-флаг) |
| `p_is_below_op` | `boolean` | ниже original price |
| `p_is_vastu` | `boolean` | Vastu |
| `p_floors_in_unit_ids` | `uuid[]` | **фикс:** `p.floors_in_unit_id = ANY(...)` |
| `p_floor_level_ids` | `uuid[]` | **замена** single `p_floor_level_id` → массив (мультиселект) |

Все boolean-фильтры — паттерн `(p_x IS NULL OR p.x = p_x)`. Применяются и в основной
выборке, и в `count_total` (в `get_feed` оба места — строки ~139/206 и ~306/380).

**Убрать:**
- параметр `p_is_distress` и его условие в WHERE/count;
- из jsonb-вывода — поля `is_distress`, `is_negotiable`, легаси `floors_in_unit` (text);
- добавить в jsonb-вывод `floors_in_unit_id` (uuid), если ещё не отдаётся.

**Не трогаем:** колонки `is_distress`/`is_negotiable` в `properties` (DROP — позже).

**Сопутствующие RPC:** проверить `get_location_path` и `count_nearby_listings` — у них тот
же набор параметров (`p_floors_in_unit text[]`, `p_floor_level_id`, `p_is_distress`).
Решение: привести к новому контракту в той же миграции (иначе их фильтры рассинхронятся).
Если объём велик — выделить под них отдельный шаг плана, но контракт держать единым.

**Справочники:** `get_filter_options` уже отдаёт `floor_levels`, `floors_in_unit_apt`,
`floors_in_unit_house`, `views`, `positions`, `amenities`. Для `cheques` справочника нет —
значения статичны `[1,2,3,4,6,12]` (как в форме, `add-property-page.component.ts`),
держать на клиенте (не плодить БД-вызов). `is_study`/`is_reduced`/`is_below_op`/`is_vastu` —
boolean-чекбоксы, справочник не нужен.

---

## Трек 1b — терминирование в коде

Убрать `is_distress` и `is_negotiable` из:

| Файл | Что |
|---|---|
| `types/database.ts` | поля в `PropertyInsert`, `PropertyDetail`, `PropertyFeedItem` и т.п. |
| `components/property-detail/*` | показ «Срочная продажа» / «Торг» |
| `components/property-card/*` | если отображаются |
| `pages/add-property/*` | из payload (`is_distress`, `is_negotiable`) + UI, если осталось |
| `services/feed-filter.service.ts` | если есть упоминания |

Колонки БД и любые `bayut_*`/admin-таблицы не трогаем. После — `npm test` зелёный,
`npm run checkFile` по каждому изменённому `.ts`.

---

## Трек 2 — фронт-панель

### Модель фильтра — динамическая по типу

Переиспользуем матрицу `typeFieldsFor(unitTypeValue)`
([property-type-fields.ts](../../../src/app/mrsqm/pages/add-property/property-type-fields.ts)):
она уже знает, какие поля релевантны каждому `unit_type` (`floorLevel`, `floorsInUnit`,
`plot`, `views`, `positions`, `amenities`, `maid`, `hotelPool`, `vastu`, `furnished`).

- **Выбран `apartment`** → этаж = `floor_level` (Low/Mid/High); views/positions/amenities/maid/
  hotelPool/vastu/furnished по матрице.
- **Выбран `house`** → этаж = `floors_in_unit` (G+0…G+3) + участок (plot); по матрице.
- **Тип не выбран (весь Residential)** → объединённый фильтр «Этаж» =
  union(`floor_levels` + `floors_in_unit_apt` + `floors_in_unit_house`); позиции — union.
  Каждый чип несёт свою группу; клик кладёт значение в `floorLevelIds` или `floorsInUnitIds`
  по группе чипа.

### Контекст по сделке/готовности

- `cheques` + период аренды (`pricePeriod`) → только `deal_type = rent`.
- год/квартал сдачи (`completionYears`/`completionQ`) → только `handover = offplan`.

### `FeedFilters` v2

К текущим (`unitTypeId`, `subTypeIds`, `bedrooms`, `bathrooms`, `priceMin/Max`,
`areaMin/Max`, `furnished`, `listingType`) добавить:

```
developerIds: string[]
viewIds: string[]
positionIds: string[]
amenityIds: string[]
floorLevelIds: string[]        // p_floor_level_ids
floorsInUnitIds: string[]      // p_floors_in_unit_ids
isMaid: boolean | null
isHotelPool: boolean | null
isVastu: boolean | null
plotMin: number | null
plotMax: number | null
pricePeriod: string | null     // rent: yearly | monthly
occupancyStatus: string | null
completionYears: number[]
completionQ: string[]
isStudy: boolean | null
cheques: number[]              // rent
isReduced: boolean | null
isBelowOp: boolean | null
```

`activeFilterCount` и `EMPTY_FILTERS` обновить под новые поля. Застройщик — автокомплит
через `search_developers` (паттерн как у адреса в тулбаре → `locationFilters`).

### `buildParams` (feed-page)

Маппинг `FeedFilters` v2 → новые/изменённые параметры `get_feed`. Объединённый чип этажа
маппится по группе. `is_distress` больше не передаётся.

### Раскладка панели

Один вертикальный скролл с разделителями-секциями (как сейчас), секции рендерятся условно
(динамика по типу + контекст rent/offplan сами укорачивают панель). Аккордеон — резерв,
если union-режим окажется слишком длинным. Стиль — существующий Super Productivity, без
новых визуальных языков и без локальных оверрайдов Material.

---

## Тесты и порядок выкатки

1. **Миграция `get_feed`** (+ `get_location_path`/`count_nearby_listings` под единый
   контракт) → применить → прод-тест `T-N`: фильтр этажности по uuid возвращает объект;
   `cheques`/`is_study`/`is_reduced` фильтруют; `p_is_distress` отсутствует.
2. **Терминирование в коде** → `npm test` зелёный.
3. **Панель**: unit-тесты на `buildParams` (динамический маппинг чипа этажа в нужный
   параметр; контекст rent → cheques/period; offplan → completion); рендер секций по типу.
4. `npm run checkFile` по каждому `.ts`/`.scss`.

## Риски

- **Единый контракт RPC:** `get_feed`, `get_location_path`, `count_nearby_listings` делят
  набор параметров. Поменяем в одном — рассинхрон с остальными (карта связей). Держать
  контракт единым в одной миграции.
- **Замена single `p_floor_level_id` → массив** меняет сигнатуру: проверить все вызовы
  (фронт + RPC-композиции), нет ли передачи single uuid.
- DROP колонок отложен — следить, что «мёртвые» поля не читаются после терминирования.

## Раунд v2.1 — фидбэк создателя (2026-06-21, после деплоя Track 2)

**A. Зеркало тулбара в сайдбаре — живая двусторонняя синхронизация** (общие сигналы
`FeedFilterService`, НЕ draft; меняешь в тулбаре или панели — видно в обоих):
1. **Адреса** (`locationFilters`) — вверху панели чипами с ×; × → `removeLocation(id)` (удаляется и из тулбара).
2. **Sale/Rent** (`dealType`) — селект в панели, живой (`set()`).
3. **Сегмент Ready/Off-Plan** (`handover`) — селект в панели (`setSegment()`); сейчас его в панели НЕТ.
4. **Тип объекта** — каскад **Residential/Commercial → unit_type → подтипы** (как мега-дропдаун
   тулбара: `selectCategoryAll`/`selectUnitType`/`toggleSubType`), живой. Заменяет плоский список («мусор»).
5. **Охват (visibility)** — **селект** (не мультиселект) Public/Friends, отражает `scope` из тулбара;
   `My`/Favourites в фильтр НЕ выводим.

**B. Панель-специфичные (draft + «Применить»):**
6. **Позиции** — справочник `position` плоский (back_to_back/single_row/corner/middle, parent_id=null,
   нет привязки к типу). Apartment не должен показывать виллы-позиции. Фикс: клиентская карта по
   категории/типу (apartment → corner, middle; дом/вилла → все 4) — по аналогии с floorChips.
7. **Заселённость** — **мультиселект** (выбрать все три). Требует миграции get_feed
   `p_occupancy_status text` → `text[]` (СОГЛАСОВАНО «миграция сейчас»); `FeedFilters.occupancyStatus`
   → `string[]`; buildParams отдаёт массив.

**Архитектура:** общие контролы (1–5) работают ЖИВЫМИ методами `FeedFilterService` (мгновенно,
двусторонне); панель-специфичные (цена/площадь/участок/виды/позиции/удобства/этаж/булевы/чеки/
заселённость) остаются в `draft` и применяются по «Применить».

## Раунд v2.2 — фидбэк создателя (2026-06-22)

**A. Бейдж-счётчик на иконке «Фильтр» в тулбаре** — увеличивается после КАЖДОГО выбора и
КАЖДОЙ добавленной локации. `activeFilterCount` дополнить: + `locationFilters().length`
(каждая локация +1) + живые контролы (тип выбран +1; handover≠null +1; scope≠'public' +1).

**B. Объединить Категория+Тип+Подтип в ОДИН блок с прогрессивным раскрытием:** изначально
Residential/Commercial → после выбора категории под ним появляется Тип → после выбора типа
появляется Подтип. (Каскад FE-3 уже близок — собрать в один визуальный блок.)

**C. Перенос секций:** Охват (scope) — вниз, НАД «Листинг». Блок «Застройщик» — тоже НАД «Листинг».

**D. Сохранённые фильтры (RPC уже есть, миграция НЕ нужна):**
- DB: `get_saved_filters()` (список), `save_filter(p_filters jsonb, p_auto_name, …)` (создать,
  имя→`auto_name`), `delete_filter(p_filter_id)` (soft-delete). «Изменить» = прямой PATCH
  `saved_filters.filters` под RLS (`filters_update`, user_id=auth.uid()).
- `filters` jsonb = ПОЛНОЕ состояние поиска: `FeedFilters` (draft) + живые (dealType, handover,
  scope, category, locationFilters). При загрузке — восстановить всё.
- **UI верхний блок (над всем):** список названий сохранённых фильтров, у каждого × (delete_filter).
- **Кнопка «Сохранить»** → модалка ввода названия → `save_filter` → слева выезжающая плашка
  «Фильтр "название" сохранён» (toast).
- **Выбор сохранённого** → загрузить его filters в состояние; запомнить `loadedFilterId`.
- **«Изменить» вместо «Сохранить»** — появляется, когда после загрузки сохранённого фильтра
  изменён хоть один параметр (dirty); «Изменить» делает PATCH этого фильтра.
- × у названия → `delete_filter` + убрать из списка.

## Отложено (вне этого захода)

- F-10 / A-3: сохранённые фильтры + подписка-уведомления (отдельный сервис матчинга).
- API-9: серверный параметр охвата (`p_scope`) — охват пока на клиенте.
- DROP COLUMN `is_distress`, `is_negotiable`.
- `layout_id` как фильтр (привязан к справочнику комьюнити, нишевый).
- Виды/удобства по типу (если понадобится type-scoping как у позиций).
