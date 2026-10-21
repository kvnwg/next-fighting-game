/**
 * Lancer, spear. Reach and rhythm: thrusts slide the shaft through the front hand, the third light
 * spins the spear over the head before it cuts, the heavy corkscrews in on a gust of wind, whips
 * its tail round at the shins and leaps into a turn that comes down like thunder, the dash attacks
 * lunge and charge like a lance, the backstep attacks fend and wheel while giving ground, the air
 * attacks stoop and slam, the special sweeps the ground in two full turns, and the Pole Vault flips
 * them backwards out of reach. Lightning crackles along the spear through every heavy.
 */
import { B, K, P, Style, X, arc, circle, fx, hitAt, line, mv, seq, track } from '../author';
import type { V3 } from '../author';

const ST = -0.7; // left side forward, the spear along the body line
const body = B({ front: 'L', step: 0.33, back: 0.3, width: 0.14, crouch: -0.13, lean: 0.08, twist: ST });
const FLAT: V3 = [1, 0, 0];

/** A thrust along the body's line (body space): the right hand drives up the shaft toward the left. */
const thrust = (from: V3, to: V3, d0: V3, d1: V3, g0: number, g1: number, roll = 0) => line(from, to, d0, d1, FLAT, g0, g1, { body: true, roll });

const jab = thrust([-0.24, 0.2, -0.12], [-0.14, 0.3, 0.44], [0.04, 0.12, 1], [0.01, 0.07, 1], 0.6, 0.14);
const fang = seq(
  [
    [-0.1, 0.5, thrust([-0.24, 0.2, -0.12], [-0.15, 0.3, 0.38], [0.04, 0.12, 1], [0.02, 0.08, 1], 0.6, 0.18)],
    [0.5, 0.68, thrust([-0.15, 0.3, 0.38], [-0.2, 0.26, 0.08], [0.02, 0.08, 1], [0.03, 0.1, 1], 0.18, 0.42)],
    [0.68, 1.07, thrust([-0.2, 0.26, 0.08], [-0.13, 0.33, 0.48], [0.03, 0.1, 1], [0.0, 0.05, 1], 0.42, 0.1)],
  ],
  0.05,
);

// Wheel Strike: the spear spun flat over the head (one hand), then caught in both and brought down
// across them from the upper left
const wheel = seq(
  [
    [-1.4, -0.25, arc([-0.28, 0.88, 0.12], -0.25, circle([0, 0.1, 1], [-1, 0.1, 0], 1.75, 0, 16), NaN)],
    [-0.25, 1.07, arc([-0.1, 0.58, 0.24], -0.25, [[0.85, 0.45, 0.05], [0.6, 0.55, 0.6], [0.02, 0.28, 1], [-0.55, -0.35, 0.75], [-0.7, -0.6, 0.35]], 0.45)],
  ],
  0.1,
);

const BOLT = '#ffe27a'; // the golden lightning that crackles along the spear through the heavies

// Dragon Tail: the spear drawn back out of the lunge and coiled high over the right shoulder, then
// whipped down and round at shin height, right to left
const tail = seq(
  [
    [-1.0, -0.35, arc([-0.1, 0.3, 0.2], -0.25, [[0.02, 0.1, 1], [-0.7, 0.45, 0.5], [-0.85, 0.32, -0.42]], 0.5, { body: true })],
    [-0.35, 1.1, arc([-0.06, 0.16, 0.22], -0.25, [[-0.85, 0.32, -0.42], [-0.92, -0.26, 0.22], [-0.55, -0.36, 0.72], [0.0, -0.3, 1], [0.66, -0.28, 0.66], [0.9, -0.2, 0.05]], 0.5, { body: true })],
  ],
  0.1,
);
const tailHit = hitAt(tail, 3, 1);

// Thunder Spiral: the spear held level while the body leaps through a full turn, rising over the
// head and back on the way round, then brought straight down through them
const spiral = seq(
  [
    [-1.4, -0.25, arc([0.0, 0.32, 0.22], -0.3, [[0.85, -0.22, 0.3], [0.5, 0.0, 0.85], [0.25, 0.45, 0.85], [0.05, 0.95, 0.2], [0.0, 0.55, -0.83]], 0.6, { body: true, pivot1: [-0.04, 0.6, 0.12] })],
    [-0.25, 1.1, arc([-0.04, 0.6, 0.12], -0.3, [[0.0, 0.55, -0.83], [0.0, 1, 0.02], [0.0, 0.5, 0.87], [0.0, -0.02, 1], [0.0, -0.4, 0.92]], 0.6, { body: true, pivot1: [-0.04, 0.28, 0.36] })],
  ],
  0.08,
);
const spiralHit = hitAt(spiral, 3, 1);

// Lightning Lunge: driven out two-handed, then the front hand lets go and the rear arm shoots the
// spear out to its full length
const lightning = seq(
  [
    [-0.4, 0.5, thrust([-0.26, 0.12, -0.12], [-0.16, 0.24, 0.36], [0.04, 0.1, 1], [0.02, 0.06, 1], 0.6, 0.1)],
    [0.5, 1.0, line([-0.16, 0.24, 0.36], [-0.12, 0.32, 0.72], [0.02, 0.06, 1], [0.01, 0.05, 1], FLAT, NaN, NaN, { body: true })],
  ],
  0.1,
);

// Storm Charge: the spear couched under the right arm like a lance and carried level through the
// run, then the whole body drives it home
const charge = seq(
  [
    [-1.0, 0.3, thrust([-0.26, 0.14, -0.04], [-0.24, 0.16, 0.06], [0.03, 0.04, 1], [0.03, 0.03, 1], 0.5, 0.5)],
    [0.3, 1.0, thrust([-0.24, 0.16, 0.06], [-0.14, 0.26, 0.5], [0.03, 0.03, 1], [0.01, 0.05, 1], 0.5, 0.18)],
  ],
  0.08,
);

// Fending Jab: the hands up at the shoulder, the point jabbed out at their face and snapped back
const fend = seq(
  [
    [-0.2, 0.85, thrust([-0.22, 0.4, -0.16], [-0.14, 0.48, 0.36], [0.03, -0.04, 1], [0.02, 0.0, 1], 0.6, 0.16)],
    [0.85, 1.07, thrust([-0.14, 0.48, 0.36], [-0.18, 0.44, 0.12], [0.02, 0.0, 1], [0.03, -0.02, 1], 0.16, 0.36)],
  ],
  0.05,
);

// Bolt Wheel: the spear wheeled round at the right side, hands near the middle of the shaft, over
// the top and back, under, and up again through them from low on the right
const boltWheel = seq([[-1.4, 1.1, arc([-0.3, 0.56, 0.05], -0.3, circle([0, 0, 1], [0.7, 0.71, 0], 1.25, 0, 10), 0.6, { body: true })]]);
const boltHit = hitAt(boltWheel, 8);

// Falcon Strike: the spear raised overhand above the head, point angled down, and stooped into them
const falcon = thrust([-0.16, 0.86, -0.2], [-0.1, 0.6, 0.4], [0.02, -0.26, 1], [0.0, -0.36, 1], 0.62, 0.16);

// Thunderfall: both hands high, the spear swung up and back over the head, then slammed down
// blade-first in front
const thunderfall = seq(
  [
    [-1.0, -0.15, arc([-0.06, 0.7, 0.1], -0.3, [[0.02, 0.15, 1], [0.0, 0.9, 0.45], [0.0, 0.62, -0.78]], 0.62, { body: true })],
    [-0.15, 1.1, arc([-0.06, 0.7, 0.1], -0.3, [[0.0, 0.62, -0.78], [0.0, 1, 0.0], [0.0, 0.3, 0.95], [0.0, -0.38, 0.92], [0.0, -0.5, 0.87]], 0.62, { body: true, pivot1: [-0.06, 0.26, 0.4] })],
  ],
  0.08,
);
const fallHit = hitAt(thunderfall, 3, 1);

// Entrance: planted upright beside the kneeling body where the bolt struck, wrenched out, twirled
// once in both hands across the front, then raised and its butt spike slammed into the floor
const UPRIGHT: V3 = [0.04, 1, 0.08];
const IN_PLANT: V3 = [-0.42, 0.28, 0.22];
const IN_LIFT: V3 = [-0.36, 0.6, 0.3];
const IN_RAISE: V3 = [-0.3, 0.5, 0.32];
const IN_SLAM: V3 = [-0.3, 0.04, 0.32];
const IN_STAND: V3 = [-0.32, -0.08, 0.3];
// the twirl's plane leans back, so the blade passes low in front and high behind the head
const TWIRL_UP: V3 = [0, 0.7, -0.72];
const entranceSpear = seq(
  [
    [0.0, 0.34, line(IN_PLANT, [-0.42, 0.27, 0.22], UPRIGHT, UPRIGHT, FLAT, NaN, NaN, { body: true })],
    [0.34, 0.42, line(IN_PLANT, IN_LIFT, UPRIGHT, [0.1, 1, 0.1], FLAT, NaN, NaN, { body: true })],
    [0.42, 0.47, line(IN_LIFT, [-0.1, 0.41, 0.52], [0.1, 1, 0.1], TWIRL_UP, FLAT, 0.3, 0.6, { body: true })],
    [0.47, 0.65, arc([-0.1, 0.62, 0.3], -0.3, circle(TWIRL_UP, [-1, 0, 0], 1, 0, 12), 0.6, { body: true })],
    [0.65, 0.71, line([-0.1, 0.41, 0.52], IN_RAISE, TWIRL_UP, UPRIGHT, FLAT, 0.6, 0.6, { body: true })],
    [0.71, 0.76, line(IN_RAISE, IN_SLAM, UPRIGHT, UPRIGHT, FLAT, 0.6, 0.6, { body: true })],
    [0.76, 0.82, line(IN_SLAM, IN_STAND, UPRIGHT, UPRIGHT, FLAT, 0.6, NaN, { body: true })],
    [0.82, 0.9, line(IN_STAND, [-0.32, -0.08, 0.3], UPRIGHT, UPRIGHT, FLAT, NaN, NaN, { body: true })],
    [0.9, 1.0, line([-0.32, -0.08, 0.3], [-0.22, 0.2, -0.05], UPRIGHT, [0.05, 0.12, 1], FLAT, NaN, 0.55, { body: true })],
  ],
  0.025,
);

export const spear: Style = {
  axis: 'x',
  offAxis: 'x',
  trail: { light: '#e0fbff', heavy: '#2ce8f5', special: '#ff4a3a' },
  sparks: ['#ffffff', '#bff8ff', '#2ce8f5'],
  guard: P(body, X([-0.22, 0.2, -0.05], [0.05, 0.12, 1], FLAT, 'x', 0.55, ST)),
  block: P(B({ ...body, crouch: -0.18, twist: -0.3 }), X([-0.3, 0.46, 0.3], [1, 0.08, 0.05], [0, 1, 0.3], 'x', 0.58, -0.3)),
  moves: {
    // Viper Jab: quick, from the hip, the shaft sliding through the front hand
    l0: mv({
      keys: [
        K(-0.1, B({ ...body, twist: ST - 0.1, lean: 0.06, step: 0.3 })),
        K(0.85, B({ ...body, twist: ST + 0.15, lean: 0.3, crouch: -0.2, step: 0.46 })),
        K(1.05, B({ ...body, twist: ST + 0.15, lean: 0.3, crouch: -0.2, step: 0.46 })),
      ],
      main: jab,
      impacts: [0.85],
      end: 1.0,
      fx: [fx(0.85, 'sparkle', 'tip', 0.6)],
    }),
    // Twin Fang: in, half back, in again, the second higher than the first
    l1: mv({
      keys: [
        K(-0.1, B({ ...body, twist: ST - 0.1, lean: 0.06, step: 0.3 })),
        K(0.4, B({ ...body, twist: ST + 0.1, lean: 0.26, crouch: -0.18, step: 0.42 })),
        K(0.6, B({ ...body, twist: ST, lean: 0.18, crouch: -0.16, step: 0.4 })),
        K(0.95, B({ ...body, twist: ST + 0.18, lean: 0.32, crouch: -0.2, step: 0.5 })),
        K(1.1, B({ ...body, twist: ST + 0.18, lean: 0.32, crouch: -0.2, step: 0.5 })),
      ],
      main: fang,
      impacts: [0.4, 0.95],
      end: 1.05,
      fx: [fx(0.4, 'sparkle', 'tip', 0.5), fx(0.95, 'sparkle', 'tip', 0.7)],
    }),
    // Wheel Strike: the spear spun once flat over the head, then brought down across them
    l2: mv({
      keys: [
        K(-1.4, B({ ...body, twist: ST + 0.2, lean: -0.05, crouch: -0.1, step: 0.28 })),
        K(-0.6, B({ ...body, twist: -0.1, lean: -0.12, crouch: -0.08, step: 0.28, headPitch: -0.1 })),
        K(-0.15, B({ ...body, twist: 0.25, lean: -0.05, crouch: -0.12, step: 0.3 })),
        K(0.55, B({ ...body, twist: -0.15, lean: 0.3, crouch: -0.22, step: 0.46, back: 0.34 })),
        K(1.07, B({ ...body, twist: -0.5, lean: 0.36, crouch: -0.24, step: 0.48, back: 0.34 })),
      ],
      main: wheel,
      impacts: [0.45],
      start: -1.4,
      chamber: -1.2,
      flow: 1.3,
      blendIn: 0.35,
      fx: [fx(-0.9, 'whirl', 'main', 0.6, '#bff8ff'), fx(0.45, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Dragon Fang: coiled deep, then a lunge with the spear corkscrewing in on a spiral of wind
    h: mv({
      keys: [
        K(-0.2, B({ ...body, twist: ST - 0.35, lean: 0.02, crouch: -0.28, step: 0.26, back: 0.42 })),
        K(0.4, B({ ...body, twist: ST - 0.05, lean: 0.3, crouch: -0.3, step: 0.6, back: 0.48 })),
        K(0.85, B({ ...body, twist: ST + 0.2, lean: 0.42, crouch: -0.32, step: 0.78, back: 0.55 })),
        K(1.05, B({ ...body, twist: ST + 0.2, lean: 0.42, crouch: -0.32, step: 0.78, back: 0.55 })),
      ],
      main: thrust([-0.3, 0.16, -0.3], [-0.12, 0.3, 0.5], [0.06, 0.2, 1], [0.0, 0.08, 1], 0.7, 0.12, 2),
      impacts: [0.85],
      start: -0.2,
      chamber: -0.06,
      end: 1.0,
      fx: [fx(0.2, 'dust', 'feet', 1.0), fx(0.82, 'spiral', 'tip', 1.2), fx(0.85, 'flashline', 'tip', 1.2), fx(0.85, 'sparkle', 'tip', 1.0)],
      trail: { life: 0.2, glow: 0.6 },
    }),
    // Whirlwind: down low, the spear level at the ankles, two full turns; jump it
    sp: mv({
      keys: [
        K(-1.6, B({ ...body, twist: ST, crouch: -0.3, lean: 0.2, step: 0.3, back: 0.34, width: 0.2 }), { spin: 0 }),
        K(-1.2, B({ ...body, twist: -0.2, crouch: -0.38, lean: 0.3, step: 0.2, back: 0.24, width: 0.24 }), { spin: 0 }),
        K(0.55, B({ ...body, twist: -0.1, crouch: -0.4, lean: 0.32, step: 0.2, back: 0.24, width: 0.24 }), { spin: -1 }),
        K(1.6, B({ ...body, twist: -0.1, crouch: -0.32, lean: 0.24, step: 0.24, back: 0.26, width: 0.22 }), { spin: -2 }),
        K(1.9, B({ ...body, twist: ST, crouch: -0.18, lean: 0.12, step: 0.3, back: 0.3 }), { spin: -2 }),
      ],
      // one hand, the spear low and level in front so the turns sweep it round at ankle height, the
      // free arm flung out for balance
      main: line([-0.26, 0.12, 0.26], [-0.26, 0.12, 0.26], [-0.05, -0.28, 1], [-0.05, -0.28, 1], [0, 1, 0], NaN, NaN, { body: true }),
      free: track([
        [-1.6, [0.34, 0.2, 0.2]],
        [-1.1, [0.78, 0.5, 0.05]],
        [1.5, [0.78, 0.5, 0.05]],
        [1.9, [0.34, 0.2, 0.2]],
      ]),
      impacts: [0.45],
      start: -1.6,
      chamber: -1.2,
      flow: 1.3,
      blendIn: 0.3,
      end: 1.6,
      rest: 1.9,
      settle: 0.6,
      fx: [
        fx(-1.0, 'whirl', 'root', 1.0, '#bff8ff'),
        fx(0.0, 'quake', 'tip', 0.8),
        fx(0.45, 'quake', 'tip', 1.2),
        fx(0.45, 'whirl', 'root', 1.3, '#2ce8f5'),
        fx(1.0, 'quake', 'tip', 0.8),
      ],
      trail: { life: 0.26, glow: 0.7 },
    }),
    // Dragon Tail: out of the lunge the spear is drawn back and coiled over the right shoulder, then the
    // hips unwind and it whips down and round at the shins
    h1: mv({
      keys: [
        K(-1.0, B({ ...body, twist: ST + 0.15, lean: 0.36, crouch: -0.3, step: 0.7, back: 0.52 })),
        K(-0.4, B({ ...body, twist: ST - 0.55, hipTwist: -0.3, lean: 0.12, crouch: -0.24, step: 0.42, back: 0.4 })),
        K(tailHit, B({ ...body, twist: ST + 0.5, hipTwist: 0.25, lean: 0.4, crouch: -0.44, step: 0.5, back: 0.48, width: 0.2 })),
        K(1.1, B({ ...body, twist: ST + 0.9, hipTwist: 0.35, lean: 0.34, crouch: -0.42, step: 0.5, back: 0.48, width: 0.2 })),
      ],
      main: tail,
      impacts: [tailHit],
      start: -1.0,
      chamber: -0.9,
      flow: 1.25,
      blendIn: 0.3,
      end: 1.1,
      fx: [fx(0.2, 'quake', 'tip', 0.8), fx(tailHit, 'quake', 'tip', 1.2), fx(tailHit, 'sparkle', 'tip', 0.9, BOLT), fx(0.75, 'quake', 'tip', 0.8)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    // Thunder Spiral: a leap into a full turn with the spear held level, rising over the head on the way
    // round, and on landing brought straight down through them with a thunderclap
    h2: mv({
      keys: [
        K(-1.4, B({ ...body, twist: 0.2, crouch: -0.38, lean: 0.3, step: 0.4, back: 0.4, width: 0.18 }), { spin: 0, hop: 0 }),
        K(-1.1, B({ ...body, twist: 0.0, crouch: -0.42, lean: 0.22, step: 0.32, back: 0.34 }), { spin: 0.12, hop: 0 }),
        K(-0.75, B({ ...body, twist: -0.3, crouch: -0.04, lean: -0.04, step: 0.18, back: 0.18, width: 0.1 }), { spin: 0.55, hop: 0.42 }),
        K(-0.38, B({ ...body, twist: ST, crouch: -0.24, lean: -0.06, step: 0.3, back: 0.3 }), { spin: 1, hop: 0.04 }),
        K(-0.2, B({ ...body, twist: ST + 0.1, crouch: -0.3, lean: -0.14, step: 0.36, back: 0.36 }), { hop: 0 }),
        K(spiralHit, B({ ...body, twist: ST + 0.25, crouch: -0.42, lean: 0.4, step: 0.56, back: 0.46, width: 0.18 })),
        K(1.1, B({ ...body, twist: ST + 0.25, crouch: -0.42, lean: 0.44, step: 0.56, back: 0.46, width: 0.18 })),
      ],
      main: spiral,
      impacts: [spiralHit],
      start: -1.4,
      chamber: -1.3,
      flow: 1.3,
      blendIn: 0.3,
      end: 1.1,
      settle: 0.45,
      ghosts: [-1.1, -0.3],
      fx: [
        fx(-1.0, 'whirl', 'root', 1.0, BOLT),
        fx(-0.3, 'stomp', 'feet', 0.8),
        fx(spiralHit, 'flashline', 'tip', 1.2, BOLT),
        fx(spiralHit, 'shockwave', 'tip', 1.0, BOLT),
        fx(spiralHit, 'sparkle', 'tip', 1.2, BOLT),
      ],
      trail: { life: 0.26, glow: 0.8 },
    }),
    // Lightning Lunge: low out of the dash, driven out two-handed, then the front hand lets go and the
    // rear arm shoots the spear out its full length for the last of the reach
    dl: mv({
      keys: [
        K(-0.4, B({ ...body, twist: ST - 0.05, crouch: -0.3, lean: 0.34, step: 0.4, back: 0.4 })),
        K(0.5, B({ ...body, twist: ST + 0.15, crouch: -0.32, lean: 0.42, step: 0.6, back: 0.52 })),
        K(0.85, B({ ...body, twist: ST + 0.4, crouch: -0.34, lean: 0.5, step: 0.78, back: 0.62, side: -0.06 })),
        K(1.05, B({ ...body, twist: ST + 0.4, crouch: -0.34, lean: 0.5, step: 0.78, back: 0.62, side: -0.06 })),
      ],
      main: lightning,
      free: track([[0.5, [0.1, 0.22, 0.48]], [0.85, [0.5, 0.3, -0.3]]]),
      impacts: [0.85],
      start: -0.4,
      chamber: -0.3,
      blendIn: 0.4,
      end: 1.0,
      fx: [fx(-0.3, 'dust', 'feet', 0.8), fx(0.85, 'flashline', 'tip', 1.1, BOLT), fx(0.85, 'sparkle', 'tip', 0.8)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Storm Charge: the spear couched under the arm like a lance, a running charge out of the dash, and
    // the whole body driven in behind the point
    dh: mv({
      keys: [
        K(-1.0, B({ ...body, twist: ST + 0.1, crouch: -0.22, lean: 0.3, step: 0.35, back: 0.35 }), { hop: 0 }),
        K(-0.6, B({ ...body, front: 'R', twist: ST + 0.1, crouch: -0.18, lean: 0.4, step: 0.34, back: 0.34 }), { hop: 0.08 }),
        K(-0.2, B({ ...body, twist: ST + 0.1, crouch: -0.24, lean: 0.42, step: 0.4, back: 0.38 }), { hop: 0 }),
        K(0.25, B({ ...body, front: 'R', twist: ST + 0.1, crouch: -0.18, lean: 0.46, step: 0.38, back: 0.4 }), { hop: 0.08 }),
        K(0.85, B({ ...body, twist: ST + 0.25, crouch: -0.34, lean: 0.52, step: 0.85, back: 0.6 }), { hop: 0 }),
        K(1.1, B({ ...body, twist: ST + 0.25, crouch: -0.34, lean: 0.5, step: 0.85, back: 0.6 })),
      ],
      main: charge,
      impacts: [0.85],
      start: -1.0,
      chamber: -0.9,
      flow: 1.1,
      blendIn: 0.3,
      end: 1.05,
      ghosts: [-0.3, 0.95],
      fx: [
        fx(-0.6, 'dust', 'feet', 0.7),
        fx(-0.2, 'dust', 'feet', 0.7),
        fx(0.25, 'dust', 'feet', 0.8),
        fx(0.85, 'stomp', 'feet', 0.9),
        fx(0.85, 'flashline', 'tip', 1.4, BOLT),
        fx(0.85, 'sparkle', 'tip', 1.1, BOLT),
      ],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Fending Jab: giving ground, the weight back and the rear foot stepping away, a high jab at their
    // face to keep them off, snapped straight back
    bl: mv({
      keys: [
        K(-0.2, B({ ...body, twist: ST - 0.05, lean: 0.04, step: 0.32 })),
        K(0.3, B({ ...body, twist: ST - 0.1, lean: -0.04, crouch: -0.18, step: 0.3, back: 0.5 })),
        K(0.85, B({ ...body, twist: ST + 0.1, lean: -0.2, crouch: -0.26, step: 0.2, back: 0.52, headPitch: 0.06 })),
        K(1.07, B({ ...body, twist: ST + 0.05, lean: -0.22, crouch: -0.28, step: 0.16, back: 0.48, headPitch: 0.06 })),
      ],
      main: fend,
      impacts: [0.85],
      start: -0.2,
      end: 1.07,
      fx: [fx(0.3, 'dust', 'feet', 0.5), fx(0.85, 'sparkle', 'tip', 0.6)],
    }),
    // Bolt Wheel: stepping back, the spear wheeled once round at the right side, over the top and
    // under, and on the way up again it rises through them from low on the right
    bh: mv({
      keys: [
        K(-1.4, B({ ...body, twist: ST - 0.15, crouch: -0.16, step: 0.32 })),
        K(-0.6, B({ ...body, twist: ST - 0.3, crouch: -0.18, lean: -0.04, step: 0.3, back: 0.44 })),
        K(boltHit, B({ ...body, twist: ST + 0.25, crouch: -0.3, lean: -0.1, step: 0.24, back: 0.56 })),
        K(1.1, B({ ...body, twist: ST + 0.4, crouch: -0.3, lean: -0.14, step: 0.22, back: 0.52, headPitch: -0.06 })),
      ],
      main: boltWheel,
      impacts: [boltHit],
      start: -1.4,
      chamber: -1.3,
      flow: 1.25,
      blendIn: 0.3,
      end: 1.1,
      fx: [fx(-0.7, 'whirl', 'main', 0.7, BOLT), fx(-0.2, 'dust', 'feet', 0.7), fx(boltHit, 'flashline', 'tip', 1.0, BOLT), fx(boltHit, 'sparkle', 'tip', 1.0, BOLT)],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Falcon Strike: in the air, the spear raised overhand above the head, and the body stoops after the
    // point as it drives down into them
    jl: mv({
      keys: [
        K(-0.5, B({ ...body, twist: ST - 0.1, crouch: -0.05, lean: -0.08, headPitch: 0.1 }), { hop: 0.08, flip: 0 }),
        K(0.85, B({ ...body, twist: ST + 0.15, crouch: -0.12, lean: 0.32, headPitch: 0.25, step: 0.4 }), { hop: 0, flip: 0.025 }),
        K(1.05, B({ ...body, twist: ST + 0.15, crouch: -0.12, lean: 0.32, headPitch: 0.25, step: 0.4 })),
      ],
      main: falcon,
      impacts: [0.85],
      start: -0.5,
      chamber: -0.4,
      blendIn: 0.4,
      travel: 0.3,
      end: 1.0,
      fx: [fx(0.85, 'sparkle', 'tip', 0.7), fx(0.85, 'flashline', 'tip', 0.8)],
      trail: { life: 0.18, glow: 0.3 },
    }),
    // Thunderfall: in the air the spear goes up and back over the head in both hands, the back arched,
    // and the whole body comes down with it, the blade slamming into the ground in front
    jh: mv({
      keys: [
        K(-1.0, B({ ...body }), { hop: 0 }),
        K(-0.4, B({ ...body, twist: ST + 0.3, crouch: 0.0, lean: -0.22, step: 0.26, back: 0.26, headPitch: -0.1 }), { hop: 0.28 }),
        K(fallHit, B({ ...body, twist: ST + 0.35, crouch: -0.5, lean: 0.45, step: 0.55, back: 0.5, width: 0.2 }), { hop: 0 }),
        K(1.1, B({ ...body, twist: ST + 0.35, crouch: -0.5, lean: 0.45, step: 0.55, back: 0.5, width: 0.2 })),
      ],
      main: thunderfall,
      impacts: [fallHit],
      start: -1.0,
      chamber: -0.3,
      travel: 0.3,
      blendIn: 0.35,
      end: 1.1,
      fx: [fx(fallHit, 'shockwave', 'tip', 1.1, BOLT), fx(fallHit, 'stomp', 'feet', 1.0), fx(fallHit, 'sparkle', 'tip', 1.0, BOLT)],
      trail: { life: 0.24, glow: 0.7 },
    }),
  },
  // Pole Vault: the butt planted, a backflip over the spear, and a landing well out of reach
  leap: mv({
    keys: [
      K(0.0, B({ ...body, crouch: -0.3, lean: 0.2 }), { flip: 0, hop: 0 }),
      K(0.18, B({ ...body, crouch: -0.05, lean: -0.1 }), { flip: -0.08, hop: 0.35 }),
      K(0.5, B({ ...body, crouch: 0.0, lean: -0.1 }), { flip: -0.5, hop: 1.1 }),
      K(0.82, B({ ...body, crouch: -0.05, lean: 0.05 }), { flip: -0.95, hop: 0.45 }),
      K(1.0, B({ ...body, crouch: -0.3, lean: 0.25 }), { flip: -1, hop: 0 }),
    ],
    main: seq(
      [
        // the spear planted point-up behind the hands, then carried tight through the flip
        [0.0, 0.3, line([-0.15, 0.4, 0.3], [-0.2, 0.55, 0.15], [0.1, -0.85, 0.5], [0.1, 0.9, 0.3], FLAT, 0.4, 0.4)],
        [0.3, 1.0, line([-0.2, 0.55, 0.15], [-0.22, 0.25, 0.0], [0.1, 0.9, 0.3], [0.05, 0.12, 1], FLAT, 0.4, 0.55)],
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
  // Entrance: revealed kneeling where the lightning struck, head bowed and the spear planted beside
  // him; he wrenches it free, twirls it once across his front, and slams the butt spike down
  entrance: mv({
    keys: [
      K(0.0, B({ ...body, twist: -0.35, crouch: -0.5, lean: 0.34, step: 0.34, back: 0.36, width: 0.22, headPitch: 0.45 })),
      K(0.3, B({ ...body, twist: -0.35, crouch: -0.51, lean: 0.36, step: 0.34, back: 0.36, width: 0.22, headPitch: 0.5 })),
      K(0.37, B({ ...body, twist: -0.3, crouch: -0.3, lean: 0.14, step: 0.3, back: 0.3, width: 0.18, headPitch: 0.1 })),
      K(0.44, B({ ...body, twist: -0.2, crouch: -0.14, lean: 0.0, step: 0.26, back: 0.26, width: 0.16, headPitch: -0.04 })),
      K(0.56, B({ ...body, twist: -0.05, crouch: -0.16, lean: 0.02, step: 0.26, back: 0.26, width: 0.16 })),
      K(0.65, B({ ...body, twist: -0.25, crouch: -0.14, lean: 0.0, step: 0.26, back: 0.26, width: 0.16 })),
      K(0.71, B({ ...body, twist: -0.3, crouch: -0.06, lean: -0.08, step: 0.24, back: 0.24, width: 0.16, headPitch: -0.06 })),
      K(0.76, B({ ...body, twist: -0.3, crouch: -0.22, lean: 0.12, step: 0.28, back: 0.28, width: 0.2, headPitch: 0.04 })),
      K(0.82, B({ ...body, twist: -0.3, crouch: -0.03, lean: -0.06, step: 0.22, back: 0.22, width: 0.16, headPitch: -0.12 })),
      K(0.9, B({ ...body, twist: -0.3, crouch: -0.03, lean: -0.06, step: 0.22, back: 0.22, width: 0.16, headPitch: -0.12 })),
      K(1.0, B({ ...body })),
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
