import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer, RunningServer } from '../src/server/app';
import { PROTOCOL_VERSION, ServerMsg } from '../src/shared/protocol';

let server: RunningServer;

beforeAll(async () => {
  server = await startServer({ port: 0, dataFile: null });
});

afterAll(async () => {
  await server.close();
});

class TestClient {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  id = '';
  epoch = 0;
  constructor(port: number) {
    this.ws = new WebSocket(`ws://localhost:${port}/ws`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMsg;
      this.msgs.push(m);
      if (m.t === 'welcome') this.id = m.id;
      if (m.t === 'enter' || m.t === 'tp') this.epoch = m.epoch;
    });
  }
  open() {
    return new Promise<void>((r) => this.ws.once('open', () => r()));
  }
  send(m: object) {
    this.ws.send(JSON.stringify(m));
  }
  async waitFor<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, timeout = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const m = this.msgs.find((x) => x.t === t && pred(x as Extract<ServerMsg, { t: T }>));
      if (m) return m as Extract<ServerMsg, { t: T }>;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timed out waiting for ${t}`);
  }
  close() {
    this.ws.close();
  }
}

async function connect(name: string, char = 'ronin') {
  const c = new TestClient(server.port);
  await c.open();
  c.send({ t: 'hello', v: PROTOCOL_VERSION, name, char });
  await c.waitFor('welcome');
  await c.waitFor('enter', (m) => m.kind === 'lobby');
  return c;
}

describe('server', () => {
  it('joins the lobby and sees dummies', async () => {
    const c = await connect('Alice');
    const enter = await c.waitFor('enter');
    expect(enter.map).toBe('lobby');
    expect(enter.roster.some((r) => r.dummy === 'sparring')).toBe(true);
    c.close();
  });

  it('matches two ranked players and resolves a forfeit with rating changes', async () => {
    const a = await connect('Ranked A');
    const b = await connect('Ranked B', 'shade');
    a.send({ t: 'queue', mode: 'ranked' });
    b.send({ t: 'queue', mode: 'ranked' });
    const ea = await a.waitFor('enter', (m) => m.kind === 'arena');
    const eb = await b.waitFor('enter', (m) => m.kind === 'arena');
    expect(ea.map).toBe(eb.map);
    const match = await a.waitFor('match');
    expect(match.mode).toBe('ranked');
    a.send({ t: 'forfeit' });
    const ra = await a.waitFor('result');
    const rb = await b.waitFor('result');
    expect(ra.won).toBe(false);
    expect(rb.won).toBe(true);
    expect(ra.delta).toBeLessThan(0);
    expect(rb.delta).toBeGreaterThan(0);
    a.close();
    b.close();
  });

  it('starts a casual duel when a challenge is accepted', async () => {
    const a = await connect('Challenger');
    const b = await connect('Challenged', 'monk');
    a.send({ t: 'challenge', target: b.id });
    const ch = await b.waitFor('challenge');
    expect(ch.from).toBe(a.id);
    b.send({ t: 'challengeReply', from: a.id, accept: true });
    await a.waitFor('enter', (m) => m.kind === 'arena');
    const match = await b.waitFor('match');
    expect(match.mode).toBe('casual');
    a.close();
    b.close();
  });

  it('ignores malformed messages without crashing', async () => {
    const c = await connect('Fuzzer');
    for (const junk of ['nope', '{}', '[]', 'null', '{"t":"act","a":"light","vt":"x"}', '{"t":"move","x":"a"}', '{"t":"char","id":"__proto__"}', '{"t":"queue","mode":"weird"}', '{"t":"challenge","target":{}}']) {
      c.ws.send(junk);
    }
    c.send({ t: 'ping', c: 1 });
    const pong = await c.waitFor('pong');
    expect(pong.c).toBe(1);
    c.close();
  });

  it('runs a practice match against a bot that fights back', async () => {
    const c = await connect('Practicer');
    c.send({ t: 'queue', mode: 'practice', diff: 'hard' });
    const enter = await c.waitFor('enter', (m) => m.kind === 'arena');
    const bot = enter.roster.find((r) => r.bot)!;
    expect(bot).toBeTruthy();
    await c.waitFor('match', (m) => m.phase === 'fight', 12000);
    // walk toward the bot and swing a few times
    const startSnap = await c.waitFor('snap', (m) => m.f.some((f) => f.i === bot.id));
    const me = startSnap.f.find((f) => f.i === c.id)!;
    const them = startSnap.f.find((f) => f.i === bot.id)!;
    let x = me.x;
    let z = me.z;
    for (let i = 0; i < 60; i++) {
      const dx = them.x - x;
      const dz = them.z - z;
      const d = Math.hypot(dx, dz);
      if (d > 2) {
        x += (dx / d) * 0.2;
        z += (dz / d) * 0.2;
      }
      const yaw = Math.atan2(them.x - x, them.z - z);
      c.send({ t: 'move', x, y: 0, z, r: yaw, g: 1, e: c.epoch });
      if (i % 10 === 0) c.send({ t: 'act', a: 'light', vt: 0, r: yaw });
      await new Promise((r) => setTimeout(r, 50));
    }
    const fx = await c.waitFor('fx', (m) => m.e.some((e) => e.a === c.id || e.a === bot.id), 10000);
    expect(fx.e.length).toBeGreaterThan(0);
    c.close();
  }, 30000);
});
