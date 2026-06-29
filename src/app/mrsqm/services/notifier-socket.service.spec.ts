import { TestBed } from '@angular/core/testing';
import { NotifierSocketService } from './notifier-socket.service';

class FakeWebSocket {
  static last: FakeWebSocket | null = null;
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(
    public url: string,
    public protocols: string[],
  ) {
    FakeWebSocket.last = this;
    FakeWebSocket.instances.push(this);
  }
  close(): void {
    this.closed = true;
    this.onclose?.();
  }
}

describe('NotifierSocketService', () => {
  let svc: NotifierSocketService;
  let realWs: typeof WebSocket;

  beforeEach(() => {
    realWs = window.WebSocket;
    FakeWebSocket.last = null;
    FakeWebSocket.instances = [];
    (window as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    TestBed.configureTestingModule({ providers: [NotifierSocketService] });
    svc = TestBed.inject(NotifierSocketService);
  });

  afterEach(() => {
    svc.disconnect();
    (window as unknown as { WebSocket: unknown }).WebSocket = realWs;
  });

  it('connect передаёт токен в subprotocol', async () => {
    svc.connect(() => Promise.resolve('jwt-123'));
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.last?.protocols).toEqual(['jwt-123']);
  });

  it('эмитит opened на onopen', async () => {
    const opened = jasmine.createSpy('opened');
    svc.opened$.subscribe(opened);
    svc.connect(() => Promise.resolve('jwt'));
    await Promise.resolve();
    await Promise.resolve();
    FakeWebSocket.last?.onopen?.();
    expect(opened).toHaveBeenCalled();
  });

  it('эмитит changed только на type=bell.changed', async () => {
    const changed = jasmine.createSpy('changed');
    svc.changed$.subscribe(changed);
    svc.connect(() => Promise.resolve('jwt'));
    await Promise.resolve();
    await Promise.resolve();
    FakeWebSocket.last?.onmessage?.({ data: JSON.stringify({ type: 'other' }) });
    expect(changed).not.toHaveBeenCalled();
    FakeWebSocket.last?.onmessage?.({ data: JSON.stringify({ type: 'bell.changed' }) });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('реконнект берёт свежий токен на каждый коннект', async () => {
    let n = 0;
    const getToken = (): Promise<string> => Promise.resolve(`jwt-${++n}`);
    svc.connect(getToken);
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.last?.protocols).toEqual(['jwt-1']);
    FakeWebSocket.last?.onclose?.(); // обрыв → запланирован реконнект
    await svc.reconnectNowForTest();
    expect(FakeWebSocket.last?.protocols).toEqual(['jwt-2']);
  });

  it('disconnect закрывает сокет и не реконнектит', async () => {
    svc.connect(() => Promise.resolve('jwt'));
    await Promise.resolve();
    await Promise.resolve();
    const ws = FakeWebSocket.last;
    svc.disconnect();
    expect(ws?.closed).toBe(true);
    ws?.onclose?.();
    await Promise.resolve();
    expect(FakeWebSocket.instances.length).toBe(1);
  });
});
