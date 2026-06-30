// Чистый презентер: NotificationItem → view-model строки (заголовок/деталь/thumb/иконка/акцент).
// Схема data по типу — realtime контракт §5. Имя фильтра в строку НЕ кладём (берём из get_saved_filters).
import { NotificationItem, NotificationType } from '../types/notification';

export type ThumbKind = 'photo' | 'avatar' | 'icon';

export interface NotificationRowVM {
  title: string;
  detail: string;
  thumbKind: ThumbKind;
  thumbUrl: string | null;
  icon: string;
  accent: 'success' | 'warning' | 'primary' | 'muted';
  isUnread: boolean;
}

const str = (d: Record<string, unknown>, k: string): string =>
  typeof d[k] === 'string' ? (d[k] as string) : '';
const num = (d: Record<string, unknown>, k: string): number | null =>
  typeof d[k] === 'number' ? (d[k] as number) : null;

interface TypeMeta {
  thumbKind: ThumbKind;
  icon: string;
  accent: NotificationRowVM['accent'];
  title: (d: Record<string, unknown>) => string;
  detail: (d: Record<string, unknown>) => string;
}

const fmtMoney = (n: number | null): string =>
  n == null ? '' : n.toLocaleString('en-US');

const matchDetail = (d: Record<string, unknown>): string => {
  const br = num(d, 'bedrooms');
  const loc = str(d, 'location_label');
  const price = num(d, 'price');
  const prev = num(d, 'previous_price');
  const parts = [br != null ? `${br}br` : '', loc, fmtMoney(price)].filter((p) => p);
  let line = parts.join(' · ');
  if (prev != null) line += ` ↓ ${fmtMoney(prev)}`;
  return line;
};

const META: Record<NotificationType, TypeMeta> = {
  new_listing: {
    thumbKind: 'photo',
    icon: 'home',
    accent: 'success',
    title: () => 'New listing · below OP',
    detail: matchDetail,
  },
  price_drop: {
    thumbKind: 'photo',
    icon: 'trending_down',
    accent: 'warning',
    title: () => 'Price dropped · below OP',
    detail: matchDetail,
  },
  subscription_expiring: {
    thumbKind: 'icon',
    icon: 'schedule',
    accent: 'warning',
    title: () => 'Subscription ending',
    detail: (d) => str(d, 'expires_at'),
  },
  friend_request: {
    thumbKind: 'avatar',
    icon: 'person_add',
    accent: 'primary',
    title: (d) => `${str(d, 'name')} — запрос в друзья`,
    detail: () => 'Tap to review',
  },
  friend_request_accepted: {
    thumbKind: 'avatar',
    icon: 'how_to_reg',
    accent: 'success',
    title: (d) => `${str(d, 'name')} принял(а) запрос`,
    detail: () => '',
  },
  ai_digest: {
    thumbKind: 'icon',
    icon: 'smart_toy',
    accent: 'primary',
    title: () => 'AI digest',
    detail: (d) => str(d, 'summary'),
  },
  referral_registered: {
    thumbKind: 'avatar',
    icon: 'group_add',
    accent: 'success',
    title: (d) => `${str(d, 'name')} signed up`,
    detail: () => '',
  },
  bonus_month_granted: {
    thumbKind: 'icon',
    icon: 'card_giftcard',
    accent: 'success',
    title: () => 'Bonus month added',
    detail: (d) => `+${num(d, 'months') ?? 1} месяц подписки`,
  },
  listing_approved: {
    thumbKind: 'photo',
    icon: 'check_circle',
    accent: 'success',
    title: () => 'Listing published',
    detail: (d) => str(d, 'title'),
  },
  listing_rejected: {
    thumbKind: 'photo',
    icon: 'cancel',
    accent: 'warning',
    title: () => 'Listing rejected',
    detail: (d) => str(d, 'reason'),
  },
  listing_archived: {
    thumbKind: 'photo',
    icon: 'inventory_2',
    accent: 'muted',
    title: () => 'Listing archived',
    detail: (d) => str(d, 'title'),
  },
  new_comment: {
    thumbKind: 'photo',
    icon: 'chat_bubble',
    accent: 'primary',
    title: () => 'New comment',
    detail: (d) => str(d, 'comment_text'),
  },
};

export const presentNotification = (item: NotificationItem): NotificationRowVM => {
  const m = META[item.type];
  return {
    title: m.title(item.data),
    detail: m.detail(item.data),
    thumbKind: item.thumb_url
      ? m.thumbKind
      : m.thumbKind === 'photo' || m.thumbKind === 'avatar'
        ? 'icon'
        : m.thumbKind,
    thumbUrl: item.thumb_url,
    icon: m.icon,
    accent: m.accent,
    isUnread: item.read_at == null,
  };
};
