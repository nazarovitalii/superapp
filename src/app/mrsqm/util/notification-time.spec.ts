import { formatNotificationTime } from './notification-time';

describe('formatNotificationTime', () => {
  const now = new Date('2026-06-30T15:00:00');
  it('сегодня → HH:mm', () => {
    expect(formatNotificationTime('2026-06-30T14:32:00', now)).toBe('14:32');
  });
  it('вчера → Вчера', () => {
    expect(formatNotificationTime('2026-06-29T09:10:00', now)).toBe('Вчера');
  });
  it('раньше → день и короткий месяц', () => {
    expect(formatNotificationTime('2026-06-12T09:10:00', now)).toBe('12 июн');
  });
});
