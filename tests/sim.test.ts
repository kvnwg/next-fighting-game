import { describe, expect, it } from 'vitest';
import { simulateMatch } from './sim';

describe('bot vs bot simulation', () => {
  it('plays a full best-of-3 match to completion with real exchanges', () => {
    const r = simulateMatch('ronin', 'paladin', 'hard', 0);
    expect(Math.max(...r.scores)).toBe(2);
    expect(r.outcomes.deflect ?? 0).toBeGreaterThan(0);
    expect(r.outcomes.hit ?? 0).toBeGreaterThan(0);
  });

  it('ring-outs and hazards resolve rounds on dangerous maps', () => {
    for (const map of [2, 3, 4]) {
      const r = simulateMatch('juggernaut', 'shade', 'normal', map);
      expect(Math.max(...r.scores)).toBe(2);
    }
  });
});
