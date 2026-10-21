/**
 * Duelist, rapier. Fenced after the reference duel: a low, sitting en garde, side-on with the right
 * foot and shoulder toward the opponent, the sword arm bent in front with the point raised at their
 * eyes and the back hand curled up behind the head. The lights are a straight lunge, a disengage
 * and a whipping coupé; the heavies a pirouette into the lunge, a bind taken from a hanging high
 * guard and a grand saluting cut; the dash attacks a balestra and a ducking passata, the backstep
 * attacks cut while giving ground, the air attacks corkscrew or plunge, the special salutes and
 * aims before it kills, and the flèche runs them through with the arm already straight.
 *
 * Every attack has a tell: a distinct chamber reached early in the windup and held there (the
 * animator holds it and pushes it further), so the opponent can read which attack is coming:
 *   l0  the hand drawn back beside the cheek, the point still on them, the weight rocked back
 *   l1  the point dropped to their knees under a raised hand
 *   l2  the blade cocked up and back over the right shoulder
 *   h   the body wound away, the blade hidden low behind the right hip, the back arm thrown across
 *   h1  a hanging high guard: the hand above the head, the point slanting down at them
 *   h2  the salute, then the blade raised high and laid back behind the shoulder
 *   sp  the salute, then the blade drawn back level by the ear and the free hand aiming at them
 *   dl  the balestra hop landing on both feet, the hand pulled back to the hip
 *   dh  the body sunk on the back leg, the hand low by the front knee, the point angled up
 *   bl  a backhand chamber: the hand across at the left shoulder, the point flung back left
 *   bh  wound the other way, the arm thrown out long behind to the right
 *   jl  in the air the knees tuck and the hand draws back to the hip
 *   jh  in the air the hand thrown up over the head, the point turned down at them
 *   ab  the point in line: the arm shot straight out and the body tipped over the front foot
 * Each chamber keeps the blade within about 110 degrees of the guard's: the animator pushes the
 * chamber further from guard by extrapolating the rotation, and a bigger turn would flip over.
 *
 * Weapon paths are authored relative to the hips (`body: true`): +z is the opponent whatever way
 * the torso is turned or pitched. Free-hand tracks are in torso space.
 */
import { B, K, P, Style, X, arc, circle, fx, hitAt, line, mv, seq, track } from '../author';
import type { BodyPose, Motion, V3 } from '../author';

const FT = 0.75; // the chest turned left: the right shoulder faces the opponent
// en garde (ref 3.8 s, 6.8 s, 7.7 s): sitting low on both knees, the stance long and narrow
const body = B({ front: 'R', step: 0.44, back: 0.38, width: 0.07, crouch: -0.21, lean: 0.03, twist: FT, hipTwist: 0.35 });
const tb = (o: Partial<BodyPose>) => B({ ...body, ...o });

// the sword hand in guard (hips space): elbow bent, the point raised at their eyes
const GUARD_POS: V3 = [-0.12, 0.36, 0.42];
const GUARD_DIR: V3 = [0.04, 0.4, 1];

// the back hand (torso space): curled up behind the head, higher still for a tell, flung down
// behind the back leg in a lunge
const UP_HAND: V3 = [0.4, 0.8, -0.12];
const HIGH_HAND: V3 = [0.4, 0.98, -0.22];
const LOW_HAND: V3 = [0.42, 0.06, -0.22];
const MID_HAND: V3 = [0.48, 0.42, -0.26];
const DOWN: V3 = [0, -1, 0];
const FWD: V3 = [0, 0, 1];
const H = { body: true };

/** A weapon knot: at s the grip is at pos (hips space) with the blade along dir; edge on the way there. */
type Knot = [number, V3, V3, V3?];

/**
 * The weapon through a list of knots, straight lines between them (held before the first and after
 * the last), so a move reads as a list of positions on its own s axis: guard, tell, strike, finish.
 */
function glideParts(knots: Knot[]): [number, number, Motion][] {
  const parts: [number, number, Motion][] = [];
  const [s0, p0, d0, e0] = knots[0];
  parts.push([s0 - 10, s0, line(p0, p0, d0, d0, e0 ?? DOWN, NaN, NaN, H)]);
  for (let i = 0; i < knots.length - 1; i++) {
    const [sa, pa, da] = knots[i];
    const [sb, pb, db, eb] = knots[i + 1];
    parts.push([sa, sb, line(pa, pb, da, db, eb ?? DOWN, NaN, NaN, H)]);
  }
  const [s1, p1, d1, e1] = knots[knots.length - 1];
  parts.push([s1, s1 + 10, line(p1, p1, d1, d1, e1 ?? DOWN, NaN, NaN, H)]);
  return parts;
}
const glide = (knots: Knot[], blend = 0.04) => seq(glideParts(knots), blend);

// ------------------------------------------------------------------------------------ lights

// Lunge (ref 13.0-13.2 s, an advance and the straight lunge): the tell is the hand drawn back
// beside the cheek with the point still on them and the weight sat back; then the arm shoots out
// before the front foot drives into the lunge
const L0_TELL: V3 = [-0.22, 0.56, 0.14];
const L0_TELL_D: V3 = [0.03, 0.26, 1];
const lunge = glide([
  [-0.5, GUARD_POS, GUARD_DIR],
  [0.0, L0_TELL, L0_TELL_D],
  [0.85, [-0.11, 0.42, 0.88], [0.03, 0.06, 1]],
  [1.05, [-0.11, 0.41, 0.86], [0.03, 0.02, 1]],
]);

// Disengage (ref 13.6 s, the blades engaged): the tell is the point dropped to their knees under
// a raised hand; then it circles round the outside of their blade and comes in high on the lunge
const L1_TELL: V3 = [-0.08, 0.48, 0.42];
const disengage = glide([
  [-0.5, GUARD_POS, GUARD_DIR],
  [0.0, L1_TELL, [0.06, -0.55, 1]],
  [0.3, [-0.09, 0.5, 0.54], [0.42, -0.28, 1]],
  [0.58, [-0.1, 0.51, 0.68], [0.4, 0.22, 1]],
  [0.85, [-0.1, 0.5, 0.84], [0.04, 0.16, 1]],
  [1.05, [-0.1, 0.49, 0.82], [0.04, 0.1, 1]],
]);

// Whip Cut (ref 8.3-8.5 s and 10.6-10.8 s, the blade raised then cut down): the tell is the blade
// cocked up and back over the right shoulder, the wrist laid back; then it whips down across them
const L2_TELL: V3 = [-0.22, 0.7, 0.24];
const L2_TELL_D: V3 = [-0.2, 0.95, -0.35];
const whip = seq(
  [
    ...glideParts([
      [-0.5, GUARD_POS, GUARD_DIR],
      [0.0, L2_TELL, L2_TELL_D, [0, 0.6, 0.8]],
    ]).slice(0, 2),
    [0.0, 1.1, arc(L2_TELL, 0.02, [L2_TELL_D, [-0.3, 0.95, 0.2], [-0.08, 0.14, 1], [0.38, -0.3, 0.86], [0.56, -0.6, 0.52]], NaN, { body: true, pivot1: [-0.08, 0.44, 0.62] })],
  ],
  0.05,
);
const whipHit = hitAt(whip, 2, 2);

// ------------------------------------------------------------------------------------ heavies

// Pirouette (ref 9.1-9.5 s, the turn): the tell is the whole body wound away, the blade hidden low
// behind the right hip and the back arm thrown across the chest, held; then one full turn with the
// blade carried upright and close, out of it straight into a deep lunge
const H_COIL: V3 = [-0.3, 0.2, -0.02];
const H_COIL_D: V3 = [-0.7, -0.55, -0.1];
const pirouette = glide(
  [
    [-1.6, GUARD_POS, GUARD_DIR],
    [-1.3, H_COIL, H_COIL_D],
    [-1.05, [-0.31, 0.18, -0.04], H_COIL_D],
    [-0.6, [-0.05, 0.5, 0.22], [0.02, 1, 0.1], FWD],
    [-0.25, [-0.12, 0.38, 0.28], [0.04, 0.26, 1]],
    [0.85, [-0.08, 0.38, 0.9], [0.05, 0.04, 1]],
    [1.05, [-0.08, 0.37, 0.88], [0.05, 0.0, 1]],
  ],
  0.06,
);

// Prise de Fer (ref 13.8 s, the hanging high guard, and 13.6 / 14.3 s, the bind and the beat):
// the tell is the hand lifted above the head with the point slanting down at them, held; then the
// point sweeps round over their blade, takes it down in the bind and drives in on the low line
// with the hand still turned over high
const H1_HANG: V3 = [-0.16, 0.86, 0.34];
const prise = glide(
  [
    [-1.0, [-0.12, 0.44, 0.86], [0.05, 0.02, 1]],
    [-0.55, [-0.14, 0.7, 0.4], [0.05, -0.1, 1]],
    [-0.2, H1_HANG, [0.06, -0.4, 1]],
    [0.2, [-0.16, 0.68, 0.6], [0.42, -0.08, 1]],
    [0.5, [-0.14, 0.54, 0.74], [0.1, -0.36, 1]],
    [0.85, [-0.12, 0.48, 0.9], [0.04, -0.1, 1]],
    [1.05, [-0.12, 0.47, 0.88], [0.04, -0.14, 1]],
  ],
  0.06,
);

// Grand Salut (ref 0.5 s the salute, 8.0-8.3 s the blade raised, 1.8-2.0 s and 10.0 s the big
// cut): the hilt to the chin, then the tell, the blade raised high and laid back behind the
// shoulder, held; then a passing step and a full-arm cut from high right down through them
const H2_HIGH: V3 = [-0.26, 0.98, 0.12];
const H2_HIGH_D: V3 = [-0.3, 1, -0.1];
const SALUTE: V3 = [-0.03, 0.64, 0.3];
const SALUTE_D: V3 = [0.02, 1, 0.06];
const salut = seq(
  [
    ...glideParts([
      [-1.2, [-0.12, 0.47, 0.88], [0.04, -0.14, 1]],
      [-0.8, SALUTE, SALUTE_D, FWD],
      [-0.55, [-0.03, 0.66, 0.3], SALUTE_D, FWD],
      [-0.25, H2_HIGH, H2_HIGH_D, [0, 0.6, 0.8]],
    ]).slice(0, 4),
    [-0.25, 1.1, arc(H2_HIGH, 0.04, [H2_HIGH_D, [-0.42, 0.9, 0.22], [-0.12, 0.16, 1], [0.4, -0.35, 0.85], [0.62, -0.7, 0.36]], NaN, { body: true, pivot1: [-0.04, 0.5, 0.6] })],
  ],
  0.06,
);
const salutHit = hitAt(salut, 2, 4);

// ------------------------------------------------------------------------------------ special and ability

// Coup de Grâce (ref 0.5 s the salute, 1.3-1.5 s the arm levelled at the opponent, 13.2 s the
// lunge): the salute, then the tell, held long: the blade drawn back level beside the ear, the
// weight deep on the back leg and the free hand stretched out aiming at them; then a lunge too
// fast to see
const coup = glide([
  [-1.0, GUARD_POS, GUARD_DIR],
  [-0.7, SALUTE, SALUTE_D, FWD],
  [-0.45, [-0.03, 0.66, 0.3], SALUTE_D, FWD],
  [-0.15, [-0.26, 0.64, 0.02], [0.04, 0.06, 1]],
  [0.85, [-0.08, 0.42, 0.94], [0.03, 0.04, 1]],
  [1.05, [-0.08, 0.41, 0.92], [0.03, 0.0, 1]],
]);

// Flèche (ref 1.5 s and 12.8 s the point in line, 9.0 s and 15.5 s the low running thrust): the
// tell is the arm shot straight out and the body tipped over the front foot, the back hand flung
// behind; then the legs run with the point leading
const fleche = glide([
  [-0.3, GUARD_POS, GUARD_DIR],
  [-0.1, [-0.12, 0.44, 0.82], [0.03, 0.1, 1]],
  [0.4, [-0.1, 0.4, 0.9], [0.03, 0.04, 1]],
  [1.2, [-0.1, 0.38, 0.88], [0.02, 0.0, 1]],
]);

// ------------------------------------------------------------------------------------ dash, backstep, air

// Balestra (ref 13.0-13.2 s the advance into the lunge): the tell is the hop itself, landing on both
// feet with the hand pulled back to the hip and the point up on them; then the deep lunge, and a
// moulinet (a wheel of the blade at the side, ref 8.1 s) on the way back
const balestra = seq(
  [
    ...glideParts([
      [-0.7, GUARD_POS, GUARD_DIR],
      [-0.45, [-0.14, 0.44, 0.36], GUARD_DIR],
      [-0.15, [-0.2, 0.3, 0.2], [0.03, 0.3, 1]],
      [0.85, [-0.1, 0.38, 0.9], [0.04, 0.04, 1]],
      [1.0, [-0.12, 0.4, 0.84], [0.05, 0.2, 1]],
    ]).slice(0, 5),
    [1.0, 1.75, arc([-0.22, 0.48, 0.7], 0, circle([0.04, 0.3, 1], [-0.75, -0.66, 0], 1, 0, 12), NaN, { body: true, pivot1: [-0.4, 0.42, 0.4] })],
  ],
  0.06,
);

// Passata (ref 9.0 s, the low dive): the tell is the body sunk onto the back leg with the hand
// low by the front knee and the point angled up at them; then the body dives beneath their line,
// the back leg flung out long and the back hand down to the floor, the point driven up into them
const passata = glide([
  [-0.6, GUARD_POS, GUARD_DIR],
  [-0.1, [-0.2, -0.08, 0.38], [0.03, 0.65, 1]],
  [0.85, [-0.08, 0.3, 0.98], [0.04, 0.42, 1]],
  [1.05, [-0.08, 0.3, 0.96], [0.04, 0.36, 1]],
]);

// Retreating Cut (ref 13.6 s and 8.6 s, giving ground with the arm out): the tell is a backhand
// chamber, the hand across at the left shoulder and the point flung back to the left; then the
// point flicks across their wrist from left to right as the rear foot steps back
const BL_TELL: V3 = [0.02, 0.56, 0.3];
const BL_TELL_D: V3 = [0.8, 0.22, -0.1];
const retreatCut = seq(
  [
    ...glideParts([
      [-0.5, GUARD_POS, GUARD_DIR],
      [0.0, BL_TELL, BL_TELL_D, [-0.35, 0, 0.94]],
    ]).slice(0, 2),
    [0.0, 1.07, arc(BL_TELL, 0.04, [BL_TELL_D, [0.5, 0.22, 0.84], [-0.04, 0.12, 1], [-0.55, 0.0, 0.85], [-0.8, -0.1, 0.45]], NaN, { body: true, pivot1: [-0.2, 0.42, 0.42] })],
  ],
  0.05,
);
const retreatHit = hitAt(retreatCut, 2, 2);

// Volte (ref 9.1-9.5 s, the turn): the tell is the body wound the other way with the arm thrown
// out long behind to the right, held; then the rear foot swings back and the body turns all the
// way round, the blade out at arm's length cutting through as they face front again
const BH_COIL_D: V3 = [-0.9, 0.2, -0.3];
const volte = seq(
  [
    ...glideParts([
      [-1.3, GUARD_POS, GUARD_DIR],
      [-1.05, [-0.5, 0.48, -0.06], BH_COIL_D],
      [-0.8, [-0.51, 0.46, -0.08], BH_COIL_D],
      [-0.3, [-0.5, 0.42, 0.18], [-0.75, 0.1, 0.6]],
    ]).slice(0, 4),
    [-0.3, 1.1, arc([-0.3, 0.44, 0.0], 0.48, [[-0.85, 0.1, 0.45], [-0.45, 0.08, 0.9], [0.05, 0.06, 1], [0.55, 0.02, 0.8], [0.8, -0.04, 0.3]], NaN, { body: true })],
  ],
  0.08,
);
const volteHit = hitAt(volte, 2, 4);

// Petal Lunge (ref 5.0-5.5 s, the thrust in the air): the tell is the knees tucked and the hand
// drawn back to the hip, the point on them; then a corkscrew thrust down its own line
const JL_TELL: V3 = [-0.26, 0.34, 0.04];
const petal = seq(
  [
    ...glideParts([
      [-0.5, GUARD_POS, GUARD_DIR],
      [0.0, JL_TELL, [0.03, 0.12, 1]],
    ]).slice(0, 2),
    [0.0, 0.85, line(JL_TELL, [-0.06, 0.3, 0.84], [0.03, 0.12, 1], [0.03, -0.06, 1], DOWN, NaN, NaN, { body: true, roll: 1 })],
    ...glideParts([
      [0.85, [-0.06, 0.3, 0.84], [0.03, -0.06, 1]],
      [1.05, [-0.06, 0.3, 0.82], [0.03, -0.08, 1]],
    ]).slice(1),
  ],
  0.04,
);

// Sky Piercer (ref 5.3-5.5 s, plunging down out of the somersault): the tell is the hand thrown up
// over the head with the point turned down at them, held at the top; then the whole body drops
// with the thrust and lands hard in a deep crouch
const JH_TELL_D: V3 = [0.0, -0.6, 0.8];
const sky = glide([
  [-1.0, GUARD_POS, GUARD_DIR],
  [-0.3, [-0.14, 1.0, 0.1], JH_TELL_D],
  [-0.15, [-0.14, 1.02, 0.08], JH_TELL_D],
  [0.85, [-0.1, 0.3, 0.6], [0.0, -0.42, 0.9]],
  [1.1, [-0.1, 0.28, 0.58], [0.0, -0.46, 0.88]],
]);

// ------------------------------------------------------------------------------------ entrance

// Entrance: the blade hanging loose by the right leg, raised in salute (hilt at the chin, blade
// straight up), snapped down to the side, flicked through a falling petal and levelled at them,
// then settled into the low en garde
const IN_LOW: V3 = [-0.38, 0.04, 0.12];
const IN_LOW_D: V3 = [-0.42, -0.58, 0.68];
const IN_SALUTE: V3 = [-0.04, 0.62, 0.3];
const IN_SIDE: V3 = [-0.36, 0.1, 0.2];
const IN_SIDE_D: V3 = [-0.42, -0.62, 0.66];
const IN_AIM: V3 = [-0.14, 0.62, 0.76];
const entranceBlade = seq(
  [
    [0.0, 0.34, line(IN_LOW, [-0.37, 0.05, 0.15], IN_LOW_D, [-0.38, -0.6, 0.7], [1, 0, 0], NaN, NaN, H)],
    [0.34, 0.46, line([-0.37, 0.05, 0.15], IN_SALUTE, [-0.38, -0.6, 0.7], [0.02, 1, 0.06], [0, 0, 1], NaN, NaN, H)],
    [0.46, 0.56, line(IN_SALUTE, [-0.04, 0.64, 0.3], [0.02, 1, 0.06], [0.02, 1, 0.08], [0, 0, 1], NaN, NaN, H)],
    [0.56, 0.61, line([-0.04, 0.64, 0.3], IN_SIDE, [0.02, 1, 0.08], IN_SIDE_D, [0, 0, 1], NaN, NaN, H)],
    [0.61, 0.7, line(IN_SIDE, [-0.36, 0.14, 0.22], IN_SIDE_D, [-0.5, -0.52, 0.66], [0, 0, 1], NaN, NaN, H)],
    [0.7, 0.78, arc([-0.12, 0.5, 0.42], 0, [[-0.75, 0.3, 0.55], [-0.25, 0.32, 0.95], [0.3, 0.26, 0.92], [0.62, 0.16, 0.72]], NaN, H)],
    [0.78, 0.84, line([-0.12, 0.5, 0.42], IN_AIM, [0.62, 0.16, 0.72], [0.02, 0.0, 1], DOWN, NaN, NaN, H)],
    [0.84, 0.92, line(IN_AIM, [-0.14, 0.62, 0.78], [0.02, 0.0, 1], [0.02, 0.0, 1], DOWN, NaN, NaN, H)],
    [0.92, 1.0, line([-0.14, 0.62, 0.78], GUARD_POS, [0.02, 0.0, 1], GUARD_DIR, DOWN, NaN, NaN, H)],
  ],
  0.025,
);

// ------------------------------------------------------------------------------------ style

/** The held tell: two keys at the same pose so the body stays put through the chamber. */
const hold = (s0: number, s1: number, b: BodyPose) => [K(s0, b), K(s1, b)];

const L0_TB = tb({ crouch: -0.28, lean: -0.1, step: 0.36, back: 0.34, twist: FT + 0.14, headPitch: 0.04 });
const L1_TB = tb({ crouch: -0.2, lean: 0.12, step: 0.52, back: 0.34, twist: FT + 0.04, headPitch: 0.08 });
const L2_TB = tb({ crouch: -0.14, lean: -0.08, step: 0.4, back: 0.36, twist: FT + 0.22, headPitch: -0.06 });
const H_TB = tb({ crouch: -0.3, lean: 0.1, step: 0.36, back: 0.4, twist: FT + 0.42, hipTwist: 0.5, headPitch: 0.04 });
const H1_TB = tb({ crouch: -0.12, lean: -0.08, step: 0.34, back: 0.3, twist: FT + 0.05, headPitch: -0.04 });
const H2_TB = tb({ crouch: -0.16, lean: -0.14, step: 0.34, back: 0.44, twist: FT + 0.22, hipTwist: 0.45, headPitch: -0.1 });
const SP_TB = tb({ crouch: -0.34, lean: -0.12, step: 0.42, back: 0.52, twist: FT + 0.25, headPitch: 0.04 });
const DL_TB = tb({ crouch: -0.36, lean: -0.04, step: 0.42, back: 0.36, width: 0.1, twist: FT + 0.1 });
const DH_TB = tb({ crouch: -0.38, lean: 0.0, step: 0.5, back: 0.42, twist: FT + 0.1, headPitch: 0.06 });
const BL_TB = tb({ crouch: -0.22, lean: 0.02, step: 0.36, back: 0.44, twist: FT + 0.16 });
const BH_TB = tb({ crouch: -0.26, lean: -0.08, step: 0.36, back: 0.44, twist: FT - 0.55, hipTwist: 0.15 });
const JL_TB = tb({ crouch: -0.02, lean: -0.14, step: 0.22, back: 0.2, twist: FT + 0.18, headPitch: 0.06 });
const JH_TB = tb({ crouch: 0.0, lean: -0.16, step: 0.24, back: 0.2, twist: FT - 0.2, headPitch: 0.28 });
const AB_TB = tb({ crouch: -0.26, lean: 0.4, step: 0.46, back: 0.5, twist: FT - 0.05 });

export const rapier: Style = {
  axis: 'y',
  offAxis: 'y',
  trail: { light: '#ffe8ee', heavy: '#ff6a8a', special: '#ff2a4a' },
  sparks: ['#ffffff', '#ffd6e0', '#ff8aa0'],
  guard: P(body, X(GUARD_POS, GUARD_DIR, DOWN, 'y', NaN, FT), null, UP_HAND),
  // parry (ref 4.7 s, 12.5 s, 13.5 s): the blade stood up in front, the weight sat back
  block: P(tb({ crouch: -0.25, lean: -0.05 }), X([-0.08, 0.52, 0.38], [0.28, 1, 0.2], [1, 0, 0.2], 'y', NaN, FT), null, UP_HAND),
  moves: {
    l0: mv({
      keys: [
        K(-0.5, body),
        ...hold(0.0, 0.1, L0_TB),
        K(0.5, tb({ crouch: -0.3, lean: 0.12, step: 0.66, back: 0.44, twist: FT + 0.12 })),
        K(0.85, tb({ crouch: -0.42, lean: 0.3, step: 0.98, back: 0.54, twist: FT + 0.16 })),
        K(1.05, tb({ crouch: -0.42, lean: 0.3, step: 0.98, back: 0.54, twist: FT + 0.16 })),
      ],
      main: lunge,
      free: track([[-0.5, UP_HAND], [0.0, HIGH_HAND], [0.45, MID_HAND], [0.85, LOW_HAND]]),
      impacts: [0.85],
      start: -0.5,
      chamber: 0.0,
      travel: 0.1,
      blendIn: 0.5,
      lead: 0.05,
      end: 1.05,
      fx: [fx(0.0, 'sparkle', 'tip', 0.35, '#ffffff'), fx(0.62, 'dust', 'feet', 0.5), fx(0.85, 'sparkle', 'tip', 0.6)],
    }),
    l1: mv({
      keys: [
        K(-0.5, body),
        ...hold(0.0, 0.1, L1_TB),
        K(0.85, tb({ crouch: -0.34, lean: 0.26, step: 0.82, back: 0.48, twist: FT + 0.15, headPitch: -0.05 })),
        K(1.05, tb({ crouch: -0.34, lean: 0.26, step: 0.82, back: 0.48, twist: FT + 0.15 })),
      ],
      main: disengage,
      free: track([[-0.5, UP_HAND], [0.0, HIGH_HAND], [0.85, MID_HAND]]),
      impacts: [0.85],
      start: -0.5,
      chamber: 0.0,
      travel: 0.1,
      blendIn: 0.5,
      lead: 0.05,
      end: 1.05,
      fx: [fx(0.6, 'dust', 'feet', 0.4), fx(0.85, 'sparkle', 'tip', 0.6)],
      trail: { life: 0.16 },
    }),
    l2: mv({
      keys: [
        K(-0.5, body),
        ...hold(0.0, 0.1, L2_TB),
        K(whipHit, tb({ twist: FT - 0.25, crouch: -0.28, lean: 0.22, step: 0.66, back: 0.42 })),
        K(1.1, tb({ twist: FT - 0.42, crouch: -0.3, lean: 0.24, step: 0.68, back: 0.42 })),
      ],
      main: whip,
      free: track([[-0.5, UP_HAND], [0.0, HIGH_HAND], [1.0, [0.45, 0.62, -0.22]]]),
      impacts: [whipHit],
      start: -0.5,
      chamber: 0.0,
      travel: 0.1,
      blendIn: 0.5,
      lead: 0.05,
      end: 1.1,
      fx: [fx(whipHit, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Pirouette: a long, held coil, then the turn and the lunge in one accelerating motion
    h: mv({
      keys: [
        K(-1.6, body, { spin: 0 }),
        ...hold(-1.3, -1.05, H_TB),
        K(-0.75, tb({ crouch: -0.04, lean: -0.05, step: 0.14, back: 0.12, width: 0.1, twist: FT - 0.1 }), { spin: -0.5 }),
        K(-0.2, tb({ crouch: -0.14, lean: 0.05, step: 0.32, back: 0.32, twist: FT }), { spin: -1 }),
        K(0.4, tb({ crouch: -0.28, lean: 0.18, step: 0.66, back: 0.44, twist: FT + 0.08 })),
        K(0.85, tb({ crouch: -0.46, lean: 0.38, step: 1.06, back: 0.6, twist: FT + 0.2 })),
        K(1.05, tb({ crouch: -0.46, lean: 0.38, step: 1.06, back: 0.6, twist: FT + 0.2 })),
      ],
      main: pirouette,
      // the back arm thrown forward across the chest for the coil, out wide in the turn
      free: track([[-1.6, UP_HAND], [-1.3, [0.05, 0.5, 0.42]], [-1.05, [0.05, 0.5, 0.42]], [-0.6, [0.58, 0.52, 0.02]], [-0.25, UP_HAND], [0.85, LOW_HAND]]),
      impacts: [0.85],
      start: -1.6,
      chamber: -0.75,
      flow: 2.0,
      blendIn: 0.3,
      lead: 0.05,
      end: 1.05,
      ghosts: [-0.95, -0.2],
      fx: [fx(-1.3, 'sparkle', 'tip', 0.5), fx(-0.9, 'whirl', 'root', 0.7, '#ffd0d8'), fx(0.6, 'dust', 'feet', 0.7), fx(0.85, 'flashline', 'tip', 1.2), fx(0.85, 'sparkle', 'tip', 1)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    h1: mv({
      keys: [
        K(-1.0, tb({ crouch: -0.44, lean: 0.36, step: 1.0, back: 0.58, twist: FT + 0.18 })),
        K(-0.55, tb({ crouch: -0.2, lean: 0.06, step: 0.46, back: 0.26, twist: FT })),
        ...hold(-0.2, -0.08, H1_TB),
        K(0.4, tb({ crouch: -0.32, lean: 0.22, step: 0.72, back: 0.46, twist: FT + 0.1 })),
        K(0.85, tb({ crouch: -0.48, lean: 0.4, step: 1.04, back: 0.6, twist: FT + 0.26, side: -0.08 })),
        K(1.05, tb({ crouch: -0.48, lean: 0.4, step: 1.04, back: 0.6, twist: FT + 0.26, side: -0.08 })),
      ],
      main: prise,
      free: track([[-1.0, LOW_HAND], [-0.5, UP_HAND], [-0.2, HIGH_HAND], [0.4, MID_HAND], [0.85, LOW_HAND]]),
      impacts: [0.85],
      start: -1.0,
      chamber: -0.2,
      travel: 0.1,
      blendIn: 0.35,
      lead: 0.05,
      end: 1.05,
      fx: [fx(-0.2, 'sparkle', 'tip', 0.6, '#ffffff'), fx(0.3, 'sparkle', 'tip', 0.6), fx(0.6, 'dust', 'feet', 0.7), fx(0.85, 'flashline', 'tip', 1.1), fx(0.85, 'sparkle', 'tip', 0.9)],
      trail: { life: 0.22, glow: 0.5 },
    }),
    h2: mv({
      keys: [
        K(-1.2, tb({ crouch: -0.46, lean: 0.38, step: 1.02, back: 0.6, twist: FT + 0.24 })),
        K(-0.8, tb({ crouch: -0.06, lean: -0.08, step: 0.24, back: 0.2, twist: FT + 0.05, headPitch: -0.12 })),
        K(-0.55, tb({ crouch: -0.06, lean: -0.08, step: 0.24, back: 0.2, twist: FT + 0.05, headPitch: -0.1 })),
        ...hold(-0.25, -0.12, H2_TB),
        K(salutHit, tb({ front: 'L', crouch: -0.34, lean: 0.26, step: 0.6, back: 0.5, twist: -0.05, hipTwist: -0.15, width: 0.1 })),
        K(1.1, tb({ front: 'L', crouch: -0.32, lean: 0.14, step: 0.58, back: 0.5, twist: -0.3, hipTwist: -0.2, width: 0.1, headPitch: -0.08 })),
      ],
      main: salut,
      free: track([[-1.2, LOW_HAND], [-0.8, [0.2, 0.05, -0.28]], [-0.55, [0.2, 0.05, -0.28]], [-0.25, [0.1, 0.62, 0.36]], [salutHit, [0.6, 0.4, -0.2]], [1.1, [0.55, 0.62, -0.25]]]),
      impacts: [salutHit],
      start: -1.2,
      chamber: -0.25,
      travel: 0.1,
      blendIn: 0.3,
      lead: 0.05,
      end: 1.1,
      settle: 0.5,
      fx: [fx(-0.7, 'sparkle', 'tip', 0.9, '#ffffff'), fx(-0.25, 'sparkle', 'tip', 0.7), fx(salutHit - 0.05, 'stomp', 'feet', 0.9), fx(salutHit, 'flashline', 'tip', 1.3), fx(salutHit, 'sparkle', 'tip', 1.1)],
      trail: { life: 0.26, glow: 0.7 },
    }),
    dl: mv({
      keys: [
        K(-0.7, tb({ crouch: -0.24, lean: 0.14, step: 0.4 }), { hop: 0 }),
        K(-0.45, tb({ crouch: -0.06, step: 0.4, back: 0.3 }), { hop: 0.22 }),
        K(-0.15, DL_TB, { hop: 0 }),
        K(0.0, DL_TB),
        K(0.4, tb({ crouch: -0.28, lean: 0.14, step: 0.62, back: 0.44, twist: FT + 0.05 })),
        K(0.85, tb({ crouch: -0.46, lean: 0.38, step: 1.04, back: 0.58, twist: FT + 0.18 })),
        K(1.1, tb({ crouch: -0.42, lean: 0.3, step: 0.96, back: 0.54, twist: FT + 0.15 })),
        K(1.5, tb({ crouch: -0.26, lean: 0.08, step: 0.52, back: 0.4, twist: FT })),
        K(1.85, body),
      ],
      main: balestra,
      free: track([[-0.7, UP_HAND], [-0.15, HIGH_HAND], [0.3, UP_HAND], [0.85, LOW_HAND], [1.2, LOW_HAND], [1.7, UP_HAND]]),
      impacts: [0.85],
      start: -0.7,
      chamber: -0.15,
      travel: 0.05,
      blendIn: 0.35,
      lead: 0.05,
      end: 1.0,
      rest: 1.75,
      settle: 0.6,
      fx: [fx(-0.17, 'dust', 'feet', 0.9), fx(0.85, 'flashline', 'tip', 1.0), fx(0.85, 'sparkle', 'tip', 0.8)],
      trail: { life: 0.18, glow: 0.3 },
    }),
    dh: mv({
      keys: [
        K(-0.6, tb({ crouch: -0.28, lean: 0.3, step: 0.44, back: 0.4 })),
        ...hold(-0.1, 0.02, DH_TB),
        K(0.85, tb({ crouch: -0.55, lean: 0.7, step: 0.74, back: 0.98, twist: FT + 0.1, headPitch: -0.4, width: 0.1 })),
        K(1.05, tb({ crouch: -0.55, lean: 0.68, step: 0.74, back: 0.98, twist: FT + 0.1, headPitch: -0.38, width: 0.1 })),
      ],
      main: passata,
      free: track([[-0.6, UP_HAND], [-0.1, HIGH_HAND], [0.3, MID_HAND], [0.85, [0.0, -0.1, 0.5]]]),
      impacts: [0.85],
      start: -0.6,
      chamber: -0.1,
      travel: 0.1,
      blendIn: 0.4,
      lead: 0.05,
      end: 1.05,
      ghosts: [0.0, 0.95],
      fx: [fx(-0.1, 'dust', 'feet', 0.7), fx(0.82, 'dust', 'feet', 0.9), fx(0.85, 'flashline', 'tip', 1.3), fx(0.85, 'sparkle', 'tip', 1)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    bl: mv({
      keys: [
        K(-0.5, body),
        ...hold(0.0, 0.1, BL_TB),
        K(retreatHit, tb({ crouch: -0.28, lean: -0.08, twist: FT - 0.1, step: 0.36, back: 0.54 })),
        K(1.07, tb({ crouch: -0.3, lean: -0.12, twist: FT - 0.18, step: 0.3, back: 0.5 })),
      ],
      main: retreatCut,
      free: track([[-0.5, UP_HAND], [0.0, HIGH_HAND], [0.6, [0.42, 0.86, -0.2]]]),
      impacts: [retreatHit],
      start: -0.5,
      chamber: 0.0,
      travel: 0.1,
      blendIn: 0.5,
      lead: 0.05,
      end: 1.07,
      fx: [fx(0.1, 'dust', 'feet', 0.5), fx(retreatHit, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.16, glow: 0.3 },
    }),
    // Volte: a long, held coil, then the turn and the cut in one accelerating motion
    bh: mv({
      keys: [
        K(-1.3, body, { spin: 0 }),
        ...hold(-1.05, -0.8, BH_TB),
        K(-0.3, tb({ crouch: -0.24, lean: -0.08, step: 0.3, back: 0.5, width: 0.1 }), { spin: 0.7 }),
        K(volteHit, tb({ crouch: -0.3, lean: -0.1, step: 0.34, back: 0.52, twist: FT - 0.1 }), { spin: 1.0 }),
        K(1.1, tb({ crouch: -0.3, lean: -0.08, step: 0.34, back: 0.5, twist: FT - 0.3 }), { spin: 1.04 }),
      ],
      main: volte,
      free: track([[-1.3, UP_HAND], [-1.05, [0.2, 0.55, 0.45]], [-0.8, [0.2, 0.55, 0.45]], [-0.3, [0.55, 0.55, -0.1]], [volteHit, UP_HAND]]),
      impacts: [volteHit],
      start: -1.3,
      chamber: -0.5,
      flow: 2.0,
      blendIn: 0.3,
      lead: 0.05,
      end: 1.1,
      ghosts: [-0.6, volteHit],
      fx: [fx(-1.05, 'dust', 'feet', 0.5), fx(-0.6, 'whirl', 'root', 0.8, '#ffd0d8'), fx(-0.2, 'dust', 'feet', 0.7), fx(volteHit, 'sparkle', 'tip', 1)],
      trail: { life: 0.24, glow: 0.6 },
    }),
    jl: mv({
      keys: [
        K(-0.5, tb({ crouch: -0.08, lean: 0.12, step: 0.3, back: 0.28 }), { hop: 0.04 }),
        ...hold(0.0, 0.08, JL_TB),
        K(0.85, tb({ crouch: -0.14, lean: 0.3, step: 0.42, back: 0.34, twist: FT + 0.1 }), { hop: 0 }),
        K(1.05, tb({ crouch: -0.14, lean: 0.3, step: 0.42, back: 0.34, twist: FT + 0.1 })),
      ],
      main: petal,
      free: track([[-0.5, UP_HAND], [0.0, HIGH_HAND], [0.85, MID_HAND]]),
      impacts: [0.85],
      start: -0.5,
      chamber: 0.0,
      travel: 0.05,
      blendIn: 0.45,
      lead: 0.05,
      end: 1.05,
      fx: [fx(0.4, 'spiral', 'tip', 0.6, '#ffd0d8'), fx(0.85, 'petals', 'tip', 0.8, '#ffb8cc'), fx(0.85, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.2, glow: 0.4 },
    }),
    jh: mv({
      keys: [
        K(-1.0, tb({ crouch: -0.12 }), { hop: 0 }),
        K(-0.3, JH_TB, { hop: 0.26 }),
        K(-0.12, JH_TB, { hop: 0.26 }),
        K(0.85, tb({ crouch: -0.5, lean: 0.42, step: 0.56, back: 0.46, width: 0.16, twist: FT + 0.05, headPitch: 0.15 }), { hop: 0 }),
        K(1.1, tb({ crouch: -0.5, lean: 0.4, step: 0.56, back: 0.46, width: 0.16, twist: FT + 0.05 })),
      ],
      main: sky,
      free: track([[-1.0, UP_HAND], [-0.3, [0.45, 0.62, 0.1]], [-0.12, [0.45, 0.62, 0.1]], [0.85, [0.55, 0.2, -0.2]]]),
      impacts: [0.85],
      start: -1.0,
      chamber: -0.3,
      travel: 0.1,
      blendIn: 0.35,
      lead: 0.05,
      end: 1.1,
      fx: [fx(-0.3, 'sparkle', 'tip', 0.6), fx(0.85, 'shockwave', 'tip', 0.9, '#ffd0d8'), fx(0.86, 'stomp', 'feet', 1.0), fx(0.85, 'flashline', 'tip', 1.0)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    sp: mv({
      keys: [
        K(-1.0, body),
        K(-0.7, tb({ crouch: -0.06, lean: -0.08, twist: FT - 0.15, step: 0.22, back: 0.18, headPitch: -0.12 })),
        K(-0.45, tb({ crouch: -0.06, lean: -0.08, twist: FT - 0.15, step: 0.22, back: 0.18, headPitch: -0.1 })),
        ...hold(-0.15, -0.02, SP_TB),
        K(0.4, tb({ crouch: -0.38, lean: 0.3, step: 0.92, back: 0.54, twist: FT + 0.12 })),
        K(0.85, tb({ crouch: -0.5, lean: 0.44, step: 1.15, back: 0.64, twist: FT + 0.2 })),
        K(1.05, tb({ crouch: -0.5, lean: 0.44, step: 1.15, back: 0.64, twist: FT + 0.2 })),
      ],
      main: coup,
      // behind the back for the salute, then stretched out along the line, aiming
      free: track([[-1.0, UP_HAND], [-0.7, [0.12, 0.1, -0.3]], [-0.45, [0.12, 0.1, -0.3]], [-0.15, [-0.08, 0.56, 0.34]], [-0.02, [-0.08, 0.56, 0.34]], [0.35, UP_HAND], [0.85, LOW_HAND]]),
      impacts: [0.85],
      start: -1.0,
      chamber: -0.15,
      travel: 0.1,
      blendIn: 0.3,
      lead: 0.05,
      end: 1.05,
      ghosts: [0.0, 0.95],
      fx: [
        fx(-0.6, 'sparkle', 'tip', 0.9, '#ffffff'),
        fx(-0.15, 'sparkle', 'tip', 1.0, '#ff3a5a'),
        fx(-0.02, 'dust', 'feet', 1.2),
        fx(0.85, 'flashline', 'tip', 1.6, '#ff3a5a'),
        fx(0.85, 'sparkle', 'tip', 1.2, '#ff8aa0'),
      ],
      trail: { life: 0.24, glow: 0.9 },
    }),
    ab: mv({
      keys: [
        K(-0.3, tb({ crouch: -0.24, lean: 0.12, step: 0.38, back: 0.42 })),
        ...hold(-0.1, 0.0, AB_TB),
        K(0.25, tb({ crouch: -0.16, lean: 0.6, twist: FT - 0.25, front: 'L', step: 0.45, back: 0.55, hipTwist: 0.1 }), { hop: 0.14 }),
        K(0.55, tb({ crouch: -0.22, lean: 0.55, twist: FT - 0.2, front: 'R', step: 0.55, back: 0.5 }), { hop: 0.04 }),
        K(0.85, tb({ crouch: -0.2, lean: 0.52, twist: FT - 0.25, front: 'L', step: 0.5, back: 0.5, hipTwist: 0.1 }), { hop: 0.1 }),
        K(1.2, tb({ crouch: -0.24, lean: 0.25, twist: FT, front: 'R', step: 0.45, back: 0.45 }), { hop: 0 }),
      ],
      main: fleche,
      free: track([[-0.3, UP_HAND], [-0.1, [0.45, 0.3, -0.4]], [0.3, [0.45, 0.3, -0.35]]]),
      impacts: [0.4],
      start: -0.3,
      chamber: -0.1,
      travel: 0.05,
      blendIn: 0.5,
      lead: 0.05,
      end: 1.2,
      rest: 1.2,
      ghosts: [0.0, 1.1],
      fx: [fx(-0.1, 'sparkle', 'tip', 0.6, '#ffffff'), fx(0.0, 'dust', 'feet', 1.1), fx(0.4, 'sparkle', 'tip', 1), fx(1.15, 'dust', 'feet', 0.8)],
      trail: { life: 0.22, glow: 0.6 },
    }),
  },
  // Entrance: a loose swagger and the cape flicked back over the shoulder, a salute snapped down to
  // the side, then a flick through a falling petal and the point levelled at their eyes, settling
  // into the low en garde
  entrance: mv({
    keys: [
      K(0.0, tb({ twist: 0.3, hipTwist: 0.15, crouch: -0.04, lean: -0.07, step: 0.24, back: 0.18, width: 0.1, side: 0.08, headPitch: -0.08 })),
      K(0.1, tb({ twist: 0.32, hipTwist: 0.15, crouch: -0.05, lean: -0.05, step: 0.3, back: 0.16, width: 0.1, side: -0.04, headPitch: -0.08 })),
      K(0.2, tb({ twist: 0.12, hipTwist: 0.1, crouch: -0.03, lean: -0.08, step: 0.28, back: 0.18, width: 0.1, side: 0.06, headPitch: -0.16 })),
      K(0.32, tb({ twist: 0.3, hipTwist: 0.15, crouch: -0.04, lean: -0.07, step: 0.26, back: 0.18, width: 0.1, side: 0.07, headPitch: -0.06 })),
      K(0.42, tb({ twist: 0.35, hipTwist: 0.2, crouch: -0.02, lean: -0.02, step: 0.14, back: 0.12, width: 0.08, headPitch: 0 })),
      K(0.55, tb({ twist: 0.35, hipTwist: 0.2, crouch: -0.02, lean: -0.02, step: 0.14, back: 0.12, width: 0.08, headPitch: -0.02 })),
      K(0.6, tb({ twist: 0.4, hipTwist: 0.2, crouch: -0.04, lean: 0.05, step: 0.14, back: 0.12, width: 0.08, headPitch: 0.14 })),
      K(0.69, tb({ twist: 0.45, hipTwist: 0.25, crouch: -0.06, lean: 0.0, step: 0.2, back: 0.16, width: 0.08, headPitch: -0.04 })),
      K(0.76, tb({ twist: FT - 0.1, crouch: -0.14, lean: 0.06, step: 0.34, back: 0.28 })),
      K(0.84, tb({ twist: FT + 0.1, crouch: -0.16, lean: 0.0, step: 0.42, back: 0.34, headPitch: -0.06 })),
      K(0.92, tb({ twist: FT + 0.1, crouch: -0.16, lean: 0.0, step: 0.42, back: 0.34, headPitch: -0.06 })),
      K(1.0, body),
    ],
    main: entranceBlade,
    // the back hand on the hip, swept up and over the left shoulder to throw the cape back, behind
    // the back for the salute, then raised for balance as the point comes on line
    free: track([
      [0.0, [0.3, 0.02, 0.06]],
      [0.1, [0.3, 0.02, 0.06]],
      [0.16, [0.22, 0.52, 0.22]],
      [0.21, [0.4, 0.78, -0.18]],
      [0.26, [0.44, 0.5, -0.3]],
      [0.32, [0.3, 0.02, 0.04]],
      [0.4, [0.16, 0.06, -0.28]],
      [0.68, [0.16, 0.06, -0.28]],
      [0.8, UP_HAND],
    ]),
    lead: 0,
    fx: [
      fx(0.0, 'petals', 'root', 1.4),
      fx(0.08, 'dust', 'feet', 0.35),
      fx(0.21, 'petals', 'root', 1.0),
      fx(0.47, 'sparkle', 'tip', 0.9, '#ffffff'),
      fx(0.6, 'sparkle', 'tip', 0.8),
      fx(0.7, 'petals', 'front', 0.5),
      fx(0.75, 'flashline', 'tip', 1.0),
      fx(0.75, 'petals', 'tip', 0.7),
      fx(0.84, 'sparkle', 'tip', 0.6, '#ffffff'),
    ],
  }),
};
