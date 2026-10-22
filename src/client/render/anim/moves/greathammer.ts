/**
 * Warden, warhammer. A sledge the size of a man, swung with everything he has. Between blows the
 * head rests on the floor ahead of his left foot, the haft angled back up into both fists at his
 * right hip; every blow drags it round the body or loops it up over a shoulder and lets the whole
 * weight of him follow it through, the arms flung out at full stretch toward the target and the
 * head usually ending back in the dirt in front of him. The lights chain a low drag round the
 * front, a flat backhand and a chop down over the left shoulder; the special is a spinning sweep.
 */
import { B, K, P, fx, line, mv } from '../author';
import type { Style } from '../author';
import { CHEST, G2, GUARD_DIR, H, LOW, OUT, OVER, REST, aim, body, heave, held } from './greathammer-base';
import { WARDEN_B, WARDEN_EXECUTE } from './greathammer-b';

// The lights follow the reference's chain (ref.mov 5.4-5.9 s, 2.1-2.6 s and 3.0-3.6 s): a flat sweep
// left to right that loops up toward his right shoulder, a backhand back across at the chest that
// carries the head round behind his left shoulder, and a chop over that shoulder into the floor.

// Drag Sweep (ref.mov #66-#70): the head swung back off the floor round his left side and low
// behind him while the fists come up to his right chest, then swept flat across the front at the
// waist, the arms flung out after it, and on round to his right, rising toward the shoulder
const drag = [
  H(-0.3, LOW, GUARD_DIR),
  H(-0.05, [-0.08, 0.36, 0.3], aim(105, -30)),
  H(0.15, [-0.13, 0.5, 0.26], aim(140, -18)),
  H(0.3, [-0.03, 0.36, 0.4], aim(70, -8)),
  H(0.45, [-0.06, 0.3, 0.46], aim(0, -4)),
  H(0.62, [-0.12, 0.36, 0.42], aim(-60, 6)),
  H(0.82, [-0.16, 0.5, 0.34], aim(-95, 24)),
  H(1.07, [-0.16, 0.52, 0.32], aim(-104, 28)),
];

// Backhand (ref.mov #26-#29): hauled out to his right at the hip, then swept back across the
// front at the chest, arms straight, and on round behind his left shoulder, still rising
const backhand = [
  H(-0.3, [-0.16, 0.52, 0.32], aim(-104, 28)),
  H(-0.05, [-0.18, 0.4, 0.3], aim(-85, 10)),
  H(0.1, [-0.2, 0.34, 0.28], aim(-70, 2)),
  H(0.28, [-0.1, 0.38, 0.42], aim(-30, 4)),
  H(0.45, CHEST, aim(5, 6)),
  H(0.62, [0.0, 0.42, 0.4], aim(70, 14)),
  H(0.82, [0.02, 0.56, 0.32], aim(118, 28)),
  H(1.07, [0.02, 0.6, 0.3], aim(132, 34)),
];

// Shoulder Chop (ref.mov #40-#44): from behind his left shoulder the head is heaved up over it,
// the fists going up past the right side of the helm, then chopped down diagonally across the
// front into the floor ahead on his right, the haft back across to his left hip
const chop = [
  H(-0.3, [0.02, 0.6, 0.3], aim(132, 34)),
  H(-0.05, [-0.06, 0.72, 0.24], aim(122, 42)),
  H(0.12, [-0.08, 0.8, 0.2], aim(110, 46)),
  H(0.28, [-0.05, 0.84, 0.3], aim(55, 64)),
  H(0.38, [-0.04, 0.52, 0.44], aim(12, 22)),
  H(0.45, OUT, aim(-6, -6)),
  H(0.6, [0.04, 0.24, 0.44], aim(-22, -30)),
  H(1.07, [0.06, 0.24, 0.42], aim(-26, -36)),
];

// Cyclone (ref2 1.1-1.9 s): the head dragged out to his left along the floor, then whirled round
// flat at chest height one whole turn and a quarter, the fists up in front of his chest and the
// body upright over a wide base; the hit as it comes round the front, then he drops into a lunge
const cyc: ReturnType<typeof H>[] = [H(-1.3, LOW, GUARD_DIR), H(-1.0, [0.02, 0.24, 0.28], aim(118, -26))];
for (let i = 1; i <= 10; i++) cyc.push(H(-1.0 + (1.45 * i) / 10, [0.0, 0.42 - 0.012 * i, 0.4 + 0.006 * i], aim(95 - 45.5 * i, Math.min(8, -20 + 6 * i))));
cyc.push(H(0.62, [-0.05, 0.28, 0.46], aim(-410, -10)), H(0.82, REST, aim(-440, -28)), H(1.07, REST, aim(-450, -36)));

// Charging Uppercut (ref2 #27-#29): the head trailed behind on the floor at his left through the
// dash, then swung down past his left foot and up under the target, the arms carrying on up until
// the fists are over his head and the hammer stands straight up
const upper = [
  H(-0.4, LOW, aim(110, -34)),
  H(0.05, [0.06, 0.18, 0.3], aim(165, -30)),
  H(0.22, [0.05, 0.16, 0.36], aim(80, -48)),
  H(0.34, [0.0, 0.2, 0.44], aim(15, -30)),
  H(0.45, OUT, aim(0, 12)),
  H(0.62, [-0.05, 0.56, 0.4], aim(-4, 52)),
  H(0.85, [-0.05, 0.82, 0.3], aim(-8, 76)),
  H(1.07, [-0.05, 0.84, 0.28], aim(-8, 78)),
];

// Ram (ref2 #30-#31, #36): the fists drawn back to his right hip with the haft level and the head
// pointing at the target, then the head rammed straight out at the chest as he steps away
const ram = [
  H(-0.35, LOW, GUARD_DIR),
  H(-0.1, [-0.12, 0.28, 0.22], aim(10, -12)),
  H(0.1, [-0.17, 0.32, 0.06], aim(-2, 2)),
  H(0.32, [-0.1, 0.36, 0.3], aim(0, 3)),
  H(0.45, CHEST, aim(0, 4)),
  H(0.62, [-0.05, 0.36, 0.44], aim(2, 0)),
  H(0.85, [-0.04, 0.3, 0.42], aim(8, -16)),
  H(1.07, [-0.04, 0.26, 0.4], aim(14, -26)),
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
    // Drag Sweep (ref.mov 5.4-5.8 s): the hips and shoulders wind left over the long rear leg as
    // the head drops away behind his left heel and the fists come up to his right chest; then the
    // lead foot plants, the hips turn back first, the shoulders follow and the arms fling it flat
    // across the front at the waist, and he turns on after it, rising as it climbs to his right
    l0: heave(mv({
      keys: [
        K(-0.3, body),
        // coiled: wound left, the weight back and down on the rear leg
        K(0.15, B({ ...body, twist: 1.05, hipTwist: 0.5, lean: 0.16, crouch: -0.24, step: 0.28, back: 0.4, width: 0.22, side: 0.08, headPitch: 0.1 })),
        // the lead foot strides and the hips unwind ahead of the chest
        K(0.32, B({ ...body, twist: 0.3, hipTwist: -0.18, lean: 0.36, crouch: -0.29, step: 0.5, back: 0.4, width: 0.22 })),
        K(0.45, B({ ...body, twist: -0.42, hipTwist: -0.38, lean: 0.48, crouch: -0.3, step: 0.52, back: 0.44, width: 0.23, headPitch: -0.2 })),
        // turned on round after it, coming up as it climbs
        K(0.75, B({ ...body, twist: -0.95, hipTwist: -0.5, lean: 0.3, crouch: -0.22, step: 0.5, back: 0.36, width: 0.26, side: -0.08, headPitch: -0.15 }), { spin: -0.05 }),
        K(1.07, B({ ...body, twist: -0.95, hipTwist: -0.5, lean: 0.24, crouch: -0.2, step: 0.56, back: 0.34, width: 0.26, side: -0.06 }), { spin: -0.07 }),
      ],
      main: { kind: 'hold' },
      start: -0.3,
      chamber: 0.15,
      travel: 0.3,
      lead: 0.06,
      fx: [fx(-0.1, 'dust', 'tip', 0.9), fx(0.4, 'dust', 'feet', 0.9), fx(0.45, 'quake', 'tip', 0.9), fx(0.5, 'whirl', 'root', 0.7, '#ffe2b0')],
      trail: { life: 0.18, glow: 0.35 },
    }), drag, G2),
    // Backhand (ref.mov 2.1-2.4 s): wound right with the head hauled out to that side at the hip and
    // the weight on the rear leg; the hips turn back first, the shoulders follow, the arms go out
    // straight as it crosses the front at the chest, and he turns on after it until it is behind
    // his left shoulder, the chest open
    l1: heave(mv({
      keys: [
        K(-0.3, B({ ...body, twist: -0.95, hipTwist: -0.5, lean: 0.24, crouch: -0.2, step: 0.56, back: 0.34, width: 0.26 })),
        // wound right, the weight back
        K(0.1, B({ ...body, twist: -1.0, hipTwist: -0.55, lean: 0.12, crouch: -0.23, step: 0.4, back: 0.44, width: 0.24, side: -0.06 })),
        K(0.3, B({ ...body, twist: -0.35, hipTwist: 0.15, lean: 0.3, crouch: -0.26, step: 0.5, back: 0.42, width: 0.22 })),
        K(0.45, B({ ...body, twist: 0.35, hipTwist: 0.38, lean: 0.36, crouch: -0.27, step: 0.56, back: 0.4, width: 0.22, headPitch: -0.15 })),
        // turned on round after it, the left shoulder drawn back, risen a little
        K(0.75, B({ ...body, twist: 1.0, hipTwist: 0.5, lean: 0.12, crouch: -0.2, step: 0.52, back: 0.34, width: 0.25, side: 0.08, headPitch: -0.1 }), { spin: 0.06 }),
        K(1.07, B({ ...body, twist: 1.02, hipTwist: 0.52, lean: 0.06, crouch: -0.19, step: 0.5, back: 0.32, width: 0.25, side: 0.06 }), { spin: 0.08 }),
      ],
      main: { kind: 'hold' },
      start: -0.3,
      chamber: 0.1,
      travel: 0.2,
      blendIn: 0.3,
      lead: 0.06,
      fx: [fx(-0.2, 'dust', 'feet', 0.8), fx(0.45, 'flashline', 'tip', 0.9), fx(0.5, 'whirl', 'root', 0.8, '#ffe2b0')],
      trail: { life: 0.2, glow: 0.4 },
    }), backhand),
    // Shoulder Chop (ref.mov 3.2-3.6 s): the hammer heaved up over his left shoulder, the fists over
    // the right side of the helm, the chest thrown open and up on his toes; then the lead foot
    // stamps, the hips square first, the trunk folds forward over the hips and the arms drive it
    // down across the front, the weight landing on the front leg as it bursts into the floor
    l2: heave(mv({
      keys: [
        K(-0.3, B({ ...body, twist: 1.02, hipTwist: 0.52, lean: 0.06, crouch: -0.19, step: 0.5, back: 0.32, width: 0.25 })),
        // up over the left shoulder: risen, still wound left, leaning back
        K(0.12, B({ ...body, twist: 0.8, hipTwist: 0.42, lean: -0.24, crouch: -0.04, step: 0.3, back: 0.4, width: 0.2, side: -0.06, headPitch: -0.25 }), { hop: 0.04 }),
        K(0.3, B({ ...body, twist: 0.3, hipTwist: -0.15, lean: 0.25, crouch: -0.24, step: 0.5, back: 0.42, width: 0.22 }), { hop: 0 }),
        K(0.45, B({ ...body, twist: -0.3, hipTwist: -0.32, lean: 0.66, crouch: -0.32, step: 0.55, back: 0.4, width: 0.25, headPitch: -0.3 })),
        K(0.7, B({ ...body, twist: -0.45, hipTwist: -0.38, lean: 0.74, crouch: -0.36, step: 0.57, back: 0.4, width: 0.27, headPitch: -0.32 })),
        K(1.07, B({ ...body, twist: -0.45, hipTwist: -0.38, lean: 0.72, crouch: -0.36, step: 0.57, back: 0.4, width: 0.27, headPitch: -0.28 })),
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
    // Cyclone: the perilous whirl (ref2 1.1-1.9 s). The head dragged out to his left along the
    // floor, wound left and sunk; then the hips lead off and the hammer hauls him round a whole turn
    // and on, upright and leaning out against its pull over a wide base, the fists up at his chest;
    // it tears through at chest height as it comes round the front and he drops into a long lunge
    sp: heave(mv({
      keys: [
        K(-1.3, body, { spin: 0 }),
        // the pull-back: wound left to the end of the turn and sunk on the rear leg, the head dragged far back
        K(-1.0, B({ ...body, twist: 1.15, hipTwist: 0.6, lean: 0.3, crouch: -0.34, step: 0.3, back: 0.5, width: 0.26, side: 0.1 }), { spin: 0 }),
        // up off the drag into the whirl, the chest up
        K(-0.6, B({ ...body, twist: 0.35, hipTwist: -0.2, lean: 0.1, crouch: -0.24, step: 0.32, back: 0.36, width: 0.32, side: 0.16, headPitch: -0.1 }), { spin: -0.25 }),
        K(-0.15, B({ ...body, twist: 0.3, hipTwist: -0.2, lean: 0.08, crouch: -0.24, step: 0.34, back: 0.36, width: 0.32, side: 0.18, headPitch: -0.1 }), { spin: -0.62 }),
        // through the target and down into the lunge behind it
        K(0.45, B({ ...body, twist: -0.3, hipTwist: -0.35, lean: 0.42, crouch: -0.32, step: 0.56, back: 0.42, width: 0.3, side: 0.06, headPitch: -0.2 }), { spin: -1.02 }),
        K(0.8, B({ ...body, twist: -0.65, hipTwist: -0.5, lean: 0.64, crouch: -0.47, step: 0.57, back: 0.49, width: 0.3, headPitch: -0.22 }), { spin: -1.15 }),
        K(1.07, B({ ...body, twist: -0.62, hipTwist: -0.48, lean: 0.6, crouch: -0.47, step: 0.57, back: 0.49, width: 0.3 }), { spin: -1.14 }),
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
        fx(-0.5, 'whirl', 'root', 1.0, '#ffb347'),
        fx(-0.1, 'whirl', 'root', 1.2, '#ff7a2a'),
        fx(0.45, 'flashline', 'tip', 1.2),
        fx(0.45, 'whirl', 'root', 1.5, '#ff7a2a'),
        fx(0.46, 'stomp', 'feet', 1),
        fx(0.6, 'dust', 'feet', 1.2),
      ],
      trail: { life: 0.26, glow: 0.65 },
    }), cyc, G2),
    // Charging Uppercut (ref2 2.1-2.4 s): bent low into the dash with the head trailing on the floor
    // behind his left heel, wound left; the lead foot strides out, the hips turn first and it comes
    // down past his foot and up under the target, the legs straightening under it until he is up on
    // his toes, the chest open and the fists over his head
    dl: heave(mv({
      keys: [
        K(-0.4, B({ ...body, twist: 0.6, hipTwist: 0.3, lean: 0.45, crouch: -0.26, step: 0.42, back: 0.46, width: 0.2 })),
        K(0.05, B({ ...body, twist: 1.0, hipTwist: 0.5, lean: 0.5, crouch: -0.33, step: 0.44, back: 0.52, width: 0.21 })),
        K(0.3, B({ ...body, twist: 0.35, hipTwist: -0.1, lean: 0.55, crouch: -0.32, step: 0.66, back: 0.5, width: 0.2 })),
        K(0.45, B({ ...body, twist: -0.15, hipTwist: -0.28, lean: 0.28, crouch: -0.2, step: 0.74, back: 0.48, width: 0.2, headPitch: -0.2 })),
        // up on his toes after it, the chest open
        K(0.8, B({ ...body, twist: -0.25, hipTwist: -0.28, lean: -0.24, crouch: -0.02, step: 0.6, back: 0.4, width: 0.18, headPitch: -0.45 }), { hop: 0.06 }),
        K(1.07, B({ ...body, twist: -0.22, hipTwist: -0.25, lean: -0.22, crouch: -0.04, step: 0.56, back: 0.38, width: 0.18, headPitch: -0.4 }), { hop: 0 }),
      ],
      main: { kind: 'hold' },
      start: -0.4,
      chamber: 0.05,
      travel: 0.4,
      lead: 0.05,
      ghosts: [-0.3, 0.5],
      fx: [fx(-0.3, 'dust', 'tip', 1), fx(0.1, 'quake', 'tip', 0.8), fx(0.3, 'dust', 'feet', 1.1), fx(0.45, 'flashline', 'tip', 1.1), fx(0.46, 'sparkle', 'tip', 1, '#ffffff')],
      trail: { life: 0.16, glow: 0.4 },
    }), upper, G2),
    // Ram (ref2 2.4-2.9 s): the rear foot reaches back and the hips sink onto it as the fists draw
    // back to his right hip, the haft level and aimed, the trunk turned right behind it; then the
    // hips square, the chest drives through behind the arms and the head is rammed straight out
    // into the target as he gives ground, the weight still going back
    bl: heave(mv({
      keys: [
        K(-0.35, body),
        // drawn back: turned right over the sinking rear leg
        K(0.1, B({ ...body, twist: -0.55, hipTwist: -0.3, lean: 0.1, crouch: -0.26, step: 0.26, back: 0.56, width: 0.22, side: -0.04 })),
        K(0.32, B({ ...body, twist: -0.25, hipTwist: -0.05, lean: 0.24, crouch: -0.29, step: 0.24, back: 0.64, width: 0.22 })),
        // rammed out: square, the chest behind the arms
        K(0.45, B({ ...body, twist: -0.05, hipTwist: 0.05, lean: 0.34, crouch: -0.3, step: 0.22, back: 0.7, width: 0.22, headPitch: -0.15 })),
        K(0.75, B({ ...body, twist: 0.0, hipTwist: 0.05, lean: 0.18, crouch: -0.27, step: 0.2, back: 0.74, width: 0.23, headPitch: -0.1 })),
        K(1.07, B({ ...body, twist: 0.0, hipTwist: 0.05, lean: 0.14, crouch: -0.24, step: 0.2, back: 0.72, width: 0.23 })),
      ],
      main: { kind: 'hold' },
      start: -0.35,
      chamber: 0.1,
      travel: 0.3,
      lead: 0.05,
      fx: [fx(0.12, 'dust', 'feet', 1), fx(0.45, 'spiral', 'tip', 0.9, '#ffe2b0'), fx(0.46, 'sparkle', 'tip', 0.9, '#ffffff'), fx(0.6, 'dust', 'feet', 0.9)],
      trail: { life: 0.16, glow: 0.4 },
    }), ram),
    // the heavy chain, the dash and backstep heavies and the air attacks
    ...WARDEN_B,
  },
  // Earthsplitter: shouldered, a backhand off the shoulder, hoisted straight up on one leg and
  // crushed down through them into the floor (greathammer-b.ts)
  execute: WARDEN_EXECUTE,
  executeReact: 'crumple',
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
      K(0, B({ ...body, twist: 0.2, lean: 0.25, crouch: -0.22, width: 0.22, headPitch: 0.3 })),
      K(0.1, B({ ...body, twist: 0.2, lean: 0.2, crouch: -0.26, width: 0.24, headPitch: 0.2 }), { hop: 0.06 }),
      K(0.12, B({ ...body, twist: 0.2, lean: 0.22, crouch: -0.29, width: 0.26, headPitch: 0.2 }), { hop: 0 }),
      K(0.2, B({ ...body, twist: 0.15, lean: 0.18, crouch: -0.22, width: 0.26, headPitch: 0.1 }), { hop: 0.08 }),
      K(0.22, B({ ...body, twist: 0.15, lean: 0.22, crouch: -0.3, width: 0.28, headPitch: 0.1 }), { hop: 0 }),
      K(0.34, B({ ...body, twist: 0.3, lean: 0.0, crouch: -0.16, width: 0.24, headPitch: -0.1 })),
      // hoisted overhead, the chest thrown open
      K(0.5, B({ ...body, twist: 0.0, lean: -0.3, crouch: -0.06, width: 0.26, headPitch: -0.45 })),
      K(0.6, B({ ...body, twist: 0.7, hipTwist: 0.35, lean: 0.3, crouch: -0.26, step: 0.3, back: 0.4, width: 0.26 })),
      K(0.68, B({ ...body, twist: 0.8, hipTwist: 0.4, lean: -0.25, crouch: -0.05, step: 0.3, back: 0.4, width: 0.24, headPitch: -0.25 }), { hop: 0.06 }),
      K(entSlam, B({ ...body, twist: -0.1, hipTwist: -0.1, lean: 0.85, crouch: -0.37, step: 0.52, back: 0.4, width: 0.3, headPitch: -0.3 }), { hop: 0 }),
      K(0.88, B({ ...body, twist: -0.1, hipTwist: -0.1, lean: 0.88, crouch: -0.39, step: 0.52, back: 0.4, width: 0.3, headPitch: -0.3 })),
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
