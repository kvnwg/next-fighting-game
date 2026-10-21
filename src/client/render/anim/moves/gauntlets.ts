/**
 * Monk, gauntlets. A boxer's hands and a kung-fu body: the jab and cross snap out and back, the third
 * light is a spinning hook kick, the fourth a rising palm off the ground, and the heavy gathers chi
 * at the hip and releases it with both palms. The grapple seizes and hauls them in; the counter
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

// the rear foot's stance spot (root frame)
const REAR_R: V3 = [-0.17, 0.05, -0.24];

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
    // Rising Dragon: down low, then up off the ground behind a rising palm
    l3: mv({
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
};
