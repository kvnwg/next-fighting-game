/**
 * Monk, gauntlets. A boxer's hands and a kung-fu body: the jab and cross snap out and back, the third
 * light is a spinning hook kick, and the heavy gathers chi at the hip and releases it with both
 * palms, then chains into a pouncing tiger palm and a stamping uppercut to the sky. Out of a dodge
 * comes a rising palm off the ground or a head-down charge; giving ground, a crane step or a turning
 * back-fist; in the air, a crescent kick or a heel dropped like thunder. The grapple seizes and hauls them in; the counter
 * answers with a flurry.
 */
import { B, HOLD, K, P, Style, X, fx, line, mv, seq, track } from '../author';
import type { Motion, V3 } from '../author';

const FIST_UP: V3 = [0, 1, 0];
const body = B({ front: 'L', step: 0.22, back: 0.24, width: 0.17, crouch: -0.12, lean: 0.12, twist: -0.3 });

/** A fist's path in the hips' frame (aimed at the opponent however the shoulders turn). */
const strike = (from: V3, to: V3, d0: V3, d1: V3, edge: V3 = FIST_UP) => line(from, to, d0, d1, edge, NaN, NaN, { body: true });

/** A kick's foot path keyed along the move's s, for a kick that runs from s=a to s=b. */
function kickPath(a: number, b: number, keys: [number, V3][]): Motion {
  return track(keys.map(([s, p]) => [(s - a) / (b - a), p] as [number, V3]));
}

// the feet's stance spots (root frame)
const REAR_R: V3 = [-0.17, 0.05, -0.24];
const LEAD_L: V3 = [0.17, 0.05, 0.22];

export const gauntlets: Style = {
  axis: 'y',
  offAxis: 'y',
  trail: { light: '#ffe2c0', heavy: '#ff9a2a', special: '#ff4a2a' },
  sparks: ['#ffffff', '#ffd08a', '#ff9a2a'],
  guard: P(body, X([-0.12, 0.62, 0.26], [0.1, 0.3, 1], FIST_UP, 'y'), X([0.14, 0.65, 0.36], [-0.1, 0.3, 1], FIST_UP, 'y')),
  block: P(B({ ...body, crouch: -0.16, lean: 0.2 }), X([-0.06, 0.72, 0.28], [0.1, 1, 0.25], [0, 0, -1], 'y'), X([0.08, 0.75, 0.3], [-0.1, 1, 0.25], [0, 0, -1], 'y')),
  // Still Water: wide and calm, the lead palm open toward them, the other ready at the chest
  stance: P(B({ ...body, crouch: -0.22, lean: 0.04, twist: -0.15, width: 0.24, step: 0.26, back: 0.28 }), X([-0.1, 0.5, 0.3], [0.1, 0.9, 0.4], [0, 0, 1], 'y'), X([0.18, 0.62, 0.48], [-0.1, 0.9, 0.3], [0, 0, 1], 'y')),
  moves: {
    // Jab: the lead hand snaps out off a half step and straight back
    l0: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.25 })),
        K(0.5, B({ ...body, twist: -0.55, lean: 0.2, step: 0.32, crouch: -0.14 })),
        K(0.85, B({ ...body, twist: -0.65, lean: 0.24, step: 0.36, crouch: -0.15 })),
        K(1.05, B({ ...body, twist: -0.65, lean: 0.24, step: 0.36, crouch: -0.15 })),
      ],
      main: HOLD,
      off: strike([0.12, 0.62, 0.34], [0.03, 0.62, 0.8], [-0.05, 0.1, 1], [0, 0.03, 1]),
      impacts: [0.85],
      end: 1.0,
      fx: [fx(0.85, 'chi', 'off', 0.5)],
      trail: { life: 0.1 },
    }),
    // Cross: the rear hand, the hips and the back heel all turning through together
    l1: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.5, hipTwist: -0.15 })),
        K(0.5, B({ ...body, twist: 0.1, hipTwist: 0.15, lean: 0.24, step: 0.34, crouch: -0.16 })),
        K(0.85, B({ ...body, twist: 0.4, hipTwist: 0.3, lean: 0.3, step: 0.38, crouch: -0.17 })),
        K(1.05, B({ ...body, twist: 0.42, hipTwist: 0.3, lean: 0.3, step: 0.38, crouch: -0.17 })),
      ],
      main: strike([-0.14, 0.62, 0.24], [-0.02, 0.62, 0.84], [0.08, 0.1, 1], [0.02, 0.03, 1]),
      off: HOLD,
      impacts: [0.85],
      end: 1.0,
      fx: [fx(0.85, 'chi', 'main', 0.65)],
      trail: { life: 0.1 },
    }),
    // Whirlwind Kick: turn the back to them, the rear leg swings round at head height and lands the
    // turn facing them again
    l2: mv({
      keys: [
        K(-0.6, B({ ...body, twist: -0.3 }), { spin: 0 }),
        K(-0.3, B({ ...body, twist: -0.1, lean: 0.05, step: 0.06, width: 0.06, crouch: -0.1 }), { spin: -0.22 }),
        K(0.2, B({ ...body, twist: 0.1, lean: -0.15, side: 0.3, step: 0.04, width: 0.05, crouch: -0.06, headPitch: 0.1 }), { spin: -0.62 }),
        K(0.55, B({ ...body, twist: 0.15, lean: -0.22, side: 0.42, step: 0.04, width: 0.05, crouch: -0.05, headPitch: 0.15 }), { spin: -0.78 }),
        K(0.85, B({ ...body, twist: 0.0, lean: 0.0, side: 0.15, step: 0.12, width: 0.1, crouch: -0.12 }), { spin: -0.94 }),
        K(1.1, B({ ...body, twist: -0.2, lean: 0.1, step: 0.2, crouch: -0.16 }), { spin: -1 }),
      ],
      main: HOLD,
      off: HOLD,
      kick: {
        foot: 'R',
        from: -0.4,
        to: 0.95,
        path: kickPath(-0.4, 0.95, [
          [-0.4, REAR_R],
          [-0.15, [-0.22, 0.5, -0.12]],
          [0.25, [-0.78, 1.1, 0.0]],
          [0.55, [-0.84, 1.2, 0.12]],
          [0.8, [-0.4, 0.62, 0.05]],
          [0.95, REAR_R],
        ]),
      },
      impacts: [0.45],
      start: -0.6,
      chamber: -0.2,
      flow: 1.45,
      blendIn: 0.35,
      fx: [fx(-0.2, 'whirl', 'root', 0.7, '#ffd08a'), fx(0.45, 'chi', 'kick', 0.9)],
      trail: { life: 0.16, glow: 0.4 },
    }),
    // Rising Dragon: out of the dodge down low, then up off the ground behind a rising palm
    dl: mv({
      keys: [
        K(-0.2, B({ ...body, crouch: -0.36, lean: 0.36, twist: -0.45, step: 0.28 }), { hop: 0, spin: 0 }),
        K(0.3, B({ ...body, crouch: -0.18, lean: 0.12, twist: -0.1, step: 0.34 }), { hop: 0.05 }),
        K(0.65, B({ ...body, crouch: -0.04, lean: -0.08, twist: 0.2, step: 0.3, headPitch: -0.2 }), { hop: 0.18, spin: 0.06 }),
        K(0.9, B({ ...body, crouch: 0.0, lean: -0.12, twist: 0.25, step: 0.3, headPitch: -0.15 }), { hop: 0.32, spin: 0.08 }),
        K(1.2, B({ ...body, crouch: -0.24, lean: 0.2, twist: 0.0, step: 0.3 }), { hop: 0, spin: 0 }),
      ],
      main: strike([-0.16, -0.02, 0.3], [-0.06, 0.74, 0.4], [0.05, 0.5, 1], [0, 1, 0.25], [0, 0, -1]),
      off: HOLD,
      impacts: [0.55],
      end: 1.07,
      rest: 1.2,
      settle: 0.45,
      fx: [fx(0.3, 'dust', 'feet', 0.8), fx(0.55, 'chi', 'main', 0.9), fx(1.15, 'stomp', 'feet', 0.6)],
      trail: { life: 0.18, glow: 0.5 },
    }),
    // Mountain Breaker: turned away, both hands cupped at the hip gathering chi, then both palms
    // driven out together with a long step; the air itself hits them
    h: mv({
      keys: [
        K(-0.4, B({ ...body, twist: -0.9, hipTwist: -0.3, crouch: -0.3, lean: 0.14, step: 0.3, back: 0.3, width: 0.21 })),
        K(-0.1, B({ ...body, twist: -0.95, hipTwist: -0.3, crouch: -0.32, lean: 0.12, step: 0.3, back: 0.3, width: 0.21 })),
        K(0.85, B({ ...body, twist: 0.05, hipTwist: 0.1, crouch: -0.3, lean: 0.34, step: 0.62, back: 0.42, width: 0.2 })),
        K(1.05, B({ ...body, twist: 0.05, hipTwist: 0.1, crouch: -0.3, lean: 0.34, step: 0.62, back: 0.42, width: 0.2 })),
      ],
      main: strike([-0.2, 0.22, -0.04], [-0.07, 0.56, 0.74], [0.0, 0.4, 1], [0.0, 0.12, 1]),
      off: strike([-0.06, 0.26, -0.02], [0.07, 0.56, 0.74], [0.0, 0.4, 1], [0.0, 0.12, 1]),
      impacts: [0.85],
      start: -0.4,
      chamber: -0.1,
      end: 1.0,
      rest: 1.0,
      settle: 0.5,
      fx: [
        fx(-0.35, 'wisps', 'main', 0.7, '#ff9a2a'),
        fx(-0.1, 'wisps', 'main', 0.9, '#ffb347'),
        fx(0.6, 'dust', 'feet', 1.0),
        fx(0.85, 'chi', 'main', 1.8),
        fx(0.86, 'chi', 'off', 1.2, '#ffe0a0'),
        fx(0.86, 'shake', 'root', 1.0),
      ],
      trail: { life: 0.2, glow: 0.7 },
    }),
    // Tiger Palm: out of the two palms, a pounce; the left hand claws their guard down as the right
    // drives the heel of the palm into the chest, landing in a deep stance
    h1: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.8, hipTwist: -0.3, crouch: -0.2, lean: 0.06, step: 0.3, back: 0.3, width: 0.2 }), { hop: 0 }),
        K(0.45, B({ ...body, twist: -0.2, hipTwist: -0.05, crouch: -0.14, lean: 0.22, step: 0.42, back: 0.32, width: 0.2 }), { hop: 0.1 }),
        K(0.85, B({ ...body, twist: 0.5, hipTwist: 0.3, crouch: -0.26, lean: 0.3, step: 0.52, back: 0.36, width: 0.22 }), { hop: 0 }),
        K(1.1, B({ ...body, twist: 0.5, hipTwist: 0.3, crouch: -0.28, lean: 0.3, step: 0.52, back: 0.36, width: 0.22 })),
      ],
      // the heel of the palm, fingers up
      main: strike([-0.22, 0.3, -0.04], [-0.03, 0.62, 0.78], [0.1, 0.4, 1], [0.0, 1, 0.2], [0, 0, -1]),
      // the claw reaches out and drags down, back to the hip
      off: seq([
        [-0.2, 0.5, strike([0.14, 0.65, 0.36], [0.06, 0.72, 0.66], [-0.1, 0.4, 1], [0, 0.2, 1])],
        [0.5, 1.1, strike([0.06, 0.72, 0.66], [0.22, 0.3, 0.1], [0, 0.2, 1], [0.2, -0.5, 1])],
      ]),
      impacts: [0.85],
      end: 1.0,
      fx: [fx(0.85, 'stomp', 'feet', 0.8), fx(0.85, 'chi', 'main', 1.3), fx(0.86, 'shake', 'root', 0.5)],
      trail: { life: 0.18, glow: 0.6 },
    }),
    // Heaven Shaker: the lead foot stamps the ground into a horse stance, then the left fist comes up
    // from the knee to the sky as the body rises behind it, the right hand pulled down to the hip
    h2: mv({
      keys: [
        K(-0.7, B({ ...body, twist: 0.3, crouch: -0.14, lean: 0.1, step: 0.24, back: 0.3 })),
        K(-0.45, B({ ...body, twist: 0.1, crouch: -0.06, lean: -0.02, step: 0.2, back: 0.3, width: 0.12, side: -0.08 })),
        K(-0.2, B({ ...body, twist: -0.35, hipTwist: -0.1, crouch: -0.3, lean: 0.22, step: 0.26, back: 0.24, width: 0.32 })),
        K(0.3, B({ ...body, twist: -0.5, hipTwist: -0.15, crouch: -0.32, lean: 0.3, step: 0.26, back: 0.24, width: 0.32 })),
        K(0.85, B({ ...body, twist: 0.25, hipTwist: 0.15, crouch: -0.08, lean: -0.14, step: 0.26, back: 0.26, width: 0.28, headPitch: -0.25 })),
        K(1.15, B({ ...body, twist: 0.3, hipTwist: 0.15, crouch: -0.12, lean: -0.1, step: 0.26, back: 0.26, width: 0.28, headPitch: -0.2 })),
      ],
      main: seq([
        [-0.7, 0.3, strike([-0.04, 0.6, 0.7], [-0.2, 0.45, 0.25], [0, 0.6, 1], [0.1, 0.3, 1])],
        [0.3, 1.1, strike([-0.2, 0.45, 0.25], [-0.26, 0.12, 0.0], [0.1, 0.3, 1], [0.2, -0.3, 1])],
      ]),
      off: seq([
        [-0.7, 0.0, strike([0.14, 0.65, 0.36], [0.24, -0.08, 0.32], [-0.1, 0.3, 1], [0.0, -0.4, 1], [0, 0, 1])],
        [0.0, 1.0, strike([0.24, -0.08, 0.32], [0.06, 0.98, 0.42], [0.0, -0.4, 1], [-0.05, 1, 0.2], [0, 0, 1])],
      ]),
      kick: {
        foot: 'L',
        from: -0.6,
        to: -0.2,
        path: kickPath(-0.6, -0.2, [
          [-0.6, LEAD_L],
          [-0.42, [0.14, 0.52, 0.18]],
          [-0.28, [0.22, 0.3, 0.3]],
          [-0.2, [0.32, 0.05, 0.26]],
        ]),
      },
      impacts: [0.85],
      start: -0.7,
      chamber: -0.15,
      travel: 0.25,
      blendIn: 0.3,
      end: 1.0,
      rest: 1.15,
      settle: 0.5,
      fx: [
        fx(-0.2, 'shockwave', 'feet', 0.8, '#ffb347'),
        fx(0.2, 'wisps', 'off', 0.8, '#ff9a2a'),
        fx(0.85, 'chi', 'off', 1.9),
        fx(0.86, 'roar', 'root', 0.7, '#ff9a2a'),
        fx(0.86, 'shake', 'root', 1.0),
      ],
      trail: { life: 0.22, glow: 0.8 },
    }),
    // Charging Ox: head down behind both fists like horns, the whole charge driven into one left
    // straight at the end of it
    dh: mv({
      keys: [
        K(-0.3, B({ ...body, twist: -0.2, crouch: -0.22, lean: 0.5, step: 0.3, back: 0.34, headPitch: 0.2 })),
        K(0.4, B({ ...body, twist: -0.35, crouch: -0.24, lean: 0.54, step: 0.42, back: 0.4, headPitch: 0.15 })),
        K(0.85, B({ ...body, twist: -0.75, hipTwist: -0.2, crouch: -0.22, lean: 0.46, step: 0.66, back: 0.5, headPitch: -0.05 })),
        K(1.1, B({ ...body, twist: -0.75, hipTwist: -0.2, crouch: -0.22, lean: 0.4, step: 0.66, back: 0.5 })),
      ],
      main: strike([-0.18, 0.78, 0.3], [-0.16, 0.74, 0.32], [0.3, 0.6, 1], [0.4, 0.6, 1]),
      off: strike([0.18, 0.78, 0.3], [0.03, 0.64, 0.84], [-0.3, 0.6, 1], [0, 0.03, 1]),
      impacts: [0.85],
      start: -0.3,
      chamber: -0.1,
      travel: 0.4,
      end: 1.0,
      ghosts: [-0.3, 0.9],
      fx: [fx(-0.3, 'dust', 'feet', 1.1), fx(0.3, 'dust', 'feet', 0.8), fx(0.85, 'chi', 'off', 1.5), fx(0.85, 'stomp', 'feet', 0.8), fx(0.86, 'shake', 'root', 0.8)],
      trail: { life: 0.2, glow: 0.6 },
    }),
    // Crane Step: the lead knee lifts into the crane as they give ground, the left arm spread like a
    // wing, and the right hand pecks down at the face before the foot sets down
    bl: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.2, crouch: -0.1, lean: 0.0, step: 0.2, back: 0.32 })),
        K(0.45, B({ ...body, twist: 0.1, crouch: -0.18, lean: -0.12, step: 0.1, back: 0.36, side: 0.08, headPitch: 0.05 })),
        K(0.85, B({ ...body, twist: 0.25, hipTwist: 0.1, crouch: -0.2, lean: -0.08, step: 0.08, back: 0.38, side: 0.1 })),
        K(1.1, B({ ...body, twist: 0.2, crouch: -0.2, lean: -0.02, step: 0.14, back: 0.36 })),
      ],
      // the crane's beak: fingertips bunched, striking down
      main: strike([-0.16, 0.82, 0.2], [-0.04, 0.7, 0.74], [0.05, 0.6, 1], [0.0, -0.35, 1], [0, 1, 0.3]),
      off: seq([
        [-0.2, 0.6, strike([0.14, 0.65, 0.36], [0.62, 0.72, -0.06], [-0.1, 0.3, 1], [1, 0.25, -0.2])],
        [0.6, 1.1, strike([0.62, 0.72, -0.06], [0.48, 0.62, 0.08], [1, 0.25, -0.2], [0.6, 0.3, 0.5])],
      ]),
      kick: {
        foot: 'L',
        from: -0.1,
        to: 0.95,
        path: kickPath(-0.1, 0.95, [
          [-0.1, LEAD_L],
          [0.3, [0.12, 0.42, 0.14]],
          [0.75, [0.12, 0.5, 0.1]],
          [0.95, [0.16, 0.05, 0.1]],
        ]),
      },
      impacts: [0.85],
      end: 1.0,
      fx: [fx(-0.05, 'dust', 'feet', 0.6), fx(0.85, 'chi', 'main', 0.6), fx(1.0, 'dust', 'feet', 0.5)],
      trail: { life: 0.12 },
    }),
    // Turning Mountain: giving ground with a whole turn to the left, the back shown to them, and the
    // left back-fist swung round at head height as they come about
    bh: mv({
      keys: [
        K(-0.6, B({ ...body, twist: -0.1, crouch: -0.14 }), { spin: 0 }),
        K(-0.3, B({ ...body, twist: -0.3, crouch: -0.22, lean: 0.0, step: 0.16, back: 0.36, width: 0.14 }), { spin: 0.18 }),
        K(0.1, B({ ...body, twist: -0.2, crouch: -0.28, lean: -0.1, side: -0.2, step: 0.12, back: 0.44, width: 0.16 }), { spin: 0.55 }),
        K(0.45, B({ ...body, twist: 0.0, crouch: -0.3, lean: -0.14, side: -0.3, step: 0.12, back: 0.48, width: 0.18 }), { spin: 0.74 }),
        K(0.8, B({ ...body, twist: -0.1, crouch: -0.3, lean: -0.04, side: -0.1, step: 0.18, back: 0.46, width: 0.18 }), { spin: 0.92 }),
        K(1.1, B({ ...body, twist: -0.25, crouch: -0.24, lean: 0.06, step: 0.2, back: 0.4 }), { spin: 1 }),
      ],
      main: track([
        [-0.6, [-0.12, 0.62, 0.26]],
        [0.2, [-0.1, 0.66, 0.24]],
        [1.0, [-0.12, 0.62, 0.26]],
      ]),
      // the back of the fist leads round
      off: seq([
        [-0.6, -0.1, line([0.14, 0.65, 0.36], [-0.05, 0.62, 0.24], [-0.1, 0.3, 1], [-1, 0.2, 0.2], [0, 1, 0])],
        [-0.1, 0.5, line([-0.05, 0.62, 0.24], [0.86, 0.68, 0.06], [-1, 0.2, 0.2], [1, 0.05, 0.05], [0, 0, -1])],
        [0.5, 1.1, line([0.86, 0.68, 0.06], [0.3, 0.6, 0.3], [1, 0.05, 0.05], [0.3, 0.3, 1], [0, 1, 0])],
      ]),
      impacts: [0.45],
      start: -0.6,
      chamber: -0.2,
      flow: 1.4,
      blendIn: 0.35,
      fx: [fx(-0.3, 'dust', 'feet', 0.8), fx(-0.1, 'whirl', 'root', 0.9, '#ffb347'), fx(0.45, 'chi', 'off', 1.4), fx(0.46, 'shake', 'root', 0.7), fx(0.9, 'stomp', 'feet', 0.6)],
      trail: { life: 0.2, glow: 0.6 },
    }),
    // Falling Leaf Kick: in the air the body tips over like a leaf and turns to the left, the lead leg
    // sweeping a crescent round at head height
    jl: mv({
      keys: [
        K(-0.5, B({ ...body, twist: -0.2, crouch: -0.1 }), { spin: 0, roll: 0, hop: 0 }),
        K(-0.1, B({ ...body, twist: 0.0, lean: 0.0, side: -0.25, crouch: -0.05, step: 0.05, width: 0.08 }), { spin: 0.4, roll: -0.04, hop: 0.06 }),
        K(0.45, B({ ...body, twist: 0.1, lean: -0.15, side: -0.4, crouch: -0.02, step: 0.04, width: 0.08, headPitch: 0.1 }), { spin: 0.76, roll: -0.08, hop: 0.1 }),
        K(0.85, B({ ...body, twist: -0.1, lean: 0.05, side: -0.1, crouch: -0.12, step: 0.14, width: 0.12 }), { spin: 0.94, roll: -0.02, hop: 0.04 }),
        K(1.1, B({ ...body, twist: -0.25, lean: 0.12, crouch: -0.16, step: 0.2 }), { spin: 1, roll: 0, hop: 0 }),
      ],
      main: track([
        [-0.5, [-0.12, 0.62, 0.26]],
        [0.2, [-0.4, 0.66, 0.06]],
        [0.9, [-0.12, 0.62, 0.26]],
      ]),
      off: track([
        [-0.5, [0.14, 0.65, 0.36]],
        [0.2, [0.1, 0.78, 0.2]],
        [0.9, [0.14, 0.65, 0.36]],
      ]),
      kick: {
        foot: 'L',
        from: -0.35,
        to: 0.95,
        path: kickPath(-0.35, 0.95, [
          [-0.35, [0.15, 0.3, 0.16]],
          [-0.05, [0.45, 0.78, 0.18]],
          [0.3, [0.9, 1.4, 0.12]],
          [0.55, [0.92, 1.42, -0.06]],
          [0.8, [0.4, 0.6, 0.0]],
          [0.95, [0.15, 0.3, 0.16]],
        ]),
      },
      impacts: [0.45],
      start: -0.5,
      chamber: -0.15,
      flow: 1.3,
      blendIn: 0.3,
      fx: [fx(0.45, 'chi', 'kick', 0.9), fx(0.45, 'petals', 'kick', 0.5, '#ffd08a')],
      trail: { life: 0.16, glow: 0.4 },
    }),
    // Thunder Heel: the right leg swung up overhead as they come down, the heel chopped straight down
    // through them and planted with the landing
    jh: mv({
      keys: [
        K(-0.5, B({ ...body, front: 'R', twist: -0.2, crouch: -0.08, lean: 0.0, step: 0.1, back: 0.12 }), { hop: 0 }),
        K(-0.1, B({ ...body, front: 'R', twist: 0.1, crouch: 0.0, lean: -0.28, step: 0.1, back: 0.14, headPitch: 0.2 }), { hop: 0.1 }),
        K(0.45, B({ ...body, front: 'R', twist: 0.05, crouch: -0.12, lean: 0.12, step: 0.3, back: 0.2 }), { hop: 0.05 }),
        K(0.65, B({ ...body, front: 'R', twist: 0.0, crouch: -0.38, lean: 0.36, step: 0.5, back: 0.32, width: 0.2 }), { hop: 0 }),
        K(1.1, B({ ...body, front: 'R', twist: 0.0, crouch: -0.36, lean: 0.3, step: 0.5, back: 0.32, width: 0.2 })),
      ],
      main: seq([
        [-0.5, 0.2, strike([-0.12, 0.62, 0.26], [-0.34, 0.66, 0.1], [0.1, 0.3, 1], [-0.4, 0.4, 1])],
        [0.2, 1.1, strike([-0.34, 0.66, 0.1], [-0.4, 0.2, 0.2], [-0.4, 0.4, 1], [-0.4, -0.3, 1])],
      ]),
      off: seq([
        [-0.5, 0.2, strike([0.14, 0.65, 0.36], [0.34, 0.66, 0.1], [-0.1, 0.3, 1], [0.4, 0.4, 1])],
        [0.2, 1.1, strike([0.34, 0.66, 0.1], [0.4, 0.2, 0.2], [0.4, 0.4, 1], [0.4, -0.3, 1])],
      ]),
      kick: {
        foot: 'R',
        from: -0.45,
        to: 1.1,
        path: kickPath(-0.45, 1.1, [
          [-0.45, [-0.15, 0.3, -0.05]],
          [-0.25, [-0.5, 1.3, 0.35]],
          [-0.05, [-0.12, 1.9, 0.55]],
          [0.45, [-0.1, 1.15, 0.95]],
          [0.65, [-0.17, 0.05, 0.5]],
          [1.1, [-0.17, 0.05, 0.5]],
        ]),
      },
      impacts: [0.45],
      start: -0.5,
      chamber: -0.05,
      travel: 0.3,
      blendIn: 0.3,
      end: 1.07,
      rest: 1.1,
      settle: 0.5,
      fx: [fx(0.45, 'chi', 'kick', 1.2), fx(0.65, 'shockwave', 'kick', 1.0, '#ffb347'), fx(0.66, 'shake', 'root', 1.0)],
      trail: { life: 0.2, glow: 0.6 },
    }),
    // Iron Grapple: arms flung wide, a lunging two-handed seize, and a haul back to the chest
    sp: mv({
      keys: [
        K(-0.6, B({ ...body, crouch: -0.2, lean: 0.06, twist: 0, width: 0.22 })),
        K(0.0, B({ ...body, crouch: -0.26, lean: 0.18, twist: 0, step: 0.3, width: 0.22 })),
        K(0.85, B({ ...body, crouch: -0.28, lean: 0.42, twist: 0, step: 0.55, back: 0.36 })),
        K(1.3, B({ ...body, crouch: -0.22, lean: -0.05, twist: -0.15, step: 0.36, back: 0.36, headPitch: -0.05 })),
        K(1.7, B({ ...body, crouch: -0.16, lean: 0.1, twist: -0.25, step: 0.26, back: 0.28 })),
      ],
      main: seq(
        [
          [-0.6, 0.0, strike([-0.4, 0.55, 0.08], [-0.46, 0.5, 0.1], [-0.6, 0.2, 1], [-0.6, 0.2, 1])],
          [0.0, 1.0, strike([-0.46, 0.5, 0.1], [-0.1, 0.56, 0.62], [-0.6, 0.2, 1], [0.3, 0.1, 1])],
          [1.0, 1.4, strike([-0.1, 0.56, 0.62], [-0.16, 0.5, 0.22], [0.3, 0.1, 1], [0.2, 0.3, 1])],
        ],
        0.06,
      ),
      off: seq(
        [
          [-0.6, 0.0, strike([0.4, 0.55, 0.08], [0.46, 0.5, 0.1], [0.6, 0.2, 1], [0.6, 0.2, 1])],
          [0.0, 1.0, strike([0.46, 0.5, 0.1], [0.1, 0.56, 0.62], [0.6, 0.2, 1], [-0.3, 0.1, 1])],
          [1.0, 1.4, strike([0.1, 0.56, 0.62], [0.16, 0.5, 0.22], [-0.3, 0.1, 1], [-0.2, 0.3, 1])],
        ],
        0.06,
      ),
      impacts: [0.85],
      start: -0.6,
      chamber: -0.05,
      travel: 0.2,
      end: 1.0,
      rest: 1.4,
      settle: 0.7,
      fx: [fx(0.0, 'dust', 'feet', 1.0), fx(0.85, 'chi', 'main', 0.8), fx(0.85, 'chi', 'off', 0.8)],
    }),
    // Counter Strike: the stance answers with a palm, an elbow and a rising palm, too fast to block
    ct: mv({
      keys: [
        K(-0.1, B({ ...body, crouch: -0.22, lean: 0.04, twist: -0.15, width: 0.24 })),
        K(0.85, B({ ...body, crouch: -0.24, lean: 0.3, twist: 0.35, step: 0.42, back: 0.3 })),
        K(1.35, B({ ...body, crouch: -0.22, lean: 0.25, twist: -0.45, step: 0.42, back: 0.3 })),
        K(1.85, B({ ...body, crouch: -0.05, lean: -0.1, twist: 0.25, step: 0.36, back: 0.3, headPitch: -0.15 }), { hop: 0.12 }),
        K(2.1, B({ ...body, crouch: -0.18, lean: 0.12, twist: 0.0, step: 0.3 }), { hop: 0 }),
      ],
      main: seq(
        [
          // the palm
          [-0.2, 1.0, strike([-0.12, 0.5, 0.3], [-0.06, 0.56, 0.68], [0.05, 0.6, 1], [0.0, 0.5, 1], [0, 0, 1])],
          // drawn back while the elbow goes in
          [1.0, 1.5, strike([-0.06, 0.56, 0.68], [-0.2, 0.25, 0.25], [0.0, 0.5, 1], [0.1, 0.5, 1], [0, 0, 1])],
          // and up under the chin
          [1.5, 2.0, strike([-0.2, 0.25, 0.25], [-0.05, 0.95, 0.5], [0.1, 0.5, 1], [0, 1, 0.3], [0, 0, -1])],
        ],
        0.06,
      ),
      off: seq(
        [
          [-0.2, 1.0, strike([0.18, 0.62, 0.48], [0.2, 0.6, 0.3], [-0.1, 0.9, 0.3], [-0.1, 0.9, 0.3], [0, 0, 1])],
          // the elbow: the forearm swung flat across
          [1.0, 1.5, strike([0.2, 0.6, 0.3], [-0.1, 0.62, 0.5], [-0.1, 0.9, 0.3], [-1, 0.2, 0.2], FIST_UP)],
          [1.5, 2.0, strike([-0.1, 0.62, 0.5], [0.14, 0.6, 0.34], [-1, 0.2, 0.2], [-0.1, 0.3, 1], FIST_UP)],
        ],
        0.06,
      ),
      impacts: [0.85],
      end: 1.0,
      rest: 2.0,
      settle: 0.85,
      fx: [fx(0.85, 'chi', 'main', 1.0), fx(1.4, 'chi', 'off', 0.8), fx(1.85, 'chi', 'main', 1.2), fx(1.86, 'shake', 'root', 0.6)],
      trail: { life: 0.16, glow: 0.6 },
    }),
  },
  // Ring entrance, Still Mountain: slow steps in place out of the mist, palms pressed together at
  // the chest; a long breath drawn up through the hands and let out as they part and sink; then
  // down into a horse stance and one palm driven out at them, the air ringing with it
  entrance: mv({
    keys: [
      // arrival: upright, head bowed over the hands, one deliberate step with each foot
      K(0.0, B({ ...body, front: 'L', step: 0.06, back: 0.06, width: 0.12, crouch: -0.04, lean: 0.04, twist: 0, headPitch: 0.3 })),
      K(0.05, B({ ...body, front: 'L', step: 0.06, back: 0.06, width: 0.12, crouch: -0.06, lean: 0.04, twist: 0, side: 0.06, headPitch: 0.3 })),
      K(0.16, B({ ...body, front: 'L', step: 0.06, back: 0.06, width: 0.12, crouch: -0.05, lean: 0.04, twist: 0, side: 0.0, headPitch: 0.3 })),
      // the left foot lifts (hips held level while the legs fold under them)
      K(0.19, B({ ...body, front: 'L', step: 0.06, back: 0.06, width: 0.12, crouch: -0.06, lean: 0.04, twist: 0, side: -0.06, headPitch: 0.3 })),
      K(0.245, B({ ...body, front: 'L', step: 0.09, back: 0.06, width: 0.12, crouch: -0.27, lean: 0.04, twist: 0, side: -0.06, headPitch: 0.28, lift: 0.21 })),
      K(0.3, B({ ...body, front: 'L', step: 0.1, back: 0.06, width: 0.13, crouch: -0.06, lean: 0.04, twist: 0, side: 0.0, headPitch: 0.28 })),
      // signature: the breath drawn in, rising tall, eyes opening
      K(0.36, B({ ...body, front: 'L', step: 0.1, back: 0.06, width: 0.13, crouch: -0.05, lean: 0.04, twist: 0, headPitch: 0.25 })),
      K(0.5, B({ ...body, front: 'L', step: 0.1, back: 0.06, width: 0.13, crouch: 0.0, lean: -0.08, twist: 0, headPitch: -0.08 })),
      // and let out as the hands sink
      K(0.66, B({ ...body, front: 'L', step: 0.1, back: 0.06, width: 0.14, crouch: -0.09, lean: 0.04, twist: 0, headPitch: 0.0 })),
      // challenge: down into the horse stance, the right shoulder drawn back, then the palm
      K(0.71, B({ ...body, front: 'L', step: 0.1, back: 0.06, width: 0.15, crouch: -0.1, lean: 0.04, twist: -0.1, headPitch: 0.0 })),
      K(0.755, B({ ...body, front: 'L', step: 0.08, back: 0.08, width: 0.32, crouch: -0.3, lean: 0.06, twist: -0.4, hipTwist: -0.05, headPitch: 0.02 })),
      K(0.8, B({ ...body, front: 'L', step: 0.08, back: 0.08, width: 0.32, crouch: -0.31, lean: 0.16, twist: 0.32, hipTwist: 0.05, headPitch: 0.0 })),
      K(0.87, B({ ...body, front: 'L', step: 0.08, back: 0.08, width: 0.32, crouch: -0.3, lean: 0.15, twist: 0.3, hipTwist: 0.05, headPitch: 0.0 })),
      K(1.0, body),
    ],
    // the right hand: prayer, up with the breath, out and down, back to the hip, and the palm
    main: seq(
      [
        [-0.1, 0.36, line([-0.1, 0.42, 0.28], [-0.1, 0.43, 0.28], [0, 1, 0.15], [0, 1, 0.15], [-1, 0, 0])],
        [0.36, 0.48, line([-0.1, 0.43, 0.28], [-0.1, 0.53, 0.32], [0, 1, 0.15], [0, 1, 0.1], [-1, 0, 0])],
        [0.48, 0.57, line([-0.1, 0.53, 0.32], [-0.36, 0.46, 0.26], [0, 1, 0.1], [-0.5, 0.2, 1], [0, 1, 0])],
        [0.57, 0.68, line([-0.36, 0.46, 0.26], [-0.3, 0.16, 0.24], [-0.5, 0.2, 1], [-0.1, -0.1, 1], [0, 1, 0])],
        [0.68, 0.755, line([-0.3, 0.16, 0.24], [-0.24, 0.16, -0.02], [-0.1, -0.1, 1], [0, 0.1, 1], [0, 1, 0])],
        [0.755, 0.8, strike([-0.24, 0.2, -0.04], [-0.03, 0.56, 0.8], [0, 0.4, 1], [0, 1, 0.2], [0, 0, -1])],
        [0.8, 1.0, strike([-0.03, 0.56, 0.8], [-0.04, 0.56, 0.74], [0, 1, 0.2], [0, 1, 0.25], [0, 0, -1])],
      ],
      0.04,
    ),
    // the left hand mirrors it, then is pulled to the hip as a fist
    off: seq(
      [
        [-0.1, 0.36, line([0.1, 0.42, 0.28], [0.1, 0.43, 0.28], [0, 1, 0.15], [0, 1, 0.15], [1, 0, 0])],
        [0.36, 0.48, line([0.1, 0.43, 0.28], [0.1, 0.53, 0.32], [0, 1, 0.15], [0, 1, 0.1], [1, 0, 0])],
        [0.48, 0.57, line([0.1, 0.53, 0.32], [0.36, 0.46, 0.26], [0, 1, 0.1], [0.5, 0.2, 1], [0, 1, 0])],
        [0.57, 0.68, line([0.36, 0.46, 0.26], [0.3, 0.16, 0.24], [0.5, 0.2, 1], [0.1, -0.1, 1], [0, 1, 0])],
        [0.68, 0.76, line([0.3, 0.16, 0.24], [0.26, 0.16, 0.0], [0.1, -0.1, 1], [0, 0.1, 1], [0, 1, 0])],
        [0.76, 1.0, line([0.26, 0.16, 0.0], [0.24, 0.18, 0.02], [0, 0.1, 1], [0, 0.1, 1], [0, 1, 0])],
      ],
      0.04,
    ),
    // the right foot's step (the left one's is the lift keyed above)
    kick: {
      foot: 'R',
      from: 0.04,
      to: 0.34,
      path: kickPath(0.04, 0.34, [
        [0.04, [-0.12, 0.05, -0.06]],
        [0.1, [-0.13, 0.3, 0.04]],
        [0.16, [-0.12, 0.05, -0.06]],
        [0.34, [-0.12, 0.05, -0.06]],
      ]),
    },
    lead: 0,
    fx: [
      fx(0.0, 'fog', 'root', 1.2),
      fx(0.16, 'dust', 'feet', 0.4),
      fx(0.3, 'dust', 'feet', 0.4),
      fx(0.4, 'wisps', 'main', 0.6, '#ffb347'),
      fx(0.4, 'wisps', 'off', 0.6, '#ffb347'),
      fx(0.55, 'chi', 'main', 0.6, '#ffd08a'),
      fx(0.55, 'chi', 'off', 0.6, '#ffd08a'),
      fx(0.62, 'wisps', 'main', 0.8, '#ff9a2a'),
      fx(0.62, 'wisps', 'off', 0.8, '#ff9a2a'),
      fx(0.755, 'stomp', 'feet', 0.8),
      fx(0.8, 'chi', 'main', 1.6),
      fx(0.8, 'shockwave', 'front', 1.0, '#ffb347'),
      fx(0.805, 'shake', 'root', 0.8),
    ],
    trail: { life: 0.2, glow: 0.6 },
  }),
};
