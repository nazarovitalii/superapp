// Контракт ленты — realtime/docs/handoff-notifications-feed-superapp.md §3-4.
// Фронт только рендерит; джойнов нет, всё под рендер уже в data.
export type NotificationType =
  | 'new_listing'
  | 'price_drop'
  | 'subscription_expiring'
  | 'friend_request'
  | 'friend_request_accepted'
  | 'ai_digest'
  | 'referral_registered'
  | 'bonus_month_granted'
  | 'listing_approved'
  | 'listing_rejected'
  | 'listing_archived'
  | 'new_comment';

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'new_listing',
  'price_drop',
  'subscription_expiring',
  'friend_request',
  'friend_request_accepted',
  'ai_digest',
  'referral_registered',
  'bonus_month_granted',
  'listing_approved',
  'listing_rejected',
  'listing_archived',
  'new_comment',
];

// Высокочастотные матч-типы — единственный поток, который «топит» остальные (спека §1).
// Единый источник для scope-фильтра «Личные» = всё, КРОМЕ этих.
export const MATCH_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'new_listing',
  'price_drop',
];

// Scope ленты: 'all' — все типы (дефолт), 'personal' — всё, кроме матчей.
export type NotificationScope = 'all' | 'personal';

// source: 'n' = из notifications, 'm' = проекция из filter_matches.
export interface NotificationItem {
  id: string;
  type: NotificationType;
  created_at: string; // ISO-8601
  read_at: string | null;
  entity_id: string | null;
  filter_id: string | null; // заполнен у матч-типов
  thumb_url: string | null;
  data: Record<string, unknown>;
  source: 'n' | 'm';
}

export interface GetNotificationsResponse {
  items: NotificationItem[];
  unread_count: number;
  // Непрочитанные личные (не матч) — всегда, независимо от p_scope. Для индикатора вкладки «Личные».
  personal_unread_count: number;
  next_cursor: string | null;
}
