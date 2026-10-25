import { describe, expect, it } from 'vitest';
import { NO_DEFENSE, applyHit, decideOutcome, defenseAt, executeBlow, inAttackCone, pushDefense, thrownSpan } from '../src/shared/combat';
import { CHARACTERS } from '../src/shared/characters';
import { COMBAT, GRAVITY } from '../src/shared/config';
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
    // ...and it goes off once the chain window opens, half way into the recovery
    A.update(1000 + l0.windup + l0.active + l0.recovery * 0.5);
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
  it('an air attack hangs at the top, then slams down to land as the blow comes out', () => {
    const f = new Fighter('x', 'monk');
    const dt = 1 / 60;
    let t = 1000;
    f.input('jump', t);
    const step = () => {
      f.airControl(t, dt);
      f.vy -= GRAVITY * dt;
      f.y += f.vy * dt;
      if (f.y <= 0) {
        f.y = 0;
        f.vy = 0;
        f.onGround = true;
      }
      t += dt * 1000;
      f.update(t);
    };
    while (t < 1250) step();
    expect(f.input('light', t)).toBe(true);
    expect(f.attackKey).toBe('jl');
    const start = t;
    const yAtPress = f.y;
    while (t < start + f.atkWindup * 0.6) step();
    // still up there, hanging
    expect(f.y).toBeGreaterThan(yAtPress * 0.8);
    while (t < start + f.atkWindup + 20) step();
    expect(f.onGround).toBe(true);
  });

  it('a quick tap deflects: the window plays out after the button is released', () => {
    const { A, D } = duel();
    A.input('light', 1000);
    const tHit = 1000 + A.atkWindup;
    D.input('blockDown', tHit - 120);
    D.input('blockUp', tHit - 80);
    D.update(tHit - 40);
    expect(D.state).toBe('block');
    expect(decideOutcome(A, D, A.attack!, tHit, defenseAt(logOf(D), tHit))).toBe('deflect');
    // and once the window is over the guard comes down
    D.update(D.parryUntil + 10);
    expect(D.state).toBe('idle');
  });

  it('just hit, you cannot deflect for a moment: longer after a heavy than a light', () => {
    for (const [key, lock] of [['l0', COMBAT.hitGuardLockLight], ['h', COMBAT.hitGuardLockHeavy]] as const) {
      const { A, D } = duel();
      A.startAttack(key, 1000);
      const tHit = 1000 + A.atkWindup;
      applyHit(A, D, A.attack!, key, 'hit', tHit, { distance: 2 });
      expect(D.state).toBe('stagger');
      expect(D.input('blockDown', tHit + lock - 30)).toBe(false);
      expect(D.state).toBe('stagger');
      // still held: the guard comes up once the lock is over
      D.update(tHit + lock + 5);
      expect(D.state).toBe('block');
    }
  });

  it('a jump is untouchable on the way up, and open on the way down and landing', () => {
    const log: DefenseEvent[] = [];
    pushDefense(log, { type: 'jump', t: 1000 });
    expect(defenseAt(log, 1000 + 200).iframes).toBe(true);
    expect(defenseAt(log, 1000 + COMBAT.jumpIframesEnd + 50).iframes).toBe(false);
    expect(defenseAt(log, 1000 + 740).iframes).toBe(false);
  });


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
    A.posture = 40;
    const blow = executeBlow(A, D, t2 + COMBAT.executeHitAt);
    expect(blow.damage).toBe(Math.round(D.maxHp * COMBAT.executeDamage));
    expect(D.hp).toBe(D.maxHp - blow.damage);
    // both come out of it with their posture reset
    expect(D.posture).toBe(0);
    expect(A.posture).toBe(0);
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

describe("the Duelist's Prise de Fer", () => {
  it('parries an attack into it and ripostes with a hit that lands on the instant', () => {
    const { A, D } = duel('ronin', 'duelist');
    D.input('ability', 900);
    expect(D.state).toBe('stance');
    A.input('light', 1000);
    const tHit = 1000 + A.atkWindup;
    const out = decideOutcome(A, D, A.attack!, tHit, defenseAt([], tHit));
    expect(out).toBe('counter');
    const hp = A.hp;
    const r = applyHit(A, D, A.attack!, A.attackKey!, out, tHit, { distance: 2 });
    // the riposte is no swing the attacker could guard: its damage is dealt with the parry
    expect(r.damage).toBe(Math.round(CHARACTERS.duelist.ability.kind === 'counter' ? CHARACTERS.duelist.ability.attack.damage * COMBAT.hitDamageMult : 0));
    expect(A.hp).toBe(hp - r.damage);
    expect(A.state === 'stagger' || A.state === 'broken').toBe(true);
    expect(D.attackKey).toBe('ct');
  });

  it('cannot take a grab', () => {
    const { A, D } = duel('monk', 'duelist');
    D.input('ability', 900);
    A.input('special', 1000);
    const tHit = 1000 + A.atkWindup;
    expect(decideOutcome(A, D, A.attack!, tHit, defenseAt([], tHit))).not.toBe('counter');
  });
});

describe('special shapes', () => {
  const special = (id: string) => CHARACTERS[id as 'juggernaut'].special;

  it("the Warden's Fault Line runs out along a straight line, and only along it", () => {
    const { A, D } = duel('juggernaut', 'ronin');
    const atk = special('juggernaut');
    D.z = 8.5;
    expect(inAttackCone(A, D, atk, 0.45)).not.toBeNull();
    D.x = 2.2;
    D.z = 5;
    expect(inAttackCone(A, D, atk, 0.45)).toBeNull();
    D.x = 0;
    D.z = -2;
    expect(inAttackCone(A, D, atk, 0.45)).toBeNull();
  });

  it('the fissure is jumped, and no guard holds it', () => {
    const { A, D } = duel('juggernaut', 'ronin');
    const atk = special('juggernaut');
    expect(decideOutcome(A, D, atk, 1000, { ...NO_DEFENSE, airborne: true })).toBe('evade');
    expect(decideOutcome(A, D, atk, 1000, { ...NO_DEFENSE, guarding: true, parrying: true })).toBe('hit');
  });

  it("the Wraith's Requiem rings him: close in or far out is safe, the band between is not", () => {
    const { A, D } = duel('reaper', 'ronin');
    const atk = special('reaper');
    for (const [x, z, hit] of [[0, 4, true], [-3.5, -2, true], [0, 0.9, false], [0, 7.2, false]] as const) {
      D.x = x;
      D.z = z;
      expect(inAttackCone(A, D, atk, 0.45) !== null).toBe(hit);
    }
  });

  it('an area attack cannot be jumped, guarded or countered, only dodged through', () => {
    const { A, D } = duel('reaper', 'monk');
    const atk = special('reaper');
    expect(decideOutcome(A, D, atk, 1000, { ...NO_DEFENSE, airborne: true })).toBe('hit');
    expect(decideOutcome(A, D, atk, 1000, { ...NO_DEFENSE, guarding: true, parrying: true })).toBe('hit');
    expect(decideOutcome(A, D, atk, 1000, { ...NO_DEFENSE, iframes: true })).toBe('evade');
    D.input('ability', 900);
    expect(D.state).toBe('stance');
    expect(decideOutcome(A, D, atk, 1000, NO_DEFENSE)).not.toBe('counter');
  });

  it("the Lancer's thrown spear reaches only as far as it has flown, out and back", () => {
    const { A, D } = duel('lancer', 'ronin');
    const atk = special('lancer');
    expect(atk.thrown).toBe(true);
    D.z = 10;
    // just thrown, nowhere near them yet; then at the end of its line, past them
    expect(inAttackCone(A, D, atk, 0.45, thrownSpan(atk, 0.05))).toBeNull();
    expect(inAttackCone(A, D, atk, 0.45, thrownSpan(atk, 0.45))).not.toBeNull();
    // on the way back: not back to them yet, then past them
    expect(inAttackCone(A, D, atk, 0.45, thrownSpan(atk, 0.55))).toBeNull();
    expect(inAttackCone(A, D, atk, 0.45, thrownSpan(atk, 0.8))).not.toBeNull();
    // and only along its line
    D.x = 1.5;
    expect(inAttackCone(A, D, atk, 0.45, thrownSpan(atk, 0.45))).toBeNull();
  });

  it('the thrown spear holds its line while it is out', () => {
    const A = new Fighter('a', 'lancer');
    A.input('special', 1000);
    expect(A.turnRate(1000 + A.atkWindup / 2)).toBeGreaterThan(0);
    expect(A.turnRate(1000 + A.atkWindup + A.attack!.active / 2)).toBe(0);
  });

  it("the Lancer's Vault Strike carries him 5m through the air, untouchable, and hits all round on landing", () => {
    const A = new Fighter('a', 'lancer');
    A.input('ability', 1000);
    expect(A.attackKey).toBe('ab');
    let travelled = 0;
    for (let t = 1000; t < 1000 + A.atkWindup + A.attack!.active; t += 5) {
      if (t < 1000 + A.atkWindup) expect(A.vaulting(t)).toBe(true);
      travelled += A.lungeSpeed(t) * 0.005;
    }
    expect(travelled).toBeCloseTo(5, 0);
    expect(A.vaulting(1000 + A.atkWindup + 1)).toBe(false);
    expect(A.invulnUntil).toBeGreaterThan(1000 + A.atkWindup * 0.8);
    // landed behind someone who never turned: their guard faces the other way
    const D = new Fighter('d', 'ronin');
    D.z = -1.5;
    D.yaw = Math.PI;
    expect(inAttackCone(A, D, A.attack!, 0.45)).not.toBeNull();
    expect(decideOutcome(A, D, A.attack!, 1600, { ...NO_DEFENSE, guarding: true, parrying: true })).toBe('hit');
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
