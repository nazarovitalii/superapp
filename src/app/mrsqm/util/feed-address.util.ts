import { PropertyFeedItem } from '../types/database';

/**
 * Резолвит отображаемый адрес карточки в ленте с учётом охвата.
 * showPublic=false → полный адрес (My Inventory); showPublic=true → публичный (остальные охваты).
 * Чистая функция без побочных эффектов — безопасна для computed-сигнала (hot-path).
 */
export const resolveFeedAddress = (
  p: Pick<
    PropertyFeedItem,
    'location_name' | 'community_name' | 'public_location_name' | 'public_community_name'
  >,
  showPublic: boolean,
): { leaf: string; community: string | null } => {
  // В публичном режиме НЕ используем location_name — это полный (приватный) адрес.
  // Сервер (get_feed) всегда возвращает public_location_name при наличии объекта,
  // поэтому fallback на location_name здесь был бы нарушением приватности (V-10).
  const leaf = showPublic
    ? (p.public_location_name ?? p.community_name ?? '—')
    : (p.location_name ?? p.community_name ?? '—');

  // В публичном режиме community берём только из public_community_name (намеренная асимметрия):
  // community_name может совпадать с приватным location_name или раскрывать точный адрес.
  const community = showPublic
    ? (p.public_community_name ?? null)
    : (p.community_name ?? null);

  // Вторую строку не показываем, если она совпадает с leaf или пустая
  return { leaf, community: community && community !== leaf ? community : null };
};
