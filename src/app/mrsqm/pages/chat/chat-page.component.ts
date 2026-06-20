import {
  Component,
  inject,
  ChangeDetectionStrategy,
  signal,
  computed,
  OnDestroy,
  ElementRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MarkdownComponent } from 'ngx-markdown';
import {
  GptStreamService,
  StreamHandlers,
  ChatHistoryMessage,
} from '../../services/gpt-stream.service';
import { PanelContentService } from '../../../features/panels/panel-content.service';
import { PropertyFeedItem } from '../../types/database';

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
// Префикс deep-ссылок на объект в ответах ассистента: [текст](mrsqm://property/<uuid>)
const PROPERTY_LINK_PREFIX = 'mrsqm://property/';

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
    MatTooltipModule,
    MarkdownComponent,
  ],
  templateUrl: './chat-page.component.html',
  styleUrl: './chat-page.component.scss',
})
export class ChatPageComponent implements OnDestroy {
  private readonly _gpt = inject(GptStreamService);
  private readonly _panels = inject(PanelContentService);

  // Текущий контроллер стрима для возможности остановки
  private _abort: AbortController | null = null;

  // MediaRecorder для голосового ввода
  private _mediaRecorder: MediaRecorder | null = null;
  private _audioChunks: Blob[] = [];
  // Запись отменена крестиком (✕) → расшифровку не запускаем
  private _discardRecording = false;
  // Таймер длительности записи
  private _recTimer: ReturnType<typeof setInterval> | null = null;

  // Web Audio для живой звуковой дорожки во время записи
  private _audioCtx: AudioContext | null = null;
  private _analyser: AnalyserNode | null = null;
  private _waveBuf: Uint8Array<ArrayBuffer> | null = null;
  private _waveData: number[] = []; // скользящий буфер амплитуд (0..1)
  private _waveRaf: number | null = null;
  private _waveW = 0; // кэш размеров/цвета canvas (без per-frame reflow)
  private _waveH = 0;
  private _waveColor = '';

  // Ссылки на DOM — только через viewChild (без прямого доступа)
  private readonly _messagesEl = viewChild<ElementRef<HTMLElement>>('messagesEl');
  private readonly _inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('inputEl');
  private readonly _waveCanvas = viewChild<ElementRef<HTMLCanvasElement>>('waveCanvas');

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
  // Длительность записи (сек) → таймер mm:ss в строке «Слушаю…»
  readonly recSeconds = signal<number>(0);
  readonly recTimeLabel = computed<string>(() => {
    const s = this.recSeconds();
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  });
  // Обновление истории с сервера
  readonly refreshing = signal<boolean>(false);
  // Поповер подсказок над композером
  readonly showSuggestions = signal<boolean>(false);

  // Чипы-подсказки (read-only)
  readonly suggestions: readonly Suggestion[] = SUGGESTIONS;
  readonly dislikeReasons: typeof DISLIKE_REASONS = DISLIKE_REASONS;

  constructor() {
    void this._init();
  }

  ngOnDestroy(): void {
    this._abort?.abort();
    // Уничтожаемся во время записи → отбрасываем, чтобы onstop не дёрнул расшифровку
    this._discardRecording = true;
    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
      this._mediaRecorder.stop();
    }
    this._stopWave();
    this._stopRecTimer();
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

  // ─── Обновление / очистка истории ────────────────────────────────────────

  async reloadHistory(): Promise<void> {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    try {
      const history = await this._gpt.loadHistory();
      this.messages.set(
        history.map((m) => ({ role: m.role, text: m.text, messageId: m.id })),
      );
      this._scheduleScroll();
    } catch {
      // сеть/401 — молча, текущие сообщения остаются
    } finally {
      this.refreshing.set(false);
    }
  }

  clearMessages(): void {
    if (this.streaming()) this.stop();
    // Серверная граница сброса (best-effort) — чтобы бот забыл старый контекст
    // и чистый чат подтянулся на других устройствах. Экран чистим сразу.
    void this._gpt.resetChat();
    this.messages.set([]);
    this.draft.set('');
    this.error.set(null);
    this.feedbackReasonIdx.set(null);
    this.showSuggestions.set(false);
    this._collapseInput();
  }

  // ─── Поповер подсказок ────────────────────────────────────────────────────

  toggleSuggestions(): void {
    this.showSuggestions.update((v) => !v);
  }

  closeSuggestions(): void {
    this.showSuggestions.set(false);
  }

  // ─── Голосовой ввод (ChatGPT-стиль) ───────────────────────────────────────
  // Микрофон стартует запись. На время записи композер превращается в строку
  // «Слушаю…» с живой звуковой дорожкой: ✕ — отменить, ✓ — закончить и
  // расшифровать. Затем в той же строке «Расшифровка…», после чего текст
  // вставляется в поле ввода.

  async startRecording(): Promise<void> {
    if (this.recording() || this.transcribing() || this.streaming()) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Нет прав на микрофон — молча игнорируем
      return;
    }

    this._audioChunks = [];
    this._discardRecording = false;

    const mimeType =
      ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(
        (t) => MediaRecorder.isTypeSupported(t),
      ) ?? '';

    this._mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this._mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this._audioChunks.push(e.data);
    };
    this._mediaRecorder.onstop = () => void this._onRecordingStopped(stream, mimeType);
    this._mediaRecorder.start();

    this.recording.set(true);
    this._startRecTimer();
    this._setupWave(stream);
  }

  // Закончить (✓) → останавливаем рекордер, дальше расшифровка
  confirmRecording(): void {
    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
      this._mediaRecorder.stop();
    }
  }

  // Отменить (✕) → останавливаем и отбрасываем запись без расшифровки
  cancelRecording(): void {
    this._discardRecording = true;
    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
      this._mediaRecorder.stop();
    } else {
      this.recording.set(false);
      this._stopWave();
      this._stopRecTimer();
    }
  }

  // Рекордер остановлен: гасим дорожку/таймер; если не отменено — расшифровываем
  private async _onRecordingStopped(
    stream: MediaStream,
    mimeType: string,
  ): Promise<void> {
    stream.getTracks().forEach((t) => t.stop());
    this._stopWave();
    this._stopRecTimer();
    this.recording.set(false);

    const discard = this._discardRecording;
    this._discardRecording = false;
    if (discard || this._audioChunks.length === 0) {
      this._audioChunks = [];
      return;
    }

    this.transcribing.set(true);
    const blob = new Blob(this._audioChunks, { type: mimeType || 'audio/webm' });
    this._audioChunks = [];
    const text = await this._gpt.transcribe(blob);
    this.transcribing.set(false);

    if (text) {
      const current = this.draft();
      this.draft.set(current ? current + ' ' + text : text);
      // Поле ввода перерисуется только после CD (сейчас на его месте дорожка),
      // поэтому рост под текст и фокус — на следующем кадре, когда textarea в DOM.
      requestAnimationFrame(() => {
        this._autoGrow();
        this._inputEl()?.nativeElement.focus();
      });
    }
  }

  // ─── Звуковая дорожка (Web Audio → canvas) ────────────────────────────────

  private _setupWave(stream: MediaStream): void {
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;
      this._audioCtx = new Ctx();
      void this._audioCtx.resume?.().catch(() => {});
      const source = this._audioCtx.createMediaStreamSource(stream);
      this._analyser = this._audioCtx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.smoothingTimeConstant = 0.65;
      source.connect(this._analyser);
      this._waveBuf = new Uint8Array(this._analyser.fftSize);
      this._waveData = [];
      this._waveW = 0;
      this._waveH = 0;
      this._waveColor = '';
      this._startWaveLoop();
    } catch {
      // Web Audio недоступен — запись идёт без визуализации
    }
  }

  private _startWaveLoop(): void {
    const tick = (): void => {
      this._waveRaf = requestAnimationFrame(tick);
      const analyser = this._analyser;
      const buf = this._waveBuf;
      const canvas = this._waveCanvas()?.nativeElement;
      if (!analyser || !buf || !canvas) return;

      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      this._waveData.push(peak);
      if (this._waveData.length > 96) this._waveData.shift();

      this._renderWave(canvas);
    };
    this._waveRaf = requestAnimationFrame(tick);
  }

  private _renderWave(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Размеры/цвет кэшируем при первом кадре (canvas уже в DOM)
    if (this._waveW === 0) {
      this._waveW = canvas.clientWidth;
      this._waveH = canvas.clientHeight;
      this._waveColor = getComputedStyle(canvas).color || 'rgba(140,140,140,1)';
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(this._waveW * dpr);
      canvas.height = Math.round(this._waveH * dpr);
    }
    if (this._waveW === 0 || this._waveH === 0) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this._waveW, this._waveH);
    ctx.fillStyle = this._waveColor;

    const barW = 3;
    const step = barW + 2; // ширина столбика + зазор
    const count = Math.max(1, Math.floor(this._waveW / step));
    const data = this._waveData.slice(-count);
    const mid = this._waveH / 2;
    const maxBarH = this._waveH - 2;

    // Каждый множитель/делитель — в отдельной строке: одна операция на строку,
    // чтобы не ловить no-mixed-operators и не плодить «лишние» скобки (их срежет prettier).
    for (let i = 0; i < data.length; i++) {
      const amp = Math.min(1, data[i] * 2.2);
      const barH = Math.max(2, amp * maxBarH);
      const halfBar = barH / 2;
      const x = i * step;
      const y = mid - halfBar;
      // Тише → бледнее: эффект «свечения» дорожки по голосу
      const fade = amp * 0.7;
      ctx.globalAlpha = 0.3 + fade;
      ctx.fillRect(x, y, barW, barH);
    }
    ctx.globalAlpha = 1;
  }

  private _stopWave(): void {
    if (this._waveRaf !== null) {
      cancelAnimationFrame(this._waveRaf);
      this._waveRaf = null;
    }
    this._analyser = null;
    this._waveBuf = null;
    this._waveData = [];
    this._waveW = 0;
    this._waveH = 0;
    if (this._audioCtx) {
      void this._audioCtx.close().catch(() => {});
      this._audioCtx = null;
    }
  }

  private _startRecTimer(): void {
    this.recSeconds.set(0);
    this._recTimer = setInterval(() => this.recSeconds.update((s) => s + 1), 1000);
  }

  private _stopRecTimer(): void {
    if (this._recTimer !== null) {
      clearInterval(this._recTimer);
      this._recTimer = null;
    }
  }

  // ─── Чип-подсказка → сразу отправляем ────────────────────────────────────

  sendSuggestion(prompt: string): void {
    this.showSuggestions.set(false);
    this.draft.set('');
    this._collapseInput();
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
      this._collapseInput();
      this.send(text);
    }
  }

  onSendClick(): void {
    const text = this.draft();
    this.draft.set('');
    this._collapseInput();
    this.send(text);
  }

  // ─── Клик по ссылке объекта в ответе ассистента ──────────────────────────
  // Ссылка вида [текст](mrsqm://property/<uuid>) → открываем объект в правой
  // панели. Обычные http-ссылки (Bayut и т.п.) не трогаем — отдаём браузеру.
  onMessageClick(event: MouseEvent): void {
    const link = (event.target as HTMLElement).closest('a');
    if (!link) return;
    const href = link.getAttribute('href') ?? '';
    if (!href.startsWith(PROPERTY_LINK_PREFIX)) return;
    event.preventDefault();
    const id = href.slice(PROPERTY_LINK_PREFIX.length).replace(/\/+$/, '');
    if (id) void this._openPropertyInPanel(id);
  }

  // Открывает карточку объекта по uuid в правой панели.
  // Передаём минимальную заглушку: property-detail сам догрузит полную карточку
  // через существующий RPC get_property (его vm() берёт d?.X ?? f.X по каждому
  // полю — заглушка мгновенно перекрывается загруженными данными).
  private _openPropertyInPanel(id: string): void {
    this._panels.openProperty({ id } as unknown as PropertyFeedItem);
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

  // Схлопывание поля после отправки/очистки. Намеренно НЕ через scrollHeight:
  // на момент вызова [value]="draft()" ещё не сброшен в DOM, и scrollHeight
  // вернул бы старую большую высоту → поле «скакало» бы вверх после отправки
  // (особенно заметно на планшете). height:auto сразу даёт высоту в одну строку.
  private _collapseInput(): void {
    const el = this._inputEl()?.nativeElement;
    if (el) el.style.height = 'auto';
  }
}
