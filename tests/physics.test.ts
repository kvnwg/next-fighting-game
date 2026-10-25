import { describe, expect, it } from 'vitest';
import { ARENA_MAPS } from '../src/shared/maps';
import { stepBody } from '../src/shared/physics';

describe('physics', () => {
  it('a fast drop onto the floor lands, however far it goes in one step', () => {
    for (const map of ARENA_MAPS) {
      // the centre of every arena is floor
      const b = { x: 0, y: 1.2, z: 0, vy: -26, onGround: false };
      // one long frame: the step alone carries it well below the floor
      const r = stepBody(b, 0, 0, 0.1, map);
      expect(b.y, map.id).toBe(0);
      expect(b.onGround, map.id).toBe(true);
      expect(r.fell, map.id).toBe(false);
    }
  });
});
