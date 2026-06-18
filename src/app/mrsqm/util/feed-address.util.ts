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
  const leaf = showPublic
    ? (p.public_location_name ?? p.location_name ?? p.community_name ?? '—')
    : (p.location_name ?? p.community_name ?? '—');

  const community = showPublic
    ? (p.public_community_name ?? null)
    : (p.community_name ?? null);

  // Вторую строку не показываем, если она совпадает с leaf или пустая
  return { leaf, community: community && community !== leaf ? community : null };
};
