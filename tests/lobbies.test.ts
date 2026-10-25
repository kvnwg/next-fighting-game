/** Lobbies of LOBBY_CAP players, nearby-first updates, and duels in the lobby's rings. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/server/game';
import { Player } from '../src/server/entities';
import { Lobby } from '../src/server/lobby';
import { Store } from '../src/server/store';
import { INTEREST, LOBBY_CAP, RING_DUEL, SNAPSHOT_HZ } from '../src/shared/config';
import { DUEL_RINGS } from '../src/shared/maps';
import { PROTOCOL_VERSION, ServerMsg } from '../src/shared/protocol';

type Msg<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>;

function harness() {
  let t = 1000;
  const game = new Game(new Store(null), () => t, { selectTime: 200 });
  const step = (ms: number) => {
    const end = t + ms;
    while (t < end) {
      t += 1000 / 60;
      game.tick();
    }
  };
  const join = (name: string, hello: object = {}) => {
    const inbox: ServerMsg[] = [];
    const on: Record<string, (d?: unknown) => void> = {};
    const ws = { readyState: 1, send: (d: string) => inbox.push(JSON.parse(d)), close: () => on.close?.(), on: (ev: string, cb: (d?: unknown) => void) => (on[ev] = cb) };
    game.handleConnection(ws as never);
    on.message!(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name, char: 'ronin', ...hello }));
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
  return { game, step, join, now: () => t };
}

/** Stand a player's fighter somewhere (the server's copy; clients would walk there). */
function place(p: Player, x: number, z: number): void {
  p.fighter!.x = x;
  p.fighter!.z = z;
}

describe('lobbies', () => {
  it(`opens another lobby once ${LOBBY_CAP} players are in one, and closes it when it empties`, () => {
    const { game, step, join } = harness();
    const clients = Array.from({ length: LOBBY_CAP + 1 }, (_, i) => join(`P${i}`));
    expect(game.lobbies).toHaveLength(2);
    expect(game.lobbies[0].players.size).toBe(LOBBY_CAP);
    const extra = clients[LOBBY_CAP];
    expect(extra.p.instance).toBe(game.lobbies[1]);
    expect(extra.last('lobby')).toMatchObject({ n: 2, count: 1, cap: LOBBY_CAP });
    expect(clients[0].last('lobby')).toMatchObject({ n: 1, count: LOBBY_CAP });

    // someone leaves the first: the next newcomer fills that gap instead of the quieter lobby
    clients[3].leave();
    const late = join('Late');
    expect(late.p.instance).toBe(game.lobbies[0]);

    extra.leave();
    step(1200);
    expect(game.lobbies).toHaveLength(1);
  });

  it('sends far-off fighters less often than near ones', () => {
    const { step, join } = harness();
    const a = join('Watcher');
    const b = join('Walker');
    const count = () => {
      a.inbox.length = 0;
      step(1000);
      const snaps = a.inbox.filter((m) => m.t === 'snap') as Msg<'snap'>[];
      return { total: snaps.length, self: snaps.filter((s) => s.f.some((f) => f.i === a.p.id)).length, other: snaps.filter((s) => s.f.some((f) => f.i === b.p.id)).length };
    };
    place(a.p, -50, -50);
    place(b.p, 50, 50);
    const far = count();
    expect(far.self).toBe(far.total);
    expect(far.total).toBeGreaterThanOrEqual(SNAPSHOT_HZ - 1);
    expect(far.other).toBeLessThanOrEqual(Math.ceil(far.total / INTEREST.farEvery) + 1);
    expect(far.other).toBeGreaterThan(0);
    place(b.p, -45, -45);
    const near = count();
    expect(near.other).toBe(near.total);
  });

  it("joins a friend's lobby from an invite, or another one when it's full or gone", () => {
    const { game, join } = harness();
    const clients = Array.from({ length: LOBBY_CAP + 1 }, (_, i) => join(`P${i}`));
    const [first, second] = game.lobbies;
    const host = clients[LOBBY_CAP];
    expect(host.last('lobby')!.id).toBe(second.id);
    expect(first.id).not.toBe(second.id);

    const friend = join('Friend', { lobby: second.id });
    expect(friend.p.instance).toBe(second);
    clients[0].leave();
    // the busiest lobby with room would be the first, but the invite wins
    const another = join('Another', { lobby: second.id });
    expect(another.p.instance).toBe(second);

    const lost = join('Lost', { lobby: 'gone1234' });
    expect(lost.p.instance).toBe(first);
    expect(lost.last('notice')!.text).toMatch(/closed/);
  });

  it("moves to a friend's lobby from in the game, and after a match if in one", () => {
    const { game, step, join } = harness();
    const clients = Array.from({ length: LOBBY_CAP + 1 }, (_, i) => join(`P${i}`));
    const [first, second] = game.lobbies;
    const mover = clients[1];
    mover.send({ t: 'joinLobby', id: second.id });
    expect(mover.p.instance).toBe(second);
    expect(mover.last('enter')!.kind).toBe('lobby');
    expect(mover.last('lobby')).toMatchObject({ id: second.id, count: 2 });
    expect(first.players.size).toBe(LOBBY_CAP - 1);

    // in a match: they go to their friend's lobby when it ends
    const fighter = clients[2];
    fighter.send({ t: 'queue', mode: 'practice', diff: 'easy' });
    step(600);
    expect(fighter.p.instance).not.toBe(first);
    fighter.send({ t: 'joinLobby', id: second.id });
    [...game.arenas][0].forfeit(fighter.p);
    step(8000);
    expect(fighter.p.instance).toBe(second);

    // a full lobby turns them away
    for (let i = 0; i < LOBBY_CAP; i++) join(`Fill${i}`, { lobby: second.id });
    expect(second.full).toBe(true);
    const turnedAway = clients[3];
    turnedAway.send({ t: 'joinLobby', id: second.id });
    expect(turnedAway.p.instance).toBe(first);
    expect(turnedAway.last('notice')!.text).toMatch(/full/);
  });

  it('comes back to its own lobby after a match', () => {
    const { game, step, join } = harness();
    const a = join('A');
    const home = a.p.instance;
    a.send({ t: 'queue', mode: 'practice', diff: 'easy' });
    step(600);
    expect(a.p.instance).not.toBe(home);
    const arena = [...game.arenas][0];
    arena.forfeit(a.p);
    step(8000);
    expect(a.p.instance).toBe(home);
  });
});

describe('dueling rings', () => {
  const ring = DUEL_RINGS[0];

  function duel() {
    const h = harness();
    const a = h.join('Kenji');
    const b = h.join('Hana');
    const c = h.join('Onlooker');
    const lobby = a.p.instance as Lobby;
    place(a.p, ring.x - 2, ring.z);
    place(b.p, ring.x + 2, ring.z);
    a.send({ t: 'challenge', target: b.p.id });
    const ch = b.last('challenge')!;
    expect(ch.ring).toBe(0);
    b.send({ t: 'challengeReply', from: a.p.id, accept: true });
    return { ...h, a, b, c, lobby };
  }

  it('seals a ring around two players who agree to fight in it', () => {
    const { step, now, a, b, c, lobby } = duel();
    const view = a.last('rings')!.r[0];
    expect(view).toMatchObject({ state: 'countdown', a: a.p.id, b: b.p.id });
    expect(c.last('rings')!.r[0].state).toBe('countdown');
    const fa = a.p.fighter!;
    const fb = b.p.fighter!;
    const fc = c.p.fighter!;
    // nobody hurts anybody during the countdown
    expect(lobby.canDamage(fa, fb)).toBe(false);

    // an onlooker who wanders in is put back outside
    place(c.p, ring.x, ring.z + 1);
    step(100);
    expect(Math.hypot(fc.x - ring.x, fc.z - ring.z)).toBeGreaterThanOrEqual(ring.r);

    step(RING_DUEL.countdown + 100);
    expect(a.last('rings')!.r[0].state).toBe('fight');
    expect(lobby.canDamage(fa, fb)).toBe(true);
    expect(lobby.canDamage(fb, fa)).toBe(true);
    // ...and can't touch them from the edge, nor be touched by them
    place(c.p, ring.x + ring.r + 0.6, ring.z);
    expect(lobby.canDamage(fc, fa)).toBe(false);
    expect(lobby.canDamage(fa, fc)).toBe(false);
    // the duelists can't leave
    place(a.p, ring.x - ring.r - 3, ring.z);
    step(100);
    expect(Math.hypot(fa.x - ring.x, fa.z - ring.z)).toBeLessThan(ring.r);

    // a KO settles it; the loser gets up in the ring, and it opens again
    fb.hp = 0;
    fb.force('dead', now());
    (lobby as unknown as { onKill(v: unknown, k: unknown, how: string, now: number): void }).onKill(fb, fa, 'slain', now());
    const over = a.last('rings')!.r[0];
    expect(over).toMatchObject({ state: 'over', w: a.p.id });
    expect(c.inbox.some((m) => m.t === 'chat' && m.sys && m.text.includes('Kenji defeated Hana in the ring'))).toBe(true);
    expect(lobby.canDamage(fa, fb)).toBe(false);
    step(RING_DUEL.after + 200);
    expect(a.last('rings')!.r[0].state).toBe('open');
    expect(fb.isAlive()).toBe(true);
    expect(Math.hypot(fb.x - ring.x, fb.z - ring.z)).toBeLessThan(ring.r);
  });

  it('goes to the one who stays when the other leaves', () => {
    const { step, a, b, c } = duel();
    step(RING_DUEL.countdown + 100);
    a.send({ t: 'queue', mode: 'ranked' });
    expect(a.last('notice')!.text).toMatch(/ring duel/);
    b.leave();
    expect(a.last('rings')!.r[0]).toMatchObject({ state: 'over', w: a.p.id });
    expect(c.inbox.some((m) => m.t === 'chat' && m.sys && m.text.includes('walked away'))).toBe(true);
  });

  it('decides on health when time runs out', () => {
    const { step, a, b } = duel();
    step(RING_DUEL.countdown + 100);
    a.p.fighter!.hp = a.p.fighter!.maxHp * 0.4;
    step(RING_DUEL.time + 100);
    expect(a.last('rings')!.r[0]).toMatchObject({ state: 'over', w: b.p.id });
  });

  it('still sends a challenge made outside a ring to an arena', () => {
    const { step, join } = harness();
    const a = join('Far');
    const b = join('Away');
    place(a.p, 0, 40);
    place(b.p, 2, 40);
    a.send({ t: 'challenge', target: b.p.id });
    expect(b.last('challenge')!.ring).toBeUndefined();
    b.send({ t: 'challengeReply', from: a.p.id, accept: true });
    step(100);
    expect(a.last('select')).toBeTruthy();
  });
});
