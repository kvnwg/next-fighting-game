import type { WeaponId } from '@nfg/shared';
import type { Vec3, VoxelModel } from '../../../../../characters/voxel-model';
import { buildAssassin, buildAssassinDaggers } from '../../../../../characters/assassin/model.js';
import { buildDuelist, buildDuelistRapier } from '../../../../../characters/duelist/model.js';
import { buildKnight, buildKnightArms } from '../../../../../characters/knight/model.js';
import { buildLancer, buildLancerSpear } from '../../../../../characters/lancer/model.js';
import { buildMonk } from '../../../../../characters/monk/model.js';
import { buildRonin, buildRoninKatana } from '../../../../../characters/ronin/model.js';
import { buildWarden, buildWardenHammer } from '../../../../../characters/warden/model.js';
import { buildWraith, buildWraithScythe } from '../../../../../characters/wraith/model.js';

/** A held prop: part of a voxel model, gripped at `grip` with its striking end along `axis`. */
export interface PropSpec {
  build: () => VoxelModel;
  /** Bones of the prop model to use (default: all). */
  bones?: string[];
  /** Grip point in the prop's voxel coordinates. */
  grip: Vec3;
  /** Direction from the grip toward the striking end, in the prop's voxel coordinates. */
  axis: Vec3;
  /** Extra roll around the shaft, in radians. */
  roll?: number;
  /** Prop bones shown only while the weapon is charged (lightning during heavy swings). */
  charged?: string[];
}

export interface VoxelFighterSpec {
  build: () => VoxelModel;
  /** Body bones hidden in a fight (a sheathed weapon that is drawn instead). */
  hide?: string[];
  /** Right-hand weapon; fighters without one strike with the fist. */
  weapon?: PropSpec;
  /** Left-hand grip along the shaft from the right hand, in meters; null fights one-handed. */
  gripLeft: number | null;
  /** Left-hand prop (second dagger) or a shield worn on the left forearm. */
  offhand?: PropSpec & { on: 'hand' | 'forearm' };
  /** Where the trail runs along the weapon, in meters from the grip. */
  bladeBase: number;
  bladeTip: number;
}

export const VOXEL_FIGHTERS: Record<WeaponId, VoxelFighterSpec> = {
  ronin: {
    build: buildRonin,
    hide: ['katana'],
    weapon: { build: buildRoninKatana, grip: [0.5, 8, 0.5], axis: [0, 1, 0] },
    gripLeft: -0.13,
    bladeBase: 0.09,
    bladeTip: 0.74,
  },
  warden: {
    build: buildWarden,
    weapon: { build: buildWardenHammer, grip: [0, 74, 0], axis: [0, -1, 0] },
    gripLeft: 0.4,
    bladeBase: 1.28,
    bladeTip: 1.66,
  },
  wraith: {
    build: buildWraith,
    weapon: { build: buildWraithScythe, grip: [0, 96, 0], axis: [0, -1, 0], roll: Math.PI / 2 },
    gripLeft: 0.45,
    bladeBase: 1.62,
    bladeTip: 2.16,
  },
  lancer: {
    build: buildLancer,
    weapon: { build: buildLancerSpear, grip: [0, 30, 0], axis: [0, 1, 0], charged: ['lightning'] },
    gripLeft: 0.45,
    bladeBase: 1.4,
    bladeTip: 2.0,
  },
  assassin: {
    build: buildAssassin,
    hide: ['daggerThigh', 'daggerBack'],
    weapon: { build: buildAssassinDaggers, bones: ['daggerR'], grip: [-5.5, 5, 0], axis: [0, 1, 0] },
    gripLeft: null,
    offhand: { build: buildAssassinDaggers, bones: ['daggerL'], grip: [5.5, 5, 0], axis: [0, 1, 0], on: 'hand' },
    bladeBase: 0.07,
    bladeTip: 0.36,
  },
  duelist: {
    build: buildDuelist,
    hide: ['rapier'],
    weapon: { build: buildDuelistRapier, grip: [0.5, 5.5, 0.5], axis: [0, 1, 0] },
    gripLeft: null,
    bladeBase: 0.15,
    bladeTip: 1.07,
  },
  monk: {
    build: buildMonk,
    gripLeft: null,
    bladeBase: 0,
    bladeTip: 0.06,
  },
  knight: {
    build: buildKnight,
    weapon: { build: buildKnightArms, bones: ['greatsword'], grip: [-16.5, 10, 0.5], axis: [0, 1, 0] },
    // The shield arm stays on guard, so the greatsword swings one-handed.
    gripLeft: null,
    offhand: { build: buildKnightArms, bones: ['shield'], grip: [9.5, 15.3, 0], axis: [0, 1, 0], on: 'forearm' },
    bladeBase: 0.09,
    bladeTip: 1.2,
  },
};
