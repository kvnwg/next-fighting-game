/**
 * Single-player mode: the authoritative game server runs inside the page and the client talks to it
 * through an in-memory socket pair, so the exact same code paths run as online.
 */
import { Game } from '../server/game';
import { Profile, Store, StorePersistence } from '../server/store';
import type { SocketLike } from '../server/entities';
import type { SocketLike as ClientSocketLike } from './net';

const PROFILES_KEY = 'deflect.offline.profiles.v1';

const localPersistence: StorePersistence = {
  load() {
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      return raw ? (JSON.parse(raw) as Profile[]) : [];
    } catch {
      return [];
    }
  },
  save(profiles) {
    try {
      localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    } catch {
      // storage blocked (private window): progress just won't persist
    }
  },
};

type Listener = (data?: unknown) => void;

/** Server end: looks like a `ws` WebSocket to the Game. */
class ServerEnd implements SocketLike {
  readyState = 0;
  private listeners = new Map<string, Listener[]>();
  constructor(private readonly client: ClientEnd) {}

  on(event: string, cb: Listener): this {
    const list = this.listeners.get(event) ?? [];
    list.push(cb);
    this.listeners.set(event, list);
    return this;
  }

  emit(event: string, data?: unknown): void {
    for (const cb of this.listeners.get(event) ?? []) cb(data);
  }

  send(data: string): void {
    if (this.readyState !== 1) return;
    queueMicrotask(() => this.client.deliver(data));
  }

  close(_code?: number, reason = ''): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    queueMicrotask(() => {
      this.emit('close');
      this.client.remoteClosed(reason);
    });
  }
}

/** Client end: looks like a browser WebSocket to the Net class. */
class ClientEnd implements ClientSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  server!: ServerEnd;

  send(data: string): void {
    if (this.readyState !== 1) return;
    queueMicrotask(() => this.server.emit('message', data));
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.server.close(1000, 'closed');
  }

  deliver(data: string): void {
    if (this.readyState === 1) this.onmessage?.({ data });
  }

  remoteClosed(reason: string): void {
    const was = this.readyState;
    this.readyState = 3;
    if (was !== 3) this.onclose?.({ reason });
  }
}

let game: Game | null = null;

/** Start (once) the in-page server and open a socket to it. */
export function connectOffline(): ClientSocketLike {
  if (!game) {
    game = new Game(new Store(localPersistence), undefined, { offline: true, roamers: 4 });
    game.start();
    addEventListener('pagehide', () => game?.store.flush());
  }
  const client = new ClientEnd();
  const server = new ServerEnd(client);
  client.server = server;
  game.handleConnection(server);
  queueMicrotask(() => {
    client.readyState = 1;
    server.readyState = 1;
    client.onopen?.();
  });
  return client;
}
