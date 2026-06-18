/**
 * Форматирует дату строки ленты недвижимости в читаемый вид.
 * Today / Yesterday / «16 June» / «16 June 2025» (если прошлый год).
 * Используется через computed-сигнал в property-card (hot-path — не вызывать напрямую в шаблоне).
 */
export const formatFeedDate = (
  iso: string | null | undefined,
  now: Date = new Date(),
): string => {
  if (!iso) return '';

  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';

  // Сравниваем по календарным датам в UTC (ISO-строки хранятся в UTC)
  const dateYear = date.getUTCFullYear();
  const dateMonth = date.getUTCMonth();
  const dateDay = date.getUTCDate();

  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth();
  const nowDay = now.getUTCDate();

  const isSameDay = dateYear === nowYear && dateMonth === nowMonth && dateDay === nowDay;
  if (isSameDay) return 'Today';

  // Вчера: отматываем now на 1 UTC-день
  const yesterday = new Date(Date.UTC(nowYear, nowMonth, nowDay - 1));
  const isYesterday =
    dateYear === yesterday.getUTCFullYear() &&
    dateMonth === yesterday.getUTCMonth() &&
    dateDay === yesterday.getUTCDate();
  if (isYesterday) return 'Yesterday';

  // Полное название месяца (английское) — по UTC-месяцу
  const monthName = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: 'UTC',
  }).format(date);

  if (dateYear === nowYear) {
    // Тот же год — без года: «16 June»
    return `${dateDay} ${monthName}`;
  }

  // Другой год — с годом: «16 June 2024»
  return `${dateDay} ${monthName} ${dateYear}`;
};
