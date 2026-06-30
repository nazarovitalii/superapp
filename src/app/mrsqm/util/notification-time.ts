// Относительное время строки уведомления: сегодня→HH:mm, вчера→«Вчера», раньше→«D мес».
const MONTHS_RU = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const formatNotificationTime = (iso: string, now: Date = new Date()): string => {
  const d = new Date(iso);
  if (isSameDay(d, now)) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'Вчера';
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
};
