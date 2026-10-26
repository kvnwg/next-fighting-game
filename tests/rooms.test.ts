/** Private lobbies joined by a code, and online ranked falling back to a rated opponent. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/server/game';
import { Lobby } from '../src/server/lobby';
import { Store } from '../src/server/store';
import { PROTOCOL_VERSION, ServerMsg } from '../src/shared/protocol';
import { normalizeRoomCode, randomRoomCode } from '../src/shared/rooms';

type Msg<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>;

function harness(opts: ConstructorParameters<typeof Game>[2] = {}) {
  let t = 1000;
  const game = new Game(new Store(null), () => t, { selectTime: 200, ...opts });
  const step = (ms: number) => {
    const end = t + ms;
    while (t < end) {
      t += 1000 / 60;
      game.tick();
    }
  };
  const join = (name: string) => {
    const inbox: ServerMsg[] = [];
    const on: Record<string, (d?: unknown) => void> = {};
    const ws = { readyState: 1, send: (d: string) => inbox.push(JSON.parse(d)), close: () => on.close?.(), on: (ev: string, cb: (d?: unknown) => void) => (on[ev] = cb) };
    game.handleConnection(ws as never);
    on.message!(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name, char: 'ronin' }));
    const id = (inbox.find((m) => m.t === 'welcome') as Msg<'welcome'>).id;
    const p = game.players.get(id)!;
    return {
      p,
      inbox,
      send: (m: object) => on.message!(JSON.stringify(m)),
      leave: () => on.close!(),
      last: <T extends ServerMsg['t']>(type: T) => inbox.filter((m) => m.t === type).pop() as Msg<T> | undefined,
    };
  };
  return { game, step, join };
}

describe('room codes', () => {
  it('reads a code however it was typed, and nothing that cannot be one', () => {
    const c = randomRoomCode();
    expect(normalizeRoomCode(c)).toBe(c);
    expect(normalizeRoomCode(` ${c.slice(0, 2).toLowerCase()}-${c.slice(2)} `)).toBe(c);
    expect(normalizeRoomCode('ABC')).toBeNull();
    expect(normalizeRoomCode('OOOOO')).toBeNull();
    expect(normalizeRoomCode(42)).toBeNull();
  });
});

describe('private lobbies', () => {
  it('opens one with a code, lets a friend in by it, and keeps strangers out', () => {
    const { game, join, step } = harness({ roamers: 3 });
    const a = join('Host');
    const b = join('Friend');
    const c = join('Stranger');
    a.send({ t: 'room', a: 'create' });
    const info = a.last('lobby')!;
    expect(info.code).toMatch(/^[A-Z2-9]{5}$/);
    const room = a.p.instance as Lobby;
    expect(room.code).toBe(info.code);
    // nobody computer-run in there, only the dummies
    expect([...room.fighters.values()].some((f) => f.id.startsWith('roamer-'))).toBe(false);

    b.send({ t: 'room', a: 'join', code: info.code!.toLowerCase() });
    expect(b.p.instance).toBe(room);
    expect(b.last('lobby')!.count).toBe(2);
    // a stranger isn't put in there, and a wrong code is refused
    c.send({ t: 'room', a: 'join', code: 'ZZZZZ' });
    expect(c.p.instance).not.toBe(room);
    expect(c.last('notice')!.text).toMatch(/No lobby/);

    // their chat stays between them
    const before = c.inbox.length;
    a.send({ t: 'chat', text: 'ready?' });
    expect(b.last('chat')!.text).toBe('ready?');
    expect(c.inbox.slice(before).some((m) => m.t === 'chat' && m.text === 'ready?')).toBe(false);
    // nor does the public grounds' chatter come in
    const d = join('Newcomer');
    expect(c.last('chat')!.text).toBe(`${d.p.name} entered the grounds.`);
    expect(b.last('chat')!.text).toBe('ready?');

    // a casual challenge between them, and after the match they're back in the private lobby
    a.send({ t: 'challenge', target: b.p.id });
    b.send({ t: 'challengeReply', from: a.p.id, accept: true });
    expect(a.last('select')).toBeDefined();
    step(400);
    expect(a.p.instance?.kind).toBe('arena');
    a.send({ t: 'forfeit' });
    step(10_000);
    expect(a.p.instance).toBe(room);
    expect(b.p.instance).toBe(room);

    // leaving goes back to the public grounds, and the empty lobby closes
    a.send({ t: 'room', a: 'leave' });
    b.send({ t: 'room', a: 'leave' });
    expect((a.p.instance as Lobby).code).toBeNull();
    step(1500);
    expect(game.lobbies.includes(room)).toBe(false);
  });

  it('a wanderer left behind in the public grounds no longer answers your challenge', () => {
    const { game, join, step } = harness({ roamers: 2 });
    const a = join('Host');
    const wanderer = [...game.lobby.fighters.values()].find((f) => f.id.startsWith('roamer-'))!;
    a.send({ t: 'challenge', target: wanderer.id });
    a.send({ t: 'room', a: 'create' });
    step(5000);
    expect(a.last('select')).toBeUndefined();
    expect((a.p.instance as Lobby).code).toBeTruthy();
  });

  it('closes when its people disconnect', () => {
    const { game, join, step } = harness();
    const a = join('Host');
    a.send({ t: 'room', a: 'create' });
    const room = a.p.instance as Lobby;
    a.leave();
    step(1500);
    expect(game.lobbies.includes(room)).toBe(false);
    expect(game.lobbies.length).toBe(1);
  });
});

describe('online ranked', () => {
  it('pairs two players, and matches one alone against a rated opponent after a while', () => {
    const { join, step } = harness({ rankedFallback: 5000 });
    const a = join('Alone');
    a.send({ t: 'queue', mode: 'ranked' });
    step(3000);
    expect(a.last('select')).toBeUndefined();
    step(3000);
    const sel = a.last('select')!;
    expect(sel.mode).toBe('ranked');
    expect(sel.sides[1].bot).toBe(true);

    const b = join('One');
    const c = join('Two');
    b.send({ t: 'queue', mode: 'ranked' });
    c.send({ t: 'queue', mode: 'ranked' });
    step(1200);
    expect(b.last('select')!.sides.map((s) => s.name)).toEqual(['One', 'Two']);
  });
});
