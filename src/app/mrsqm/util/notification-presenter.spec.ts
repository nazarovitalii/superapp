import { presentNotification } from './notification-presenter';
import { NotificationItem } from '../types/notification';

const base = (over: Partial<NotificationItem>): NotificationItem => ({
  id: 'x',
  type: 'new_listing',
  created_at: '2026-06-30T10:00:00Z',
  read_at: null,
  entity_id: null,
  filter_id: null,
  thumb_url: null,
  data: {},
  source: 'n',
  ...over,
});

describe('presentNotification', () => {
  it('new_listing — фото + заголовок + деталь из data', () => {
    const vm = presentNotification(
      base({
        type: 'new_listing',
        source: 'm',
        filter_id: 'f1',
        thumb_url: 'u',
        data: {
          bedrooms: 1,
          location_label: 'Damac Hills',
          price: 950000,
          previous_price: null,
          below_op: true,
        },
      }),
    );
    expect(vm.thumbKind).toBe('photo');
    expect(vm.title).toContain('Новый объект');
    expect(vm.detail).toContain('Damac Hills');
    expect(vm.accent).toBe('success');
  });
  it('friend_request — аватар, имя из data', () => {
    const vm = presentNotification(
      base({
        type: 'friend_request',
        thumb_url: 'a',
        data: { name: 'Амина Курамаева' },
      }),
    );
    expect(vm.thumbKind).toBe('avatar');
    expect(vm.title).toContain('Амина Курамаева');
  });
  it('listing_approved — фото + заголовок объекта', () => {
    const vm = presentNotification(
      base({
        type: 'listing_approved',
        thumb_url: 'u',
        data: { title: '2BR Marina Gate' },
      }),
    );
    expect(vm.thumbKind).toBe('photo');
    expect(vm.detail).toContain('2BR Marina Gate');
  });
  it('subscription_expiring — icon-tile (нет фото)', () => {
    const vm = presentNotification(
      base({
        type: 'subscription_expiring',
        data: { expires_at: '2026-07-10T00:00:00Z' },
      }),
    );
    expect(vm.thumbKind).toBe('icon');
    expect(vm.icon).toBe('schedule');
  });
  it('read_at != null → isUnread=false', () => {
    const vm = presentNotification(base({ read_at: '2026-06-30T11:00:00Z' }));
    expect(vm.isUnread).toBe(false);
  });
  it('price_drop — деталь содержит ↓, оба цены, accent=warning', () => {
    const vm = presentNotification(
      base({
        type: 'price_drop',
        thumb_url: 'u',
        data: {
          bedrooms: 2,
          location_label: 'Business Bay',
          price: 1200000,
          previous_price: 1500000,
        },
      }),
    );
    expect(vm.title).toContain('Цена упала');
    expect(vm.detail).toContain('↓');
    expect(vm.detail).toContain('1,200,000');
    expect(vm.detail).toContain('1,500,000');
    expect(vm.accent).toBe('warning');
  });
  it('listing_approved без фото — thumbKind fallback к icon', () => {
    const vm = presentNotification(
      base({
        type: 'listing_approved',
        thumb_url: null,
        data: { title: '2BR Marina Gate' },
      }),
    );
    expect(vm.thumbKind).toBe('icon');
    expect(vm.icon).toBe('check_circle');
  });
});
