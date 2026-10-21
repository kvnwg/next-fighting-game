/**
 * Duelist, rapier. Fencing: side-on, right foot and right shoulder toward the opponent, the back
 * hand raised for balance. Each light attacks on a different line (a straight lunge, a disengage
 * that circles under the guard and comes in high, a whipping cut, a balestra with a flourish), the
 * heavy whirls through a pirouette into its thrust, the special salutes before it kills, and the
 * flèche runs them through.
 */
import { B, K, P, Style, X, arc, circle, cone, fx, hitAt, line, mv, seq, track } from '../author';
import type { V3 } from '../author';

const FT = 0.75; // the chest turned left: the right shoulder faces the opponent
const body = B({ front: 'R', step: 0.4, back: 0.32, width: 0.06, crouch: -0.16, lean: 0.04, twist: FT, hipTwist: 0.35 });
// the back hand (torso space): raised behind the head, or flung down behind the back leg in a lunge
const UP_HAND: V3 = [0.4, 0.78, -0.12];
const LOW_HAND: V3 = [0.42, 0.06, -0.22];
const MID_HAND: V3 = [0.48, 0.42, -0.26];
const DOWN: V3 = [0, -1, 0];

/** A lunge along the body's line (body space): from a chambered hand to full extension. */
const thrust = (from: V3, to: V3, d0: V3 = [0.04, 0.14, 1], d1: V3 = [0.05, 0.04, 1]) => line(from, to, d0, d1, DOWN, NaN, NaN, { body: true });

// Lunge: the arm extends first, then the front foot drives out
const lunge = thrust([-0.14, 0.32, 0.36], [-0.1, 0.37, 0.82], [0.04, 0.2, 1], [0.06, 0.2, 1]);

// Disengage: the point dips under their guard, circles round and comes in high
const disengage = seq(
  [
    [-0.6, 0.0, arc([-0.14, 0.33, 0.36], 0, cone([0.03, 0.16, 1], 17, 300, 100), NaN, { body: true })],
    [0.0, 1.0, thrust([-0.14, 0.33, 0.36], [-0.1, 0.47, 0.8], [0.08, 0.34, 1], [0.06, 0.14, 1])],
  ],
  0.08,
);

// Whip Cut: the wrist lifts the point over their blade, then whips it down across them
const whip = arc([-0.16, 0.42, 0.34], 0.02, [[-0.25, 1, 0.25], [-0.42, 0.72, 0.6], [-0.05, 0.16, 1], [0.38, -0.3, 0.85], [0.55, -0.6, 0.5]], NaN, {
  body: true,
  pivot1: [-0.08, 0.36, 0.56],
});
const whipHit = hitAt(whip, 2);

// Balestra: a hop forward, a deep lunge, and a moulinet (a full wheel of the blade at the side) on the way back
const balestra = seq(
  [
    [-0.7, 0.0, thrust([-0.13, 0.33, 0.4], [-0.15, 0.31, 0.3], [0.03, 0.16, 1], [0.03, 0.12, 1])],
    [0.0, 1.0, thrust([-0.15, 0.31, 0.3], [-0.1, 0.34, 0.86], [0.04, 0.2, 1], [0.06, 0.32, 1])],
    [1.0, 1.75, arc([-0.22, 0.48, 0.7], 0, circle([0.04, 0.3, 1], [-0.75, -0.66, 0], 1, 0, 12), NaN, { body: true, pivot1: [-0.4, 0.42, 0.4] })],
  ],
  0.07,
);

// Pirouette: a full turn with the blade held up close, coming out of it straight into the thrust
const pirouette = seq(
  [
    [-1.6, -0.25, line([-0.05, 0.5, 0.22], [-0.08, 0.48, 0.24], [0.02, 1, 0.1], [0.02, 1, 0.16], [0, 0, 1], NaN, NaN, { body: true })],
    [-0.25, 1.0, thrust([-0.14, 0.36, 0.26], [-0.08, 0.36, 0.86], [0.04, 0.24, 1], [0.06, 0.32, 1])],
  ],
  0.12,
);

// Coup de Grâce: the salute (hilt at the chin, blade straight up), the blade lowered to aim, the kill
const coup = seq(
  [
    [-1.0, -0.4, line([-0.02, 0.62, 0.3], [-0.03, 0.64, 0.3], [0.02, 1, 0.06], [0.02, 1, 0.1], [0, 0, 1], NaN, NaN, { body: true })],
    [-0.4, 0.0, line([-0.03, 0.64, 0.3], [-0.16, 0.36, 0.3], [0.02, 1, 0.1], [0.04, 0.12, 1], [0, 0, 1], NaN, NaN, { body: true })],
    [0.0, 1.0, thrust([-0.16, 0.36, 0.3], [-0.08, 0.36, 0.9], [0.04, 0.2, 1], [0.06, 0.36, 1])],
  ],
  0.06,
);

// Flèche: the arm shoots out and stays out while the legs run
const fleche = seq(
  [
    [-0.3, 0.4, thrust([-0.14, 0.34, 0.38], [-0.1, 0.36, 0.84])],
    [0.4, 1.2, thrust([-0.1, 0.36, 0.84], [-0.1, 0.34, 0.86], [0, 0.04, 1], [0, 0.0, 1])],
  ],
  0.06,
);

export const rapier: Style = {
  axis: 'y',
  offAxis: 'y',
  trail: { light: '#ffe8ee', heavy: '#ff6a8a', special: '#ff2a4a' },
  sparks: ['#ffffff', '#ffd6e0', '#ff8aa0'],
  guard: P(body, X([-0.12, 0.32, 0.45], [0.03, 0.16, 1], DOWN, 'y', NaN, FT), null, UP_HAND),
  block: P(B({ ...body, crouch: -0.2, lean: 0 }), X([-0.1, 0.45, 0.38], [0.3, 1, 0.25], [1, 0, 0.2], 'y', NaN, FT), null, UP_HAND),
  moves: {
    // Lunge: the classic, arm before foot
    l0: mv({
      keys: [
        K(-0.1, B({ ...body, crouch: -0.13, step: 0.36, back: 0.3 })),
        K(0.35, B({ ...body, crouch: -0.2, lean: 0.12, step: 0.52, back: 0.38, twist: FT + 0.05 })),
        K(0.85, B({ ...body, crouch: -0.36, lean: 0.3, step: 0.9, back: 0.5, twist: FT + 0.15 })),
        K(1.05, B({ ...body, crouch: -0.37, lean: 0.31, step: 0.92, back: 0.5, twist: FT + 0.15 })),
      ],
      main: lunge,
      free: track([[0, UP_HAND], [0.5, MID_HAND], [0.85, LOW_HAND]]),
      impacts: [0.85],
      end: 1.0,
      fx: [fx(0.62, 'dust', 'feet', 0.5), fx(0.85, 'sparkle', 'tip', 0.6)],
    }),
    // Disengage: the point circles under their guard and the thrust comes in high
    l1: mv({
      keys: [
        K(-0.6, B({ ...body, crouch: -0.15, step: 0.38 })),
        K(0.0, B({ ...body, crouch: -0.18, lean: 0.06, step: 0.44, back: 0.34, twist: FT + 0.05 })),
        K(0.85, B({ ...body, crouch: -0.3, lean: 0.24, step: 0.78, back: 0.46, twist: FT + 0.15, headPitch: -0.05 })),
        K(1.05, B({ ...body, crouch: -0.3, lean: 0.24, step: 0.78, back: 0.46, twist: FT + 0.15 })),
      ],
      main: disengage,
      free: track([[0, UP_HAND], [0.85, MID_HAND]]),
      impacts: [0.85],
      start: -0.6,
      chamber: -0.6,
      flow: 1.2,
      blendIn: 0.4,
      end: 1.0,
      fx: [fx(0.85, 'sparkle', 'tip', 0.6)],
      trail: { life: 0.16 },
    }),
    // Whip Cut: a coupé, the point lifted over their guard and whipped down across them
    l2: mv({
      keys: [
        K(-0.1, B({ ...body, twist: FT + 0.15, crouch: -0.12, lean: -0.02, step: 0.36 })),
        K(whipHit, B({ ...body, twist: FT - 0.25, crouch: -0.24, lean: 0.2, step: 0.62, back: 0.4 })),
        K(1.0, B({ ...body, twist: FT - 0.45, crouch: -0.26, lean: 0.24, step: 0.64, back: 0.4 })),
      ],
      main: whip,
      free: track([[0, UP_HAND], [1, [0.45, 0.62, -0.22]]]),
      impacts: [whipHit],
      fx: [fx(whipHit, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Balestra: hop, lunge deep, and wheel the blade at the side while recovering
    l3: mv({
      keys: [
        K(-0.7, B({ ...body, crouch: -0.14 }), { hop: 0 }),
        K(-0.5, B({ ...body, crouch: -0.04, step: 0.38, back: 0.28 }), { hop: 0.2 }),
        K(-0.25, B({ ...body, crouch: -0.2, step: 0.38, back: 0.32 }), { hop: 0 }),
        K(0.35, B({ ...body, crouch: -0.24, lean: 0.14, step: 0.6, back: 0.42, twist: FT + 0.05 })),
        K(0.85, B({ ...body, crouch: -0.42, lean: 0.36, step: 1.0, back: 0.55, twist: FT + 0.18 })),
        K(1.1, B({ ...body, crouch: -0.4, lean: 0.3, step: 0.95, back: 0.52, twist: FT + 0.15 })),
        K(1.5, B({ ...body, crouch: -0.24, lean: 0.08, step: 0.5, back: 0.36, twist: FT })),
        K(1.85, B({ ...body })),
      ],
      main: balestra,
      free: track([[-0.7, UP_HAND], [0.3, UP_HAND], [0.85, LOW_HAND], [1.2, LOW_HAND], [1.7, UP_HAND]]),
      impacts: [0.85],
      start: -0.7,
      chamber: -0.02,
      travel: 0.1,
      blendIn: 0.4,
      end: 1.0,
      rest: 1.75,
      settle: 0.6,
      fx: [fx(-0.3, 'dust', 'feet', 0.6), fx(0.85, 'flashline', 'tip', 1.0), fx(0.85, 'sparkle', 'tip', 0.8)],
      trail: { life: 0.18, glow: 0.3 },
    }),
    // Pirouette: up on the ball of the front foot, one full turn, and out of it into a deep lunge
    h: mv({
      keys: [
        K(-1.6, B({ ...body, crouch: -0.1, step: 0.3, back: 0.26 }), { spin: 0 }),
        K(-1.3, B({ ...body, crouch: -0.02, lean: -0.06, step: 0.16, back: 0.14, width: 0.1, twist: FT - 0.2 }), { spin: 0 }),
        K(-0.75, B({ ...body, crouch: 0.0, lean: -0.05, step: 0.12, back: 0.12, width: 0.1, twist: FT - 0.1 }), { spin: -0.5 }),
        K(-0.15, B({ ...body, crouch: -0.12, lean: 0.05, step: 0.3, back: 0.3, twist: FT }), { spin: -1 }),
        K(0.4, B({ ...body, crouch: -0.26, lean: 0.18, step: 0.65, back: 0.42, twist: FT + 0.08 })),
        K(0.85, B({ ...body, crouch: -0.44, lean: 0.38, step: 1.05, back: 0.58, twist: FT + 0.2 })),
        K(1.05, B({ ...body, crouch: -0.44, lean: 0.38, step: 1.05, back: 0.58, twist: FT + 0.2 })),
      ],
      main: pirouette,
      free: track([[-1.6, UP_HAND], [-1.2, [0.58, 0.52, 0.02]], [-0.3, UP_HAND], [0.85, LOW_HAND]]),
      impacts: [0.85],
      start: -1.6,
      chamber: -0.9,
      flow: 1.35,
      blendIn: 0.35,
      end: 1.0,
      ghosts: [-1.25, -0.2],
      fx: [fx(-1.2, 'whirl', 'root', 0.7, '#ffd0d8'), fx(0.85, 'flashline', 'tip', 1.2), fx(0.85, 'sparkle', 'tip', 1)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Coup de Grâce: a salute and a glint off the blade, then a lunge too fast to see
    sp: mv({
      keys: [
        K(-1.0, B({ ...body, crouch: -0.04, lean: -0.08, twist: FT - 0.15, step: 0.22, back: 0.18, headPitch: -0.12 })),
        K(-0.45, B({ ...body, crouch: -0.05, lean: -0.08, twist: FT - 0.15, step: 0.22, back: 0.18, headPitch: -0.1 })),
        K(-0.05, B({ ...body, crouch: -0.24, lean: 0.12, twist: FT, step: 0.4, back: 0.4 })),
        K(0.4, B({ ...body, crouch: -0.36, lean: 0.3, step: 0.9, back: 0.52, twist: FT + 0.1 })),
        K(0.85, B({ ...body, crouch: -0.46, lean: 0.42, step: 1.1, back: 0.62, twist: FT + 0.2 })),
        K(1.05, B({ ...body, crouch: -0.46, lean: 0.42, step: 1.1, back: 0.62, twist: FT + 0.2 })),
      ],
      main: coup,
      free: track([[-1.0, [0.12, 0.1, -0.3]], [-0.3, [0.12, 0.1, -0.3]], [0.0, UP_HAND], [0.85, LOW_HAND]]),
      impacts: [0.85],
      start: -1.0,
      chamber: -0.02,
      travel: 0.15,
      blendIn: 0.3,
      end: 1.0,
      ghosts: [0.0, 0.95],
      fx: [
        fx(-0.85, 'sparkle', 'tip', 0.9, '#ffffff'),
        fx(-0.02, 'dust', 'feet', 1.2),
        fx(0.85, 'flashline', 'tip', 1.6, '#ff3a5a'),
        fx(0.85, 'sparkle', 'tip', 1.2, '#ff8aa0'),
      ],
      trail: { life: 0.24, glow: 0.9 },
    }),
    // Flèche: arm out, body thrown forward, the back foot crossing over in a running leap
    ab: mv({
      keys: [
        K(-0.3, B({ ...body, crouch: -0.24, lean: 0.2, step: 0.34, back: 0.42 })),
        K(0.0, B({ ...body, crouch: -0.2, lean: 0.48, twist: FT - 0.1, step: 0.5, back: 0.5 })),
        K(0.4, B({ ...body, crouch: -0.14, lean: 0.62, twist: FT - 0.25, front: 'L', step: 0.45, back: 0.55, hipTwist: 0.1 }), { hop: 0.14 }),
        K(0.7, B({ ...body, crouch: -0.22, lean: 0.55, twist: FT - 0.2, front: 'R', step: 0.55, back: 0.5 }), { hop: 0.04 }),
        K(1.0, B({ ...body, crouch: -0.2, lean: 0.5, twist: FT - 0.25, front: 'L', step: 0.5, back: 0.5, hipTwist: 0.1 }), { hop: 0.1 }),
        K(1.2, B({ ...body, crouch: -0.24, lean: 0.25, twist: FT, front: 'R', step: 0.45, back: 0.45 }), { hop: 0 }),
      ],
      main: fleche,
      free: track([[-0.3, UP_HAND], [0.3, [0.45, 0.3, -0.35]]]),
      impacts: [0.4],
      start: -0.3,
      end: 1.2,
      rest: 1.2,
      ghosts: [0.0, 1.1],
      fx: [fx(-0.02, 'dust', 'feet', 1.1), fx(0.4, 'sparkle', 'tip', 1), fx(1.15, 'dust', 'feet', 0.8)],
      trail: { life: 0.22, glow: 0.6 },
    }),
  },
};
