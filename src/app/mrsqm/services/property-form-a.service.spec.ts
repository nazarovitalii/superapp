import { TestBed } from '@angular/core/testing';
import { PropertyFormAService, FormARow } from './property-form-a.service';
import { MrsqmSupabaseService } from './supabase.service';

// Стаб MrsqmSupabaseService с минимальным client.
class FakeSupabaseService {
  readonly client = {
    storage: {
      from: (_bucket: string) => ({
        upload: jasmine
          .createSpy('upload')
          .and.returnValue(Promise.resolve({ error: null })),
      }),
    },
    from: (_table: string) => ({
      insert: jasmine
        .createSpy('insert')
        .and.returnValue(Promise.resolve({ error: null })),
    }),
  };
}

describe('PropertyFormAService', () => {
  let service: PropertyFormAService;
  let fakeSupa: FakeSupabaseService;

  beforeEach(() => {
    fakeSupa = new FakeSupabaseService();

    TestBed.configureTestingModule({
      providers: [
        PropertyFormAService,
        { provide: MrsqmSupabaseService, useValue: fakeSupa },
      ],
    });

    service = TestBed.inject(PropertyFormAService);
  });

  // ── uploadFormA ────────────────────────────────────────────────────────────

  it('uploadFormA: вызывает storage.upload с правильным путём и опциями', async () => {
    const file = new File(['%PDF'], 'form-a.pdf', { type: 'application/pdf' });
    const storageBucket = {
      upload: jasmine
        .createSpy('upload')
        .and.returnValue(Promise.resolve({ error: null })),
    };
    spyOn(fakeSupa.client.storage, 'from').and.returnValue(
      storageBucket as unknown as ReturnType<typeof fakeSupa.client.storage.from>,
    );

    const path = await service.uploadFormA('prop-1', 'owner-1', file);

    // Путь начинается с owner-id/property-id/
    expect(path).toMatch(/^owner-1\/prop-1\/.+\.pdf$/);

    expect(fakeSupa.client.storage.from).toHaveBeenCalledWith('property_form_a');
    expect(storageBucket.upload).toHaveBeenCalledWith(path, file, {
      contentType: 'application/pdf',
      upsert: false,
    });
  });

  it('uploadFormA: пробрасывает ошибку storage', async () => {
    const file = new File(['%PDF'], 'form-a.pdf', { type: 'application/pdf' });
    const storageBucket = {
      upload: jasmine
        .createSpy('upload')
        .and.returnValue(Promise.resolve({ error: new Error('Storage error') })),
    };
    spyOn(fakeSupa.client.storage, 'from').and.returnValue(
      storageBucket as unknown as ReturnType<typeof fakeSupa.client.storage.from>,
    );

    await expectAsync(service.uploadFormA('prop-1', 'owner-1', file)).toBeRejected();
  });

  // ── insertFormA ────────────────────────────────────────────────────────────

  it('insertFormA: вызывает from("property_form_a").insert(row)', async () => {
    const tableStub = {
      insert: jasmine
        .createSpy('insert')
        .and.returnValue(Promise.resolve({ error: null })),
    };
    spyOn(fakeSupa.client, 'from').and.returnValue(
      tableStub as unknown as ReturnType<typeof fakeSupa.client.from>,
    );

    const row: FormARow = {
      property_id: 'prop-1',
      file_url: 'owner-1/prop-1/uuid.pdf',
      contract_number: 'CN-001',
      listing_start: '2026-07-01',
      listing_end: '2027-07-01',
      pdf_password: null,
      status: 'active',
      uploaded_by: 'owner-1',
    };

    await service.insertFormA(row);

    expect(fakeSupa.client.from).toHaveBeenCalledWith('property_form_a');
    expect(tableStub.insert).toHaveBeenCalledWith(row);
  });

  it('insertFormA: пробрасывает ошибку БД', async () => {
    const tableStub = {
      insert: jasmine
        .createSpy('insert')
        .and.returnValue(Promise.resolve({ error: new Error('DB error') })),
    };
    spyOn(fakeSupa.client, 'from').and.returnValue(
      tableStub as unknown as ReturnType<typeof fakeSupa.client.from>,
    );

    const row: FormARow = {
      property_id: 'prop-1',
      file_url: 'path',
      contract_number: null,
      listing_start: null,
      listing_end: null,
      pdf_password: null,
      status: 'active',
      uploaded_by: 'owner-1',
    };

    await expectAsync(service.insertFormA(row)).toBeRejected();
  });
});
