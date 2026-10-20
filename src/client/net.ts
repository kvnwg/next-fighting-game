/** WebSocket connection with clock sync against the server. */
import { ClientMsg, ServerMsg } from '../shared/protocol';

type Handler<T extends ServerMsg['t']> = (m: Extract<ServerMsg, { t: T }>) => void;

export class Net {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, ((m: ServerMsg) => void)[]>();
  private pingTimer: number | null = null;
  /** serverTime ≈ performance.now() + offset */
  private offset = 0;
  private synced = false;
  private samples: { rtt: number; offset: number }[] = [];
  rtt = 0;
  connected = false;
  onClose: ((reason: string) => void) | null = null;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        this.connected = true;
        this.ping();
        this.pingTimer = window.setInterval(() => this.ping(), 1000);
        resolve();
      };
      ws.onerror = () => {
        if (!this.connected) reject(new Error('Could not reach the game server.'));
      };
      ws.onclose = (e) => {
        const was = this.connected;
        this.connected = false;
        if (this.pingTimer) clearInterval(this.pingTimer);
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
        const hs = this.handlers.get(m.t);
        if (hs) for (const h of hs) h(m);
      };
    });
  }

  close(): void {
    this.ws?.close();
  }

  on<T extends ServerMsg['t']>(t: T, h: Handler<T>): void {
    const list = this.handlers.get(t) ?? [];
    list.push(h as (m: ServerMsg) => void);
    this.handlers.set(t, list);
  }

  send(m: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
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
