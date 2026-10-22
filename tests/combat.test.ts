import { describe, expect, it } from 'vitest';
import { applyHit, decideOutcome, defenseAt, executeBlow, pushDefense } from '../src/shared/combat';
import { CHARACTERS } from '../src/shared/characters';
import { COMBAT } from '../src/shared/config';
import { DefenseEvent, Fighter } from '../src/shared/fighter';
import { eloDelta, rankOf } from '../src/shared/ranks';

/** attacker at origin facing +z, defender 2m in front facing the attacker */
function duel(a = 'ronin', d = 'ronin') {
  const A = new Fighter('a', a as any);
  const D = new Fighter('d', d as any);
  A.yaw = 0;
  D.z = 2;
  D.yaw = Math.PI;
  return { A, D };
}

function logOf(f: Fighter): DefenseEvent[] {
  const log: DefenseEvent[] = [];
  for (const e of f.drainEvents()) {
    if (e.type === 'guardOn' || e.type === 'guardOff' || e.type === 'dodge' || e.type === 'jump') pushDefense(log, e);
  }
  return log;
}

describe('fighter state machine', () => {
  it('chains light attacks only during recovery', () => {
    const { A } = duel();
    expect(A.input('light', 1000)).toBe(true);
    expect(A.attackKey).toBe('l0');
    const l0 = CHARACTERS.ronin.lights[0];
    // during the active frames: buffered, not chained yet
    expect(A.input('light', 1000 + l0.windup + 20)).toBe(false);
    expect(A.attackKey).toBe('l0');
    A.update(1000 + l0.windup + l0.active + 10);
    expect(A.attackKey).toBe('l1');
  });

  it('feints heavy attacks into guard', () => {
    const { A } = duel();
    A.input('heavy', 1000);
    expect(A.input('blockDown', 1200)).toBe(true);
    expect(A.state).toBe('block');
    expect(A.drainEvents().some((e) => e.type === 'feint')).toBe(true);
  });

  it('a deflect press cuts any attack short, but only a feintable one reads as a feint', () => {
    const { A } = duel();
    A.input('light', 1000);
    A.drainEvents();
    A.input('blockDown', 1100);
    expect(A.state).toBe('block');
    expect(A.drainEvents().some((e) => e.type === 'feint')).toBe(false);
    const duelist = new Fighter('x', 'duelist');
    duelist.input('light', 1000);
    duelist.drainEvents();
    duelist.input('blockDown', 1100);
    expect(duelist.state).toBe('block');
    expect(duelist.drainEvents().some((e) => e.type === 'feint')).toBe(true);
  });

  it('a deflect press registers at once, even mid-swing or mid-recovery', () => {
    const { A } = duel();
    A.input('heavy', 1000);
    const t = 1000 + A.atkWindup + 30;
    A.input('blockDown', t);
    expect(A.state).toBe('block');
    expect(A.parryUntil).toBeGreaterThan(t + COMBAT.parryWindow - 1);
  });

  it('shrinks the deflect window when spamming', () => {
    const { D } = duel();
    D.input('blockDown', 1000);
    D.input('blockUp', 1050);
    D.input('blockDown', 1150);
    expect(D.parryUntil - 1150).toBeLessThan(COMBAT.parryWindow + 40);
    expect(D.spamCount).toBe(1);
  });
});

describe('hit resolution', () => {
  it('deflects a timed guard and staggers the attacker', () => {
    const { A, D } = duel();
    A.input('light', 1000);
    D.input('blockDown', 1200);
    const tHit = 1000 + A.atkWindup;
    const def = defenseAt(logOf(D), tHit);
    expect(def.parrying).toBe(true);
    const outcome = decideOutcome(A, D, A.attack!, tHit, def);
    expect(outcome).toBe('deflect');
    applyHit(A, D, A.attack!, A.attackKey!, outcome, tHit, { distance: 2 });
    expect(A.state).toBe('deflected');
    expect(A.posture).toBeGreaterThan(0);
    expect(D.hp).toBe(D.maxHp);
  });

  it('a held guard blocks (posture damage, no deflect)', () => {
    const { A, D } = duel();
    D.input('blockDown', 500);
    A.input('light', 1000);
    const tHit = 1000 + A.atkWindup;
    const outcome = decideOutcome(A, D, A.attack!, tHit, defenseAt(logOf(D), tHit));
    expect(outcome).toBe('block');
    applyHit(A, D, A.attack!, A.attackKey!, outcome, tHit, { distance: 2 });
    expect(D.posture).toBeGreaterThan(0);
    expect(D.state).toBe('blockstun');
  });

  it('perilous sweeps go through guard but not over a jump', () => {
    const { A, D } = duel('juggernaut');
    D.input('blockDown', 500);
    A.input('special', 1000);
    const tHit = 1000 + A.atkWindup;
    expect(decideOutcome(A, D, A.attack!, tHit, defenseAt(logOf(D), tHit))).toBe('hit');
    const J = new Fighter('j', 'ronin');
    J.z = 2;
    J.yaw = Math.PI;
    J.input('jump', tHit - 200);
    expect(decideOutcome(A, J, A.attack!, tHit, defenseAt(logOf(J), tHit))).toBe('evade');
  });

  it('dodging into a perilous thrust is a Mikiri counter', () => {
    const { A, D } = duel();
    A.input('special', 1000);
    const tHit = 1000 + A.atkWindup;
    D.input('dodge', tHit - 80, { dx: 0, dz: -1 }); // toward the attacker
    const outcome = decideOutcome(A, D, A.attack!, tHit, defenseAt(logOf(D), tHit));
    expect(outcome).toBe('mikiri');
  });

  it('full posture breaks guard, then the next hit starts an execution that does the damage', () => {
    const { A, D } = duel();
    D.posture = D.maxPosture - 1;
    D.input('blockDown', 500);
    A.input('light', 1000);
    const tHit = 1000 + A.atkWindup;
    const o = decideOutcome(A, D, A.attack!, tHit, defenseAt(logOf(D), tHit));
    expect(o).toBe('guardBreak');
    applyHit(A, D, A.attack!, A.attackKey!, o, tHit, { distance: 2 });
    expect(D.state).toBe('broken');
    const t2 = tHit + 500;
    expect(decideOutcome(A, D, A.attack!, t2, defenseAt([], t2))).toBe('deathblow');
    const r = applyHit(A, D, A.attack!, A.attackKey!, 'deathblow', t2, { distance: 2 });
    expect(r.execute).toBe(true);
    expect(A.state).toBe('execute');
    expect(D.state).toBe('executed');
    // locked in: neither can act until it plays out
    expect(D.input('dodge', t2 + 100)).toBe(false);
    expect(A.input('light', t2 + 100)).toBe(false);
    const blow = executeBlow(A, D, t2 + COMBAT.executeHitAt);
    expect(blow.damage).toBe(Math.round(D.maxHp * COMBAT.executeDamage));
    expect(D.hp).toBe(D.maxHp - blow.damage);
    expect(D.posture).toBe(0);
    // survived it: floored afterwards
    D.update(t2 + COMBAT.executeTime + 1);
    expect(D.state).toBe('knockdown');
  });

  it('an ordinary hit does little damage but a lot of posture', () => {
    const { A, D } = duel();
    A.input('light', 1000);
    const tHit = 1000 + A.atkWindup;
    applyHit(A, D, A.attack!, A.attackKey!, 'hit', tHit, { distance: 2 });
    expect(D.maxHp - D.hp).toBe(Math.round(A.attack!.damage * COMBAT.hitDamageMult));
    expect(D.posture).toBeCloseTo(A.attack!.posture * COMBAT.hitPostureMult, 5);
  });

  it('attacks from behind ignore guard', () => {
    const { A, D } = duel();
    D.yaw = 0; // facing away
    D.input('blockDown', 500);
    A.input('light', 1000);
    const tHit = 1000 + A.atkWindup;
    expect(decideOutcome(A, D, A.attack!, tHit, defenseAt(logOf(D), tHit))).toBe('hit');
  });

  it('lag-compensated guard presses slightly after the hit still deflect', () => {
    const { A, D } = duel();
    A.input('light', 1000);
    const tHit = 1000 + A.atkWindup;
    D.input('blockDown', tHit + 50, { pressTime: tHit + 10 });
    expect(decideOutcome(A, D, A.attack!, tHit, defenseAt(logOf(D), tHit))).toBe('deflect');
  });
});

describe('ranks', () => {
  it('shows placements until enough matches are played', () => {
    expect(rankOf(900, 2).placed).toBe(false);
    expect(rankOf(900, 5).label).toMatch(/Silver/);
    expect(rankOf(1700, 10).label).toBe('Grandmaster');
  });

  it('elo is zero-sum between equal players', () => {
    const w = eloDelta(1000, 1000, 1, 10);
    const l = eloDelta(1000, 1000, 0, 10);
    expect(w).toBe(16);
    expect(l).toBe(-16);
    expect(eloDelta(1000, 1000, 1, 0)).toBe(32); // placements move faster
  });
});
