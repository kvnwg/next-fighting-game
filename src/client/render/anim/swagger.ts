/**
 * How each fighter walks: its gait and its swagger.
 *
 * The gait is the legs and the body over them: the cadence and stride, how wide the feet go, how
 * high and when the swing foot lifts, how hard each step lands, the weight rolling over onto the
 * planted foot, the pelvis turning with the legs and the shoulders counter-turning against it, and
 * the head steadied over it all. The animator lays the gait over whatever pose is playing (during a
 * move only the legs and hips, which the move doesn't own).
 *
 * The swagger is the walk's carry: how the fighter holds the weapon and the free hand while it
 * walks out of a fight (the hammer slung on a shoulder, a hand on the hip, the hands clasped behind
 * the back), the arms swinging about the shoulders against the legs, and the set of the trunk and
 * head. It blends in by how fast the fighter is walking, only when it is idle (attacks, blocks and
 * dodges blend from wherever it left the hands and own them from there).
 *
 * Coordinates as in author.ts: torso space, +x the fighter's left, +y up, +z forward, origin at the
 * waist, shoulders at (-0.33, 0.5, 0) and (0.33, 0.5, 0), an arm reaching about 0.58.
 */
import type { WeaponKind } from '../../../shared/characters';
import { X } from './author';
import type { V3, WeaponXf } from './author';
import { smooth } from './math';
import { G2 } from './moves/greathammer-base';

/** How a fighter walks: the defaults, and each fighter's character. */
export interface GaitStyle {
  /** steps per second relative to a person's (lower: longer, slower strides at the same speed) */
  cadence: number;
  /** feet apart (reference metres, each side): small walks a line, big rolls like a bear */
  width: number;
  /** vertical bob (m) and how hard each step lands (1 soft, higher drops onto the foot, below 1 springs) */
  bob: number;
  heavy: number;
  /** the trunk rolls over onto the planted foot (rad) */
  roll: number;
  /** the pelvis shifts out over the planted foot (reference metres, each way) */
  sway: number;
  /** pelvis turn with the legs (rad) */
  hips: number;
  /** shoulders counter-turning against the hips, swaggering (rad; otherwise 0.6 x hips) */
  shoulders: number;
  /** forward lean at full speed (rad) */
  lean: number;
  /** step height (reference metres at a walk) */
  lift: number;
  /** when in the swing the foot is highest (0.3: the heel flicks up behind; 0.6: the knee comes up in front) */
  liftAt: number;
  /** legs straighten to at least this crouch to walk */
  crouch: number;
  /** the longest stride a planted foot covers (reference metres) before steps just come faster */
  reach: number;
  /** how far the hands pump against the legs while walking with the guard up (reference metres) */
  arms: number;
  /** the head dips as each foot lands (rad) */
  nod: number;
  /** a puff of dust under each footfall (effect scale; 0 none) */
  dust: number;
}

export const GAIT: GaitStyle = {
  cadence: 1,
  width: 0.14,
  bob: 0.035,
  heavy: 1,
  roll: 0.035,
  sway: 0.012,
  hips: 0.12,
  shoulders: 0.08,
  lean: 0.14,
  lift: 0.1,
  liftAt: 0.42,
  crouch: -0.05,
  reach: 0.78,
  arms: 0,
  nod: 0,
  dust: 0,
};

/** The carry: the swagger's pose and arm swing (see the header). */
export interface Carry {
  /** the trunk and head while walking (absolute; channels left out keep the guard's) */
  body: { lean?: number; twist?: number; hipTwist?: number; side?: number; headPitch?: number; crouch?: number };
  main: WeaponXf;
  /**
   * a waypoint the main weapon passes through between the guard and the carry, both ways, when
   * the straight turn from one to the other would sweep it through the body
   */
  via?: WeaponXf;
  /** the off-hand item (dagger, fist, shield) */
  off?: WeaponXf;
  /** the free left hand */
  free?: V3;
  /** arm swing about the shoulder (rad each way at a walk): the right arm, and the left */
  swingR: number;
  swingL: number;
  /** how much a held item turns with its arm's swing (1: it hangs from the hand like a pendulum) */
  followR: number;
  followL: number;
  /** the elbow bends into the forward swing (the hand rises this much per rad) */
  bend: number;
  /** the point of the main weapon flicks round a small circle once a stride (rad) */
  twirl?: number;
}

/** Each fighter's gait (only what differs from GAIT). */
export const GAITS: Partial<Record<WeaponKind, Partial<GaitStyle>>> = {
  // Ronin: the unhurried killer. Long easy strides with almost no bob, the shoulders loose and
  // barely turning, low smooth steps that just clear the ground
  katana: { cadence: 0.86, width: 0.12, bob: 0.018, heavy: 1.1, roll: 0.02, sway: 0.012, hips: 0.11, shoulders: 0.1, lean: 0.12, lift: 0.075, liftAt: 0.45, crouch: -0.03 },
  // Warden: the juggernaut. Wide-legged, slow, every step dropped onto the foot with a puff of
  // dust, the whole bulk rolling from side to side over the planted leg and the shoulders swinging
  // round against the hips; the head jolts down at each footfall
  greathammer: { cadence: 0.74, width: 0.21, bob: 0.075, heavy: 2.4, roll: 0.11, sway: 0.024, hips: 0.18, shoulders: 0.24, lean: 0.2, lift: 0.13, liftAt: 0.5, crouch: -0.09, reach: 0.88, nod: 0.06, dust: 0.35 },
  // Duelist: the strut. Quick light steps placed one before the other on a line, springing off the
  // balls of the feet (a soft landing, high in mid-stance), the knee lifting each foot in front, the
  // hips swinging and swaying with it
  rapier: { cadence: 1.1, width: 0.065, bob: 0.034, heavy: 0.7, roll: 0.03, sway: 0.022, hips: 0.22, shoulders: 0.1, lean: 0.1, lift: 0.11, liftAt: 0.6, crouch: -0.02, arms: 0.07 },
  // Lancer: the knight's march. Upright, measured, the knee brought up in front and the foot set
  // down firmly, the trunk carried square and still
  spear: { cadence: 0.92, width: 0.15, bob: 0.04, heavy: 1.7, roll: 0.03, sway: 0.014, hips: 0.1, shoulders: 0.09, lean: 0.08, lift: 0.14, liftAt: 0.6 },
  // Assassin: the prowl. Low on bent knees and dead level, the feet skimming the ground, the trunk
  // hunched and barely turning
  daggers: { cadence: 1.02, width: 0.14, bob: 0.012, heavy: 1, roll: 0.015, sway: 0.008, hips: 0.08, shoulders: 0.05, lean: 0.2, lift: 0.06, liftAt: 0.45, crouch: -0.17, reach: 0.82, arms: 0.16 },
  // Wraith: the glide. Very long slow strides, the feet skimming low under the robe and the body
  // drifting level over them, the shoulders dead still
  scythe: { cadence: 0.66, width: 0.1, bob: 0.008, heavy: 1, roll: 0.01, sway: 0, hips: 0.15, shoulders: 0.02, lean: 0.1, lift: 0.05, liftAt: 0.4, crouch: -0.05, reach: 0.95 },
  // Monk: calm and grounded. Unhurried even steps rolled heel to toe, the body quiet over them
  gauntlets: { cadence: 0.86, width: 0.14, bob: 0.02, heavy: 1.1, roll: 0.025, sway: 0.012, hips: 0.09, shoulders: 0.04, lean: 0.1, lift: 0.07, liftAt: 0.45, arms: 0.1 },
  // Knight: the armoured march. Square and heavy, each foot lifted and set down hard
  swordShield: { cadence: 0.9, width: 0.17, bob: 0.045, heavy: 1.8, roll: 0.05, sway: 0.018, hips: 0.1, shoulders: 0.07, lift: 0.12, liftAt: 0.55 },
};

/** Each fighter's swagger carry. */
export const CARRY: Partial<Record<WeaponKind, Carry>> = {
  // Ronin: the drawn blade hangs loose from the right hand with its point trailing low behind him,
  // swinging lazily with the arm; the left hand rests on the saya at the hip; the head carried a
  // little forward under the kasa, eyes up
  katana: {
    body: { lean: 0.1, twist: 0.04, hipTwist: 0, side: 0, headPitch: -0.08 },
    main: X([-0.37, 0.05, 0.05], [-0.15, -0.6, -0.78], [0, -0.78, 0.6], 'y'),
    free: [0.1, 0.07, 0.15],
    swingR: 0.2,
    swingL: 0,
    followR: 0.5,
    followL: 0,
    bend: 0.05,
  },
  // Warden: the hammer slung up on his right shoulder in one fist, its head riding behind him; the
  // left arm hangs out from his bulk and swings big against the legs; head down, glowering. His
  // breastplate fills torso space out to about x ±0.32 and z 0.22 at the shoulders (in these
  // reference units), so the fist is held out in front of the right shoulder, past the plate's
  // corner, with the elbow down at his side: any closer in and the forearm sinks into his chest.
  // From the guard (the head on the floor ahead of his left foot) the shortest turn to the carry
  // swings the head through his chest and out of his left side, so he hoists it instead: up in
  // front of him, the haft standing up from his fists before the right side of his chest, and
  // over the shoulder from there
  greathammer: {
    body: { lean: 0.16, twist: 0, hipTwist: 0, side: 0, headPitch: 0.06 },
    main: X([-0.36, 0.4, 0.31], [-0.04, 0.5, -0.87], [0, 0.87, 0.5], 'x'),
    via: X([-0.28, 0.42, 0.42], [-0.1, 0.8, 0.58], [0, -0.59, 0.81], 'x', G2),
    free: [0.44, 0.06, 0.05],
    swingR: 0.03,
    swingL: 0.36,
    followR: 1,
    followL: 0,
    bend: 0.08,
  },
  // Duelist: chest out and chin up, the rapier carried like a cane in the right hand with its point
  // down at the ground ahead, the wrist flicking it round a little circle every stride; the left
  // fist on the hip
  rapier: {
    body: { lean: -0.08, twist: 0.12, hipTwist: 0, side: 0, headPitch: -0.16 },
    main: X([-0.31, 0.12, 0.2], [-0.12, -0.55, 0.83], [0, 0.83, 0.55], 'y'),
    free: [0.27, 0.07, -0.05],
    swingR: 0.16,
    swingL: 0,
    followR: 0.7,
    followL: 0,
    bend: 0.04,
    twirl: 0.22,
  },
  // Lancer: the glaive carried upright like a standard in the right fist, the forearm level and
  // the shaft dead vertical, the left arm swinging long and straight in time with the march
  spear: {
    body: { lean: 0.02, twist: 0, hipTwist: 0, side: 0, headPitch: -0.06 },
    main: X([-0.32, 0.27, 0.13], [0.02, 1, 0.05], [0, 0, 1], 'x'),
    free: [0.36, -0.02, 0.03],
    swingR: 0.02,
    swingL: 0.3,
    followR: 0,
    followL: 0,
    bend: 0.03,
  },
  // Assassin: hunched low with the head up and level, both knives reversed along the forearms and
  // held low by the thighs, the arms barely swinging
  daggers: {
    body: { lean: 0.32, twist: -0.04, hipTwist: 0, side: 0, headPitch: -0.22, crouch: -0.16 },
    main: X([-0.33, 0.02, 0.12], [-0.12, 0.5, -0.86], [-1, 0, 0], 'y'),
    off: X([0.33, 0.02, 0.12], [0.12, 0.5, -0.86], [1, 0, 0], 'y'),
    swingR: 0.12,
    swingL: 0.12,
    followR: 0.6,
    followL: 0.6,
    bend: 0.06,
  },
  // Wraith: the sickle trailed from the right hand, its long haft slanting back and the blade
  // skimming the ground behind; the left arm trails a little behind in its sleeve, the arms all but
  // still; head bowed
  scythe: {
    body: { lean: 0.1, twist: 0, hipTwist: 0, side: 0, headPitch: 0.1 },
    main: X([-0.37, 0.06, 0.02], [-0.08, -0.7, -0.7], [0, -1, 0], '-x'),
    free: [0.38, 0.0, -0.12],
    swingR: 0.05,
    swingL: 0.05,
    followR: 1,
    followL: 0,
    bend: 0.02,
  },
  // Monk: upright and easy, the hands clasped behind the small of the back, the shoulders quiet
  gauntlets: {
    body: { lean: -0.02, twist: 0, hipTwist: 0, side: 0, headPitch: -0.05 },
    main: X([-0.07, 0.1, -0.27], [0.92, -0.25, -0.3], [0, 0, -1], 'y'),
    off: X([0.07, 0.14, -0.29], [-0.92, -0.25, -0.3], [0, 0, -1], 'y'),
    swingR: 0,
    swingL: 0,
    followR: 1,
    followL: 1,
    bend: 0,
  },
  // Knight: the shield carried square in front of the left side of the chest, the sword point down
  // and forward at the right side, swinging with the arm
  swordShield: {
    body: { lean: 0.08, twist: -0.1, hipTwist: 0, side: 0, headPitch: 0 },
    main: X([-0.35, 0.06, 0.14], [-0.15, -0.6, 0.78], [0, 0.78, 0.6], 'y'),
    off: X([0.18, 0.3, 0.36], [-0.12, 0.04, 1], [0, 1, 0], 'y'),
    swingR: 0.18,
    swingL: 0,
    followR: 0.8,
    followL: 0,
    bend: 0.05,
  },
};

/**
 * The walk cycle at a speed (reference metres per second): how fast the cycle turns, the stride
 * a planted foot covers, the share of the cycle a foot is planted, and the step height. A person
 * takes about 1.8 steps a second at a stroll and nearly 3 at a run; the stride grows with speed
 * until the legs can't reach further, and beyond that the steps come faster with more air.
 */
export function gait(v: number, G: GaitStyle): { freq: number; stride: number; stance: number; lift: number } {
  let freq = G.cadence * Math.min(1.7, 0.62 + 0.2 * v);
  let stance = 0.62 - 0.2 * smooth((v - 1.8) / 2.5);
  let stride = (v * stance) / freq;
  const reach = G.reach;
  if (stride > reach) {
    stride = reach;
    stance = Math.max(0.3, (reach * freq) / Math.max(0.01, v));
    freq = (v * stance) / stride;
  }
  return { freq, stride, stance, lift: G.lift * (1 + 0.25 * Math.min(3, v)) };
}

/** The swing foot's height through the swing (q 0..1), peaking at liftAt. */
export function swingHeight(q: number, G: GaitStyle): number {
  const e = Math.log(0.5) / Math.log(Math.min(0.9, Math.max(0.1, G.liftAt)));
  return Math.pow(Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, q)), e)), 1 / G.heavy);
}
