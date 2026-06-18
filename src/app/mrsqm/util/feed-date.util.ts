/**
 * Форматирует дату строки ленты недвижимости в читаемый вид.
 * Today / Yesterday / «16 June» / «16 June 2025» (если прошлый год).
 * Используется через computed-сигнал в property-card (hot-path — не вызывать напрямую в шаблоне).
 *
 * Сравнение Today/Yesterday ведётся по ЛОКАЛЬНОЙ таймзоне браузера (граница суток на устройстве).
 */
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
  if (isSameDay) return 'Today';

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
