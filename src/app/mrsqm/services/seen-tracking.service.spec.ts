import { TestBed } from '@angular/core/testing';
import { SeenTrackingService } from './seen-tracking.service';
import { MrsqmSupabaseService } from './supabase.service';

describe('SeenTrackingService', () => {
  let service: SeenTrackingService;
  let rpc: jasmine.Spy;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc').and.resolveTo(undefined);
    TestBed.configureTestingModule({
      providers: [
        SeenTrackingService,
        { provide: MrsqmSupabaseService, useValue: { rpc } },
      ],
    });
    service = TestBed.inject(SeenTrackingService);
  });

  it('markShown шлёт ids в mark_listings_shown', async () => {
    await service.markShown(['a', 'b']);
    expect(rpc).toHaveBeenCalledWith('mark_listings_shown', { p_property_ids: ['a', 'b'] });
  });

  it('markShown с пустым массивом — no-op', async () => {
    await service.markShown([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('recordView шлёт id в track_view', async () => {
    await service.recordView('x');
    expect(rpc).toHaveBeenCalledWith('track_view', { p_property_id: 'x' });
  });

  it('ошибка RPC не пробрасывается наружу', async () => {
    rpc.and.rejectWith(new Error('boom'));
    await expectAsync(service.markShown(['a'])).toBeResolved();
    await expectAsync(service.recordView('x')).toBeResolved();
  });
});
