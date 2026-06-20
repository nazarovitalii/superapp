import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { MrsqmSupabaseService } from './supabase.service';

// ---------------------------------------------------------------------------
// Интерфейсы
// ---------------------------------------------------------------------------

export interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface StreamHandlers {
  onToolStart?: (tool: string) => void;
  onToolDone?: (tool: string) => void;
  onToken?: (text: string) => void;
  onDone?: (messageId?: string) => void;
  onError?: (message: string) => void;
}

export interface ChatHistoryMessage {
  id?: string;
  role: 'user' | 'assistant';
  text: string;
  created_at: string;
}

export interface TranscribeResult {
  text: string;
  // Какой провайдер расшифровал ('Groq' / 'Whisper') — бэкенд может не прислать
  provider?: string;
}

// ---------------------------------------------------------------------------
// parseSse — чистая функция (тестируется без сети)
// ---------------------------------------------------------------------------

/**
 * Разбирает накопленный SSE-буфер на завершённые события и хвост.
 * Буфер бьётся по '\n\n'; последний кусок всегда уходит в rest (может быть неполным).
 * Каждый завершённый кусок → ищем строки 'event:' и 'data:';
 * если обе есть и data корректный JSON → SseEvent; иначе кусок пропускается (но потребляется).
 */
export const parseSse = (buffer: string): { events: SseEvent[]; rest: string } => {
  const chunks = buffer.split('\n\n');
  // Последний элемент — всегда потенциально неполный хвост
  const rest = chunks.pop() ?? '';
  const events: SseEvent[] = [];

  for (const chunk of chunks) {
    if (!chunk.trim()) continue; // пустые куски игнорируем

    let eventName: string | undefined;
    let dataStr: string | undefined;

    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataStr = line.slice('data:'.length).trim();
      }
    }

    if (eventName === undefined || dataStr === undefined) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(dataStr) as Record<string, unknown>;
    } catch {
      // Битый JSON — кусок потреблён, но в events не добавляем
      continue;
    }

    events.push({ event: eventName, data: parsed });
  }

  return { events, rest };
};

// Заголовок Content-Type как константа, чтобы обойти lint naming-convention
const CONTENT_TYPE_HEADER = 'Content-Type';
const JSON_HEADERS: Record<string, string> = {
  [CONTENT_TYPE_HEADER]: 'application/json',
};

// ---------------------------------------------------------------------------
// GptStreamService
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class GptStreamService {
  private readonly _supabase = inject(MrsqmSupabaseService);
  private readonly _baseUrl = environment.gptServiceUrl;

  // ---- Публичное API --------------------------------------------------------

  /**
   * Запускает стриминг ответа GPT.
   * Возвращает AbortController — вызов .abort() прерывает поток.
   */
  streamMessage(text: string, h: StreamHandlers): AbortController {
    const controller = new AbortController();
    this._runStream(text, h, controller.signal).catch((e: unknown) => {
      if ((e as { name?: string })?.name === 'AbortError') return;
      h.onError?.((e as Error)?.message ?? String(e));
    });
    return controller;
  }

  /**
   * Загружает историю чата пользователя.
   * Если нет активной сессии — возвращает [].
   */
  async loadHistory(limit = 50): Promise<ChatHistoryMessage[]> {
    const token = await this._getToken();
    if (!token) return [];

    const res = await fetch(`${this._baseUrl}/chat/history?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const messages = ((await res.json()) as { messages: ChatHistoryMessage[] }).messages;
    // Защита от «сообщение юзера после ответа»: бэкенд пишет пару user+assistant
    // одним INSERT → одинаковый created_at, и сортировка сервера недетерминирована.
    // Стабилизируем: по времени, а при равном времени — user раньше assistant.
    return [...messages].sort((a, b) => {
      const t = (a.created_at ?? '').localeCompare(b.created_at ?? '');
      if (t !== 0) return t;
      if (a.role === b.role) return 0;
      return a.role === 'user' ? -1 : 1;
    });
  }

  /**
   * Отправляет оценку ответа ассистента.
   * reaction: 1 = 👍, -1 = 👎, 0 = снять оценку.
   * Ошибки не пробрасываются — оценка best-effort, UI не блокируется.
   */
  async sendFeedback(
    messageId: string,
    reaction: 0 | 1 | -1,
    reason?: string,
    comment?: string,
  ): Promise<void> {
    const token = await this._getToken();
    if (!token) return;
    const body: Record<string, unknown> = { message_id: messageId, reaction };
    if (reason !== undefined) body['reason'] = reason;
    if (comment !== undefined) body['comment'] = comment;
    await fetch(`${this._baseUrl}/chat/feedback`, {
      method: 'POST',
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  /**
   * «Новый чат» — ставит серверную границу сброса (POST /chat/reset).
   * Не удаление: старые сообщения остаются в базе, но история/контекст
   * начинаются после метки. Граница на сервере → синхронно на всех устройствах.
   * Ошибки не пробрасываются — экран всё равно очистится локально.
   */
  async resetChat(): Promise<void> {
    const token = await this._getToken();
    if (!token) return;
    await fetch(`${this._baseUrl}/chat/reset`, {
      method: 'POST',
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel: 'web' }),
    }).catch(() => {});
  }

  /**
   * Отправляет аудио на распознавание, возвращает текст + имя провайдера.
   * Пустой text = распознавание ничего не вернуло (тишина/коротко).
   * При сетевой/HTTP-ошибке БРОСАЕТ Error с деталью — раньше глотали молча и
   * пользователь видел просто пустое поле без причины.
   */
  async transcribe(blob: Blob): Promise<TranscribeResult> {
    const token = await this._getToken();
    if (!token) throw new Error('Нет активной сессии');
    const base64 = await this._blobToBase64(blob);
    const res = await fetch(`${this._baseUrl}/chat/transcribe`, {
      method: 'POST',
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ audio_base64: base64, mimetype: blob.type }),
    });
    if (!res.ok) {
      // Достаём текст ошибки бэкенда ({ error }) для понятной диагностики
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) detail = body.error;
      } catch {
        /* тело не JSON — оставляем HTTP-код */
      }
      throw new Error(detail);
    }
    const data = (await res.json()) as { text?: string; provider?: string };
    return { text: data.text ?? '', provider: data.provider };
  }

  /**
   * Отправляет сообщение без стриминга, возвращает готовый текст ответа.
   */
  async sendNonStreaming(text: string): Promise<string> {
    const token = await this._getToken();
    if (!token) throw new Error('not authenticated');

    const res = await fetch(`${this._baseUrl}/chat`, {
      method: 'POST',
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, channel: 'web' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return ((await res.json()) as { response: string }).response;
  }

  // ---- Приватные методы ----------------------------------------------------

  /** Конвертирует Blob в base64-строку (без data-url-префикса). */
  private _blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] ?? '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /** Возвращает access_token активной сессии или null. */
  private async _getToken(): Promise<string | null> {
    const {
      data: { session },
    } = await this._supabase.client.auth.getSession();
    return session?.access_token ?? null;
  }

  /** Основной цикл стриминга. */
  private async _runStream(
    text: string,
    h: StreamHandlers,
    signal: AbortSignal,
  ): Promise<void> {
    const token = await this._getToken();
    if (!token) throw new Error('not authenticated');

    const res = await fetch(`${this._baseUrl}/chat/stream`, {
      method: 'POST',
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, channel: 'web' }),
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;

    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        buffer += decoder.decode(result.value, { stream: true });
        const { events, rest } = parseSse(buffer);
        buffer = rest;
        for (const ev of events) {
          this._dispatchEvent(ev, h);
        }
      }
    }
  }

  /** Диспатчит одно SSE-событие в обработчики. */
  private _dispatchEvent(ev: SseEvent, h: StreamHandlers): void {
    switch (ev.event) {
      case 'tool_start':
        h.onToolStart?.(ev.data['tool'] as string);
        break;
      case 'tool_done':
        h.onToolDone?.(ev.data['tool'] as string);
        break;
      case 'token':
        h.onToken?.(ev.data['text'] as string);
        break;
      case 'done':
        h.onDone?.(ev.data['message_id'] as string | undefined);
        break;
      case 'error':
        h.onError?.(ev.data['message'] as string);
        break;
    }
  }
}
