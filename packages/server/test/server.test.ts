import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  BTN,
  MAP_IDS,
  PROTOCOL_VERSION,
  WEAPON_IDS,
  createFighter,
  decodeFighterInto,
  type FighterState,
  type MatchSnapshot,
  type RoomPhase,
  type RoomState,
  type ServerMessage,
} from '@nfg/shared';
import { createGameServer, type GameServer } from '../src/server.ts';

const TIMINGS = { voteMs: 300, entranceMs: 100, loadTimeoutMs: 1000, rematchWaitMs: 500 };

class TestClient {
  readonly msgs: ServerMessage[] = [];
  closed = false;
  private cursor = 0;
  private wake = new Set<() => void>();

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      this.msgs.push(JSON.parse(data.toString()) as ServerMessage);
      for (const fn of [...this.wake]) fn();
    });
    ws.on('close', () => {
      this.closed = true;
      for (const fn of [...this.wake]) fn();
    });
  }

  static connect(port: number): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const client = new TestClient(ws);
      ws.once('open', () => resolve(client));
      ws.once('error', reject);
    });
  }

  send(msg: unknown): void {
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  /** Resolves with the next unread message matching `pred`, skipping (and consuming) others. */
  next(pred: (m: ServerMessage) => boolean, timeoutMs = 4000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const check = () => {
        while (this.cursor < this.msgs.length) {
          const m = this.msgs[this.cursor++]!;
          if (pred(m)) {
            cleanup();
            resolve(m);
            return true;
          }
        }
        return false;
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`timed out waiting for message (last: ${JSON.stringify(this.msgs.at(-1))?.slice(0, 200)})`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.wake.delete(onWake);
      };
      const onWake = () => {
        check();
      };
      if (!check()) this.wake.add(onWake);
    });
  }

  async room(phase: RoomPhase, timeoutMs?: number): Promise<RoomState> {
    const m = await this.next((x) => x.t === 'room' && x.room.phase === phase, timeoutMs);
    return (m as Extract<ServerMessage, { t: 'room' }>).room;
  }

  async snap(pred: (s: MatchSnapshot, ack: number) => boolean = () => true, timeoutMs?: number) {
    const m = await this.next((x) => x.t === 'snap' && pred(x.s, x.ack), timeoutMs);
    return m as Extract<ServerMessage, { t: 'snap' }>;
  }

  waitClosed(timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.closed) return resolve();
      const timer = setTimeout(() => reject(new Error('socket did not close')), timeoutMs);
      this.ws.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  close(): void {
    this.ws.close();
  }
}

function stateOf(s: MatchSnapshot, seat: 0 | 1): FighterState {
  const f = createFighter(seat, 'naginata');
  decodeFighterInto(f, s.f[seat]);
  return f.state;
}

let server: GameServer;
const clients: TestClient[] = [];

async function join(name: string): Promise<TestClient> {
  const c = await TestClient.connect(server.port);
  clients.push(c);
  c.send({ t: 'hello', v: PROTOCOL_VERSION, player: { name, avatar: null, title: 'Tester' } });
  await c.next((m) => m.t === 'welcome');
  return c;
}

/** Drives a fresh room from vote to the start of the match. */
async function playToMatch(a: TestClient, b: TestClient): Promise<void> {
  await Promise.all([a.room('load'), b.room('load')]);
  a.send({ t: 'progress', value: 1 });
  b.send({ t: 'progress', value: 1 });
  await Promise.all([a.room('entrance'), b.room('entrance')]);
  a.send({ t: 'skip' });
  b.send({ t: 'skip' });
  await Promise.all([a.room('match'), b.room('match')]);
}

beforeAll(async () => {
  server = await createGameServer({ port: 0, ...TIMINGS });
});

afterAll(async () => {
  for (const c of clients) if (!c.closed) c.close();
  await server.close();
});

describe('match server', () => {
  it('pairs a quick match and runs vote, load, entrance and an authoritative fight', async () => {
    const a = await join('Alpha');
    const b = await join('Bravo');
    a.send({ t: 'queue' });
    await a.next((m) => m.t === 'queued');
    b.send({ t: 'queue' });

    const [ra, rb] = await Promise.all([a.room('vote'), b.room('vote')]);
    expect(ra.roomId).toBe(rb.roomId);
    expect(ra.isPrivate).toBe(false);
    expect(new Set([ra.you, rb.you])).toEqual(new Set([0, 1]));
    expect(ra.players.map((p) => p?.name).sort()).toEqual(['Alpha', 'Bravo']);
    expect(ra.endsAt).toBeGreaterThan(Date.now() - 1000);

    a.send({ t: 'vote', map: 'snow-court', weapon: 'katana' });
    b.send({ t: 'vote', map: 'snow-court' });
    const loadA = await a.room('load');
    expect(loadA.map).toBe('snow-court');
    expect(loadA.weapons[ra.you]).toBe('katana');
    expect(WEAPON_IDS).toContain(loadA.weapons[rb.you]);
    expect(MAP_IDS).toContain(loadA.map);

    a.send({ t: 'progress', value: 1 });
    b.send({ t: 'progress', value: 1 });
    await Promise.all([a.room('entrance'), b.room('entrance')]);
    a.send({ t: 'skip' });
    b.send({ t: 'skip' });
    await Promise.all([a.room('match'), b.room('match')]);

    // Snapshots stream with increasing ticks.
    const s1 = await a.snap();
    const s2 = await a.snap();
    const s3 = await a.snap();
    expect(s2.s.tick).toBeGreaterThan(s1.s.tick);
    expect(s3.s.tick).toBeGreaterThan(s2.s.tick);

    // Wait out the round intro, then tap LIGHT and see the server start an attack.
    await a.snap((s) => s.phase === 'fight', 6000);
    const seat = ra.you;
    a.send({ t: 'input', seq: 1, mx: 0, my: 0, held: BTN.LIGHT, counts: [1, 0, 0, 0, 0] });
    a.send({ t: 'input', seq: 2, mx: 0, my: 0, held: 0, counts: [1, 0, 0, 0, 0] });
    const attacking = await a.snap((s) => stateOf(s, seat) === 'attack', 2000);
    expect(attacking.s.phase).toBe('fight');
    const acked = await a.snap((_, ack) => ack >= 2, 2000);
    expect(acked.ack).toBe(2);

    // Leaving mid-match hands the win to whoever stays.
    b.close();
    const left = await a.next((m) => m.t === 'left');
    expect(left).toEqual({ t: 'left', who: rb.you });
    const results = await a.room('results');
    expect(results.winner).toBe(seat);
    // Public rooms close quietly once results expire.
    await new Promise((r) => setTimeout(r, TIMINGS.rematchWaitMs + 200));
    const health = (await fetch(`http://127.0.0.1:${server.port}/health`).then((r) => r.json())) as {
      ok: boolean;
      rooms: number;
    };
    expect(health.ok).toBe(true);
    expect(health.rooms).toBe(0);
    a.close();
  }, 15000);

  it('creates and joins private rooms by code, and keeps the room after someone leaves', async () => {
    const c = await join('Charlie');
    const d = await join('Delta');
    const e = await join('Echo');

    c.send({ t: 'create' });
    const waiting = await c.room('waiting');
    expect(waiting.isPrivate).toBe(true);
    expect(waiting.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(waiting.players.filter(Boolean)).toHaveLength(1);

    d.send({ t: 'join', code: 'QQQQQ' });
    const missing = await d.next((m) => m.t === 'error');
    expect(missing).toEqual({ t: 'error', message: 'Room not found.' });

    d.send({ t: 'join', code: waiting.code.toLowerCase() });
    const [vc, vd] = await Promise.all([c.room('vote'), d.room('vote')]);
    expect(vc.roomId).toBe(vd.roomId);

    e.send({ t: 'join', code: waiting.code });
    expect(await e.next((m) => m.t === 'error')).toEqual({ t: 'error', message: 'Room is full.' });

    // Leaving during the vote returns a private room to waiting.
    c.send({ t: 'leave' });
    expect(await d.next((m) => m.t === 'left')).toEqual({ t: 'left', who: vc.you });
    const back = await d.room('waiting');
    expect(back.players.filter(Boolean)).toHaveLength(1);

    // Rejoining by code starts a fresh vote; leaving mid-match gives results, then waiting.
    c.send({ t: 'join', code: waiting.code });
    await Promise.all([c.room('vote'), d.room('vote')]);
    await playToMatch(c, d);
    c.send({ t: 'leave' });
    const res = await d.room('results');
    expect(res.winner).toBe(back.you);
    const after = await d.room('waiting', TIMINGS.rematchWaitMs + 2000);
    expect(after.code).toBe(waiting.code);
    for (const x of [c, d, e]) x.close();
  }, 15000);

  it('rejects other protocol versions and survives malformed traffic', async () => {
    const old = await TestClient.connect(server.port);
    clients.push(old);
    old.send({ t: 'hello', v: PROTOCOL_VERSION + 1, player: { name: 'Old', avatar: null, title: '' } });
    const err = await old.next((m) => m.t === 'error');
    expect(err.t).toBe('error');
    await old.waitClosed();

    const x = await TestClient.connect(server.port);
    clients.push(x);
    // Junk before hello is ignored.
    x.send('not json');
    x.send({ t: 'queue' });
    x.send({ t: 'hello', v: PROTOCOL_VERSION, player: { name: '  Eve\u0000\n\tVeryLongNameThatKeepsGoingAndGoing', avatar: 'javascript:alert(1)', title: 42 } });
    await x.next((m) => m.t === 'welcome');
    for (const junk of [
      '{}',
      '[]',
      'null',
      '{"t":"input","seq":"x"}',
      '{"t":"input","seq":1,"mx":0,"my":0,"held":1,"counts":[-1]}',
      '{"t":"input","seq":1,"mx":0,"my":0,"held":1,"counts":[1,2,3,4,5,6]}',
      '{"t":"vote","map":"nowhere"}',
      '{"t":"join","code":"<script>"}',
      '{"t":"progress","value":"full"}',
      '{"t":"skip"}',
      '{"t":"rematch"}',
      'x'.repeat(3000),
    ]) {
      x.send(junk);
    }
    x.ws.send(Buffer.from([1, 2, 3]), { binary: true });
    x.send({ t: 'ping', ts: 123 });
    const pong = await x.next((m) => m.t === 'pong');
    expect(pong).toMatchObject({ t: 'pong', ts: 123 });

    // Names are sanitized before anyone else sees them.
    x.send({ t: 'create' });
    const room = await x.room('waiting');
    expect(room.players[room.you]).toEqual({ name: 'Eve VeryLongNameThatKeep', avatar: null, title: '' });

    // An oversized frame closes only that socket.
    x.ws.send('y'.repeat(10_000));
    await x.waitClosed();
    const y = await join('Still alive');
    y.send({ t: 'ping', ts: 7 });
    expect(await y.next((m) => m.t === 'pong')).toMatchObject({ ts: 7 });
    const health = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(health.status).toBe(200);
    y.close();
  }, 10000);
});
