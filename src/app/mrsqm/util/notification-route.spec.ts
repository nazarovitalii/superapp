import { notificationTarget } from './notification-route';
import { NotificationItem } from '../types/notification';

const it_ = (
  type: NotificationItem['type'],
  entity_id: string | null = 'e',
): NotificationItem => ({
  id: 'x',
  type,
  created_at: 'x',
  read_at: null,
  entity_id,
  filter_id: null,
  thumb_url: null,
  data: {},
  source: 'n',
});

describe('notificationTarget', () => {
  it('new_listing → property с entity_id', () => {
    expect(notificationTarget(it_('new_listing', 'p1'))).toEqual({
      kind: 'property',
      id: 'p1',
    });
  });
  it('friend_request → friends', () => {
    expect(notificationTarget(it_('friend_request')).kind).toBe('friends');
  });
  it('subscription_expiring → billing', () => {
    expect(notificationTarget(it_('subscription_expiring', null)).kind).toBe('billing');
  });
  it('ai_digest → chat', () => {
    expect(notificationTarget(it_('ai_digest', null)).kind).toBe('chat');
  });
});
