import { TestBed } from '@angular/core/testing';
import { parseSse, GptStreamService } from './gpt-stream.service';
import { MrsqmSupabaseService } from './supabase.service';

// ---------------------------------------------------------------------------
// parseSse — чистая функция
// ---------------------------------------------------------------------------
describe('parseSse', () => {
  it('парсит одно завершённое событие, rest пуст', () => {
    const { events, rest } = parseSse('event: token\ndata: {"text":"a"}\n\n');
    expect(events).toEqual([{ event: 'token', data: { text: 'a' } }]);
    expect(rest).toBe('');
  });

  it('держит неполный хвост в rest', () => {
    const { events, rest } = parseSse('event: token\ndata: {"text":"a"}\n\nevent: to');
    expect(events.length).toBe(1);
    expect(rest).toBe('event: to');
  });

  it('склеивает событие, разорванное между чанками', () => {
    const acc = 'event: tok';
    const r1 = parseSse(acc);
    expect(r1.events.length).toBe(0);
    expect(r1.rest).toBe('event: tok');
    const r2 = parseSse(r1.rest + 'en\ndata: {"text":"b"}\n\n');
    expect(r2.events).toEqual([{ event: 'token', data: { text: 'b' } }]);
  });

  it('пропускает кусок с битым JSON, но потребляет его', () => {
    const { events, rest } = parseSse(
      'event: token\ndata: {битый}\n\nevent: done\ndata: {}\n\n',
    );
    expect(events).toEqual([{ event: 'done', data: {} }]);
    expect(rest).toBe('');
  });

  it('несколько событий за один проход', () => {
    const { events } = parseSse(
      'event: tool_start\ndata: {"tool":"search_properties"}\n\nevent: token\ndata: {"text":"x"}\n\n',
    );
    expect(events.map((e) => e.event)).toEqual(['tool_start', 'token']);
  });
});

// ---------------------------------------------------------------------------
// GptStreamService — мокаем fetch + supabase
// ---------------------------------------------------------------------------
describe('GptStreamService', () => {
  let service: GptStreamService;
  let fetchSpy: jasmine.Spy;

  // Стаб supabase-сервиса с активной сессией
  const supabaseWithSession = {
    client: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: { access_token: 't' } } }),
      },
    },
  };

  // Стаб supabase-сервиса без сессии
  const supabaseNoSession = {
    client: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
      },
    },
  };

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch');
  });

  const createService = (supabaseStub: unknown): GptStreamService => {
    TestBed.configureTestingModule({
      providers: [
        GptStreamService,
        { provide: MrsqmSupabaseService, useValue: supabaseStub },
      ],
    });
    return TestBed.inject(GptStreamService);
  };

  afterEach(() => TestBed.resetTestingModule());

  // ---- loadHistory маппит messages ----
  it('loadHistory маппит messages', async () => {
    service = createService(supabaseWithSession);
    fetchSpy.and.resolveTo(
      new Response(
        JSON.stringify({
          messages: [{ role: 'user', text: 'hi', created_at: '2026-01-01' }],
        }),
        { status: 200 },
      ),
    );
    await expectAsync(service.loadHistory()).toBeResolvedTo([
      { role: 'user', text: 'hi', created_at: '2026-01-01' },
    ]);
  });

  // ---- loadHistory без сессии → [] ----
  it('loadHistory без сессии возвращает пустой массив', async () => {
    service = createService(supabaseNoSession);
    await expectAsync(service.loadHistory()).toBeResolvedTo([]);
  });

  // ---- loadHistory 401 → reject ----
  it('loadHistory при 401 отклоняет промис', async () => {
    service = createService(supabaseWithSession);
    fetchSpy.and.resolveTo(new Response('', { status: 401 }));
    await expectAsync(service.loadHistory()).toBeRejected();
  });

  // ---- sendNonStreaming возвращает поле response ----
  it('sendNonStreaming возвращает поле response', async () => {
    service = createService(supabaseWithSession);
    fetchSpy.and.resolveTo(
      new Response(JSON.stringify({ response: 'готовый ответ', tokens: 9 }), {
        status: 200,
      }),
    );
    await expectAsync(service.sendNonStreaming('q')).toBeResolvedTo('готовый ответ');
  });
});
