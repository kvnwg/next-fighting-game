/**
 * Knight, sword and shield. The lights, the heavy, the shield work and the guard are baked from
 * Quaternius' Universal Animation Library 2 (CC0): a crouching rising cut, a lunging cut down from
 * high, a backhand swat with the shield, a spinning leap that comes down as Judgement, and a
 * shoulder-first shield charge. The Holy Lance is authored by hand: a perilous thrust has to read
 * as a thrust, and so is the extended set: a flat cut and a stepping smite to chain off Judgement, a
 * fencer's lunge and a shield-first charge out of a dodge, a cut under the raised shield and a
 * falling shield wall while giving ground, and a whirling cut and a plunge from the air.
 */
import { B, HOLD, K, P, Style, X, arc, baked, bakedKeys, bakedPose, fx, hitAt, line, mv, seq, track } from '../author';
import type { BodyPose, Motion, V3 } from '../author';
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

/** The shield on the left arm along a straight line, its face turning from d0 to d1, top edge up. */
const shieldLine = (from: V3, to: V3, d0: V3, d1: V3, body = false) => line(from, to, d0, d1, SHIELD_UP, NaN, NaN, { body });
const SHIELD_GUARD: V3 = [0.185, 0.44, 0.47];
// the right foot's stance spot (root frame)
const REAR_R: V3 = [-0.18, 0.05, -0.2];

/** A stepping foot's path keyed along the move's s, for a step that runs from s=a to s=b. */
function kickPath(a: number, b: number, keys: [number, V3][]): Motion {
  return track(keys.map(([s, p]) => [(s - a) / (b - a), p] as [number, V3]));
}

// Oathkeeper: from low behind on the right, flat across the chest and wrapped round to the left
const oath = arc([-0.24, 0.42, 0.06], 0.42, [[-0.55, -0.55, -0.6], [-0.95, 0.0, 0.25], [-0.15, 0.3, 1], [0.7, 0.4, 0.6], [0.85, 0.4, -0.15]]);
const oathHit = hitAt(oath, 2);

// Bronze Verdict: lifted off the left shoulder to cocked behind the head, then over and down the line
const VERDICT_PIVOT: V3 = [-0.2, 0.55, 0.02];
const verdict = seq(
  [
    [-1.0, -0.1, arc(VERDICT_PIVOT, 0.4, [[0.8, 0.3, -0.3], [0.3, 0.8, -0.5], [0.0, 0.72, -0.7]])],
    [-0.1, 1.07, arc(VERDICT_PIVOT, 0.4, [[0.0, 0.72, -0.7], [-0.05, 1, 0.05], [-0.03, 0.4, 0.92], [0, -0.15, 1], [0.02, -0.5, 0.86]])],
  ],
  0.08,
);
const verdictHit = hitAt(verdict, 3, 1);

// Guarded Cut: a backhand from behind the shield out to the right, kept low under it
const guarded = arc([-0.18, 0.3, 0.12], 0.4, [[0.7, 0.05, -0.45], [0.55, 0.0, 0.8], [-0.1, -0.05, 1], [-0.85, -0.15, 0.5], [-0.85, -0.3, -0.2]]);
const guardedHit = hitAt(guarded, 2);

// Leaping Strike: the blade held out flat and carried round by a whole turn of the body
const whirl = arc([-0.2, 0.38, 0.05], 0.42, [[0.75, 0.15, 0.55], [0.0, 0.08, 1], [-0.95, 0.02, 0.2], [-0.75, -0.05, -0.6]]);
const whirlHit = hitAt(whirl, 2);

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
    // Oathkeeper: out of the smite's crouch, the blade drawn back low on the right and swept flat
    // across their chest as the hips unwind, the shield swung clear to the left
    h1: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.85, hipTwist: -0.3, side: 0.05, crouch: -0.2, lean: 0.22, step: 0.3, back: 0.3 })),
        K(oathHit, B({ ...body, twist: -0.05, hipTwist: 0.0, side: 0.0, crouch: -0.16, lean: 0.28, step: 0.48, back: 0.32 })),
        K(1.05, B({ ...body, twist: 0.55, hipTwist: 0.2, side: -0.05, crouch: -0.14, lean: 0.24, step: 0.5, back: 0.32 })),
      ],
      main: oath,
      off: seq([
        [-0.2, oathHit, shieldLine(SHIELD_GUARD, [0.26, 0.5, 0.4], [-0.1, 0.1, 1], [0.1, 0.1, 1])],
        [oathHit, 1.1, shieldLine([0.26, 0.5, 0.4], [0.46, 0.28, 0.2], [0.1, 0.1, 1], [0.7, 0, 0.7])],
      ]),
      impacts: [oathHit],
      fx: [fx(oathHit, 'sparkle', 'tip', 0.8), fx(oathHit, 'dust', 'feet', 0.7)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Bronze Verdict: up tall with the blade cocked behind the head and the shield raised with it,
    // then the rear foot steps through as the sword comes over and down, and the ground answers
    h2: mv({
      keys: [
        K(-1.0, B({ ...body, twist: 0.1, hipTwist: 0.0, crouch: -0.04, lean: -0.05, step: 0.24, back: 0.2 })),
        K(-0.4, B({ ...body, twist: 0.0, hipTwist: 0.0, side: 0.0, crouch: 0.02, lean: -0.2, step: 0.24, back: 0.2, headPitch: -0.15 })),
        K(-0.05, B({ ...body, twist: -0.1, hipTwist: 0.0, side: 0.0, crouch: 0.0, lean: -0.24, step: 0.24, back: 0.2, headPitch: -0.1 })),
        K(verdictHit, B({ ...body, twist: -0.25, hipTwist: -0.1, side: 0.0, crouch: -0.28, lean: 0.38, step: 0.3, back: 0.2, width: 0.2 })),
        K(1.15, B({ ...body, twist: -0.3, hipTwist: -0.1, side: 0.0, crouch: -0.32, lean: 0.44, step: 0.3, back: 0.2, width: 0.2, headPitch: 0.1 })),
      ],
      main: verdict,
      off: seq([
        [-1.0, -0.1, shieldLine(SHIELD_GUARD, [0.22, 0.86, 0.3], [-0.1, 0.05, 1], [0.0, 0.6, 0.8])],
        [-0.1, 1.07, shieldLine([0.22, 0.86, 0.3], [0.32, 0.26, 0.32], [0.0, 0.6, 0.8], [0.3, -0.1, 1])],
      ]),
      kick: {
        foot: 'R',
        from: -0.05,
        to: 1.15,
        path: kickPath(-0.05, 1.15, [
          [-0.05, REAR_R],
          [0.2, [-0.15, 0.32, 0.18]],
          [verdictHit, [-0.2, 0.05, 0.62]],
          [1.15, [-0.2, 0.05, 0.62]],
        ]),
      },
      impacts: [verdictHit],
      start: -1.0,
      chamber: -0.1,
      travel: 0.2,
      blendIn: 0.3,
      rest: 1.15,
      settle: 0.5,
      fx: [
        fx(-0.3, 'sparkle', 'tip', 1.0, '#ffe8a0'),
        fx(verdictHit, 'stomp', 'feet', 1.0),
        fx(verdictHit, 'holy', 'tip', 1.2),
        fx(verdictHit + 0.15, 'shockwave', 'tip', 1.2, '#ffd86a'),
        fx(verdictHit + 0.15, 'shake', 'root', 1.0),
      ],
      trail: { life: 0.24, glow: 0.8 },
    }),
    // Lunging Edge: out of the dodge low and side-on like a fencer, the point driven straight in off
    // a long front step, the shield arm flung back for balance
    dl: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.2, hipTwist: -0.1, side: 0.0, crouch: -0.24, lean: 0.4, step: 0.36, back: 0.34, headPitch: 0.05 })),
        K(0.5, B({ ...body, twist: 0.25, hipTwist: 0.05, side: 0.0, crouch: -0.24, lean: 0.38, step: 0.6, back: 0.46 })),
        K(0.85, B({ ...body, twist: 0.55, hipTwist: 0.2, side: -0.05, crouch: -0.26, lean: 0.4, step: 0.82, back: 0.56 })),
        K(1.05, B({ ...body, twist: 0.55, hipTwist: 0.2, side: -0.05, crouch: -0.26, lean: 0.4, step: 0.82, back: 0.56 })),
      ],
      main: line([-0.34, 0.18, 0.0], [-0.12, 0.38, 0.82], [0.15, 0.15, 1], [0.03, 0.05, 1], [0, 1, 0], NaN, NaN, { body: true, roll: 0.25 }),
      off: shieldLine(SHIELD_GUARD, [0.36, 0.36, 0.02], [-0.1, 0.05, 1], [0.5, 0.05, 0.6]),
      impacts: [0.85],
      end: 1.0,
      fx: [fx(-0.1, 'dust', 'feet', 1.0), fx(0.85, 'flashline', 'tip', 1.1, '#ffe8a0'), fx(0.86, 'sparkle', 'tip', 0.8)],
      trail: { life: 0.18, glow: 0.5 },
    }),
    // Rampart Charge: square behind the shield with the sword laid over its rim, a driving run, and
    // the shield heaved forward and up into them
    dh: mv({
      keys: [
        K(-0.3, B({ ...body, twist: 0.0, hipTwist: 0.0, side: 0.0, crouch: -0.22, lean: 0.4, step: 0.3, back: 0.36, headPitch: 0.15 })),
        K(0.4, B({ ...body, twist: 0.0, hipTwist: 0.0, side: 0.0, crouch: -0.24, lean: 0.45, step: 0.42, back: 0.42, headPitch: 0.15 })),
        K(0.85, B({ ...body, twist: -0.1, hipTwist: 0.0, side: 0.0, crouch: -0.2, lean: 0.3, step: 0.7, back: 0.5, headPitch: 0.0 })),
        K(1.1, B({ ...body, twist: -0.1, hipTwist: 0.0, side: 0.0, crouch: -0.2, lean: 0.28, step: 0.7, back: 0.5 })),
      ],
      main: line([-0.4, 0.6, 0.18], [-0.4, 0.64, 0.36], [0.02, 0.05, 1], [0.0, 0.0, 1], [0, 1, 0], NaN, NaN, { body: true }),
      off: seq([
        [-0.3, 0.4, shieldLine([0.12, 0.44, 0.32], [0.12, 0.46, 0.34], [0, 0.05, 1], [0, 0.05, 1], true)],
        [0.4, 1.0, shieldLine([0.12, 0.46, 0.34], [0.1, 0.62, 0.8], [0, 0.05, 1], [0, 0.3, 1], true)],
      ]),
      impacts: [0.85],
      start: -0.3,
      chamber: -0.1,
      travel: 0.4,
      end: 1.0,
      ghosts: [-0.3, 0.9],
      fx: [fx(-0.3, 'dust', 'feet', 1.2), fx(0.3, 'dust', 'feet', 0.9), fx(0.85, 'stomp', 'feet', 1.0), fx(0.86, 'shake', 'root', 0.9), fx(0.86, 'sparkle', 'offTip', 1.0, '#ffe8a0')],
    }),
    // Guarded Cut: giving ground with the shield raised over the head, a backhand cut low beneath it
    // from behind the shield out to the right
    bl: mv({
      keys: [
        K(-0.1, B({ ...body, twist: 0.45, hipTwist: 0.1, side: 0.0, crouch: -0.12, lean: 0.1, step: 0.24, back: 0.26 })),
        K(guardedHit, B({ ...body, twist: -0.1, hipTwist: -0.05, side: 0.05, crouch: -0.17, lean: -0.04, step: 0.2, back: 0.4 })),
        K(1.05, B({ ...body, twist: -0.55, hipTwist: -0.15, side: 0.08, crouch: -0.18, lean: -0.1, step: 0.16, back: 0.44 })),
      ],
      main: guarded,
      off: track([
        [-0.2, SHIELD_GUARD],
        [0.1, [0.14, 0.74, 0.36]],
        [1.0, [0.16, 0.7, 0.38]],
      ]),
      impacts: [guardedHit],
      fx: [fx(-0.05, 'dust', 'feet', 0.6), fx(guardedHit, 'sparkle', 'tip', 0.6)],
    }),
    // Shield Wall: a step back as the shield goes up, then brought down in front of them like a wall
    // falling, the sword cocked over the rim
    bh: mv({
      keys: [
        K(-0.4, B({ ...body, twist: -0.3, crouch: -0.1, lean: 0.05, step: 0.24, back: 0.26 })),
        K(-0.1, B({ ...body, twist: -0.2, side: 0.0, crouch: -0.16, lean: -0.12, step: 0.2, back: 0.44, headPitch: -0.1 })),
        K(0.85, B({ ...body, twist: 0.05, hipTwist: 0.0, side: 0.0, crouch: -0.28, lean: 0.3, step: 0.14, back: 0.52 })),
        K(1.1, B({ ...body, twist: 0.05, hipTwist: 0.0, side: 0.0, crouch: -0.28, lean: 0.26, step: 0.14, back: 0.52 })),
      ],
      main: line([-0.38, 0.74, 0.0], [-0.36, 0.76, -0.02], [0.05, 0.3, 1], [0.05, 0.35, 1], [0, 1, 0]),
      off: seq([
        [-0.4, -0.1, shieldLine(SHIELD_GUARD, [0.12, 0.88, 0.3], [-0.1, 0.05, 1], [0, 0.7, 0.7])],
        [-0.1, 1.0, shieldLine([0.12, 0.88, 0.3], [0.05, 0.3, 0.66], [0, 0.7, 0.7], [0, -0.3, 1])],
      ]),
      impacts: [0.85],
      start: -0.4,
      chamber: -0.1,
      travel: 0.35,
      end: 1.0,
      fx: [fx(-0.1, 'dust', 'feet', 0.8), fx(0.85, 'stomp', 'feet', 1.1), fx(0.86, 'shake', 'root', 0.8), fx(0.86, 'sparkle', 'offTip', 1.0, '#ffe8a0')],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Leaping Strike: in the air the knight turns a whole circle to the right with the blade held out
    // flat, the shield tucked to the chest
    jl: mv({
      keys: [
        K(-0.3, B({ ...body, twist: 0.3, hipTwist: 0.0, crouch: -0.08, lean: 0.12, step: 0.14, back: 0.12 }), { spin: 0 }),
        K(0.1, B({ ...body, twist: 0.0, hipTwist: 0.0, side: -0.1, crouch: -0.06, lean: 0.1, step: 0.12, back: 0.12 }), { spin: -0.35 }),
        K(whirlHit, B({ ...body, twist: -0.15, hipTwist: 0.0, side: -0.15, crouch: -0.08, lean: 0.12, step: 0.14, back: 0.14 }), { spin: -0.75 }),
        K(1.1, B({ ...body, twist: -0.3, crouch: -0.18, lean: 0.25, step: 0.24, back: 0.22 }), { spin: -1 }),
      ],
      main: whirl,
      off: shieldLine([0.24, 0.42, 0.3], [0.24, 0.44, 0.28], [0.3, 0.05, 1], [0.3, 0.05, 1]),
      impacts: [whirlHit],
      start: -0.3,
      chamber: -0.1,
      flow: 1.3,
      blendIn: 0.3,
      fx: [fx(-0.1, 'whirl', 'root', 0.8, '#ffe8a0'), fx(whirlHit, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Crashing Oath: falling with the sword held high, point forward, under the raised shield, then
    // driven point-first into the ground ahead as the knight lands on one knee
    jh: mv({
      keys: [
        K(-0.6, B({ ...body, twist: 0.0, hipTwist: 0.0, side: 0.0, crouch: 0.0, lean: -0.15, step: 0.2, back: 0.2, headPitch: -0.1 })),
        K(0.0, B({ ...body, twist: -0.05, hipTwist: 0.0, side: 0.0, crouch: -0.04, lean: -0.1, step: 0.22, back: 0.2 })),
        K(0.85, B({ ...body, twist: -0.1, hipTwist: 0.0, side: 0.0, crouch: -0.36, lean: 0.4, step: 0.42, back: 0.4 })),
        K(1.1, B({ ...body, twist: -0.1, hipTwist: 0.0, side: 0.0, crouch: -0.38, lean: 0.42, step: 0.42, back: 0.4, headPitch: 0.1 })),
      ],
      main: seq([
        [-0.6, 0.0, line([-0.3, 0.3, 0.2], [-0.14, 1.0, 0.24], [0.1, 0.4, 1], [0.0, -0.3, 1], [0, 1, 0], NaN, NaN, { body: true })],
        [0.0, 1.0, line([-0.14, 1.0, 0.24], [-0.06, 0.22, 0.62], [0.0, -0.3, 1], [0.0, -0.66, 0.75], [0, 1, 0], NaN, NaN, { body: true })],
      ]),
      off: shieldLine([0.26, 0.82, 0.24], [0.3, 0.4, 0.34], [0.0, 0.6, 0.8], [0.2, 0.05, 1]),
      impacts: [0.85],
      start: -0.6,
      chamber: -0.05,
      travel: 0.25,
      blendIn: 0.3,
      end: 1.0,
      rest: 1.05,
      settle: 0.5,
      fx: [fx(0.85, 'holy', 'tip', 1.0), fx(0.88, 'shockwave', 'tip', 1.1, '#ffd86a'), fx(0.88, 'stomp', 'feet', 0.9)],
      trail: { life: 0.22, glow: 0.7 },
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
  // Ring entrance, By Oath: a heavy march in place with the sword carried upright and the shield's
  // face shown to them; the sword turned point-down and driven into the floor, both hands stacked
  // on the pommel; then wrenched free and its flat beaten twice on the shield in challenge
  entrance: (() => {
    const march = B({ ...body, twist: -0.1, hipTwist: 0, side: 0, lean: 0.04, crouch: -0.05, step: 0.08, back: 0.08, width: 0.14, headPitch: 0.0 });
    // the left foot lifts with the hips held level while the legs fold under them
    const liftL = B({ ...march, crouch: -0.36, lift: 0.3, side: -0.04, step: 0.1 });
    // the sword's flat across the shield's face, and drawn back off it
    const beatAt: V3 = [-0.3, 0.46, 0.3];
    const ON: V3 = [0.87, 0.12, 0.48];
    const OFF: V3 = [0.45, 0.4, 0.8];
    const flat: V3 = [0, 1, 0];
    return mv({
      keys: [
        // arrival: the march
        K(0.0, march),
        K(0.04, B({ ...march, side: 0.05 })),
        K(0.11, B({ ...march, crouch: -0.08 })),
        K(0.13, march),
        K(0.155, liftL),
        K(0.19, B({ ...march, crouch: -0.08 })),
        K(0.21, B({ ...march, side: 0.05 })),
        K(0.27, B({ ...march, crouch: -0.08 })),
        K(0.29, march),
        K(0.315, liftL),
        K(0.35, B({ ...march, crouch: -0.08 })),
        // signature: the sword raised point-down, and driven into the floor
        K(0.42, B({ ...march, crouch: -0.02, lean: -0.04, headPitch: 0.05 })),
        K(0.5, B({ ...march, crouch: -0.02, lean: -0.06, twist: 0.0, headPitch: 0.15 })),
        K(0.55, B({ ...march, crouch: -0.1, lean: 0.0, twist: 0.0, headPitch: 0.2 })),
        K(0.6, B({ ...march, crouch: -0.06, lean: 0.0, twist: 0.0, headPitch: 0.28 })),
        K(0.69, B({ ...march, crouch: -0.05, lean: 0.0, twist: 0.0, headPitch: 0.22 })),
        // challenge: pulled free, turned to the shield, two beats, chin up
        K(0.74, B({ ...march, crouch: -0.08, lean: 0.02, twist: 0.15, headPitch: 0.0, step: 0.16, back: 0.14, width: 0.16 })),
        K(0.79, B({ ...march, crouch: -0.1, lean: 0.06, twist: 0.25, headPitch: -0.08, step: 0.18, back: 0.16, width: 0.17 })),
        K(0.86, B({ ...march, crouch: -0.1, lean: 0.06, twist: 0.25, headPitch: -0.1, step: 0.2, back: 0.18, width: 0.17 })),
        K(1.0, body),
      ],
      main: seq(
        [
          // carried upright before the right shoulder
          [-0.1, 0.38, line([-0.28, 0.3, 0.22], [-0.28, 0.3, 0.22], [0, 1, 0.1], [0, 1, 0.1], [0, 0, 1])],
          // brought forward, point at them, then turned point-down at the chest
          [0.38, 0.45, line([-0.28, 0.3, 0.22], [-0.16, 0.5, 0.36], [0, 1, 0.1], [0.05, 0.1, 1], [0, 1, 0])],
          [0.45, 0.51, line([-0.16, 0.5, 0.36], [-0.04, 0.62, 0.42], [0.05, 0.1, 1], [0, -1, 0.04], [0, 0, 1])],
          // driven down into the floor and held there
          [0.51, 0.55, line([-0.04, 0.62, 0.42], [-0.03, 0.36, 0.44], [0, -1, 0.04], [0, -1, 0], [0, 0, 1])],
          [0.55, 0.6, line([-0.03, 0.36, 0.44], [-0.03, 0.29, 0.44], [0, -1, 0], [0, -1, 0], [0, 0, 1])],
          [0.6, 0.7, line([-0.03, 0.29, 0.44], [-0.03, 0.29, 0.44], [0, -1, 0], [0, -1, 0], [0, 0, 1])],
          // wrenched free and swung up to the right
          [0.7, 0.75, line([-0.03, 0.29, 0.44], [-0.32, 0.44, 0.3], [0, -1, 0], OFF, flat)],
          // two beats of the flat on the shield
          [0.75, 0.79, line([-0.32, 0.44, 0.3], beatAt, OFF, ON, flat)],
          [0.79, 0.82, line(beatAt, [-0.32, 0.48, 0.3], ON, OFF, flat)],
          [0.82, 0.85, line([-0.32, 0.48, 0.3], beatAt, OFF, ON, flat)],
          [0.85, 1.0, line(beatAt, [-0.4, 0.3, 0.24], ON, [0.2, 0.5, 1], flat)],
        ],
        0.03,
      ),
      off: seq(
        [
          // the face shown square to them through the march
          [-0.1, 0.42, shieldLine([0.16, 0.42, 0.38], [0.16, 0.42, 0.38], [0, 0.05, 1], [0, 0.05, 1])],
          // swung aside, then the hand set on the pommel with the shield hung to the left
          [0.42, 0.53, shieldLine([0.16, 0.42, 0.38], [0.04, 0.5, 0.44], [0, 0.05, 1], [1, 0, 0.12])],
          [0.53, 0.56, shieldLine([0.04, 0.5, 0.44], [0.0, 0.43, 0.45], [1, 0, 0.12], [1, 0, 0.12])],
          [0.56, 0.7, shieldLine([0.0, 0.43, 0.45], [0.0, 0.43, 0.45], [1, 0, 0.12], [1, 0, 0.12])],
          // raised before the chest to take the beats
          [0.7, 0.76, shieldLine([0.0, 0.43, 0.45], [0.2, 0.42, 0.42], [1, 0, 0.12], [-0.25, 0.05, 1])],
          [0.76, 1.0, shieldLine([0.2, 0.42, 0.42], [0.2, 0.43, 0.43], [-0.25, 0.05, 1], [-0.2, 0.05, 1])],
        ],
        0.03,
      ),
      // the right boot's marching steps (the left one's are the lifts keyed above)
      kick: {
        foot: 'R',
        from: 0.03,
        to: 0.36,
        path: kickPath(0.03, 0.36, [
          [0.03, [-0.14, 0.05, -0.08]],
          [0.075, [-0.15, 0.4, 0.04]],
          [0.11, [-0.14, 0.05, -0.08]],
          [0.19, [-0.14, 0.05, -0.08]],
          [0.235, [-0.15, 0.4, 0.04]],
          [0.27, [-0.14, 0.05, -0.08]],
          [0.36, [-0.14, 0.05, -0.08]],
        ]),
      },
      lead: 0,
      fx: [
        fx(0.11, 'stomp', 'feet', 0.6),
        fx(0.19, 'stomp', 'feet', 0.6),
        fx(0.2, 'holy', 'off', 0.7),
        fx(0.27, 'stomp', 'feet', 0.6),
        fx(0.3, 'sparkle', 'offTip', 0.8, '#ffe8a0'),
        fx(0.35, 'stomp', 'feet', 0.7),
        fx(0.45, 'sparkle', 'tip', 0.7, '#ffffff'),
        fx(0.55, 'stomp', 'tip', 1.0),
        fx(0.55, 'sparkle', 'tip', 1.2, '#ffe8a0'),
        fx(0.555, 'shake', 'root', 0.6),
        fx(0.79, 'sparkle', 'off', 1.0, '#ffe8a0'),
        fx(0.79, 'shake', 'root', 0.25),
        fx(0.85, 'sparkle', 'off', 1.1, '#ffe8a0'),
        fx(0.85, 'shake', 'root', 0.3),
        fx(0.87, 'holy', 'off', 1.0),
      ],
    });
  })(),
};
