# GPT chat tab (S-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить stub-страницу `/mrsqm/chat` на рабочий таб «AI Chat» со стримовым ответом ИИ (SSE), серверной историей и фолбэком.

**Architecture:** Тонкий Angular-компонент (`chat-page`) поверх сервиса `gpt-stream.service`. Сервис — единственное место сети и парсинга SSE; ядро парсинга — чистая функция `parseSse()` (детерминированная, юнит-тестируемая без сети). Рендер ответа ИИ — через глобально зарегистрированный `MarkdownComponent` (ngx-markdown) в теме Super Productivity. Авторизация — Supabase access-token (Bearer), `user_id` не шлём.

**Tech Stack:** Angular 21 (standalone, OnPush, signals), `@supabase/supabase-js` (getSession → access_token), `ngx-markdown` (`MarkdownComponent`, провайдер уже глобальный), `fetch`+`ReadableStream` (POST-SSE), Jasmine/Karma.

## Global Constraints

- Весь код — в `src/app/mrsqm/`; апстрим SP трогаем минимально (только `app.routes.ts` loadComponent + `environment*.ts`).
- Standalone-компоненты, `ChangeDetectionStrategy.OnPush`, сигналы; инжект через `inject()`.
- Комментарии и UI-строки — на русском.
- Строгий TS: без `any` (использовать `unknown`). Не мутировать сигналы — `.set()/.update()` с новыми объектами/массивами.
- Тема SP: только существующие токены (`var(--ink-*)`, и т.п.); никаких локальных переопределений Material/`.mat-*`/`.mdc-*`.
- `EventSource` НЕ использовать (только `fetch`+`ReadableStream`). `user_id`/`telegram_id` в тело НЕ класть. URL — `environment.gptServiceUrl` (`https://ai.mrsqm.com`), без `:3100`.
- Каждый изменённый `.ts`/`.scss` прогнать `npm run checkFile <path>` перед коммитом.
- Источник правды по контракту: `~/projects/gpt/docs/frontend-streaming-guide.md` (§1, §1·5, §6) и `docs/superpowers/specs/2026-06-18c-gpt-chat-tab-design.md`.

---

## File Structure

| Файл                                                       | Ответственность                                                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/environments/environment.ts` (M)                      | `+ gptServiceUrl: 'https://ai.mrsqm.com'`                                                                                                               |
| `src/environments/environment.prod.ts` (M)                 | `+ gptServiceUrl: 'https://ai.mrsqm.com'`                                                                                                               |
| `src/app/mrsqm/services/gpt-stream.service.ts` (C)         | `parseSse()` (чистая), `GptStreamService`: `streamMessage`, `loadHistory`, `sendNonStreaming`. Типы `StreamHandlers`, `ChatHistoryMessage`, `SseEvent`. |
| `src/app/mrsqm/services/gpt-stream.service.spec.ts` (C)    | Юнит: `parseSse` (разрывы буфера, битый JSON), `loadHistory` (маппинг/401), `sendNonStreaming` (поле `response`).                                       |
| `src/app/mrsqm/pages/chat/chat-page.component.ts` (C)      | Стейт-сигналы, оркестрация: `loadHistory` при init, `send`, обработчики событий, `stop`, cleanup.                                                       |
| `src/app/mrsqm/pages/chat/chat-page.component.html` (C)    | Лента (`@for`), пузырь ассистента через `<markdown>`, статус-строка, textarea + send/stop, спиннер/empty-state.                                         |
| `src/app/mrsqm/pages/chat/chat-page.component.scss` (C)    | Пузыри/статус/инпут в теме SP.                                                                                                                          |
| `src/app/mrsqm/pages/chat/chat-page.component.spec.ts` (C) | Компонентные тесты (сервис замокан).                                                                                                                    |
| `src/app/app.routes.ts` (M)                                | Роут `mrsqm/chat`: `loadComponent` stub → `ChatPageComponent`.                                                                                          |

---

## Task 1: gpt-stream.service (SSE-ядро, история, фолбэк)

**Files:**

- Create: `src/app/mrsqm/services/gpt-stream.service.ts`
- Test: `src/app/mrsqm/services/gpt-stream.service.spec.ts`
- Modify: `src/environments/environment.ts`, `src/environments/environment.prod.ts` (добавить `gptServiceUrl`)

**Interfaces (Produces):**

```ts
export interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}
export interface StreamHandlers {
  onToolStart?: (tool: string) => void;
  onToolDone?: (tool: string) => void;
  onToken?: (text: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}
export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  text: string;
  created_at: string;
}

// Чистая функция: из накопленного буфера достаёт завершённые SSE-события и хвост.
export function parseSse(buffer: string): { events: SseEvent[]; rest: string };

@Injectable({ providedIn: 'root' })
export class GptStreamService {
  streamMessage(text: string, h: StreamHandlers): AbortController; // .abort() прерывает
  loadHistory(limit?: number): Promise<ChatHistoryMessage[]>; // дефолт 50
  sendNonStreaming(text: string): Promise<string>; // возвращает поле response
}
```

**Контракт `parseSse`:** буфер бьётся по `'\n\n'`; последний кусок (возможно неполный) → `rest`. Для каждого завершённого куска берём строки `event: <name>` и `data: <json>`; если обе есть и `data` парсится JSON-ом → `{event, data}`; иначе кусок пропускаем (но он считается потреблённым). Пустые куски игнор.

- [ ] **Step 1: env — добавить gptServiceUrl**

В `src/environments/environment.ts` и `src/environments/environment.prod.ts` в объект `environment` добавить строкой после `supabaseAnonKey`:

```ts
  gptServiceUrl: 'https://ai.mrsqm.com',
```

(`environment.stage.ts` НЕ трогаем — там нет supabase-ключей, это не mrsqm-таргет.)

- [ ] **Step 2: Написать падающие тесты `parseSse`**

`gpt-stream.service.spec.ts`:

```ts
import { parseSse } from './gpt-stream.service';

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
    let acc = 'event: tok';
    let r1 = parseSse(acc);
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
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/services/gpt-stream.service.spec.ts`
Expected: FAIL (`parseSse is not a function` / не экспортирован).

- [ ] **Step 4: Реализовать `parseSse` + сервис**

Создать `gpt-stream.service.ts`. `parseSse` — по контракту выше. Сервис:

- `streamMessage(text, h)`: создаёт `AbortController`, запускает приватный `run()` (не await), `.catch(e => h.onError?.(...))` (но НЕ для `AbortError`), возвращает контроллер.
- `run()`: `getSession()` → если нет → throw `'not authenticated'`; `fetch(${baseUrl}/chat/stream, {method:POST, headers:{Content-Type, Authorization: Bearer}, body: JSON.stringify({text, channel:'web'}), signal})`; если `!res.ok` → throw `HTTP ${status}`; читать `res.body.getReader()`, `TextDecoder`, аккумулировать буфер, на каждый `read()`: `const {events, rest} = parseSse(buffer); buffer = rest;` и диспатчить события в `h` по `switch(ev.event)` (`tool_start→onToolStart(data.tool as string)`, `tool_done→onToolDone`, `token→onToken(data.text as string)`, `done→onDone`, `error→onError(data.message as string)`).
- `loadHistory(limit=50)`: `getSession()` → нет сессии → `return []`; `fetch(${baseUrl}/chat/history?limit=${limit}, {headers:{Authorization}})`; `!res.ok`→throw `HTTP ${status}`; `return (await res.json()).messages as ChatHistoryMessage[]`.
- `sendNonStreaming(text)`: `getSession()`; `fetch(${baseUrl}/chat, {method:POST, headers, body:{text, channel:'web'}})`; `!res.ok`→throw; `return (await res.json()).response as string`.
- `baseUrl = environment.gptServiceUrl`. Типобезопасно: `data` — `Record<string, unknown>`, при чтении полей кастуем точечно (`as string`), без `any`.

- [ ] **Step 5: Тесты `parseSse` зелёные**

Run: `npm run test:file src/app/mrsqm/services/gpt-stream.service.spec.ts`
Expected: PASS (5 parseSse-тестов).

- [ ] **Step 6: Тесты loadHistory / sendNonStreaming (мок fetch+session)**

Добавить в spec. Мокать `MrsqmSupabaseService` (`client.auth.getSession` → `{data:{session:{access_token:'t'}}}`) и `spyOn(window, 'fetch')`. Кейсы:

```ts
// loadHistory маппит messages
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

// loadHistory без сессии → []
// (getSession → {data:{session:null}}) → toBeResolvedTo([])

// loadHistory 401 → reject HTTP 401
fetchSpy.and.resolveTo(new Response('', { status: 401 }));
await expectAsync(service.loadHistory()).toBeRejected();

// sendNonStreaming возвращает поле response
fetchSpy.and.resolveTo(
  new Response(JSON.stringify({ response: 'готовый ответ', tokens: 9 }), { status: 200 }),
);
await expectAsync(service.sendNonStreaming('q')).toBeResolvedTo('готовый ответ');
```

- [ ] **Step 7: Весь spec зелёный + checkFile**

Run: `npm run test:file src/app/mrsqm/services/gpt-stream.service.spec.ts` → PASS.
Run: `npm run checkFile src/app/mrsqm/services/gpt-stream.service.ts` → без ошибок.
Run: `npm run checkFile src/app/mrsqm/services/gpt-stream.service.spec.ts` → без ошибок.

- [ ] **Step 8: Commit**

```bash
git add src/app/mrsqm/services/gpt-stream.service.ts src/app/mrsqm/services/gpt-stream.service.spec.ts src/environments/environment.ts src/environments/environment.prod.ts
git commit -m "feat(chat): gpt-stream сервис — SSE-парсер, история, фолбэк (S-2)"
```

---

## Task 2: chat-page компонент

**Files:**

- Create: `src/app/mrsqm/pages/chat/chat-page.component.ts`, `.html`, `.scss`
- Test: `src/app/mrsqm/pages/chat/chat-page.component.spec.ts`

**Interfaces (Consumes from Task 1):** `GptStreamService.{streamMessage, loadHistory, sendNonStreaming}`, `StreamHandlers`, `ChatHistoryMessage`.

**Produces:**

```ts
interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
}
export class ChatPageComponent {
  messages = signal<ChatMessage[]>([]);
  status = signal<string | null>(null);
  streaming = signal<boolean>(false);
  loadingHistory = signal<boolean>(true);
  error = signal<string | null>(null);
  send(text: string): void;
  stop(): void;
}
```

**Поведение (из спеки §3/§5):**

- `constructor`/init: `loadingHistory=true` → `loadHistory()` → `messages.set(mapped)` → `loadingHistory=false`; ошибка истории → `loadingHistory=false`, лента пустая (не критично).
- `send(text)`: trim, пусто/`streaming()` → no-op; `messages.update(m => [...m, {role:'user',text}, {role:'assistant',text:'',streaming:true}])`; `streaming.set(true)`; `error.set(null)`; вызвать `streamMessage` с обработчиками:
  - `onToolStart(tool)` → `status.set(TOOL_LABELS[tool] ?? 'Работаю…')`
  - `onToolDone()` → `status.set(null)`
  - `onToken(t)` → дописать в последний ассистентский пузырь (иммутабельно: новый массив с обновлённым последним элементом)
  - `onDone()` → снять `streaming` с последнего пузыря, `streaming.set(false)`, `status.set(null)`
  - `onError(m)` → `streaming.set(false)`, `status.set(null)`, `error.set(m)`, снять флаг `streaming` с пузыря
- `stop()` → `_abort?.abort()`, `streaming.set(false)`, `status.set(null)`.
- `ngOnDestroy` → `_abort?.abort()`.
- `TOOL_LABELS` — карта из гайда §3 (search_locations/properties/nearby/community/market/get_market_analytics/create_listing/generate_pdf), дефолт «Работаю…».

- [ ] **Step 1: Падающие компонентные тесты**

`chat-page.component.spec.ts` — `GptStreamService` замокан (`streamMessage` возвращает мок-`AbortController`, отдаём колбэки наружу; `loadHistory` → Promise). Кейсы:

```ts
it('грузит историю при инициализации', async () => {
  loadHistorySpy.and.resolveTo([{ role: 'user', text: 'прошлое', created_at: 'x' }]);
  // создать компонент, await microtasks
  expect(component.messages().length).toBe(1);
  expect(component.loadingHistory()).toBeFalse();
});

it('send добавляет пузырь юзера и пустой ассистента, streaming=true', () => {
  component.send('привет');
  const m = component.messages();
  expect(m.at(-2)).toEqual(jasmine.objectContaining({ role: 'user', text: 'привет' }));
  expect(m.at(-1)).toEqual(
    jasmine.objectContaining({ role: 'assistant', text: '', streaming: true }),
  );
  expect(component.streaming()).toBeTrue();
});

it('onToken дописывает текст в ассистентский пузырь', () => {
  component.send('q');
  capturedHandlers.onToken!('Наш');
  capturedHandlers.onToken!('ёл');
  expect(component.messages().at(-1)!.text).toBe('Нашёл');
});

it('onToolStart ставит человекочитаемый статус', () => {
  component.send('q');
  capturedHandlers.onToolStart!('search_properties');
  expect(component.status()).toBe('Ищу объявления на платформе…');
});

it('onDone снимает streaming', () => {
  component.send('q');
  capturedHandlers.onDone!();
  expect(component.streaming()).toBeFalse();
  expect(component.messages().at(-1)!.streaming).toBeFalsy();
});

it('onError показывает ошибку и разблокирует', () => {
  component.send('q');
  capturedHandlers.onError!('сбой');
  expect(component.error()).toBe('сбой');
  expect(component.streaming()).toBeFalse();
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/pages/chat/chat-page.component.spec.ts`
Expected: FAIL (компонента нет).

- [ ] **Step 3: Реализовать компонент (.ts/.html/.scss)**

`.ts`: standalone, OnPush, imports `[CommonModule, MatIconModule, MatProgressSpinnerModule, MatButtonModule, MarkdownComponent, FormsModule]`. Инжект `GptStreamService`. Стейт + методы по контракту. `send` берёт текст из сигнала ввода (`draft = signal('')`), Enter без Shift → `send`. Иммутабельные обновления массива.
`.html`: контейнер `.chat`; при `loadingHistory()` — `<mat-spinner>`; иначе лента `@for (m of messages(); track $index)` с классами `.msg.user`/`.msg.assistant`, ассистент → `<markdown [data]="m.text">`; под лентой — `@if (status()) { <div class="status">{{status()}}…</div> }`; `@if (error()) { <div class="error">{{error()}}</div> }`; футер: `<textarea [(ngModel)]>` + кнопка send (`@if(!streaming())`) / stop (`@if(streaming())`). Empty-state, когда `messages().length===0 && !loadingHistory()`.
`.scss`: пузыри (user справа, assistant слева), статус серым (`var(--ink-muted)` или аналог из feed scss), отступы, скролл-контейнер `flex:1; overflow:auto`. Только токены SP.

- [ ] **Step 4: Тесты зелёные**

Run: `npm run test:file src/app/mrsqm/pages/chat/chat-page.component.spec.ts`
Expected: PASS (6 кейсов).

- [ ] **Step 5: checkFile на все 3 файла + спек**

Run: `npm run checkFile src/app/mrsqm/pages/chat/chat-page.component.ts` (и `.html` через ts-шаблон неважно, `.scss`, `.spec.ts`).
Run: `npm run checkFile src/app/mrsqm/pages/chat/chat-page.component.scss`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/app/mrsqm/pages/chat/
git commit -m "feat(chat): страница AI Chat — лента, стрим-пузыри, статус, история (S-2)"
```

---

## Task 3: подключить роут + smoke

**Files:**

- Modify: `src/app/app.routes.ts` (роут `mrsqm/chat`)

- [ ] **Step 1: Заменить loadComponent**

В `src/app/app.routes.ts` у объекта роута `path: 'mrsqm/chat'`:

```ts
    loadComponent: () =>
      import('./mrsqm/pages/chat/chat-page.component').then((m) => m.ChatPageComponent),
```

(`data`/`canActivate` не трогать.)

- [ ] **Step 2: checkFile**

Run: `npm run checkFile src/app/app.routes.ts` → без ошибок.

- [ ] **Step 3: Прод-сборка (smoke)**

Run: `npm run buildFrontend` (или `ng build`) — Expected: успешно, без ошибок типов; роут `mrsqm/chat` лениво подгружает `ChatPageComponent`.

- [ ] **Step 4: Полный юнит-сюит**

Run: `npm test` — Expected: всё зелёное (включая новые spec'и).

- [ ] **Step 5: Commit**

```bash
git add src/app/app.routes.ts
git commit -m "feat(chat): подключить ChatPageComponent к роуту mrsqm/chat (S-2)"
```

---

## Self-Review (заполняется автором плана)

- **Spec coverage:** §1 архитектура/файлы → T1+T2+T3; §2 стейт → T2 Produces; §3 стрим-UX → T2; §4 история+контракт → T1 `loadHistory`+T2 init; §5 ошибки/401/фолбэк → T1 `sendNonStreaming`/`run` throw + T2 onError (примечание: авто-фолбэк на обрыв сети и refreshSession при 401 — упрощены до показа ошибки в MVP; см. ниже); §6 YAGNI → не реализуем; §7 тесты → T1/T2 spec'и; §8 порядок → T1→T2→T3.
- **Уточнение по §5 (осознанное сужение MVP):** авто-retry при 401 через `refreshSession()` и авто-переключение на `sendNonStreaming` при обрыве — вынести в follow-up; в этой итерации `onError` показывает ошибку и разблокирует ввод, `sendNonStreaming` реализован и покрыт тестом, но дёргается вручную/в следующей итерации. Причина: supabase-js сам рефрешит токен в фоне (autoRefresh), 401 на свежей сессии маловероятен; не усложняем первую версию. **Зафиксировать в TODO как S-2.1.**
- **Placeholder scan:** нет TODO/TBD; тест-код реальный.
- **Type consistency:** `StreamHandlers`/`ChatHistoryMessage`/`parseSse` едины в T1 и потребляются в T2; `ChatMessage` — локальный тип T2.
