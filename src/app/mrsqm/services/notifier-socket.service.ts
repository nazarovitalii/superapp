import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

// Только WebSocket: коннект с JWT в subprotocol, авто-реконнект (backoff+jitter),
// свежий токен на каждый коннект. Без состояния/UI. Payload не парсим в данные —
// читаем только type==='bell.changed' (brief §3.1, прил. A).
@Injectable({ providedIn: 'root' })
export class NotifierSocketService {
  private readonly _opened$ = new Subject<void>();
  private readonly _changed$ = new Subject<void>();
  readonly opened$ = this._opened$.asObservable();
  readonly changed$ = this._changed$.asObservable();

  private _ws: WebSocket | null = null;
  private _getToken: (() => Promise<string | null>) | null = null;
  private _stopped = true;
  private _attempt = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(getToken: () => Promise<string | null>): void {
    this.disconnect(); // закрыть прежний сокет/таймер, если есть (без orphan-реконнекта)
    this._getToken = getToken;
    this._stopped = false;
    this._attempt = 0;
    void this._open();
  }

  disconnect(): void {
    this._stopped = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.onclose = null; // не триггерить реконнект на ручном закрытии
      this._ws.close();
      this._ws = null;
    }
  }

  private async _open(): Promise<void> {
    if (this._stopped || !this._getToken) return;
    const token = await this._getToken();
    if (this._stopped || !token) return;

    const ws = new WebSocket(environment.notifierWsUrl, [token]);
    this._ws = ws;
    ws.onopen = () => {
      this._attempt = 0;
      this._opened$.next();
    };
    ws.onmessage = (e: MessageEvent) => {
      try {
        if (JSON.parse(e.data as string)?.type === 'bell.changed') {
          this._changed$.next();
        }
      } catch {
        // не-JSON / без type — игнор
      }
    };
    ws.onclose = () => this._scheduleReconnect();
    ws.onerror = () => ws.close();
  }

  private _scheduleReconnect(): void {
    if (this._stopped) return;
    this._ws = null;
    this._attempt++;
    const power = 2 ** this._attempt;
    const base = Math.min(1000 * power, 30000);
    const half = base / 2;
    const jitter = Math.random() * half;
    const delay = half + jitter; // backoff + jitter
    this._reconnectTimer = setTimeout(() => void this._open(), delay);
  }

  /** @internal — только для юнит-тестов, не использовать в проде. */
  async _reconnectNowForTest(): Promise<void> {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    await this._open();
  }
}
