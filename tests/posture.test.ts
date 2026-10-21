import { describe, expect, it } from 'vitest';
import { COMBAT } from '../src/shared/config';
import { Fighter } from '../src/shared/fighter';

/** Step the fighter's clock forward in 50 ms ticks, pressing `act` every `every` ms. */
function run(f: Fighter, from: number, to: number, act?: (t: number) => void, every = 0): number {
  let next = from;
  for (let t = from; t <= to; t += 50) {
    if (act && every && t >= next) {
      act(t);
      next = t + every;
    }
    f.update(t);
  }
  return to;
}

describe('posture', () => {
  it('holds while the fighter keeps attacking, and recovers slowly once they stop', () => {
    const f = new Fighter('a', 'ronin');
    f.addPosture(40, 1000);
    let t = 1000;
    // swinging again and again for five seconds: nothing comes back
    t = run(f, t, t + 5000, (now) => f.input('light', now), 450);
    expect(f.posture).toBe(40);
    // standing still: still nothing for a moment, then it drains slowly
    const end = f.lastBusyAt;
    run(f, t, end + COMBAT.postureCalmDelay - 100);
    expect(f.posture).toBe(40);
    run(f, end + COMBAT.postureCalmDelay - 100, end + COMBAT.postureCalmDelay + 1000);
    expect(f.posture).toBeLessThan(40);
    expect(f.posture).toBeGreaterThan(25);
  });

  it('does not recover until a while after the last posture damage', () => {
    const f = new Fighter('a', 'ronin');
    f.addPosture(30, 1000);
    run(f, 1000, 1000 + COMBAT.postureRegenDelay - 100);
    expect(f.posture).toBe(30);
    run(f, 1000 + COMBAT.postureRegenDelay - 100, 1000 + COMBAT.postureRegenDelay + 500);
    expect(f.posture).toBeLessThan(30);
  });

  it('comes back whole when a posture break ends', () => {
    const f = new Fighter('a', 'ronin');
    f.addPosture(f.maxPosture, 1000);
    f.force('broken', 1000, COMBAT.brokenTime);
    f.update(1000 + COMBAT.brokenTime + 10);
    expect(f.state).not.toBe('broken');
    expect(f.posture).toBe(0);
  });
});
