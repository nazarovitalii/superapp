// Чистая маршрутизация клика по уведомлению → куда вести.
import { NotificationItem, NotificationType } from '../types/notification';

export type NotificationTarget =
  | { kind: 'property'; id: string }
  | { kind: 'friends' }
  | { kind: 'billing' }
  | { kind: 'chat' }
  | { kind: 'none' };

const PROPERTY_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'new_listing',
  'price_drop',
  'listing_approved',
  'listing_rejected',
  'listing_archived',
  'new_comment',
]);
const FRIENDS_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'friend_request',
  'friend_request_accepted',
  'referral_registered',
]);
const BILLING_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'subscription_expiring',
  'bonus_month_granted',
]);

export const notificationTarget = (item: NotificationItem): NotificationTarget => {
  if (PROPERTY_TYPES.has(item.type) && item.entity_id) {
    return { kind: 'property', id: item.entity_id };
  }
  if (FRIENDS_TYPES.has(item.type)) return { kind: 'friends' };
  if (BILLING_TYPES.has(item.type)) return { kind: 'billing' };
  if (item.type === 'ai_digest') return { kind: 'chat' };
  return { kind: 'none' };
};
