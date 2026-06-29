// Сборка заголовка объекта для колокольчика: «{bedrooms}BR {тип}».
// title бэк НЕ отдаёт (brief §1B). 0 спален = Studio.
export const buildPropertyTitle = (
  bedrooms: number | null,
  typeLabel: string | null,
): string => {
  const bedPart =
    bedrooms === null || bedrooms === undefined
      ? ''
      : bedrooms === 0
        ? 'Studio'
        : `${bedrooms}BR`;
  const parts = [bedPart, (typeLabel ?? '').trim()].filter((p) => p.length > 0);
  return parts.join(' ');
};
