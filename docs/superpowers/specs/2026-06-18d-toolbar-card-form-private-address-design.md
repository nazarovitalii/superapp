# Тулбар · карточка · форма · приватный адрес — design (2026-06-18d)

**Контекст.** Четвёртый батч правок создателя по ленте/карточке/форме + **реальная приватность адреса**.
Захвачен вербатим в `docs/TODO.md` (ID **V-1…V-11**) сразу ([[feedback-record-requests-immediately]]).
Реализация — Subagent-Driven ([[feedback-use-subagent-driven]]).

Делится на **две волны**: Волна 1 — чистый клиент (деплоится сразу); Волна 2 — приватность адреса
(2 миграции + клиент, после применения создателем в Studio).

---

## РЕШЕНИЯ (закрыто 2026-06-18d)

- **V-10/V-11 → серверная приватность (по-настоящему).** Сейчас `get_feed` отдаёт `l.name` (полный leaf)
  всем, `get_property` отдаёт `location_full_path` всем — слайдер «что видят коллеги» косметика. Чиним
  на сервере: чужим — только публичный адрес, владельцу — полный. 2 миграции.
- **V-7 → floor_plan в ту же галерею** sidebar (после gallery-фото).
- **V-9 → довести компактный одноколоночный дропдаун до «очень красиво»** через скилл `ui-ux-pro-max`
  (полировка токенов/кеглей/состояний, структуру не меняем).

---

## Волна 1 — клиент (без миграций)

### Тулбар · `pages/feed/feed-page.{html,scss,ts}`

- **V-1.** `.scope-select` фикс-ширину сократить ~20% (13.5rem → ~10.5rem); освободившееся уходит
  растягивающемуся `.tb-search` (он уже `flex:1 1 auto`).
- **V-4.** Пункты `mat-menu` селектов (охват/сегмент/сделка) — огромный кегль → 14px ленты. Стиль
  через класс на панели меню (`[class]` у `mat-menu`), НЕ глобальный Material-override.
- **V-5.** Поиск адреса — **мультиселект до 5 локаций**. `filter.locationFilter` (один) → массив
  `locationFilters: {id,name}[]`; чипы выбранных; `p_location_ids` = массив (get_feed уже принимает
  `uuid[]`, миграции нет). Автокомплит добавляет в массив (skip дубликаты, лимит 5).

### Строка таблицы · `pages/feed/feed-page.scss` + `components/property-card/property-card.scss`

- **V-2.** Грид (в шапке И в `.first-line` карточки, синхронно): колонке Дата дать ширину под
  «Yesterday» (56px → ~72px); колонке Адрес уменьшить рост (`minmax(110px,2fr)` → `minmax(110px,1.4fr)`),
  чтобы Тип и далее подтянулись влево, большой гап между Адрес и Тип убрать.

### Sidebar карточки · `components/property-detail/property-detail.{html,ts,scss}`

- **V-3.** Блок «Агент» (`.agent-section`, сейчас внизу ~стр.425) переместить ВЫШЕ блока
  «Характеристики» (~стр.211).
- **V-7.** `PropertyPhotoService.getPhotos` сейчас фильтрует `.eq('photo_type','gallery')` — добавить
  `floor_plan`: тянуть оба типа, сортировать gallery (order_index) затем floor_plan (order_index),
  дописывать floor_plan в конец массива `photos()`. Галерея/лайтбокс не меняются (работают по массиву).
- **V-8.** «Характеристики»: одну строку `Type: Residential Apartment - Flat (hotel apartment)` →
  две: `Type: Residential` (категория) и `Subtype: Flat (hotel apartment)` (подтип + квалификатор
  hotel). Расщепить `_composeType` на `_typeCategory` (категория) и `_typeSubtype` (sub + `(hotel
apartment)` если `is_hotel_pool`). Если подтипа нет — строку Subtype не показывать.

### Форма добавления · `pages/add-property/add-property-page.{html,ts}`

- **V-6.** Шаг «Состояние» → «Занятость» = Occupied: месяц и год — селекты (`<select>`/mat-select как
  в окружении). Годы: от текущего и максимум **+5** лет вперёд (текущий…текущий+5). Месяцы — 1–12.

### V-9 — дропдаун типа «очень красиво» · `pages/feed/feed-page.scss`(+html)

Берём компактную одноколоночную раскладку (батч 18c). Полировка через `ui-ux-pro-max`: отступы, кегли,
цвета, hover/active/selected, разделители — в токенах Super Productivity. Структуру (табы → список →
чипы → футер) не меняем.

---

## Волна 2 — приватность адреса (2 миграции + клиент)

### Модель

Листинг имеет уровень раскрытия `properties.public_location_id` (NULL = полностью публичный; иначе —
адрес виден только до этого уровня). «Публичный leaf» = имя локации `public_location_id`.

### Миграция P1 — `get_property` (staleness-proof DO-block)

Патч ЖИВОЙ функции: перед `RETURN v_result;` вставить пост-обработку — для **не-владельца** и когда
адрес скрыт (`public_location_path` не NULL): убрать из jsonb `location_full_path`; `location_name`
(leaf) переопределить на публичный leaf (последний сегмент `public_location_path`). Владелец и
нескрытые — без изменений. `is_owner` уже в выводе. Якорь `RETURN v_result;` (единственный), fail-loud.

### Миграция P2 — `get_feed` (staleness-proof DO-block)

Патч ЖИВОЙ функции, точечные замены строк (regexp, гибкие пробелы, fail-loud):

- `'location_name', l.name,` → `location_name` = `owner OR public_location_id IS NULL ? l.name :
<public leaf>` + **новое** поле `public_location_name` = `public_location_id IS NULL ? l.name :
<public leaf>`.
- `'community_name', lc.name,` → аналогично гейт + новое `public_community_name`
  (community-предок публичной локации).
- `<public leaf>` = `(SELECT name FROM locations WHERE id = p.public_location_id)`.
  Полный leaf чужим в payload не попадает (privacy).

### Клиент (после миграций) · `feed-page.ts`/`property-card` + `property-detail`

- **V-10 лента:** правило отображения адреса по охвату — **My Inventory** → `location_name`/
  `community_name` (полный, свои); **остальные охваты** (All/Friends/Favourites) →
  `public_location_name`/`public_community_name` (публичный, даже свои). `PropertyFeedItem` +
  `public_location_name`/`public_community_name`. Карточке передавать признак «показывать публичный».
- **V-11 sidebar «Расположение»:** владельцу — две строки: `location_full_path` `(что видишь ты)` +
  (если скрыто) `public_location_path` `(что видят все)`; не-владельцу — только `public_location_path`
  (полного нет). Использует существующие `location_full_path`/`public_location_path` + `is_owner`.

---

## Гейты / зависимости

- **P1, P2** — миграции, применяет создатель в Studio ([[vps-no-build-on-server]],
  [[staleness-proof-pg-function-patch]]). Волна 2 клиент — после применения.
- Волна 1 — без БД, деплоится сразу.

## Декомпозиция (SDD)

- **Волна 1:** A (тулбар: V-1/V-4/V-5) · B (строка-грид V-2) · C (sidebar V-3/V-7/V-8) · D (форма V-6) ·
  E (дропдаун V-9, с `ui-ux-pro-max`).
- **Волна 2:** миграции P1/P2 (отдать создателю) → F (клиент V-10/V-11) после применения.

## Критерии успеха

Волна 1: охват уже, поиск шире; меню-пункты 14px; поиск — мультиселект до 5 (чипы, массив id);
«Yesterday» влезает, гапа Адрес↔Тип нет; Агент выше Характеристик; floor_plan в галерее; Type/Subtype
двумя строками; Occupied месяц/год селектами (годы тек…+5); дропдаун красивый. Волна 2: чужим полный
адрес НЕ уходит (проверить payload); All Inventory показывает публичный, My Inventory полный;
«Расположение» — два пути владельцу, один не-владельцу. `checkFile` зелёный; юнит-тесты на новую логику;
полный сюит зелёный. Миграции применены и проверены (test-prod).
