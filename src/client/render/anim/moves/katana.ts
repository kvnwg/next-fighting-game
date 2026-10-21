/**
 * Ronin, katana. A duelist's kenjutsu, big and committed: the blade rides low and forward at the
 * right hip in one hand, every cut coils the hips away first and then throws the whole body after
 * the blade, landing on the front knee with the chest pitched over it. The lights stay one-handed
 * (the arm thrown out at full length, the left flung back for balance); the heavies close both
 * hands on the hilt; the special is the Gatotsu, the blade drawn back level beside the head and
 * fired down its own line on a lunge that ends almost flat.
 *
 * Most paths are authored relative to the hips (`body: true`), so a blade that points ahead
 * points at the opponent however far the torso has wound or pitched.
 */
import { B, K, P, Style, X, arc, fx, hitAt, line, mv, N, seq, track } from '../author';
import type { Motion, V3 } from '../author';

/** The scabbard (torso space): runs back and down from the left hip; the Iai grip sits just outside its mouth. */
const IAI_GRIP: V3 = [-0.06, 0.16, 0.32];
export const KATANA_SHEATH: V3 = [0.5, -0.42, -0.76];
export const KATANA_SHEATH_MOUTH: V3 = (() => {
  const d = N(KATANA_SHEATH);
  return [IAI_GRIP[0] + d.x * 0.19, IAI_GRIP[1] + d.y * 0.19, IAI_GRIP[2] + d.z * 0.19];
})();

const G2 = -0.13; // the left hand rides 13 cm down the handle
const GATOTSU_G2 = 0.3; // in the Gatotsu the left hand lies along the back of the blade, past the guard
const body = B({ front: 'R', step: 0.28, back: 0.26, width: 0.13, crouch: -0.13, lean: 0.14, twist: 0.06 });
const stanceBody = B({ ...body, crouch: -0.24, lean: 0.32, twist: 0.25, step: 0.32, back: 0.3 });
/** Guard: one hand, low at the right hip, the point level at their knees; the left hand rests on the saya. */
const GUARD_GRIP: V3 = [-0.2, 0.06, 0.34];
const GUARD_DIR: V3 = [-0.14, -0.12, 1];
const GUARD_EDGE: V3 = [0, -1, -0.1];
const SAYA: V3 = [0.1, 0.07, 0.15];

const H = { body: true };
const one = (pivot: V3, r: number, dirs: V3[], pivot1?: V3) => arc(pivot, r, dirs, NaN, { body: true, pivot1 });
const two = (pivot: V3, r: number, dirs: V3[], pivot1?: V3) => arc(pivot, r, dirs, G2, { body: true, pivot1 });

/** A torso-space point seen from the hips, for a torso turned `twist` and pitched `lean` (bodyToTorso undone). */
function fromTorso(p: V3, twist: number, lean: number): V3 {
  const y = p[1] * Math.cos(lean) - p[2] * Math.sin(lean);
  const z = p[1] * Math.sin(lean) + p[2] * Math.cos(lean);
  return [p[0] * Math.cos(twist) + z * Math.sin(twist), y, -p[0] * Math.sin(twist) + z * Math.cos(twist)];
}

/** Where the grip sits relative to the torso as the blade reaches direction i: [i, grip, twist, lean]. */
type Anchor = [number, V3, number, number];

/**
 * A hips-relative swing (aimed in the world, so the hit points at the opponent however the body is
 * wound) whose grip passes through two torso-space spots, so the hands stay where the arms can put
 * them: on a deep lean the head drops forward into the space a level cut would otherwise use.
 */
function swing(r: number, dirs: V3[], grip2: number, a: Anchor, b: Anchor): Motion {
  const probe = arc([0, 0, 0], r, dirs);
  const pivotAt = ([i, g, tw, ln]: Anchor): [number, V3] => {
    const p = fromTorso(g, tw, ln);
    const d = N(dirs[i]);
    return [hitAt(probe, i), [p[0] - d.x * r, p[1] - d.y * r, p[2] - d.z * r]];
  };
  const [fa, pa] = pivotAt(a);
  const [fb, pb] = pivotAt(b);
  const k = (j: number) => (pb[j] - pa[j]) / (fb - fa);
  const p0: V3 = [pa[0] - k(0) * fa, pa[1] - k(1) * fa, pa[2] - k(2) * fa];
  const p1: V3 = [p0[0] + k(0), p0[1] + k(1), p0[2] + k(2)];
  return arc(p0, r, dirs, grip2, { body: true, pivot1: p1 });
}

// Swallow Cut: the blade trailed low behind the right hip, then one flat stroke at chest height,
// the arm thrown out at the target, and on round to the left as the body folds after it
const swallow = one([-0.12, 0.3, 0.1], 0.3, [[-0.55, -0.4, -0.73], [-0.95, -0.1, 0.0], [-0.5, 0.05, 0.86], [0.05, 0.08, 1], [0.65, 0.05, 0.75], [0.92, -0.1, 0.15]], [0.02, 0.36, 0.3]);
const swallowHit = hitAt(swallow, 3);

// Rising Petal: the blade drops point-down by the left knee and rips up through them to high right
const petal = swing(0.3, [[0.5, -0.45, 0.7], [0.35, -0.35, 0.86], [0.0, 0.0, 1], [-0.45, 0.55, 0.7], [-0.7, 0.7, 0.05]], NaN, [0, [0.15, 0.2, 0.32], 0.75, 0.38], [4, [-0.42, 0.72, 0.2], -0.75, 0.12]);
const petalHit = hitAt(petal, 2);

// Twin Swallow: both hands meet in hasso by the right shoulder; kesa down to the low left, then
// the blade turns over and snaps back flat from left to right
const twin = seq([
  [-0.1, 0.62, swing(0.24, [[-0.8, 0.55, -0.25], [-0.6, 0.65, 0.45], [-0.15, 0.3, 1], [0.45, -0.35, 0.82], [0.7, -0.5, 0.45]], G2, [0, [-0.2, 0.62, 0.1], -0.45, 0.1], [2, [-0.1, 0.4, 0.48], 0.4, 0.5])],
  [0.62, 1.12, two([0.0, 0.34, 0.24], 0.24, [[0.7, -0.5, 0.45], [0.85, -0.08, 0.5], [0.45, 0.02, 0.9], [-0.05, 0.05, 1], [-0.65, 0.02, 0.75], [-0.9, -0.05, 0.25]], [-0.04, 0.34, 0.26])],
], 0.06);
const twinHits = [hitAt(twin, 2, 0), hitAt(twin, 3, 1)];

// Heaven Splitter: up on the toes into jodan, the hands at the forehead under the brim and the blade
// laid back over the right shoulder (the hat leaves no room straight overhead); then the whole body
// pitches over the cut and folds down after it
const JODAN: V3[] = [[-0.85, 0.45, -0.25], [-0.6, 0.75, 0.3], [-0.12, 0.72, 0.68]];
const JODAN_GRIP: V3 = [-0.1, 0.66, 0.34];
const heaven = swing(0.18, [...JODAN, [0, 0.3, 1], [0, 0.05, 1], [0, -0.08, 1]], G2, [0, JODAN_GRIP, -0.05, -0.2], [5, [-0.02, 0.46, 0.46], 0.05, 0.78]);
const heavenHit = hitAt(heaven, 3);

// Iai Flash: out of the scabbard mouth, flat across the body
const draw = arc([-0.167, 0.2, 0.421], 0.15, [[0.9, 0, -0.4], [0.7, 0.14, 0.7], [0, 0.3, 1], [-0.8, 0.36, 0.55], [-0.95, 0.4, -0.15]], NaN, { pivot1: [-0.34, 0.4, 0.24] });
const drawHit = hitAt(draw, 2);

// Ground Wheel: out of the Heaven Splitter's fold the blade is swept back low behind the left hip,
// both arms trailing; then it wheels flat round at the thighs from left to right
const wheel = two([0, 0.26, 0.23], 0.26, [[0.62, -0.38, -0.68], [0.98, -0.2, 0.0], [0.55, -0.18, 0.82], [0.0, -0.15, 1], [-0.6, -0.05, 0.8], [-0.92, 0.1, 0.3]], [-0.05, 0.28, 0.3]);
const wheelHit = hitAt(wheel, 3);

// Crescent Moon: a full turn to the left with the blade trailing low, rising up the right side as
// the turn closes; a leap, and a kesa cleave from high on the right that lands on the front knee
const crescent = swing(0.25, [[-0.75, -0.25, -0.6], [-0.95, 0.1, -0.2], [-0.85, 0.45, -0.25], [-0.6, 0.62, 0.5], [-0.15, 0.3, 1], [0.45, -0.12, 0.88], [0.65, -0.15, 0.74]], G2, [2, [-0.2, 0.62, 0.12], -0.55, 0.0], [6, [0.05, 0.46, 0.44], 0.5, 0.76]);
const crescentTop = hitAt(crescent, 3);
const crescentHit = hitAt(crescent, 4);

// Gatotsu: drawn back level beside the right temple (left hand along the back of the blade), then
// fired straight down the line on the lunge, both arms at full stretch
const GATOTSU_RAISE: V3 = [-0.24, 0.42, 0.2];
const GATOTSU_CH: V3 = fromTorso([-0.3, 0.6, 0.15], -0.85, 0.12);
const GATOTSU_EXT: V3 = fromTorso([-0.08, 0.88, 0.32], -0.4, 0.95);
const GATOTSU_HOLD: V3 = fromTorso([-0.08, 0.84, 0.34], -0.4, 0.92);
const GATOTSU_DIR: V3 = [0.12, 0.0, 1];
const GATOTSU_EDGE: V3 = [-1, 0.15, 0];
const gatotsu = seq([
  [-0.4, -0.1, line(GATOTSU_RAISE, GATOTSU_CH, [0.0, 0.1, 1], GATOTSU_DIR, GATOTSU_EDGE, GATOTSU_G2, GATOTSU_G2, H)],
  [-0.1, 0.85, line(GATOTSU_CH, GATOTSU_EXT, GATOTSU_DIR, [0.02, -0.02, 1], GATOTSU_EDGE, GATOTSU_G2, G2, H)],
  [0.85, 1.1, line(GATOTSU_EXT, GATOTSU_HOLD, [0.02, -0.02, 1], [0.0, -0.08, 1], GATOTSU_EDGE, G2, G2, H)],
], 0.04);
const gatotsuHit = 0.8;

// Gale Step: running with the blade trailed low behind the right hip in one hand, the point whips
// round to the front and the arm shoots it out level on a fencer's lunge
const gale = seq([
  [-0.3, 0.5, one([-0.16, 0.26, 0.0], 0.24, [[-0.3, -0.3, -0.9], [-0.95, -0.15, 0.15], [-0.4, 0.05, 0.9], [-0.05, 0.06, 1]], [-0.12, 0.38, 0.2])],
  [0.5, 0.85, line([-0.13, 0.4, 0.44], [-0.1, 0.42, 0.74], [-0.05, 0.06, 1], [0.0, 0.02, 1], [0, -1, 0], NaN, NaN, H)],
  [0.85, 1.1, line([-0.1, 0.42, 0.74], [-0.1, 0.38, 0.7], [0.0, 0.02, 1], [0.0, -0.1, 1], [0, -1, 0], NaN, NaN, H)],
], 0.05);
const galeHit = 0.8;

// Thunder Draw: hasso on the run, the blade dropping to the right as both hands close, one flat
// passing cut at the waist, and the body folds right over the front knee as it carries round
const thunder = swing(0.26, [[-0.92, 0.35, -0.15], [-0.95, 0.1, -0.1], [-0.6, -0.05, 0.8], [0.0, -0.05, 1], [0.65, -0.1, 0.75], [0.95, -0.05, 0.1], [0.72, -0.1, -0.65]], G2, [0, [-0.22, 0.5, 0.12], -0.75, 0.42], [3, [-0.1, 0.45, 0.44], 0.4, 0.62]);
const thunderHit = hitAt(thunder, 3);

// Fading Cut: one-handed gyaku kiriage, low on the right up to high on the left, as the rear foot
// slides back and the hips sink onto it
const fading = one([-0.06, 0.34, 0.12], 0.3, [[-0.55, -0.45, 0.7], [-0.4, -0.28, 0.87], [0.0, 0.05, 1], [0.5, 0.55, 0.67], [0.6, 0.8, 0.0]], [0.02, 0.42, 0.22]);
const fadingHit = hitAt(fading, 2);

// Mountain Wall: the blade hung point-down in front (the wall), wheeled up past the left shoulder
// on a hop back, and cut down from high on the left as the weight lands
const wall = two([0, 0.42, 0.14], 0.25, [[0.3, -0.6, 0.72], [0.85, -0.3, 0.4], [0.75, 0.55, -0.3], [0.45, 0.85, 0.2], [0.12, 0.3, 1], [-0.4, -0.2, 0.9], [-0.62, -0.28, 0.72]], [0.0, 0.36, 0.3]);
const wallTop = hitAt(wall, 3);
const wallHit = hitAt(wall, 4);

// Swallow Dive: in the air, one hand, the blade held out backhand on the left; the whole body
// whips a turn to the right and the arm flings it flat across the front
const dive = one([0.02, 0.36, 0.12], 0.3, [[0.9, 0.2, -0.35], [0.85, 0.15, 0.5], [0.0, 0.05, 1], [-0.7, -0.05, 0.7], [-0.92, -0.15, 0.1]], [-0.02, 0.38, 0.28]);
const diveHit = hitAt(dive, 2);

// Falling Star: jodan through a forward somersault, then straight down through the target and
// on into the ground
const star = swing(0.18, [...JODAN, [0, 0.15, 1], [0, -0.35, 0.94], [0, -0.55, 0.84]], G2, [0, JODAN_GRIP, 0, 0.3], [5, [-0.02, 0.42, 0.46], 0.03, 0.75]);
const starHit = hitAt(star, 3);
const starGround = hitAt(star, 5);


// Ring entrance. Iai at rest: the blade in the scabbard, the right hand on the hilt and the left on the
// saya; the koiguchi push slides the guard a finger's width out (ENT_KOI); then a flat nukitsuke at
// throat height toward the opponent, held in zanshin, an o-chiburi off the right temple, and guard.
/** Where an arc's grip sits for one of its directions. */
const gripAt = (pivot: V3, r: number, dir: V3): V3 => {
  const d = N(dir);
  return [pivot[0] + d.x * r, pivot[1] + d.y * r, pivot[2] + d.z * r];
};
const ENT_KOI: V3 = gripAt(IAI_GRIP, -0.05, KATANA_SHEATH);
const ENT_SAYA: V3 = [0.08, 0.09, 0.16];
const ENT_HELD: V3 = [-0.85, 0.08, 0.52];
const ENT_FLICKED: V3 = [-0.6, -0.45, 0.65];
// the hilt runs out along the scabbard's line until the point clears the mouth, then the blade wheels
// round the hand, flat, from the left hip to the opponent and on out to the right
const ENT_OUT: V3 = gripAt(ENT_KOI, -0.32, KATANA_SHEATH);
const entDraw = arc(gripAt(ENT_OUT, -0.08, KATANA_SHEATH), 0.08, [KATANA_SHEATH, [0.9, 0.02, -0.4], [0.7, 0.08, 0.7], [0, 0.1, 1], [-0.6, 0.1, 0.8], ENT_HELD], NaN, { pivot1: [-0.55, 0.42, 0.38] });
const entDrawEnd = gripAt([-0.55, 0.42, 0.38], 0.08, ENT_HELD);
const entFlickPivot: V3 = gripAt(entDrawEnd, -0.16, ENT_HELD);
const entChiburi = arc(entFlickPivot, 0.16, [ENT_HELD, [-0.55, 0.8, -0.2], [-0.3, 0.9, 0.3], ENT_FLICKED]);
const entFlicked = gripAt(entFlickPivot, 0.16, ENT_FLICKED);
const entFlick = 0.875;
const entrance = seq([
  [-1, 0.4, line(IAI_GRIP, IAI_GRIP, KATANA_SHEATH, KATANA_SHEATH, [0, 1, 0])],
  [0.4, 0.45, line(IAI_GRIP, ENT_KOI, KATANA_SHEATH, KATANA_SHEATH, [0, 1, 0])],
  [0.45, 0.735, line(ENT_KOI, ENT_KOI, KATANA_SHEATH, KATANA_SHEATH, [0, 1, 0])],
  [0.735, 0.75, line(ENT_KOI, ENT_OUT, KATANA_SHEATH, KATANA_SHEATH, [0, 1, 0])],
  [0.75, 0.795, entDraw],
  [0.795, 0.835, line(entDrawEnd, entDrawEnd, ENT_HELD, ENT_HELD, [0, 0.7, -0.7])],
  [0.835, entFlick, entChiburi],
  [entFlick, 0.96, line(entFlicked, GUARD_GRIP, ENT_FLICKED, GUARD_DIR, GUARD_EDGE)],
  [0.96, 2, line(GUARD_GRIP, GUARD_GRIP, GUARD_DIR, GUARD_DIR, GUARD_EDGE)],
], 0.012);

export const katana: Style = {
  axis: 'y',
  offAxis: 'y',
  trail: { light: '#e8f4ff', heavy: '#bfe0ff', special: '#ff5a4a' },
  sparks: ['#ffffff', '#c8e8ff', '#fff6c0'],
  guard: P(body, X(GUARD_GRIP, GUARD_DIR, GUARD_EDGE, 'y'), null, SAYA),
  // both hands, the blade slanted up across the front, edge out
  block: P(B({ ...body, crouch: -0.18, lean: 0.04, twist: -0.1 }), X([-0.08, 0.3, 0.36], [0.4, 0.82, 0.3], [0, -0.2, 1], 'y', G2)),
  // iai: blade in the scabbard (see KATANA_SHEATH), right hand on the hilt, left hand on the saya
  stance: P(stanceBody, X(IAI_GRIP, KATANA_SHEATH, [0, 1, 0], 'y'), null, [0.08, 0.09, 0.16]),
  moves: {
    // Swallow Cut: hips wound right with the blade trailed low behind; they open first, the shoulders
    // follow and the arm throws the blade flat through the target, the body folding after it
    l0: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.8, hipTwist: -0.3, lean: 0.02, crouch: -0.14, step: 0.3, back: 0.32 })),
        K(swallowHit - 0.16, B({ ...body, twist: -0.35, hipTwist: 0.15, lean: 0.24, crouch: -0.2, step: 0.44, back: 0.32 })),
        K(swallowHit, B({ ...body, twist: 0.35, hipTwist: 0.25, lean: 0.46, crouch: -0.27, step: 0.56, back: 0.34 })),
        K(1.0, B({ ...body, twist: 0.85, hipTwist: 0.3, lean: 0.6, crouch: -0.34, step: 0.58, back: 0.34, headPitch: 0.1 })),
      ],
      main: swallow,
      free: track([
        [-0.1, [0.16, 0.3, 0.32]],
        [swallowHit - 0.1, [0.3, 0.32, 0.12]],
        [swallowHit, [0.48, 0.34, -0.12]],
        [1.0, [0.42, 0.22, -0.2]],
      ]),
      impacts: [swallowHit],
      chamber: -0.1,
      fx: [fx(swallowHit, 'sparkle', 'tip', 0.6), fx(swallowHit + 0.06, 'dust', 'feet', 0.6)],
    }),
    // Rising Petal: out of the fold the blade drops point-down by the left knee, then rips up
    // through them to high on the right as the body unwinds and rises onto the front foot
    l1: mv({
      keys: [
        K(-0.1, B({ ...body, twist: 0.75, hipTwist: 0.25, lean: 0.38, crouch: -0.24, step: 0.42, back: 0.3 })),
        K(petalHit - 0.15, B({ ...body, twist: 0.3, hipTwist: -0.15, lean: 0.38, crouch: -0.22, step: 0.5, back: 0.32 })),
        K(petalHit, B({ ...body, twist: -0.25, hipTwist: -0.22, lean: 0.4, crouch: -0.16, step: 0.56, back: 0.32 })),
        K(1.0, B({ ...body, twist: -0.75, hipTwist: -0.25, lean: 0.12, crouch: -0.02, step: 0.52, back: 0.3, headPitch: -0.12 })),
      ],
      main: petal,
      free: track([
        [-0.1, [0.22, 0.28, 0.22]],
        [petalHit, [0.5, 0.34, -0.04]],
        [1.0, [0.46, 0.5, 0.0]],
      ]),
      impacts: [petalHit],
      chamber: -0.08,
      fx: [fx(petalHit, 'sparkle', 'tip', 0.6)],
    }),
    // Twin Swallow: tsubame-gaeshi. Both hands close in hasso by the right shoulder, weight back; the
    // kesa lands on a long step, the blade turns over in a blink and snaps back flat across.
    l2: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.65, hipTwist: -0.25, lean: -0.08, crouch: -0.06, step: 0.3, back: 0.32, headPitch: -0.05 })),
        K(twinHits[0] - 0.12, B({ ...body, twist: -0.25, hipTwist: 0.15, lean: 0.26, crouch: -0.18, step: 0.5, back: 0.34 })),
        K(twinHits[0], B({ ...body, twist: 0.25, hipTwist: 0.2, lean: 0.5, crouch: -0.3, step: 0.6, back: 0.36 })),
        K((twinHits[0] + twinHits[1]) / 2, B({ ...body, twist: 0.5, hipTwist: 0.1, lean: 0.5, crouch: -0.32, step: 0.62, back: 0.36 })),
        K(twinHits[1], B({ ...body, twist: -0.15, hipTwist: -0.15, lean: 0.48, crouch: -0.3, step: 0.64, back: 0.36 })),
        K(1.1, B({ ...body, twist: -0.7, hipTwist: -0.2, lean: 0.4, crouch: -0.3, step: 0.64, back: 0.36, headPitch: 0.08 })),
      ],
      main: twin,
      impacts: twinHits,
      chamber: -0.1,
      end: 1.1,
      fx: [fx(twinHits[0], 'sparkle', 'tip', 0.6), fx(twinHits[1], 'sparkle', 'tip', 0.8), fx(twinHits[1], 'dust', 'feet', 0.7)],
    }),
    // Heaven Splitter: up on the toes into jodan, weight on the back foot; one stamping step and the
    // whole body pitches over a vertical cut down the centre line, folding down after it
    h: mv({
      keys: [
        K(-0.2, B({ ...body, twist: -0.08, lean: -0.3, crouch: 0.02, step: 0.16, back: 0.28, headPitch: -0.16 })),
        K(heavenHit * 0.55, B({ ...body, twist: 0.0, lean: 0.1, crouch: -0.06, step: 0.42, back: 0.3 }), { hop: 0.12 }),
        K(heavenHit, B({ ...body, twist: 0.05, lean: 0.52, crouch: -0.3, step: 0.62, back: 0.36 }), { hop: 0 }),
        K(1.05, B({ ...body, twist: 0.05, lean: 0.8, crouch: -0.42, step: 0.64, back: 0.36, headPitch: 0.12 })),
      ],
      main: heaven,
      impacts: [heavenHit],
      start: 0,
      chamber: -0.16,
      fx: [fx(heavenHit, 'stomp', 'feet', 1), fx(heavenHit, 'flashline', 'tip', 1.1)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Gatotsu: the body turns side-on and sinks into a long lunge, the blade drawn back level beside
    // the right temple with the left hand laid along it; then everything fires down the line, the
    // chest pitching nearly flat over the front knee and both arms at full stretch
    sp: mv({
      keys: [
        K(-0.4, B({ ...body, twist: -0.5, lean: 0.02, crouch: -0.14, step: 0.32, back: 0.32 })),
        K(-0.1, B({ ...body, twist: -0.85, hipTwist: -0.4, lean: 0.12, crouch: -0.36, step: 0.56, back: 0.62, width: 0.12, headPitch: 0.06 })),
        K(0.45, B({ ...body, twist: -0.6, hipTwist: -0.1, lean: 0.6, crouch: -0.4, step: 0.86, back: 0.66 })),
        K(gatotsuHit, B({ ...body, twist: -0.4, hipTwist: 0.0, lean: 0.95, crouch: -0.46, step: 0.95, back: 0.7, headPitch: -0.2 })),
        K(1.08, B({ ...body, twist: -0.4, hipTwist: 0.0, lean: 0.92, crouch: -0.46, step: 0.95, back: 0.7, headPitch: -0.2 })),
      ],
      main: gatotsu,
      impacts: [gatotsuHit],
      start: -0.4,
      chamber: -0.1,
      end: 1.08,
      ghosts: [0.0, 0.88],
      fx: [fx(-0.1, 'dust', 'feet', 1.2), fx(gatotsuHit, 'flashline', 'tip', 1.5, '#ffffff'), fx(gatotsuHit, 'spiral', 'tip', 1.1), fx(gatotsuHit, 'sparkle', 'tip', 1.2, '#ff8a6a')],
      trail: { life: 0.22, glow: 0.9 },
    }),
    // Iai Flash: out of the scabbard in one rising horizontal stroke, one-handed, the whole body
    // driving through on a long step; a streak of light and a gust of petals, a chiburi, then guard.
    ia: mv({
      keys: [
        K(-0.1, stanceBody),
        K(drawHit * 0.5, B({ ...body, crouch: -0.26, lean: 0.42, twist: 0.35, step: 0.5, back: 0.4 })),
        K(drawHit + 0.1, B({ ...body, crouch: -0.24, lean: 0.46, twist: 0.2, step: 0.7, back: 0.46 })),
        K(1.0, B({ ...body, crouch: -0.28, lean: 0.4, twist: -0.6, step: 0.72, back: 0.46, headPitch: 0.05 })),
        K(1.3, B({ ...body, crouch: -0.2, lean: 0.24, twist: -0.3, step: 0.5, back: 0.36, headPitch: 0.08 })),
      ],
      main: seq([
        [-0.2, 1.05, draw],
        // chiburi: the blood flicked off with a snap of the wrist, ending low on the right like the guard
        [1.05, 1.3, arc([-0.34, 0.4, 0.24], 0.15, [[-0.95, 0.42, -0.1], [-0.75, -0.4, 0.45], [-0.35, -0.3, 0.88]])],
      ], 0.06),
      free: track([
        [-0.1, [0.08, 0.09, 0.16]],
        [drawHit, [0.36, 0.22, -0.14]],
        [1.3, SAYA],
      ]),
      impacts: [drawHit],
      rest: 1.3,
      settle: 0.55,
      ghosts: [0.1, 0.8],
      fx: [fx(0.0, 'dust', 'feet', 1.1), fx(drawHit, 'flashline', 'tip', 1.6, '#ffffff'), fx(drawHit + 0.05, 'petals', 'tip', 1.2), fx(1.25, 'sparkle', 'tip', 0.4, '#ffffff')],
      trail: { life: 0.28, glow: 1 },
    }),
    // Ground Wheel: the second heavy. Out of the fold the hips wind hard left and both arms trail the
    // blade low behind; the hips fire first and the left foot steps through as it wheels flat across.
    h1: mv({
      keys: [
        K(-0.08, B({ ...body, twist: 0.95, hipTwist: 0.35, lean: 0.5, crouch: -0.42, step: 0.5, back: 0.4, width: 0.16 })),
        K(wheelHit - 0.15, B({ ...body, twist: 0.45, hipTwist: -0.12, lean: 0.5, crouch: -0.38, step: 0.56, back: 0.38, width: 0.15 })),
        K(wheelHit, B({ ...body, front: 'L', twist: -0.2, hipTwist: -0.25, lean: 0.48, crouch: -0.3, step: 0.62, back: 0.36 })),
        K(1.0, B({ ...body, front: 'L', twist: -0.8, hipTwist: -0.3, lean: 0.22, crouch: -0.14, step: 0.56, back: 0.32, headPitch: -0.08 })),
      ],
      main: wheel,
      impacts: [wheelHit],
      start: 0,
      chamber: -0.06,
      travel: 0.3,
      fx: [fx(wheelHit - 0.06, 'dust', 'feet', 0.9), fx(wheelHit, 'quake', 'tip', 0.7), fx(wheelHit, 'flashline', 'tip', 1.1)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Crescent Moon: the finisher. A full turn to the left on the lead foot, the blade trailing low;
    // it rises up the right side as the turn closes, a leap, and the kesa cleave lands on a stamp.
    h2: mv({
      keys: [
        K(0, B({ ...body, front: 'L', twist: -0.6, lean: 0.2, crouch: -0.14, step: 0.52, back: 0.3 }), { spin: 0 }),
        K(0.16, B({ ...body, front: 'L', twist: -0.3, lean: 0.26, crouch: -0.32, step: 0.3, back: 0.3, width: 0.16 }), { spin: 0.3 }),
        K(hitAt(crescent, 2), B({ ...body, front: 'R', twist: -0.55, hipTwist: -0.2, lean: 0.0, crouch: -0.12, step: 0.4, back: 0.36 }), { spin: 0.82, hop: 0.12 }),
        K(crescentTop, B({ ...body, front: 'R', twist: -0.5, hipTwist: -0.1, lean: -0.15, crouch: -0.04, step: 0.48, back: 0.38, headPitch: -0.12 }), { spin: 0.95, hop: 0.3 }),
        K(crescentHit, B({ ...body, twist: 0.2, hipTwist: 0.2, lean: 0.62, crouch: -0.38, step: 0.68, back: 0.38 }), { spin: 1, hop: 0 }),
        K(1.06, B({ ...body, twist: 0.5, hipTwist: 0.25, lean: 0.78, crouch: -0.46, step: 0.7, back: 0.38, headPitch: 0.12 }), { spin: 1 }),
      ],
      main: crescent,
      impacts: [crescentHit],
      start: 0,
      chamber: 0.12,
      flow: 1.5,
      blendIn: 0.35,
      ghosts: [0.15, crescentHit + 0.05],
      fx: [
        fx(0.05, 'dust', 'feet', 0.9),
        fx(0.3, 'whirl', 'root', 0.9, '#e8f4ff'),
        fx(crescentHit, 'stomp', 'feet', 1.1),
        fx(crescentHit, 'flashline', 'tip', 1.3),
        fx(crescentHit + 0.05, 'petals', 'tip', 1),
      ],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Gale Step: out of the dash, running low with the blade trailed behind the right hip in one hand;
    // the point whips round and the arm shoots it out level, the right shoulder driving through and
    // the left arm flung back
    dl: mv({
      keys: [
        K(-0.3, B({ ...body, twist: -0.65, hipTwist: -0.2, crouch: -0.24, lean: 0.55, step: 0.45, back: 0.45 })),
        K(0.5, B({ ...body, twist: 0.1, hipTwist: 0.1, crouch: -0.3, lean: 0.6, step: 0.72, back: 0.55 })),
        K(galeHit, B({ ...body, twist: 0.6, hipTwist: 0.2, crouch: -0.36, lean: 0.7, step: 0.9, back: 0.6, width: 0.1 })),
        K(1.08, B({ ...body, twist: 0.6, hipTwist: 0.2, crouch: -0.36, lean: 0.66, step: 0.9, back: 0.6, width: 0.1 })),
      ],
      main: gale,
      free: track([
        [-0.3, [0.24, 0.26, 0.24]],
        [0.5, [0.34, 0.3, 0.06]],
        [galeHit, [0.5, 0.36, -0.2]],
      ]),
      impacts: [galeHit],
      start: -0.3,
      chamber: -0.3,
      end: 1.08,
      fx: [fx(-0.2, 'dust', 'feet', 1), fx(galeHit, 'spiral', 'tip', 1), fx(galeHit, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.16, glow: 0.4 },
    }),
    // Thunder Draw: the dash heavy. Hasso on the run, then both hands drop the blade to the right and
    // drive one flat passing cut at the waist; the body folds right over the front knee as it carries
    // round, a white streak hanging behind
    dh: mv({
      keys: [
        K(-0.15, B({ ...body, twist: -0.8, hipTwist: -0.3, crouch: -0.24, lean: 0.4, step: 0.45, back: 0.45 })),
        K(thunderHit - 0.15, B({ ...body, twist: -0.4, hipTwist: 0.1, crouch: -0.34, lean: 0.55, step: 0.75, back: 0.55 })),
        K(thunderHit, B({ ...body, twist: 0.3, hipTwist: 0.25, crouch: -0.34, lean: 0.58, step: 0.9, back: 0.6, width: 0.12 })),
        K(1.05, B({ ...body, twist: 0.9, hipTwist: 0.3, crouch: -0.5, lean: 0.85, step: 0.9, back: 0.6, headPitch: 0.1 })),
      ],
      main: thunder,
      impacts: [thunderHit],
      chamber: -0.03,
      ghosts: [-0.1, 0.85],
      fx: [fx(-0.05, 'dust', 'feet', 1.2), fx(thunderHit, 'flashline', 'tip', 1.6, '#fff6c0'), fx(thunderHit, 'sparkle', 'tip', 1, '#fff6c0'), fx(thunderHit + 0.12, 'dust', 'feet', 1)],
      trail: { life: 0.26, glow: 0.9 },
    }),
    // Fading Cut: the rear foot slides back and the hips sink onto it while one hand rips the blade
    // up from low on the right to high on the left, the chest leaning in over it
    bl: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.6, hipTwist: -0.2, lean: 0.26, crouch: -0.18, step: 0.3, back: 0.3 })),
        K(fadingHit - 0.15, B({ ...body, twist: -0.2, hipTwist: 0.1, lean: 0.2, crouch: -0.28, step: 0.32, back: 0.5 })),
        K(fadingHit, B({ ...body, twist: 0.25, hipTwist: 0.15, lean: 0.16, crouch: -0.34, step: 0.32, back: 0.64, headPitch: 0.06 })),
        K(1.05, B({ ...body, twist: 0.65, hipTwist: 0.2, lean: -0.14, crouch: -0.3, step: 0.3, back: 0.68, headPitch: -0.1 })),
      ],
      main: fading,
      free: track([
        [-0.1, [0.2, 0.26, 0.26]],
        [fadingHit, [0.46, 0.28, -0.1]],
        [1.05, [0.4, 0.2, -0.16]],
      ]),
      impacts: [fadingHit],
      start: 0,
      chamber: -0.08,
      travel: 0.4,
      fx: [fx(fadingHit - 0.08, 'dust', 'feet', 0.8), fx(fadingHit, 'sparkle', 'tip', 0.6)],
    }),
    // Mountain Wall: the blade hung point-down in front as a wall, then wheeled up past the left
    // shoulder on a hop back, and cut down from high on the left as the weight lands on the back foot
    bh: mv({
      keys: [
        K(0, B({ ...body, twist: 0.25, lean: 0.05, crouch: -0.12, step: 0.26, back: 0.3 })),
        K(hitAt(wall, 2), B({ ...body, twist: 0.5, hipTwist: 0.2, lean: -0.15, crouch: -0.04, step: 0.24, back: 0.55, headPitch: -0.1 }), { hop: 0.06 }),
        K(wallTop, B({ ...body, twist: 0.35, hipTwist: 0.1, lean: -0.2, crouch: -0.04, step: 0.22, back: 0.68, headPitch: -0.12 }), { hop: 0.08 }),
        K(wallHit, B({ ...body, twist: -0.2, hipTwist: -0.15, lean: 0.4, crouch: -0.36, step: 0.3, back: 0.62 }), { hop: 0 }),
        K(1.05, B({ ...body, twist: -0.4, hipTwist: -0.2, lean: 0.46, crouch: -0.4, step: 0.3, back: 0.62, headPitch: 0.1 })),
      ],
      main: wall,
      impacts: [wallHit],
      start: 0,
      chamber: hitAt(wall, 2),
      travel: 0.3,
      fx: [fx(wallTop, 'dust', 'feet', 0.9), fx(wallHit, 'stomp', 'feet', 0.8), fx(wallHit, 'flashline', 'tip', 1.1)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Swallow Dive: in the air the torso coils left with the blade held out backhand in one hand; the
    // whole body whips a turn to the right and the arm flings the blade flat across the front
    jl: mv({
      keys: [
        K(0, B({ ...body, twist: 0.7, hipTwist: 0.2, lean: 0.12, crouch: -0.14 }), { spin: 0 }),
        K(hitAt(dive, 1), B({ ...body, twist: 0.4, hipTwist: -0.1, lean: 0.28, crouch: -0.18 }), { spin: -0.62 }),
        K(diveHit, B({ ...body, twist: -0.15, hipTwist: -0.2, lean: 0.4, crouch: -0.2 }), { spin: -0.95 }),
        K(1.05, B({ ...body, twist: -0.7, hipTwist: -0.25, lean: 0.36, crouch: -0.18 }), { spin: -1.02 }),
      ],
      main: dive,
      free: track([
        [0, [0.2, 0.3, 0.28]],
        [diveHit, [0.48, 0.4, -0.1]],
        [1.05, [0.44, 0.36, -0.14]],
      ]),
      impacts: [diveHit],
      start: 0,
      chamber: 0.1,
      flow: 1.3,
      blendIn: 0.4,
      fx: [fx(diveHit, 'sparkle', 'tip', 0.7), fx(diveHit, 'flashline', 'tip', 0.8)],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Falling Star: a forward somersault in the air with the blade in jodan, then straight down
    // through the target and into the ground, landing folded over the front knee
    jh: mv({
      keys: [
        K(0, B({ ...body, twist: 0.0, lean: 0.25, crouch: -0.2, headPitch: 0.1 }), { flip: 0 }),
        K(0.2, B({ ...body, twist: 0.0, lean: 0.4, crouch: -0.24 }), { flip: 0.45, hop: 0.4 }),
        K(hitAt(star, 2), B({ ...body, twist: 0.02, lean: -0.05, crouch: -0.06, step: 0.36, headPitch: -0.14 }), { flip: 0.94, hop: 0.2 }),
        K(starHit, B({ ...body, twist: 0.03, lean: 0.55, crouch: -0.3, step: 0.5, back: 0.32 }), { flip: 1, hop: 0 }),
        K(starGround, B({ ...body, twist: 0.03, lean: 0.75, crouch: -0.48, step: 0.56, back: 0.36 })),
        K(1.06, B({ ...body, twist: 0.03, lean: 0.78, crouch: -0.5, step: 0.56, back: 0.36, headPitch: 0.12 })),
      ],
      main: star,
      impacts: [starHit],
      start: 0,
      chamber: 0.1,
      flow: 1.4,
      blendIn: 0.35,
      end: 1.02,
      fx: [fx(starHit, 'flashline', 'tip', 1.2), fx(starGround, 'shockwave', 'tip', 0.9), fx(starGround, 'stomp', 'feet', 1)],
      trail: { life: 0.22, glow: 0.6 },
    }),
  },
  // Ring entrance: still under the hat with a hand on the hilt; the thumb frees the guard and the
  // eyes come up; then one flat draw at the opponent, zanshin, the chiburi, and the low guard
  entrance: mv({
    keys: [
      K(0, B({ ...body, twist: 0.18, crouch: -0.04, lean: 0.1, step: 0.1, back: 0.1, width: 0.1, headPitch: 0.45 })),
      K(0.1, B({ ...body, twist: 0.18, crouch: -0.05, lean: 0.12, step: 0.1, back: 0.1, width: 0.1, headPitch: 0.45 })),
      K(0.19, B({ ...body, twist: 0.22, crouch: -0.13, lean: 0.16, step: 0.28, back: 0.24, width: 0.12, headPitch: 0.42 })),
      K(0.4, B({ ...body, twist: 0.22, crouch: -0.14, lean: 0.17, step: 0.28, back: 0.24, width: 0.12, headPitch: 0.42 })),
      K(0.47, B({ ...body, twist: 0.24, crouch: -0.15, lean: 0.17, step: 0.28, back: 0.24, width: 0.12, headPitch: 0.36 })),
      K(0.62, B({ ...body, twist: 0.24, crouch: -0.15, lean: 0.12, step: 0.28, back: 0.24, width: 0.12, headPitch: -0.04 })),
      K(0.73, B({ ...body, twist: 0.28, crouch: -0.19, lean: 0.16, step: 0.28, back: 0.26, width: 0.12, headPitch: -0.04 })),
      K(0.795, B({ ...body, twist: -0.5, crouch: -0.26, lean: 0.3, step: 0.5, back: 0.34, width: 0.12, headPitch: 0.02 })),
      K(0.835, B({ ...body, twist: -0.56, crouch: -0.27, lean: 0.28, step: 0.5, back: 0.34, width: 0.12, headPitch: 0.02 })),
      K(entFlick, B({ ...body, twist: -0.4, crouch: -0.22, lean: 0.2, step: 0.44, back: 0.32, headPitch: 0.05 })),
      K(0.96, body),
    ],
    main: entrance,
    free: track([
      [0.0, ENT_SAYA],
      [0.735, ENT_SAYA],
      [0.79, [0.24, 0.1, -0.02]],
      [0.86, [0.22, 0.12, 0.02]],
      [0.96, SAYA],
    ]),
    start: 0,
    rest: 1,
    lead: 0,
    ghosts: [0.735, 0.8],
    fx: [
      fx(0.02, 'dust', 'feet', 0.6),
      fx(0.05, 'petals', 'root', 0.9),
      fx(0.19, 'dust', 'feet', 0.7),
      fx(0.45, 'sparkle', 'main', 0.5, '#ffffff'),
      fx(0.75, 'dust', 'feet', 1),
      fx(hitAt(entrance, 3, 4), 'flashline', 'tip', 1.6, '#ffffff'),
      fx(hitAt(entrance, 3, 4) + 0.006, 'petals', 'tip', 1.3),
      fx(entFlick, 'sparkle', 'tip', 0.5, '#ffffff'),
    ],
    trail: { life: 0.28, glow: 1 },
  }),
};
