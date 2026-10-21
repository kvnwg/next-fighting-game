import { describe, expect, it } from 'vitest';
import { getAttack } from '../src/shared/characters';
import { Fighter } from '../src/shared/fighter';

function fighter(): Fighter {
  const f = new Fighter('a', 'ronin');
  f.yaw = 0;
  return f;
}

/** ms into the current attack's recovery, at fraction `k` of it */
function recovery(f: Fighter, k: number): number {
  return f.stateStart + f.atkWindup + f.attack!.active + f.attack!.recovery * k + 1;
}

describe('cancel table', () => {
  it('a light cancels into a heavy in its recovery, but not in its windup', () => {
    const f = fighter();
    f.input('light', 1000);
    expect(f.canCancel('heavy', 1001)).toBe(false);
    const t = recovery(f, 0);
    f.update(t);
    expect(f.input('heavy', t)).toBe(true);
    expect(f.attackKey).toBe('h');
  });

  it('the special only follows an attack that made contact', () => {
    const f = fighter();
    f.input('light', 1000);
    const t = recovery(f, 0.1);
    f.update(t);
    expect(f.canCancel('special', t)).toBe(false);
    f.contactSerial = f.attackSerial;
    expect(f.canCancel('special', t)).toBe(true);
    expect(f.input('special', t)).toBe(true);
    expect(f.attackKey).toBe('sp');
  });

  it('a new attack clears the contact: the next one has to land on its own', () => {
    const f = fighter();
    f.input('light', 1000);
    f.contactSerial = f.attackSerial;
    const t = recovery(f, 0);
    f.update(t);
    f.input('light', t);
    expect(f.attackKey).toBe('l1');
    expect(f.canCancel('special', recovery(f, 0.1))).toBe(false);
  });

  it('the heavy finisher commits: no light, no heavy, and a dodge only late in its recovery', () => {
    const f = fighter();
    f.startAttack('h2', 1000);
    const early = recovery(f, 0.2);
    f.update(early);
    expect(f.canCancel('light', early)).toBe(false);
    expect(f.canCancel('heavy', early)).toBe(false);
    expect(f.canCancel('dodge', early)).toBe(false);
    expect(f.canCancel('dodge', recovery(f, 0.65))).toBe(true);
  });

  it('a dash light carries on into the string from its second hit', () => {
    const f = fighter();
    f.startAttack('dl', 1000);
    const t = recovery(f, 0);
    f.update(t);
    expect(f.input('light', t)).toBe(true);
    expect(f.attackKey).toBe('l1');
  });

  it('an air light drops into the plunge only if it connected', () => {
    const f = fighter();
    f.input('jump', 1000);
    f.input('light', 1100);
    expect(f.attackKey).toBe('jl');
    const t = recovery(f, 0);
    expect(f.canCancel('heavy', t)).toBe(false);
    f.contactSerial = f.attackSerial;
    expect(f.canCancel('heavy', t)).toBe(true);
  });

  it('jump attacks hit harder than the same attack on the ground', () => {
    const f = fighter();
    const l0 = getAttack(f.char, 'l0')!;
    const jl = getAttack(f.char, 'jl')!;
    const h = getAttack(f.char, 'h')!;
    const jh = getAttack(f.char, 'jh')!;
    expect(jl.damage).toBeGreaterThan(l0.damage);
    expect(jl.posture).toBeGreaterThan(l0.posture * 1.4);
    expect(jh.damage).toBeGreaterThan(h.damage);
    expect(jh.posture).toBeGreaterThan(h.posture * 1.4);
  });
});
