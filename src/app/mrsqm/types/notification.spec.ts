import { NOTIFICATION_TYPES, NotificationType } from './notification';

describe('notification types', () => {
  it('содержит ровно 12 типов', () => {
    expect(NOTIFICATION_TYPES.length).toBe(12);
  });
  it('включает оба матч-типа и доменные', () => {
    const t: readonly string[] = NOTIFICATION_TYPES;
    expect(t).toContain('new_listing');
    expect(t).toContain('price_drop');
    expect(t).toContain('friend_request');
    expect(t).toContain('listing_approved');
  });
  it('NotificationType присваивается из списка', () => {
    const x: NotificationType = NOTIFICATION_TYPES[0];
    expect(x).toBeDefined();
  });
});
