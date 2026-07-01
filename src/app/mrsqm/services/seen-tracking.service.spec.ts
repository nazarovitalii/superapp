import { TestBed } from '@angular/core/testing';
import { SeenTrackingService } from './seen-tracking.service';
import { MrsqmSupabaseService } from './supabase.service';
import { NotifierStoreService } from './notifier-store.service';

describe('SeenTrackingService', () => {
  let service: SeenTrackingService;
  let rpc: jasmine.Spy;
  let refresh: jasmine.Spy;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc').and.resolveTo(undefined);
    refresh = jasmine.createSpy('refresh').and.resolveTo(undefined);
    TestBed.configureTestingModule({
      providers: [
        SeenTrackingService,
        { provide: MrsqmSupabaseService, useValue: { rpc } },
        { provide: NotifierStoreService, useValue: { refresh } },
      ],
    });
    service = TestBed.inject(SeenTrackingService);
  });

  it('markShown шлёт ids в mark_listings_shown', async () => {
    await service.markShown(['a', 'b']);
    expect(rpc).toHaveBeenCalledWith('mark_listings_shown', {
      p_property_ids: ['a', 'b'],
    });
  });

  it('markShown с пустым массивом — no-op', async () => {
    await service.markShown([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('recordView шлёт id в track_view', async () => {
    await service.recordView('x');
    expect(rpc).toHaveBeenCalledWith('track_view', { p_property_id: 'x' });
  });

  it('recordView пересчитывает счётчики (refresh) после track_view (Bug 2)', async () => {
    await service.recordView('x');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('markShown НЕ пересчитывает счётчики сразу — синк на 5с делает лента (Bug 1)', async () => {
    await service.markShown(['a', 'b']);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reconcileCounters дёргает NotifierStore.refresh', () => {
    service.reconcileCounters();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ошибка RPC не пробрасывается наружу', async () => {
    rpc.and.rejectWith(new Error('boom'));
    await expectAsync(service.markShown(['a'])).toBeResolved();
    await expectAsync(service.recordView('x')).toBeResolved();
  });

  it('recordContact шлёт id в mark_listing_contact', async () => {
    await service.recordContact('c1');
    expect(rpc).toHaveBeenCalledWith('mark_listing_contact', { p_property_id: 'c1' });
  });

  it('markFilterSeen шлёт filterId+ids в mark_filter_seen', async () => {
    await service.markFilterSeen('f1', ['a', 'b']);
    expect(rpc).toHaveBeenCalledWith('mark_filter_seen', {
      p_filter_id: 'f1',
      p_property_ids: ['a', 'b'],
    });
  });

  it('markFilterSeen с пустым массивом — no-op', async () => {
    await service.markFilterSeen('f1', []);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('markFilterSeen не пробрасывает ошибку RPC', async () => {
    rpc.and.rejectWith(new Error('boom'));
    await expectAsync(service.markFilterSeen('f1', ['a'])).toBeResolved();
  });
});
