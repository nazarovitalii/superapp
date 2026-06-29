import { formatBellPrice } from './bell-price';
import { BellItem } from '../types/notifier';

const base: BellItem = {
  property_id: 'p1',
  filter_id: 'f1',
  match_type: 'new',
  matched_at: '2026-06-29T08:00:00Z',
  unseen: true,
  price: 2100000,
  previous_price: null,
  price_currency: 'AED',
  deal_type: 'sale',
  bedrooms: 2,
  unit_type_id: 'ut1',
  location_label: 'Dubai Marina',
  community_label: null,
  thumb_url: null,
};

describe('formatBellPrice', () => {
  it('new → полная цена с разделителями', () => {
    expect(formatBellPrice(base)).toBe('AED 2,100,000');
  });
  it('price_drop → компактно «(was …)»', () => {
    expect(
      formatBellPrice({
        ...base,
        match_type: 'price_drop',
        price: 2100000,
        previous_price: 2300000,
      }),
    ).toBe('AED 2.1M (was 2.3M)');
  });
  it('price_drop без previous_price → как new', () => {
    expect(
      formatBellPrice({ ...base, match_type: 'price_drop', previous_price: null }),
    ).toBe('AED 2,100,000');
  });
  it('валюта по умолчанию AED, если null', () => {
    expect(formatBellPrice({ ...base, price_currency: null })).toBe('AED 2,100,000');
  });
  it('цена null → пустая строка', () => {
    expect(formatBellPrice({ ...base, price: null })).toBe('');
  });

  it('compact: целые миллионы без дробной части → «2M»', () => {
    expect(
      formatBellPrice({
        ...base,
        match_type: 'price_drop',
        price: 2_000_000,
        previous_price: 2_000_000,
      }),
    ).toBe('AED 2M (was 2M)');
  });

  it('compact: тысячи → «950K»', () => {
    expect(
      formatBellPrice({
        ...base,
        match_type: 'price_drop',
        price: 950_000,
        previous_price: 1_000_000,
      }),
    ).toBe('AED 950K (was 1M)');
  });

  it('price_drop с previous_price === 0 → показывает «(was 0)» (не падает в full)', () => {
    expect(
      formatBellPrice({
        ...base,
        match_type: 'price_drop',
        price: 2_100_000,
        previous_price: 0,
      }),
    ).toBe('AED 2.1M (was 0)');
  });
});
