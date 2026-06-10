# База данных MrSQM — справочник

> Последнее обновление: 2026-06-10.
> Источник: PostgREST OpenAPI (`/rest/v1/`) на `supaprod.mrsqm.com`, service-ключ, только чтение схемы.
> **Покрытие:** колонки таблиц + сигнатуры RPC. Тела функций, триггеры и RLS-политики
> ещё не выгружены (нужен прямой SQL-доступ — «Вариант 2»). Помечено ниже как _TODO SQL_.
> БД общая с парсерами (admin/parser4/parser5); таблицы `bayut_*`, `scrape_*`, `v5_*`,
> бэкапы и админ/служебные — намеренно не документированы (не нужны клиенту MrSQM).

---

## Иерархия локаций

```
country → city → community → sub_community → cluster → building → checkpoint
UAE → Dubai → DAMAC Hills → Golf Town → Golf Promenade → Golf Promenade 4 → Golf Promenade 4A
```
`p_location_ids` принимает UUID любого уровня — поиск автоматически охватывает дочерние.

---

## RPC — клиентские (вызываются из webapp/desktop)

Все используют `auth.uid()` из JWT. `p_user_id` есть в сигнатуре, но из клиента **не передаётся** (только n8n/service_role).

### `get_feed`

| Параметр | Тип |
|---|---|
| `p_amenity_ids` | text[] |
| `p_area_sqft_max` | numeric |
| `p_area_sqft_min` | numeric |
| `p_bathrooms` | integer[] |
| `p_bedrooms` | integer[] |
| `p_category_id` | uuid |
| `p_city_id` | uuid |
| `p_completion_q` | text[] |
| `p_completion_year` | integer[] |
| `p_deal_type` | text |
| `p_description` | text |
| `p_developer_ids` | uuid[] |
| `p_developer_name` | text |
| `p_exclude_location_ids` | uuid[] |
| `p_floor_level_id` | uuid |
| `p_floors_in_unit` | text[] |
| `p_furnished` | text |
| `p_handover` | text |
| `p_is_distress` | boolean |
| `p_is_hotel_pool` | boolean |
| `p_is_maid` | boolean |
| `p_lat` | numeric |
| `p_limit` | integer |
| `p_listing_type` | text |
| `p_lng` | numeric |
| `p_location_ids` | uuid[] |
| `p_occupancy_status` | text |
| `p_offset` | integer |
| `p_plot_sqft_max` | numeric |
| `p_plot_sqft_min` | numeric |
| `p_position_ids` | text[] |
| `p_price_currency` | text |
| `p_price_max` | numeric |
| `p_price_min` | numeric |
| `p_price_period` | text |
| `p_sort_by` | text |
| `p_sub_type_ids` | uuid[] |
| `p_unit_type_id` | uuid |
| `p_user_id` | uuid |
| `p_view_ids` | text[] |

_Логика/правила доступа: TODO SQL._

### `get_property`

| Параметр | Тип |
|---|---|
| `p_property_id` | uuid |
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `get_similar_properties`

| Параметр | Тип |
|---|---|
| `p_limit` | integer |
| `p_property_id` | uuid |
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `autocomplete_locations`

| Параметр | Тип |
|---|---|
| `p_city_id` | uuid |
| `p_levels` | text[] |
| `p_limit` | integer |
| `p_query` | text |

_Логика/правила доступа: TODO SQL._

### `search_locations`

| Параметр | Тип |
|---|---|
| `p_level_filter` | text |
| `p_limit` | integer |
| `p_location_id` | uuid |
| `p_mode` | text |
| `p_query` | text |

_Логика/правила доступа: TODO SQL._

### `get_location_path`

| Параметр | Тип |
|---|---|
| `p_amenity_ids` | text[] |
| `p_area_sqft_max` | numeric |
| `p_area_sqft_min` | numeric |
| `p_bathrooms` | integer[] |
| `p_bedrooms` | integer[] |
| `p_category_id` | uuid |
| `p_completion_q` | text[] |
| `p_completion_year` | integer[] |
| `p_deal_type` | text |
| `p_description` | text |
| `p_floor_level_id` | uuid |
| `p_floors_in_unit` | text[] |
| `p_furnished` | text |
| `p_handover` | text |
| `p_is_distress` | boolean |
| `p_is_hotel_pool` | boolean |
| `p_is_maid` | boolean |
| `p_listing_type` | text |
| `p_location_id` | uuid |
| `p_occupancy_status` | text |
| `p_plot_sqft_max` | numeric |
| `p_plot_sqft_min` | numeric |
| `p_position_ids` | text[] |
| `p_price_currency` | text |
| `p_price_max` | numeric |
| `p_price_min` | numeric |
| `p_price_period` | text |
| `p_sub_type_ids` | uuid[] |
| `p_unit_type_id` | uuid |
| `p_user_id` | uuid |
| `p_view_ids` | text[] |

_Логика/правила доступа: TODO SQL._

### `get_location_subtree`

| Параметр | Тип |
|---|---|
| `p_location_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `count_nearby_listings`

| Параметр | Тип |
|---|---|
| `p_area_sqft_max` | numeric |
| `p_area_sqft_min` | numeric |
| `p_bedrooms` | integer[] |
| `p_category_id` | uuid |
| `p_city_id` | uuid |
| `p_community_id` | uuid |
| `p_deal_type` | text |
| `p_furnished` | text |
| `p_handover` | text |
| `p_is_distress` | boolean |
| `p_listing_type` | text |
| `p_location_ids` | uuid[] |
| `p_neighbor_ids` | uuid[] |
| `p_price_max` | numeric |
| `p_price_min` | numeric |
| `p_sub_type_ids` | uuid[] |
| `p_unit_type_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `get_community_for_location`

| Параметр | Тип |
|---|---|
| `p_location_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `is_leaf_location`

| Параметр | Тип |
|---|---|
| `p_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `get_filter_options`

| Параметр | Тип |
|---|---|
| `p_category_id` | uuid |
| `p_unit_type_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `search_developers`

| Параметр | Тип |
|---|---|
| `p_city_id` | uuid |
| `p_limit` | integer |
| `p_query` | text |

_Логика/правила доступа: TODO SQL._

### `get_developers_with_counts`

_(без параметров)_

_Логика/правила доступа: TODO SQL._

### `get_developer_projects`

| Параметр | Тип |
|---|---|
| `p_developer_id` | uuid |
| `p_limit` | integer |
| `p_offset` | integer |
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `get_agent_listings`

| Параметр | Тип |
|---|---|
| `p_agent_id` | uuid |
| `p_limit` | integer |
| `p_offset` | integer |
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `get_saved_filters`

| Параметр | Тип |
|---|---|
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `save_filter`

| Параметр | Тип |
|---|---|
| `p_ai_query_text` | text |
| `p_auto_name` | text |
| `p_city_id` | uuid |
| `p_filters` | jsonb |
| `p_notification_type` | text |
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `delete_filter`

| Параметр | Тип |
|---|---|
| `p_filter_id` | uuid |
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `update_filter_notification`

| Параметр | Тип |
|---|---|
| `p_filter_id` | uuid |
| `p_notification_type` | text |
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `get_saved_properties`

| Параметр | Тип |
|---|---|
| `p_limit` | integer |
| `p_offset` | integer |
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `save_property`

| Параметр | Тип |
|---|---|
| `p_property_id` | uuid |
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `track_view`

| Параметр | Тип |
|---|---|
| `p_property_id` | uuid |
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `track_impressions`

| Параметр | Тип |
|---|---|
| `p_property_ids` | uuid[] |
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `get_property_viewers`

| Параметр | Тип |
|---|---|
| `p_limit` | integer |
| `p_offset` | integer |
| `p_property_id` | uuid |
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `has_permission`

| Параметр | Тип |
|---|---|
| `p_action` | text |
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `get_pocket_access_limit`

| Параметр | Тип |
|---|---|
| `p_user_id` | uuid |

_Логика/правила доступа: TODO SQL._

### `match_chat_embeddings`

| Параметр | Тип |
|---|---|
| `match_count` | integer |
| `p_user_id` | uuid |
| `query_embedding` | extensions.vector |

_Логика/правила доступа: TODO SQL._

---

## RPC — служебные (n8n / admin / парсеры / триггеры)

Не вызываются из клиента MrSQM. Перечислены для полноты.

| RPC | Параметры |
|---|---|
| `activate_on_onboarding_complete` | — |
| `claim_next_job` | — |
| `create_admin` | `admin_email`, `admin_full_name`, `admin_password`, `admin_role`, `creator_id` |
| `delete_admin` | `deleter_id`, `target_email` |
| `expire_pro_subscriptions` | — |
| `get_notification_template` | `p_event_type` |
| `get_pro_expiring_soon` | `p_days` |
| `grant_gift_subscription` | `p_granted_by`, `p_months`, `p_reason`, `p_ref_id`, `p_source`, `p_user_id` |
| `log_notification` | `p_body`, `p_category`, `p_context`, `p_dedup_key`, `p_dedup_window_minutes`, `p_severity`, `p_source`, `p_title` |
| `match_embeddings` | `filter_scope`, `match_count`, `query_embedding` |
| `move_location` | `p_location_id`, `p_new_parent_id` |
| `process_bayut_developers` | — |
| `process_bayut_locations` | — |
| `process_bayut_projects` | `p_developer_bayut_id` |
| `process_developers` | — |
| `rebuild_external_neighbors` | `p_city_id`, `p_close_radius_m`, `p_community_id`, `p_far_radius_m`, `p_mid_radius_m` |
| `rebuild_location_neighbors` | `p_city_id`, `p_close_radius_m`, `p_far_radius_m`, `p_level`, `p_location_id`, `p_mid_radius_m` |
| `recalculate_badges` | — |
| `recompute_location_leaves` | — |
| `retroactive_resync_all` | — |
| `retroactive_resync_unmatched` | — |
| `search_bayut_listings` | `p_area_max`, `p_area_min`, `p_bedrooms`, `p_completion_status`, `p_deal_type`, `p_developer_name`, `p_is_furnished`, `p_lat`, `p_limit`, `p_lng`, `p_location_ids`, `p_offset`, `p_price_max`, `p_price_min`, `p_radius_km`, `p_type_sub` |
| `sync_listings_to_bayut_building_enrichment` | `p_leaf_location_id` |
| `update_location_developer_ids` | `p_developer_id` |
| `update_location_hierarchy_ids` | — |
| `upsert_location_from_bayut` | `p_bayut_id`, `p_building_bayut_id`, `p_building_name`, `p_checkpoint_bayut_id`, `p_checkpoint_name`, `p_city_bayut_id`, `p_city_name`, `p_cluster_bayut_id`, `p_cluster_name`, `p_community_bayut_id`, `p_community_name`, `p_completion_status`, `p_country_bayut_id`, `p_country_name`, `p_lat`, `p_level`, `p_lng`, `p_name`, `p_name_ar`, `p_sub_community_bayut_id`, `p_sub_community_name` |
| `v5_get_enrichment_queue` | `p_batch_size` |
| `v5_save_enrichment` | `p_building_completion`, `p_building_elevators`, `p_building_floors`, `p_building_index_received`, `p_building_name`, `p_building_offices`, `p_building_shops`, `p_building_swimming_pools`, `p_building_total_area`, `p_building_total_parking`, `p_developer`, `p_dld_index_received`, `p_enrichment_raw`, `p_es_requests_count`, `p_last_error`, `p_leaf_location_id`, `p_listing_id`, `p_ownership`, `p_parking_number`, `p_scrape_duration_ms`, `p_scraper_version`, `p_status`, `p_traffic_bytes`, `p_usage` |

---

## Таблицы и VIEW (MrSQM-релевантные)

### Объекты недвижимости

#### `properties`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `owner_id` | uuid | FK |
| `unit_id` | uuid | FK |
| `location_id` | uuid | FK |
| `category_id` | uuid | FK |
| `unit_type_id` | uuid | FK |
| `sub_type_id` | uuid | FK |
| `listing_type` | text |  |
| `deal_type` | text |  |
| `price_period` | text |  |
| `visibility` | text |  |
| `status` | text |  |
| `bedrooms` | integer |  |
| `bathrooms` | integer |  |
| `is_maid` | boolean |  |
| `is_hotel_pool` | boolean |  |
| `area_sqft` | numeric |  |
| `area_sqm` | numeric |  |
| `plot_sqft` | numeric |  |
| `plot_sqm` | numeric |  |
| `floor_number` | integer |  |
| `floor_level_id` | uuid | FK |
| `floors_in_unit` | text |  |
| `layout_id` | uuid | FK |
| `view_ids` | text[] |  |
| `position_ids` | text[] |  |
| `amenity_ids` | text[] |  |
| `furnished` | text |  |
| `lat` | numeric |  |
| `lng` | numeric |  |
| `price` | numeric |  |
| `previous_price` | numeric |  |
| `price_currency` | text |  |
| `price_changed_at` | timestamp with time zone |  |
| `is_negotiable` | boolean |  |
| `commission_included` | boolean |  |
| `is_distress` | boolean |  |
| `occupancy_status` | text |  |
| `lease_until` | date |  |
| `description` | text |  |
| `address_from_bayut` | text |  |
| `title_deed_number` | text |  |
| `title_deed_year` | integer |  |
| `plot_number` | text |  |
| `municipality_number` | text |  |
| `developer_id` | uuid | FK |
| `handover` | text |  |
| `completion_year` | integer |  |
| `completion_q` | text |  |
| `listing_start` | date |  |
| `listing_end` | date |  |
| `last_actualized_at` | timestamp with time zone |  |
| `published_at` | timestamp with time zone |  |
| `expires_at` | timestamp with time zone |  |
| `views_count` | integer |  |
| `unique_views_count` | integer |  |
| `contacts_count` | integer |  |
| `impressions_count` | integer |  |
| `comments_count` | integer |  |
| `created_at` | timestamp with time zone |  |
| `updated_at` | timestamp with time zone |  |
| `geom` | extensions.geometry(Point,4326) |  |
| `developer_name` | text |  |

#### `property_photos`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `property_id` | uuid | FK |
| `photo_type` | text |  |
| `order_index` | integer |  |
| `full_url` | text |  |
| `thumb_url` | text |  |
| `file_size_kb` | integer |  |
| `width` | integer |  |
| `height` | integer |  |
| `uploaded_at` | timestamp with time zone |  |

#### `property_price_history`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `property_id` | uuid | FK |
| `price` | numeric |  |
| `price_currency` | text |  |
| `changed_by` | uuid | FK |
| `changed_at` | timestamp with time zone |  |

#### `property_comments`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `property_id` | uuid | FK |
| `user_id` | uuid | FK |
| `parent_id` | uuid | FK |
| `body` | text |  |
| `deleted_at` | timestamp with time zone |  |
| `deleted_by` | text |  |
| `deleted_by_admin` | text |  |
| `created_at` | timestamp with time zone |  |

#### `property_events`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `property_id` | uuid | FK |
| `user_id` | uuid | FK |
| `event_type` | text |  |
| `source` | text |  |
| `created_at` | timestamp with time zone |  |

#### `property_logs`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `property_id` | uuid | FK |
| `user_id` | uuid | FK |
| `action` | text |  |
| `field_name` | text |  |
| `old_value` | text |  |
| `new_value` | text |  |
| `source` | text |  |
| `created_at` | timestamp with time zone |  |

#### `property_form_a`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `property_id` | uuid | FK |
| `file_url` | text |  |
| `listing_start` | date |  |
| `listing_end` | date |  |
| `status` | text |  |
| `uploaded_by` | uuid | FK |
| `approved_by` | text |  |
| `approved_at` | timestamp with time zone |  |
| `moderation_note` | text |  |
| `uploaded_at` | timestamp with time zone |  |

#### `units`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `location_id` | uuid | FK |
| `unit_number` | text |  |
| `tech_number` | text |  |
| `category_id` | uuid | FK |
| `unit_type_id` | uuid | FK |
| `sub_type_id` | uuid | FK |
| `bedrooms` | integer |  |
| `bathrooms` | integer |  |
| `is_maid` | boolean |  |
| `is_hotel_pool` | boolean |  |
| `area_sqft` | numeric |  |
| `area_sqm` | numeric |  |
| `plot_sqft` | numeric |  |
| `plot_sqm` | numeric |  |
| `floor_number` | integer |  |
| `floor_level_id` | uuid | FK |
| `floors_in_unit` | text |  |
| `layout_id` | uuid | FK |
| `view_ids` | text[] |  |
| `position_ids` | text[] |  |
| `amenity_ids` | text[] |  |
| `furnished` | text |  |
| `handover` | text |  |
| `completion_year` | integer |  |
| `completion_q` | text |  |
| `description` | text |  |
| `is_embedded` | boolean |  |
| `created_at` | timestamp with time zone |  |
| `last_actualised_at` | timestamp with time zone |  |
| `updated_at` | timestamp with time zone |  |

#### `unit_photos`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `unit_id` | uuid | FK |
| `photo_type` | text |  |
| `full_url` | text |  |
| `thumb_url` | text |  |
| `order_index` | integer |  |
| `file_size_kb` | integer |  |
| `width` | integer |  |
| `height` | integer |  |
| `source` | text |  |
| `uploaded_by` | uuid | FK |
| `uploaded_at` | timestamp with time zone |  |

#### `unit_title_deeds`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `unit_id` | uuid | FK |
| `title_deed_number` | text |  |
| `title_deed_year` | integer |  |
| `is_current` | boolean |  |
| `registered_at` | date |  |
| `created_at` | timestamp with time zone |  |

#### `drafts`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `listing_type` | text |  |
| `visibility` | text |  |
| `collected_fields` | jsonb |  |
| `missing_fields` | text[] |  |
| `current_step` | text |  |
| `expires_at` | timestamp with time zone |  |
| `created_at` | timestamp with time zone |  |
| `updated_at` | timestamp with time zone |  |

#### `saved_properties`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `property_id` | uuid | FK |
| `created_at` | timestamp with time zone |  |

#### `user_seen_listings`

| Колонка | Тип | Ключ |
|---|---|---|
| `user_id` | uuid | PK |
| `property_id` | uuid | PK |
| `filter_id` | uuid | FK |
| `seen_at` | timestamp with time zone |  |

#### `listing_permit_rank`

| Колонка | Тип | Ключ |
|---|---|---|
| `listing_id` | bigint | PK |
| `permit_number` | text |  |
| `permit_rank_admin` | bigint |  |
| `permit_group_size_admin` | bigint |  |

### Локации и девелоперы

#### `locations`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `parent_id` | uuid | FK |
| `bayut_id` | integer |  |
| `external_id` | text |  |
| `slug` | text |  |
| `level` | text |  |
| `name` | text |  |
| `name_ar` | text |  |
| `aliases` | text[] |  |
| `lat` | numeric |  |
| `lng` | numeric |  |
| `description` | text |  |
| `is_embedded` | boolean |  |
| `stats_listings` | integer |  |
| `stats_avg_price` | numeric |  |
| `is_active` | boolean |  |
| `is_popular` | boolean |  |
| `created_at` | timestamp with time zone |  |
| `updated_at` | timestamp with time zone |  |
| `geom` | extensions.geometry(Point,4326) |  |
| `country_id` | uuid | FK |
| `city_id` | uuid | FK |
| `community_id` | uuid | FK |
| `sub_community_id` | uuid | FK |
| `cluster_id` | uuid | FK |
| `building_id` | uuid | FK |
| `country_bayut_id` | integer |  |
| `city_bayut_id` | integer |  |
| `community_bayut_id` | integer |  |
| `sub_community_bayut_id` | integer |  |
| `cluster_bayut_id` | integer |  |
| `building_bayut_id` | integer |  |
| `checkpoint_bayut_id` | integer |  |
| `completion_status` | text |  |
| `developer_ids` | uuid[] |  |
| `external_neighbor_ids` | uuid[] |  |
| `is_leaf` | boolean |  |

#### `location_neighbors`

| Колонка | Тип | Ключ |
|---|---|---|
| `location_id` | uuid | PK |
| `neighbor_id` | uuid | PK |
| `level` | text |  |
| `distance_m` | numeric |  |
| `zone` | text |  |
| `rank` | smallint |  |
| `is_manual` | boolean |  |
| `created_at` | timestamp with time zone |  |
| `updated_at` | timestamp with time zone |  |

#### `location_developers`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `developer_id` | uuid | FK |
| `location_id` | uuid | FK |
| `project_name` | text |  |
| `project_status` | text |  |
| `built_year` | integer |  |
| `completion_year` | integer |  |
| `completion_q` | text |  |
| `total_units` | integer |  |
| `total_floors` | integer |  |
| `total_plots` | integer |  |
| `source` | text |  |
| `confidence` | numeric |  |
| `created_at` | timestamp with time zone |  |
| `updated_at` | timestamp with time zone |  |
| `completion_status` | text |  |
| `bayut_project_id` | integer |  |
| `title_ar` | text |  |
| `description` | text |  |
| `description_ar` | text |  |
| `bedrooms` | integer[] |  |
| `completion_percentage` | integer |  |
| `start_date` | text |  |
| `completion_date` | text |  |
| `type_main` | text |  |
| `type_sub` | text[] |  |
| `price_start` | numeric |  |
| `area_start` | jsonb |  |
| `amenities` | jsonb |  |
| `amenities_ar` | jsonb |  |
| `payment_plans` | jsonb |  |
| `is_post_handover` | boolean |  |
| `media` | jsonb |  |
| `documents` | jsonb |  |
| `legal` | jsonb |  |
| `unit_rooms` | integer[] |  |
| `unit_baths` | integer[] |  |
| `project_scope` | text |  |

#### `location_listing_counts`

| Колонка | Тип | Ключ |
|---|---|---|
| `location_id` | uuid | PK |
| `city_id` | uuid | FK |
| `community_id` | uuid | FK |
| `sub_community_id` | uuid | FK |
| `cluster_id` | uuid | FK |
| `building_id` | uuid | FK |
| `deal_type` | text |  |
| `listing_type` | text |  |
| `total_count` | bigint |  |

#### `community_layouts`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `location_id` | uuid | FK |
| `name` | text |  |
| `description` | text |  |
| `source` | text |  |
| `created_by` | uuid | FK |
| `updated_by` | uuid | FK |
| `is_active` | boolean |  |
| `order_index` | integer |  |
| `created_at` | timestamp with time zone |  |
| `updated_at` | timestamp with time zone |  |

#### `developers`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `bayut_id` | integer |  |
| `name` | text |  |
| `name_ar` | text |  |
| `slug` | text |  |
| `logo_url` | text |  |
| `website_url` | text |  |
| `phone` | text |  |
| `email` | text |  |
| `description` | text |  |
| `licenses` | jsonb |  |
| `rating` | numeric |  |
| `review_count` | integer |  |
| `total_projects` | integer |  |
| `is_embedded` | boolean |  |
| `is_active` | boolean |  |
| `created_at` | timestamp with time zone |  |
| `updated_at` | timestamp with time zone |  |
| `established_since` | timestamp with time zone |  |
| `city_ids` | uuid[] |  |
| `service_areas` | jsonb |  |
| `service_areas_ids` | uuid[] |  |
| `aliases` | text[] |  |
| `source` | text |  |

#### `emirates`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `code` | text |  |
| `name_en` | text |  |
| `name_ar` | text |  |
| `regulatory_body` | text |  |
| `broker_id_field` | text |  |
| `csv_column_mapping` | jsonb |  |
| `units_csv_mapping` | jsonb |  |
| `is_active` | boolean |  |
| `order_index` | integer |  |
| `created_at` | timestamp with time zone |  |
| `city_id` | uuid | FK |

#### `property_type_values`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `parent_id` | uuid | FK |
| `group_name` | text |  |
| `level_name` | text |  |
| `value` | text |  |
| `label_en` | text |  |
| `label_ar` | text |  |
| `order_index` | integer |  |
| `is_active` | boolean |  |
| `created_at` | timestamp with time zone |  |

#### `enrichment_leaf_overrides`

| Колонка | Тип | Ключ |
|---|---|---|
| `leaf_location_id` | uuid | PK |
| `not_building` | boolean |  |
| `approved` | boolean |  |
| `note` | text |  |
| `updated_at` | timestamp with time zone |  |
| `updated_by` | text |  |

### Пользователи и сеть

#### `users`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `telegram_id` | bigint |  |
| `whatsapp_phone` | text |  |
| `full_name` | text |  |
| `email` | text |  |
| `phone` | text |  |
| `tg_username` | text |  |
| `role` | text |  |
| `referral_code` | text |  |
| `referred_by` | uuid | FK |
| `is_active` | boolean |  |
| `channel_origin` | text |  |
| `created_at` | timestamp with time zone |  |
| `updated_at` | timestamp with time zone |  |
| `whatsapp_verified` | boolean |  |
| `email_verified` | boolean |  |
| `email_verification_code` | text |  |
| `email_verification_expires` | timestamp with time zone |  |
| `activated_at` | timestamp with time zone |  |

#### `user_identities`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `broker_license` | text |  |
| `broker_license_expiry` | date |  |
| `emirate_id` | uuid | FK |
| `created_at` | timestamp with time zone |  |
| `city_id` | uuid | FK |
| `user_type` | text |  |
| `emirate_name` | text |  |
| `agency_id` | uuid | FK |
| `agency_name` | text |  |

#### `user_settings`

| Колонка | Тип | Ключ |
|---|---|---|
| `user_id` | uuid | PK |
| `languages` | text[] |  |
| `service_areas` | text[] |  |
| `about` | text |  |
| `updated_at` | timestamp with time zone |  |
| `photo_url` | text |  |

#### `user_context`

| Колонка | Тип | Ключ |
|---|---|---|
| `user_id` | uuid | PK |
| `badge_level` | text |  |
| `score` | integer |  |
| `active_listings` | integer |  |
| `recent_events` | jsonb |  |
| `ai_context_text` | text |  |
| `recalculated_at` | timestamp with time zone |  |
| `full_name` | text |  |
| `referral_code` | text |  |
| `created_at_user` | timestamp with time zone |  |
| `emirate_name` | text |  |
| `agency_name` | text |  |
| `friends_count` | integer |  |
| `referrals_count` | integer |  |
| `comments_count` | integer |  |
| `saved_filters_count` | integer |  |
| `total_listings_ever` | integer |  |
| `pdf_generated_count` | integer |  |
| `total_searches` | integer |  |
| `last_active_at` | timestamp with time zone |  |
| `channel_origin` | text |  |
| `whatsapp_verified` | boolean |  |
| `broker_license` | text |  |
| `broker_license_expiry` | date |  |
| `city_id` | uuid |  |
| `plan` | text |  |
| `subscription_status` | text |  |
| `plan_expires_at` | timestamp with time zone |  |
| `agency_members_count` | integer |  |

#### `user_events`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `event_type` | text |  |
| `payload` | jsonb |  |
| `is_notified` | boolean |  |
| `ai_context_used` | boolean |  |
| `created_at` | timestamp with time zone |  |

#### `user_network`

| Колонка | Тип | Ключ |
|---|---|---|
| `user_id` | uuid | PK |
| `friend_ids` | uuid[] |  |
| `colleague_ids` | uuid[] |  |

#### `friendships`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `friend_id` | uuid | FK |
| `status` | text |  |
| `source` | text |  |
| `requested_by` | uuid | FK |
| `created_at` | timestamp with time zone |  |

#### `sessions`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `telegram_id` | bigint |  |
| `whatsapp_phone` | text |  |
| `step` | text |  |
| `mode` | text |  |
| `data` | jsonb |  |
| `support_active` | boolean |  |
| `chatwoot_conversation_id` | integer |  |
| `onboarding_step` | text |  |
| `active_draft_id` | uuid | FK |
| `updated_at` | timestamp with time zone |  |
| `window_expires_at` | timestamp with time zone |  |
| `wa_template_sent_this_week` | integer |  |

#### `agencies`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `name` | text |  |
| `rera_number` | text |  |
| `logo_url` | text |  |
| `is_verified` | boolean |  |
| `subscription_plan` | text |  |
| `created_at` | timestamp with time zone |  |
| `updated_at` | timestamp with time zone |  |

#### `agency_members`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `agency_id` | uuid | FK |
| `user_id` | uuid | FK |
| `role` | text |  |
| `reports_to` | uuid | FK |
| `joined_at` | timestamp with time zone |  |

#### `agency_integrations`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `agency_id` | uuid | FK |
| `type` | text |  |
| `api_key` | text |  |
| `webhook_url` | text |  |
| `config` | jsonb |  |
| `status` | text |  |
| `connected_at` | timestamp with time zone |  |
| `created_at` | timestamp with time zone |  |

### Подписки и платежи

#### `plans`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `name` | text |  |
| `price_aed` | numeric |  |
| `price_usd` | numeric |  |
| `for_agency` | boolean |  |
| `is_active` | boolean |  |
| `created_at` | timestamp with time zone |  |
| `plan_code` | text |  |
| `duration_days` | integer |  |
| `features` | jsonb |  |
| `description` | text |  |

#### `subscriptions`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `agency_id` | uuid | FK |
| `plan` | text |  |
| `status` | text |  |
| `current_period_start` | timestamp with time zone |  |
| `current_period_end` | timestamp with time zone |  |
| `gift_reason` | text |  |
| `gifted_by` | uuid |  |
| `created_at` | timestamp with time zone |  |
| `updated_at` | timestamp with time zone |  |

#### `subscription_gifts`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `granted_by` | uuid | FK |
| `months` | integer |  |
| `reason` | text |  |
| `source` | text |  |
| `ref_id` | uuid | FK |
| `created_at` | timestamp with time zone |  |

#### `user_purchases`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `plan_id` | uuid | FK |
| `amount_paid` | numeric |  |
| `currency` | text |  |
| `payment_method` | text |  |
| `payment_id` | text |  |
| `publications_added` | integer |  |
| `status` | text |  |
| `created_at` | timestamp with time zone |  |

#### `transactions`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `location_bayut_id` | integer |  |
| `location_name` | text |  |
| `amount` | numeric |  |
| `category` | text |  |
| `date` | date |  |
| `property_type` | text |  |
| `beds` | integer |  |
| `builtup_area_sqft` | numeric |  |
| `occupancy_status` | text |  |
| `status` | text |  |
| `created_at` | timestamp with time zone |  |

#### `promotions`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `title` | text |  |
| `promo_text` | text |  |
| `discount_type` | text |  |
| `discount_value` | numeric |  |
| `applies_to` | jsonb |  |
| `eligible_badges` | text[] |  |
| `valid_from` | timestamp with time zone |  |
| `valid_until` | timestamp with time zone |  |
| `is_active` | boolean |  |
| `created_by` | text |  |
| `created_at` | timestamp with time zone |  |

#### `referrals`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `referrer_id` | uuid | FK |
| `referred_id` | uuid | FK |
| `friendship_id` | uuid | FK |
| `status` | text |  |
| `trigger_event` | text |  |
| `created_at` | timestamp with time zone |  |

### Фильтры, поиск, уведомления

#### `saved_filters`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `auto_name` | text |  |
| `filters` | jsonb |  |
| `ai_query_text` | text |  |
| `unseen_count` | integer |  |
| `last_checked_at` | timestamp with time zone |  |
| `deleted_at` | timestamp with time zone |  |
| `created_at` | timestamp with time zone |  |
| `notification_type` | text |  |
| `city_id` | uuid | FK |

#### `filter_matches`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `filter_id` | uuid | FK |
| `property_id` | uuid | FK |
| `match_type` | text |  |
| `notified_at` | timestamp with time zone |  |

#### `search_history`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `query_text` | text |  |
| `parsed_filters` | jsonb |  |
| `results_count` | integer |  |
| `source` | text |  |
| `created_at` | timestamp with time zone |  |

#### `notifications_log`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `type` | text |  |
| `content` | text |  |
| `sent_via` | text |  |
| `is_sent` | boolean |  |
| `error_msg` | text |  |
| `sent_at` | timestamp with time zone |  |
| `created_at` | timestamp with time zone |  |

### Бейджи и активность (вне MVP)

#### `agent_badge` _(вне MVP — не читать из клиента)_

| Колонка | Тип | Ключ |
|---|---|---|
| `user_id` | uuid | PK |
| `badge_level` | text |  |
| `updated_at` | timestamp with time zone |  |

#### `agent_badge_history` _(вне MVP — не читать из клиента)_

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `badge_level` | text |  |
| `month` | date |  |
| `changed_at` | timestamp with time zone |  |
| `change_type` | text |  |

#### `agent_activity` _(вне MVP — не читать из клиента)_

| Колонка | Тип | Ключ |
|---|---|---|
| `user_id` | uuid | PK |
| `score` | integer |  |
| `score_prev_month` | integer |  |
| `score_breakdown` | jsonb |  |
| `recalculated_at` | timestamp with time zone |  |

#### `agent_community_scores` _(вне MVP — не читать из клиента)_

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `location_id` | uuid | FK |
| `week_start` | date |  |
| `listings_count` | integer |  |
| `pocket_listings_count` | integer |  |
| `score` | integer |  |
| `rank` | integer |  |

#### `agent_score_events` _(вне MVP — не читать из клиента)_

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `event_type` | text |  |
| `points` | integer |  |
| `source_id` | uuid |  |
| `created_at` | timestamp with time zone |  |

### AI / прочее

#### `ai_insights`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `insight_type` | text |  |
| `payload` | jsonb |  |
| `priority` | integer |  |
| `scheduled_for` | timestamp with time zone |  |
| `delivered_at` | timestamp with time zone |  |
| `read_at` | timestamp with time zone |  |
| `created_at` | timestamp with time zone |  |

#### `chat_history`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `telegram_id` | bigint |  |
| `whatsapp_phone` | text |  |
| `user_id` | uuid | FK |
| `channel` | text |  |
| `role` | text |  |
| `content` | text |  |
| `created_at` | timestamp with time zone |  |
| `mode` | text |  |

#### `knowledge_base`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `scope` | text |  |
| `owner_id` | uuid |  |
| `owner_type` | text |  |
| `type` | text |  |
| `content_type` | text |  |
| `media_type` | text |  |
| `title` | text |  |
| `content` | text |  |
| `file_url` | text |  |
| `file_mime_type` | text |  |
| `visibility` | text |  |
| `is_embedded` | boolean |  |
| `created_by` | uuid | FK |
| `created_at` | timestamp with time zone |  |
| `updated_at` | timestamp with time zone |  |
| `entity_type` | text |  |
| `entity_id` | uuid |  |
| `location_developer_id` | uuid |  |
| `source` | text |  |
| `language` | text |  |

#### `pdf_generations`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `property_id` | uuid | FK |
| `file_url` | text |  |
| `file_size_kb` | integer |  |
| `template_version` | text |  |
| `status` | text |  |
| `expires_at` | timestamp with time zone |  |
| `download_count` | integer |  |
| `created_at` | timestamp with time zone |  |

#### `schedules`

| Колонка | Тип | Ключ |
|---|---|---|
| `id` | uuid | PK |
| `name` | character varying |  |
| `params` | jsonb |  |
| `cron` | character varying |  |
| `enabled` | boolean |  |
| `last_run` | timestamp with time zone |  |
| `next_run` | timestamp with time zone |  |
| `created_at` | timestamp with time zone |  |

---

## Не выгружено (Вариант 2 — нужен SQL-доступ к `pg_catalog`)

- Тела функций (исходники всех RPC) — `pg_proc.prosrc`.
- Триггеры (на каких таблицах, события, какие функции) — `pg_trigger`.
- RLS-политики — `pg_policies`.
- Enum-значения и CHECK-констрейнты (deal_type, status, listing_type и т.д.).
- Индексы.

