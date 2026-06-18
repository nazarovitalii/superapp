import { formatFeedDate } from './feed-date.util';

describe('formatFeedDate', () => {
  // Фиксированная точка отсчёта: 20 июня 2025, полдень по UTC
  const now = new Date('2025-06-20T12:00:00Z');

  it('возвращает "" для null', () => {
    expect(formatFeedDate(null, now)).toBe('');
  });

  it('возвращает "" для undefined', () => {
    expect(formatFeedDate(undefined, now)).toBe('');
  });

  it('возвращает "" для пустой строки', () => {
    expect(formatFeedDate('', now)).toBe('');
  });

  it('возвращает "Today" для сегодняшней даты', () => {
    expect(formatFeedDate('2025-06-20T08:00:00Z', now)).toBe('Today');
  });

  it('возвращает "Today" для сегодняшней даты (конец дня)', () => {
    expect(formatFeedDate('2025-06-20T23:59:59Z', now)).toBe('Today');
  });

  it('возвращает "Yesterday" для вчерашней даты', () => {
    expect(formatFeedDate('2025-06-19T15:30:00Z', now)).toBe('Yesterday');
  });

  it('возвращает "16 June" для даты того же года, но не сегодня/вчера', () => {
    expect(formatFeedDate('2025-06-16T10:00:00Z', now)).toBe('16 June');
  });

  it('возвращает "1 January" для 1 января того же года', () => {
    expect(formatFeedDate('2025-01-01T00:00:00Z', now)).toBe('1 January');
  });

  it('возвращает "16 June 2024" для даты прошлого года', () => {
    expect(formatFeedDate('2024-06-16T10:00:00Z', now)).toBe('16 June 2024');
  });

  it('возвращает "31 December 2023" для позапрошлого года', () => {
    expect(formatFeedDate('2023-12-31T23:59:00Z', now)).toBe('31 December 2023');
  });

  it('возвращает дату с годом для будущего года (не падает)', () => {
    expect(formatFeedDate('2026-03-15T12:00:00Z', now)).toBe('15 March 2026');
  });

  it('граница нового года: 31 декабря того же года — без года', () => {
    expect(formatFeedDate('2025-12-31T23:59:59Z', now)).toBe('31 December');
  });

  it('граница нового года: 1 января предыдущего — с годом', () => {
    expect(formatFeedDate('2024-01-01T00:00:00Z', now)).toBe('1 January 2024');
  });
});
