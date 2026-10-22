/**
 * Duelist, rapier. Fenced after the reference duel, traced joint by joint: a wide, sitting en garde,
 * side-on with the right foot and shoulder toward the opponent, both knees bent out, the torso
 * upright, the sword hand in front of the front knee with the point raised and the back arm bent
 * behind at chest height. Every thrust is a true lunge: the arm straightens first, then the front
 * foot kicks out and the back leg drives itself straight, the torso pitching over the front knee and
 * the back arm flung out behind. The cuts are a rising cut from under the right hip, a coupé whipped
 * over from the blade laid back on the shoulder, a level head cut and a grand cut with a passing
 * step; the moulinet wheels the blade round beside the body into a lunge; the flèche dives with the
 * point leading; the cartwheel gives ground with the point kept on them; the air attacks sweep, or
 * somersault and plunge.
 *
 * Every attack has a tell: a distinct chamber reached early in the windup and held there (the
 * animator holds it and pushes it further), so the opponent can read which attack is coming:
 *   l0  the hand drawn back beside the cheek, the elbow bent, the point still on them, weight back
 *   l1  the blade dropped low outside the right hip, the point down, the body wound to the right
 *   l2  the hand by the right temple, the blade laid back over the shoulder
 *   h   tall on straight legs, the blade stood straight up beside the head
 *   h1  the hand carried back to the right at head height, the blade level, the body wound right
 *   h2  the salute, then the hand high over the head and the blade laid back behind it
 *   sp  the salute, then the blade drawn back level by the ear and the free hand aiming at them
 *   dl  the balestra hop landing on both feet, the hand pulled back to the hip
 *   dh  the arm shot straight out and the torso tipped over the front foot
 *   bl  a backhand chamber: the hand across at the left shoulder, the point flung back to the left
 *   bh  sunk and leaning to the left, the free hand reaching for the floor
 *   jl  in the air, the hand pulled to the right hip with the point out to the right
 *   jh  the somersault itself, coming out of it with the hand high and the point turned down
 *   ab  the point in line: the arm shot straight out and the body tipped over the front foot
 * Each chamber keeps the blade within about 110 degrees of the guard's: the animator pushes the
 * chamber further from guard by extrapolating the rotation, and a bigger turn would flip over.
 *
 * Leg geometry (reference body: hips 0.92 m up, legs 0.85 m): with the hips dropped by `crouch`,
 * a foot `d` = hypot(step, 0.85 + crouch) from the hip has its knee straight at d = 0.85. The
 * stances below keep every planted foot within reach, and the lunges put the back foot just short
 * of that, so the back leg is straight and the front knee bent over the front foot, as traced.
 *
 * Weapon paths are authored relative to the hips (`body: true`): +z is the opponent whatever way
 * the torso is turned or pitched. Free-hand tracks are in torso space.
 */
import { B, K, P, Style, X, fx, line, mv, seq, track } from '../author';
import type { BodyPose, Motion, V3 } from '../author';

const FT = 0.75; // the chest turned left: the right shoulder faces the opponent
// en garde (ref 4.0 s, 7.0 s): sitting on both knees bent out (traced ~125 degrees), the feet a
// leg's length apart, the torso upright
const body = B({ front: 'R', step: 0.44, back: 0.42, width: 0.08, crouch: -0.24, lean: 0.03, twist: FT, hipTwist: 0.35 });
const tb = (o: Partial<BodyPose>) => B({ ...body, ...o });

// the lunge (ref 6.58 s, 7.83 s): feet ~1.6 leg lengths apart, the hips half way down, the back leg
// straight, the front knee ~145 degrees over the front foot, the torso pitched ~25 degrees (x1.5)
const LUNGE = tb({ crouch: -0.38, step: 0.66, back: 0.7, lean: 0.42, twist: FT + 0.12, headPitch: -0.05 });
// the deepest lunge (the heavies and the special): lower, the front knee more bent
const DEEP = tb({ crouch: -0.44, step: 0.6, back: 0.72, lean: 0.5, twist: FT + 0.16, headPitch: -0.08 });
// tall on nearly straight legs, the feet close (ref 6.17 s, 8.5 s): the high chambers
const TALL = tb({ crouch: -0.06, step: 0.24, back: 0.22, lean: -0.06, headPitch: -0.05 });

// the sword hand in guard (hips space): in front of the front knee, the elbow bent ~110 degrees,
// the point raised ~35 degrees
const GUARD_POS: V3 = [-0.14, 0.32, 0.64];
const GUARD_DIR: V3 = [0.04, 0.7, 1];
// the arm straight out at shoulder height, the blade level: where every thrust lands
const LUNGE_HIT: V3 = [-0.07, 0.44, 0.94];
const LINE: V3 = [0.02, 0.03, 1];
// parry (ref 6.75 s, 4.42 s): the blade stood up in front of the face
const PARRY_POS: V3 = [-0.1, 0.56, 0.48];
const PARRY_DIR: V3 = [0.2, 1, 0.25];

// the back hand (torso space): bent behind at chest height in guard (ref 4.0 s, 7.0 s), flung out
// straight behind in a lunge (ref 6.58 s), raised for balance under a high chamber. The cape hangs
// down the back from the left shoulder, so "behind" is taken out to the side of it (straight back in
// body space is +x/-z in torso space, which runs the forearm into the cape): the arm stays outside it
const F_GUARD: V3 = [0.6, 0.4, -0.06];
const F_BACK: V3 = [0.84, 0.44, -0.1];
const F_HIGH: V3 = [0.56, 0.76, -0.12];
const F_AIM: V3 = [-0.08, 0.56, 0.34];
const DOWN: V3 = [0, -1, 0];
const UP: V3 = [0, 1, 0];
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

/** The held tell: two keys at the same pose so the body stays put through the chamber. */
const hold = (s0: number, s1: number, b: BodyPose) => [K(s0, b), K(s1, b)];

// ------------------------------------------------------------------------------------ lights

// Lunge (ref 4.17-4.25 s, the arm straightened before the legs move; 6.42-6.58 s, the lunge): the
// tell is the hand drawn back beside the cheek, the elbow bent, the point still on them and the
// weight rocked back; then the arm shoots straight (done by s 0.5, the feet still in guard), and
// only then the front foot kicks out and the back leg drives straight, landing with the touch
const L0_TELL: V3 = [-0.22, 0.52, 0.26];
const lunge = glide([
  [-0.5, GUARD_POS, GUARD_DIR],
  [0.0, L0_TELL, [0.03, 0.16, 1]],
  [0.5, [-0.09, 0.46, 0.82], [0.02, 0.06, 1]],
  [0.85, LUNGE_HIT, LINE],
  [1.05, [-0.07, 0.43, 0.92], [0.02, 0.0, 1]],
]);
const L0_TB = tb({ crouch: -0.28, lean: -0.08, step: 0.4, back: 0.44, twist: FT + 0.1, headPitch: 0.04 });

// Rising Cut (ref 7.0-7.25 s and 8.08 s, the cut rising out of the wide stance): the tell is the
// blade dropped low outside the right hip, the point down, the body wound to the right; the hips
// turn first, then the hand rises across in front and the blade sweeps up through them, the front
// foot stepping in, finishing high to the left
const L1_TELL: V3 = [-0.34, 0.26, 0.42];
const rising = glide([
  [-0.5, GUARD_POS, GUARD_DIR],
  [0.0, L1_TELL, [-0.62, -0.3, 0.72], FWD],
  [0.45, [-0.22, 0.3, 0.66], [-0.32, -0.08, 1], UP],
  [0.85, [-0.07, 0.48, 0.86], [0.08, 0.22, 1], UP],
  [1.1, [0.08, 0.7, 0.6], [0.55, 0.75, 0.4], UP],
]);
const L1_TB = tb({ crouch: -0.3, lean: 0.08, step: 0.44, back: 0.46, twist: FT + 0.25, hipTwist: 0.45, side: 0.06 });

// Coupé (ref 6.08-6.33 s and 8.25 s, the blade laid back, then cut down): the tell is the hand by
// the right temple with the blade laid back over the shoulder, the weight back on straight-ish legs;
// the hand drives forward first with the blade still back (6.25 s), then the wrist whips it over and
// down across them from high right to low left as the front foot steps in
const L2_TELL: V3 = [-0.24, 0.72, 0.28];
const coupe = glide([
  [-0.5, GUARD_POS, GUARD_DIR],
  [0.0, L2_TELL, [-0.25, 0.8, -0.55], FWD],
  [0.4, [-0.16, 0.66, 0.6], [-0.15, 0.9, 0.3], FWD],
  [0.85, [-0.08, 0.5, 0.86], [0.18, 0.05, 1]],
  [1.1, [0.08, 0.28, 0.66], [0.6, -0.6, 0.5]],
]);
const L2_TB = tb({ crouch: -0.16, lean: -0.1, step: 0.38, back: 0.4, twist: FT + 0.2, headPitch: -0.04 });

// ------------------------------------------------------------------------------------ heavies

// Moulinet (ref 8.25-8.92 s, the blade raised, wheeled down past the back and in low, then the
// flèche at 9.0 s): the tell is the fencer drawn up tall with the blade stood straight up beside
// the head, held; then the wrist wheels it back and down beside the right side and up in front,
// the arm straightening on the way, and the deep lunge drives in after it
const H_TELL: V3 = [-0.2, 0.74, 0.24];
const moulinet = glide(
  [
    [-1.3, GUARD_POS, GUARD_DIR],
    [-0.6, H_TELL, [0.04, 1, 0.12], FWD],
    [-0.3, [-0.26, 0.62, 0.14], [-0.1, 0.6, -0.8], FWD],
    [-0.05, [-0.3, 0.4, 0.22], [-0.15, -0.55, -0.8], FWD],
    [0.2, [-0.24, 0.32, 0.4], [-0.1, -0.9, 0.4], FWD],
    [0.6, [-0.09, 0.44, 0.84], [0.02, 0.08, 1]],
    [0.85, [-0.06, 0.42, 0.96], LINE],
    [1.05, [-0.06, 0.41, 0.94], [0.02, 0.0, 1]],
  ],
  0.05,
);
const H_TB = tb({ ...TALL, twist: FT + 0.1 });

// Tranchant (ref 7.58 s and 13.33-13.42 s, the level cut at head height): out of the lunge, the
// tell is the hand carried back to the right at head height with the blade level and the body
// wound to the right, the weight on the back leg; then the hips turn, the shoulders after them, and
// the straight arm sweeps the blade level across their head as the front foot steps in
const H1_TELL: V3 = [-0.42, 0.66, 0.2];
const tranchant = glide(
  [
    [-1.0, [-0.06, 0.41, 0.94], [0.02, 0.0, 1]],
    [-0.55, [-0.22, 0.6, 0.5], [-0.4, 0.35, 0.85]],
    [-0.2, H1_TELL, [-0.85, 0.25, 0.2]],
    [0.4, [-0.3, 0.62, 0.62], [-0.55, 0.15, 0.85]],
    [0.85, [-0.08, 0.6, 0.86], [0.1, 0.08, 1]],
    [1.1, [0.2, 0.58, 0.62], [0.85, 0.05, 0.35]],
  ],
  0.05,
);
const H1_TB = tb({ crouch: -0.26, lean: -0.05, step: 0.4, back: 0.5, twist: FT + 0.35, hipTwist: 0.45 });

// Grand Coupé (ref 1.83 s the salute, 6.08-6.17 s the blade laid back high, 6.25-6.42 s the cut down
// into the wide crouch): the hilt to the chin, then the tell, the hand high over the head with the
// blade laid back behind it, held; then the hand drives up and forward first and the
// whole body cuts from high right down through them on a long advancing lunge, sinking into the
// wide sitting crouch
const SALUTE: V3 = [-0.03, 0.64, 0.3];
const SALUTE_D: V3 = [0.02, 1, 0.06];
const H2_HIGH: V3 = [-0.2, 1.0, 0.1];
const grand = glide(
  [
    [-1.2, [0.2, 0.58, 0.62], [0.85, 0.05, 0.35]],
    [-0.8, SALUTE, SALUTE_D, FWD],
    [-0.55, [-0.03, 0.66, 0.3], SALUTE_D, FWD],
    [-0.25, H2_HIGH, [-0.2, 0.7, -0.68], FWD],
    [0.25, [-0.18, 0.86, 0.5], [-0.2, 0.95, 0.25], FWD],
    [0.7, [-0.06, 0.5, 0.88], [0.12, -0.24, 1]],
    [1.1, [0.12, 0.12, 0.6], [0.55, -0.75, 0.35]],
  ],
  0.06,
);
const H2_HIT = 0.7;
const H2_TB = tb({ crouch: -0.14, lean: -0.16, step: 0.3, back: 0.46, twist: FT + 0.25, hipTwist: 0.45, headPitch: -0.1 });

// ------------------------------------------------------------------------------------ special and ability

// Coup de Grâce (ref 1.33-1.5 s the arms levelled at the opponent, 1.83 s the salute, 7.83 s the
// deepest lunge): the salute, then the tell, held long: the blade drawn back level beside the ear,
// the weight sat on the back leg and the free hand stretched out aiming at them; then the arm
// shoots out first and the deepest lunge follows it, too fast to see
const SP_TELL: V3 = [-0.26, 0.62, 0.06];
const coup = glide([
  [-1.0, GUARD_POS, GUARD_DIR],
  [-0.7, SALUTE, SALUTE_D, FWD],
  [-0.45, [-0.03, 0.66, 0.3], SALUTE_D, FWD],
  [-0.15, SP_TELL, [0.04, 0.06, 1]],
  [0.45, [-0.08, 0.46, 0.84], [0.02, 0.05, 1]],
  [0.85, [-0.05, 0.42, 0.98], LINE],
  [1.05, [-0.05, 0.41, 0.96], [0.02, 0.0, 1]],
]);
const SP_TB = tb({ crouch: -0.3, lean: -0.12, step: 0.34, back: 0.5, twist: FT + 0.25, headPitch: 0.04 });
const SP_HIT = tb({ crouch: -0.46, lean: 0.52, step: 0.62, back: 0.72, twist: FT + 0.2, headPitch: -0.1 });

// Flèche (ref 1.5 s and 12.8 s the point in line, 9.0 s and 15.5 s the low running thrust): the
// tell is the arm shot straight out and the body tipped over the front foot, the back hand flung
// behind; then the legs run with the point leading
const fleche = glide([
  [-0.3, GUARD_POS, GUARD_DIR],
  [-0.1, [-0.1, 0.44, 0.84], [0.03, 0.1, 1]],
  [0.4, [-0.08, 0.4, 0.92], [0.03, 0.04, 1]],
  [1.2, [-0.08, 0.38, 0.9], [0.02, 0.0, 1]],
]);
const AB_TB = tb({ crouch: -0.26, lean: 0.4, step: 0.46, back: 0.5, twist: FT - 0.05 });

// ------------------------------------------------------------------------------------ dash, backstep, air

// Balestra (ref 13.0-13.2 s, the advance into the lunge): the tell is the hop itself, landing on both
// feet with the hand pulled back to the hip and the point up on them; then the arm straightens and
// the lunge follows it, and the recovery comes up into the parry, the blade stood up (ref 6.75 s)
const balestra = glide([
  [-0.7, GUARD_POS, GUARD_DIR],
  [-0.45, [-0.16, 0.42, 0.5], GUARD_DIR],
  [-0.15, [-0.22, 0.28, 0.24], [0.03, 0.3, 1]],
  [0.45, [-0.09, 0.44, 0.82], [0.02, 0.08, 1]],
  [0.85, LUNGE_HIT, LINE],
  [1.05, [-0.07, 0.43, 0.9], [0.02, 0.02, 1]],
  [1.5, PARRY_POS, PARRY_DIR, FWD],
  [1.75, [-0.11, 0.54, 0.48], PARRY_DIR, FWD],
]);
const DL_TB = tb({ crouch: -0.34, lean: -0.02, step: 0.44, back: 0.44, width: 0.1, twist: FT + 0.1 });

// Flèche Dive (ref 9.0-9.08 s): the tell is the arm already straight and the torso tipped over the
// front foot (9.0 s); then the back leg drives and the body dives out nearly level behind the point,
// the back leg trailing straight and the back arm flung down along it
const dive = glide([
  [-0.6, GUARD_POS, GUARD_DIR],
  [-0.1, [-0.08, 0.42, 0.86], [0.02, 0.06, 1]],
  [0.85, [-0.04, 0.3, 1.0], [0.02, 0.0, 1]],
  [1.05, [-0.04, 0.28, 0.98], [0.02, -0.02, 1]],
]);
const DH_TB = tb({ crouch: -0.3, lean: 0.4, step: 0.5, back: 0.48, twist: FT + 0.05, headPitch: -0.15 });
const DIVE = tb({ crouch: -0.4, lean: 1.0, step: 0.36, back: 0.7, twist: FT, headPitch: -0.5, width: 0.1 });

// Retreating Cut (ref 6.67-6.75 s, recovering backwards into the parry): the tell is a backhand
// chamber, the hand across at the left shoulder and the point flung back to the left; then the point
// flicks across their wrist from left to right as the rear foot steps back and the weight goes back
const BL_TELL: V3 = [0.02, 0.56, 0.3];
const retreat = glide([
  [-0.5, GUARD_POS, GUARD_DIR],
  [0.0, BL_TELL, [0.8, 0.22, -0.1], [-0.35, 0, 0.94]],
  [0.4, [-0.04, 0.52, 0.56], [0.5, 0.2, 0.84], [-0.6, 0, 0.8]],
  [0.85, [-0.12, 0.46, 0.78], [-0.04, 0.12, 1], [-1, 0, 0]],
  [1.07, [-0.3, 0.42, 0.56], [-0.8, -0.1, 0.45], [-1, 0, 0]],
]);
const BL_TB = tb({ crouch: -0.24, lean: 0.0, step: 0.4, back: 0.46, twist: FT + 0.16 });

// Cartwheel Cut (ref 9.17-9.5 s, the cartwheel landing in the crouch, 9.92 s the cut): sunk and
// leaning to the left, the free hand reaching for the floor; then a cartwheel to the left, giving
// ground, the point kept on them the whole way round (the wheel turns about the line to the
// opponent), landing in the wide crouch with the blade lifted high right and cut down through them
const wheel = glide(
  [
    [-1.3, GUARD_POS, GUARD_DIR],
    [-1.0, [-0.2, 0.36, 0.5], [0.04, 0.2, 1]],
    [0.2, [-0.18, 0.42, 0.52], [0.03, 0.12, 1]],
    [0.45, [-0.26, 0.72, 0.42], [-0.3, 0.9, 0.3], FWD],
    [0.85, [-0.08, 0.48, 0.86], [0.16, 0.04, 1]],
    [1.1, [0.08, 0.24, 0.62], [0.6, -0.62, 0.46]],
  ],
  0.06,
);
const BH_COIL = tb({ crouch: -0.36, lean: 0.15, side: 0.3, step: 0.4, back: 0.5, twist: FT + 0.2 });
const SIT = tb({ crouch: -0.34, step: 0.55, back: 0.55, width: 0.1, lean: 0.1 });

// Aerial Sweep (ref 5.58-5.83 s, diving out of the flip with the arms spread and the blade swept):
// the tell is the knees tucked and the hand pulled to the right hip with the point out to the
// right; then the body pitches forward and the blade sweeps level across in front of them
const JL_TELL: V3 = [-0.36, 0.3, 0.24];
const sweep = glide([
  [-0.5, GUARD_POS, GUARD_DIR],
  [0.0, JL_TELL, [-0.85, -0.05, 0.25]],
  [0.45, [-0.24, 0.4, 0.66], [-0.5, 0.0, 0.86]],
  [0.85, [-0.06, 0.38, 0.88], [0.12, -0.08, 1]],
  [1.05, [0.22, 0.36, 0.62], [0.85, -0.15, 0.4]],
]);
const JL_TB = tb({ crouch: -0.02, lean: -0.12, step: 0.2, back: 0.2, twist: FT + 0.3 });

// Somersault Plunge (ref 4.92-5.33 s, the somersault over them with the point turned down): a full
// forward somersault with the blade tucked along the forearm, coming out of it at the top with the
// hand thrown up over the head and the point turned down at them; then the whole body drops with
// the thrust and lands hard in a deep crouch
const plunge = glide([
  [-1.0, GUARD_POS, GUARD_DIR],
  [-0.85, [-0.2, 0.36, 0.34], [0.02, 0.2, 1]],
  [-0.4, [-0.18, 0.38, 0.34], [0.02, 0.2, 1]],
  [-0.2, [-0.14, 0.98, 0.14], [0.0, -0.6, 0.8]],
  [0.85, [-0.1, 0.3, 0.6], [0.0, -0.42, 0.9]],
  [1.1, [-0.1, 0.28, 0.58], [0.0, -0.46, 0.88]],
]);
const JH_TB = tb({ crouch: 0.0, lean: -0.16, step: 0.24, back: 0.2, twist: FT - 0.2, headPitch: 0.28 });

// ------------------------------------------------------------------------------------ entrance

// Entrance: the blade hanging loose by the right leg, raised in salute (hilt at the chin, blade
// straight up), snapped down to the side, flicked through a falling petal and levelled at them,
// then settled into the en garde
const IN_LOW: V3 = [-0.38, 0.04, 0.12];
const IN_LOW_D: V3 = [-0.42, -0.58, 0.68];
const IN_SALUTE: V3 = [-0.04, 0.62, 0.3];
const IN_SIDE: V3 = [-0.36, 0.1, 0.2];
const IN_SIDE_D: V3 = [-0.42, -0.62, 0.66];
const IN_AIM: V3 = [-0.14, 0.56, 0.78];
const entranceBlade = seq(
  [
    [0.0, 0.34, line(IN_LOW, [-0.37, 0.05, 0.15], IN_LOW_D, [-0.38, -0.6, 0.7], [1, 0, 0], NaN, NaN, H)],
    [0.34, 0.46, line([-0.37, 0.05, 0.15], IN_SALUTE, [-0.38, -0.6, 0.7], [0.02, 1, 0.06], [0, 0, 1], NaN, NaN, H)],
    [0.46, 0.56, line(IN_SALUTE, [-0.04, 0.64, 0.3], [0.02, 1, 0.06], [0.02, 1, 0.08], [0, 0, 1], NaN, NaN, H)],
    [0.56, 0.61, line([-0.04, 0.64, 0.3], IN_SIDE, [0.02, 1, 0.08], IN_SIDE_D, [0, 0, 1], NaN, NaN, H)],
    [0.61, 0.7, line(IN_SIDE, [-0.36, 0.14, 0.22], IN_SIDE_D, [-0.5, -0.52, 0.66], [0, 0, 1], NaN, NaN, H)],
    [0.7, 0.78, line([-0.36, 0.14, 0.22], [-0.14, 0.46, 0.56], [-0.5, -0.52, 0.66], [0.5, 0.2, 0.84], [0, 0, 1], NaN, NaN, H)],
    [0.78, 0.84, line([-0.14, 0.46, 0.56], IN_AIM, [0.5, 0.2, 0.84], [0.02, 0.06, 1], DOWN, NaN, NaN, H)],
    [0.84, 0.92, line(IN_AIM, [-0.14, 0.56, 0.8], [0.02, 0.06, 1], [0.02, 0.06, 1], DOWN, NaN, NaN, H)],
    [0.92, 1.0, line([-0.14, 0.56, 0.8], GUARD_POS, [0.02, 0.06, 1], GUARD_DIR, DOWN, NaN, NaN, H)],
  ],
  0.025,
);

// ------------------------------------------------------------------------------------ style

export const rapier: Style = {
  axis: 'y',
  offAxis: 'y',
  trail: { light: '#ffe8ee', heavy: '#ff6a8a', special: '#ff2a4a' },
  sparks: ['#ffffff', '#ffd6e0', '#ff8aa0'],
  guard: P(body, X(GUARD_POS, GUARD_DIR, DOWN, 'y', NaN, FT), null, F_GUARD),
  // parry (ref 6.75 s, 4.42 s): the blade stood up in front of the face, the weight sat back
  block: P(tb({ crouch: -0.26, lean: -0.06, back: 0.46 }), X(PARRY_POS, PARRY_DIR, [1, 0, 0.2], 'y', NaN, FT), null, F_GUARD),
  moves: {
    // Lunge: the arm first, then the legs
    l0: mv({
      keys: [
        K(-0.5, body),
        ...hold(0.0, 0.1, L0_TB),
        // the feet stay in guard while the arm straightens
        K(0.35, tb({ crouch: -0.28, lean: 0.02, step: 0.42, back: 0.44, twist: FT + 0.1 })),
        // the feet trail their targets a little, so the drive is keyed to land with the touch
        K(0.7, tb({ ...LUNGE, crouch: -0.33 })),
        K(0.93, LUNGE),
        K(1.1, LUNGE),
      ],
      main: lunge,
      free: track([[-0.5, F_GUARD], [0.0, F_HIGH], [0.42, F_GUARD], [0.85, F_BACK]]),
      impacts: [0.85],
      start: -0.5,
      chamber: 0.0,
      travel: 0.1,
      blendIn: 0.5,
      lead: 0.02,
      end: 1.05,
      fx: [fx(0.0, 'sparkle', 'tip', 0.35, '#ffffff'), fx(0.84, 'dust', 'feet', 0.6), fx(0.85, 'sparkle', 'tip', 0.6)],
    }),
    // Rising Cut: hips, then the hand, then the blade
    l1: mv({
      keys: [
        K(-0.5, body),
        ...hold(0.0, 0.1, L1_TB),
        K(0.72, tb({ crouch: -0.3, lean: 0.22, step: 0.6, back: 0.6, twist: FT - 0.15, hipTwist: 0.2, side: -0.04 })),
        K(1.1, tb({ crouch: -0.3, lean: 0.18, step: 0.6, back: 0.6, twist: FT - 0.32, hipTwist: 0.1, side: -0.06, headPitch: -0.06 })),
      ],
      main: rising,
      free: track([[-0.5, F_GUARD], [0.0, [0.6, 0.62, 0.0]], [0.85, F_BACK], [1.1, [0.66, 0.28, -0.3]]]),
      impacts: [0.85],
      start: -0.5,
      chamber: 0.0,
      travel: 0.1,
      blendIn: 0.5,
      lead: 0.08,
      end: 1.1,
      fx: [fx(0.6, 'dust', 'feet', 0.4), fx(0.85, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.18, glow: 0.3 },
    }),
    // Coupé: the hand leads, the blade whips over after it
    l2: mv({
      keys: [
        K(-0.5, body),
        ...hold(0.0, 0.1, L2_TB),
        K(0.72, tb({ crouch: -0.32, lean: 0.3, step: 0.6, back: 0.62, twist: FT - 0.1, headPitch: -0.04 })),
        K(1.1, tb({ crouch: -0.33, lean: 0.32, step: 0.6, back: 0.62, twist: FT - 0.3 })),
      ],
      main: coupe,
      free: track([[-0.5, F_GUARD], [0.0, [0.6, 0.3, -0.16]], [0.85, F_BACK]]),
      impacts: [0.85],
      start: -0.5,
      chamber: 0.0,
      travel: 0.1,
      blendIn: 0.5,
      lead: 0.06,
      end: 1.1,
      fx: [fx(0.0, 'sparkle', 'tip', 0.4, '#ffffff'), fx(0.8, 'dust', 'feet', 0.4), fx(0.85, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Moulinet: tall and still with the blade up, then the wheel and the deep lunge
    h: mv({
      keys: [
        K(-1.3, body),
        ...hold(-0.6, -0.42, H_TB),
        K(-0.05, tb({ crouch: -0.18, lean: 0.0, step: 0.34, back: 0.34, twist: FT + 0.12 })),
        // still loading on the back leg as the arm straightens
        K(0.4, tb({ crouch: -0.28, lean: 0.12, step: 0.42, back: 0.5, twist: FT + 0.1 })),
        K(0.93, DEEP),
        K(1.1, DEEP),
      ],
      main: moulinet,
      free: track([[-1.3, F_GUARD], [-0.6, F_HIGH], [-0.42, F_HIGH], [0.2, F_GUARD], [0.85, F_BACK]]),
      impacts: [0.85],
      start: -1.3,
      chamber: -0.6,
      travel: 0.1,
      blendIn: 0.35,
      lead: 0.04,
      end: 1.05,
      fx: [fx(-0.6, 'sparkle', 'tip', 0.7, '#ffffff'), fx(-0.1, 'whirl', 'main', 0.6, '#ffd0d8'), fx(0.84, 'dust', 'feet', 0.8), fx(0.85, 'flashline', 'tip', 1.2), fx(0.85, 'sparkle', 'tip', 1)],
      trail: { life: 0.22, glow: 0.5 },
    }),
    // Tranchant: out of the lunge, wound right, then the level cut at head height
    h1: mv({
      keys: [
        K(-1.0, DEEP),
        K(-0.55, tb({ crouch: -0.24, lean: 0.05, step: 0.44, back: 0.44, twist: FT + 0.1 })),
        ...hold(-0.2, -0.08, H1_TB),
        K(0.4, tb({ crouch: -0.3, lean: 0.15, step: 0.5, back: 0.56, twist: FT + 0.15, hipTwist: 0.2 })),
        K(0.85, tb({ crouch: -0.34, lean: 0.3, step: 0.62, back: 0.62, twist: FT - 0.1, hipTwist: 0.05, side: -0.05 })),
        K(1.1, tb({ crouch: -0.34, lean: 0.26, step: 0.62, back: 0.62, twist: FT - 0.36, hipTwist: -0.05, side: -0.08 })),
      ],
      main: tranchant,
      free: track([[-1.0, F_BACK], [-0.55, F_GUARD], [-0.2, [0.12, 0.52, 0.4]], [0.4, F_GUARD], [0.85, F_BACK], [1.1, [0.7, 0.5, -0.16]]]),
      impacts: [0.85],
      start: -1.0,
      chamber: -0.2,
      travel: 0.1,
      blendIn: 0.35,
      lead: 0.08,
      end: 1.1,
      fx: [fx(-0.2, 'sparkle', 'tip', 0.6, '#ffffff'), fx(0.6, 'dust', 'feet', 0.7), fx(0.85, 'flashline', 'tip', 1.1), fx(0.85, 'sparkle', 'tip', 0.9)],
      trail: { life: 0.22, glow: 0.5 },
    }),
    // Grand Coupé: the salute, the blade laid back high, then the full-body cut on a long lunge
    h2: mv({
      keys: [
        K(-1.2, tb({ crouch: -0.34, lean: 0.26, step: 0.62, back: 0.62, twist: FT - 0.36 })),
        K(-0.8, tb({ ...TALL, twist: FT + 0.05, headPitch: -0.12 })),
        K(-0.55, tb({ ...TALL, twist: FT + 0.05, headPitch: -0.1 })),
        ...hold(-0.25, -0.12, H2_TB),
        K(0.25, tb({ crouch: -0.2, lean: 0.05, step: 0.36, back: 0.4, twist: FT + 0.1, hipTwist: 0.2 })),
        K(H2_HIT - 0.12, tb({ crouch: -0.4, lean: 0.34, step: 0.62, back: 0.66, twist: FT - 0.2, hipTwist: 0.15, width: 0.12 })),
        K(1.1, tb({ crouch: -0.42, lean: 0.28, step: 0.6, back: 0.66, twist: FT - 0.42, hipTwist: 0.05, width: 0.14, headPitch: -0.08 })),
      ],
      main: grand,
      free: track([[-1.2, F_BACK], [-0.8, [0.2, 0.05, -0.28]], [-0.55, [0.2, 0.05, -0.28]], [-0.25, [0.1, 0.62, 0.36]], [H2_HIT, [0.6, 0.4, -0.2]], [1.1, [0.62, 0.62, -0.2]]]),
      impacts: [H2_HIT],
      start: -1.2,
      chamber: -0.25,
      travel: 0.1,
      blendIn: 0.3,
      lead: 0.06,
      end: 1.1,
      settle: 0.5,
      fx: [fx(-0.7, 'sparkle', 'tip', 0.9, '#ffffff'), fx(-0.25, 'sparkle', 'tip', 0.7), fx(H2_HIT - 0.05, 'stomp', 'feet', 0.9), fx(H2_HIT, 'flashline', 'tip', 1.3), fx(H2_HIT, 'sparkle', 'tip', 1.1)],
      trail: { life: 0.26, glow: 0.7 },
    }),
    dl: mv({
      keys: [
        K(-0.7, tb({ crouch: -0.24, lean: 0.14, step: 0.44, back: 0.42 }), { hop: 0 }),
        K(-0.45, tb({ crouch: -0.08, step: 0.4, back: 0.34 }), { hop: 0.22 }),
        K(-0.15, DL_TB, { hop: 0 }),
        K(0.0, DL_TB),
        K(0.42, tb({ ...DL_TB, lean: 0.06 })),
        K(0.93, LUNGE),
        K(1.15, LUNGE),
        K(1.5, tb({ crouch: -0.24, lean: -0.06, step: 0.42, back: 0.46 })),
        K(1.85, body),
      ],
      main: balestra,
      free: track([[-0.7, F_GUARD], [-0.15, F_HIGH], [0.42, F_GUARD], [0.85, F_BACK], [1.2, F_BACK], [1.6, F_GUARD]]),
      impacts: [0.85],
      start: -0.7,
      chamber: -0.15,
      travel: 0.05,
      blendIn: 0.35,
      lead: 0.02,
      end: 1.05,
      rest: 1.75,
      settle: 0.6,
      fx: [fx(-0.17, 'dust', 'feet', 0.9), fx(0.84, 'dust', 'feet', 0.6), fx(0.85, 'flashline', 'tip', 1.0), fx(0.85, 'sparkle', 'tip', 0.8)],
      trail: { life: 0.18, glow: 0.3 },
    }),
    // Flèche Dive: tipped over the front foot, then the back leg drives and the body dives out level
    dh: mv({
      keys: [
        K(-0.6, tb({ crouch: -0.28, lean: 0.2, step: 0.44, back: 0.44 })),
        ...hold(-0.1, 0.02, DH_TB),
        K(0.5, tb({ crouch: -0.36, lean: 0.72, step: 0.4, back: 0.66, twist: FT, headPitch: -0.32 }), { hop: 0.1 }),
        K(0.85, DIVE, { hop: 0.05 }),
        K(1.05, DIVE, { hop: 0 }),
      ],
      main: dive,
      free: track([[-0.6, F_GUARD], [-0.1, F_BACK], [0.85, [0.62, 0.12, -0.4]]]),
      impacts: [0.85],
      start: -0.6,
      chamber: -0.1,
      travel: 0.1,
      blendIn: 0.4,
      lead: 0.04,
      end: 1.05,
      ghosts: [0.0, 0.95],
      fx: [fx(-0.1, 'dust', 'feet', 0.7), fx(0.3, 'dust', 'feet', 0.9), fx(0.85, 'flashline', 'tip', 1.3), fx(0.85, 'sparkle', 'tip', 1)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    bl: mv({
      keys: [
        K(-0.5, body),
        ...hold(0.0, 0.1, BL_TB),
        K(0.85, tb({ crouch: -0.3, lean: -0.12, twist: FT - 0.1, step: 0.3, back: 0.6 })),
        K(1.07, tb({ crouch: -0.32, lean: -0.14, twist: FT - 0.18, step: 0.28, back: 0.62 })),
      ],
      main: retreat,
      free: track([[-0.5, F_GUARD], [0.0, F_HIGH], [0.85, [0.62, 0.66, -0.2]]]),
      impacts: [0.85],
      start: -0.5,
      chamber: 0.0,
      travel: 0.1,
      blendIn: 0.5,
      lead: 0.06,
      end: 1.07,
      fx: [fx(0.1, 'dust', 'feet', 0.5), fx(0.85, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.16, glow: 0.3 },
    }),
    // Cartwheel Cut: one accelerating motion, the coil, the wheel and the cut out of the landing
    bh: mv({
      keys: [
        K(-1.3, body, { roll: 0, hop: 0 }),
        K(-1.0, BH_COIL, { roll: 0, hop: 0 }),
        K(-0.7, tb({ ...BH_COIL, side: 0.1, crouch: -0.2 }), { roll: -0.22, hop: 0.28 }),
        K(-0.3, tb({ crouch: -0.1, lean: 0.0, step: 0.3, back: 0.3, width: 0.2 }), { roll: -0.5, hop: 0.55 }),
        K(0.0, tb({ crouch: -0.2, step: 0.4, back: 0.4, width: 0.16 }), { roll: -0.8, hop: 0.3 }),
        K(0.3, SIT, { roll: -1, hop: 0 }),
        K(0.85, tb({ ...SIT, lean: 0.24, twist: FT - 0.12, crouch: -0.36 })),
        K(1.1, tb({ ...SIT, lean: 0.22, twist: FT - 0.3, crouch: -0.34 })),
      ],
      main: wheel,
      // reaching for the floor on the left, planted through the wheel, then up for balance
      free: track([[-1.3, F_GUARD], [-1.0, [0.62, 0.0, 0.1]], [-0.3, [0.64, -0.02, 0.06]], [0.3, F_HIGH], [0.85, F_BACK]]),
      impacts: [0.85],
      start: -1.3,
      chamber: -1.0,
      flow: 1.8,
      blendIn: 0.3,
      lead: 0.04,
      end: 1.1,
      ghosts: [-0.8, 0.3],
      fx: [fx(-1.0, 'dust', 'feet', 0.6), fx(-0.6, 'whirl', 'root', 0.8, '#ffd0d8'), fx(0.3, 'stomp', 'feet', 0.7), fx(0.85, 'sparkle', 'tip', 1)],
      trail: { life: 0.24, glow: 0.6 },
    }),
    jl: mv({
      keys: [
        K(-0.5, tb({ crouch: -0.08, lean: 0.1, step: 0.3, back: 0.28 }), { hop: 0.04, flip: 0 }),
        ...hold(0.0, 0.08, JL_TB),
        K(0.85, tb({ crouch: -0.12, lean: 0.3, step: 0.36, back: 0.36, twist: FT - 0.2 }), { hop: 0, flip: 0.06 }),
        K(1.05, tb({ crouch: -0.14, lean: 0.3, step: 0.38, back: 0.36, twist: FT - 0.34 }), { flip: 0.08 }),
      ],
      main: sweep,
      free: track([[-0.5, F_GUARD], [0.0, [0.24, 0.5, 0.36]], [0.85, [0.66, 0.5, -0.1]]]),
      impacts: [0.85],
      start: -0.5,
      chamber: 0.0,
      travel: 0.05,
      blendIn: 0.45,
      lead: 0.06,
      end: 1.05,
      fx: [fx(0.0, 'sparkle', 'tip', 0.4, '#ffffff'), fx(0.85, 'petals', 'tip', 0.8, '#ffb8cc'), fx(0.85, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.2, glow: 0.4 },
    }),
    // Somersault Plunge: one accelerating motion, the somersault, the point turned down and the drop
    jh: mv({
      keys: [
        K(-1.0, tb({ crouch: -0.12 }), { flip: 0, hop: 0 }),
        K(-0.85, tb({ crouch: -0.04, lean: 0.3, step: 0.2, back: 0.2 }), { flip: 0.05, hop: 0.2 }),
        K(-0.6, tb({ crouch: -0.04, lean: 0.3, step: 0.2, back: 0.2 }), { flip: 0.5, hop: 0.55 }),
        K(-0.3, JH_TB, { flip: 1, hop: 0.4 }),
        K(-0.15, JH_TB, { hop: 0.36 }),
        K(0.85, tb({ crouch: -0.48, lean: 0.4, step: 0.5, back: 0.5, width: 0.16, twist: FT + 0.05, headPitch: 0.15 }), { hop: 0 }),
        K(1.1, tb({ crouch: -0.48, lean: 0.38, step: 0.5, back: 0.5, width: 0.16, twist: FT + 0.05 })),
      ],
      main: plunge,
      free: track([[-1.0, F_GUARD], [-0.85, [0.3, 0.3, 0.3]], [-0.4, [0.3, 0.3, 0.3]], [-0.2, [0.5, 0.62, 0.1]], [0.85, [0.6, 0.2, -0.2]]]),
      impacts: [0.85],
      start: -1.0,
      chamber: -0.2,
      flow: 1.5,
      blendIn: 0.3,
      lead: 0.05,
      end: 1.1,
      ghosts: [-0.9, -0.25],
      fx: [fx(-0.2, 'sparkle', 'tip', 0.6), fx(0.85, 'shockwave', 'tip', 0.9, '#ffd0d8'), fx(0.86, 'stomp', 'feet', 1.0), fx(0.85, 'flashline', 'tip', 1.0)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    sp: mv({
      keys: [
        K(-1.0, body),
        K(-0.7, tb({ ...TALL, twist: FT - 0.15, headPitch: -0.12 })),
        K(-0.45, tb({ ...TALL, twist: FT - 0.15, headPitch: -0.1 })),
        ...hold(-0.15, -0.02, SP_TB),
        // the arm goes first: the feet stay sat back while it straightens
        K(0.4, tb({ crouch: -0.32, lean: 0.08, step: 0.38, back: 0.52, twist: FT + 0.15 })),
        K(0.93, SP_HIT),
        K(1.1, SP_HIT),
      ],
      main: coup,
      // behind the back for the salute, then stretched out along the line, aiming
      free: track([[-1.0, F_GUARD], [-0.7, [0.12, 0.1, -0.3]], [-0.45, [0.12, 0.1, -0.3]], [-0.15, F_AIM], [-0.02, F_AIM], [0.4, F_GUARD], [0.85, F_BACK]]),
      impacts: [0.85],
      start: -1.0,
      chamber: -0.15,
      travel: 0.1,
      blendIn: 0.3,
      lead: 0.02,
      end: 1.05,
      ghosts: [0.0, 0.95],
      fx: [
        fx(-0.6, 'sparkle', 'tip', 0.9, '#ffffff'),
        fx(-0.15, 'sparkle', 'tip', 1.0, '#ff3a5a'),
        fx(0.84, 'dust', 'feet', 1.2),
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
        K(1.2, tb({ crouch: -0.26, lean: 0.25, twist: FT, front: 'R', step: 0.46, back: 0.46 }), { hop: 0 }),
      ],
      main: fleche,
      free: track([[-0.3, F_GUARD], [-0.1, F_BACK], [0.3, [0.62, 0.3, -0.38]]]),
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
  // into the en garde
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
      K(0.76, tb({ twist: FT - 0.1, crouch: -0.14, lean: 0.06, step: 0.34, back: 0.3 })),
      K(0.84, tb({ twist: FT + 0.1, crouch: -0.2, lean: 0.0, step: 0.42, back: 0.38, headPitch: -0.06 })),
      K(0.92, tb({ twist: FT + 0.1, crouch: -0.2, lean: 0.0, step: 0.42, back: 0.38, headPitch: -0.06 })),
      K(1.0, body),
    ],
    main: entranceBlade,
    // the back hand on the hip, swept up and over the left shoulder to throw the cape back, behind
    // the back for the salute, then out behind for balance as the point comes on line
    free: track([
      [0.0, [0.3, 0.02, 0.06]],
      [0.1, [0.3, 0.02, 0.06]],
      [0.16, [0.22, 0.52, 0.22]],
      [0.21, [0.4, 0.78, -0.18]],
      [0.26, [0.44, 0.5, -0.3]],
      [0.32, [0.3, 0.02, 0.04]],
      [0.4, [0.16, 0.06, -0.28]],
      [0.68, [0.16, 0.06, -0.28]],
      [0.8, F_GUARD],
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
