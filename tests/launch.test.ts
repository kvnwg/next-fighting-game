/** What a public server has to survive: bad requests, dead sockets, floods, restarts mid-match, and a ladder that grows. */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { originAllowed, RunningServer, ServerOptions, startServer } from '../src/server/app';
import { Game } from '../src/server/game';
import { sqliteStore } from '../src/server/sqliteStore';
import { Profile, Store, StorePersistence } from '../src/server/store';
import { PROTOCOL_VERSION, ServerMsg } from '../src/shared/protocol';

const servers: RunningServer[] = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deflect-launch-'));

afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
});

async function serve(extra: Partial<ServerOptions> = {}): Promise<RunningServer> {
  const s = await startServer({ port: 0, persistence: null, selectTime: 200, introTime: 1500, ...extra });
  servers.push(s);
  return s;
}

/** a raw GET, so the path goes out exactly as written (fetch would tidy it) */
function get(port: number, p: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, path: p, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  id = '';
  closed: { code: number; reason: string } | null = null;
  constructor(port: number, opts: WebSocket.ClientOptions = {}) {
    this.ws = new WebSocket(`ws://localhost:${port}/ws`, opts);
    this.ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMsg;
      this.msgs.push(m);
      if (m.t === 'welcome') this.id = m.id;
    });
    this.ws.on('close', (code, reason) => (this.closed = { code, reason: String(reason) }));
    this.ws.on('error', () => undefined);
  }
  open() {
    return new Promise<void>((r) => this.ws.once('open', () => r()));
  }
  send(m: object) {
    this.ws.send(JSON.stringify(m));
  }
  async waitFor<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, timeout = 8000) {
    return until(() => this.msgs.find((x) => x.t === t && pred(x as Extract<ServerMsg, { t: T }>)) as Extract<ServerMsg, { t: T }> | undefined, timeout, t);
  }
  async hello(name: string) {
    await this.open();
    this.send({ t: 'hello', v: PROTOCOL_VERSION, name, char: 'ronin' });
    await this.waitFor('welcome');
    await this.waitFor('enter');
    return this;
  }
}

async function until<T>(f: () => T | undefined | null | false, timeout = 8000, what = 'condition'): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = f();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe('http', () => {
  const dist = path.join(tmp, 'dist');
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Deflect</title>');
  fs.writeFileSync(path.join(dist, 'assets', 'app-abc123.js'), `console.log(${JSON.stringify('x'.repeat(20000))});`);
  fs.mkdirSync(path.join(tmp, 'dist-secret'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'dist-secret', 'key.txt'), 'secret');

  it('survives a malformed URL (it used to take the whole server down)', async () => {
    const s = await serve({ staticDir: dist });
    expect((await get(s.port, '/%E0%A4%A')).status).toBe(400);
    expect((await get(s.port, '/')).status).toBe(200);
  });

  it('keeps requests inside the build folder', async () => {
    const s = await serve({ staticDir: dist });
    const r = await get(s.port, '/../dist-secret/key.txt');
    expect(r.body.toString()).not.toContain('secret');
    const encoded = await get(s.port, '/%2e%2e/dist-secret/key.txt');
    expect(encoded.body.toString()).not.toContain('secret');
  });

  it('serves the page for routes, but a 404 for a missing file', async () => {
    const s = await serve({ staticDir: dist });
    expect((await get(s.port, '/some/route')).body.toString()).toContain('<title>Deflect');
    expect((await get(s.port, '/assets/app-old999.js')).status).toBe(404);
  });

  it('compresses scripts for browsers that accept it', async () => {
    const s = await serve({ staticDir: dist });
    const br = await get(s.port, '/assets/app-abc123.js', { 'accept-encoding': 'gzip, deflate, br' });
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.body.length).toBeLessThan(1000);
    expect(zlib.brotliDecompressSync(br.body).toString()).toContain('xxxx');
    const gz = await get(s.port, '/assets/app-abc123.js', { 'accept-encoding': 'gzip' });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(zlib.gunzipSync(gz.body).toString()).toContain('xxxx');
    const plain = await get(s.port, '/assets/app-abc123.js');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body.length).toBeGreaterThan(20000);
  });

  it('answers health checks with how busy it is', async () => {
    const s = await serve();
    await new Client(s.port).hello('Healthy');
    const r = JSON.parse((await get(s.port, '/healthz')).body.toString());
    expect(r).toMatchObject({ ok: true, players: 1, lobbies: 1, matches: 0 });
  });
});

describe('connections', () => {
  it('matches origins exactly or by subdomain', () => {
    expect(originAllowed(undefined, [])).toBe(true);
    expect(originAllowed('https://evil.example', undefined)).toBe(true);
    const rules = ['https://deflect.example.com', '*.crazygames.com'];
    expect(originAllowed('https://deflect.example.com', rules)).toBe(true);
    expect(originAllowed('https://games.crazygames.com', rules)).toBe(true);
    expect(originAllowed('http://games.crazygames.com', rules)).toBe(false);
    expect(originAllowed('https://crazygames.com.evil.example', rules)).toBe(false);
    expect(originAllowed('https://evilcrazygames.com', rules)).toBe(false);
    expect(originAllowed(undefined, rules)).toBe(false);
  });

  it('turns away pages that are not on the list', async () => {
    const s = await serve({ allowedOrigins: ['https://deflect.example.com'] });
    const bad = new Client(s.port, { origin: 'https://evil.example' });
    await until(() => bad.closed, 3000, 'refusal');
    expect(bad.id).toBe('');
    const good = await new Client(s.port, { origin: 'https://deflect.example.com' }).hello('Allowed');
    expect(good.id).not.toBe('');
  });

  it('tells players when the server or their network is full', async () => {
    const s = await serve({ maxConnections: 2, maxPerIp: 2 });
    await new Client(s.port).hello('One');
    await new Client(s.port).hello('Two');
    const third = new Client(s.port);
    const closed = await until(() => third.closed, 3000, 'refusal');
    expect(closed.code).toBe(1013);
    expect(closed.reason).toMatch(/full|network/);
  });

  it('limits how fast one address can connect', async () => {
    const s = await serve({ connectsPerMinute: 3 });
    for (let i = 0; i < 3; i++) (await new Client(s.port).hello(`Quick${i}`)).ws.close();
    const late = new Client(s.port);
    const closed = await until(() => late.closed, 3000, 'refusal');
    expect(closed.reason).toMatch(/attempts/);
  });

  it('drops a socket that stops answering pings, so its fighter leaves', async () => {
    const s = await serve({ heartbeatMs: 150 });
    const ghost = await new Client(s.port, { autoPong: false }).hello('Ghost');
    // stop sending anything, the way a phone that lost signal does
    expect(s.game.players.has(ghost.id)).toBe(true);
    await until(() => !s.game.players.has(ghost.id), 3000, 'the ghost to be dropped');
  });

  it('drops a connection that never says hello', () => {
    vi.useFakeTimers();
    try {
      const game = new Game(new Store(null), () => 1000);
      const sockets = [0, 1].map(() => {
        const on: Record<string, (d?: unknown) => void> = {};
        const ws = { readyState: 1, closed: '', send: () => undefined, close: (_: number, why: string) => (ws.closed = why), on: (ev: string, cb: (d?: unknown) => void) => (on[ev] = cb) };
        game.handleConnection(ws as never);
        return { ws, on };
      });
      sockets[1].on.message!(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name: 'Talker', char: 'ronin' }));
      vi.advanceTimersByTime(9000);
      expect(sockets[0].ws.closed).toBe('');
      vi.advanceTimersByTime(2000);
      expect(sockets[0].ws.closed).toBe('no hello');
      expect(sockets[1].ws.closed).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ends matches without a result on a restart: nobody loses rating to a deploy', async () => {
    const saved: Profile[][] = [];
    const persistence: StorePersistence = { load: () => [], save: (p) => saved.push(p.map((x) => ({ ...x }))), incremental: true };
    const s = await startServer({ port: 0, persistence, selectTime: 200, introTime: 1500 });
    const a = await new Client(s.port).hello('Restart A');
    const b = await new Client(s.port).hello('Restart B');
    a.send({ t: 'queue', mode: 'ranked' });
    b.send({ t: 'queue', mode: 'ranked' });
    await a.waitFor('match');
    await s.close();
    expect(a.closed?.code).toBe(1012);
    expect(a.msgs.some((m) => m.t === 'result')).toBe(false);
    expect(b.msgs.some((m) => m.t === 'result')).toBe(false);
    const last = new Map(saved.flat().map((p) => [p.id, p]));
    expect(last.get(a.id)?.mmr).toBe(900);
    expect(last.get(b.id)?.mmr).toBe(900);
    expect(last.get(a.id)?.placements).toBe(0);
  });
});

describe('profiles', () => {
  it('keeps profiles in SQLite and writes only the ones that changed', () => {
    const file = path.join(tmp, 'store', 'deflect.db');
    const db = sqliteStore(file);
    const store = new Store(db);
    const a = store.create('Alpha');
    const b = store.create('Bravo');
    store.flush();
    a.mmr = 1234;
    store.markDirty(a);
    const writes: string[] = [];
    const save = db.save;
    db.save = (ps) => {
      writes.push(...ps.map((p) => p.name));
      save(ps);
    };
    store.flush();
    expect(writes).toEqual(['Alpha']);
    db.close();
    const again = new Store(sqliteStore(file));
    expect(again.get(a.id)?.mmr).toBe(1234);
    expect(again.get(b.id)?.name).toBe('Bravo');
    expect(again.byTokenOrNull(a.token)?.id).toBe(a.id);
  });

  it('imports the old profiles.json the first time', () => {
    const dir = path.join(tmp, 'legacy');
    fs.mkdirSync(dir, { recursive: true });
    const old = new Store(null).create('Veteran');
    old.mmr = 1500;
    fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify({ profiles: [old] }));
    const store = new Store(sqliteStore(path.join(dir, 'deflect.db'), path.join(dir, 'profiles.json')));
    expect(store.byTokenOrNull(old.token)?.mmr).toBe(1500);
    // and from the database after that, even with the JSON gone
    fs.rmSync(path.join(dir, 'profiles.json'));
    const reopened = new Store(sqliteStore(path.join(dir, 'deflect.db'), path.join(dir, 'profiles.json')));
    expect(reopened.byTokenOrNull(old.token)?.mmr).toBe(1500);
  });

  it('never saves over profiles it could not load', () => {
    let saves = 0;
    const store = new Store({
      load: () => {
        throw new Error('corrupt');
      },
      save: () => saves++,
    });
    store.create('Newcomer');
    store.flush();
    expect(saves).toBe(0);
  });

  it('keeps the ladder in order as ratings change', () => {
    const store = new Store(null);
    const ps = ['A', 'B', 'C'].map((n) => {
      const p = store.create(n);
      p.placements = 10;
      store.markDirty(p);
      return p;
    });
    ps[0].mmr = 1000;
    ps[1].mmr = 1100;
    ps[2].mmr = 950;
    store.markDirty(ps[2]);
    expect(store.leaderboard().map((e) => e.name)).toEqual(['B', 'A', 'C']);
    ps[2].mmr = 1200;
    store.markDirty(ps[2]);
    expect(store.leaderboard().map((e) => e.name)).toEqual(['C', 'B', 'A']);
    expect(store.position(ps[0])).toBe(3);
  });
});
