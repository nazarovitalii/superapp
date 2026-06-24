import { formatDetailDate, formatFeedDate, formatLongDateRu } from './feed-date.util';

/**
 * Даты строятся через локальный конструктор new Date(Y, M, D, h, m),
 * чтобы локальные геттеры (getFullYear/getMonth/getDate) в util возвращали
 * предсказуемые значения на любой TZ машины/CI.
 * ISO-вход — round-trip: new Date(…local…).toISOString() даёт тот же момент;
 * util разбирает его обратно в локальные компоненты → ассерты стабильны.
 */
describe('formatFeedDate', () => {
  // Фиксированная точка отсчёта: 20 июня 2025, полдень (локальная TZ)
  const now = new Date(2025, 5, 20, 12, 0); // месяц 5 = июнь (0-based)

  it('возвращает "" для null', () => {
    expect(formatFeedDate(null, now)).toBe('');
  });

  it('возвращает "" для undefined', () => {
    expect(formatFeedDate(undefined, now)).toBe('');
  });

  it('возвращает "" для пустой строки', () => {
    expect(formatFeedDate('', now)).toBe('');
  });

  it('возвращает "" для невалидной строки', () => {
    expect(formatFeedDate('not-a-date', now)).toBe('');
  });

  it('возвращает время "08:00" для сегодняшней даты (утро)', () => {
    const iso = new Date(2025, 5, 20, 8, 0).toISOString();
    expect(formatFeedDate(iso, now)).toBe('08:00');
  });

  it('возвращает время "23:59" для сегодняшней даты (конец дня)', () => {
    const iso = new Date(2025, 5, 20, 23, 59).toISOString();
    expect(formatFeedDate(iso, now)).toBe('23:59');
  });

  it('возвращает "Yesterday" для вчерашней даты', () => {
    const iso = new Date(2025, 5, 19, 15, 30).toISOString();
    expect(formatFeedDate(iso, now)).toBe('Yesterday');
  });

  it('возвращает "16 June" для даты того же года, но не сегодня/вчера', () => {
    const iso = new Date(2025, 5, 16, 10, 0).toISOString();
    expect(formatFeedDate(iso, now)).toBe('16 June');
  });

  it('возвращает "1 January" для 1 января того же года', () => {
    const iso = new Date(2025, 0, 1, 0, 0).toISOString();
    expect(formatFeedDate(iso, now)).toBe('1 January');
  });

  it('возвращает "16 June 2024" для даты прошлого года', () => {
    const iso = new Date(2024, 5, 16, 10, 0).toISOString();
    expect(formatFeedDate(iso, now)).toBe('16 June 2024');
  });

  it('возвращает "31 December 2023" для позапрошлого года', () => {
    const iso = new Date(2023, 11, 31, 23, 59).toISOString();
    expect(formatFeedDate(iso, now)).toBe('31 December 2023');
  });

  it('возвращает дату с годом для будущего года (не падает)', () => {
    const iso = new Date(2026, 2, 15, 12, 0).toISOString();
    expect(formatFeedDate(iso, now)).toBe('15 March 2026');
  });

  it('граница нового года: 31 декабря того же года — без года', () => {
    const iso = new Date(2025, 11, 31, 23, 59).toISOString();
    expect(formatFeedDate(iso, now)).toBe('31 December');
  });

  it('граница нового года: 1 января предыдущего — с годом', () => {
    const iso = new Date(2024, 0, 1, 0, 0).toISOString();
    expect(formatFeedDate(iso, now)).toBe('1 January 2024');
  });

  // --- Граничные кейсы локальной логики (UTC-версия проваливала) ---
  // now = 20 июня 2025 01:00 локально; вход 19 июня 23:30 локально → Yesterday
  it('локальная граница суток: поздний вечер предыдущего дня → Yesterday', () => {
    const localNow = new Date(2025, 5, 20, 1, 0);
    const iso = new Date(2025, 5, 19, 23, 30).toISOString();
    expect(formatFeedDate(iso, localNow)).toBe('Yesterday');
  });

  // now = 20 июня 2025 01:00 локально; вход 20 июня 00:30 локально → Today (возвращает время)
  it('локальная граница суток: ранее той же локальной ночи → время (00:30)', () => {
    const localNow = new Date(2025, 5, 20, 1, 0);
    const iso = new Date(2025, 5, 20, 0, 30).toISOString();
    expect(formatFeedDate(iso, localNow)).toBe('00:30');
  });
});

describe('formatDetailDate', () => {
  // Фиксированная точка отсчёта: 20 июня 2025, 15:15 (локальная TZ)
  const now = new Date(2025, 5, 20, 15, 15);

  it('возвращает null для null', () => {
    expect(formatDetailDate(null, now)).toBeNull();
  });

  it('возвращает null для undefined', () => {
    expect(formatDetailDate(undefined, now)).toBeNull();
  });

  it('возвращает null для невалидной строки', () => {
    expect(formatDetailDate('not-a-date', now)).toBeNull();
  });

  it('сегодня → "Today HH:MM"', () => {
    const iso = new Date(2025, 5, 20, 15, 15).toISOString();
    expect(formatDetailDate(iso, now)).toBe('Today 15:15');
  });

  it('сегодня утром → "Today 08:00"', () => {
    const iso = new Date(2025, 5, 20, 8, 0).toISOString();
    expect(formatDetailDate(iso, now)).toBe('Today 08:00');
  });

  it('вчера → "Yesterday"', () => {
    const iso = new Date(2025, 5, 19, 10, 0).toISOString();
    expect(formatDetailDate(iso, now)).toBe('Yesterday');
  });

  it('старая дата (тот же год) → "D MonthLong YY"', () => {
    const iso = new Date(2025, 5, 16, 10, 0).toISOString();
    expect(formatDetailDate(iso, now)).toBe('16 June 25');
  });

  it('прошлый год → "D MonthLong YY"', () => {
    const iso = new Date(2024, 0, 5, 10, 0).toISOString();
    expect(formatDetailDate(iso, now)).toBe('5 January 24');
  });
});

describe('formatLongDateRu', () => {
  it('возвращает "" для null/undefined/невалид', () => {
    expect(formatLongDateRu(null)).toBe('');
    expect(formatLongDateRu(undefined)).toBe('');
    expect(formatLongDateRu('не дата')).toBe('');
  });

  it('форматирует «20 июля 2026» (день + месяц в род. падеже + год)', () => {
    const iso = new Date(2026, 6, 20, 10, 0).toISOString(); // месяц 6 = июль
    expect(formatLongDateRu(iso)).toBe('20 июля 2026');
  });

  it('январь → «5 января 2026»', () => {
    const iso = new Date(2026, 0, 5, 10, 0).toISOString();
    expect(formatLongDateRu(iso)).toBe('5 января 2026');
  });
});
