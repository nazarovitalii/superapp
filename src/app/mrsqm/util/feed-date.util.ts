/**
 * Форматирует дату строки ленты недвижимости в читаемый вид.
 * HH:MM (сегодня) / Yesterday / «16 June» / «16 June 2025» (если прошлый год).
 * Используется через computed-сигнал в property-card (hot-path — не вызывать напрямую в шаблоне).
 *
 * Сравнение Today/Yesterday ведётся по ЛОКАЛЬНОЙ таймзоне браузера (граница суток на устройстве).
 */

/** Форматирует часы и минуты как HH:MM (zero-padded, локальная TZ). */
const _fmtHHMM = (date: Date): string => {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

export const formatFeedDate = (
  iso: string | null | undefined,
  now: Date = new Date(),
): string => {
  if (!iso) return '';

  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';

  // Сравниваем по локальным компонентам даты (TZ пользователя, не UTC)
  const dateYear = date.getFullYear();
  const dateMonth = date.getMonth();
  const dateDay = date.getDate();

  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowDay = now.getDate();

  const isSameDay = dateYear === nowYear && dateMonth === nowMonth && dateDay === nowDay;
  // Сегодня — показываем время в формате HH:MM
  if (isSameDay) return _fmtHHMM(date);

  // Вчера: отматываем now на 1 локальный день
  const yesterday = new Date(nowYear, nowMonth, nowDay - 1);
  const isYesterday =
    dateYear === yesterday.getFullYear() &&
    dateMonth === yesterday.getMonth() &&
    dateDay === yesterday.getDate();
  if (isYesterday) return 'Yesterday';

  // Полное название месяца (английское) — в локальной TZ браузера (без timeZone:'UTC')
  const monthName = new Intl.DateTimeFormat('en-US', {
    month: 'long',
  }).format(date);

  if (dateYear === nowYear) {
    // Тот же год — без года: «16 June»
    return `${dateDay} ${monthName}`;
  }

  // Другой год — с годом: «16 June 2024»
  return `${dateDay} ${monthName} ${dateYear}`;
};

/**
 * Форматирует дату для блока Created/Updated в правой панели.
 * Сегодня → «Today HH:MM», вчера → «Yesterday», остальное → «D MonthLong YY».
 * null/undefined/невалид → null.
 */
export const formatDetailDate = (
  iso: string | null | undefined,
  now: Date = new Date(),
): string | null => {
  if (!iso) return null;

  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;

  const dateYear = date.getFullYear();
  const dateMonth = date.getMonth();
  const dateDay = date.getDate();

  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowDay = now.getDate();

  const isSameDay = dateYear === nowYear && dateMonth === nowMonth && dateDay === nowDay;
  if (isSameDay) return `Today ${_fmtHHMM(date)}`;

  const yesterday = new Date(nowYear, nowMonth, nowDay - 1);
  const isYesterday =
    dateYear === yesterday.getFullYear() &&
    dateMonth === yesterday.getMonth() &&
    dateDay === yesterday.getDate();
  if (isYesterday) return 'Yesterday';

  // D MonthLong YY (2-значный год)
  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
  const shortYear = String(dateYear).slice(-2);
  return `${dateDay} ${monthName} ${shortYear}`;
};

// Месяцы в родительном падеже (для «20 июля 2026»).
const _MONTHS_RU_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/**
 * Длинная дата на русском: «20 июля 2026» (для шапки статуса «Активно до …»).
 * null/undefined/невалид → ''.
 */
export const formatLongDateRu = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  return `${date.getDate()} ${_MONTHS_RU_GEN[date.getMonth()]} ${date.getFullYear()}`;
};
