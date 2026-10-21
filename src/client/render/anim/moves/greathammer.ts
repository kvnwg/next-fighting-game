/**
 * Warden, warhammer. A sledge the size of a man, swung with everything he has. Between blows the
 * head rests on the floor ahead of his left foot, the haft angled back up into both fists at his
 * right hip; every blow drags it round the body or loops it up over a shoulder and lets the whole
 * weight of him follow it through, the arms flung out at full stretch toward the target and the
 * head usually ending back in the dirt in front of him. The lights chain a low drag round the
 * front, a flat backhand and a chop down over the left shoulder; the special is a spinning sweep.
 */
import { B, K, P, fx, line, mv } from '../author';
import type { Style, V3 } from '../author';
import { G2, H, aim, body, heave, held } from './greathammer-base';
import { WARDEN_B } from './greathammer-b';

// the fists low in front at the right hip (the carry); out ahead at full stretch (most impacts)
export const LOW: V3 = [-0.04, 0.2, 0.32];
export const OUT: V3 = [-0.06, 0.24, 0.46];
/** after the blow, the fists held out low in front as the head rests on the floor */
export const REST: V3 = [-0.05, 0.3, 0.42];
/** both fists up in front of the face, the haft free to go back over the helm */
export const OVER: V3 = [-0.02, 0.76, 0.34];
/** the guard's haft: down and ahead to the head resting on the floor in front of his left foot */
export const GUARD_DIR = aim(42, -40);

// Drag Sweep: the head swung back off the floor round his left side, then dragged flat round the
// front at shin height, the arms flung out after it, and on until it skids down ahead on his right
const drag = [
  H(-0.3, LOW, GUARD_DIR),
  H(-0.05, [0.02, 0.16, 0.34], aim(95, -30)),
  H(0.15, [0.06, 0.18, 0.32], aim(145, -24)),
  H(0.3, [0.04, 0.2, 0.4], aim(75, -20)),
  H(0.45, OUT, aim(0, -16)),
  H(0.62, [-0.06, 0.26, 0.44], aim(-38, -26)),
  H(0.82, REST, aim(-48, -38)),
  H(1.07, REST, aim(-50, -40)),
];

// Backhand: ripped up off the floor out to his right at the hip, then swept flat back across the
// front at waist height, arms straight, and round to his left where it drops
const backhand = [
  H(-0.3, REST, aim(-50, -40)),
  H(-0.05, [-0.12, 0.2, 0.3], aim(-90, -12)),
  H(0.1, [-0.12, 0.24, 0.28], aim(-125, 0)),
  H(0.28, [-0.08, 0.26, 0.38], aim(-65, 2)),
  H(0.45, OUT, aim(4, 0)),
  H(0.62, [-0.02, 0.24, 0.42], aim(65, -4)),
  H(0.82, [0.0, 0.26, 0.38], aim(100, -14)),
  H(1.07, [0.0, 0.26, 0.38], aim(112, -24)),
];

// Shoulder Chop: from his left the head is heaved up behind the left shoulder, then chopped down
// over it and diagonally across the front into the floor ahead on his right
const chop = [
  H(-0.3, [0.0, 0.26, 0.38], aim(112, -24)),
  H(-0.05, [0.08, 0.4, 0.34], aim(135, 12)),
  H(0.12, [0.1, 0.58, 0.32], aim(150, 42)),
  H(0.28, [0.04, 0.68, 0.38], aim(75, 58)),
  H(0.38, [-0.02, 0.48, 0.44], aim(18, 24)),
  H(0.45, OUT, aim(-6, -4)),
  H(0.6, REST, aim(-34, -22)),
  H(1.07, REST, aim(-42, -30)),
];

// Cyclone: dragged out to his left and wound up, then whirled round flat at the end of his arms
// one whole turn and a quarter, the head at knee height, the hit as it comes round the front
const cyc: ReturnType<typeof H>[] = [H(-1.3, LOW, GUARD_DIR), H(-1.0, [0, 0.16, 0.34], aim(95, -22))];
for (let i = 1; i <= 10; i++) cyc.push(H(-1.0 + (1.45 * i) / 10, [0.0, 0.2, 0.42], aim(95 - 45.5 * i, -14)));
cyc.push(H(0.62, [-0.05, 0.24, 0.42], aim(-410, -18)), H(0.82, REST, aim(-440, -32)), H(1.07, REST, aim(-450, -40)));

// Charging Uppercut: the head trailed behind on the floor at his left through the dash, then
// swung down past his left foot and up under the target, rising ahead and on up over his head
const upper = [
  H(-0.4, LOW, aim(110, -34)),
  H(0.05, [0.06, 0.16, 0.3], aim(165, -30)),
  H(0.22, [0.05, 0.14, 0.36], aim(80, -48)),
  H(0.34, [0.0, 0.18, 0.44], aim(15, -30)),
  H(0.45, OUT, aim(0, 12)),
  H(0.62, [-0.04, 0.5, 0.42], aim(-4, 50)),
  H(0.85, [-0.04, 0.7, 0.38], aim(-8, 72)),
  H(1.07, [-0.04, 0.72, 0.38], aim(-8, 74)),
];

// Retreating Backhand: dragged across to his right along the floor as he steps back, then ripped up
// through the target from low on his right to high on his left
const rising = [
  H(-0.35, LOW, GUARD_DIR),
  H(-0.05, [-0.1, 0.12, 0.34], aim(-50, -36)),
  H(0.1, [-0.14, 0.14, 0.3], aim(-95, -28)),
  H(0.3, [-0.1, 0.18, 0.4], aim(-45, -14)),
  H(0.45, OUT, aim(5, 12)),
  H(0.65, [0.02, 0.52, 0.38], aim(70, 48)),
  H(0.85, [0.04, 0.6, 0.36], aim(100, 40)),
  H(1.07, [0.04, 0.6, 0.36], aim(106, 36)),
];

// Ring entrance, played in place: he drags the hammer in on the floor at his left and stamps
// twice, stands it up beside him, hoists it overhead, swings it down round his left side and up
// behind him in one great windmill, and buries it in the floor in front of him; then into guard
const entLine = [
  H(0.0, [0.0, 0.1, 0.34], aim(62, -42)),
  H(0.26, [0.0, 0.1, 0.34], aim(60, -42)),
  H(0.34, [0.02, 0.22, 0.32], aim(40, 40)),
  H(0.44, [0.0, 0.5, 0.3], aim(25, 75)),
  H(0.5, OVER, aim(0, 86)),
  H(0.56, [0.02, 0.6, 0.3], aim(30, 40)),
  H(0.6, [0.04, 0.2, 0.36], aim(80, -30)),
  H(0.64, [0.06, 0.24, 0.3], aim(140, -10)),
  H(0.68, [0.06, 0.6, 0.32], aim(170, 45)),
  H(0.72, OVER, aim(0, 85)),
  H(0.745, [-0.02, 0.6, 0.38], aim(0, 45)),
  H(0.77, OUT, aim(0, -24)),
  H(0.88, REST, aim(0, -36)),
  H(0.96, LOW, GUARD_DIR),
];
const entSlam = 0.77;

export const greathammer: Style = {
  axis: 'x',
  offAxis: 'x',
  trail: { light: '#ffe2b0', heavy: '#ffb347', special: '#ff4a2a' },
  sparks: ['#ffb04a', '#ffffff', '#ff7a2a'],
  // planted: the head down on the floor ahead of his left foot, the haft angled back up across
  // into both fists at his right hip, the hands spread along it
  guard: P(body, held(body, LOW, GUARD_DIR, G2)),
  // braced: the hammer stood up on end beside his left shoulder, the haft across his chest
  block: P(B({ ...body, crouch: -0.22, lean: 0.14, twist: 0.12, width: 0.22 }), held(B({ ...body, crouch: -0.22, lean: 0.14, twist: 0.12, width: 0.22 }), [-0.08, 0.2, 0.34], aim(28, 62), G2, [0, 0, 1])),
  moves: {
    // Drag Sweep: the hips and shoulders wind left as the head swings back off the floor behind
    // his left heel, the weight sinking back; then the lead foot lunges, the hips whip round ahead
    // of the shoulders, and he drops into a long forward lean behind the arms as it drags through
    l0: heave(mv({
      keys: [
        K(-0.3, body),
        // coiled: wound left over the long rear leg
        K(0.15, B({ ...body, twist: 1.05, hipTwist: 0.5, lean: 0.18, crouch: -0.36, step: 0.28, back: 0.46, width: 0.22, side: 0.06, headPitch: 0.1 })),
        // the lead foot lunges and the hips unwind first
        K(0.32, B({ ...body, twist: 0.25, hipTwist: -0.15, lean: 0.45, crouch: -0.42, step: 0.52, back: 0.46, width: 0.21 })),
        K(0.45, B({ ...body, twist: -0.5, hipTwist: -0.38, lean: 0.72, crouch: -0.48, step: 0.62, back: 0.44, width: 0.22, headPitch: -0.3 })),
        // carried on round after it, the rear foot dragging
        K(0.75, B({ ...body, twist: -0.9, hipTwist: -0.5, lean: 0.74, crouch: -0.5, step: 0.62, back: 0.34, width: 0.27, headPitch: -0.25 }), { spin: -0.05 }),
        K(1.07, B({ ...body, twist: -0.85, hipTwist: -0.5, lean: 0.7, crouch: -0.48, step: 0.6, back: 0.32, width: 0.28, headPitch: -0.2 }), { spin: -0.07 }),
      ],
      main: { kind: 'hold' },
      start: -0.3,
      chamber: 0.15,
      travel: 0.3,
      lead: 0.06,
      fx: [fx(-0.1, 'dust', 'tip', 0.9), fx(0.45, 'dust', 'feet', 0.9), fx(0.7, 'quake', 'tip', 1.0), fx(0.85, 'dust', 'tip', 1.1)],
      trail: { life: 0.18, glow: 0.35 },
    }), drag, G2),
    // Backhand: hauled round to his right off the front foot as the head comes up out of the
    // floor, wound right; the hips turn back first and the shoulders follow, the arms straight out
    // as it crosses the front at the waist, and he turns on after it, the right foot pivoting
    l1: heave(mv({
      keys: [
        K(-0.3, B({ ...body, twist: -0.85, hipTwist: -0.5, lean: 0.7, crouch: -0.48, step: 0.6, back: 0.32, width: 0.28 })),
        // wound right, the weight back over the rear leg
        K(0.1, B({ ...body, twist: -1.15, hipTwist: -0.6, lean: 0.12, crouch: -0.3, step: 0.4, back: 0.44, width: 0.24, side: -0.06 })),
        K(0.3, B({ ...body, twist: -0.4, hipTwist: 0.15, lean: 0.35, crouch: -0.36, step: 0.5, back: 0.42, width: 0.22 })),
        K(0.45, B({ ...body, twist: 0.45, hipTwist: 0.38, lean: 0.5, crouch: -0.4, step: 0.56, back: 0.4, width: 0.22, headPitch: -0.2 })),
        // turned on round after it
        K(0.75, B({ ...body, twist: 0.95, hipTwist: 0.5, lean: 0.45, crouch: -0.38, step: 0.52, back: 0.32, width: 0.26, side: 0.08 }), { spin: 0.06 }),
        K(1.07, B({ ...body, twist: 1.0, hipTwist: 0.52, lean: 0.4, crouch: -0.36, step: 0.5, back: 0.3, width: 0.26 }), { spin: 0.08 }),
      ],
      main: { kind: 'hold' },
      start: -0.3,
      chamber: 0.1,
      travel: 0.2,
      blendIn: 0.3,
      lead: 0.06,
      fx: [fx(-0.2, 'dust', 'tip', 1), fx(0.45, 'flashline', 'tip', 0.9), fx(0.5, 'whirl', 'root', 0.8, '#ffe2b0')],
      trail: { life: 0.2, glow: 0.4 },
    }), backhand),
    // Shoulder Chop: wound left and rising onto his toes as the head goes up behind his left
    // shoulder, the chest open; then the hips drive round, the lead foot stamps out and he chops it
    // down over the shoulder and across, bent double behind it as it bursts into the floor
    l2: heave(mv({
      keys: [
        K(-0.3, B({ ...body, twist: 1.0, hipTwist: 0.52, lean: 0.4, crouch: -0.36, step: 0.5, back: 0.3, width: 0.26 })),
        // up behind the left shoulder: risen, wound left, leaning back
        K(0.12, B({ ...body, twist: 0.95, hipTwist: 0.45, lean: -0.25, crouch: -0.04, step: 0.3, back: 0.4, width: 0.2, headPitch: -0.2 }), { hop: 0.04 }),
        K(0.3, B({ ...body, twist: 0.3, hipTwist: -0.2, lean: 0.2, crouch: -0.24, step: 0.5, back: 0.42, width: 0.22 }), { hop: 0 }),
        K(0.45, B({ ...body, twist: -0.5, hipTwist: -0.4, lean: 0.8, crouch: -0.48, step: 0.66, back: 0.46, width: 0.26, headPitch: -0.3 })),
        K(0.7, B({ ...body, twist: -0.7, hipTwist: -0.45, lean: 0.92, crouch: -0.54, step: 0.68, back: 0.46, width: 0.28, headPitch: -0.35 })),
        K(1.07, B({ ...body, twist: -0.7, hipTwist: -0.45, lean: 0.9, crouch: -0.54, step: 0.68, back: 0.46, width: 0.28, headPitch: -0.3 })),
      ],
      main: { kind: 'hold' },
      start: -0.3,
      chamber: 0.12,
      travel: 0.25,
      blendIn: 0.3,
      lead: 0.05,
      fx: [fx(0.48, 'shockwave', 'tip', 1.0), fx(0.48, 'shake', 'root', 0.8), fx(0.5, 'dust', 'tip', 1.2), fx(0.46, 'stomp', 'feet', 0.8)],
      trail: { life: 0.2, glow: 0.5 },
    }), chop),
    // Cyclone: the perilous sweep. Wound left and sunk low, the hips lead off and the hammer drags
    // the Warden round a whole turn and on, leaning out against its pull at the end of his arms,
    // the feet stepping round under him; it tears through the knees as it comes round the front
    sp: heave(mv({
      keys: [
        K(-1.3, body, { spin: 0 }),
        K(-1.0, B({ ...body, twist: 1.0, hipTwist: 0.55, lean: 0.25, crouch: -0.4, step: 0.3, back: 0.44, width: 0.26, side: 0.06 }), { spin: 0 }),
        K(-0.6, B({ ...body, twist: 0.35, hipTwist: -0.2, lean: 0.35, crouch: -0.44, step: 0.36, back: 0.4, width: 0.3, side: 0.14 }), { spin: -0.25 }),
        K(-0.15, B({ ...body, twist: 0.3, hipTwist: -0.2, lean: 0.38, crouch: -0.46, step: 0.38, back: 0.4, width: 0.3, side: 0.16 }), { spin: -0.62 }),
        K(0.45, B({ ...body, twist: -0.3, hipTwist: -0.35, lean: 0.55, crouch: -0.5, step: 0.5, back: 0.42, width: 0.3, side: 0.08, headPitch: -0.2 }), { spin: -1.02 }),
        K(0.8, B({ ...body, twist: -0.6, hipTwist: -0.45, lean: 0.62, crouch: -0.55, step: 0.52, back: 0.4, width: 0.32, headPitch: -0.2 }), { spin: -1.12 }),
        K(1.07, B({ ...body, twist: -0.6, hipTwist: -0.45, lean: 0.6, crouch: -0.54, step: 0.5, back: 0.4, width: 0.32 }), { spin: -1.14 }),
      ],
      main: { kind: 'hold' },
      start: -1.3,
      chamber: -1.0,
      flow: 1.6,
      blendIn: 0.3,
      lead: 0.05,
      fx: [
        fx(-1.2, 'dust', 'tip', 1),
        fx(-0.8, 'whirl', 'root', 1.2, '#ffb347'),
        fx(-0.5, 'quake', 'tip', 0.9),
        fx(-0.1, 'quake', 'tip', 1.1),
        fx(0.45, 'quake', 'tip', 1.4),
        fx(0.45, 'whirl', 'root', 1.5, '#ff7a2a'),
        fx(0.46, 'stomp', 'feet', 1),
        fx(0.85, 'dust', 'tip', 1.2),
      ],
      trail: { life: 0.26, glow: 0.65 },
    }), cyc, G2),
    // Charging Uppercut: bent low into the dash with the head trailing on the floor behind his
    // left heel, wound left; the lead foot strides out, the hips turn first and it comes down past
    // his foot and up under the target, lifting him up onto his toes after it
    dl: heave(mv({
      keys: [
        K(-0.4, B({ ...body, twist: 0.6, hipTwist: 0.3, lean: 0.45, crouch: -0.36, step: 0.42, back: 0.46, width: 0.2 })),
        K(0.05, B({ ...body, twist: 1.0, hipTwist: 0.5, lean: 0.5, crouch: -0.46, step: 0.44, back: 0.52, width: 0.21 })),
        K(0.3, B({ ...body, twist: 0.35, hipTwist: -0.1, lean: 0.55, crouch: -0.44, step: 0.66, back: 0.5, width: 0.2 })),
        K(0.45, B({ ...body, twist: -0.2, hipTwist: -0.3, lean: 0.32, crouch: -0.3, step: 0.74, back: 0.48, width: 0.2, headPitch: -0.2 })),
        // up on his toes after it, the chest open
        K(0.8, B({ ...body, twist: -0.35, hipTwist: -0.3, lean: -0.22, crouch: -0.04, step: 0.6, back: 0.4, width: 0.18, headPitch: -0.45 }), { hop: 0.06 }),
        K(1.07, B({ ...body, twist: -0.3, hipTwist: -0.25, lean: -0.2, crouch: -0.06, step: 0.56, back: 0.38, width: 0.18, headPitch: -0.4 }), { hop: 0 }),
      ],
      main: { kind: 'hold' },
      start: -0.4,
      chamber: 0.05,
      travel: 0.4,
      lead: 0.05,
      ghosts: [-0.3, 0.5],
      fx: [fx(-0.3, 'dust', 'tip', 1), fx(0.1, 'quake', 'tip', 0.8), fx(0.3, 'dust', 'tip', 1.1), fx(0.45, 'flashline', 'tip', 1.1), fx(0.46, 'sparkle', 'tip', 1, '#ffffff')],
      trail: { life: 0.16, glow: 0.4 },
    }), upper, G2),
    // Retreating Backhand: the left foot reaches back and the hips sink onto it as the head is
    // dragged across to his right, wound right; then the hips heave round and it rips up through the
    // target, the body rising and leaning away after it as he gives ground
    bl: heave(mv({
      keys: [
        K(-0.35, body),
        K(0.1, B({ ...body, twist: -1.05, hipTwist: -0.55, lean: 0.25, crouch: -0.42, step: 0.24, back: 0.58, width: 0.22, side: -0.06 })),
        K(0.3, B({ ...body, twist: -0.35, hipTwist: 0.15, lean: 0.3, crouch: -0.38, step: 0.22, back: 0.62, width: 0.22 })),
        K(0.45, B({ ...body, twist: 0.4, hipTwist: 0.38, lean: 0.2, crouch: -0.3, step: 0.22, back: 0.66, width: 0.22, headPitch: -0.15 })),
        K(0.75, B({ ...body, twist: 0.8, hipTwist: 0.45, lean: -0.22, crouch: -0.3, step: 0.18, back: 0.72, width: 0.24, headPitch: -0.3 })),
        K(1.07, B({ ...body, twist: 0.75, hipTwist: 0.42, lean: -0.25, crouch: -0.34, step: 0.18, back: 0.72, width: 0.24, headPitch: -0.25 })),
      ],
      main: { kind: 'hold' },
      start: -0.35,
      chamber: 0.1,
      travel: 0.3,
      lead: 0.05,
      fx: [fx(-0.1, 'quake', 'tip', 0.9), fx(0.12, 'dust', 'feet', 1), fx(0.45, 'flashline', 'tip', 1), fx(0.6, 'dust', 'feet', 0.9)],
      trail: { life: 0.18, glow: 0.4 },
    }), rising),
    // the heavy chain, the dash and backstep heavies and the air attacks
    ...WARDEN_B,
  },
  // War Cry: the hammer hoisted overhead in both hands, a wide stance, the head thrown back
  roar: mv({
    keys: [
      K(0, body),
      K(0.22, B({ ...body, lean: -0.3, crouch: -0.04, headPitch: -0.45, twist: 0, step: 0.3, back: 0.3, width: 0.22 })),
      K(0.34, B({ ...body, lean: -0.38, crouch: -0.2, headPitch: -0.6, twist: 0, step: 0.32, back: 0.32, width: 0.27 })),
      K(0.8, B({ ...body, lean: -0.3, crouch: -0.17, headPitch: -0.5, twist: 0, step: 0.32, back: 0.32, width: 0.27 })),
      K(1, body),
    ],
    main: line([0.05, 0.88, 0.18], [0.05, 0.92, 0.16], [-1, 0.12, 0.05], [-1, 0.18, 0.05], [0, 1, 0], G2),
    impacts: [0.34],
    start: 0,
    rest: 1,
    lead: 0,
    fx: [fx(0.32, 'roar', 'root', 1.2)],
  }),
  // Ring entrance: the hammer dragged in at his left, two stamps; stood up, hoisted overhead, one
  // great windmill down his left side and up behind him, buried in the floor in front of him as he
  // crunches down behind it; then he rises into guard
  entrance: heave(mv({
    keys: [
      K(0, B({ ...body, twist: 0.2, lean: 0.25, crouch: -0.3, width: 0.22, headPitch: 0.3 })),
      K(0.1, B({ ...body, twist: 0.2, lean: 0.2, crouch: -0.36, width: 0.24, headPitch: 0.2 }), { hop: 0.06 }),
      K(0.12, B({ ...body, twist: 0.2, lean: 0.22, crouch: -0.4, width: 0.26, headPitch: 0.2 }), { hop: 0 }),
      K(0.2, B({ ...body, twist: 0.15, lean: 0.18, crouch: -0.3, width: 0.26, headPitch: 0.1 }), { hop: 0.08 }),
      K(0.22, B({ ...body, twist: 0.15, lean: 0.22, crouch: -0.42, width: 0.28, headPitch: 0.1 }), { hop: 0 }),
      K(0.34, B({ ...body, twist: 0.3, lean: 0.0, crouch: -0.16, width: 0.24, headPitch: -0.1 })),
      // hoisted overhead, the chest thrown open
      K(0.5, B({ ...body, twist: 0.0, lean: -0.3, crouch: -0.06, width: 0.26, headPitch: -0.45 })),
      K(0.6, B({ ...body, twist: 0.7, hipTwist: 0.35, lean: 0.3, crouch: -0.36, step: 0.3, back: 0.4, width: 0.26 })),
      K(0.68, B({ ...body, twist: 0.8, hipTwist: 0.4, lean: -0.25, crouch: -0.05, step: 0.3, back: 0.4, width: 0.24, headPitch: -0.25 }), { hop: 0.06 }),
      K(entSlam, B({ ...body, twist: -0.1, hipTwist: -0.1, lean: 0.85, crouch: -0.52, step: 0.6, back: 0.46, width: 0.3, headPitch: -0.3 }), { hop: 0 }),
      K(0.88, B({ ...body, twist: -0.1, hipTwist: -0.1, lean: 0.88, crouch: -0.54, step: 0.6, back: 0.46, width: 0.3, headPitch: -0.3 })),
      K(0.96, body),
    ],
    main: { kind: 'hold' },
    start: 0,
    rest: 1,
    end: 1,
    lead: 0,
    fx: [
      fx(0.12, 'stomp', 'feet', 1.2),
      fx(0.12, 'shake', 'root', 0.8),
      fx(0.22, 'stomp', 'feet', 1.5),
      fx(0.22, 'shake', 'root', 1.1),
      fx(0.33, 'dust', 'tip', 1),
      fx(0.62, 'whirl', 'root', 1.1, '#ffe2b0'),
      fx(entSlam, 'shockwave', 'tip', 1.6),
      fx(entSlam, 'quake', 'tip', 1.2),
      fx(entSlam, 'shake', 'root', 1.2),
      fx(entSlam + 0.01, 'embers', 'root', 1.3),
      fx(0.88, 'embers', 'root', 0.8),
    ],
    trail: { life: 0.24, glow: 0.5 },
  }), entLine, G2),
};
