import { describe, expect, it } from 'vitest';
import { CharacterModel } from '../src/client/render/character';
import { ARM_K, HIPS_Y, LEG_K } from '../src/client/render/anim/moves/greathammer-base';

describe('warden swings', () => {
  // the hammer lines are drawn in his own frame and baked into torso space with the rig's own
  // scales (and kept off the floor with them); if the model's proportions change, these must be
  // updated or every swing drifts off its target
  it('are baked against the rig the Warden actually has', () => {
    const m = new CharacterModel('juggernaut') as unknown as { armK: number; legK: number; d: { hipsY: number } };
    expect(m.armK).toBeCloseTo(ARM_K, 2);
    expect(m.legK).toBeCloseTo(LEG_K, 2);
    expect(m.d.hipsY).toBeCloseTo(HIPS_Y, 2);
    // building the voxel model takes a few seconds on a busy machine
  }, 20_000);
});
