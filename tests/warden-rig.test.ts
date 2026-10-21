import { describe, expect, it } from 'vitest';
import { CharacterModel } from '../src/client/render/character';
import { ARM_K, LEG_K } from '../src/client/render/anim/moves/greathammer-base';

describe('warden swings', () => {
  // the hammer paths are re-based onto his bigger body motion with the rig's own scales; if the
  // model's proportions change, these must be updated or every swing drifts off its target
  it('are baked against the rig the Warden actually has', () => {
    const m = new CharacterModel('juggernaut') as unknown as { armK: number; legK: number };
    expect(m.armK).toBeCloseTo(ARM_K, 2);
    expect(m.legK).toBeCloseTo(LEG_K, 2);
  });
});
