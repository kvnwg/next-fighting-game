/** WebSocket connection with clock sync against the server. */
import { ClientMsg, ServerMsg } from '../shared/protocol';

type Handler<T extends ServerMsg['t']> = (m: Extract<ServerMsg, { t: T }>) => void;

/** What Net needs from a socket: a browser WebSocket, or the in-page offline socket. */
export interface SocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: ((e: { reason: string }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export class Net {
  private ws: SocketLike | null = null;
  private handlers = new Map<string, ((m: ServerMsg) => void)[]>();
  private pingTimer: number | null = null;
  /** serverTime ≈ performance.now() + offset */
  private offset = 0;
  private synced = false;
  private samples: { rtt: number; offset: number }[] = [];
  rtt = 0;
  connected = false;
  onClose: ((reason: string) => void) | null = null;
  /** messages waiting while the connection is held (see hold) */
  private held: ServerMsg[] | null = null;
  /** sees each message as it's queued while held */
  onHeld: ((m: ServerMsg) => void) | null = null;

  /** Connect to a WebSocket URL, or pass a factory for another transport (offline mode). */
  connect(target: string | (() => SocketLike)): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws: SocketLike = typeof target === 'string' ? (new WebSocket(target) as unknown as SocketLike) : target();
      this.ws = ws;
      // a server that never answers (asleep, blocked) would otherwise hang here
      const timeout = setTimeout(() => {
        if (this.connected) return;
        reject(new Error('Could not reach the game server.'));
        ws.close();
      }, 12_000);
      ws.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        this.ping();
        this.pingTimer = window.setInterval(() => this.ping(), 1000);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        if (!this.connected) reject(new Error('Could not reach the game server.'));
      };
      ws.onclose = (e) => {
        const was = this.connected;
        this.connected = false;
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.held = null;
        if (was) this.onClose?.(e.reason || 'Connection lost');
      };
      ws.onmessage = (e) => {
        let m: ServerMsg;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        if (m.t === 'pong') this.onPong(m);
        if (m.t === 'sping') this.send({ t: 'spong', s: m.s });
        if (m.t === 'welcome' && !this.synced) {
          this.offset = m.serverTime - performance.now();
        }
        if (this.held) {
          this.held.push(m);
          this.onHeld?.(m);
          return;
        }
        this.dispatch(m);
      };
    });
  }

  close(): void {
    this.ws?.close();
  }

  private dispatch(m: ServerMsg): void {
    const hs = this.handlers.get(m.t);
    if (hs) for (const h of hs) h(m);
  }

  /**
   * Queue incoming messages instead of handling them (clock sync and pings carry on), so the title
   * screen can finish its scene before the game takes over. release() handles the queue in order.
   */
  hold(): void {
    this.held ??= [];
  }

  release(): void {
    const q = this.held;
    this.held = null;
    this.onHeld = null;
    if (q) for (const m of q) this.dispatch(m);
  }

  on<T extends ServerMsg['t']>(t: T, h: Handler<T>): void {
    const list = this.handlers.get(t) ?? [];
    list.push(h as (m: ServerMsg) => void);
    this.handlers.set(t, list);
  }

  send(m: ClientMsg): void {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  private ping(): void {
    this.send({ t: 'ping', c: performance.now() });
  }

  private onPong(m: Extract<ServerMsg, { t: 'pong' }>): void {
    const now = performance.now();
    const rtt = now - m.c;
    this.samples.push({ rtt, offset: m.s + rtt / 2 - now });
    if (this.samples.length > 10) this.samples.shift();
    // trust the lowest-latency samples most: they have the least queueing noise
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 3);
    const offset = best.reduce((s, x) => s + x.offset, 0) / best.length;
    this.rtt = this.synced ? this.rtt * 0.8 + rtt * 0.2 : rtt;
    if (!this.synced) {
      this.offset = offset;
      this.synced = true;
    } else {
      // slew instead of jumping so animations never hitch
      this.offset += (offset - this.offset) * 0.25;
    }
  }

  /** Estimated current server time (ms). */
  serverNow(): number {
    return performance.now() + this.offset;
  }

  /** Convert a performance.now() timestamp to server time. */
  toServer(perfTime: number): number {
    return perfTime + this.offset;
  }
}
