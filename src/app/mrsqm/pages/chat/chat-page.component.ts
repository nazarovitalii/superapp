import {
  Component,
  inject,
  ChangeDetectionStrategy,
  signal,
  OnDestroy,
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

  // ─── Состояние ────────────────────────────────────────────────────────────

  readonly messages = signal<ChatMessage[]>([]);
  readonly status = signal<string | null>(null);
  readonly streaming = signal<boolean>(false);
  readonly loadingHistory = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  // Черновик сообщения в поле ввода
  readonly draft = signal<string>('');

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
    } catch {
      // История недоступна — лента пустая, не критично
    } finally {
      this.loadingHistory.set(false);
    }
  }

  // ─── Отправка сообщения ───────────────────────────────────────────────────

  send(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.streaming()) return;

    this.error.set(null);

    // Добавляем пузырь пользователя и пустой пузырь ассистента
    this.messages.update((msgs) => [
      ...msgs,
      { role: 'user', text: trimmed },
      { role: 'assistant', text: '', streaming: true },
    ]);

    this.streaming.set(true);

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
    // Убираем мигающий курсор с последнего пузыря ассистента
    this.messages.update((msgs) => {
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== 'assistant') return msgs;
      return [...msgs.slice(0, -1), { ...last, streaming: false }];
    });
    this.streaming.set(false);
    this.status.set(null);
  }

  // ─── Обработка ввода (input → обновить сигнал draft) ─────────────────────

  onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  // ─── Обработка ввода (Enter без Shift → отправить) ───────────────────────

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const text = this.draft();
      this.draft.set('');
      this.send(text);
    }
  }

  onSendClick(): void {
    const text = this.draft();
    this.draft.set('');
    this.send(text);
  }
}
