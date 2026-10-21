/**
 * Lancer, spear. Reach and rhythm: thrusts slide the shaft through the front hand, the third light
 * spins the spear over the head before it cuts, the heavy corkscrews in on a gust of wind, the
 * special sweeps the ground in two full turns, and the Pole Vault flips them backwards out of reach.
 */
import { B, K, P, Style, X, arc, circle, fx, line, mv, seq, track } from '../author';
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
};
