/** Regression tests for issues found in the netcode review. */
import { describe, expect, it } from 'vitest';
import { applyHit, decideOutcome, defenseAt, pruneDefenseLog, pushDefense } from '../src/shared/combat';
import { COMBAT, MATCH } from '../src/shared/config';
import { DefenseEvent, Fighter } from '../src/shared/fighter';
import { CharacterId } from '../src/shared/characters';
import { ServerMsg } from '../src/shared/protocol';
import { Arena } from '../src/server/arena';
import { Player, ServerFighter } from '../src/server/entities';
import { Game } from '../src/server/game';
import { Store } from '../src/server/store';
import { ARENA_MAPS } from '../src/shared/maps';

function logOf(f: Fighter, log: DefenseEvent[] = []): DefenseEvent[] {
  for (const e of f.drainEvents()) {
    if (e.type === 'guardOn' || e.type === 'guardOff' || e.type === 'dodge' || e.type === 'jump') pushDefense(log, e);
  }
  return log;
}

function duel(a: CharacterId = 'ronin', d: CharacterId = 'ronin') {
  const A = new Fighter('a', a);
  const D = new Fighter('d', d);
  D.z = 2;
  D.yaw = Math.PI;
  return { A, D };
}

describe('defense timeline', () => {
  it('a long-held guard still blocks after the log is pruned', () => {
    const { A, D } = duel();
    const log: DefenseEvent[] = [];
    D.input('blockDown', 1000);
    logOf(D, log);
    A.input('light', 3300);
    const tHit = 3300 + A.atkWindup;
    // release and re-press during the hit-confirm delay, then prune as the server does
    D.input('blockUp', tHit + 40);
    D.input('blockDown', tHit + 80);
    logOf(D, log);
    pruneDefenseLog(log, tHit + 100 - 2000);
    expect(decideOutcome(A, D, A.attack!, tHit, defenseAt(log, tHit))).toBe('block');
  });

  it('an automatic re-guard just after a hit is not a deflect', () => {
    const { A, D } = duel();
    D.input('blockDown', 1000);
    D.input('dodge', 1001, { dx: 1, dz: 0 }); // dodge while holding guard
    A.input('light', 1000);
    const tHit = 1000 + A.atkWindup;
    // the dodge ends 20ms after the hit; guard comes back up automatically
    D.update(1001 + COMBAT.dodgeTime);
    const log = logOf(D);
    const out = decideOutcome(A, D, A.attack!, tHit + COMBAT.dodgeTime + 1 - A.atkWindup - 20, defenseAt(log, tHit + COMBAT.dodgeTime + 1 - A.atkWindup - 20));
    expect(out).not.toBe('deflect');
  });

  it('cannot backdate a guard to before a stagger allowed it', () => {
    const { D } = duel();
    D.force('stagger', 1000, COMBAT.staggerTime);
    D.drainEvents();
    D.input('blockDown', 1000 + COMBAT.hitGuardLockLight + 5, { pressTime: 900 });
    const on = D.drainEvents().find((e) => e.type === 'guardOn');
    expect(on && on.t).toBeGreaterThanOrEqual(1000 + COMBAT.hitGuardLockLight);
  });
});

describe('state at the moment of the hit', () => {
  it('a counter stance started after the hit landed does not counter', () => {
    const { A, D } = duel('ronin', 'monk');
    A.input('light', 1000);
    const tHit = 1000 + A.atkWindup;
    D.input('ability', tHit + 40);
    expect(D.state).toBe('stance');
    expect(decideOutcome(A, D, A.attack!, tHit, defenseAt([], tHit))).toBe('hit');
  });

  it('hyper armor from a heavy started after the hit does not apply', () => {
    const { A, D } = duel('ronin', 'juggernaut');
    A.input('light', 1000);
    const tHit = 1000 + A.atkWindup;
    D.input('heavy', tHit + 30);
    expect(decideOutcome(A, D, A.attack!, tHit, defenseAt([], tHit))).toBe('hit');
    applyHit(A, D, A.attack!, A.attackKey!, 'hit', tHit + 60, { distance: 2 });
    expect(D.state).toBe('stagger');
  });
});

// ------------------------------------------------------------------ server-level checks

function setup(a: CharacterId, b: CharacterId) {
  let t = 1000;
  const game = new Game(new Store(null), () => t);
  const inboxA: ServerMsg[] = [];
  const mk = (name: string, char: CharacterId, inbox: ServerMsg[]) =>
    new Player({ readyState: 1, send: (d: string) => inbox.push(JSON.parse(d)), close() {}, on() {} } as never, game.store.create(name), char);
  const pa = mk('A', a, inboxA);
  const pb = mk('B', b, []);
  const arena: Arena = game.startMatch('casual', pa, pb, undefined, ARENA_MAPS[0]);
  const step = (ms: number) => {
    const end = t + ms;
    while (t < end) {
      t += 1000 / 60;
      game.tick();
    }
  };
  step(MATCH.introTime + MATCH.countdownTime + 500); // intro + countdown
  expect(arena.phase).toBe('fight');
  return { game, arena, pa, pb, fa: arena.slots[0] as ServerFighter, fb: arena.slots[1] as ServerFighter, inboxA, step, now: () => t };
}

describe('new specials on the server', () => {
  const hitsBy = (inbox: ServerMsg[], id: string) =>
    inbox.filter((m) => m.t === 'fx').flatMap((m) => (m as Extract<ServerMsg, { t: 'fx' }>).e).filter((e) => e.a === id && e.k !== 'feint');

  it('Thunderstrike is aimed at the foe as it starts, and misses them if they leave the mark', () => {
    for (const leave of [false, true]) {
      const { arena, fa, fb, inboxA, now, step } = setup('lancer', 'ronin');
      fa.owner = null;
      fa.x = 0;
      fa.z = 0;
      fa.yaw = 0;
      fb.x = 0.5;
      fb.z = 8;
      fb.yaw = Math.PI;
      fa.specialReadyAt = 0;
      arena.applyInput(fa, 'special', now());
      expect(fa.aim).toEqual({ x: 0.5, z: 8 });
      step(300);
      if (leave) fb.x = 3.5;
      step(fa.atkWindup + 400);
      const out = hitsBy(inboxA, fa.id).map((e) => e.k);
      expect(out.includes('hit')).toBe(!leave);
    }
  });

  it('Vault Strike carries the Lancer over the foe and takes them in the back, past their guard', () => {
    const { arena, pb, fa, fb, inboxA, now, step } = setup('lancer', 'ronin');
    fa.owner = null;
    fa.x = 0;
    fa.z = 0;
    fa.yaw = 0;
    fb.x = 0;
    fb.z = 2.6;
    fb.yaw = Math.PI;
    // guarding toward where he started
    arena.handleAction(pb, { t: 'act', a: 'blockDown', vt: now(), r: Math.PI });
    step(300);
    arena.applyInput(fa, 'ability', now());
    step(fa.atkWindup + fa.attack!.active + 200);
    expect(fa.z).toBeGreaterThan(fb.z + 0.5);
    expect(fb.blockHeld).toBe(true);
    expect(hitsBy(inboxA, fa.id)[0]?.k).toBe('hit');
  });
});

describe('server authority', () => {
  it('ignores impossible heights (hovering out of reach)', () => {
    const { arena, pa, fa } = setup('ronin', 'ronin');
    arena.handleMove(pa, { t: 'move', x: fa.x, y: 2.5, z: fa.z, r: 0, g: 0, e: fa.epoch });
    expect(fa.y).toBe(0);
  });

  it('corrects sustained speed hacks', () => {
    const { arena, pa, fa, step } = setup('ronin', 'ronin');
    const epoch = fa.epoch;
    fa.x = -8;
    let x = fa.x;
    for (let i = 0; i < 24; i++) {
      x += 0.5; // 30 m/s at 60Hz: each step alone looks harmless, together they don't
      arena.handleMove(pa, { t: 'move', x, y: 0, z: fa.z, r: 0, g: 1, e: fa.epoch });
      step(1000 / 60);
    }
    expect(fa.epoch).toBeGreaterThan(epoch);
    expect(x - fa.x).toBeGreaterThan(3);
  });

  it('cannot walk away while staggered', () => {
    const { arena, pa, fa, now, step } = setup('ronin', 'ronin');
    step(1000); // let the move budget fill
    fa.force('stagger', now(), 3000);
    fa.x = -6;
    const startX = fa.x;
    let x = fa.x;
    for (let i = 0; i < 60; i++) {
      x += 0.15; // 4.5 m/s walk for 2s
      arena.handleMove(pa, { t: 'move', x, y: 0, z: fa.z, r: 0, g: 1, e: fa.epoch });
      step(1000 / 30);
    }
    expect(fa.x - startX).toBeLessThan(5);
  });

  it('a deflected multi-hit attack does not keep hitting', () => {
    const { arena, pb, fa, fb, inboxA, now, step } = setup('shade', 'ronin');
    // face each other at point blank
    fa.x = 0;
    fa.z = 0;
    fa.yaw = 0;
    fb.x = 0;
    fb.z = 1.6;
    fb.yaw = Math.PI;
    fa.owner = null; // server-driven attacker so its position stays put
    fa.startAttack('dl', now()); // Dart: two hits
    const tHit = now() + fa.atkWindup;
    step(fa.atkWindup - 60);
    arena.handleAction(pb, { t: 'act', a: 'blockDown', vt: tHit - 40, r: Math.PI });
    step(800);
    const outcomes = inboxA.filter((m) => m.t === 'fx').flatMap((m) => (m as Extract<ServerMsg, { t: 'fx' }>).e).filter((e) => e.a === fa.id).map((e) => e.k);
    expect(outcomes[0]).toBe('deflect');
    expect(outcomes.length).toBe(1);
  });
});

describe('forfeiting', () => {
  it('is refused while you are finishing your opponent, and still counts otherwise', () => {
    const { arena, pa, pb, fa, fb, now } = setup('ronin', 'ronin');
    // A is executing B: the round is A's, so A giving up now changes nothing
    fa.force('execute', now(), 3000);
    fb.force('executed', now(), 3000);
    arena.forfeit(pa, true);
    expect(arena.finished).toBe(false);
    // B giving up mid-execution does end it, in A's favour
    arena.forfeit(pb, true);
    expect(arena.finished).toBe(true);
    expect(arena.winner).toBe(0);
  });

  it('leaving still forfeits, even mid-execution', () => {
    const { arena, pa, fa, fb, now } = setup('ronin', 'ronin');
    fa.force('execute', now(), 3000);
    fb.force('executed', now(), 3000);
    arena.forfeit(pa);
    expect(arena.finished).toBe(true);
    expect(arena.winner).toBe(1);
  });
});
