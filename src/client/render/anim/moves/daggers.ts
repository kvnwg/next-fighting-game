/**
 * Assassin, twin daggers. Low, fast and never still: an X cut with both blades, a full turn with the
 * arms flung wide, a three-stab flurry, a front flip that lands blades-first, a snake's rising
 * double stab, a throat grab with a reverse-grip finish, and a shadow step that reappears in smoke.
 */
import { B, K, P, Style, X, arc, fx, hitAt, line, mv, seq } from '../author';
import type { V3 } from '../author';

const body = B({ front: 'L', step: 0.26, back: 0.3, width: 0.16, crouch: -0.2, lean: 0.24, twist: -0.1 });
const R_SH: V3 = [-0.3, 0.48, 0.0];
const L_SH: V3 = [0.3, 0.48, 0.0];
const DOWN: V3 = [0, -1, 0];

/** A stab along the body's line (body space). */
const stab = (from: V3, to: V3, d0: V3, d1: V3) => line(from, to, d0, d1, DOWN, NaN, NaN, { body: true });

// Cross Slit: both blades from high outside, crossing in front of them
const xR = arc(R_SH, 0.46, [[-0.55, 0.75, 0.3], [-0.2, 0.4, 0.9], [0.0, 0.2, 1], [0.35, -0.15, 0.9], [0.55, -0.45, 0.6]]);
const xL = arc(L_SH, 0.46, [[0.55, 0.75, 0.3], [0.2, 0.4, 0.9], [0.0, 0.2, 1], [-0.35, -0.15, 0.9], [-0.55, -0.45, 0.6]]);
const xHit = hitAt(xR, 2);

// Eviscerate: tucked through the flip, then both blades come down one after the other on landing
const evR = seq([
  [-1.5, 0.0, line([-0.16, 0.4, 0.24], [-0.14, 0.42, 0.22], [0.2, 0.6, 1], [0.2, 0.6, 1], DOWN)],
  [0.0, 1.07, arc(R_SH, 0.46, [[-0.3, 0.9, 0.3], [-0.1, 0.3, 1], [0.15, -0.4, 0.9], [0.3, -0.7, 0.5]])],
]);
const evL = seq([
  [-1.5, 0.35, line([0.16, 0.42, 0.24], [0.14, 0.44, 0.22], [-0.2, 0.6, 1], [-0.2, 0.6, 1], DOWN)],
  [0.35, 1.2, arc(L_SH, 0.46, [[0.3, 0.9, 0.3], [0.1, 0.3, 1], [-0.15, -0.4, 0.9], [-0.3, -0.7, 0.5]])],
]);

export const daggers: Style = {
  axis: 'y',
  offAxis: 'y',
  trail: { light: '#efe0ff', heavy: '#b55088', special: '#ff2a6a' },
  sparks: ['#ffffff', '#e8c8ff', '#b55088'],
  guard: P(body, X([-0.22, 0.28, 0.3], [0.15, 0.35, 1], [0, -1, 0.2], 'y'), X([0.2, 0.35, 0.36], [-0.15, 0.3, 1], [0, -1, 0.2], 'y')),
  block: P(B({ ...body, crouch: -0.24 }), X([-0.08, 0.6, 0.32], [0.8, 0.55, 0.1], [0, 0, 1], 'y'), X([0.08, 0.6, 0.34], [-0.8, 0.55, 0.1], [0, 0, 1], 'y')),
  moves: {
    // Cross Slit: both blades at once, an X across them
    l0: mv({
      keys: [
        K(-0.1, B({ ...body, lean: 0.05, crouch: -0.12, step: 0.22 })),
        K(xHit + 0.1, B({ ...body, lean: 0.4, crouch: -0.28, step: 0.42, back: 0.34 })),
        K(1.05, B({ ...body, lean: 0.44, crouch: -0.3, step: 0.42, back: 0.34 })),
      ],
      main: xR,
      off: xL,
      impacts: [xHit],
      fx: [fx(xHit, 'sparkle', 'tip', 0.6), fx(xHit, 'sparkle', 'offTip', 0.6)],
    }),
    // Wraith Spin: arms flung wide and a full turn to the left; the right blade passes them a
    // quarter of the way round, the left one again three quarters round
    l1: mv({
      keys: [
        K(-0.6, B({ ...body, twist: -0.45, crouch: -0.24, lean: 0.2 }), { spin: 0 }),
        K(-0.2, B({ ...body, twist: -0.2, crouch: -0.18, lean: 0.12, step: 0.18, back: 0.2 }), { spin: 0.04 }),
        K(0.55, B({ ...body, twist: 0.0, crouch: -0.16, lean: 0.12, step: 0.14, back: 0.16, width: 0.12 }), { spin: 0.25 }),
        K(1.0, B({ ...body, twist: 0.0, crouch: -0.16, lean: 0.12, step: 0.14, back: 0.16, width: 0.12 }), { spin: 0.72 }),
        K(1.35, B({ ...body, twist: -0.1, crouch: -0.2, lean: 0.2 }), { spin: 1 }),
      ],
      main: line([-0.74, 0.44, 0.1], [-0.76, 0.46, 0.06], [-1, 0.1, 0.25], [-1, 0.1, 0.1], [0, 0, 1]),
      off: line([0.74, 0.44, 0.1], [0.76, 0.46, 0.06], [1, 0.1, 0.25], [1, 0.1, 0.1], [0, 0, -1]),
      impacts: [0.45],
      start: -0.6,
      chamber: -0.3,
      flow: 1.4,
      blendIn: 0.35,
      rest: 1.35,
      settle: 0.75,
      ghosts: [-0.1, 1.2],
      fx: [fx(0.0, 'whirl', 'root', 0.7, '#efe0ff'), fx(0.45, 'sparkle', 'tip', 0.6)],
      trail: { life: 0.2, glow: 0.4 },
    }),
    // Hornet Flurry: right, left, right, three stabs before they can blink
    l2: mv({
      keys: [
        K(-0.1, B({ ...body, crouch: -0.2, lean: 0.24, step: 0.26 })),
        K(0.3, B({ ...body, twist: 0.2, crouch: -0.24, lean: 0.36, step: 0.4 })),
        K(0.6, B({ ...body, twist: -0.3, crouch: -0.24, lean: 0.36, step: 0.42 })),
        K(0.9, B({ ...body, twist: 0.25, crouch: -0.26, lean: 0.4, step: 0.46 })),
        K(1.1, B({ ...body, twist: 0.2, crouch: -0.26, lean: 0.4, step: 0.46 })),
      ],
      main: seq(
        [
          [-0.1, 0.3, stab([-0.2, 0.3, 0.24], [-0.06, 0.42, 0.6], [0.1, 0.2, 1], [0.02, 0.06, 1])],
          [0.3, 0.7, stab([-0.06, 0.42, 0.6], [-0.2, 0.34, 0.22], [0.02, 0.06, 1], [0.1, 0.2, 1])],
          [0.7, 1.07, stab([-0.2, 0.34, 0.22], [-0.05, 0.48, 0.64], [0.1, 0.2, 1], [0.0, 0.04, 1])],
        ],
        0.05,
      ),
      off: seq(
        [
          [-0.1, 0.4, stab([0.2, 0.36, 0.3], [0.2, 0.36, 0.24], [-0.12, 0.25, 1], [-0.12, 0.25, 1])],
          [0.4, 0.6, stab([0.2, 0.36, 0.24], [0.05, 0.4, 0.62], [-0.12, 0.25, 1], [0.0, 0.06, 1])],
          [0.6, 1.07, stab([0.05, 0.4, 0.62], [0.2, 0.36, 0.28], [0.0, 0.06, 1], [-0.12, 0.25, 1])],
        ],
        0.05,
      ),
      impacts: [0.3, 0.6, 0.9],
      end: 1.07,
      rest: 1.1,
      fx: [fx(0.3, 'sparkle', 'tip', 0.45), fx(0.6, 'sparkle', 'offTip', 0.45), fx(0.9, 'sparkle', 'tip', 0.55)],
      trail: { life: 0.1 },
    }),
    // Eviscerate: a front flip over the gap, landing with both blades coming down
    l3: mv({
      keys: [
        K(-1.5, B({ ...body, crouch: -0.32, lean: 0.36 }), { flip: 0, hop: 0 }),
        K(-1.15, B({ ...body, crouch: -0.05, lean: 0.2 }), { flip: 0.1, hop: 0.3 }),
        K(-0.55, B({ ...body, crouch: 0.0, lean: 0.1 }), { flip: 0.55, hop: 0.6 }),
        K(-0.05, B({ ...body, crouch: -0.1, lean: 0.2 }), { flip: 0.95, hop: 0.25 }),
        K(0.3, B({ ...body, crouch: -0.3, lean: 0.42, step: 0.4, back: 0.32 }), { flip: 1, hop: 0 }),
        K(1.25, B({ ...body, crouch: -0.32, lean: 0.4, step: 0.4, back: 0.32 })),
      ],
      main: evR,
      off: evL,
      impacts: [0.35, 0.75],
      start: -1.5,
      chamber: -0.2,
      flow: 1.3,
      blendIn: 0.3,
      end: 1.2,
      rest: 1.25,
      ghosts: [-1.2, 0.2],
      fx: [fx(-1.2, 'dust', 'feet', 0.8), fx(0.3, 'stomp', 'feet', 0.6), fx(0.35, 'sparkle', 'tip', 0.6), fx(0.75, 'sparkle', 'offTip', 0.7)],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Viper Fang: coiled flat to the ground like a snake, then up and in with both blades
    h: mv({
      keys: [
        K(-0.2, B({ ...body, crouch: -0.42, lean: 0.46, twist: 0.0, step: 0.3, back: 0.4, width: 0.2 })),
        K(0.3, B({ ...body, crouch: -0.34, lean: 0.42, step: 0.5, back: 0.44 })),
        K(0.85, B({ ...body, crouch: -0.26, lean: 0.36, step: 0.72, back: 0.5 })),
        K(1.05, B({ ...body, crouch: -0.26, lean: 0.36, step: 0.72, back: 0.5 })),
      ],
      main: stab([-0.24, 0.1, 0.02], [-0.08, 0.44, 0.66], [0.1, 0.25, 1], [0.0, 0.1, 1]),
      off: stab([0.2, 0.12, 0.02], [0.06, 0.46, 0.62], [-0.1, 0.25, 1], [0.0, 0.1, 1]),
      impacts: [0.85],
      start: -0.2,
      chamber: -0.06,
      end: 1.0,
      ghosts: [0.0, 0.95],
      fx: [fx(0.0, 'smoke', 'feet', 0.7), fx(0.05, 'dust', 'feet', 0.9), fx(0.85, 'sparkle', 'tip', 0.9), fx(0.85, 'sparkle', 'offTip', 0.9)],
      trail: { life: 0.2, glow: 0.6 },
    }),
    // Throat Grab: in low, the left hand at the throat, the right blade raised point-down... and down
    sp: mv({
      keys: [
        K(-0.6, B({ ...body, crouch: -0.32, lean: 0.36 })),
        K(0.0, B({ ...body, crouch: -0.34, lean: 0.4, step: 0.3 })),
        K(0.85, B({ ...body, crouch: -0.24, lean: 0.36, twist: -0.3, step: 0.62, back: 0.42 })),
        K(1.3, B({ ...body, crouch: -0.26, lean: 0.42, twist: 0.15, step: 0.62, back: 0.42 })),
        K(1.8, B({ ...body, crouch: -0.22, lean: 0.26, twist: -0.1, step: 0.4, back: 0.34 })),
      ],
      main: seq(
        [
          // raised in a reverse grip, point down
          [-0.6, 1.0, line([-0.3, 0.55, 0.15], [-0.26, 0.82, 0.2], [0.1, -0.6, 0.5], [0.05, -0.85, 0.3], [0, 0, 1])],
          // driven down
          [1.0, 1.3, line([-0.26, 0.82, 0.2], [-0.08, 0.4, 0.5], [0.05, -0.85, 0.3], [0.1, -0.6, 0.8], [0, 0, 1])],
          [1.3, 1.8, line([-0.08, 0.4, 0.5], [-0.22, 0.3, 0.3], [0.1, -0.6, 0.8], [0.15, 0.35, 1], [0, -1, 0.2])],
        ],
        0.06,
      ),
      off: seq(
        [
          [-0.6, 0.0, stab([0.24, 0.3, 0.16], [0.26, 0.28, 0.12], [-0.15, 0.3, 1], [-0.15, 0.3, 1])],
          [0.0, 1.0, stab([0.26, 0.28, 0.12], [0.05, 0.56, 0.62], [-0.15, 0.3, 1], [0.0, 0.4, 1])],
          [1.0, 1.8, stab([0.05, 0.56, 0.62], [0.2, 0.36, 0.34], [0.0, 0.4, 1], [-0.15, 0.3, 1])],
        ],
        0.06,
      ),
      impacts: [0.85],
      start: -0.6,
      chamber: -0.05,
      travel: 0.25,
      end: 1.0,
      rest: 1.8,
      settle: 0.75,
      ghosts: [0.0, 0.9],
      fx: [fx(-0.55, 'smoke', 'feet', 0.6), fx(0.85, 'sparkle', 'offTip', 0.6), fx(1.28, 'sparkle', 'tip', 0.9, '#ff2a6a')],
    }),
  },
  // Shadow Step: (unseen for most of it) back out of the smoke crouched low, blades out wide
  vanish: mv({
    keys: [
      K(0.0, B({ ...body, crouch: -0.36, lean: 0.4, width: 0.22 })),
      K(0.85, B({ ...body, crouch: -0.38, lean: 0.44, width: 0.24, step: 0.3, back: 0.38 })),
      K(1.0, B({ ...body, crouch: -0.3, lean: 0.36, width: 0.2 })),
    ],
    main: line([-0.5, 0.2, 0.2], [-0.42, 0.24, 0.26], [-0.6, -0.3, 0.6], [-0.3, 0.1, 1], DOWN),
    off: line([0.5, 0.22, 0.2], [0.42, 0.26, 0.26], [0.6, -0.3, 0.6], [0.3, 0.1, 1], DOWN),
    impacts: [0.5],
    start: 0,
    rest: 1,
    fx: [fx(0.8, 'smoke', 'feet', 1.2)],
  }),
};

