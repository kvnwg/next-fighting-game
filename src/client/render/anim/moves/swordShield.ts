/**
 * Knight, sword and shield. The lights, the heavy, the shield work and the guard are baked from
 * Quaternius' Universal Animation Library 2 (CC0): a crouching rising cut, a lunging cut down from
 * high, a backhand swat with the shield, a spinning leap that comes down as Judgement, and a
 * shoulder-first shield charge. The Holy Lance is authored by hand: a perilous thrust has to read
 * as a thrust.
 */
import { B, HOLD, K, P, Style, X, arc, baked, bakedKeys, bakedPose, fx, line, mv, seq } from '../author';
import type { BodyPose, V3 } from '../author';
import * as S from './baked/sword';

const SHIELD_UP: V3 = [0, 1, 0];
const guard = bakedPose(S.SHIELD_IDLE, 0, 'y', { shield: true });
const body = guard.body;
/**
 * The mannequin folds forward over three spine joints; our torso hinges at the waist, so the same
 * angle reads as folding in half. Ease the deep bends (and squats) back toward an upright knight.
 */
const stiffen = (b: BodyPose) => {
  b.lean = b.lean > 0.4 ? 0.4 + (b.lean - 0.4) * 0.35 : b.lean;
  b.crouch = b.crouch < -0.2 ? -0.2 + (b.crouch + 0.2) * 0.6 : b.crouch;
};

export const swordShield: Style = {
  axis: 'y',
  offAxis: 'y',
  trail: { light: '#fff4d6', heavy: '#ffd86a', special: '#ff4a3a' },
  sparks: ['#ffffff', '#ffe8a0', '#ffd24a'],
  guard,
  block: P(B({ ...body, crouch: -0.17, lean: 0.2, twist: 0.1 }), X([-0.32, 0.32, 0.05], [0.1, 1, 0.3], [0, 0, 1], 'y'), X([0.04, 0.5, 0.42], [-0.05, 0.1, 1], SHIELD_UP, 'y')),
  moves: {
    // Strike: down into a crouch with the blade swung back, then a rising cut that ends held high
    l0: mv({
      keys: bakedKeys(S.SWORD_A, -Infinity, Infinity, 1, stiffen),
      main: baked(S.SWORD_A),
      off: HOLD,
      impacts: [0.248],
      start: 0,
      chamber: 0.17,
      end: 0.32,
      rest: 0.43,
      linear: true,
      lead: 0,
      blendIn: 0.3,
      settle: 0.7,
      fx: [fx(0.248, 'sparkle', 'tip', 0.6)],
    }),
    // Backhand: from high, a lunging diagonal cut down through them
    l1: mv({
      keys: bakedKeys(S.SWORD_B, -Infinity, Infinity, 1, stiffen),
      main: baked(S.SWORD_B),
      off: HOLD,
      impacts: [0.25],
      start: 0,
      chamber: 0.18,
      end: 0.34,
      rest: 0.53,
      linear: true,
      lead: 0,
      blendIn: 0.3,
      settle: 0.7,
      fx: [fx(0.25, 'sparkle', 'tip', 0.7), fx(0.26, 'dust', 'feet', 0.6)],
    }),
    // Shield Bash: the shield drawn in, then rammed out with the left shoulder and a stamp behind it
    l2: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.1, hipTwist: 0.05, crouch: -0.12, lean: 0.12, step: 0.22, back: 0.22 })),
        K(0.5, B({ ...body, twist: -0.65, hipTwist: -0.25, crouch: -0.2, lean: 0.3, step: 0.42, back: 0.3 })),
        K(0.85, B({ ...body, twist: -0.95, hipTwist: -0.35, crouch: -0.24, lean: 0.36, step: 0.55, back: 0.36 })),
        K(1.05, B({ ...body, twist: -0.95, hipTwist: -0.35, crouch: -0.24, lean: 0.36, step: 0.55, back: 0.36 })),
      ],
      main: HOLD,
      off: line([0.3, 0.36, 0.1], [0.1, 0.42, 0.66], [-0.45, 0.05, 1], [-0.05, 0.08, 1], SHIELD_UP, NaN, NaN, { body: true }),
      impacts: [0.85],
      end: 1.0,
      fx: [fx(0.85, 'stomp', 'feet', 0.9), fx(0.85, 'shake', 'root', 0.6), fx(0.86, 'sparkle', 'offTip', 0.9, '#ffe8a0')],
    }),
    // Judgement: a crouch, a leap with a full turn in the air as the sword goes up, and a smite down
    // the centre line on landing; the ground answers in gold
    h: mv({
      keys: [
        K(-1.6, B({ ...body, crouch: -0.28, lean: 0.3, twist: -0.3, step: 0.26, back: 0.26 }), { spin: 0, hop: 0 }),
        K(-1.25, B({ ...body, crouch: -0.36, lean: 0.34, twist: -0.25, step: 0.26, back: 0.28 }), { spin: 0, hop: 0 }),
        K(-0.9, B({ ...body, crouch: -0.05, lean: -0.1, twist: -0.1, step: 0.18, back: 0.16 }), { spin: -0.35, hop: 0.35 }),
        K(-0.45, B({ ...body, crouch: 0.0, lean: -0.25, twist: 0.0, step: 0.16, back: 0.16, headPitch: -0.15 }), { spin: -0.8, hop: 0.55 }),
        K(-0.1, B({ ...body, crouch: -0.02, lean: -0.2, twist: 0.05, step: 0.2, back: 0.2, headPitch: -0.1 }), { spin: -1, hop: 0.45 }),
        K(0.3, B({ ...body, crouch: -0.12, lean: 0.25, twist: 0.05, step: 0.36, back: 0.3 }), { hop: 0.18 }),
        K(0.55, B({ ...body, crouch: -0.3, lean: 0.45, twist: 0.05, step: 0.46, back: 0.34 }), { hop: 0 }),
        K(1.1, B({ ...body, crouch: -0.34, lean: 0.5, twist: 0.05, step: 0.46, back: 0.34, headPitch: 0.1 })),
      ],
      main: seq(
        [
          // cocked low behind, then raised up the back as the body turns
          [-1.6, -0.3, arc([-0.3, 0.42, 0.0], 0.42, [[-0.35, -0.6, -0.7], [-0.3, 0.2, -0.95], [-0.12, 0.9, -0.4], [-0.05, 1, 0.05]])],
          // and down the centre line
          [-0.3, 1.07, arc([-0.2, 0.5, 0.05], 0.42, [[-0.05, 1, 0.05], [0.0, 0.7, 0.72], [0.02, 0.15, 1], [0.04, -0.5, 0.86], [0.05, -0.8, 0.6]])],
        ],
        0.08,
      ),
      off: HOLD,
      impacts: [0.42],
      start: -1.6,
      chamber: -0.9,
      flow: 1.35,
      blendIn: 0.3,
      fx: [fx(-1.2, 'dust', 'feet', 1.0), fx(-0.85, 'whirl', 'root', 0.8, '#ffe8a0'), fx(0.45, 'holy', 'tip', 1.1), fx(0.6, 'shockwave', 'tip', 1.0, '#ffd86a')],
      trail: { life: 0.22, glow: 0.7 },
    }),
    // Holy Lance: the sword raised to the sky catches the light, then the whole body drives it home
    sp: mv({
      keys: [
        K(-1.0, B({ ...body, crouch: -0.05, lean: -0.12, twist: 0.0, hipTwist: 0, headPitch: -0.3, step: 0.2, back: 0.18 })),
        K(-0.4, B({ ...body, crouch: -0.08, lean: -0.15, twist: 0.05, hipTwist: 0, headPitch: -0.35, step: 0.2, back: 0.18 })),
        K(-0.05, B({ ...body, crouch: -0.26, lean: 0.2, twist: -0.45, hipTwist: -0.2, step: 0.3, back: 0.38 })),
        K(0.5, B({ ...body, crouch: -0.34, lean: 0.36, twist: -0.1, hipTwist: 0, step: 0.7, back: 0.5 })),
        K(0.85, B({ ...body, crouch: -0.4, lean: 0.46, twist: 0.1, hipTwist: 0.1, step: 0.85, back: 0.55 })),
        K(1.05, B({ ...body, crouch: -0.4, lean: 0.46, twist: 0.1, hipTwist: 0.1, step: 0.85, back: 0.55 })),
      ],
      main: {
        kind: 'seq',
        blend: 0.07,
        parts: [
          // held up to the sky, point high
          { from: -1.0, to: -0.4, m: line([-0.18, 0.92, 0.1], [-0.2, 0.95, 0.08], [0.05, 1, 0.1], [0.05, 1, 0.12], [0, 0, 1]) },
          // drawn back to the hip, point at them
          { from: -0.4, to: 0.0, m: line([-0.2, 0.95, 0.08], [-0.34, 0.2, -0.06], [0.05, 1, 0.12], [0.1, 0.1, 1], [0, -1, 0]) },
          // driven home
          { from: 0.0, to: 1.0, m: line([-0.34, 0.2, -0.06], [-0.1, 0.36, 0.56], [0.1, 0.1, 1], [0.02, 0.06, 1], [0, -1, 0], NaN, NaN, { body: true }) },
        ],
      },
      off: line([0.12, 0.38, 0.38], [0.22, 0.32, 0.2], [-0.15, 0.05, 1], [-0.3, 0.05, 1], SHIELD_UP),
      impacts: [0.85],
      start: -1.0,
      chamber: -0.02,
      travel: 0.15,
      blendIn: 0.3,
      end: 1.0,
      ghosts: [0.0, 0.95],
      fx: [fx(-0.9, 'holy', 'tip', 0.7), fx(-0.85, 'sparkle', 'tip', 1.0, '#ffffff'), fx(0.0, 'dust', 'feet', 1.1), fx(0.85, 'flashline', 'tip', 1.5, '#ffd86a'), fx(0.86, 'holy', 'tip', 0.8)],
      trail: { life: 0.24, glow: 0.9 },
    }),
    // Shield Charge: shoulder down behind the shield, a burst forward, and a heavy recovery
    ab: mv({
      // the clip charges side-on; turn the torso so the shield, not the shoulder, leads into them
      keys: bakedKeys(S.SHIELD_DASH, -Infinity, Infinity, 1, (b, t) => {
        stiffen(b);
        b.twist += 0.8 * Math.max(0, 1 - Math.max(0, t - 0.3) / 0.5);
      }),
      main: baked(S.SHIELD_DASH),
      off: baked(S.SHIELD_DASH, 'shield'),
      impacts: [0.05],
      start: 0,
      chamber: 0,
      end: 0.22,
      rest: 1.1,
      linear: true,
      lead: 0,
      blendIn: 0.6,
      settle: 0.85,
      ghosts: [0, 0.2],
      fx: [fx(0.0, 'dust', 'feet', 1.3), fx(0.05, 'shake', 'root', 0.8), fx(0.2, 'dust', 'feet', 0.9)],
    }),
  },
};
