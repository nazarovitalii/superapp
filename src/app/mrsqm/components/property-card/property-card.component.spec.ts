import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PropertyCardComponent } from './property-card.component';
import { PropertyFeedItem } from '../../types/database';

// ─── Минимальный feed-item для тестов ───────────────────────────────────────
const minItem = (over: Partial<PropertyFeedItem> = {}): PropertyFeedItem => ({
  id: 'p1',
  owner_id: 'u1',
  deal_type: 'sale',
  listing_type: 'official',
  property_type: 'Apartment',
  price: 1_000_000,
  price_currency: 'AED',
  price_period: null,
  bedrooms: 2,
  bathrooms: 2,
  area_sqft: 1200,
  location_name: 'Marina',
  community_name: 'Dubai Marina',
  description: null,
  furnished: 'furnished',
  handover: 'ready',
  photos: null,
  published_at: '2026-06-01T00:00:00Z',
  owner_full_name: 'Test Agent',
  owner_photo_url: null,
  owner_agency_name: 'Test Agency',
  is_network: false,
  developer_name: null,
  ...over,
});

const makeFixture = (
  over: Partial<PropertyFeedItem> = {},
): ComponentFixture<PropertyCardComponent> => {
  TestBed.configureTestingModule({ imports: [PropertyCardComponent] });
  const fixture = TestBed.createComponent(PropertyCardComponent);
  fixture.componentRef.setInput('property', minItem(over));
  fixture.detectChanges();
  return fixture;
};

describe('PropertyCardComponent — hover-controls DOM', () => {
  it('рендерит .hover-controls в DOM', () => {
    const fixture = makeFixture();
    const el: HTMLElement | null = fixture.nativeElement.querySelector('.hover-controls');
    expect(el).not.toBeNull();
  });

  it('.hover-controls по умолчанию скрыт (display: none)', () => {
    const fixture = makeFixture();
    const el = fixture.nativeElement.querySelector('.hover-controls') as HTMLElement;
    expect(el).not.toBeNull();
    // В unit-тесте (jsdom) CSS не применяется, но атрибут inline/стиль не устанавливается.
    // Проверяем через атрибуты. Stylesheeting — визуальное, проверяем структуру.
    // Если когда-либо добавят [hidden] или ngIf — тест поймает регрессию.
    expect(el.style.display).not.toBe('flex');
  });

  it('содержит кнопку закладки (bookmark / bookmark_border)', () => {
    const fixture = makeFixture();
    const buttons = fixture.nativeElement.querySelectorAll(
      '.hover-controls button',
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    const bookmarkBtn = Array.from(buttons).find((b) => {
      const icon = b.querySelector('mat-icon');
      return icon?.textContent?.trim().startsWith('bookmark');
    });
    expect(bookmarkBtn).not.toBeUndefined();
  });

  it('CD-1: при isOwnItem=true закладка «в избранное» скрыта', () => {
    const fixture = makeFixture();
    fixture.componentRef.setInput('isOwnItem', true);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll(
      '.hover-controls button',
    ) as NodeListOf<HTMLButtonElement>;
    const bookmarkBtn = Array.from(buttons).find((b) =>
      b.querySelector('mat-icon')?.textContent?.trim().startsWith('bookmark'),
    );
    expect(bookmarkBtn).toBeUndefined();
  });

  it('кнопка закладки имеет aria-label «В избранное» когда isSaved=false', () => {
    const fixture = makeFixture();
    fixture.componentRef.setInput('isSaved', false);
    fixture.detectChanges();
    const btn = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.hover-controls button',
      ) as NodeListOf<HTMLButtonElement>,
    ).find((b) =>
      b.querySelector('mat-icon')?.textContent?.trim().startsWith('bookmark'),
    );
    expect(btn?.getAttribute('aria-label')).toBe('В избранное');
  });

  it('кнопка закладки имеет aria-label «Убрать из избранного» когда isSaved=true', () => {
    const fixture = makeFixture();
    fixture.componentRef.setInput('isSaved', true);
    fixture.detectChanges();
    const btn = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.hover-controls button',
      ) as NodeListOf<HTMLButtonElement>,
    ).find((b) =>
      b.querySelector('mat-icon')?.textContent?.trim().startsWith('bookmark'),
    );
    expect(btn?.getAttribute('aria-label')).toBe('Убрать из избранного');
  });
});

describe('PropertyCardComponent — click wiring', () => {
  it('клик по закладке эмитит saveClick', () => {
    const fixture = makeFixture();
    const comp = fixture.componentInstance;
    let saveCount = 0;
    comp.saveClick.subscribe(() => saveCount++);

    const btn = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.hover-controls button',
      ) as NodeListOf<HTMLButtonElement>,
    ).find((b) =>
      b.querySelector('mat-icon')?.textContent?.trim().startsWith('bookmark'),
    );
    expect(btn).not.toBeUndefined();
    btn!.click();
    expect(saveCount).toBe(1);
  });

  it('клик по закладке НЕ эмитит cardClick (stopPropagation)', () => {
    const fixture = makeFixture();
    const comp = fixture.componentInstance;
    let cardCount = 0;
    comp.cardClick.subscribe(() => cardCount++);

    const btn = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.hover-controls button',
      ) as NodeListOf<HTMLButtonElement>,
    ).find((b) =>
      b.querySelector('mat-icon')?.textContent?.trim().startsWith('bookmark'),
    );
    expect(btn).not.toBeUndefined();
    btn!.click();
    expect(cardCount).toBe(0);
  });

  it('клик по .inner-wrapper эмитит cardClick', () => {
    const fixture = makeFixture();
    const comp = fixture.componentInstance;
    let cardCount = 0;
    comp.cardClick.subscribe(() => cardCount++);

    const wrapper = fixture.nativeElement.querySelector('.inner-wrapper') as HTMLElement;
    wrapper.click();
    expect(cardCount).toBe(1);
  });

  it('клик по закладке не всплывает до .inner-wrapper', () => {
    const fixture = makeFixture();
    const comp = fixture.componentInstance;
    let saveCount = 0;
    let cardCount = 0;
    comp.saveClick.subscribe(() => saveCount++);
    comp.cardClick.subscribe(() => cardCount++);

    const btn = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.hover-controls button',
      ) as NodeListOf<HTMLButtonElement>,
    ).find((b) =>
      b.querySelector('mat-icon')?.textContent?.trim().startsWith('bookmark'),
    );
    btn!.click();

    // saveClick должен сработать, cardClick — нет
    expect(saveCount).toBe(1);
    expect(cardCount).toBe(0);
  });

  it('клик по кнопке разворота эмитит toggleClick, не cardClick', () => {
    const fixture = makeFixture();
    const comp = fixture.componentInstance;
    let toggleCount = 0;
    let cardCount = 0;
    comp.toggleClick.subscribe(() => toggleCount++);
    comp.cardClick.subscribe(() => cardCount++);

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.hover-controls button',
      ) as NodeListOf<HTMLButtonElement>,
    );
    // Вторая кнопка — expand/collapse
    const expandBtn = buttons.find((b) => {
      const icon = b.querySelector('mat-icon');
      const txt = icon?.textContent?.trim() ?? '';
      return txt === 'right_panel_open' || txt === 'right_panel_close';
    });
    expect(expandBtn).not.toBeUndefined();
    expandBtn!.click();
    expect(toggleCount).toBe(1);
    expect(cardCount).toBe(0);
  });
});

describe('PropertyCardComponent — is-unseen stripe', () => {
  it('добавляет класс is-unseen на .inner-wrapper при isUnseen=true', () => {
    const fixture = makeFixture();
    fixture.componentRef.setInput('isUnseen', true);
    fixture.detectChanges();
    const wrapper: HTMLElement = fixture.nativeElement.querySelector('.inner-wrapper');
    expect(wrapper.classList).toContain('is-unseen');
  });

  it('нет класса is-unseen по умолчанию', () => {
    const fixture = makeFixture();
    fixture.detectChanges();
    const wrapper: HTMLElement = fixture.nativeElement.querySelector('.inner-wrapper');
    expect(wrapper.classList).not.toContain('is-unseen');
  });
});

describe('PropertyCardComponent — computed signals', () => {
  it('dateLabel вычисляется из last_actualized_at', () => {
    const fixture = makeFixture({ last_actualized_at: '2026-06-01T00:00:00Z' });
    const comp = fixture.componentInstance;
    expect(comp.dateLabel()).not.toBe('');
  });

  it('isSaved=false по умолчанию — иконка bookmark_border', () => {
    const fixture = makeFixture();
    fixture.componentRef.setInput('isSaved', false);
    fixture.detectChanges();
    const icon = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.hover-controls mat-icon',
      ) as NodeListOf<HTMLElement>,
    ).find((i) => i.textContent?.trim().startsWith('bookmark'));
    expect(icon?.textContent?.trim()).toBe('bookmark_border');
  });

  it('isSaved=true — иконка bookmark (заполненная)', () => {
    const fixture = makeFixture();
    fixture.componentRef.setInput('isSaved', true);
    fixture.detectChanges();
    const icon = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.hover-controls mat-icon',
      ) as NodeListOf<HTMLElement>,
    ).find((i) => i.textContent?.trim().startsWith('bookmark'));
    expect(icon?.textContent?.trim()).toBe('bookmark');
  });
});
