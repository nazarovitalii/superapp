import { buildBellRows } from './bell-rows';
import { BellItem } from '../types/notifier';
import { SavedFilter } from '../services/feed-filter.service';

const filter = (id: string, name: string, unseen_count: number): SavedFilter => ({
  id,
  auto_name: name,
  unseen_count,
  filters: {} as SavedFilter['filters'],
  notification_type: null,
  created_at: '2026-01-01',
});
const item = (filter_id: string, matched_at: string, unseen: boolean): BellItem => ({
  property_id: 'p-' + matched_at,
  filter_id,
  match_type: 'new',
  matched_at,
  unseen,
  price: 2100000,
  previous_price: null,
  price_currency: 'AED',
  deal_type: 'sale',
  bedrooms: 2,
  unit_type_id: 'ut1',
  location_label: 'Marina',
  community_label: null,
  thumb_url: null,
});
const title = (): string => '2BR Apartment';

describe('buildBellRows', () => {
  it('гейт: фильтры с unseen_count=0 не попадают в строки', () => {
    const rows = buildBellRows([filter('f1', 'A', 0), filter('f2', 'B', 3)], [], title);
    expect(rows.map((r) => r.filterId)).toEqual(['f2']);
  });

  it('превью = свежайший item фильтра (max matched_at)', () => {
    const rows = buildBellRows(
      [filter('f1', 'A', 2)],
      [
        item('f1', '2026-06-29T07:00:00Z', false),
        item('f1', '2026-06-29T09:00:00Z', true),
      ],
      title,
    );
    expect(rows[0].preview?.propertyId).toBe('p-2026-06-29T09:00:00Z');
    expect(rows[0].preview?.title).toBe('2BR Apartment');
    expect(rows[0].preview?.priceText).toBe('AED 2,100,000');
  });

  it('hasUnseenNotification = любой item фильтра с unseen=true', () => {
    const rows = buildBellRows(
      [filter('f1', 'A', 2), filter('f2', 'B', 2)],
      [
        item('f1', '2026-06-29T07:00:00Z', false),
        item('f2', '2026-06-29T08:00:00Z', true),
      ],
      title,
    );
    expect(rows.find((r) => r.filterId === 'f1')?.hasUnseenNotification).toBe(false);
    expect(rows.find((r) => r.filterId === 'f2')?.hasUnseenNotification).toBe(true);
  });

  it('бэклог без item в head → preview=null (fallback)', () => {
    const rows = buildBellRows([filter('f1', 'A', 5)], [], title);
    expect(rows[0].preview).toBeNull();
    expect(rows[0].unseenCount).toBe(5);
  });

  it('сортировка по свежему matched_at desc; строки без превью в конце', () => {
    const rows = buildBellRows(
      [filter('f1', 'A', 1), filter('f2', 'B', 1), filter('f3', 'C', 1)],
      [
        item('f1', '2026-06-29T07:00:00Z', true),
        item('f2', '2026-06-29T09:00:00Z', true),
      ],
      title,
    );
    expect(rows.map((r) => r.filterId)).toEqual(['f2', 'f1', 'f3']);
  });

  it('имя = auto_name ?? «Filter»', () => {
    const rows = buildBellRows([{ ...filter('f1', '', 1), auto_name: null }], [], title);
    expect(rows[0].name).toBe('Filter');
  });
});
