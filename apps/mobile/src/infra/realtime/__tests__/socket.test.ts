/**
 * RealtimeSocket — bad-network survival (§M8/§L4, §R2 failure scenarios).
 *
 * The reference network is not "wifi at a desk", it is a 3 GB Android on a train: a TCP
 * connection that opens and then stalls mid-handshake, a captive portal that swallows the
 * upgrade, a tower handoff that black-holes the socket without ever delivering `onclose`.
 *
 * The SyncEngine is single-flight (`if (this.socket) return`) and only re-arms when the
 * transport REPORTS a close. So a socket that hangs in CONNECTING forever is not a slow
 * connect — it is a permanently dead app that still renders as "connecting". The transport
 * must therefore bound its own handshake and report a close like any other failure.
 */
type SocketModule = typeof import('../socket');

/** `socket.ts` captures the global `WebSocket` when the module loads, so the fake has to be
 *  installed BEFORE the import — hence the per-test `resetModules()` + `require()`. */
let RealtimeSocket: SocketModule['RealtimeSocket'];
let WS_CODE_DEAD: SocketModule['WS_CODE_DEAD'];
let WS_CODE_UNAUTHORIZED: SocketModule['WS_CODE_UNAUTHORIZED'];

/** Minimal fake of the RN WebSocket: never resolves unless the test drives it. */
class FakeWebSocket {
  static last: FakeWebSocket | null = null;
  static instances = 0;
  readyState = 0; // CONNECTING
  closed = false;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;

  /** Mirrors the real signature `(url, protocols, {headers})`. The options argument is
   *  CAPTURED rather than ignored: which of the two channels the token rides is the thing
   *  under test, and a fake that swallowed the third argument would pass either way. */
  constructor(
    public url: string,
    public protocols?: unknown,
    public options?: { headers?: Record<string, string> },
  ) {
    FakeWebSocket.last = this;
    FakeWebSocket.instances += 1;
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3; // CLOSED
  }
  /** Drive the handshake to OPEN, as a real server would. */
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
}

const originalWs = (global as { WebSocket?: unknown }).WebSocket;

beforeEach(() => {
  jest.useFakeTimers();
  FakeWebSocket.last = null;
  FakeWebSocket.instances = 0;
  (global as { WebSocket?: unknown }).WebSocket = FakeWebSocket;
  jest.resetModules();
  const mod = require('../socket') as SocketModule;
  RealtimeSocket = mod.RealtimeSocket;
  WS_CODE_DEAD = mod.WS_CODE_DEAD;
  WS_CODE_UNAUTHORIZED = mod.WS_CODE_UNAUTHORIZED;
});

afterEach(() => {
  jest.useRealTimers();
  (global as { WebSocket?: unknown }).WebSocket = originalWs;
});

describe('RealtimeSocket — handshake that never completes', () => {
  it('reports a close when the socket never opens, so the engine can back off and retry', () => {
    const onClose = jest.fn();
    const socket = new RealtimeSocket({ onClose });

    socket.connect('tok', 'wss://example.test/ws');
    expect(FakeWebSocket.last).not.toBeNull();

    // Still mid-handshake: nothing reported yet, and the engine correctly sees it as in-flight.
    jest.advanceTimersByTime(5_000);
    expect(onClose).not.toHaveBeenCalled();
    expect(socket.isActive).toBe(true);

    // The handshake never completes. Without a bound, this hangs forever.
    jest.advanceTimersByTime(60_000);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose.mock.calls[0]?.[0]).toBe(WS_CODE_DEAD);
    // The engine must see a free slot, or its single-flight guard blocks every retry.
    expect(socket.isActive).toBe(false);
    expect(FakeWebSocket.last?.closed).toBe(true);
  });

  it('does not report a close when the handshake completes in time', () => {
    const onClose = jest.fn();
    const onOpen = jest.fn();
    const socket = new RealtimeSocket({ onClose, onOpen });

    socket.connect('tok', 'wss://example.test/ws');
    FakeWebSocket.last?.open();
    expect(onOpen).toHaveBeenCalledTimes(1);

    // Well past any connect deadline — a live socket must never be torn down by it.
    jest.advanceTimersByTime(45_000);
    expect(onClose).not.toHaveBeenCalled();
    expect(socket.isActive).toBe(true);

    socket.close();
  });

  it('reports a dead link once when an opened socket goes silent (watchdog)', () => {
    const onClose = jest.fn();
    const socket = new RealtimeSocket({ onClose });

    socket.connect('tok', 'wss://example.test/ws');
    FakeWebSocket.last?.open();

    // No inbound frame at all — the tower black-holed us without an onclose.
    jest.advanceTimersByTime(90_000);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose.mock.calls[0]?.[0]).toBe(WS_CODE_DEAD);
    expect(socket.isActive).toBe(false);
  });
});

/**
 * Where the access token rides (VC-037).
 *
 * A query string is not a private channel. Every hop on the path writes the request line to an
 * access log verbatim, and this deployment's own edge proves the asymmetry: the Caddyfile logs
 * with `format console` — which prints the URI — under a comment saying `Authorization` is
 * never logged because it carries access tokens. Same secret, same request; only the placement
 * decides whether it is retained on disk at every proxy between the phone and the fabric.
 *
 * The gateway has read `Authorization: Bearer` since `/ws` first existed (`extractToken` in
 * `libs/feature-realtime/src/fabric/ws-fabric.ts` prefers the header and only then falls back to
 * `?token=`), so this is not a capability to negotiate with the backend — it is the channel that
 * was always there, and was passed over on a platform assumption that does not hold.
 */
describe('RealtimeSocket — the access token never touches the URL', () => {
  it('hands the token to the transport as an Authorization header', () => {
    const socket = new RealtimeSocket({});

    socket.connect('tok-abc', 'wss://example.test/ws');

    expect(FakeWebSocket.last?.options?.headers?.Authorization).toBe(
      'Bearer tok-abc',
    );
    socket.close();
  });

  it('leaves the connect URL byte-identical to the configured one', () => {
    const socket = new RealtimeSocket({});

    socket.connect('tok-abc', 'wss://example.test/ws');

    // Asserted on the URL string itself, not on the absence of a `token` key: any future
    // re-introduction — a differently named parameter, a fragment, an encoded copy — is the
    // same leak into the same logs, and an assertion about one spelling would not catch it.
    expect(FakeWebSocket.last?.url).toBe('wss://example.test/ws');
    expect(FakeWebSocket.last?.url).not.toContain('tok-abc');
    socket.close();
  });

  it('does not append to a base URL that already carries query parameters', () => {
    const socket = new RealtimeSocket({});

    socket.connect('tok-abc', 'wss://example.test/ws?region=in');

    expect(FakeWebSocket.last?.url).toBe('wss://example.test/ws?region=in');
    expect(FakeWebSocket.last?.url).not.toContain('tok-abc');
    socket.close();
  });

  it('authenticates a reconnect with the token it is handed, not the one it first saw', () => {
    // This is the 4001 self-heal seen from the transport's side. The engine builds a FRESH
    // RealtimeSocket per attempt and passes whatever the token store holds at that moment —
    // after a 4001 that is a just-refreshed token. A transport that bound its credential once,
    // at module load or at construction, would reconnect forever with the token the gateway
    // has already rejected, and the app would render "connecting" until a force-quit.
    const onClose = jest.fn();
    const first = new RealtimeSocket({ onClose });
    first.connect('tok-expired', 'wss://example.test/ws');
    FakeWebSocket.last?.open();

    // The gateway refuses the expired token exactly as it would in production.
    FakeWebSocket.last?.onclose?.({ code: 4001, reason: 'unauthorized' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose.mock.calls[0]?.[0]).toBe(WS_CODE_UNAUTHORIZED);

    const second = new RealtimeSocket({});
    second.connect('tok-refreshed', 'wss://example.test/ws');

    expect(FakeWebSocket.instances).toBe(2);
    expect(FakeWebSocket.last?.options?.headers?.Authorization).toBe(
      'Bearer tok-refreshed',
    );
    expect(FakeWebSocket.last?.url).toBe('wss://example.test/ws');
    second.close();
  });
});
