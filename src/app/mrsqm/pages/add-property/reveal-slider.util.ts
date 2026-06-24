/**
 * Вычисляет индекс уровня из доли позиции указателя по ширине трека.
 * Точки расположены в центрах сегментов: (i+0.5)/n.
 * Зажимает результат в диапазон [minIndex, n-1].
 *
 * @param fraction — позиция [0..1] по ширине трека (может выходить за границы)
 * @param n        — число уровней (длина addrPath)
 * @param minIndex — минимально допустимый индекс (communityIndex)
 */
export const revealIndexFromFraction = (
  fraction: number,
  n: number,
  minIndex: number,
): number => {
  // fraction*n даёт позицию в [0..n]; сдвигаем на -0.5, чтобы получить индекс
  // (точки стоят в центрах сегментов: (i+0.5)/n → обратное преобразование).
  const scaled = fraction * n;
  const idx = Math.round(scaled - 0.5);
  return Math.max(minIndex, Math.min(n - 1, idx));
};
