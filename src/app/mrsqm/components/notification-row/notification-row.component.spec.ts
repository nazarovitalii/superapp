import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationRowComponent } from './notification-row.component';
import { NotificationItem } from '../../types/notification';

const item = (over: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 'x',
  type: 'listing_approved',
  created_at: new Date().toISOString(),
  read_at: null,
  entity_id: 'p',
  filter_id: null,
  thumb_url: 'u',
  data: { title: '2BR Marina Gate' },
  source: 'n',
  ...over,
});

describe('NotificationRowComponent', () => {
  let fixture: ComponentFixture<NotificationRowComponent>;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NotificationRowComponent] });
    fixture = TestBed.createComponent(NotificationRowComponent);
  });

  it('рендерит деталь из data и метку непрочитано', () => {
    fixture.componentRef.setInput('item', item());
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('2BR Marina Gate');
    expect(el.querySelector('.is-unread')).toBeTruthy();
  });

  it('read_at!=null → без метки непрочитано', () => {
    fixture.componentRef.setInput('item', item({ read_at: new Date().toISOString() }));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.is-unread')).toBeNull();
  });
});
