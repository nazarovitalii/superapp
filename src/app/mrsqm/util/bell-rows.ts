import { BellItem, BellRow } from '../types/notifier';
import { SavedFilter } from '../services/feed-filter.service';
import { formatBellPrice } from './bell-price';

// Чистая сборка строк дропдауна (spec §5, brief §2B(1)).
// Гейт: только фильтры с unseen_count>0. Превью: свежайший item фильтра из head get_bell;
// нет → null (template покажет fallback «{N} new — tap to view»). Полоса: любой item.unseen.
// Сортировка: по свежему matched_at desc; строки без превью — в конце.
export const buildBellRows = (
  filters: SavedFilter[],
  items: BellItem[],
  getTitle: (item: BellItem) => string,
): BellRow[] => {
  const byFilter = new Map<string, BellItem[]>();
  for (const it of items) {
    const arr = byFilter.get(it.filter_id);
    if (arr) arr.push(it);
    else byFilter.set(it.filter_id, [it]);
  }

  const rows: BellRow[] = [];
  for (const f of filters) {
    if (!(f.unseen_count > 0)) continue;
    const fItems = byFilter.get(f.id) ?? [];
    const freshest = fItems.reduce<BellItem | null>(
      (best, it) =>
        !best || Date.parse(it.matched_at) > Date.parse(best.matched_at) ? it : best,
      null,
    );
    rows.push({
      filterId: f.id,
      name: f.auto_name && f.auto_name.trim() ? f.auto_name : 'Filter',
      unseenCount: f.unseen_count,
      hasUnseenNotification: fItems.some((it) => it.unseen),
      freshestMatchedAtMs: freshest ? Date.parse(freshest.matched_at) : 0,
      preview: freshest
        ? {
            propertyId: freshest.property_id,
            matchType: freshest.match_type,
            title: getTitle(freshest),
            location: freshest.location_label ?? freshest.community_label ?? '',
            priceText: formatBellPrice(freshest),
          }
        : null,
    });
  }

  return rows.sort((a, b) => b.freshestMatchedAtMs - a.freshestMatchedAtMs);
};
