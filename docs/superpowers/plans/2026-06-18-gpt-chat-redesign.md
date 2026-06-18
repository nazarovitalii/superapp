# AI Chat Redesign (S-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переделать таб AI Chat (`/mrsqm/chat`) в «ChatGPT-вид», оставаясь в визуальном языке Super Productivity.

**Architecture:** Один standalone OnPush-компонент `ChatPageComponent` переписывается на месте. Task 1 добавляет всю UI-логику (чипы, авто-скролл, авто-рост поля) с юнит-тестами. Task 2 переписывает шаблон + SCSS под новый вид и покрывает DOM-тестами. Сервис `GptStreamService` и бэкенд-контракт не меняются.

**Tech Stack:** Angular (standalone, signals, `viewChild`), TypeScript (strict), SCSS (токены Super Productivity), ngx-markdown, Jasmine/Karma.

**Спека:** `docs/superpowers/specs/2026-06-18e-gpt-chat-redesign-design.md`

## Global Constraints

- Только токены/темы Super Productivity. Никаких `.mat-*`/`.mdc-*`-оверрайдов и рестайла shared-компонентов. `::ng-deep markdown` внутри ленты — допустимо.
- Strict TypeScript: никаких `any` (использовать `unknown`/точные типы).
- Комментарии и UI-строки — на русском.
- OnPush, сигналы. Доступ к DOM — только через `viewChild()` (не прямой DOM-доступ).
- Бэкенд/БД не трогаем. `GptStreamService` (`streamMessage`/`loadHistory`/`sendNonStreaming`) и контракт неизменны.
- `npm run checkFile <path>` на каждый изменённый `.ts`/`.scss` перед сдачей. Юнит-сюит зелёный.
- Все анимации уважают `@media (prefers-reduced-motion: reduce)`.
- Коммиты: `feat(chat): …` / `style(chat): …`, с `Co-Authored-By`.

---

### Task 1: UI-логика — чипы, авто-скролл, авто-рост поля

**Files:**
- Modify: `src/app/mrsqm/pages/chat/chat-page.component.ts`
- Test: `src/app/mrsqm/pages/chat/chat-page.component.spec.ts`

**Interfaces:**
- Consumes: `GptStreamService.streamMessage(text, handlers): AbortController`, `loadHistory(): Promise<ChatHistoryMessage[]>` (без изменений).
- Produces (для Task 2 — шаблон будет к ним привязан):
  - signal `pinnedToBottom: Signal<boolean>`
  - `readonly suggestions: readonly { label: string; prompt: string }[]` (длина 4)
  - `sendSuggestion(prompt: string): void`
  - `onMessagesScroll(event: Event): void`
  - `scrollToBottom(): void`
  - viewChild-якоря в шаблоне: `#messagesEl` (контейнер ленты), `#inputEl` (textarea)
  - `onInput`/`onKeyDown`/`onSendClick` дополнительно вызывают авто-рост поля.

- [ ] **Step 1: Написать падающие тесты (логика UI)**

Добавить в `src/app/mrsqm/pages/chat/chat-page.component.spec.ts` перед тестом `'send добавляет пузырь юзера…'`:

```ts
  it('sendSuggestion очищает draft и шлёт prompt', async () => {
    await createComponent();
    const mockGpt = TestBed.inject(GptStreamService) as jasmine.SpyObj<GptStreamService>;
    component.sendSuggestion('Покажи 2BR квартиры в Dubai Marina до 2 млн AED');
    expect(mockGpt.streamMessage).toHaveBeenCalledWith(
      'Покажи 2BR квартиры в Dubai Marina до 2 млн AED',
      jasmine.any(Object),
    );
    expect(component.draft()).toBe('');
    expect(component.messages().length).toBe(2); // user + пустой ассистент
  });

  it('onMessagesScroll: у низа → pinnedToBottom=true', async () => {
    await createComponent();
    component.pinnedToBottom.set(false);
    component.onMessagesScroll({
      target: { scrollHeight: 1000, scrollTop: 900, clientHeight: 100 },
    } as unknown as Event);
    expect(component.pinnedToBottom()).toBeTrue();
  });

  it('onMessagesScroll: отлистано вверх → pinnedToBottom=false', async () => {
    await createComponent();
    component.onMessagesScroll({
      target: { scrollHeight: 1000, scrollTop: 100, clientHeight: 100 },
    } as unknown as Event);
    expect(component.pinnedToBottom()).toBeFalse();
  });

  it('scrollToBottom ставит pinnedToBottom=true', async () => {
    await createComponent();
    component.pinnedToBottom.set(false);
    component.scrollToBottom();
    expect(component.pinnedToBottom()).toBeTrue();
  });

  it('suggestions — массив из 4 подсказок', async () => {
    await createComponent();
    expect(component.suggestions.length).toBe(4);
  });
```

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run: `npm run test:file src/app/mrsqm/pages/chat/chat-page.component.spec.ts`
Expected: FAIL — `component.sendSuggestion is not a function` / `component.pinnedToBottom is undefined` / `component.suggestions is undefined`.

- [ ] **Step 3: Реализовать логику — заменить весь файл компонента**

Полностью заменить содержимое `src/app/mrsqm/pages/chat/chat-page.component.ts` на:

```ts
import {
  Component,
  inject,
  ChangeDetectionStrategy,
  signal,
  OnDestroy,
  ElementRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MarkdownComponent } from 'ngx-markdown';
import {
  GptStreamService,
  StreamHandlers,
  ChatHistoryMessage,
} from '../../services/gpt-stream.service';

// ---------------------------------------------------------------------------
// Интерфейсы
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
}

interface Suggestion {
  label: string;
  prompt: string;
}

// ---------------------------------------------------------------------------
// Метки инструментов (из frontend-streaming-guide.md §3)
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
  search_locations: 'Уточняю район…',
  search_properties: 'Ищу объявления на платформе…',
  search_nearby: 'Смотрю соседние районы…',
  search_community: 'Листаю объявления района…',
  search_market: 'Ищу на маркетплейсе…',
  get_market_analytics: 'Считаю аналитику рынка…',
  create_listing: 'Готовлю черновик объявления…',
  generate_pdf: 'Генерирую PDF-презентацию…',
};

const DEFAULT_TOOL_LABEL = 'Работаю…';

// Чипы-подсказки для пустого экрана (label — на чипе, prompt — что уходит в send)
const SUGGESTIONS: Suggestion[] = [
  {
    label: '2BR в Dubai Marina до 2M',
    prompt: 'Покажи 2BR квартиры в Dubai Marina до 2 млн AED',
  },
  {
    label: 'Аренда виллы в Arabian Ranches',
    prompt: 'Что есть в аренду — виллы в Arabian Ranches',
  },
  {
    label: 'Off-plan с рассрочкой',
    prompt: 'Подбери off-plan проекты с рассрочкой от застройщика',
  },
  { label: '1BR: JVC vs JLT', prompt: 'Сравни цены на 1BR квартиры в JVC и JLT' },
];

// Порог «близко к низу» для авто-скролла (px)
const NEAR_BOTTOM_PX = 80;
// Максимальная высота поля ввода (px) — синхронно с SCSS max-height
const INPUT_MAX_HEIGHT = 160;

// ---------------------------------------------------------------------------
// Компонент
// ---------------------------------------------------------------------------

@Component({
  selector: 'mrsqm-chat-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MarkdownComponent,
  ],
  templateUrl: './chat-page.component.html',
  styleUrl: './chat-page.component.scss',
})
export class ChatPageComponent implements OnDestroy {
  private readonly _gpt = inject(GptStreamService);

  // Текущий контроллер стрима для возможности остановки
  private _abort: AbortController | null = null;

  // Ссылки на DOM — только через viewChild (без прямого доступа)
  private readonly _messagesEl = viewChild<ElementRef<HTMLElement>>('messagesEl');
  private readonly _inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('inputEl');

  // ─── Состояние ────────────────────────────────────────────────────────────

  readonly messages = signal<ChatMessage[]>([]);
  readonly status = signal<string | null>(null);
  readonly streaming = signal<boolean>(false);
  readonly loadingHistory = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly draft = signal<string>('');
  // Лента «приклеена» к низу — авто-скролл следует за стримом
  readonly pinnedToBottom = signal<boolean>(true);

  // Чипы-подсказки (read-only)
  readonly suggestions: readonly Suggestion[] = SUGGESTIONS;

  constructor() {
    void this._init();
  }

  ngOnDestroy(): void {
    this._abort?.abort();
  }

  // ─── Инициализация (загрузка истории) ────────────────────────────────────

  private async _init(): Promise<void> {
    try {
      const history: ChatHistoryMessage[] = await this._gpt.loadHistory();
      this.messages.set(history.map((m) => ({ role: m.role, text: m.text })));
    } catch (e) {
      // История не загрузилась (сеть/CORS/401/500) — показываем причину,
      // чтобы пустая лента не выглядела как «история не сохраняется».
      this.error.set(
        'Не удалось загрузить историю чата: ' + ((e as Error)?.message ?? String(e)),
      );
    } finally {
      this.loadingHistory.set(false);
      this._scheduleScroll();
    }
  }

  // ─── Отправка сообщения ───────────────────────────────────────────────────

  send(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.streaming()) return;

    this.error.set(null);

    this.messages.update((msgs) => [
      ...msgs,
      { role: 'user', text: trimmed },
      { role: 'assistant', text: '', streaming: true },
    ]);

    this.streaming.set(true);
    this.pinnedToBottom.set(true);
    this._scheduleScroll();

    const handlers: StreamHandlers = {
      onToolStart: (tool: string) => {
        this.status.set(TOOL_LABELS[tool] ?? DEFAULT_TOOL_LABEL);
      },
      onToolDone: () => {
        this.status.set(null);
      },
      onToken: (t: string) => {
        this.messages.update((msgs) => {
          const last = msgs[msgs.length - 1];
          if (!last) return msgs;
          return [...msgs.slice(0, -1), { ...last, text: last.text + t }];
        });
        this._scheduleScroll();
      },
      onDone: () => {
        this.messages.update((msgs) => {
          const last = msgs[msgs.length - 1];
          if (!last) return msgs;
          return [...msgs.slice(0, -1), { ...last, streaming: false }];
        });
        this.streaming.set(false);
        this.status.set(null);
      },
      onError: (message: string) => {
        this.messages.update((msgs) => {
          const last = msgs[msgs.length - 1];
          if (!last) return msgs;
          return [...msgs.slice(0, -1), { ...last, streaming: false }];
        });
        this.streaming.set(false);
        this.status.set(null);
        this.error.set(message);
      },
    };

    this._abort = this._gpt.streamMessage(trimmed, handlers);
  }

  // ─── Остановка стрима ─────────────────────────────────────────────────────

  stop(): void {
    this._abort?.abort();
    this._abort = null;
    this.messages.update((msgs) => {
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== 'assistant') return msgs;
      return [...msgs.slice(0, -1), { ...last, streaming: false }];
    });
    this.streaming.set(false);
    this.status.set(null);
  }

  // ─── Чип-подсказка → сразу отправляем ────────────────────────────────────

  sendSuggestion(prompt: string): void {
    this.draft.set('');
    this.send(prompt);
  }

  // ─── Ввод ─────────────────────────────────────────────────────────────────

  onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
    this._autoGrow();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const text = this.draft();
      this.draft.set('');
      this._autoGrow();
      this.send(text);
    }
  }

  onSendClick(): void {
    const text = this.draft();
    this.draft.set('');
    this._autoGrow();
    this.send(text);
  }

  // ─── Скролл ленты ─────────────────────────────────────────────────────────

  onMessagesScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    this.pinnedToBottom.set(nearBottom);
  }

  scrollToBottom(): void {
    const el = this._messagesEl()?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
    this.pinnedToBottom.set(true);
  }

  // Прокрутка вниз на следующем кадре, если лента приклеена
  private _scheduleScroll(): void {
    if (!this.pinnedToBottom()) return;
    requestAnimationFrame(() => {
      const el = this._messagesEl()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  // Авто-рост поля ввода под содержимое
  private _autoGrow(): void {
    const el = this._inputEl()?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, INPUT_MAX_HEIGHT) + 'px';
  }
}
```

Примечание: `MatButtonModule` пока остаётся в imports — старый шаблон (S-2) ещё использует `mat-icon-button`; уберём в Task 2.

- [ ] **Step 4: Запустить тесты — убедиться, что прошли**

Run: `npm run test:file src/app/mrsqm/pages/chat/chat-page.component.spec.ts`
Expected: PASS — все 13 тестов (8 прежних + 5 новых) зелёные.

- [ ] **Step 5: checkFile**

Run: `npm run checkFile src/app/mrsqm/pages/chat/chat-page.component.ts`
Expected: `All checks passed!`

- [ ] **Step 6: Commit**

```bash
git add src/app/mrsqm/pages/chat/chat-page.component.ts src/app/mrsqm/pages/chat/chat-page.component.spec.ts
git commit -m "feat(chat): UI-логика редизайна — чипы, авто-скролл, авто-рост поля (S-3)"
```

---

### Task 2: Шаблон + SCSS — «ChatGPT-вид» в теме SP

**Files:**
- Modify: `src/app/mrsqm/pages/chat/chat-page.component.html` (полная замена)
- Modify: `src/app/mrsqm/pages/chat/chat-page.component.scss` (полная замена)
- Modify: `src/app/mrsqm/pages/chat/chat-page.component.ts` (убрать неиспользуемый `MatButtonModule`)
- Test: `src/app/mrsqm/pages/chat/chat-page.component.spec.ts` (добавить DOM-тесты)

**Interfaces:**
- Consumes: всё из Task 1 — `suggestions`, `sendSuggestion`, `pinnedToBottom`, `onMessagesScroll`, `scrollToBottom`, `draft`, `onInput`, `onKeyDown`, `onSendClick`, `send`, `stop`, `messages`, `status`, `error`, `loadingHistory`, `streaming`; viewChild-якоря `#messagesEl`, `#inputEl`.
- Produces: финальный визуал. CSS-классы, на которые опираются тесты: `.chat-composer`, `.chat-input`, `.chat-send`, `.chat-stop`, `.chat-chip`, `.msg.assistant`, `.msg.user`, `.msg-avatar`, `.msg-body`, `.msg-bubble`.

- [ ] **Step 1: Написать падающие DOM-тесты**

Добавить в конец `describe` в `chat-page.component.spec.ts`:

```ts
  it('пустой экран: рендерит 4 чипа-подсказки', async () => {
    await createComponent(); // loadHistory по умолчанию резолвит [] → пусто
    const chips = fixture.nativeElement.querySelectorAll('.chat-chip');
    expect(chips.length).toBe(4);
  });

  it('клик по чипу вызывает streamMessage', async () => {
    await createComponent();
    const mockGpt = TestBed.inject(GptStreamService) as jasmine.SpyObj<GptStreamService>;
    const firstChip = fixture.nativeElement.querySelector('.chat-chip') as HTMLButtonElement;
    firstChip.click();
    expect(mockGpt.streamMessage).toHaveBeenCalled();
  });

  it('ассистентский месседж: маркер-бот + тело, без пузыря', async () => {
    loadHistorySpy.and.resolveTo([{ role: 'assistant', text: 'привет', created_at: 'x' }]);
    await createComponent();
    const a = fixture.nativeElement.querySelector('.msg.assistant');
    expect(a.querySelector('.msg-avatar')).toBeTruthy();
    expect(a.querySelector('.msg-body')).toBeTruthy();
    expect(a.querySelector('.msg-bubble')).toBeNull();
  });

  it('юзерский месседж: пузырь', async () => {
    loadHistorySpy.and.resolveTo([{ role: 'user', text: 'вопрос', created_at: 'x' }]);
    await createComponent();
    const u = fixture.nativeElement.querySelector('.msg.user');
    expect(u.querySelector('.msg-bubble')).toBeTruthy();
  });

  it('композер: textarea + кнопка отправки внутри .chat-composer', async () => {
    await createComponent();
    const composer = fixture.nativeElement.querySelector('.chat-composer');
    expect(composer.querySelector('textarea')).toBeTruthy();
    expect(composer.querySelector('.chat-send')).toBeTruthy();
  });
```

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run: `npm run test:file src/app/mrsqm/pages/chat/chat-page.component.spec.ts`
Expected: FAIL — `.chat-chip` / `.msg-avatar` / `.chat-composer` не найдены (старый шаблон).

- [ ] **Step 3: Заменить шаблон**

Полностью заменить `src/app/mrsqm/pages/chat/chat-page.component.html` на:

```html
<div class="chat">
  <!-- Загрузка истории -->
  @if (loadingHistory()) {
    <div class="chat-spinner">
      <mat-spinner diameter="36" />
    </div>
  } @else {
    <!-- Лента сообщений -->
    <div
      #messagesEl
      class="chat-messages"
      (scroll)="onMessagesScroll($event)"
    >
      <!-- Пустое состояние -->
      @if (messages().length === 0) {
        <div class="chat-empty">
          <div class="chat-empty-badge">
            <mat-icon>smart_toy</mat-icon>
          </div>
          <h2 class="chat-empty-title">Чем помочь по рынку Дубая?</h2>
          <p class="chat-empty-sub">
            Спросите про объявления, районы или цены — найду нужное на платформе.
          </p>
          <div class="chat-suggestions">
            @for (s of suggestions; track s.label) {
              <button
                type="button"
                class="chat-chip"
                (click)="sendSuggestion(s.prompt)"
              >
                {{ s.label }}
              </button>
            }
          </div>
        </div>
      }

      <!-- Сообщения -->
      @for (m of messages(); track $index) {
        <div
          class="msg"
          [class.user]="m.role === 'user'"
          [class.assistant]="m.role === 'assistant'"
        >
          @if (m.role === 'assistant') {
            <div class="msg-avatar">
              <mat-icon>smart_toy</mat-icon>
            </div>
            <div class="msg-body">
              <markdown [data]="m.text" />
              @if (m.streaming) {
                <span
                  class="msg-typing"
                  aria-hidden="true"
                ></span>
              }
            </div>
          } @else {
            <div class="msg-bubble">{{ m.text }}</div>
          }
        </div>
      }

      <!-- Статус инструмента (shimmer) -->
      @if (status()) {
        <div class="chat-status">
          <span class="chat-status-text">{{ status() }}</span>
        </div>
      }

      <!-- Ошибка -->
      @if (error()) {
        <div class="chat-error">{{ error() }}</div>
      }
    </div>

    <!-- Кнопка «вниз» при отлистывании -->
    @if (!pinnedToBottom()) {
      <button
        type="button"
        class="chat-scroll-down"
        (click)="scrollToBottom()"
        aria-label="Прокрутить вниз"
      >
        <mat-icon>arrow_downward</mat-icon>
      </button>
    }
  }

  <!-- Композер (всегда виден) -->
  <div class="chat-footer">
    <div class="chat-composer">
      <textarea
        #inputEl
        class="chat-input"
        [value]="draft()"
        (input)="onInput($event)"
        (keydown)="onKeyDown($event)"
        placeholder="Напишите сообщение…"
        rows="1"
      ></textarea>

      @if (!streaming()) {
        <button
          type="button"
          class="chat-send"
          [disabled]="!draft().trim()"
          (click)="onSendClick()"
          aria-label="Отправить"
        >
          <mat-icon>arrow_upward</mat-icon>
        </button>
      } @else {
        <button
          type="button"
          class="chat-stop"
          (click)="stop()"
          aria-label="Остановить"
        >
          <mat-icon>stop</mat-icon>
        </button>
      }
    </div>
  </div>
</div>
```

- [ ] **Step 4: Заменить SCSS**

Полностью заменить `src/app/mrsqm/pages/chat/chat-page.component.scss` на:

```scss
@use '../../../../styles/_globals.scss' as *;

:host {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

// ─── Корневой контейнер ───────────────────────────────────────────────────
.chat {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 768px;
  margin: 0 auto;
  width: 100%;
  padding: 0 var(--s);
}

.chat-spinner {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
}

// ─── Лента ────────────────────────────────────────────────────────────────
.chat-messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  padding: var(--s2) 0 var(--s);
  scroll-behavior: smooth;
}

// ─── Пустое состояние ─────────────────────────────────────────────────────
.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: var(--s);
  padding: var(--s6) var(--s2);
  text-align: center;
}

.chat-empty-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--bg-lighter, rgba(0, 0, 0, 0.05));
  color: var(--c-primary);

  mat-icon {
    font-size: 34px;
    width: 34px;
    height: 34px;
  }
}

.chat-empty-title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--text-color);
}

.chat-empty-sub {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--text-color-muted);
  max-width: 420px;
}

.chat-suggestions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-half);
  width: 100%;
  max-width: 520px;
  margin-top: var(--s);
}

.chat-chip {
  text-align: left;
  padding: var(--s-half) var(--s);
  border: 1px solid var(--extra-border-color);
  border-radius: var(--task-border-radius);
  background: var(--task-c-bg);
  color: var(--text-color);
  font-size: 0.9rem;
  font-family: inherit;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s,
    transform 0.1s;

  &:hover {
    border-color: var(--c-primary);
    background: var(--bg-lighter, rgba(0, 0, 0, 0.05));
  }

  &:active {
    transform: scale(0.99);
  }
}

// ─── Сообщения ────────────────────────────────────────────────────────────
.msg {
  display: flex;
  gap: var(--s-half);
  animation: msg-in 0.16s ease-out;

  &.assistant {
    justify-content: flex-start;
  }

  &.user {
    justify-content: flex-end;
  }
}

.msg-avatar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-lighter, rgba(0, 0, 0, 0.05));
  color: var(--c-primary);
  margin-top: 2px;

  mat-icon {
    font-size: 18px;
    width: 18px;
    height: 18px;
  }
}

.msg-body {
  min-width: 0;
  flex: 1 1 auto;
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--text-color);
  overflow-wrap: anywhere;

  markdown,
  ::ng-deep markdown {
    p:first-child {
      margin-top: 0;
    }
    p:last-child {
      margin-bottom: 0;
    }
    p {
      margin: 0.5em 0;
    }
    ul,
    ol {
      margin: 0.5em 0;
      padding-left: 1.4em;
    }
    li {
      margin: 0.2em 0;
    }
    a {
      color: var(--c-primary);
    }
    code {
      background: var(--bg-lighter, rgba(0, 0, 0, 0.06));
      border-radius: 3px;
      padding: 0.1em 0.35em;
      font-size: 0.875em;
    }
    pre {
      background: var(--bg-lighter, rgba(0, 0, 0, 0.06));
      border-radius: var(--task-border-radius);
      padding: var(--s-half) var(--s);
      overflow-x: auto;
      font-size: 0.875em;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.5em 0;
      font-size: 0.9em;
    }
    th,
    td {
      border: 1px solid var(--extra-border-color);
      padding: 0.3em 0.6em;
      text-align: left;
    }
  }
}

.msg-bubble {
  max-width: 78%;
  padding: var(--s-half) var(--s);
  border-radius: 18px 18px 4px 18px;
  background: var(--c-primary);
  color: var(--palette-primary-contrast-500, #fff);
  font-size: 0.95rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

// Индикатор печати
.msg-typing {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-left: 4px;
  border-radius: 50%;
  background: var(--c-primary);
  vertical-align: middle;
  animation: typing-pulse 1s ease-in-out infinite;
}

// ─── Статус инструмента (shimmer) ─────────────────────────────────────────
.chat-status {
  padding: var(--s-quarter) calc(28px + var(--s-half));
  font-size: 0.85rem;
}

.chat-status-text {
  background: linear-gradient(
    90deg,
    var(--text-color-muted) 25%,
    var(--text-color) 50%,
    var(--text-color-muted) 75%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: shimmer 1.6s linear infinite;
}

// ─── Ошибка ───────────────────────────────────────────────────────────────
.chat-error {
  margin: var(--s-quarter) 0;
  padding: var(--s-half) var(--s);
  border-radius: var(--task-border-radius);
  background: var(--warn-c, rgba(200, 50, 50, 0.1));
  color: var(--warn-dark, #c62828);
  font-size: 0.875rem;
  border: 1px solid var(--warn-c, rgba(200, 50, 50, 0.25));
}

// ─── Кнопка «вниз» ────────────────────────────────────────────────────────
.chat-scroll-down {
  position: absolute;
  left: 50%;
  bottom: 84px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--extra-border-color);
  background: var(--task-c-bg);
  color: var(--text-color);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  z-index: 2;

  mat-icon {
    font-size: 20px;
    width: 20px;
    height: 20px;
  }
}

// ─── Композер ─────────────────────────────────────────────────────────────
.chat-footer {
  flex-shrink: 0;
  padding: var(--s-half) 0 var(--s);
}

.chat-composer {
  display: flex;
  align-items: flex-end;
  gap: var(--s-half);
  padding: var(--s-quarter) var(--s-quarter) var(--s-quarter) var(--s);
  border: 1px solid var(--extra-border-color);
  border-radius: 24px;
  background: var(--task-c-bg);
  transition: border-color 0.15s;

  &:focus-within {
    border-color: var(--c-primary);
  }
}

.chat-input {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-color);
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.5;
  min-height: 24px;
  max-height: 160px;
  padding: 8px 0;
  overflow-y: auto;

  &::placeholder {
    color: var(--text-color-muted);
  }
}

.chat-send,
.chat-stop {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition:
    opacity 0.15s,
    background 0.15s;

  mat-icon {
    font-size: 20px;
    width: 20px;
    height: 20px;
  }
}

.chat-send {
  background: var(--c-primary);
  color: var(--palette-primary-contrast-500, #fff);

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.chat-stop {
  background: transparent;
  color: var(--warn-dark, #c62828);
  border: 1px solid var(--extra-border-color);
}

// ─── Анимации ─────────────────────────────────────────────────────────────
@keyframes msg-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes typing-pulse {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-messages {
    scroll-behavior: auto;
  }
  .msg {
    animation: none;
  }
  .msg-typing {
    animation: none;
    opacity: 0.6;
  }
  .chat-status-text {
    animation: none;
    color: var(--text-color-muted);
    -webkit-text-fill-color: var(--text-color-muted);
  }
}
```

- [ ] **Step 5: Убрать неиспользуемый `MatButtonModule`**

В `src/app/mrsqm/pages/chat/chat-page.component.ts` удалить строку импорта и элемент массива `imports` (новый шаблон использует обычные `<button>`, не `mat-icon-button`):

Удалить строку:
```ts
import { MatButtonModule } from '@angular/material/button';
```
И убрать `MatButtonModule,` из массива `imports`.

- [ ] **Step 6: Запустить тесты — убедиться, что прошли**

Run: `npm run test:file src/app/mrsqm/pages/chat/chat-page.component.spec.ts`
Expected: PASS — все 18 тестов (13 из Task 1 + 5 новых DOM).

- [ ] **Step 7: checkFile (ts + scss)**

Run:
```bash
npm run checkFile src/app/mrsqm/pages/chat/chat-page.component.ts
npm run checkFile src/app/mrsqm/pages/chat/chat-page.component.scss
```
Expected: `All checks passed!` для обоих.

- [ ] **Step 8: Прод-сборка фронта (проверка типов/бюджета)**

Run: `npm run buildFrontend:prodWeb`
Expected: build complete без ошибок типов и бюджета.

- [ ] **Step 9: Commit**

```bash
git add src/app/mrsqm/pages/chat/chat-page.component.html src/app/mrsqm/pages/chat/chat-page.component.scss src/app/mrsqm/pages/chat/chat-page.component.ts src/app/mrsqm/pages/chat/chat-page.component.spec.ts
git commit -m "feat(chat): ChatGPT-вид таба AI Chat в теме SP — лента, чипы, композер-пилюля (S-3)"
```

---

## Документация после реализации

После Task 2 обновить (отдельным docs-коммитом):
- `docs/tabs.md` — раздел «AI Чат»: новый вид (центр-колонка, ассистент без пузыря, чипы, композер-пилюля, авто-скролл).
- `docs/TODO.md` — завести/закрыть S-3.
- `docs/tests.md` — запись по сборке/сюиту (T-S3).
