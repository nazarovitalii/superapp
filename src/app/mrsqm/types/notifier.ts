// Контракт ответа RPC get_bell() — realtime отдаёт, фронт только рендерит.
// Поля сверены с brief §1B / прил. B. title бэк НЕ отдаёт (собираем хелпером);
// thumb_url есть, но UI v1 НЕ рендерит.
export type BellMatchType = 'new' | 'price_drop';

export interface BellItem {
  property_id: string;
  filter_id: string;
  match_type: BellMatchType;
  matched_at: string; // ISO-8601
  unseen: boolean; // 🟠 уведомление не просмотрено (bell-курсор)
  price: number | null;
  previous_price: number | null;
  price_currency: string | null;
  deal_type: string | null; // 'sale' | 'rent'
  bedrooms: number | null;
  unit_type_id: string | null;
  location_label: string | null;
  community_label: string | null;
  thumb_url: string | null;
}

export interface BellResponse {
  bell_unseen: number;
  items: BellItem[];
}

// Превью свежего объекта в строке дропдауна (null → fallback «{N} new — tap to view»).
export interface BellRowPreview {
  propertyId: string;
  matchType: BellMatchType;
  title: string; // «2BR Apartment»
  location: string; // location_label/community_label
  priceText: string; // «AED 2,100,000» | «AED 2.1M (was 2.3M)»
}

// Строка дропдауна = один сохранённый фильтр с непросмотренными объектами.
export interface BellRow {
  filterId: string;
  name: string; // SavedFilter.auto_name ?? 'Filter'
  unseenCount: number; // 🏠 объекты (бейдж справа)
  hasUnseenNotification: boolean; // 🟠 любой item фильтра с unseen=true → оранжевая полоса
  freshestMatchedAtMs: number; // для сортировки; 0 если превью нет
  preview: BellRowPreview | null;
}
