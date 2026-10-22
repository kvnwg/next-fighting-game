/**
 * Assassin, twin daggers, after the knife fighter in the reference duel. Upright and loose, both
 * blades held forward-grip low by the hips and angled down at the ground ahead, and every cut
 * thrown from the legs and hips up: a forehand hook across the face with the left blade jabbing
 * low, both arms flung open from a cross, a turn with the arms spread on a diagonal, both fists
 * raised high and the whole body dived down after them, a left blade raised over the hood and
 * chopped down as the right is driven out in a deep lunge, the same chop turned into a whirl, a
 * flat dive with the arms stretched ahead, a low skimming dart, a drilling dash, a backhand fan
 * springing away, a sweep along the floor out of a wide squat, a forward handspring in the air,
 * a dive that nails both blades into the floor, and a shadow step that reappears in smoke.
 *
 * Grips: the blade always comes out of the thumb side of the fist, so each grip below gives only
 * where the fist is and where the point goes; the knuckles are turned to carry on from the arm
 * (away from the shoulder), so the wrist is cocked, not broken, and the blade reads as an
 * extension of the reach the way it does in the reference.
 */
import { B, K, P, Style, X, fx, line, mv, seq, track } from '../author';
import type { Motion, V3 } from '../author';

// upright and loose, the left foot a little ahead, knees soft, the chest turned a touch right
const body = B({ front: 'L', step: 0.22, back: 0.24, width: 0.16, crouch: -0.14, lean: 0.14, twist: -0.12 });
const R_SH: V3 = [-0.3, 0.48, 0.0];
const L_SH: V3 = [0.3, 0.48, 0.0];

/** A blade keyed along s: straight moves between keyed grips [s, pos, dir, edge], held outside them. */
type Grip = [number, V3, V3, V3];
const keyed = (ks: Grip[], blend = 0.03, opts: { body?: boolean } = {}): Motion => {
  const l = (a: Grip, b: Grip) => line(a[1], b[1], a[2], b[2], b[3], NaN, NaN, opts);
  const parts: [number, number, Motion][] = [[ks[0][0] - 10, ks[0][0], l(ks[0], ks[0])]];
  for (let i = 1; i < ks.length; i++) parts.push([ks[i - 1][0], ks[i][0], l(ks[i - 1], ks[i])]);
  const last = ks[ks.length - 1];
  parts.push([last[0], last[0] + 10, l(last, last)]);
  return seq(parts, blend);
};

type Key = [number, V3, V3];
/** A forward-grip fist at s: the knuckles carry on from the shoulder, the point goes along `dir`. */
const fist =
  (sh: V3) =>
  (s: number, pos: V3, dir: V3): Grip => [s, pos, dir, [sh[0] - pos[0], sh[1] - pos[1], sh[2] - pos[2]]];
const gR = fist(R_SH);
const gL = fist(L_SH);
/** One hand's path from [s, fist, point] keys. */
const right = (ks: Key[], blend = 0.03, opts: { body?: boolean } = {}) => keyed(ks.map((k) => gR(...k)), blend, opts);
const left = (ks: Key[], blend = 0.03, opts: { body?: boolean } = {}) => keyed(ks.map((k) => gL(...k)), blend, opts);

// The guard (ref 3.08 s): both fists low by the hips and a little ahead, elbows soft, the points
// angled down and out at the floor in front of them
const G_R: [V3, V3] = [[-0.34, 0.1, 0.24], [-0.35, -0.32, 0.88]];
const G_L: [V3, V3] = [[0.32, 0.12, 0.27], [0.35, -0.32, 0.88]];
const at = (s: number, g: [V3, V3]): Key => [s, g[0], g[1]];
const grip = (g: [V3, V3], sh: V3) => {
  const k = fist(sh)(0, g[0], g[1]);
  return X(k[1], k[2], k[3], 'y');
};

// Nail Down: both fists raised high with the points up and ahead, then driven down into the floor
const nail = (side: 1 | -1): Motion => {
  const g = side < 0 ? gR : gL;
  const x = side;
  return keyed(
    [
      g(-0.6, [x * 0.2, 0.94, 0.02], [x * 0.08, 0.85, -0.3]),
      g(-0.05, [x * 0.2, 0.96, -0.08], [x * 0.06, 0.85, -0.5]),
      g(0.2, [x * 0.16, 0.5, 0.5], [x * 0.04, -0.4, 0.92]),
      g(0.45, [x * 0.14, -0.1, 0.5], [x * 0.03, -0.96, 0.25]),
      g(1.07, [x * 0.14, -0.12, 0.52], [x * 0.03, -0.96, 0.25]),
    ],
    0.05,
    { body: true },
  );
};

// Execution beats (seconds)
const EXEC_CUT1 = 0.44;
const EXEC_CUT2 = 0.66;
const EXEC_HIT = 2.15;
const EXEC_BODY = [
  K(0.0, B({ ...body, crouch: -0.12, lean: 0.1 }), { spin: 0, hop: 0 }),
  // the flick: the fists cocked up beside the chest, weight rocked back, then the wrists snap the
  // points down and out
  K(0.08, B({ ...body, crouch: -0.1, lean: -0.04, twist: 0, step: 0.2, back: 0.3, headPitch: 0.1 })),
  K(0.16, B({ ...body, crouch: -0.22, lean: 0.1, twist: 0, step: 0.2, back: 0.3, headPitch: 0.1 })),
  // down into the smoke and wound right round to the right, the weight on the right foot, the
  // arms wrapped up on that side: the coil for the turn
  K(0.3, B({ ...body, crouch: -0.42, lean: 0.34, twist: -0.75, hipTwist: -0.32, side: 0.08, step: 0.24, back: 0.32, width: 0.21 }), { spin: 0 }),
  // the whirl, side-bent so the arms open on the diagonal
  K(EXEC_CUT1, B({ ...body, crouch: -0.28, lean: 0.24, twist: 0, side: -0.26, step: 0.22, back: 0.24, width: 0.17 }), { spin: 0.25 }),
  // the arms gathered in for an instant, a little pull before the second blade is flung out
  K(0.56, B({ ...body, crouch: -0.32, lean: 0.28, twist: -0.2, side: -0.1, step: 0.22, back: 0.24, width: 0.17 }), { spin: 0.5 }),
  K(EXEC_CUT2, B({ ...body, crouch: -0.28, lean: 0.24, twist: 0.1, side: -0.26, step: 0.22, back: 0.24, width: 0.17 }), { spin: 0.75 }),
  // the turn's momentum caught in the knees
  K(0.8, B({ ...body, crouch: -0.4, lean: 0.34, twist: 0.1, step: 0.3, back: 0.3, width: 0.2 }), { spin: 1 }),
  // rising slowly, tall onto the toes, the weight drawn back over the rear foot and the chest
  // arched further and further back: the fangs raised as far behind the hood as the arms go
  K(1.15, B({ ...body, crouch: -0.12, lean: -0.04, twist: -0.1, step: 0.2, back: 0.3, width: 0.15, headPitch: 0.05 })),
  K(1.5, B({ ...body, crouch: 0.02, lean: -0.3, twist: -0.12, step: 0.18, back: 0.36, width: 0.14, headPitch: 0.15 })),
  // the held beat at full stretch, still breathing
  K(1.8, B({ ...body, crouch: 0.0, lean: -0.36, twist: -0.12, step: 0.18, back: 0.38, width: 0.14, headPitch: 0.18 })),
  // the legs sink under the raised fists to load the spring, the arch held
  K(1.95, B({ ...body, crouch: -0.44, lean: -0.12, twist: -0.04, step: 0.24, back: 0.4, width: 0.18, headPitch: 0.15 }), { hop: 0 }),
  // the pounce, legs first: off both feet, the hips and chest pitch out over them while the arms
  // are still back, then the fists whip over the hood and down, so both points come down from
  // above into the hollows of the collarbones
  K(2.04, B({ ...body, crouch: -0.12, lean: 0.55, twist: 0, step: 0.46, back: 0.5, width: 0.15, headPitch: 0.3 }), { hop: 0.24 }),
  K(EXEC_HIT, B({ ...body, crouch: -0.12, lean: 1.18, twist: 0.02, step: 0.5, back: 0.66, width: 0.15, headPitch: 0.55 }), { hop: 0.32 }),
  // the mass carries on down into the blades
  K(2.24, B({ ...body, crouch: -0.16, lean: 1.26, twist: 0.02, step: 0.54, back: 0.62, width: 0.15, headPitch: 0.5 }), { hop: 0.24 }),
  // hung on the blades while they stiffen, then the feet come down under
  K(2.34, B({ ...body, crouch: -0.24, lean: 1.0, twist: 0.02, step: 0.56, back: 0.56, width: 0.16, headPitch: 0.45 }), { hop: 0.12 }),
  // landed heavy, the knees giving, ripping both blades out with a push off the chest
  K(2.48, B({ ...body, crouch: -0.5, lean: 0.5, twist: 0, step: 0.56, back: 0.42, width: 0.21, headPitch: 0.15 }), { hop: 0 }),
  K(2.64, B({ ...body, crouch: -0.32, lean: 0.26, twist: 0, step: 0.44, back: 0.36, width: 0.19, headPitch: 0.15 })),
  K(3.0, B({ ...body, crouch: -0.14, lean: 0.12, twist: 0, step: 0.34, back: 0.3, width: 0.18, headPitch: 0.2 })),
];
// the right hand ([s, fist, point]) in the body's frame (unpitched by the lean, so the pounce can
// be aimed at where the kneeling man is); the left mirrors it across x
const EXEC_R: [number, V3, V3][] = [
  [0.0, G_R[0], G_R[1]],
  // cocked up by the chest, then the flick
  [0.08, [-0.4, 0.44, 0.22], [-0.3, 0.85, 0.42]],
  [0.16, [-0.48, 0.04, 0.24], [-0.55, -0.62, 0.56]],
  // wrapped back behind the right hip for the coil
  [0.3, [-0.44, 0.24, -0.2], [-0.45, -0.8, -0.1]],
  // flung out high on the diagonal for the whirl
  [EXEC_CUT1, [-0.66, 0.74, 0.2], [-0.78, 0.45, 0.44]],
  [0.56, [-0.4, 0.56, 0.16], [-0.6, 0.6, 0.5]],
  [EXEC_CUT2, [-0.66, 0.74, 0.18], [-0.78, 0.45, 0.42]],
  [0.8, [-0.42, 0.28, 0.34], [-0.3, -0.25, 0.92]],
  // raised high and drawn back behind the hood, the elbows cocked, the point up
  [1.15, [-0.3, 0.8, 0.12], [-0.1, 0.85, 0.5]],
  [1.5, [-0.26, 1.0, -0.06], [-0.06, 0.98, 0.18]],
  [1.8, [-0.26, 1.0, -0.12], [-0.06, 0.99, 0.1]],
  [1.95, [-0.26, 0.98, -0.1], [-0.06, 0.99, 0.12]],
  // still back as the body launches, then over the hood and down, the wrist snapping the point
  // down into the collarbone
  [2.04, [-0.22, 1.0, 0.24], [-0.03, 0.85, 0.52]],
  [2.1, [-0.18, 0.68, 0.7], [-0.01, 0.15, 0.99]],
  [EXEC_HIT, [-0.13, 0.08, 0.95], [0.04, -0.32, 0.95]],
  [2.24, [-0.13, 0.0, 0.92], [0.04, -0.4, 0.92]],
  [2.34, [-0.13, 0.02, 0.92], [0.04, -0.38, 0.92]],
  // ripped out and flicked clean, out low to the side
  [2.48, [-0.3, 0.3, 0.6], [-0.4, 0.2, 0.9]],
  [2.62, [-0.54, 0.1, 0.26], [-0.7, -0.62, 0.36]],
  [3.0, [-0.5, 0.1, 0.24], [-0.6, -0.7, 0.38]],
];
const mirror = (ks: [number, V3, V3][], swap: Record<number, [V3, V3]> = {}): [number, V3, V3][] =>
  ks.map(([s, p, d]) => (swap[s] ? [s, ...swap[s]] : [s, [-p[0], p[1], p[2]], [-d[0], d[1], d[2]]]));
// the left: the same, but low when the right is high in the whirl (and the other way round)
const EXEC_L = mirror(EXEC_R, {
  0: [G_L[0], G_L[1]],
  [EXEC_CUT1]: [[0.6, 0.12, 0.16], [0.78, -0.45, 0.44]],
  [EXEC_CUT2]: [[0.6, 0.12, 0.14], [0.78, -0.45, 0.42]],
  // in the coil the left is wrapped across the belly toward the right hip
  0.3: [[-0.06, 0.22, 0.3], [-0.8, -0.3, 0.5]],
  0.56: [[0.3, 0.3, 0.2], [0.6, -0.3, 0.74]],
});

// Entrance blades: sheathed-looking along the forearms, drawn from the right thigh and the small
// of the back
const SHEATH_R: V3 = [-0.1, -0.3, -1];
const SHEATH_L: V3 = [0.1, -0.3, -1];
const UP: V3 = [0, 1, 0];

export const daggers: Style = {
  axis: 'y',
  offAxis: 'y',
  trail: { light: '#efe0ff', heavy: '#b55088', special: '#ff2a6a' },
  sparks: ['#ffffff', '#e8c8ff', '#b55088'],
  guard: P(body, grip(G_R, R_SH), grip(G_L, L_SH)),
  // wrists crossed before the chin, both points up and out past the other shoulder
  block: P(
    B({ ...body, crouch: -0.24, lean: 0.2, twist: 0, headPitch: 0.15 }),
    grip([[-0.06, 0.6, 0.36], [0.5, 0.66, 0.56]], R_SH),
    grip([[0.06, 0.62, 0.38], [-0.5, 0.66, 0.56]], L_SH),
  ),
  moves: {
    // Scissor Cut (ref 3.67-3.83 s): the right fist cocked back by the ear, then the hips snap
    // round to the left ahead of the shoulders and the right blade is hooked across in front of
    // the face as the left fist jabs its point in low under it
    l0: mv({
      keys: [
        K(-0.35, B({ ...body, twist: -0.6, hipTwist: -0.22, crouch: -0.16, lean: 0.08, step: 0.22, back: 0.26 })),
        K(0.45, B({ ...body, twist: 0.34, hipTwist: 0.22, crouch: -0.24, lean: 0.3, side: -0.08, step: 0.44, back: 0.32 })),
        K(1.07, B({ ...body, twist: 0.55, hipTwist: 0.26, crouch: -0.26, lean: 0.32, side: -0.1, step: 0.46, back: 0.34 })),
      ],
      main: right([
        [-0.35, [-0.5, 0.66, 0.04], [0.15, 0.3, 0.94]],
        [0.15, [-0.46, 0.64, 0.3], [0.55, 0.15, 0.82]],
        [0.45, [-0.3, 0.62, 0.48], [0.86, 0.1, 0.5]],
        [0.75, [-0.04, 0.58, 0.46], [0.9, -0.05, -0.1]],
        [1.07, [0.1, 0.54, 0.38], [0.75, -0.15, -0.6]],
      ]),
      off: left([
        [-0.35, [0.3, 0.18, 0.22], [0.3, -0.3, 0.9]],
        [0.15, [0.26, 0.14, 0.3], [0.2, -0.1, 0.97]],
        [0.45, [0.2, 0.12, 0.46], [0.1, 0.05, 1]],
        [1.07, [0.24, 0.1, 0.42], [0.15, -0.1, 0.98]],
      ]),
      impacts: [0.45],
      start: -0.35,
      chamber: -0.3,
      rest: 1.07,
      fx: [fx(0.45, 'sparkle', 'tip', 0.6), fx(0.4, 'dust', 'feet', 0.5)],
      trail: { life: 0.14 },
    }),
    // Cross Open (ref 3.92-4.00 s): hunched over wrists crossed at the belly, then up tall off the
    // legs and both blades thrown open outward through them, the arms ending spread wide
    l1: mv({
      keys: [
        K(-0.25, B({ ...body, twist: 0, crouch: -0.3, lean: 0.34, step: 0.24, back: 0.28, headPitch: 0.2 }), { hop: 0 }),
        K(0.45, B({ ...body, twist: 0, crouch: -0.08, lean: 0.06, step: 0.38, back: 0.32, width: 0.21, headPitch: -0.05 }), { hop: 0.08 }),
        K(1.07, B({ ...body, twist: 0, crouch: -0.16, lean: 0.12, step: 0.38, back: 0.34, width: 0.22 }), { hop: 0 }),
      ],
      main: right([
        [-0.25, [0.04, 0.3, 0.34], [0.8, 0.35, 0.5]],
        [0.0, [-0.06, 0.4, 0.42], [0.45, 0.3, 0.84]],
        [0.45, [-0.36, 0.52, 0.48], [-0.72, 0.06, 0.69]],
        [1.07, [-0.72, 0.55, 0.3], [-0.95, 0.1, -0.25]],
      ]),
      off: left([
        [-0.25, [-0.02, 0.32, 0.36], [-0.8, 0.35, 0.5]],
        [0.0, [0.08, 0.42, 0.44], [-0.45, 0.3, 0.84]],
        [0.45, [0.36, 0.54, 0.5], [0.72, 0.06, 0.69]],
        [1.07, [0.72, 0.57, 0.3], [0.95, 0.1, -0.25]],
      ]),
      impacts: [0.45],
      start: -0.25,
      chamber: -0.2,
      rest: 1.07,
      fx: [fx(0.45, 'sparkle', 'tip', 0.6), fx(0.45, 'sparkle', 'offTip', 0.6), fx(0.75, 'dust', 'feet', 0.5)],
      trail: { life: 0.16, glow: 0.3 },
    }),
    // Whirl (ref 7.17-7.42 s): leaned over into a full turn to the left with the arms flung open
    // on a diagonal, right high and left low; the right blade passes them a quarter of the way
    // round, the left at three quarters, and both close in low and ahead as the turn comes home
    l2: mv({
      keys: [
        K(-0.5, B({ ...body, twist: -0.4, crouch: -0.24, lean: 0.25 }), { spin: 0 }),
        K(0.3, B({ ...body, twist: 0, crouch: -0.2, lean: 0.24, side: -0.28, step: 0.2, back: 0.22, width: 0.15 }), { spin: 0.25 }),
        K(0.6, B({ ...body, twist: 0, crouch: -0.24, lean: 0.26, side: -0.28, step: 0.2, back: 0.22, width: 0.15 }), { spin: 0.75 }),
        K(0.9, B({ ...body, twist: 0, crouch: -0.34, lean: 0.36, side: 0, step: 0.38, back: 0.36, width: 0.2 }), { spin: 1.0 }),
        K(1.07, B({ ...body, twist: 0, crouch: -0.36, lean: 0.38, step: 0.38, back: 0.38, width: 0.21 }), { spin: 1.0 }),
      ],
      main: right([
        [-0.5, [-0.46, 0.4, 0.22], [-0.6, -0.1, 0.8]],
        [-0.1, [-0.6, 0.78, 0.18], [-0.75, 0.5, 0.42]],
        [0.6, [-0.6, 0.78, 0.16], [-0.75, 0.5, 0.4]],
        [0.9, [-0.08, 0.3, 0.5], [0.55, -0.05, 0.84]],
        [1.07, [-0.02, 0.28, 0.5], [0.62, -0.1, 0.78]],
      ]),
      off: left([
        [-0.5, [0.4, 0.14, 0.24], [0.55, -0.35, 0.76]],
        [-0.1, [0.62, 0.16, 0.14], [0.78, -0.4, 0.48]],
        [0.6, [0.62, 0.16, 0.12], [0.78, -0.4, 0.46]],
        [0.9, [0.1, 0.24, 0.48], [-0.55, -0.05, 0.84]],
        [1.07, [0.06, 0.22, 0.48], [-0.62, -0.1, 0.78]],
      ]),
      impacts: [0.3, 0.6, 0.9],
      start: -0.5,
      chamber: -0.2,
      flow: 1.4,
      blendIn: 0.35,
      lead: 0,
      end: 1.07,
      rest: 1.07,
      ghosts: [0.0, 0.95],
      fx: [fx(-0.1, 'whirl', 'root', 0.7, '#efe0ff'), fx(0.3, 'sparkle', 'tip', 0.45), fx(0.6, 'sparkle', 'offTip', 0.45), fx(0.9, 'sparkle', 'tip', 0.55), fx(0.9, 'dust', 'feet', 0.6)],
      trail: { life: 0.2, glow: 0.4 },
    }),
    // Falling Fang (ref 6.25-6.58 s): drawn up tall onto the toes with both fists raised high and
    // the points up, the chest arched back; then the whole body dives down after them, the hips
    // dropping and the chest folding flat over the front knee, both blades driven out low and
    // ahead as the rear leg lifts off behind
    h: mv({
      keys: [
        K(-0.75, B({ ...body, crouch: -0.24, lean: 0.24 }), { hop: 0 }),
        // the pull: tall on the rear foot, the chest arched right back, both fists drawn back
        // behind the hood with the elbows cocked
        K(-0.15, B({ ...body, crouch: 0.02, lean: -0.34, twist: -0.25, step: 0.2, back: 0.34, headPitch: 0.22 }), { hop: 0.1 }),
        // the drive, legs and hips first: the front foot reaches and the chest pitches over while
        // the arms are still back
        K(0.12, B({ ...body, crouch: -0.2, lean: 0.4, twist: -0.05, step: 0.5, back: 0.46, headPitch: -0.1 }), { hop: 0.06 }),
        K(0.45, B({ ...body, crouch: -0.46, lean: 0.9, twist: 0.08, step: 0.66, back: 0.56, headPitch: -0.35 }), { hop: 0 }),
        // the mass carries on down, the knees giving, the momentum dragging the chest round
        K(0.75, B({ ...body, crouch: -0.56, lean: 1.0, twist: 0.16, step: 0.68, back: 0.58, headPitch: -0.3 })),
        K(1.07, B({ ...body, crouch: -0.58, lean: 0.94, twist: 0.18, step: 0.68, back: 0.6, headPitch: -0.25 })),
      ],
      main: right(
        [
          at(-0.75, G_R),
          [-0.15, [-0.24, 0.98, -0.12], [0.05, 0.9, -0.42]],
          [0.12, [-0.22, 0.94, 0.12], [0.06, 0.94, 0.3]],
          [0.28, [-0.2, 0.74, 0.5], [0.04, 0.05, 1]],
          [0.45, [-0.14, 0.54, 0.5], [0.02, 0.72, 0.7]],
          [0.75, [-0.12, 0.42, 0.54], [0.02, 0.45, 0.9]],
          [1.07, [-0.12, 0.4, 0.52], [0.02, 0.4, 0.92]],
        ],
        0.04,
      ),
      off: left(
        [
          at(-0.75, G_L),
          [-0.15, [0.2, 0.94, -0.1], [-0.05, 0.9, -0.42]],
          [0.12, [0.18, 0.9, 0.12], [-0.06, 0.94, 0.3]],
          [0.28, [0.16, 0.66, 0.5], [-0.04, 0.0, 1]],
          [0.45, [0.2, 0.3, 0.44], [0.1, 0.2, 0.97]],
          [0.75, [0.22, 0.22, 0.44], [0.1, 0.0, 1]],
          [1.07, [0.24, 0.2, 0.42], [0.1, -0.05, 0.99]],
        ],
        0.04,
      ),
      kick: { foot: 'R', from: 0.2, to: 0.95, path: track([[0, [-0.14, 0.2, -0.3]], [0.5, [-0.15, 0.5, -0.72]], [1, [-0.15, 0.42, -0.66]]]) },
      impacts: [0.45],
      start: -0.75,
      chamber: -0.15,
      ghosts: [0.1, 0.6],
      fx: [fx(-0.7, 'dust', 'feet', 0.5), fx(0.45, 'flashline', 'tip', 0.7), fx(0.45, 'sparkle', 'tip', 0.9), fx(0.5, 'stomp', 'feet', 0.5)],
      trail: { life: 0.2, glow: 0.6 },
    }),
    // Long Thorn (ref 0.67-0.92 s): up out of the fang with the left blade raised over the hood and
    // the right fist dropped back to the hip; the left chops down across the front as the body
    // drops into a lunge so deep it lies along the arm, and the right blade is driven out low and
    // straight into them, the left flung back behind for balance
    h1: mv({
      keys: [
        // the pull: the weight right back over the rear foot, the hips and shoulders wound round to
        // the right, the right fist drawn back behind the hip and the left raised back over the hood
        K(-0.4, B({ ...body, crouch: -0.12, lean: -0.06, twist: -0.75, hipTwist: -0.3, step: 0.24, back: 0.36, headPitch: 0.12 })),
        // the drive: the front foot reaches out long and the hips unwind before the arm comes
        K(0.05, B({ ...body, crouch: -0.36, lean: 0.5, twist: -0.25, hipTwist: 0, step: 0.55, back: 0.5, headPitch: -0.1 })),
        K(0.45, B({ ...body, crouch: -0.6, lean: 1.0, twist: 0.3, hipTwist: 0.1, step: 0.9, back: 0.78, width: 0.17, headPitch: -0.55 })),
        // the stab carried on through, the front knee taking the weight and the chest turned on
        K(0.75, B({ ...body, crouch: -0.66, lean: 1.06, twist: 0.42, hipTwist: 0.14, step: 0.92, back: 0.8, width: 0.17, headPitch: -0.5 })),
        K(1.07, B({ ...body, crouch: -0.66, lean: 0.98, twist: 0.44, hipTwist: 0.14, step: 0.92, back: 0.8, width: 0.17, headPitch: -0.45 })),
      ],
      main: right(
        [
          [-0.4, [-0.42, 0.18, -0.3], [-0.15, -0.45, 0.88]],
          [0.05, [-0.4, 0.24, -0.12], [0.05, 0.3, 0.95]],
          [0.45, [-0.16, 0.42, 0.54], [0.05, 0.6, 0.8]],
          [0.75, [-0.12, 0.4, 0.62], [0.05, 0.5, 0.86]],
          [1.07, [-0.12, 0.4, 0.6], [0.05, 0.48, 0.88]],
        ],
        0.03,
        { body: true },
      ),
      off: left(
        [
          [-0.4, [0.18, 0.98, 0.0], [-0.8, 0.35, -0.2]],
          [-0.1, [0.1, 0.62, 0.5], [-0.4, -0.5, 0.77]],
          [0.15, [0.34, 0.16, 0.24], [0.3, -0.6, 0.74]],
          [0.45, [0.4, 0.34, -0.3], [0.45, -0.1, -0.89]],
          [1.07, [0.4, 0.36, -0.32], [0.45, -0.1, -0.89]],
        ],
        0.03,
        { body: true },
      ),
      impacts: [0.45],
      start: -0.4,
      chamber: -0.35,
      ghosts: [0.0, 0.55],
      fx: [fx(0.05, 'dust', 'feet', 0.9), fx(0.3, 'spiral', 'tip', 0.6), fx(0.45, 'flashline', 'tip', 1), fx(0.45, 'sparkle', 'tip', 0.9)],
      trail: { life: 0.2, glow: 0.6 },
    }),
    // Sky Lotus (ref 10.67-11.00 s): reared up tall with the left blade raised high over the hood
    // and the right low, the left is chopped down through them out to the side; then the hips
    // whip the body round a full turn to the left with both arms spread wide, the right blade
    // sweeping through them a quarter of the way round
    h2: mv({
      keys: [
        K(-1.2, B({ ...body, crouch: -0.3, lean: 0.3, step: 0.3, back: 0.34 }), { spin: 0, hop: 0 }),
        // the pull: reared up tall on the rear foot, chest arched, wound round to the right with the
        // left fist drawn back over the right side of the hood and the right fist back behind the hip
        K(-0.2, B({ ...body, crouch: 0.02, lean: -0.22, twist: -0.6, hipTwist: -0.3, step: 0.2, back: 0.34, headPitch: 0.18 }), { spin: 0, hop: 0.06 }),
        // the hips unwind first, the chest after, the arm last
        K(0.2, B({ ...body, crouch: -0.16, lean: 0.16, twist: -0.1, hipTwist: 0.1, step: 0.36, back: 0.36, width: 0.19 }), { spin: 0, hop: 0.02 }),
        K(0.45, B({ ...body, crouch: -0.32, lean: 0.42, twist: 0.3, hipTwist: 0.15, step: 0.42, back: 0.36, width: 0.2 }), { spin: 0, hop: 0 }),
        K(0.55, B({ ...body, crouch: -0.32, lean: 0.3, twist: 0, step: 0.3, back: 0.3, width: 0.2 }), { spin: 0.04 }),
        K(0.75, B({ ...body, crouch: -0.34, lean: 0.28, twist: 0, side: -0.12, step: 0.3, back: 0.3, width: 0.22 }), { spin: 0.25 }),
        // the turn caught in the knees, the arms still dragging round
        K(1.1, B({ ...body, crouch: -0.48, lean: 0.4, twist: 0.12, step: 0.38, back: 0.42, width: 0.23 }), { spin: 1.0 }),
      ],
      main: right([
        at(-1.2, G_R),
        [-0.2, [-0.42, 0.14, -0.22], [-0.3, -0.9, -0.3]],
        [0.45, [-0.5, 0.22, 0.12], [-0.6, -0.4, 0.7]],
        [0.55, [-0.66, 0.56, 0.12], [-0.92, 0.1, 0.38]],
        [0.75, [-0.68, 0.56, 0.1], [-0.92, 0.1, 0.36]],
        [1.1, [-0.6, 0.5, 0.2], [-0.8, 0.0, 0.6]],
      ]),
      off: left([
        at(-1.2, G_L),
        [-0.2, [0.08, 0.98, -0.06], [-0.75, 0.6, -0.25]],
        [0.2, [0.12, 0.8, 0.36], [-0.4, 0.2, 0.9]],
        [0.32, [0.16, 0.6, 0.5], [-0.2, -0.45, 0.87]],
        [0.45, [0.34, 0.22, 0.42], [0.3, -0.7, 0.65]],
        [0.55, [0.6, 0.16, 0.16], [0.8, -0.45, 0.4]],
        [1.1, [0.6, 0.2, 0.2], [0.8, -0.35, 0.48]],
      ]),
      impacts: [0.45, 0.75],
      start: -1.2,
      chamber: -0.2,
      blendIn: 0.5,
      end: 1.1,
      rest: 1.1,
      ghosts: [0.45, 1.0],
      fx: [
        fx(-1.1, 'dust', 'feet', 0.8),
        fx(0.45, 'sparkle', 'offTip', 0.8),
        fx(0.45, 'stomp', 'feet', 0.5),
        fx(0.55, 'whirl', 'root', 0.9, '#b55088'),
        fx(0.75, 'sparkle', 'tip', 0.9),
        fx(1.0, 'dust', 'feet', 0.8),
      ],
      trail: { life: 0.24, glow: 0.6 },
    }),
    // Swallow Dive (ref 4.42-4.67 s and 0.00 s): down into a crouch, then launched flat through
    // the air like the reference's dive, both arms stretched out ahead past the hood with the
    // points forward and the legs trailing, turning one full corkscrew about the body's length
    // into them before the feet swing back under for the landing
    sp: mv({
      keys: [
        K(-1.0, B({ ...body, crouch: -0.36, lean: 0.4, twist: 0 }), { flip: 0, hop: 0, spin: 0 }),
        // the load: sunk deep, the weight back on the heels and the arms swept right back behind
        K(-0.6, B({ ...body, crouch: -0.6, lean: 0.8, twist: 0, step: 0.36, back: 0.56, headPitch: -0.2 }), { flip: 0.02, hop: 0 }),
        K(-0.42, B({ ...body, crouch: -0.62, lean: 0.84, twist: 0, step: 0.36, back: 0.56, headPitch: -0.25 }), { flip: 0.03, hop: 0 }),
        K(-0.3, B({ ...body, crouch: -0.2, lean: 0.4, twist: 0, step: 0.2, back: 0.3, headPitch: -0.3 }), { flip: 0.14, hop: 0.3, spin: 0 }),
        K(0.0, B({ ...body, crouch: -0.15, lean: 0.05, twist: 0, step: 0.12, back: 0.2, headPitch: -0.4 }), { flip: 0.24, hop: 0.42 }),
        K(0.45, B({ ...body, crouch: -0.15, lean: 0.05, twist: 0, step: 0.12, back: 0.2, headPitch: -0.4 }), { flip: 0.25, hop: 0.36, spin: 1 }),
        K(1.07, B({ ...body, crouch: -0.2, lean: 0.1, twist: 0, step: 0.2, back: 0.24, headPitch: -0.3 }), { flip: 0.2, hop: 0.25 }),
        // landed heavy: the knees give and the weight sinks before it settles
        K(1.3, B({ ...body, crouch: -0.56, lean: 0.52, twist: 0, step: 0.4, back: 0.44, width: 0.21 }), { flip: 0, hop: 0 }),
        K(1.5, B({ ...body, crouch: -0.42, lean: 0.4, twist: 0, step: 0.36, back: 0.4, width: 0.2 }), { flip: 0, hop: 0 }),
      ],
      main: right([
        [-1.0, [-0.36, 0.12, -0.08], [-0.3, -0.5, 0.8]],
        [-0.6, [-0.36, 0.3, -0.36], [-0.25, -0.85, -0.45]],
        [-0.42, [-0.36, 0.32, -0.38], [-0.25, -0.85, -0.45]],
        [-0.2, [-0.16, 0.92, 0.26], [0.05, 1, -0.05]],
        [1.07, [-0.16, 0.94, 0.26], [0.05, 1, -0.05]],
        [1.5, [-0.34, 0.16, 0.26], [-0.3, -0.3, 0.9]],
      ]),
      off: left([
        [-1.0, [0.36, 0.12, -0.08], [0.3, -0.5, 0.8]],
        [-0.6, [0.36, 0.3, -0.36], [0.25, -0.85, -0.45]],
        [-0.42, [0.36, 0.32, -0.38], [0.25, -0.85, -0.45]],
        [-0.2, [0.16, 0.92, 0.28], [-0.05, 1, -0.05]],
        [1.07, [0.16, 0.94, 0.28], [-0.05, 1, -0.05]],
        [1.5, [0.32, 0.16, 0.28], [0.3, -0.3, 0.9]],
      ]),
      impacts: [0.45],
      start: -1.0,
      chamber: -0.3,
      flow: 1,
      blendIn: 0.25,
      lead: 0,
      end: 1.07,
      rest: 1.5,
      settle: 0.7,
      ghosts: [-0.3, 1.0],
      fx: [
        fx(-0.9, 'smoke', 'feet', 0.6),
        fx(-0.35, 'dust', 'feet', 1.0),
        fx(-0.2, 'spiral', 'tip', 0.8, '#ff2a6a'),
        fx(0.45, 'flashline', 'tip', 1),
        fx(0.45, 'sparkle', 'tip', 0.9, '#ff2a6a'),
        fx(0.45, 'sparkle', 'offTip', 0.9, '#ff2a6a'),
        fx(1.45, 'dust', 'feet', 0.8),
      ],
      trail: { life: 0.22, glow: 0.7 },
    }),
    // Dart (ref 4.42-4.67 s): out of the dodge into the reference's lunging dive, the chest flat
    // and the rear leg kicked up behind; the right blade cuts low and flat across them, then the
    // left is swept up through them as the feet come down
    dl: mv({
      keys: [
        K(-0.6, B({ ...body, crouch: -0.4, lean: 0.55, twist: 0, step: 0.4, back: 0.46 }), { flip: 0, hop: 0 }),
        K(0.0, B({ ...body, crouch: -0.3, lean: 0.55, twist: 0.3, step: 0.3, back: 0.3, headPitch: -0.45 }), { flip: 0.12, hop: 0.3 }),
        K(0.45, B({ ...body, crouch: -0.3, lean: 0.55, twist: 0.35, step: 0.3, back: 0.3, headPitch: -0.45 }), { flip: 0.14, hop: 0.26 }),
        K(0.75, B({ ...body, crouch: -0.32, lean: 0.4, twist: -0.25, step: 0.36, back: 0.36, headPitch: -0.2 }), { flip: 0.06, hop: 0.1 }),
        K(1.07, B({ ...body, crouch: -0.42, lean: 0.42, twist: -0.15, step: 0.5, back: 0.5, width: 0.21 }), { flip: 0, hop: 0 }),
      ],
      main: right([
        [-0.6, [-0.38, 0.14, -0.06], [-0.3, -0.5, 0.8]],
        [-0.15, [-0.56, 0.4, 0.2], [-0.6, -0.1, 0.8]],
        [0.2, [-0.4, 0.36, 0.42], [-0.1, -0.25, 0.96]],
        [0.45, [-0.14, 0.34, 0.5], [0.55, -0.25, 0.8]],
        [1.07, [0.14, 0.3, 0.36], [0.9, -0.3, 0.3]],
      ]),
      off: left([
        [-0.6, [0.34, 0.14, 0.0], [0.3, -0.5, 0.8]],
        [0.2, [0.34, 0.2, 0.32], [0.3, -0.45, 0.84]],
        [0.5, [0.3, 0.16, 0.36], [0.25, -0.5, 0.83]],
        [0.75, [0.2, 0.62, 0.46], [-0.2, 0.75, 0.62]],
        [1.07, [0.34, 0.8, 0.24], [0.1, 0.9, 0.42]],
      ]),
      kick: { foot: 'R', from: -0.3, to: 0.7, path: track([[0, [-0.12, 0.25, -0.45]], [0.4, [-0.14, 0.55, -0.85]], [1, [-0.14, 0.45, -0.8]]]) },
      impacts: [0.45, 0.75],
      start: -0.6,
      chamber: -0.15,
      flow: 1,
      blendIn: 0.3,
      lead: 0,
      end: 1.07,
      rest: 1.07,
      ghosts: [-0.3, 0.8],
      fx: [fx(-0.5, 'dust', 'feet', 0.8), fx(0.45, 'sparkle', 'tip', 0.6), fx(0.75, 'sparkle', 'offTip', 0.7), fx(1.0, 'dust', 'feet', 0.9)],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Corkscrew (ref 8.00-8.08 s): thrown forward flat off the dodge, low, both arms reaching out
    // ahead with the points forward in a narrow V, and spun one full turn about the body's length
    // like a drill bit
    dh: mv({
      keys: [
        // the load: sunk low with the arms swept back behind, the weight on the rear foot
        K(-0.6, B({ ...body, crouch: -0.52, lean: 0.72, twist: 0, step: 0.36, back: 0.54 }), { flip: 0, hop: 0, spin: 0 }),
        K(-0.46, B({ ...body, crouch: -0.56, lean: 0.76, twist: 0, step: 0.36, back: 0.54, headPitch: -0.2 }), { flip: 0.01, hop: 0, spin: 0 }),
        K(-0.2, B({ ...body, crouch: -0.2, lean: 0.25, twist: 0, step: 0.2, back: 0.3, headPitch: -0.4 }), { flip: 0.17, hop: 0.26, spin: 0 }),
        K(0.45, B({ ...body, crouch: -0.2, lean: 0.2, twist: 0, step: 0.2, back: 0.3, headPitch: -0.4 }), { flip: 0.2, hop: 0.26, spin: 1 }),
        K(0.75, B({ ...body, crouch: -0.24, lean: 0.25, twist: 0, step: 0.3, back: 0.36, headPitch: -0.3 }), { flip: 0.14, hop: 0.14 }),
        K(1.07, B({ ...body, crouch: -0.5, lean: 0.5, twist: 0, step: 0.48, back: 0.5, width: 0.22 }), { flip: 0, hop: 0 }),
      ],
      main: right([
        [-0.6, [-0.36, 0.28, -0.34], [-0.25, -0.85, -0.45]],
        [-0.46, [-0.36, 0.3, -0.36], [-0.25, -0.85, -0.45]],
        [-0.2, [-0.3, 0.9, 0.2], [-0.25, 0.97, 0.0]],
        [0.6, [-0.3, 0.9, 0.2], [-0.25, 0.97, 0.0]],
        [1.07, [-0.4, 0.46, 0.38], [-0.45, 0.1, 0.89]],
      ]),
      off: left([
        [-0.6, [0.36, 0.28, -0.34], [0.25, -0.85, -0.45]],
        [-0.46, [0.36, 0.3, -0.36], [0.25, -0.85, -0.45]],
        [-0.2, [0.3, 0.9, 0.2], [0.25, 0.97, 0.0]],
        [0.6, [0.3, 0.9, 0.2], [0.25, 0.97, 0.0]],
        [1.07, [0.4, 0.46, 0.38], [0.45, 0.1, 0.89]],
      ]),
      impacts: [0.45],
      start: -0.6,
      chamber: -0.2,
      flow: 1.1,
      blendIn: 0.3,
      lead: 0,
      end: 1.07,
      rest: 1.07,
      ghosts: [-0.3, 0.8],
      fx: [fx(-0.5, 'smoke', 'feet', 0.8), fx(-0.25, 'dust', 'feet', 0.9), fx(0.0, 'spiral', 'tip', 0.8), fx(0.2, 'spiral', 'offTip', 0.8), fx(0.45, 'flashline', 'tip', 1), fx(0.45, 'sparkle', 'tip', 0.9), fx(1.0, 'dust', 'feet', 0.8)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    // Fan Retreat (ref 3.83-3.92 s, the backhand out of the hook): a spring backward off the front
    // foot, the right blade fanned backhand from the left hip out across them to the right as the
    // left fist is pulled in before the chin to cover the retreat, the weight sitting back over the
    // rear leg
    bl: mv({
      keys: [
        K(-0.3, B({ ...body, crouch: -0.24, lean: 0.3, twist: 0.45, hipTwist: 0.15, step: 0.26, back: 0.3 }), { hop: 0, flip: 0 }),
        K(0.45, B({ ...body, crouch: -0.14, lean: -0.22, twist: -0.3, hipTwist: -0.15, step: 0.2, back: 0.56, width: 0.21, headPitch: 0.15 }), { hop: 0.14, flip: -0.03 }),
        K(1.07, B({ ...body, crouch: -0.32, lean: 0.0, twist: -0.35, step: 0.2, back: 0.6, width: 0.21 }), { hop: 0, flip: 0 }),
      ],
      main: right([
        [-0.3, [0.14, 0.3, 0.3], [0.7, -0.1, 0.7]],
        [0.15, [-0.06, 0.46, 0.5], [0.35, 0.05, 0.94]],
        [0.45, [-0.32, 0.52, 0.5], [-0.45, 0.05, 0.89]],
        [1.07, [-0.66, 0.5, 0.22], [-0.95, 0.0, 0.3]],
      ]),
      off: left([
        [-0.3, [0.32, 0.2, 0.3], [0.3, -0.3, 0.9]],
        [0.45, [0.12, 0.6, 0.34], [-0.2, 0.4, 0.9]],
        [1.07, [0.14, 0.58, 0.34], [-0.2, 0.4, 0.9]],
      ]),
      impacts: [0.45],
      start: -0.3,
      chamber: -0.25,
      rest: 1.07,
      fx: [fx(0.0, 'smoke', 'feet', 0.9), fx(0.45, 'sparkle', 'tip', 0.5), fx(1.0, 'dust', 'feet', 0.6)],
      trail: { life: 0.12 },
    }),
    // Low Viper (ref 11.50-11.92 s): dropped back into a wide squat with the right point jabbed at
    // the floor, then the hips sink over the rear leg as the front leg is shot out straight and
    // the right blade sweeps flat along the ground in front of it, the left raised up high
    bh: mv({
      keys: [
        K(-0.5, B({ ...body, crouch: -0.26, lean: 0.24 })),
        // the pull: sunk into the wide squat with the weight on the rear leg, the hips and shoulders
        // wound right round, the right fist drawn back behind the hip, the left reaching forward
        K(-0.05, B({ ...body, crouch: -0.58, lean: 0.3, twist: -0.75, hipTwist: -0.3, step: 0.24, back: 0.5, width: 0.3, headPitch: 0.1 })),
        // the hips unwind first as the front leg shoots out
        K(0.2, B({ ...body, crouch: -0.6, lean: 0.45, twist: -0.2, hipTwist: 0.05, step: 0.6, back: 0.54, width: 0.29, side: 0.05, headPitch: -0.1 })),
        K(0.45, B({ ...body, crouch: -0.62, lean: 0.55, twist: 0.3, hipTwist: 0.1, step: 0.68, back: 0.56, width: 0.28, side: 0.1, headPitch: -0.2 })),
        // the sweep drags the chest on round, the weight settling lower
        K(1.07, B({ ...body, crouch: -0.66, lean: 0.52, twist: 0.5, hipTwist: 0.14, step: 0.68, back: 0.56, width: 0.28, side: 0.12, headPitch: -0.15 })),
      ],
      main: right(
        [
          [-0.5, [-0.36, 0.14, 0.2], [-0.3, -0.45, 0.84]],
          [-0.05, [-0.5, 0.14, -0.24], [-0.3, -0.9, -0.3]],
          [0.2, [-0.46, 0.0, 0.38], [-0.4, -0.2, 0.9]],
          [0.45, [-0.1, -0.02, 0.56], [0.45, -0.25, 0.86]],
          [1.07, [0.26, 0.0, 0.42], [0.95, -0.2, 0.22]],
        ],
        0.03,
        { body: true },
      ),
      off: left(
        [
          [-0.5, [0.32, 0.16, 0.26], [0.35, -0.32, 0.88]],
          [-0.05, [0.36, 0.42, 0.36], [0.5, 0.35, 0.79]],
          [0.45, [0.4, 0.9, 0.0], [0.3, 0.9, 0.3]],
          [1.07, [0.38, 0.88, 0.0], [0.3, 0.9, 0.3]],
        ],
        0.03,
        { body: true },
      ),
      impacts: [0.45],
      start: -0.5,
      chamber: -0.05,
      ghosts: [-0.4, 0.0],
      fx: [fx(-0.4, 'smoke', 'feet', 0.9), fx(-0.05, 'dust', 'feet', 0.9), fx(0.45, 'quake', 'tip', 0.6), fx(0.45, 'sparkle', 'tip', 0.8)],
      trail: { life: 0.18, glow: 0.5 },
    }),
    // Cartwheel (ref 2.00-2.25 s): the reference's forward handspring thrown in the air, the body
    // pitched over head first with both arms stretched out past the hood, the blades raking down
    // through them as the body goes flat, and on over to land on the feet
    jl: mv({
      keys: [
        K(-0.6, B({ ...body, crouch: -0.2, lean: 0.2, twist: 0, width: 0.12 }), { flip: 0, hop: 0 }),
        K(-0.2, B({ ...body, crouch: -0.12, lean: 0.3, twist: 0, width: 0.12, headPitch: -0.3 }), { flip: 0.1, hop: 0.36 }),
        K(0.45, B({ ...body, crouch: -0.16, lean: 0.1, twist: 0, width: 0.13, headPitch: -0.3 }), { flip: 0.2, hop: 0.5 }),
        K(0.8, B({ ...body, crouch: -0.3, lean: 0.4, twist: 0, step: 0.1, back: 0.1, width: 0.12 }), { flip: 0.75, hop: 0.45 }),
        K(1.07, B({ ...body, crouch: -0.24, lean: 0.25, twist: 0, width: 0.15 }), { flip: 1, hop: 0.12 }),
      ],
      main: right([
        [-0.6, [-0.4, 0.4, 0.24], [-0.4, 0.1, 0.9]],
        [-0.2, [-0.22, 0.94, 0.22], [-0.1, 0.8, 0.6]],
        [0.45, [-0.22, 0.86, 0.42], [-0.05, 0.8, 0.6]],
        [0.8, [-0.3, 0.5, 0.5], [-0.1, -0.4, 0.9]],
        [1.07, [-0.4, 0.4, 0.3], [-0.4, -0.2, 0.9]],
      ]),
      off: left([
        [-0.6, [0.4, 0.4, 0.24], [0.4, 0.1, 0.9]],
        [-0.2, [0.22, 0.94, 0.22], [0.1, 0.8, 0.6]],
        [0.45, [0.22, 0.86, 0.42], [0.05, 0.8, 0.6]],
        [0.8, [0.3, 0.5, 0.5], [0.1, -0.4, 0.9]],
        [1.07, [0.4, 0.4, 0.3], [0.4, -0.2, 0.9]],
      ]),
      impacts: [0.45],
      start: -0.6,
      chamber: -0.3,
      flow: 1.2,
      blendIn: 0.3,
      lead: 0,
      end: 1.07,
      rest: 1.07,
      fx: [fx(-0.3, 'whirl', 'root', 0.5, '#efe0ff'), fx(0.45, 'sparkle', 'tip', 0.6), fx(0.45, 'sparkle', 'offTip', 0.6)],
      trail: { life: 0.18, glow: 0.3 },
    }),
    // Nail Down (ref 6.33-6.58 s, the fang thrown from the air): arched back with both fists raised
    // high, then folded over in a dive straight down onto them, both blades nailed into the ground
    jh: mv({
      keys: [
        // the pull: arched right back in the air, both fists drawn back behind the hood
        K(-0.6, B({ ...body, crouch: -0.06, lean: -0.32, twist: 0, headPitch: 0.25, width: 0.14 }), { hop: 0.3, flip: -0.05 }),
        K(-0.05, B({ ...body, crouch: -0.02, lean: -0.45, twist: 0, headPitch: 0.3, width: 0.14 }), { hop: 0.4, flip: -0.07 }),
        // the fold: the hips and chest jack forward before the arms come over
        K(0.2, B({ ...body, crouch: -0.3, lean: 0.55, twist: 0, step: 0.26, back: 0.26, width: 0.2, headPitch: -0.05 }), { hop: 0.18, flip: 0 }),
        K(0.45, B({ ...body, crouch: -0.56, lean: 1.0, twist: 0, step: 0.36, back: 0.36, width: 0.25, headPitch: -0.2 }), { hop: 0, flip: 0.04 }),
        // the landing absorbed: the knees give and the hips sink over the planted blades
        K(0.75, B({ ...body, crouch: -0.64, lean: 1.0, twist: 0, step: 0.38, back: 0.38, width: 0.26, headPitch: -0.15 }), { flip: 0.02 }),
        K(1.07, B({ ...body, crouch: -0.6, lean: 0.95, twist: 0, step: 0.38, back: 0.38, width: 0.26, headPitch: -0.12 }), { flip: 0 }),
      ],
      main: nail(-1),
      off: nail(1),
      impacts: [0.45],
      start: -0.6,
      chamber: -0.05,
      blendIn: 0.5,
      ghosts: [0.0, 0.45],
      fx: [fx(0.45, 'stomp', 'feet', 0.9), fx(0.45, 'shockwave', 'tip', 0.9), fx(0.5, 'smoke', 'feet', 0.8), fx(0.45, 'sparkle', 'offTip', 0.7)],
      trail: { life: 0.2, glow: 0.6 },
    }),
  },
  // Execution, Twin Fangs (s is seconds: the blow at 2.15, the rest at 3.0). The blood of the break
  // flicked off both blades; a crouch into smoke and one whirling turn about the kneeling man with
  // the arms flung open on the diagonal (the reference's whirl), a blade raking past his face at
  // each half; then up tall onto the toes, chest arched, both fists raised high beside the hood
  // with the points up (the reference's falling fang), breathing there; and the whole body dives
  // down after them on a long step, both blades driven down into the hollows of his collarbones.
  // Held in while he stiffens, ripped out and flicked clean to either side, and stood up cold
  executeReact: 'impale',
  execute: mv({
    keys: EXEC_BODY,
    main: right(EXEC_R, 0.04, { body: true }),
    off: left(EXEC_L, 0.04, { body: true }),
    impacts: [EXEC_CUT1, EXEC_CUT2, EXEC_HIT],
    start: 0,
    chamber: 0.3,
    end: 2.6,
    rest: 3.0,
    lead: 0.04,
    ghosts: [0.32, 0.78],
    fx: [
      fx(0.14, 'sparkle', 'tip', 0.5, '#ff2a6a'),
      fx(0.14, 'sparkle', 'offTip', 0.5, '#ff2a6a'),
      fx(0.3, 'smoke', 'feet', 1.3),
      fx(0.34, 'whirl', 'root', 1.0, '#b55088'),
      fx(EXEC_CUT1, 'flashline', 'tip', 0.8, '#efe0ff'),
      fx(EXEC_CUT2, 'flashline', 'offTip', 0.8, '#efe0ff'),
      fx(0.8, 'dust', 'feet', 0.7),
      fx(1.05, 'smoke', 'feet', 0.7),
      fx(1.62, 'sparkle', 'tip', 0.7, '#ffffff'),
      fx(1.62, 'sparkle', 'offTip', 0.7, '#ffffff'),
      fx(1.95, 'dust', 'feet', 1.1),
      fx(EXEC_HIT, 'flashline', 'tip', 1.6, '#ff2a6a'),
      fx(EXEC_HIT, 'flashline', 'offTip', 1.6, '#ff2a6a'),
      fx(EXEC_HIT, 'stomp', 'feet', 0.9),
      fx(EXEC_HIT, 'shake', 'root', 1),
      fx(2.5, 'sparkle', 'tip', 0.6, '#ff2a6a'),
      fx(2.5, 'sparkle', 'offTip', 0.6, '#ff2a6a'),
      fx(2.55, 'smoke', 'feet', 0.8),
    ],
    trail: { life: 0.3, glow: 0.8, color: '#ff2a6a' },
  }),
  // Shadow Step: (unseen for most of it) back out of the smoke crouched low, blades out wide,
  // settling into the guard
  vanish: mv({
    keys: [
      K(0.0, B({ ...body, crouch: -0.32, lean: 0.36, width: 0.21 })),
      K(0.85, B({ ...body, crouch: -0.34, lean: 0.4, width: 0.22, step: 0.3, back: 0.36 })),
      K(1.0, B({ ...body, crouch: -0.2, lean: 0.24, width: 0.18 })),
    ],
    main: right([
      [0.0, [-0.52, 0.2, 0.18], [-0.6, -0.3, 0.74]],
      at(1.0, G_R),
    ]),
    off: left([
      [0.0, [0.52, 0.22, 0.18], [0.6, -0.3, 0.74]],
      at(1.0, G_L),
    ]),
    impacts: [0.5],
    start: 0,
    rest: 1,
    fx: [fx(0.8, 'smoke', 'feet', 1.2)],
  }),
  // Ring entrance, From Above: out of smoke he drops from high overhead through a front flip into a
  // low landing crouch, stays down with the head bowed and rises slowly as the hands go to the
  // sheaths, then both blades are drawn and crossed before the hood, points up, and lowered into
  // the guard
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
      K(0.76, B({ ...body, crouch: -0.2, lean: 0.1, twist: 0, step: 0.24, back: 0.28, width: 0.18, headPitch: -0.05 })),
      K(0.86, B({ ...body, crouch: -0.2, lean: 0.1, twist: 0, step: 0.24, back: 0.28, width: 0.18, headPitch: -0.05 })),
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
      gR(0.68, [-0.3, -0.02, 0.06], [0, -1, -0.2]),
      // drawn, raised and crossed before the hood, points up and out
      gR(0.76, [-0.08, 0.66, 0.36], [0.5, 0.7, 0.5]),
      gR(0.86, [-0.08, 0.64, 0.36], [0.5, 0.7, 0.5]),
      // and lowered into the guard
      gR(...at(0.97, G_R)),
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
      gL(0.76, [0.08, 0.68, 0.38], [-0.5, 0.7, 0.5]),
      gL(0.86, [0.08, 0.66, 0.38], [-0.5, 0.7, 0.5]),
      gL(...at(0.97, G_L)),
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
