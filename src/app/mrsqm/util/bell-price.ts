import { BellItem } from '../types/notifier';

// Компактная сумма: 2_100_000 → «2.1M», 950_000 → «950K», 2_000_000 → «2M».
const compact = (n: number): string => {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return String(n);
};

// Цена строки дропдауна. new → полная «AED 2,100,000»;
// price_drop с previous → «AED 2.1M (was 2.3M)» (brief §2B(1)).
export const formatBellPrice = (item: BellItem): string => {
  if (item.price === null || item.price === undefined) {
    return '';
  }
  const cur = item.price_currency ?? 'AED';
  if (item.match_type === 'price_drop' && item.previous_price) {
    return `${cur} ${compact(item.price)} (was ${compact(item.previous_price)})`;
  }
  return `${cur} ${item.price.toLocaleString('en-US')}`;
};
