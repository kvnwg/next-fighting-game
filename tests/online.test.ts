/** Several players on one server: what happens when they drop, come back, or someone sends nonsense. */
import { describe, expect, it, vi } from 'vitest';
import { Game } from '../src/server/game';
import { Store } from '../src/server/store';
import { PROTOCOL_VERSION, ServerMsg } from '../src/shared/protocol';

type Msg<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>;

function harness(opts: ConstructorParameters<typeof Game>[2] = {}) {
  let t = 1000;
  const game = new Game(new Store(null), () => t, { selectTime: 200, introTime: 200, ...opts });
  const step = (ms: number, each?: () => void) => {
    const end = t + ms;
    while (t < end) {
      t += 1000 / 60;
      game.tick();
      each?.();
    }
  };
  const join = (name: string, token?: string) => {
    const inbox: ServerMsg[] = [];
    const on: Record<string, (d?: unknown) => void> = {};
    const ws = {
      readyState: 1,
      closedWith: null as string | null,
      send: (d: string) => inbox.push(JSON.parse(d)),
      close: (_code?: number, reason = '') => {
        if (ws.readyState === 3) return;
        ws.readyState = 3;
        ws.closedWith = reason;
        on.close?.();
      },
      on: (ev: string, cb: (d?: unknown) => void) => (on[ev] = cb),
    };
    game.handleConnection(ws as never);
    on.message!(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name, char: 'ronin', token }));
    const welcome = inbox.find((m) => m.t === 'welcome') as Msg<'welcome'>;
    const p = game.players.get(welcome.id)!;
    return {
      p,
      ws,
      token: welcome.token,
      inbox,
      send: (m: object) => on.message!(JSON.stringify(m)),
      leave: () => ws.close(),
      last: <T extends ServerMsg['t']>(type: T) => inbox.filter((m) => m.t === type).pop() as Msg<T> | undefined,
    };
  };
  return { game, step, join };
}

describe('dropped connections', () => {
  it('a player whose connection goes silent is dropped, and their opponent wins and goes back to the lobby', () => {
    const { game, step, join } = harness({ silentTimeout: 30_000 });
    const a = join('Steady');
    const b = join('Vanished');
    a.send({ t: 'challenge', target: b.p.id });
    b.send({ t: 'challengeReply', from: a.p.id, accept: true });
    step(1000);
    expect(a.p.instance?.kind).toBe('arena');
    // a keeps pinging; b's phone lost its network, its socket still open
    let n = 0;
    step(29_000, () => n++ % 60 === 0 && a.send({ t: 'ping', c: 0 }));
    expect(game.players.has(b.p.id)).toBe(true);
    step(4000, () => n++ % 60 === 0 && a.send({ t: 'ping', c: 0 }));
    expect(game.players.has(b.p.id)).toBe(false);
    expect(b.ws.closedWith).toMatch(/timed out/);
    expect(a.last('result')).toMatchObject({ won: true, reason: 'forfeit' });
    step(10_000, () => n++ % 60 === 0 && a.send({ t: 'ping', c: 0 }));
    expect(a.p.instance?.kind).toBe('lobby');
    expect(game.players.has(a.p.id)).toBe(true);
  });
});

describe('server robustness', () => {
  it('a match that fails to start calls the select off instead of throwing out of the tick', () => {
    const { game, step, join } = harness();
    const a = join('First');
    const b = join('Second');
    a.send({ t: 'challenge', target: b.p.id });
    b.send({ t: 'challengeReply', from: a.p.id, accept: true });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const start = vi.spyOn(game, 'startMatch').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(() => step(400)).not.toThrow();
    start.mockRestore();
    err.mockRestore();
    for (const c of [a, b]) {
      expect(c.last('selectCancel')).toBeDefined();
      expect(c.p.instance?.kind).toBe('lobby');
    }
    // and they can play on
    a.send({ t: 'challenge', target: b.p.id });
    b.send({ t: 'challengeReply', from: a.p.id, accept: true });
    step(400);
    expect(a.p.instance?.kind).toBe('arena');
  });

  it('a throw while joining or leaving stays inside that socket', () => {
    const { game, join } = harness();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const create = vi.spyOn(game.store, 'create').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    let onMessage: (d: unknown) => void = () => {};
    const ws = { readyState: 1, send() {}, close() {}, on: (ev: string, cb: (d: unknown) => void) => ev === 'message' && (onMessage = cb) };
    game.handleConnection(ws as never);
    expect(() => onMessage(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name: 'Unlucky', char: 'ronin' }))).not.toThrow();
    create.mockRestore();
    const c = join('Lucky');
    const leave = vi.spyOn(game, 'leave').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(() => c.leave()).not.toThrow();
    leave.mockRestore();
    err.mockRestore();
  });

  it('the tick timer never lets a throw escape', () => {
    vi.useFakeTimers();
    const game = new Game(new Store(null));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tick = vi.spyOn(game, 'tick').mockImplementation(() => {
      throw new Error('boom');
    });
    game.start();
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    expect(err).toHaveBeenCalled();
    game.stop();
    tick.mockRestore();
    err.mockRestore();
    vi.useRealTimers();
  });
});
