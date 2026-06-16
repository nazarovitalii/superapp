# Карточка объекта (правый sidebar) — полная пересборка

Дата: 2026-06-15 · Задачи: P-3 (карточка), P-5b-показ фото · Стиль: токены Super Productivity

## Проблема

Карточка-деталь (`property-detail.component`) показывает малую часть данных и содержит
два бага:

1. **Галерея всегда пустая** — `get_property` НЕ возвращает `photos`. Фото лежат в
   таблице `property_photos` (заливка реализована в P-5b), но карточка их не читает.
2. **Агент не отображается** — тип `PropertyDetail` ждёт плоские `owner_whatsapp_phone`/
   `owner_languages`, а `get_property` отдаёт их во вложенном объекте `agent{}`. Код читает
   несуществующие поля → имя/WhatsApp/языки агента из detail не показываются.

Плюс `get_property` отдаёт много полей, которые сейчас игнорируются (см. ниже).

## Источники данных

- **`get_property(p_property_id)`** → jsonb: все поля `properties` + локация
  (`location_full_path`), девелопер (`developer_name_ref`, `developer_logo_url`), флаги
  `is_owner`/`is_network`, и вложенный `agent{ id, full_name, tg_username, whatsapp_phone,
photo_url, about, languages, agency_name, emirate_name, broker_license }`.
  Контакты агента (`whatsapp_phone`, `broker_license`) БД сама отдаёт по правам
  (свой объект / Pro / сеть), иначе NULL — клиент эту логику НЕ дублирует.
- **`property_photos`** (прямой select под RLS `photos_select`) → `full_url, thumb_url,
order_index, photo_type`, сорт по `order_index`. RLS уже ограничивает видимость.
- **`get_filter_options`** (кэш в `PropertyCreateService`) → резолв id-массивов
  `view_ids`/`position_ids`/`amenity_ids`/`floor_level_id` в названия (`label_en`).

## Что показываем (таб «Инфо»), пустые блоки скрываются

1. **Галерея** — реальные фото (`full_url`), листание + счётчик, плейсхолдер если нет.
2. **Цена** — крупно; если `previous_price` есть и > `price` → старая зачёркнута + «↓».
   Чипы: Продажа/Аренда · Срочно (`is_distress`) · Торг (`is_negotiable`) ·
   Комиссия включена (`commission_included`).
3. **Параметры** (иконки, скрывая null): спальни, ванные, maid (`is_maid`), BUA
   (`area_sqft`) + plot (`plot_sqft`), этаж-уровень (`floor_level_id`→label),
   этажность юнита (`floors_in_unit`), мебель, готовность/off-plan + срок сдачи
   (`completion_year`/`completion_q`), занятость (`occupancy_status`) + «занято до»
   (`lease_until`), виды/расположение/удобства (id→labels).
4. **Локация** — `location_full_path`.
5. **Девелопер** — `developer_logo_url` + `developer_name_ref`/`developer_name`.
6. **Документы** (только если `listing_type === 'official'`) — Title Deed №/год,
   plot, municipality.
7. **Агент** — фото, имя, агентство, эмират, языки, «о себе» (`about`),
   WhatsApp + Telegram. Если контакта нет → плашка «доступно на Pro».
8. **Статистика** — «Обновлено N дней назад» (`last_actualized_at`/`published_at`) +
   просмотры (`views_count`).

**НЕ входит:** бейдж агента (вне MVP — правила mrsqm.md), таб «Комментарии»
(отдельная задача F-13, оставляем заглушку как есть), превью фото в строке ленты
(отдельный шаг).

## Изменения в коде

- **`types/database.ts`** — переписать `PropertyDetail` под реальный ответ `get_property`
  (плоские поля + `previous_price`, `commission_included`, `lat`/`lng`, `views_count`,
  документы, `developer_logo_url`, `is_owner`) + новый интерфейс `PropertyAgent` для `agent`.
  Добавить `PropertyPhoto` (full_url/thumb_url/order_index/photo_type).
- **`property-photo.service.ts`** — метод `getPhotos(propertyId): Promise<PropertyPhoto[]>`
  (select из `property_photos`, сорт order_index).
- **`property-detail.component.ts`** — параллельно грузить `get_property`, `getPhotos`,
  `getFilterOptions`; computed-аксессоры (имя/контакты агента и т.д. с фолбэком на
  входной feed-item, пока detail грузится); резолвер id→label; обработка ошибки
  `get_property` (`{error}` → показываем что есть из feed-item).
- **`property-detail.component.html`** — новая разметка блоков 1–8.
- **`.scss`** — только токены SP, без новых цветов; единый цвет текста (F-13a).
- **Тесты** — обновить/добавить spec: резолв agent-полей, рендер фото, скрытие пустых
  блоков, price-drop.

## Риски

- Не sync/op-log — чистое чтение, NgRx не затрагивается.
- `agent` может быть NULL (объект без владельца не бывает, но LEFT JOIN) — фолбэк на
  feed-item.
- `community_layouts`-резолв `layout_id` требует знания комьюнити — в карточке layout
  пропускаем (минорно), остальные id-массивы резолвятся глобальным `get_filter_options`.
