# Тулбар ленты — редизайн (Bayut-style) + расширение таблицы

Дата: 2026-06-16 · Задачи: F-5 (каскад типа), частично F-8 (поиск) · Стиль: токены Super Productivity

## Цель

Заменить текущий тулбар (пилюля охвата + 3 toggle-группы + 2 иконки) на единую строку
контролов на всю ширину таблицы, по образцу Bayut. Расширить таблицу на 20%.

## Ширина

`.feed-container` `max-width: 800px → 960px` (+20%). Колонки таблицы и карточки —
fr/minmax, масштабируются автоматически, отдельной правки grid не требуют.

## Контролы (слева направо, одна строка)

1. **Охват** — селект-пилюля Public / Friends / **Private** / Favourites (переименовать
   «My» → «Private»; значение scope `'my'` не меняем). Клиентский фильтр (как сейчас).
2. **Автокомплит «Адрес или агент»** — крупное поле с выпадающим списком:
   - **Адреса** — `search_locations` (p_mode=search) → выбор пишет `locationFilter`
     `{id,name}` → `p_location_ids=[id]` в get_feed (**реальный фильтр**, перезагрузка).
   - **Агенты** — distinct `owner_full_name` из загруженных строк, совпавшие с вводом →
     выбор пишет `agentQuery` → **клиентский фильтр** `visibleProperties` (интерим;
     полноценный серверный поиск агента — позже, нужен параметр в get_feed).
   - Выбранный адрес/агент — чип в поле с крестиком (сброс).
3. **Сегмент** — селект All Segments / Ready / Off-Plan → `handover` (null = all).
4. **Сделка** — селект Sale / Rent → `dealType`. «Sale + Rent» (обе) — позже (get_feed
   требует один deal_type; решено отложить).
5. **Residential / Commercial** — крупный мега-дропдаун (matMenu, кастомный контент,
   широкая панель): 2 колонки (Residential | Commercial). В колонке — заголовок-категория
   («Все Residential»), под ним unit_types, под выбранным типом — подтипы чипами.
   Маппинг: `category` / `filters.unitTypeId` / `filters.subTypeIds` (те же сигналы, что
   у фильтр-панели — состояние общее). Дерево строится из `get_filter_options`
   (categories→unit_types по parent_id→sub_types по parent_id).
6. **Сортировка** (иконка `swap_vert`) + **Фильтры** (иконка `tune`/чип с счётчиком) —
   без изменений.

## Изменения состояния (FeedFilterService)

- Удалить `searchQuery` (поиск по описанию из тулбара уходит).
- Добавить `locationFilter = signal<{id,name}|null>` → p_location_ids.
- Добавить `agentQuery = signal<string>('')` → клиентский фильтр.

## Изменения feed-page

- `effect`-зависимости: заменить `searchQuery()` на `locationFilter()`.
- `_buildParams`: убрать `p_description`, добавить `p_location_ids` (из locationFilter).
- `visibleProperties`: доп. фильтр по `agentQuery` (owner_full_name includes, ci).
- Загрузить `get_filter_options` в сигнал → дерево категория/тип/подтип для дропдауна.
- Методы: `setSegment`, `setDealType` (есть), `selectCategoryAll`, `selectUnitType`,
  `toggleSubType`, `clearType`, автокомплит (debounce searchLocations, выбор адрес/агент,
  сброс). Лейбл кнопки типа — выбранный подтип/тип/категория или плейсхолдер.

## Тесты

- Сохранить прохождение существующего feed spec (p_deal_type, мультиселекты, sort).
- Добавить: `p_location_ids` при выбранном адресе; клиентский фильтр по агенту;
  выбор unit_type ставит category+unitTypeId и чистит subTypeIds; toggle подтипа.

## Риски / ограничения (интерим, без миграций)

- Поиск агента — только по загруженной странице (20 строк). Полный — позже.
- «Sale + Rent» — отложено (get_feed требует deal_type).
- count_total/пагинация при выбранном агенте — клиентские (как у scope сейчас).
- Стили — только токены SP, без нового визуального языка; мега-дропдаун — кастомный
  контент matMenu (outside-click/позиционирование берёт на себя Material).
