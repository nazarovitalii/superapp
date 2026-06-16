import { TestBed } from '@angular/core/testing';
import { PropertyGalleryLightboxComponent } from './property-gallery-lightbox.component';
import { PropertyPhoto } from '../../types/database';

const photo = (n: number): PropertyPhoto => ({
  full_url: `f${n}.webp`,
  thumb_url: `t${n}.webp`,
  order_index: n,
  photo_type: 'gallery',
});

const make = (photos: PropertyPhoto[], start = 0): PropertyGalleryLightboxComponent => {
  TestBed.configureTestingModule({ imports: [PropertyGalleryLightboxComponent] });
  const fixture = TestBed.createComponent(PropertyGalleryLightboxComponent);
  fixture.componentRef.setInput('photos', photos);
  fixture.componentRef.setInput('startIndex', start);
  const comp = fixture.componentInstance;
  comp.ngOnInit();
  return comp;
};

describe('PropertyGalleryLightboxComponent', () => {
  it('стартует с переданного индекса', () => {
    const c = make([photo(0), photo(1), photo(2)], 2);
    expect(c.index()).toBe(2);
    expect(c.current()?.full_url).toBe('f2.webp');
  });

  it('next/prev листают по кругу', () => {
    const c = make([photo(0), photo(1)], 0);
    c.next();
    expect(c.index()).toBe(1);
    c.next();
    expect(c.index()).toBe(0);
    c.prev();
    expect(c.index()).toBe(1);
  });

  it('go устанавливает индекс', () => {
    const c = make([photo(0), photo(1), photo(2)], 0);
    c.go(2);
    expect(c.index()).toBe(2);
  });

  it('одно фото — next/prev не двигают', () => {
    const c = make([photo(0)], 0);
    c.next();
    c.prev();
    expect(c.index()).toBe(0);
  });

  it('клавиши ←/→ листают, Esc закрывает', () => {
    const c = make([photo(0), photo(1)], 0);
    let closed = false;
    c.closed.subscribe(() => (closed = true));
    c.onKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(c.index()).toBe(1);
    c.onKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(c.index()).toBe(0);
    c.onKey(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(true);
  });

  it('close эмитит closed', () => {
    const c = make([photo(0)], 0);
    let closed = false;
    c.closed.subscribe(() => (closed = true));
    c.close();
    expect(closed).toBe(true);
  });
});
