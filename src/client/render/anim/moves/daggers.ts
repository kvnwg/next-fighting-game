/**
 * Assassin, twin daggers. Low, fast and never still: an X cut with both blades, a full turn with the
 * arms flung wide, a three-stab flurry, a snake's rising double stab, crossed wrists torn apart, a
 * leaping two-turn lotus, a front flip out of the dodge that lands blades-first, a weaving lunge, a
 * backhand out of smoke, a rising cross while springing away, a barrel roll in the air, a plunge
 * from the air, a throat grab with a reverse-grip finish, and a shadow step that reappears in smoke.
 */
import { B, K, P, Style, X, arc, fx, hitAt, line, mv, seq } from '../author';
import type { Motion, V3 } from '../author';

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

// Twin Fang: wrists crossed at the chest, both blades pointing out past the other arm, then torn
// apart outward through them
const fangR = arc(R_SH, 0.46, [[0.85, 0.05, 0.45], [0.45, 0.18, 0.9], [-0.1, 0.24, 1], [-0.6, 0.2, 0.8], [-0.95, 0.12, 0.3]]);
const fangL = arc(L_SH, 0.46, [[-0.85, 0.05, 0.45], [-0.45, 0.18, 0.9], [0.1, 0.24, 1], [0.6, 0.2, 0.8], [0.95, 0.12, 0.3]]);
const fangHit = hitAt(fangR, 2);

// Smoke Cut: a backhand from over the left shoulder, out to the right
const smokeCut = arc(R_SH, 0.46, [[0.75, 0.35, 0.5], [0.3, 0.3, 0.95], [-0.15, 0.22, 1], [-0.65, 0.12, 0.75], [-0.95, 0.05, 0.25]]);
const smokeHit = hitAt(smokeCut, 2);

// Hidden Thorn: both blades held point-down behind the hips, then up from low outside, crossing high
const thornR = arc(R_SH, 0.46, [[-0.3, -0.65, -0.7], [-0.45, -0.55, 0.65], [-0.2, -0.1, 1], [0.12, 0.25, 1], [0.4, 0.7, 0.6]]);
const thornL = arc(L_SH, 0.46, [[0.3, -0.65, -0.7], [0.45, -0.55, 0.65], [0.2, -0.1, 1], [-0.12, 0.25, 1], [-0.4, 0.7, 0.6]]);
const thornHit = hitAt(thornR, 3);

// Kite: arms out wide like a kite's spars through the roll, then scissored in together
const kiteR = seq([
  [-0.9, 0.0, line([-0.7, 0.5, 0.15], [-0.74, 0.52, 0.11], [-1, 0.1, 0.4], [-1, 0.1, 0.25], [0, 0, 1])],
  [0.0, 1.07, arc(R_SH, 0.46, [[-1, 0.1, 0.25], [-0.6, 0.05, 0.85], [-0.05, 0.0, 1], [0.4, -0.05, 0.9]])],
]);
const kiteL = seq([
  [-0.9, 0.0, line([0.7, 0.5, 0.15], [0.74, 0.52, 0.11], [1, 0.1, 0.4], [1, 0.1, 0.25], [0, 0, 1])],
  [0.0, 1.07, arc(L_SH, 0.46, [[1, 0.1, 0.25], [0.6, 0.05, 0.85], [0.05, 0.0, 1], [-0.4, -0.05, 0.9]])],
]);
const kiteHit = hitAt(kiteR, 2, 1);

// Nightfall: both blades raised point-down over the head, then driven down into the ground in front
const fall = (x: number) =>
  seq([
    [-0.4, 0.0, line([x * 0.15, 0.95, 0.08], [x * 0.13, 1.04, 0.0], [x * -0.05, -0.75, 0.65], [0, -0.92, 0.38], [0, 0, 1], NaN, NaN, { body: true })],
    [0.0, 0.45, line([x * 0.13, 1.04, 0.0], [x * 0.1, -0.1, 0.5], [0, -0.92, 0.38], [x * -0.05, -1, 0.18], [0, 0, 1], NaN, NaN, { body: true })],
    [0.45, 1.07, line([x * 0.1, -0.1, 0.5], [x * 0.1, -0.12, 0.52], [x * -0.05, -1, 0.18], [x * -0.05, -1, 0.18], [0, 0, 1], NaN, NaN, { body: true })],
  ]);

/** A blade keyed along s (the entrance): straight moves between keyed grips [s, pos, dir, edge], held outside them. */
type Grip = [number, V3, V3, V3];
const keyed = (ks: Grip[], blend = 0.03): Motion => {
  const hold = (k: Grip, from: number, to: number): [number, number, Motion] => [from, to, line(k[1], k[1], k[2], k[2], k[3])];
  const parts: [number, number, Motion][] = [hold(ks[0], ks[0][0] - 1, ks[0][0])];
  for (let i = 1; i < ks.length; i++) parts.push([ks[i - 1][0], ks[i][0], line(ks[i - 1][1], ks[i][1], ks[i - 1][2], ks[i][2], ks[i][3])]);
  parts.push(hold(ks[ks.length - 1], ks[ks.length - 1][0], ks[ks.length - 1][0] + 1));
  return seq(parts, blend);
};

// Entrance blades: sheathed-looking in reverse grip along the forearms, drawn from the right thigh
// and the small of the back, then crossed point-down in front of the hood
const SHEATH_R: V3 = [-0.1, -0.3, -1];
const SHEATH_L: V3 = [0.1, -0.3, -1];
const UP: V3 = [0, 1, 0];
const FWD: V3 = [0, 0, 1];

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
    // Twin Fang: out of the lunge the wrists cross at the chest, then both blades tear outward
    h1: mv({
      keys: [
        K(-0.1, B({ ...body, crouch: -0.34, lean: 0.3, twist: 0, step: 0.5, back: 0.42, headPitch: 0.15 })),
        K(fangHit + 0.1, B({ ...body, crouch: -0.22, lean: 0.42, twist: 0, step: 0.58, back: 0.44, width: 0.18 })),
        K(1.05, B({ ...body, crouch: -0.2, lean: 0.34, twist: 0, step: 0.58, back: 0.44, width: 0.2, headPitch: -0.1 })),
      ],
      main: fangR,
      off: fangL,
      impacts: [fangHit],
      chamber: -0.1,
      fx: [fx(fangHit, 'sparkle', 'tip', 0.8), fx(fangHit, 'sparkle', 'offTip', 0.8)],
      trail: { life: 0.18, glow: 0.5 },
    }),
    // Death Lotus: sprung up from a crouch into two turns to the right, one blade high and one low
    // like opening petals; the left blade passes them, then the right, and they land in a crouch
    h2: mv({
      keys: [
        K(-1.4, B({ ...body, crouch: -0.42, lean: 0.34, twist: 0.45, step: 0.3, back: 0.36, width: 0.2 }), { spin: 0, hop: 0 }),
        K(-0.9, B({ ...body, crouch: -0.3, lean: 0.2, twist: 0.2 }), { spin: -0.15, hop: 0.08 }),
        K(-0.2, B({ ...body, crouch: -0.12, lean: 0.1, twist: 0, side: 0.15, step: 0.12, back: 0.14, width: 0.1 }), { spin: -0.85, hop: 0.35 }),
        K(0.45, B({ ...body, crouch: -0.12, lean: 0.12, twist: 0, side: 0.15, step: 0.12, back: 0.14, width: 0.1 }), { spin: -1.25, hop: 0.45 }),
        K(0.8, B({ ...body, crouch: -0.14, lean: 0.14, twist: 0, side: 0.1, step: 0.14, back: 0.16, width: 0.12 }), { spin: -1.75, hop: 0.4 }),
        K(1.2, B({ ...body, crouch: -0.42, lean: 0.38, twist: 0, step: 0.36, back: 0.38, width: 0.22 }), { spin: -2, hop: 0 }),
        K(1.5, B({ ...body, crouch: -0.32, lean: 0.3 }), { spin: -2, hop: 0 }),
      ],
      main: seq([
        [-1.4, -0.7, line([0.05, 0.3, 0.25], [-0.68, 0.18, 0.08], [0.5, -0.3, 0.8], [-1, -0.4, 0.15], [0, 0, -1])],
        [-0.7, 1.2, line([-0.68, 0.18, 0.08], [-0.7, 0.2, 0.1], [-1, -0.4, 0.15], [-1, -0.35, 0.2], [0, 0, -1])],
      ]),
      off: seq([
        [-1.4, -0.7, line([-0.05, 0.35, 0.25], [0.66, 0.7, 0.06], [-0.5, 0.3, 0.8], [1, 0.55, 0.1], [0, 0, 1])],
        [-0.7, 1.2, line([0.66, 0.7, 0.06], [0.68, 0.68, 0.08], [1, 0.55, 0.1], [1, 0.5, 0.15], [0, 0, 1])],
      ]),
      impacts: [0.45, 0.8],
      start: -1.4,
      chamber: -0.7,
      flow: 1.4,
      blendIn: 0.3,
      lead: 0,
      end: 1.2,
      rest: 1.5,
      settle: 0.6,
      ghosts: [-0.6, 1.0],
      fx: [
        fx(-1.3, 'dust', 'feet', 0.8),
        fx(-0.4, 'whirl', 'root', 0.9, '#b55088'),
        fx(0.45, 'sparkle', 'offTip', 0.8),
        fx(0.8, 'sparkle', 'tip', 0.9),
        fx(1.15, 'stomp', 'feet', 0.8),
      ],
      trail: { life: 0.24, glow: 0.6 },
    }),
    // Eviscerate: out of the dodge into a front flip over the gap, landing with both blades coming down
    dl: mv({
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
    // Viper Rush: sideways on and stretched flat out, the right blade weaving in like a striking
    // snake while the left lies back along the forearm
    dh: mv({
      keys: [
        K(-0.3, B({ ...body, crouch: -0.36, lean: 0.42, twist: -0.2, step: 0.3, back: 0.38, width: 0.18 })),
        K(0.1, B({ ...body, crouch: -0.4, lean: 0.48, twist: 0.3, step: 0.55, back: 0.5 })),
        K(0.55, B({ ...body, crouch: -0.42, lean: 0.55, twist: 0.75, step: 0.85, back: 0.6, width: 0.15, headPitch: 0.1 })),
        K(1.1, B({ ...body, crouch: -0.4, lean: 0.5, twist: 0.7, step: 0.85, back: 0.6, width: 0.15 })),
      ],
      main: seq(
        [
          [-0.3, 0.0, stab([-0.26, 0.18, -0.08], [-0.2, 0.22, 0.05], [0.1, 0.2, 1], [0.35, 0.2, 1])],
          [0.0, 0.22, stab([-0.2, 0.22, 0.05], [-0.12, 0.32, 0.4], [0.35, 0.2, 1], [-0.35, 0.15, 1])],
          [0.22, 0.45, stab([-0.12, 0.32, 0.4], [-0.05, 0.38, 0.9], [-0.35, 0.15, 1], [0.0, 0.06, 1])],
          [0.45, 1.07, stab([-0.05, 0.38, 0.9], [-0.05, 0.38, 0.94], [0.0, 0.06, 1], [0.0, 0.06, 1])],
        ],
        0.05,
      ),
      off: line([0.26, 0.24, -0.02], [0.28, 0.22, -0.06], [0.1, -0.35, -1], [0.1, -0.35, -1], [0, 1, 0]),
      impacts: [0.45],
      start: -0.3,
      chamber: 0.05,
      travel: 0.4,
      ghosts: [-0.1, 0.7],
      fx: [fx(-0.25, 'smoke', 'feet', 0.8), fx(0.1, 'dust', 'feet', 0.9), fx(0.3, 'spiral', 'tip', 0.6), fx(0.45, 'flashline', 'tip', 1), fx(0.45, 'sparkle', 'tip', 0.9)],
      trail: { life: 0.2, glow: 0.6 },
    }),
    // Smoke Cut: a hop back out of a puff of smoke, the right blade whipped backhand across the gap
    bl: mv({
      keys: [
        K(-0.1, B({ ...body, crouch: -0.24, lean: 0.12, twist: 0.45, step: 0.24, back: 0.36 })),
        K(smokeHit + 0.1, B({ ...body, crouch: -0.3, lean: -0.12, twist: -0.25, step: 0.12, back: 0.6, headPitch: 0.1 })),
        K(1.05, B({ ...body, crouch: -0.32, lean: -0.16, twist: -0.45, step: 0.1, back: 0.62 })),
      ],
      main: smokeCut,
      off: line([0.3, 0.24, 0.18], [0.26, 0.4, 0.22], [-0.1, 0.2, 1], [-0.3, 0.6, 0.7], DOWN),
      impacts: [smokeHit],
      fx: [fx(0.0, 'smoke', 'feet', 1.0), fx(smokeHit, 'sparkle', 'tip', 0.5)],
      trail: { life: 0.1 },
    }),
    // Hidden Thorn: hunched with both blades hidden behind the hips, then a spring backward that
    // brings them up from the ground, crossing under the chin
    bh: mv({
      keys: [
        K(-0.1, B({ ...body, crouch: -0.42, lean: 0.32, twist: 0, step: 0.3, back: 0.34, width: 0.18 }), { hop: 0, flip: 0 }),
        K(thornHit + 0.1, B({ ...body, crouch: -0.2, lean: -0.22, twist: 0, step: 0.14, back: 0.62, headPitch: -0.1 }), { hop: 0.18, flip: -0.04 }),
        K(1.05, B({ ...body, crouch: -0.36, lean: 0.05, twist: 0, step: 0.16, back: 0.6 }), { hop: 0, flip: 0 }),
      ],
      main: thornR,
      off: thornL,
      impacts: [thornHit],
      chamber: -0.06,
      fx: [fx(0.2, 'dust', 'feet', 0.8), fx(thornHit, 'sparkle', 'tip', 0.8), fx(thornHit, 'sparkle', 'offTip', 0.8), fx(1.0, 'dust', 'feet', 0.6)],
      trail: { life: 0.18, glow: 0.5 },
    }),
    // Kite: a barrel roll in the air with the arms out wide, scissoring both blades in as it comes round
    jl: mv({
      keys: [
        K(-0.9, B({ ...body, crouch: -0.2, lean: 0.2, width: 0.1 }), { roll: 0, hop: 0 }),
        K(-0.5, B({ ...body, crouch: -0.16, lean: 0.16, width: 0.1 }), { roll: 0.25, hop: 0.25 }),
        K(0.0, B({ ...body, crouch: -0.16, lean: 0.2, width: 0.1 }), { roll: 0.75, hop: 0.35 }),
        K(kiteHit, B({ ...body, crouch: -0.18, lean: 0.3, width: 0.12 }), { roll: 1, hop: 0.3 }),
        K(1.1, B({ ...body, crouch: -0.2, lean: 0.26 }), { roll: 1, hop: 0.1 }),
      ],
      main: kiteR,
      off: kiteL,
      impacts: [kiteHit],
      start: -0.9,
      chamber: -0.3,
      flow: 1.3,
      blendIn: 0.3,
      lead: 0,
      fx: [fx(-0.4, 'whirl', 'root', 0.5, '#efe0ff'), fx(kiteHit, 'sparkle', 'tip', 0.6), fx(kiteHit, 'sparkle', 'offTip', 0.6)],
      trail: { life: 0.16, glow: 0.3 },
    }),
    // Nightfall: arched back with both blades raised point-down, then dropped onto them, both
    // blades driven into the ground
    jh: mv({
      keys: [
        K(-0.4, B({ ...body, crouch: -0.06, lean: -0.22, headPitch: 0.15, width: 0.14 }), { hop: 0.15, flip: 0 }),
        K(0.0, B({ ...body, crouch: -0.02, lean: -0.32, headPitch: 0.2, width: 0.14 }), { hop: 0.25, flip: -0.03 }),
        K(0.5, B({ ...body, crouch: -0.5, lean: 0.55, step: 0.42, back: 0.42, width: 0.24, headPitch: 0.1 }), { hop: 0, flip: 0 }),
        K(1.1, B({ ...body, crouch: -0.48, lean: 0.5, step: 0.42, back: 0.42, width: 0.24 })),
      ],
      main: fall(-1),
      off: fall(1),
      impacts: [0.45],
      start: -0.4,
      chamber: 0.0,
      blendIn: 0.6,
      fx: [fx(0.45, 'stomp', 'feet', 0.9), fx(0.45, 'shockwave', 'tip', 0.8), fx(0.5, 'smoke', 'feet', 0.8), fx(0.45, 'sparkle', 'offTip', 0.7)],
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
  // Ring entrance, From Above: out of smoke he drops from high overhead through a front flip into a
  // low landing crouch, stays down with the head bowed and rises slowly as the hands go to the
  // sheaths, then both blades are drawn in reverse grip and crossed point-down before the hood
  entrance: mv({
    keys: [
      // the drop
      K(0.0, B({ ...body, crouch: -0.04, lean: 0.0, twist: 0, step: 0.12, back: 0.12, width: 0.1, headPitch: 0.3 }), { hop: 3.4, flip: 0 }),
      K(0.09, B({ ...body, crouch: -0.12, lean: 0.3, twist: 0, step: 0.06, back: 0.06, width: 0.1, headPitch: 0.4 }), { hop: 3.1, flip: 0.2 }),
      K(0.17, B({ ...body, crouch: -0.2, lean: 0.5, twist: 0, step: 0.04, back: 0.04, width: 0.1, headPitch: 0.4 }), { hop: 2.2, flip: 0.65 }),
      K(0.24, B({ ...body, crouch: -0.1, lean: 0.15, twist: 0, step: 0.16, back: 0.16, width: 0.16, headPitch: 0.2 }), { hop: 0.95, flip: 0.95 }),
      K(0.29, B({ ...body, crouch: -0.2, lean: 0.25, twist: 0, step: 0.24, back: 0.28, width: 0.22, headPitch: 0.3 }), { hop: 0, flip: 1 }),
      // the landing crouch, head down
      K(0.33, B({ ...body, crouch: -0.56, lean: 0.62, twist: 0.05, step: 0.32, back: 0.38, width: 0.26, headPitch: 0.55 }), { hop: 0 }),
      K(0.48, B({ ...body, crouch: -0.54, lean: 0.6, twist: 0.05, step: 0.32, back: 0.38, width: 0.26, headPitch: 0.6 })),
      // rising slowly, the hands going to the sheaths
      K(0.68, B({ ...body, crouch: -0.3, lean: 0.3, twist: -0.05, step: 0.28, back: 0.32, width: 0.2, headPitch: 0.3 })),
      // the draw, crossed before the hood
      K(0.76, B({ ...body, crouch: -0.24, lean: 0.12, twist: 0, step: 0.24, back: 0.3, width: 0.18, headPitch: -0.05 })),
      K(0.86, B({ ...body, crouch: -0.26, lean: 0.14, twist: 0, step: 0.24, back: 0.3, width: 0.18, headPitch: -0.05 })),
      K(0.97, body),
    ],
    main: keyed([
      [0.0, [-0.3, 0.3, 0.1], SHEATH_R, UP],
      [0.12, [-0.16, 0.34, 0.24], [-0.05, -0.4, -1], UP],
      [0.24, [-0.2, 0.32, 0.18], [-0.05, -0.4, -1], UP],
      [0.3, [-0.42, 0.34, -0.02], [-0.3, -0.3, -1], UP],
      // the right arm held back for balance on landing
      [0.34, [-0.4, 0.18, -0.16], [-0.2, -0.2, -1], UP],
      [0.5, [-0.38, 0.16, -0.12], [-0.2, -0.2, -1], UP],
      // down to the right thigh
      [0.68, [-0.26, -0.02, 0.06], [0, -1, -0.2], FWD],
      // drawn, raised and crossed point-down in front of the hood
      [0.76, [-0.17, 0.76, 0.34], [0.7, -0.55, 0.3], FWD],
      [0.86, [-0.17, 0.74, 0.34], [0.7, -0.55, 0.3], FWD],
      [0.97, [-0.22, 0.28, 0.3], [0.15, 0.35, 1], [0, -1, 0.2]],
    ]),
    off: keyed([
      [0.0, [0.3, 0.3, 0.1], SHEATH_L, UP],
      [0.12, [0.16, 0.34, 0.24], [0.05, -0.4, -1], UP],
      [0.24, [0.2, 0.32, 0.18], [0.05, -0.4, -1], UP],
      [0.3, [0.3, 0.1, 0.3], [0.1, -0.3, -1], UP],
      // the left hand down to the ground on landing
      [0.34, [0.22, -0.06, 0.42], [0.2, -0.3, -1], UP],
      [0.5, [0.22, -0.06, 0.42], [0.2, -0.3, -1], UP],
      // round to the small of the back
      [0.68, [0.24, 0.02, -0.14], [-0.2, -0.6, -0.8], UP],
      [0.76, [0.17, 0.78, 0.37], [-0.7, -0.55, 0.3], FWD],
      [0.86, [0.17, 0.76, 0.37], [-0.7, -0.55, 0.3], FWD],
      [0.97, [0.2, 0.35, 0.36], [-0.15, 0.3, 1], [0, -1, 0.2]],
    ]),
    lead: 0,
    ghosts: [0.04, 0.3],
    fx: [
      fx(0.0, 'smoke', 'root', 1.4),
      fx(0.31, 'dust', 'feet', 1.1),
      fx(0.31, 'smoke', 'feet', 1.3),
      fx(0.31, 'stomp', 'feet', 0.5),
      fx(0.74, 'smoke', 'feet', 0.6),
      fx(0.77, 'sparkle', 'tip', 0.9, '#ff2a6a'),
      fx(0.78, 'sparkle', 'offTip', 0.9, '#ff2a6a'),
    ],
  }),
};
