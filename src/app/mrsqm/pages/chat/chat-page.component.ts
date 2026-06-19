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
  messageId?: string;
  feedback?: 'like' | 'dislike';
  copied?: boolean;
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

// Причины дизлайка (key → /chat/feedback reason, label — на чипе)
const DISLIKE_REASONS = [
  { key: 'inaccurate', label: 'Неточно' },
  { key: 'not_understood', label: 'Не понял задачу' },
  { key: 'bad_listing', label: 'Плохие объявления' },
  { key: 'wrong_price', label: 'Неверные цены' },
  { key: 'other', label: 'Другое' },
] as const;

type DislikeReasonKey = (typeof DISLIKE_REASONS)[number]['key'];

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
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule, MarkdownComponent],
  templateUrl: './chat-page.component.html',
  styleUrl: './chat-page.component.scss',
})
export class ChatPageComponent implements OnDestroy {
  private readonly _gpt = inject(GptStreamService);

  // Текущий контроллер стрима для возможности остановки
  private _abort: AbortController | null = null;

  // MediaRecorder для голосового ввода
  private _mediaRecorder: MediaRecorder | null = null;
  private _audioChunks: Blob[] = [];

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
  // Индекс сообщения, для которого открыт picker причины дизлайка (null = закрыт)
  readonly feedbackReasonIdx = signal<number | null>(null);
  // Голосовой ввод: идёт запись / ждём расшифровку
  readonly recording = signal<boolean>(false);
  readonly transcribing = signal<boolean>(false);

  // Чипы-подсказки (read-only)
  readonly suggestions: readonly Suggestion[] = SUGGESTIONS;
  readonly dislikeReasons: typeof DISLIKE_REASONS = DISLIKE_REASONS;

  constructor() {
    void this._init();
  }

  ngOnDestroy(): void {
    this._abort?.abort();
    if (this._mediaRecorder?.state !== 'inactive') {
      this._mediaRecorder?.stop();
    }
  }

  // ─── Инициализация (загрузка истории) ────────────────────────────────────

  private async _init(): Promise<void> {
    try {
      const history: ChatHistoryMessage[] = await this._gpt.loadHistory();
      this.messages.set(
        history.map((m) => ({ role: m.role, text: m.text, messageId: m.id })),
      );
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
      onDone: (messageId?: string) => {
        this.messages.update((msgs) => {
          const last = msgs[msgs.length - 1];
          if (!last) return msgs;
          return [...msgs.slice(0, -1), { ...last, streaming: false, messageId }];
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

  // ─── Голосовой ввод ───────────────────────────────────────────────────────

  async toggleMic(): Promise<void> {
    if (this.recording()) {
      this._mediaRecorder?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._audioChunks = [];

      const mimeType =
        [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/mp4',
        ].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

      this._mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      this._mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this._audioChunks.push(e.data);
      };

      this._mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        this.recording.set(false);
        if (this._audioChunks.length === 0) return;

        this.transcribing.set(true);
        const blob = new Blob(this._audioChunks, { type: mimeType || 'audio/webm' });
        const text = await this._gpt.transcribe(blob);
        this.transcribing.set(false);

        if (text) {
          const current = this.draft();
          this.draft.set(current ? current + ' ' + text : text);
          this._autoGrow();
        }
      };

      this._mediaRecorder.start();
      this.recording.set(true);
    } catch {
      // Нет прав на микрофон — молча игнорируем
    }
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

  // ─── Действия под ответом (копировать / оценка) ──────────────────────────

  copyMessage(index: number): void {
    const msg = this.messages()[index];
    if (!msg) return;
    // Копирование best-effort: нет clipboard или отказ (не в фокусе) — не критично
    void navigator.clipboard?.writeText(msg.text)?.catch(() => {});
    this._patchMsg(index, { copied: true });
    setTimeout(() => this._patchMsg(index, { copied: false }), 1500);
  }

  setFeedback(index: number, kind: 'like' | 'dislike'): void {
    const msg = this.messages()[index];
    if (!msg) return;

    if (kind === 'like') {
      const next = msg.feedback === 'like' ? undefined : 'like';
      this._patchMsg(index, { feedback: next });
      this.feedbackReasonIdx.set(null);
      if (msg.messageId) {
        void this._gpt.sendFeedback(msg.messageId, next === 'like' ? 1 : 0);
      }
    } else {
      if (msg.feedback === 'dislike') {
        // повторный клик — снять
        this._patchMsg(index, { feedback: undefined });
        this.feedbackReasonIdx.set(null);
        if (msg.messageId) void this._gpt.sendFeedback(msg.messageId, 0);
      } else if (this.feedbackReasonIdx() === index) {
        // picker уже открыт → закрыть
        this.feedbackReasonIdx.set(null);
      } else {
        // открыть picker причины (commit после выбора)
        this.feedbackReasonIdx.set(index);
      }
    }
  }

  setDislikeReason(index: number, reason: DislikeReasonKey): void {
    const msg = this.messages()[index];
    if (!msg) return;
    this._patchMsg(index, { feedback: 'dislike' });
    this.feedbackReasonIdx.set(null);
    if (msg.messageId) void this._gpt.sendFeedback(msg.messageId, -1, reason);
  }

  // Иммутабельно патчит сообщение по индексу
  private _patchMsg(index: number, patch: Partial<ChatMessage>): void {
    this.messages.update((msgs) =>
      msgs.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }

  // ─── Скролл ленты ─────────────────────────────────────────────────────────

  onMessagesScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
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
