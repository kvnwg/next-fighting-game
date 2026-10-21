import { DEFAULT_SERVER_PORT, PROTOCOL_VERSION, type ClientMessage, type PlayerInfo, type ServerMessage } from '@nfg/shared';

/** Where the match server lives: ?server=..., a build-time env var, or this host on the default port. */
export function serverUrl(): string {
  const fromQuery = new URLSearchParams(window.location.search).get('server');
  if (fromQuery) return fromQuery;
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const secure = window.location.protocol === 'https:';
  const host = window.location.hostname || 'localhost';
  return `${secure ? 'wss' : 'ws'}://${host}:${DEFAULT_SERVER_PORT}`;
}

export class NetClient {
  /** Smoothed round-trip time in ms. */
  rtt: number | null = null;
  /** serverTime - Date.now(), estimated from pongs. */
  clockOffset = 0;
  private ws: WebSocket | null = null;
  private listeners: ((m: ServerMessage) => void)[] = [];
  private closeListeners: (() => void)[] = [];
  private pingTimer: ReturnType<typeof setInterval> | undefined;

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  onMessage(listener: (m: ServerMessage) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  onClose(listener: () => void): void {
    this.closeListeners.push(listener);
  }

  /** Opens the socket and completes the hello handshake. */
  connect(url: string, player: PlayerInfo, timeoutMs = 4000): Promise<void> {
    this.close();
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.close();
        reject(err);
      };
      const timer = setTimeout(() => fail(new Error('Connection timed out')), timeoutMs);
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        fail(err as Error);
        return;
      }
      this.ws = ws;
      ws.onopen = () => this.send({ t: 'hello', v: PROTOCOL_VERSION, player });
      ws.onerror = () => fail(new Error('Could not reach the match server'));
      ws.onclose = () => {
        clearInterval(this.pingTimer);
        if (!settled) fail(new Error('Connection closed'));
        else for (const l of this.closeListeners) l();
      };
      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.t === 'welcome' && !settled) {
          settled = true;
          clearTimeout(timer);
          this.clockOffset = msg.serverTime - Date.now();
          this.pingTimer = setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 2000);
          resolve();
        } else if (msg.t === 'error' && !settled) {
          fail(new Error(msg.message));
          return;
        }
        if (msg.t === 'pong') {
          const rtt = performance.now() - msg.ts;
          this.rtt = this.rtt === null ? rtt : this.rtt * 0.8 + rtt * 0.2;
          this.clockOffset = msg.serverTime + rtt / 2 - Date.now();
        }
        for (const l of this.listeners) l(msg);
      };
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Converts a server timestamp to local Date.now() time. */
  toLocal(serverTime: number): number {
    return serverTime - this.clockOffset;
  }

  close(): void {
    clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        // Already closed.
      }
    }
  }
}
