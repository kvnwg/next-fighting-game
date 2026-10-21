import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  DEFAULT_SERVER_PORT,
  ENTRANCE_MS,
  LOAD_TIMEOUT_MS,
  PROTOCOL_VERSION,
  PressCounter,
  REMATCH_WAIT_MS,
  VOTE_MS,
  makeRoomCode,
  type ClientMessage,
  type ServerMessage,
} from '@nfg/shared';
import { Room, type Client, type RoomHost } from './room.ts';
import { MAX_MESSAGE_BYTES, parseClientMessage } from './validate.ts';

export interface GameServerOptions {
  port?: number;
  voteMs?: number;
  loadTimeoutMs?: number;
  entranceMs?: number;
  rematchWaitMs?: number;
  log?: boolean;
}

export interface GameServer {
  port: number;
  close(): Promise<void>;
}

const HEARTBEAT_MS = 15_000;

/** Token bucket used to rate-limit each connection. */
class Bucket {
  private tokens: number;
  private last = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
  ) {
    this.tokens = capacity;
  }

  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

interface Connection extends Client {
  readonly ws: WebSocket;
  readonly inputs: Bucket;
  readonly messages: Bucket;
  alive: boolean;
}

function rawToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

export async function createGameServer(opts: GameServerOptions = {}): Promise<GameServer> {
  const log = opts.log ? (...args: unknown[]) => console.log('[server]', ...args) : () => {};
  const connections = new Map<string, Connection>();
  const queue: Connection[] = [];
  const rooms = new Map<string, Room>();
  const codes = new Map<string, Room>();

  const host: RoomHost = {
    timings: {
      voteMs: opts.voteMs ?? VOTE_MS,
      loadTimeoutMs: opts.loadTimeoutMs ?? LOAD_TIMEOUT_MS,
      entranceMs: opts.entranceMs ?? ENTRANCE_MS,
      rematchWaitMs: opts.rematchWaitMs ?? REMATCH_WAIT_MS,
    },
    onClosed(room) {
      rooms.delete(room.roomId);
      if (codes.get(room.code) === room) codes.delete(room.code);
    },
    log,
  };

  function newRoom(isPrivate: boolean): Room {
    let roomId: string;
    do roomId = `r-${randomBytes(5).toString('hex')}`;
    while (rooms.has(roomId));
    let code: string;
    do code = makeRoomCode(Math.random);
    while (codes.has(code));
    const room = new Room(roomId, code, isPrivate, host);
    rooms.set(roomId, room);
    // Only private rooms can be joined by code; public rooms come from the queue.
    if (isPrivate) codes.set(code, room);
    return room;
  }

  function leaveEverything(c: Connection): void {
    if (c.queued) {
      const i = queue.indexOf(c);
      if (i >= 0) queue.splice(i, 1);
      c.queued = false;
    }
    if (c.room) c.room.remove(c);
  }

  function pairQueue(): void {
    while (queue.length >= 2) {
      const a = queue.shift()!;
      const b = queue.shift()!;
      a.queued = false;
      b.queued = false;
      const room = newRoom(false);
      room.add(a);
      room.add(b);
    }
  }

  function onMessage(c: Connection, msg: ClientMessage): void {
    if (!c.player) {
      if (msg.t !== 'hello') return;
      if (msg.v !== PROTOCOL_VERSION) {
        c.send({ t: 'error', message: `Protocol ${msg.v} is not supported; server speaks ${PROTOCOL_VERSION}.` });
        c.ws.close(1008, 'protocol version');
        return;
      }
      c.player = msg.player;
      c.send({ t: 'welcome', id: c.id, serverTime: Date.now() });
      return;
    }

    if (msg.t === 'input') {
      if (!c.inputs.take() || msg.seq < c.lastSeq) return;
      c.lastSeq = msg.seq;
      c.input = { seq: msg.seq, mx: msg.mx, my: msg.my, held: msg.held, counts: msg.counts };
      return;
    }
    // State-changing messages are idempotent and must never be dropped (a lost final
    // progress report would stall loading until the timeout); everything else is throttled.
    const critical =
      msg.t === 'leave' || msg.t === 'skip' || msg.t === 'rematch' || (msg.t === 'progress' && msg.value >= 1);
    if (!critical && !c.messages.take()) return;

    switch (msg.t) {
      case 'hello':
        return;
      case 'ping':
        c.send({ t: 'pong', ts: msg.ts, serverTime: Date.now() });
        return;
      case 'queue':
        if (c.queued) return;
        leaveEverything(c);
        queue.push(c);
        c.queued = true;
        c.send({ t: 'queued' });
        pairQueue();
        return;
      case 'create': {
        leaveEverything(c);
        newRoom(true).add(c);
        return;
      }
      case 'join': {
        const room = codes.get(msg.code);
        if (!room || room.closed) {
          c.send({ t: 'error', message: 'Room not found.' });
          return;
        }
        if (c.room === room) return;
        if (room.isFull()) {
          c.send({ t: 'error', message: 'Room is full.' });
          return;
        }
        leaveEverything(c);
        room.add(c);
        return;
      }
      case 'leave':
        leaveEverything(c);
        return;
      default:
        c.room?.handle(c, msg);
    }
  }

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && path === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: connections.size }));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES * 2 });

  wss.on('connection', (ws: WebSocket) => {
    let id: string;
    do id = randomBytes(6).toString('hex');
    while (connections.has(id));
    const c: Connection = {
      id,
      ws,
      player: null,
      room: null,
      seat: 0,
      queued: false,
      input: null,
      lastSeq: -1,
      appliedSeq: 0,
      presses: new PressCounter(),
      inputs: new Bucket(30, 120),
      messages: new Bucket(20, 20),
      alive: true,
      send(msg: ServerMessage) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
    };
    connections.set(id, c);

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) return;
      const buf = rawToBuffer(data);
      if (buf.length > MAX_MESSAGE_BYTES) return;
      const msg = parseClientMessage(buf.toString('utf8'));
      if (!msg) return;
      try {
        onMessage(c, msg);
      } catch (err) {
        log('error handling message', msg.t, err);
      }
    });
    ws.on('pong', () => {
      c.alive = true;
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      connections.delete(id);
      try {
        leaveEverything(c);
      } catch (err) {
        log('error on disconnect', err);
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const c of connections.values()) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      try {
        c.ws.ping();
      } catch {
        c.ws.terminate();
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(opts.port ?? DEFAULT_SERVER_PORT, () => {
      http.off('error', reject);
      resolve();
    });
  });
  const port = (http.address() as AddressInfo).port;
  log(`listening on ${port}`);

  return {
    port,
    close: async () => {
      clearInterval(heartbeat);
      for (const room of [...rooms.values()]) room.close();
      for (const c of connections.values()) c.ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
