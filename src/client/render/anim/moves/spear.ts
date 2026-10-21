/**
 * Lancer, glaive. A broad blade on a long pole, swung with the whole body: the right hand rides up
 * the shaft by the blade and the left drives the butt, so every blow is a cut as much as a thrust.
 * A stepping thrust, a low thrust that flicks up through them, a flat sweep at the shoulders, a
 * cleave from high over the right shoulder to the floor, a backhand reaping the shins, a spinning
 * leap that brings the blade down like thunder, a long lunge out of the dash and a charge that
 * drags the blade and rips it up through them, a backhand snap and a wheel down over the top while
 * giving ground, a spinning cut and a cleave into the floor from the air, the overhead twirl that
 * drops into two full turns at the ankles, and the Pole Vault out of reach. Lightning crackles along
 * the glaive through every heavy.
 */
import { B, K, N, P, Style, X, arc, circle, fx, line, mv, seq, track } from '../author';
import type { BodyPose, Motion, V3 } from '../author';

// right foot forward, the body turned left so the right shoulder leads, the glaive pointed at
// their face from the left hip
const ST = 0.9;
const body = B({ front: 'R', step: 0.32, back: 0.3, width: 0.15, crouch: -0.16, lean: 0.1, twist: ST });
const b = (o: Partial<BodyPose>) => B({ ...body, ...o });
const UPE: V3 = [0, 1, 0];
/** half the spread of the hands on the shaft */
const H = 0.23;

/** where the right (blade-side) hand sits for hands centred on `mid` along `dir`, `h` either side */
const front = (mid: V3, dir: V3, h: number): V3 => {
  const d = N(dir);
  return [mid[0] + d.x * h, mid[1] + d.y * h, mid[2] + d.z * h];
};

/**
 * The glaive keyed along s in body space: [s, the hands' midpoint, the shaft's direction, half the
 * hands' spread, the edge for a straight move]. The right hand holds up the shaft by the blade and
 * the left lower down by the butt. Between keys whose directions differ the shaft turns about the
 * hands (its edge leading); between keys that point the same way it slides straight (thrusts).
 * Held before the first key and after the last.
 */
type GK = [number, V3, V3, number?, V3?];
const glaive = (ks: GK[], blend = 0.05): Motion => {
  const parts: [number, number, Motion][] = [];
  const h = (k: GK) => k[3] ?? H;
  const hold = (k: GK, from: number, to: number, edge: V3) => {
    const r = front(k[1], k[2], h(k));
    parts.push([from, to, line(r, r, k[2], k[2], edge, -2 * h(k), -2 * h(k), { body: true })]);
  };
  let edge: V3 = ks[0][4] ?? UPE;
  hold(ks[0], ks[0][0] - 10, ks[0][0], edge);
  for (let i = 1; i < ks.length; i++) {
    const a = ks[i - 1];
    const c = ks[i];
    const da = N(a[2]);
    const dc = N(c[2]);
    if (da.angleTo(dc) < 0.2) {
      edge = c[4] ?? a[4] ?? edge;
      parts.push([a[0], c[0], line(front(a[1], a[2], h(a)), front(c[1], c[2], h(c)), a[2], c[2], edge, -2 * h(a), -2 * h(c), { body: true })]);
    } else {
      parts.push([a[0], c[0], arc(a[1], h(a), [a[2], c[2]], -2 * h(a), { body: true, pivot1: c[1] })]);
      // the edge the arc ends on (its direction of travel), carried into whatever holds after it
      const t = da.clone().cross(dc).normalize().cross(dc).normalize();
      edge = [t.x, t.y, t.z];
    }
  }
  const last = ks[ks.length - 1];
  hold(last, last[0], last[0] + 10, edge);
  return seq(parts, blend);
};

// the guard: the left fist low by the left hip on the butt, the right forward up the shaft, the
// blade raised at their face
const G_MID: V3 = [0.17, 0.24, 0.3];
const G_DIR: V3 = [-0.12, 0.18, 1];
const G: GK = [0, G_MID, G_DIR];
const at = (s: number, k: GK): GK => [s, k[1], k[2], k[3], k[4]];

const BOLT = '#ffe27a'; // the golden lightning that crackles along the glaive through the heavies

// Piercing Step: drawn back to the hip, then driven out at the chest as the front foot stamps, the
// left hand sliding up the shaft behind it
const pierce = glaive([
  at(-0.3, G),
  [-0.08, [0.18, 0.2, 0.05], [-0.2, 0.12, 1]],
  [0.45, [0.05, 0.47, 0.28], [-0.02, 0.04, 1], 0.16],
  [1.07, [0.05, 0.48, 0.3], [-0.02, 0.04, 1], 0.16],
]);

// Fang and Rise: a low thrust at the hips, and out of it the blade flicked up through their chest
const fangRise = glaive([
  at(-0.3, G),
  [-0.08, [0.19, 0.17, 0.08], [-0.15, -0.04, 1]],
  [0.4, [0.3, 0.16, 0.22], [-0.03, -0.1, 1], 0.17],
  [0.9, [-0.06, 0.39, 0.12], [-0.03, 0.1, 1], 0.2],
  [1.1, [0.14, 0.47, 0.3], [-0.03, 0.9, 0.6], 0.2],
]);

// Horizon Sweep: the blade dropped down behind the right side, brought round at shoulder height and
// swept flat across them, right to left
const horizon = glaive([
  at(-0.9, G),
  [-0.5, [-0.14, 0.21, 0.14], [-0.45, -0.45, -0.6]],
  [-0.12, [-0.2, 0.42, 0.13], [-0.85, 0.1, -0.5]],
  [0.15, [-0.05, 0.45, 0.37], [-0.85, 0.12, 0.5]],
  [0.45, [-0.04, 0.47, 0.18], [0.05, 0.08, 1]],
  [1.07, [0.13, 0.44, 0.27], [0.75, 0.05, 0.6]],
]);

// Crescent Cleave: raised up the right side and cocked high over the shoulder, then cleaved down
// across them from the upper right to the floor at their left
const H_END: GK = [1.07, [0.22, 0.21, 0.45], [0.5, -0.4, 0.75]];
const cleave = glaive([
  at(-1.0, G),
  [-0.55, [-0.07, 0.54, 0.2], [-0.3, 0.95, 0.1]],
  [-0.12, [-0.13, 0.61, 0.01], [-0.35, 0.7, -0.6]],
  [0.05, [-0.07, 0.58, 0.38], [-0.2, 0.9, 0.35]],
  [0.22, [-0.08, 0.64, 0.26], [-0.12, 0.6, 0.8]],
  [0.45, [0.05, 0.5, 0.25], [0.1, 0.1, 1]],
  H_END,
]);

// Reaping Sweep: from the floor at the left the blade is pulled back low behind the left hip, then
// whipped round backhand at the shins, left to right
const H1_END: GK = [1.07, [-0.18, 0.1, 0.39], [-0.9, -0.22, 0.38]];
const reap = glaive([
  at(-1.0, H_END),
  [-0.12, [0.38, 0.35, 0.19], [0.85, -0.3, -0.25]],
  [0.15, [0.12, 0.31, 0.39], [0.75, -0.3, 0.6]],
  [0.45, [-0.07, 0.33, 0.27], [0.0, -0.32, 1]],
  [0.75, [0.06, 0.26, 0.47], [-0.6, -0.3, 0.75]],
  H1_END,
]);

// Thunder Wheel: carried level at the right through a leaping turn, rising over the shoulder and
// cocked high behind the head, then brought straight down through them into the floor
const thunder = glaive([
  at(-1.4, H1_END),
  [-0.9, [-0.17, 0.4, 0.27], [-0.9, 0.2, 0.2]],
  [-0.45, [-0.1, 0.6, 0.1], [-0.55, 0.75, -0.3]],
  [-0.12, [-0.07, 0.68, 0.16], [-0.2, 0.55, -0.8]],
  [0.1, [0.05, 0.58, 0.37], [-0.1, 0.9, 0.4]],
  [0.25, [-0.01, 0.6, 0.27], [-0.05, 0.55, 0.85]],
  [0.45, [0.06, 0.48, 0.28], [0.05, 0.0, 1]],
  [1.07, [0.08, 0.24, 0.54], [0.12, -0.38, 0.92]],
]);

// Serpent Lunge: drawn back low, then shot out level at their hips at full stretch
const serpent = glaive([
  at(-0.4, G),
  [-0.1, [0.22, 0.1, 0.05], [-0.15, 0.02, 1]],
  [0.45, [0.1, 0.38, 0.22], [-0.02, 0.0, 1], 0.15],
  [1.07, [0.1, 0.38, 0.24], [-0.02, -0.02, 1], 0.15],
]);

// Rising Dragon: the blade dragged low behind on the right through the charge, swung round at the
// floor and ripped up through them to the upper left
const dragon = glaive([
  at(-1.0, G),
  [-0.6, [-0.16, 0.13, 0.16], [-0.45, -0.3, -0.8]],
  [-0.12, [-0.02, 0.08, 0.28], [-0.7, -0.35, 0.2]],
  [0.45, [-0.06, 0.43, 0.17], [-0.05, 0.25, 1]],
  [1.07, [-0.01, 0.66, 0.29], [0.3, 0.9, 0.3]],
]);

// Parting Snap: cocked up over the left shoulder and snapped down backhand across their face
const snap = glaive([
  at(-0.2, G),
  [-0.13, [0.21, 0.54, 0.28], [0.15, 0.95, 0.25]],
  [-0.06, [0.1, 0.56, 0.13], [0.45, 0.8, -0.4]],
  [0.45, [-0.16, 0.48, 0.13], [-0.05, 0.12, 1]],
  [0.75, [0.12, 0.37, 0.2], [-0.45, -0.15, 0.9]],
  [1.07, [-0.04, 0.36, 0.29], [-0.6, -0.4, 0.7]],
]);

// Wheel Retreat: the glaive wheeled at the right side, dipped ahead, under and back, up behind and
// over the top, and down on them
const wheel = glaive([
  at(-1.4, G),
  [-1.0, [-0.32, 0.26, 0.2], [-0.4, -0.5, 0.75]],
  [-0.7, [-0.29, 0.3, 0.06], [-0.4, -0.65, -0.6]],
  [-0.4, [-0.28, 0.51, 0.04], [-0.35, 0.6, -0.7]],
  [-0.12, [-0.22, 0.6, 0.2], [-0.2, 0.98, 0.1]],
  [0.15, [-0.22, 0.59, 0.29], [-0.1, 0.7, 0.7]],
  [0.45, [-0.09, 0.48, 0.15], [0.05, 0.12, 1]],
  [1.07, [-0.06, 0.29, 0.37], [0.4, -0.35, 0.85]],
]);

// Swallow Spin: swung round level to the right, then carried round with the turn and across them
const swallow = glaive([
  at(-0.6, G),
  [-0.15, [-0.14, 0.37, 0.17], [-0.9, 0.08, -0.35]],
  [0.45, [-0.07, 0.43, 0.18], [0.0, 0.0, 1]],
  [1.07, [0.1, 0.36, 0.27], [0.75, -0.08, 0.6]],
]);

// Skyfall Cleave: both hands high, the blade back over the head, then the whole body jackknifes
// after it and it comes straight down into the floor
const skyfall = glaive([
  at(-1.0, G),
  [-0.5, [0.05, 0.6, 0.26], [-0.1, 0.95, 0.25]],
  [-0.12, [0.09, 0.66, 0.09], [-0.05, 0.6, -0.8]],
  [0.05, [0.01, 0.62, 0.34], [-0.05, 0.95, 0.3]],
  [0.22, [-0.08, 0.64, 0.43], [-0.03, 0.6, 0.8]],
  [0.45, [0.08, 0.46, 0.3], [0.0, 0.05, 1]],
  [1.07, [0.03, 0.23, 0.54], [0.0, -0.4, 0.92]],
]);

// Whirlwind: twirled one-handed flat over the head, dropped to the ankles, and swept round low
const whirl = seq(
  [
    [-1.6, -0.85, arc([-0.3, 1.0, 0.12], -0.15, circle([0, 0, 1], [-1, -0.28, 0], 1.25, 0, 14), NaN)],
    [-0.85, -0.45, line([-0.3, 0.85, 0.2], [-0.28, 0.14, 0.26], [0, 0, 1], [-0.05, -0.28, 1], UPE, NaN, NaN, { body: true })],
    [-0.45, 1.9, line([-0.28, 0.14, 0.26], [-0.28, 0.14, 0.26], [-0.05, -0.28, 1], [-0.05, -0.28, 1], UPE, NaN, NaN, { body: true })],
  ],
  0.08,
);

// Entrance: planted upright beside the kneeling body where the bolt struck, wrenched out, twirled
// once in both hands across the front, then raised and its butt spike slammed into the floor
const UPRIGHT: V3 = [0.04, 1, 0.08];
const IN_PLANT: V3 = [-0.42, 0.28, 0.22];
const IN_LIFT: V3 = [-0.36, 0.6, 0.3];
const IN_RAISE: V3 = [-0.3, 0.62, 0.32];
const IN_SLAM: V3 = [-0.3, 0.16, 0.32];
const IN_STAND: V3 = [-0.32, 0.04, 0.3];
// the twirl's plane leans back, so the blade passes low in front and high behind the head
const TWIRL_UP: V3 = [0, 0.7, -0.72];
const G_R = front(G_MID, G_DIR, H);
const entranceSpear = seq(
  [
    [0.0, 0.34, line(IN_PLANT, [-0.42, 0.27, 0.22], UPRIGHT, UPRIGHT, [1, 0, 0], NaN, NaN, { body: true })],
    [0.34, 0.42, line(IN_PLANT, IN_LIFT, UPRIGHT, [0.1, 1, 0.1], [1, 0, 0], NaN, NaN, { body: true })],
    [0.42, 0.47, line(IN_LIFT, [-0.1, 0.62, 0.42], [0.1, 1, 0.1], TWIRL_UP, [1, 0, 0], -0.3, -0.6, { body: true })],
    [0.47, 0.65, arc([-0.1, 0.5, 0.3], 0.3, circle(TWIRL_UP, [-1, 0, 0], 1, 0, 12), -0.6, { body: true })],
    [0.65, 0.71, line([-0.1, 0.62, 0.42], IN_RAISE, TWIRL_UP, UPRIGHT, [1, 0, 0], -0.6, -0.45, { body: true })],
    [0.71, 0.76, line(IN_RAISE, IN_SLAM, UPRIGHT, UPRIGHT, [1, 0, 0], -0.45, -0.45, { body: true })],
    [0.76, 0.82, line(IN_SLAM, IN_STAND, UPRIGHT, UPRIGHT, [1, 0, 0], -0.45, NaN, { body: true })],
    [0.82, 0.9, line(IN_STAND, [-0.32, 0.04, 0.3], UPRIGHT, UPRIGHT, [1, 0, 0], NaN, NaN, { body: true })],
    [0.9, 1.0, line([-0.32, 0.04, 0.3], G_R, UPRIGHT, G_DIR, UPE, NaN, -2 * H, { body: true })],
  ],
  0.025,
);

export const spear: Style = {
  axis: 'x',
  offAxis: 'x',
  trail: { light: '#e0fbff', heavy: '#2ce8f5', special: '#ff4a3a' },
  sparks: ['#ffffff', '#bff8ff', '#2ce8f5'],
  guard: P(body, X(G_R, G_DIR, UPE, 'x', -2 * H, ST)),
  // the shaft held level across the chest in both fists, the blade out to the right
  block: P(b({ crouch: -0.2, twist: 0.2, lean: 0.05, step: 0.28 }), X([-0.3, 0.55, 0.34], [-1, 0.2, 0.06], [0, 1, 0.3], 'x', -0.52, 0.2)),
  moves: {
    // Piercing Step: weight back and the right shoulder drawn away, then the front foot stamps in
    // and the turn of the body drives the blade out at their chest
    l0: mv({
      keys: [
        K(-0.3, body),
        K(-0.08, b({ twist: 0.35, hipTwist: -0.1, lean: -0.1, crouch: -0.24, step: 0.24, back: 0.46, headPitch: 0.06 })),
        K(0.45, b({ twist: 1.15, hipTwist: 0.55, lean: 0.5, crouch: -0.34, step: 0.72, back: 0.5 })),
        K(1.07, b({ twist: 1.15, hipTwist: 0.55, lean: 0.48, crouch: -0.34, step: 0.72, back: 0.5 })),
      ],
      main: pierce,
      impacts: [0.45],
      start: -0.3,
      fx: [fx(0.4, 'dust', 'feet', 0.5), fx(0.45, 'sparkle', 'tip', 0.6)],
    }),
    // Fang and Rise: down into a deep lunge for a thrust at the hips, then rising out of it as the
    // blade flicks up through their chest
    l1: mv({
      keys: [
        K(-0.3, body),
        K(-0.08, b({ twist: 0.4, hipTwist: -0.1, crouch: -0.34, lean: 0.08, step: 0.26, back: 0.46 })),
        K(0.4, b({ twist: 1.05, hipTwist: 0.5, crouch: -0.44, lean: 0.55, step: 0.72, back: 0.52, width: 0.17 })),
        K(0.9, b({ twist: 1.1, hipTwist: 0.55, crouch: -0.24, lean: 0.3, step: 0.72, back: 0.5 })),
        K(1.1, b({ twist: 1.15, hipTwist: 0.55, crouch: -0.18, lean: 0.15, step: 0.7, back: 0.48, headPitch: -0.1 })),
      ],
      main: fangRise,
      impacts: [0.4, 0.9],
      start: -0.3,
      end: 1.1,
      fx: [fx(0.4, 'sparkle', 'tip', 0.5), fx(0.9, 'sparkle', 'tip', 0.7)],
    }),
    // Horizon Sweep: the blade dropped behind the right side and the whole body wound away to the
    // right, then the hips unwind and it is swept flat across them at the shoulders
    l2: mv({
      keys: [
        K(-0.9, body),
        K(-0.5, b({ twist: 0.2, hipTwist: -0.1, lean: 0.05, crouch: -0.2 })),
        K(-0.12, b({ twist: -0.7, hipTwist: -0.4, lean: 0.0, crouch: -0.22, step: 0.26, back: 0.42 })),
        K(0.45, b({ front: 'L', twist: 0.9, hipTwist: 0.45, lean: 0.35, crouch: -0.32, step: 0.6, back: 0.48 })),
        K(1.07, b({ front: 'L', twist: 1.5, hipTwist: 0.7, lean: 0.3, crouch: -0.3, step: 0.6, back: 0.48 })),
      ],
      main: horizon,
      impacts: [0.45],
      start: -0.9,
      chamber: -0.12,
      blendIn: 0.35,
      fx: [fx(0.35, 'dust', 'feet', 0.6), fx(0.45, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Crescent Cleave: wound right up with the blade cocked high over the shoulder and the back
    // arched, then a lunge onto the left foot that cleaves it down across them to the floor
    h: mv({
      keys: [
        K(-1.0, body),
        K(-0.55, b({ twist: 0.3, hipTwist: 0.0, lean: -0.05, crouch: -0.12 })),
        K(-0.12, b({ twist: -0.6, hipTwist: -0.35, lean: -0.18, crouch: -0.2, step: 0.26, back: 0.42, headPitch: -0.1 })),
        K(0.45, b({ front: 'L', twist: 0.85, hipTwist: 0.4, lean: 0.55, crouch: -0.4, step: 0.82, back: 0.56, width: 0.18 })),
        K(1.07, b({ front: 'L', twist: 1.2, hipTwist: 0.55, lean: 0.65, crouch: -0.44, step: 0.82, back: 0.56, width: 0.18 })),
      ],
      main: cleave,
      impacts: [0.45],
      start: -1.0,
      chamber: -0.12,
      blendIn: 0.35,
      fx: [fx(0.3, 'dust', 'feet', 0.8), fx(0.45, 'flashline', 'tip', 1.1, BOLT), fx(0.45, 'sparkle', 'tip', 1.0), fx(0.8, 'quake', 'tip', 0.8)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    // Reaping Sweep: out of the cleave the blade is pulled back low behind the left hip, the body
    // wound left, then the right foot steps through and it is whipped round backhand at the shins
    h1: mv({
      keys: [
        K(-1.0, b({ front: 'L', twist: 1.2, hipTwist: 0.55, lean: 0.65, crouch: -0.44, step: 0.82, back: 0.56, width: 0.18 })),
        K(-0.12, b({ front: 'L', twist: 1.5, hipTwist: 0.7, lean: 0.35, crouch: -0.34, step: 0.45, back: 0.45, width: 0.2 })),
        K(0.45, b({ twist: 0.5, hipTwist: 0.1, lean: 0.55, crouch: -0.5, step: 0.75, back: 0.55, width: 0.24 })),
        K(1.07, b({ twist: -0.2, hipTwist: -0.2, lean: 0.5, crouch: -0.48, step: 0.75, back: 0.55, width: 0.24 })),
      ],
      main: reap,
      impacts: [0.45],
      start: -1.0,
      chamber: -0.12,
      blendIn: 0.3,
      fx: [fx(0.3, 'quake', 'tip', 0.9), fx(0.45, 'quake', 'tip', 1.2), fx(0.45, 'sparkle', 'tip', 0.9, BOLT), fx(0.75, 'quake', 'tip', 0.8)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    // Thunder Wheel: a leap into a full turn to the right with the glaive carried round at the right,
    // rising over the shoulder on the way, and on landing brought straight down through them with a
    // thunderclap
    h2: mv({
      keys: [
        K(-1.4, b({ twist: -0.2, hipTwist: -0.2, lean: 0.5, crouch: -0.48, step: 0.75, back: 0.55, width: 0.24 }), { spin: 0, hop: 0 }),
        K(-1.1, b({ twist: -0.3, crouch: -0.42, lean: 0.25, step: 0.4, back: 0.4 }), { spin: -0.15, hop: 0 }),
        K(-0.7, b({ twist: -0.3, crouch: -0.08, lean: 0.05, step: 0.2, back: 0.2, width: 0.1 }), { spin: -0.6, hop: 0.4 }),
        K(-0.35, b({ twist: -0.4, crouch: -0.15, lean: -0.1, headPitch: -0.1 }), { spin: -1, hop: 0.2 }),
        K(-0.08, b({ twist: -0.1, lean: -0.22, crouch: -0.22, step: 0.36, back: 0.36 }), { hop: 0 }),
        K(0.45, b({ front: 'L', twist: 0.85, hipTwist: 0.4, lean: 0.62, crouch: -0.48, step: 0.8, back: 0.55, width: 0.2 })),
        K(1.07, b({ front: 'L', twist: 0.9, hipTwist: 0.45, lean: 0.66, crouch: -0.5, step: 0.8, back: 0.55, width: 0.2 })),
      ],
      main: thunder,
      impacts: [0.45],
      start: -1.4,
      chamber: -1.3,
      flow: 1.3,
      blendIn: 0.3,
      settle: 0.45,
      ghosts: [-1.1, -0.3],
      fx: [
        fx(-1.0, 'whirl', 'root', 1.0, BOLT),
        fx(-0.2, 'stomp', 'feet', 0.8),
        fx(0.45, 'flashline', 'tip', 1.2, BOLT),
        fx(0.45, 'sparkle', 'tip', 1.2, BOLT),
        fx(0.62, 'shockwave', 'tip', 1.1, BOLT),
        fx(0.62, 'bolt', 'tip', 0.8),
      ],
      trail: { life: 0.26, glow: 0.8 },
    }),
    // Whirlwind: the glaive twirled flat over the head in one hand, then down into a crouch with it
    // level at the ankles for two full turns; jump it
    sp: mv({
      keys: [
        K(-1.6, b({ crouch: -0.12, lean: -0.05, twist: 0.2 }), { spin: 0 }),
        K(-1.0, b({ crouch: -0.06, lean: -0.1, twist: -0.2, headPitch: -0.12 }), { spin: 0 }),
        K(-0.6, b({ twist: -0.2, crouch: -0.4, lean: 0.3, step: 0.2, back: 0.24, width: 0.24 }), { spin: -0.1 }),
        K(0.55, b({ twist: -0.1, crouch: -0.42, lean: 0.32, step: 0.2, back: 0.24, width: 0.24 }), { spin: -1 }),
        K(1.6, b({ twist: -0.1, crouch: -0.34, lean: 0.24, step: 0.24, back: 0.26, width: 0.22 }), { spin: -2 }),
        K(1.9, b({ crouch: -0.18, lean: 0.12 }), { spin: -2 }),
      ],
      main: whirl,
      // the free arm thrown up and out for balance through the twirl and the turns
      free: track([
        [-1.6, [0.3, 0.2, 0.2]],
        [-1.2, [0.6, 0.62, 0.1]],
        [-0.6, [0.78, 0.5, 0.05]],
        [1.5, [0.78, 0.5, 0.05]],
        [1.9, [0.34, 0.2, 0.2]],
      ]),
      impacts: [0.45],
      start: -1.6,
      chamber: -1.5,
      flow: 1.3,
      blendIn: 0.3,
      end: 1.6,
      rest: 1.9,
      settle: 0.6,
      fx: [
        fx(-1.4, 'whirl', 'main', 0.8, '#bff8ff'),
        fx(-0.5, 'stomp', 'feet', 0.7),
        fx(-0.2, 'whirl', 'root', 1.0, '#bff8ff'),
        fx(0.0, 'quake', 'tip', 0.8),
        fx(0.45, 'quake', 'tip', 1.2),
        fx(0.45, 'whirl', 'root', 1.3, '#2ce8f5'),
        fx(1.0, 'quake', 'tip', 0.8),
      ],
      trail: { life: 0.26, glow: 0.7 },
    }),
    // Serpent Lunge: out of the dash down into the deepest lunge, the glaive drawn back low and shot
    // out level at their hips at full stretch
    dl: mv({
      keys: [
        K(-0.4, b({ twist: 0.8, crouch: -0.32, lean: 0.4, step: 0.45, back: 0.45 })),
        K(-0.1, b({ twist: 0.35, hipTwist: 0.05, crouch: -0.36, lean: 0.38, step: 0.45, back: 0.48 })),
        K(0.45, b({ twist: 1.2, hipTwist: 0.6, crouch: -0.5, lean: 0.65, step: 0.95, back: 0.65, width: 0.18 })),
        K(1.07, b({ twist: 1.2, hipTwist: 0.6, crouch: -0.5, lean: 0.62, step: 0.95, back: 0.65, width: 0.18 })),
      ],
      main: serpent,
      impacts: [0.45],
      start: -0.4,
      chamber: -0.1,
      blendIn: 0.4,
      ghosts: [-0.1, 0.5],
      fx: [fx(-0.3, 'dust', 'feet', 0.8), fx(0.45, 'flashline', 'tip', 1.1, BOLT), fx(0.45, 'sparkle', 'tip', 0.8)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Rising Dragon: a running charge with the blade dragged low behind on the right, swung round at
    // the floor and ripped up through them as the body rises behind it
    dh: mv({
      keys: [
        K(-1.0, b({ twist: 0.8, crouch: -0.25, lean: 0.35, step: 0.35, back: 0.35 }), { hop: 0 }),
        K(-0.8, b({ front: 'L', twist: 0.3, crouch: -0.2, lean: 0.42 }), { hop: 0.08 }),
        K(-0.6, b({ twist: 0.2, crouch: -0.28, lean: 0.45, step: 0.4, back: 0.4 }), { hop: 0 }),
        K(-0.36, b({ front: 'L', twist: 0.0, crouch: -0.24, lean: 0.42 }), { hop: 0.08 }),
        K(-0.12, b({ twist: -0.3, hipTwist: -0.25, crouch: -0.42, lean: 0.4, step: 0.6, back: 0.5 }), { hop: 0 }),
        K(0.45, b({ twist: 0.9, hipTwist: 0.45, crouch: -0.3, lean: 0.35, step: 0.85, back: 0.6 }), { hop: 0.05 }),
        K(1.07, b({ twist: 1.3, hipTwist: 0.6, crouch: -0.12, lean: 0.0, step: 0.75, back: 0.55, headPitch: -0.15 }), { hop: 0 }),
      ],
      main: dragon,
      impacts: [0.45],
      start: -1.0,
      chamber: -0.12,
      blendIn: 0.3,
      travel: 0.3,
      ghosts: [-0.4, 0.6],
      fx: [
        fx(-0.8, 'dust', 'feet', 0.7),
        fx(-0.36, 'dust', 'feet', 0.7),
        fx(-0.15, 'quake', 'tip', 0.9),
        fx(0.45, 'flashline', 'tip', 1.4, BOLT),
        fx(0.45, 'sparkle', 'tip', 1.1, BOLT),
      ],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Parting Snap: the rear foot steps away and the weight goes back while the blade is cocked over
    // the left shoulder and snapped down backhand across their face
    bl: mv({
      keys: [
        K(-0.2, body),
        K(-0.06, b({ twist: 1.4, hipTwist: 0.5, lean: -0.05, crouch: -0.2, back: 0.45 })),
        K(0.45, b({ twist: 0.6, hipTwist: 0.2, lean: 0.12, crouch: -0.3, step: 0.3, back: 0.6 })),
        K(1.07, b({ twist: 0.1, hipTwist: 0.0, lean: -0.15, crouch: -0.32, step: 0.22, back: 0.62, headPitch: 0.06 })),
      ],
      main: snap,
      impacts: [0.45],
      start: -0.2,
      chamber: -0.06,
      fx: [fx(0.2, 'dust', 'feet', 0.5), fx(0.45, 'sparkle', 'tip', 0.6)],
    }),
    // Wheel Retreat: stepping back, the glaive wheeled once at the right side, under and back, up and
    // over the top, and down on them as they follow
    bh: mv({
      keys: [
        K(-1.4, body),
        K(-1.0, b({ twist: 0.3, crouch: -0.2, back: 0.42, lean: 0.0 })),
        K(-0.7, b({ twist: 0.0, crouch: -0.2, back: 0.48, lean: 0.0 })),
        K(-0.4, b({ twist: -0.3, hipTwist: -0.2, crouch: -0.2, back: 0.52, lean: -0.05 })),
        K(-0.12, b({ twist: -0.3, hipTwist: -0.2, lean: -0.15, crouch: -0.22, back: 0.55, step: 0.28 })),
        K(0.45, b({ twist: 0.8, hipTwist: 0.35, lean: 0.25, crouch: -0.34, step: 0.26, back: 0.62 })),
        K(1.07, b({ twist: 1.1, hipTwist: 0.45, lean: -0.05, crouch: -0.36, step: 0.22, back: 0.62 })),
      ],
      main: wheel,
      impacts: [0.45],
      start: -1.4,
      chamber: -1.3,
      flow: 1.25,
      blendIn: 0.3,
      fx: [fx(-0.8, 'whirl', 'main', 0.7, BOLT), fx(-0.2, 'dust', 'feet', 0.7), fx(0.45, 'flashline', 'tip', 1.0, BOLT), fx(0.45, 'sparkle', 'tip', 1.0, BOLT)],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Swallow Spin: in the air the glaive swung round level to the right, and the body turns once
    // to the left after it, the blade coming round across them at the waist
    jl: mv({
      keys: [
        K(-0.6, b({ crouch: -0.1, lean: 0.0 }), { spin: 0, hop: 0.05 }),
        K(-0.15, b({ twist: -0.4, crouch: -0.05, lean: 0.05 }), { spin: 0.4, hop: 0.3 }),
        K(0.55, b({ twist: 0.8, hipTwist: 0.3, crouch: -0.12, lean: 0.35 }), { spin: 1, hop: 0.25 }),
        K(1.1, b({ twist: 1.4, hipTwist: 0.5, lean: 0.3, crouch: -0.2 }), { spin: 1, hop: 0.1 }),
      ],
      main: swallow,
      impacts: [0.45],
      start: -0.6,
      chamber: -0.5,
      flow: 1.2,
      blendIn: 0.3,
      fx: [fx(-0.3, 'whirl', 'root', 0.6, '#bff8ff'), fx(0.45, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.18, glow: 0.3 },
    }),
    // Skyfall Cleave: in the air both hands go high and the back arches, then the whole body
    // jackknifes after the blade as it comes straight down into the floor in front
    jh: mv({
      keys: [
        K(-1.0, body, { hop: 0, flip: 0 }),
        K(-0.5, b({ twist: 0.6, crouch: -0.05, lean: -0.1 }), { hop: 0.2 }),
        K(-0.12, b({ twist: 0.4, crouch: 0.0, lean: -0.3, headPitch: -0.15, step: 0.25, back: 0.25 }), { hop: 0.32, flip: -0.03 }),
        K(0.45, b({ twist: 0.85, hipTwist: 0.3, crouch: -0.5, lean: 0.7, step: 0.6, back: 0.5, width: 0.2 }), { hop: 0, flip: 0.03 }),
        K(1.1, b({ twist: 0.85, hipTwist: 0.3, crouch: -0.5, lean: 0.72, step: 0.6, back: 0.5, width: 0.2 }), { flip: 0 }),
      ],
      main: skyfall,
      impacts: [0.45],
      start: -1.0,
      chamber: -0.12,
      travel: 0.3,
      blendIn: 0.35,
      fx: [fx(0.45, 'stomp', 'feet', 1.0), fx(0.45, 'sparkle', 'tip', 1.0, BOLT), fx(0.6, 'shockwave', 'tip', 1.1, BOLT)],
      trail: { life: 0.24, glow: 0.7 },
    }),
  },
  // Pole Vault: the butt planted, a backflip over the glaive, and a landing well out of reach
  leap: mv({
    keys: [
      K(0.0, b({ crouch: -0.3, lean: 0.2 }), { flip: 0, hop: 0 }),
      K(0.18, b({ crouch: -0.05, lean: -0.1 }), { flip: -0.08, hop: 0.35 }),
      K(0.5, b({ crouch: 0.0, lean: -0.1 }), { flip: -0.5, hop: 1.1 }),
      K(0.82, b({ crouch: -0.05, lean: 0.05 }), { flip: -0.95, hop: 0.45 }),
      K(1.0, b({ crouch: -0.3, lean: 0.25 }), { flip: -1, hop: 0 }),
    ],
    main: seq(
      [
        // the glaive planted point-up behind the hands, then carried tight through the flip
        [0.0, 0.3, line([-0.15, 0.4, 0.3], [-0.2, 0.55, 0.15], [0.1, -0.85, 0.5], [0.1, 0.9, 0.3], UPE, -0.4, -0.4)],
        [0.3, 1.0, line([-0.2, 0.55, 0.15], G_R, [0.1, 0.9, 0.3], G_DIR, UPE, -0.4, -2 * H, { body: true })],
      ],
      0.08,
    ),
    impacts: [0.5],
    start: 0,
    rest: 1,
    ghosts: [0.1, 0.9],
    fx: [fx(0.05, 'dust', 'feet', 1.0), fx(0.98, 'dust', 'feet', 0.9)],
    trail: { life: 0.2, glow: 0.4 },
  }),
  // Entrance: revealed kneeling where the lightning struck, head bowed and the glaive planted beside
  // him; he wrenches it free, twirls it once across his front, and slams the butt spike down
  entrance: mv({
    keys: [
      K(0.0, b({ twist: -0.35, crouch: -0.5, lean: 0.34, step: 0.34, back: 0.36, width: 0.22, headPitch: 0.45 })),
      K(0.3, b({ twist: -0.35, crouch: -0.51, lean: 0.36, step: 0.34, back: 0.36, width: 0.22, headPitch: 0.5 })),
      K(0.37, b({ twist: -0.3, crouch: -0.3, lean: 0.14, step: 0.3, back: 0.3, width: 0.18, headPitch: 0.1 })),
      K(0.44, b({ twist: -0.2, crouch: -0.14, lean: 0.0, step: 0.26, back: 0.26, width: 0.16, headPitch: -0.04 })),
      K(0.56, b({ twist: -0.05, crouch: -0.16, lean: 0.02, step: 0.26, back: 0.26, width: 0.16 })),
      K(0.65, b({ twist: -0.25, crouch: -0.14, lean: 0.0, step: 0.26, back: 0.26, width: 0.16 })),
      K(0.71, b({ twist: -0.3, crouch: -0.06, lean: -0.08, step: 0.24, back: 0.24, width: 0.16, headPitch: -0.06 })),
      K(0.76, b({ twist: -0.3, crouch: -0.22, lean: 0.12, step: 0.28, back: 0.28, width: 0.2, headPitch: 0.04 })),
      K(0.82, b({ twist: -0.3, crouch: -0.03, lean: -0.06, step: 0.22, back: 0.22, width: 0.16, headPitch: -0.12 })),
      K(0.9, b({ twist: -0.3, crouch: -0.03, lean: -0.06, step: 0.22, back: 0.22, width: 0.16, headPitch: -0.12 })),
      K(1.0, body),
    ],
    main: entranceSpear,
    // the left hand braced on the knee, then on the shaft for the twirl and slam, then a fist at the hip
    free: track([
      [0.0, [0.22, -0.02, 0.36]],
      [0.34, [0.22, -0.02, 0.36]],
      [0.42, [0.28, 0.2, 0.2]],
      [0.8, [0.26, 0.2, 0.2]],
      [0.86, [0.28, 0.02, 0.04]],
      [0.95, [0.28, 0.02, 0.04]],
    ]),
    lead: 0,
    ghosts: [0.47, 0.65],
    fx: [
      fx(0.02, 'bolt', 'root', 1.4),
      fx(0.02, 'shockwave', 'root', 0.8, BOLT),
      fx(0.04, 'dust', 'feet', 1.4),
      fx(0.2, 'sparkle', 'tip', 0.6, BOLT),
      fx(0.38, 'dust', 'feet', 0.8),
      fx(0.5, 'sparkle', 'tip', 0.8, BOLT),
      fx(0.56, 'bolt', 'tip', 0.5),
      fx(0.62, 'sparkle', 'tip', 0.8, BOLT),
      fx(0.76, 'shockwave', 'feet', 1.2, BOLT),
      fx(0.76, 'bolt', 'root', 1.0),
      fx(0.77, 'embers', 'root', 0.8, BOLT),
    ],
  }),
};
