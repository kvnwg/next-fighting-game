/**
 * The Warden's heavy chain, dash heavy, backstep heavy and air attacks (spread into the style in
 * greathammer.ts).
 *
 * The big blows: the hammer goes up over a shoulder or over the top in a full windmill, the whole
 * body rising under it, and comes down at full stretch out in front of him as he crunches down
 * behind it; every one ends with the head in the floor ahead.
 */
import { B, K, fx, mv, track } from '../author';
import type { MoveDef, V3 } from '../author';
import { CHEST, G2, GUARD_DIR, H, HIGH, LOW, OUT, OVER, REST, aim, body, heave } from './greathammer-base';

// The heavy chain follows the reference's big blows in order: the windmill slam (ref.mov 2.9-3.6 s),
// the rising cleave that rips it back up out of the floor (ref.mov 2.1-2.6 s) and the
// earthbreaker, stood up overhead on one leg and driven into the floor (ref2 4.0-4.7 s).

// Windmill Slam (ref.mov #36-#44): the head dropped off the floor and swung back low past his left
// heel while the fists climb to his right shoulder, on up behind the left shoulder (the chamber),
// over the top with the fists above the right side of his helm, straight up, and down into the
// floor in front of him, landing a little to his right with the haft back across to his left hip
const windmill = [
  H(-0.6, LOW, GUARD_DIR),
  H(-0.38, [-0.08, 0.34, 0.3], aim(110, -34)),
  H(-0.16, [-0.13, 0.5, 0.26], aim(145, -22)),
  H(0.02, [-0.16, 0.62, 0.16], aim(150, 4)),
  // the chamber: the fists up past the right of the helm, the head hung right back over his back
  // behind the left shoulder, as far as it goes
  H(0.14, [-0.17, 0.8, 0.08], aim(170, 30)),
  H(0.26, HIGH, aim(150, 62)),
  H(0.33, OVER, aim(0, 86)),
  H(0.39, [-0.04, 0.6, 0.42], aim(-4, 40)),
  H(0.45, OUT, aim(-6, 0)),
  H(0.58, REST, aim(-14, -28)),
  H(1.07, [0.02, 0.24, 0.44], aim(-18, -32)),
];

// Rising Cleave (ref.mov #26-#31): out of the floor the head is dragged back round his left side
// and low behind him, the fists at his right hip; then ripped up diagonally across the front,
// meeting the target at the chest out on his right, and carried on up over his right shoulder
const cleave = [
  H(-0.5, [0.02, 0.24, 0.44], aim(-18, -32)),
  H(-0.25, [0.02, 0.24, 0.36], aim(60, -34)),
  H(-0.05, [-0.04, 0.26, 0.28], aim(135, -28)),
  // the chamber: the fists drawn back past the right hip, the head hung low right round behind him
  H(0.1, [-0.1, 0.3, 0.12], aim(-166, -6)),
  H(0.28, [-0.06, 0.3, 0.4], aim(70, -12)),
  H(0.45, [-0.1, 0.4, 0.45], aim(-15, 16)),
  H(0.62, [-0.15, 0.62, 0.34], aim(-55, 44)),
  H(0.82, [-0.15, 0.74, 0.26], aim(-118, 52)),
  H(1.07, [-0.15, 0.76, 0.24], aim(-135, 54)),
];

// Earthbreaker (ref2 #49-#57): from over his right shoulder the hammer is stood straight up over
// his head at full stretch, tipped a little ahead as the lead knee comes up, then brought over and
// down with everything as the foot stamps out, buried far ahead with the haft near level
const quake = [
  H(-1.1, [-0.15, 0.76, 0.24], aim(-135, 54)),
  H(-0.75, [-0.1, 0.86, 0.2], aim(-70, 72)),
  H(-0.4, OVER, aim(0, 86)),
  // the chamber: at full stretch overhead and tipped right back, the head hung over his back
  H(0.05, [-0.1, 0.95, 0.12], aim(180, 62)),
  H(0.27, [-0.03, 0.92, 0.3], aim(0, 64)),
  H(0.37, [-0.04, 0.56, 0.44], aim(0, 34)),
  H(0.45, OUT, aim(0, -2)),
  H(0.58, [-0.04, 0.2, 0.5], aim(0, -20)),
  H(1.07, [-0.04, 0.2, 0.5], aim(0, -22)),
];

// Diving Smash: cocked up over his left shoulder through the dash, then flung over the top with
// his whole body diving after it, flat out behind the haft as it lands far ahead
const dive = [
  H(-0.6, LOW, GUARD_DIR),
  H(-0.35, [-0.08, 0.4, 0.3], aim(100, -6)),
  H(-0.1, [-0.1, 0.62, 0.24], aim(112, 30)),
  H(0.05, [-0.15, 0.84, 0.1], aim(165, 42)),
  H(0.27, [-0.04, 0.84, 0.32], aim(30, 74)),
  H(0.37, [-0.03, 0.56, 0.44], aim(0, 38)),
  H(0.45, OUT, aim(0, -4)),
  H(0.58, REST, aim(0, -24)),
  H(1.07, REST, aim(0, -28)),
];

// Retreating Sweep: lifted out to his left and wound back behind him at the chest, then swept flat
// round the front as he steps away and on round behind his right shoulder
const sweep = [
  H(-0.6, LOW, GUARD_DIR),
  H(-0.35, [-0.04, 0.34, 0.32], aim(95, 2)),
  H(-0.1, [-0.04, 0.42, 0.26], aim(125, 8)),
  H(0.05, [-0.06, 0.46, 0.12], aim(-176, 8)),
  H(0.25, [0.0, 0.4, 0.38], aim(80, 8)),
  H(0.45, CHEST, aim(10, 6)),
  H(0.65, [-0.12, 0.38, 0.4], aim(-62, 6)),
  H(0.85, [-0.16, 0.42, 0.34], aim(-95, 6)),
  H(1.07, [-0.16, 0.38, 0.34], aim(-102, -6)),
];

// Air Whirl: in the air the hammer is flung out to his right and whirled flat round him the other
// way at chest height, a full turn of the body with it at the end of his arms
const whirl: ReturnType<typeof H>[] = [H(-0.7, LOW, GUARD_DIR), H(-0.45, [-0.08, 0.3, 0.34], aim(-60, -4))];
for (let i = 1; i <= 9; i++) whirl.push(H(-0.45 + (0.9 * i) / 9, [-0.04, 0.34, 0.44], aim(-60 + (420 / 9) * i, 6)));
whirl.push(H(0.65, [-0.02, 0.32, 0.42], aim(410, 0)), H(0.85, [0.0, 0.26, 0.38], aim(440, -10)), H(1.07, [0.0, 0.2, 0.36], aim(450, -22)));

// Meteor (ref2 #87-#89): in the air the hammer goes up over his head at full stretch as he arches,
// then he jack-knifes forward over it and it comes down ahead into the floor as he lands
const meteor = [
  H(-0.4, LOW, GUARD_DIR),
  H(-0.15, [-0.04, 0.6, 0.34], aim(10, 50)),
  H(0.05, [-0.1, 0.95, 0.12], aim(180, 60)),
  H(0.27, [-0.03, 0.86, 0.34], aim(0, 64)),
  H(0.37, [-0.04, 0.56, 0.44], aim(0, 36)),
  H(0.45, OUT, aim(0, -4)),
  H(0.58, REST, aim(0, -26)),
  H(1.07, REST, aim(0, -30)),
];

export const WARDEN_B: Partial<Record<string, MoveDef>> = {
  // Windmill Slam (ref.mov 2.9-3.6 s): the trunk turns left after the head as it drops back past
  // his left heel, the weight sinking onto the rear leg; he rises tall under it as it comes up
  // behind the left shoulder, the chest open and the fists going up past the helm; then the lead
  // foot stamps, the hips drive square first, the trunk folds forward over the front thigh and the
  // arms come down straight after it, all his weight on the front leg as it bursts into the floor
  h: heave(mv({
    keys: [
      K(-0.6, body),
      K(-0.3, B({ ...body, twist: 0.95, hipTwist: 0.5, lean: 0.24, crouch: -0.27, step: 0.28, back: 0.44, width: 0.22, side: 0.06 })),
      // risen under it behind the left shoulder: still turned left, the back arched
      // the pull-back: the weight right back on the rear foot, wound left to the end of the turn,
      // stretched tall and arched under it, side-bent away
      K(0.14, B({ ...body, twist: 0.98, hipTwist: 0.5, lean: -0.38, crouch: 0.02, step: 0.28, back: 0.48, width: 0.2, side: -0.1, headPitch: -0.42 }), { hop: 0.06 }),
      // the release: the lead foot stamps and the hips snap round ahead of the chest
      K(0.32, B({ ...body, twist: 0.25, hipTwist: -0.22, lean: 0.12, crouch: -0.2, step: 0.54, back: 0.44, width: 0.24, headPitch: -0.25 }), { hop: 0.02 }),
      // folded down into the blow over the front leg
      K(0.45, B({ ...body, twist: -0.2, hipTwist: -0.2, lean: 0.7, crouch: -0.33, step: 0.57, back: 0.42, width: 0.27, headPitch: -0.32 }), { hop: 0 }),
      // overshoot and absorb: folded on past it, the knees giving, dragged a little round to the right
      K(0.7, B({ ...body, twist: -0.36, hipTwist: -0.24, lean: 0.9, crouch: -0.44, step: 0.58, back: 0.46, width: 0.28, headPitch: -0.34 })),
      K(1.07, B({ ...body, twist: -0.42, hipTwist: -0.26, lean: 0.82, crouch: -0.45, step: 0.58, back: 0.46, width: 0.28, headPitch: -0.28 })),
    ],
    main: { kind: 'hold' },
    start: -0.6,
    chamber: 0.14,
    travel: 0.15,
    blendIn: 0.3,
    lead: 0.05,
    fx: [
      fx(-0.5, 'dust', 'tip', 1),
      fx(0.14, 'sparkle', 'tip', 0.7, '#ffd27a'),
      fx(0.47, 'stomp', 'feet', 1),
      fx(0.47, 'shockwave', 'tip', 1.5),
      fx(0.47, 'shake', 'root', 1.4),
      fx(0.5, 'dust', 'tip', 1.3),
    ],
    trail: { life: 0.22, glow: 0.6 },
  }), windmill, G2),
  // Rising Cleave (ref.mov 2.1-2.6 s): he hauls the head out of the crater and back round his left
  // side, wound left and sunk low over the rear leg; then the legs drive up, the hips turn back
  // first and the shoulders follow, and he rips it up across the front, straightening tall and
  // turning on to his right as it goes up over his right shoulder
  h1: heave(mv({
    keys: [
      K(-0.5, B({ ...body, twist: -0.42, hipTwist: -0.26, lean: 0.82, crouch: -0.45, step: 0.58, back: 0.46, width: 0.28 })),
      K(-0.2, B({ ...body, twist: 0.6, hipTwist: 0.3, lean: 0.45, crouch: -0.33, step: 0.5, back: 0.42, width: 0.26 })),
      // wound left, low, the weight back
      K(0.1, B({ ...body, twist: 1.18, hipTwist: 0.6, lean: 0.4, crouch: -0.42, step: 0.4, back: 0.48, width: 0.25, side: 0.1, headPitch: 0.05 })),
      K(0.3, B({ ...body, twist: 0.35, hipTwist: -0.12, lean: 0.3, crouch: -0.26, step: 0.54, back: 0.4, width: 0.24 })),
      // through the target, rising
      K(0.45, B({ ...body, twist: -0.4, hipTwist: -0.38, lean: 0.16, crouch: -0.24, step: 0.52, back: 0.44, width: 0.24, side: -0.06, headPitch: -0.2 })),
      // risen tall and turned right after it, the chest open under it
      K(0.75, B({ ...body, twist: -1.02, hipTwist: -0.52, lean: -0.22, crouch: -0.1, step: 0.56, back: 0.4, width: 0.23, side: -0.1, headPitch: -0.35 }), { spin: -0.06 }),
      // and the weight settles back down under it
      K(1.07, B({ ...body, twist: -0.98, hipTwist: -0.5, lean: -0.16, crouch: -0.16, step: 0.54, back: 0.4, width: 0.24, headPitch: -0.3 }), { spin: -0.07 }),
    ],
    main: { kind: 'hold' },
    start: -0.5,
    chamber: 0.1,
    travel: 0.15,
    blendIn: 0.3,
    lead: 0.05,
    fx: [fx(-0.45, 'quake', 'tip', 0.9), fx(-0.2, 'dust', 'tip', 1.0), fx(0.45, 'flashline', 'tip', 1.1), fx(0.46, 'sparkle', 'tip', 1, '#ffd27a'), fx(0.5, 'whirl', 'root', 1.0, '#ffb347')],
    trail: { life: 0.22, glow: 0.55 },
  }), cleave, G2),
  // Earthbreaker: the finisher (ref2 4.0-4.7 s). He squares up and stands the hammer straight up
  // over his head at full stretch, rising onto the rear leg as the lead knee comes up high, the
  // back arched under it; then the lead foot stamps far out, the hips drive through and the trunk
  // folds over the front thigh into a deep lunge as it comes over the top and the ground explodes
  h2: heave(mv({
    keys: [
      K(-1.1, B({ ...body, twist: -0.98, hipTwist: -0.5, lean: -0.16, crouch: -0.16, step: 0.54, back: 0.4, width: 0.24 }), { hop: 0 }),
      K(-0.6, B({ ...body, twist: -0.3, hipTwist: -0.15, lean: -0.1, crouch: -0.12, step: 0.3, back: 0.34, width: 0.22, headPitch: -0.3 })),
      // stood tall under it, the haft straight up over the helm
      K(-0.25, B({ ...body, twist: 0.0, lean: -0.18, crouch: -0.06, step: 0.22, back: 0.36, width: 0.2, headPitch: -0.45 })),
      // the lead knee up, risen on the rear leg, arched back
      K(0.05, B({ ...body, twist: 0.05, lean: -0.44, crouch: 0.05, step: 0.2, back: 0.46, width: 0.18, side: -0.06, headPitch: -0.48 }), { hop: 0.08 }),
      K(0.3, B({ ...body, twist: 0.0, lean: 0.22, crouch: -0.24, step: 0.53, back: 0.44, width: 0.24, headPitch: -0.25 }), { hop: 0.03 }),
      K(0.45, B({ ...body, twist: -0.08, lean: 0.62, crouch: -0.36, step: 0.65, back: 0.55, width: 0.27, headPitch: -0.28 }), { hop: 0 }),
      // the deep lunge: the front knee over the foot, the rear leg long, the chest down behind the haft
      K(0.6, B({ ...body, twist: -0.14, lean: 0.74, crouch: -0.54, step: 0.69, back: 0.63, width: 0.28, headPitch: -0.2 })),
      K(1.07, B({ ...body, twist: -0.16, lean: 0.66, crouch: -0.54, step: 0.69, back: 0.63, width: 0.28, headPitch: -0.15 })),
    ],
    main: { kind: 'hold' },
    // the lead knee lifted high under the raised hammer, then stamped out into the lunge
    kick: {
      foot: 'L',
      from: -0.3,
      to: 0.28,
      path: track([
        [0, [0.18, 0.03, 0.22]],
        [0.5, [0.17, 0.46, 0.16]],
        [1, [0.18, 0.2, 0.5]],
      ]),
    },
    start: -1.1,
    chamber: 0.05,
    travel: 0.1,
    blendIn: 0.25,
    lead: 0.04,
    end: 1.04,
    settle: 0.45,
    fx: [
      fx(-0.15, 'dust', 'feet', 1.1),
      fx(0.05, 'sparkle', 'tip', 0.8, '#ffd27a'),
      fx(0.4, 'stomp', 'feet', 1.2),
      fx(0.47, 'shockwave', 'tip', 1.9),
      fx(0.47, 'quake', 'tip', 1.3),
      fx(0.47, 'shake', 'root', 1.6),
      fx(0.5, 'embers', 'root', 1.3),
    ],
    trail: { life: 0.26, glow: 0.7 },
  }), quake, G2),
  // Diving Smash: out of the dash the hammer is cocked back over his left shoulder as he runs,
  // wound left; then he launches off the rear foot, hips first, and dives after it, the body all
  // but flat and the arms at full stretch as it comes over the top and lands far out ahead
  dh: heave(mv({
    keys: [
      K(-0.6, B({ ...body, lean: 0.35, crouch: -0.22, step: 0.4, back: 0.44 })),
      // the pull-back: the weight sat back on the rear foot, wound left, the chest arched open
      K(0.05, B({ ...body, twist: 1.0, hipTwist: 0.5, lean: 0.08, crouch: -0.3, step: 0.34, back: 0.62, width: 0.2, side: -0.06, headPitch: -0.25 })),
      K(0.3, B({ ...body, twist: 0.25, hipTwist: -0.1, lean: 0.55, crouch: -0.14, step: 0.56, back: 0.6, width: 0.2, headPitch: -0.35 }), { hop: 0.16 }),
      K(0.45, B({ ...body, twist: -0.1, hipTwist: -0.15, lean: 1.0, crouch: -0.24, step: 0.7, back: 0.66, width: 0.2, headPitch: -0.45 }), { hop: 0.06 }),
      K(0.65, B({ ...body, twist: -0.22, hipTwist: -0.18, lean: 1.1, crouch: -0.44, step: 0.74, back: 0.68, width: 0.24, headPitch: -0.5 }), { hop: 0 }),
      K(1.07, B({ ...body, twist: -0.24, hipTwist: -0.18, lean: 1.02, crouch: -0.44, step: 0.74, back: 0.68, width: 0.24, headPitch: -0.45 })),
    ],
    main: { kind: 'hold' },
    start: -0.6,
    chamber: 0.05,
    travel: 0.25,
    blendIn: 0.3,
    lead: 0.05,
    ghosts: [-0.1, 0.62],
    fx: [fx(-0.55, 'dust', 'feet', 1.1), fx(0.3, 'dust', 'feet', 1), fx(0.47, 'shockwave', 'tip', 1.4), fx(0.47, 'shake', 'root', 1.1), fx(0.6, 'stomp', 'feet', 1.1)],
    trail: { life: 0.22, glow: 0.6 },
  }), dive, G2),
  // Retreating Sweep: the hammer is lifted out to his left and wound back behind him, the hips and
  // shoulders turned away; then as the left foot reaches back the hips unwind and it sweeps flat
  // round the front at chest height, the weight thrown back and the body turning on after it
  bh: heave(mv({
    keys: [
      K(-0.6, body),
      // the pull-back: wound left to the end of the turn, the weight already sinking onto the reaching rear foot
      K(0.05, B({ ...body, twist: 1.25, hipTwist: 0.62, lean: 0.04, crouch: -0.32, step: 0.28, back: 0.6, width: 0.22, side: 0.1 })),
      K(0.28, B({ ...body, twist: 0.4, hipTwist: -0.15, lean: 0.25, crouch: -0.26, step: 0.24, back: 0.6, width: 0.22 })),
      K(0.45, B({ ...body, twist: -0.4, hipTwist: -0.38, lean: 0.3, crouch: -0.26, step: 0.22, back: 0.66, width: 0.24, headPitch: -0.15 })),
      K(0.75, B({ ...body, twist: -1.05, hipTwist: -0.55, lean: -0.15, crouch: -0.3, step: 0.2, back: 0.74, width: 0.26, side: -0.1 }), { spin: -0.1 }),
      K(1.07, B({ ...body, twist: -1.02, hipTwist: -0.54, lean: -0.18, crouch: -0.32, step: 0.2, back: 0.74, width: 0.26 }), { spin: -0.12 }),
    ],
    main: { kind: 'hold' },
    start: -0.6,
    chamber: 0.05,
    travel: 0.25,
    blendIn: 0.3,
    lead: 0.06,
    fx: [fx(-0.4, 'dust', 'tip', 0.9), fx(0.3, 'dust', 'feet', 1), fx(0.45, 'flashline', 'tip', 1.1), fx(0.5, 'whirl', 'root', 1.1, '#ffb347'), fx(0.75, 'dust', 'feet', 1)],
    trail: { life: 0.22, glow: 0.55 },
  }), sweep, G2),
  // Air Whirl: wound right in the air as it is flung out to that side, then the hips lead off and
  // the whole body turns a full circle with the hammer flat out at the end of his arms
  jl: heave(mv({
    keys: [
      K(-0.7, B({ ...body, crouch: -0.2, lean: 0.1 }), { spin: 0, hop: 0 }),
      K(-0.45, B({ ...body, twist: -0.95, hipTwist: -0.5, lean: 0.05, crouch: -0.24, side: -0.08 }), { spin: 0, hop: 0.12 }),
      // the knees tucked up as he turns
      K(-0.1, B({ ...body, twist: -0.3, hipTwist: 0.2, lean: 0.15, crouch: -0.26, step: 0.2, back: 0.16, side: -0.14 }), { spin: 0.4, hop: 0.24 }),
      K(0.45, B({ ...body, twist: 0.4, hipTwist: 0.35, lean: 0.25, crouch: -0.24, step: 0.22, back: 0.18, side: -0.1, headPitch: -0.15 }), { spin: 0.96, hop: 0.26 }),
      K(0.8, B({ ...body, twist: 0.6, hipTwist: 0.4, lean: 0.3, crouch: -0.23, side: -0.05 }), { spin: 1.06, hop: 0.12 }),
      K(1.07, B({ ...body, twist: 0.5, hipTwist: 0.35, lean: 0.25, crouch: -0.22 }), { spin: 1.08, hop: 0 }),
    ],
    main: { kind: 'hold' },
    start: -0.7,
    chamber: -0.45,
    flow: 1.5,
    blendIn: 0.35,
    lead: 0.05,
    fx: [fx(-0.3, 'whirl', 'root', 1.1, '#ffe2b0'), fx(0.45, 'whirl', 'root', 1.0, '#ffe2b0'), fx(0.45, 'flashline', 'tip', 0.9)],
    trail: { life: 0.22, glow: 0.45 },
  }), whirl, G2),
  // Meteor: in the air the hammer goes up and back behind his head, his back arched and the chest
  // open; then he jack-knifes forward over it, tipping into a forward roll, and it comes over the
  // top and down as he lands, crunched into a wide squat behind it as it hits the floor
  jh: heave(mv({
    keys: [
      K(-0.4, B({ ...body, crouch: -0.2, lean: 0.15 }), { flip: 0, hop: 0 }),
      K(0.05, B({ ...body, twist: 0.1, lean: -0.5, crouch: 0.05, step: 0.2, back: 0.24, width: 0.16, headPitch: -0.45 }), { flip: -0.07, hop: 0.4 }),
      // jack-knifed over it, the knees tucked
      K(0.3, B({ ...body, lean: 0.35, crouch: -0.24, step: 0.24, back: 0.2, width: 0.2, headPitch: -0.2 }), { flip: 0.07, hop: 0.3 }),
      K(0.45, B({ ...body, twist: -0.05, lean: 0.75, crouch: -0.29, step: 0.4, back: 0.36, width: 0.28, headPitch: -0.3 }), { flip: 0.03, hop: 0.06 }),
      K(0.6, B({ ...body, twist: -0.05, lean: 0.84, crouch: -0.48, step: 0.36, back: 0.36, width: 0.36, headPitch: -0.25 }), { flip: 0, hop: 0 }),
      K(1.07, B({ ...body, twist: -0.05, lean: 0.76, crouch: -0.42, step: 0.36, back: 0.36, width: 0.36, headPitch: -0.2 })),
    ],
    main: { kind: 'hold' },
    start: -0.4,
    chamber: 0.05,
    travel: 0.2,
    blendIn: 0.3,
    lead: 0.04,
    fx: [fx(0.05, 'sparkle', 'tip', 0.7, '#ffd27a'), fx(0.46, 'shockwave', 'tip', 1.4), fx(0.6, 'stomp', 'feet', 1.1), fx(0.46, 'shake', 'root', 1)],
    trail: { life: 0.22, glow: 0.6 },
  }), meteor, G2),
};

// ------------------------------------------------------------------- the execution
//
// Earthsplitter. s runs in seconds here: t = s + 1.7, so the finishing blow at s = 0.45 lands at
// 2.15 s. He shoulders the hammer and takes one heavy step; snaps their head round with a backhand
// off the shoulder; carries it on round behind his left shoulder and holds it there, glaring down
// at them; then heaves it straight up overhead on one leg, lets it fall back behind him, stamps
// and crushes it down through them into the floor, and shoulders it again.

/** the hammer rested on his right shoulder: the fists in front of the right chest, the haft back up over the shoulder */
const SHOULDERED: V3 = [-0.12, 0.5, 0.26];
const SHOULDER_DIR = aim(-168, 38);

const earthsplitter = [
  // shouldering it: the head swung up off the floor round his right side and onto the shoulder
  H(-1.7, LOW, GUARD_DIR),
  H(-1.5, [-0.08, 0.3, 0.36], aim(-15, -24)),
  H(-1.33, [-0.16, 0.44, 0.32], aim(-80, 12)),
  H(-1.18, [-0.14, 0.52, 0.28], aim(-140, 36)),
  H(-1.05, SHOULDERED, SHOULDER_DIR),
  H(-0.95, SHOULDERED, aim(-166, 36)),
  // the backhand's pull-back: the fists drawn back to his right shoulder, the head hung right out
  // behind him, a beat; then whipped out and flat across at their head, gathering speed all the way
  H(-0.87, [-0.2, 0.5, 0.16], aim(-178, 24)),
  H(-0.83, [-0.21, 0.49, 0.15], aim(-176, 22)),
  H(-0.8, [-0.21, 0.45, 0.22], aim(-140, 12)),
  H(-0.775, [-0.14, 0.4, 0.38], aim(-62, -6)),
  H(-0.75, [-0.06, 0.38, 0.46], aim(0, -16)),
  // and on round past them, the arms flung out after it
  H(-0.7, [0.02, 0.44, 0.42], aim(62, -4)),
  H(-0.62, [0.0, 0.52, 0.32], aim(100, 10)),
  // carried on up behind his left shoulder as far as it goes, the head beside the helm: held
  // there, wound, glaring down at them over it, breathing
  H(-0.5, [-0.1, 0.6, 0.2], aim(125, 24)),
  H(-0.4, [-0.17, 0.62, 0.12], aim(132, 30)),
  H(-0.12, [-0.17, 0.66, 0.1], aim(138, 34)),
  // heaved up over the left shoulder, straight up over his head at full stretch...
  H(-0.02, [-0.07, 0.9, 0.16], aim(70, 78)),
  H(0.06, [-0.05, 0.96, 0.16], aim(-20, 86)),
  // ...and let fall back behind his right shoulder to the end of its range, the elbows bent and
  // the wrists cocked: the whole weight of it hung behind him, held a beat, still breathing
  H(0.14, [-0.1, 0.95, 0.12], aim(-165, 42)),
  H(0.21, [-0.13, 0.92, 0.07], aim(-160, 4)),
  H(0.28, [-0.13, 0.91, 0.05], aim(-158, 0)),
  // the crush, slow out of the load and explosive into them: up behind, over the top, down
  H(0.331, [-0.12, 0.93, 0.1], aim(-160, 18)),
  H(0.374, [-0.1, 0.96, 0.2], aim(-170, 62)),
  H(0.408, [-0.11, 0.88, 0.3], aim(0, 65)),
  H(0.433, [-0.14, 0.74, 0.33], aim(5, 15)),
  // on them: the head across their head and shoulders, still travelling down
  H(0.45, [-0.16, 0.64, 0.33], aim(9, -24)),
  // and on through them into the floor, the momentum skidding it on a little round to his right
  H(0.51, [-0.1, 0.34, 0.46], aim(3, -36)),
  H(0.57, [-0.06, 0.24, 0.48], aim(-6, -38)),
  H(0.64, [-0.06, 0.24, 0.46], aim(-10, -38)),
  // hauled up out of the crater and shouldered again
  H(0.72, [-0.1, 0.32, 0.4], aim(-30, -26)),
  H(0.8, [-0.15, 0.46, 0.32], aim(-100, 22)),
  H(0.9, SHOULDERED, aim(-160, 36)),
  H(1.0, SHOULDERED, SHOULDER_DIR),
];

export const WARDEN_EXECUTE: MoveDef = heave(mv({
  keys: [
    K(-1.7, body),
    // shouldering it: turned right after the hammer, straightening tall, the weight back
    K(-1.3, B({ ...body, twist: -0.45, hipTwist: -0.2, lean: 0.0, crouch: -0.06, step: 0.24, back: 0.3, width: 0.2, headPitch: 0.1 })),
    // one heavy step at them, the weight rolling onto the lead foot, glaring down
    K(-1.05, B({ ...body, twist: -0.4, hipTwist: -0.18, lean: 0.1, crouch: -0.12, step: 0.4, back: 0.32, width: 0.2, headPitch: 0.2 })),
    // the backhand's pull-back: the weight rocked back onto the rear foot, hips and shoulders
    // wound right as far as they go, the trunk side-bent over the rear hip
    K(-0.87, B({ ...body, twist: -1.05, hipTwist: -0.55, lean: -0.04, crouch: -0.18, step: 0.38, back: 0.42, width: 0.22, side: -0.08, headPitch: 0.1 })),
    K(-0.83, B({ ...body, twist: -1.08, hipTwist: -0.56, lean: -0.06, crouch: -0.19, step: 0.38, back: 0.42, width: 0.22, side: -0.09, headPitch: 0.1 })),
    // the release: the hips snap round first, the trunk after, the arms last, the weight thrown forward
    K(-0.79, B({ ...body, twist: -0.55, hipTwist: 0.12, lean: 0.16, crouch: -0.22, step: 0.44, back: 0.4, width: 0.22 })),
    K(-0.75, B({ ...body, twist: 0.25, hipTwist: 0.34, lean: 0.28, crouch: -0.24, step: 0.48, back: 0.38, width: 0.22, headPitch: -0.05 })),
    // overshoot: turned on round after it, the knees giving
    K(-0.64, B({ ...body, twist: 0.85, hipTwist: 0.45, lean: 0.16, crouch: -0.2, step: 0.44, back: 0.38, width: 0.22, side: 0.06 })),
    // wound left under the chambered hammer to the end of its turn, the weight sunk back onto the
    // rear leg, the chest open: held, breathing
    K(-0.42, B({ ...body, twist: 0.98, hipTwist: 0.52, lean: -0.08, crouch: -0.14, step: 0.32, back: 0.44, width: 0.21, side: 0.08, headPitch: 0.15 })),
    K(-0.12, B({ ...body, twist: 1.02, hipTwist: 0.54, lean: -0.13, crouch: -0.12, step: 0.32, back: 0.44, width: 0.21, side: 0.05, headPitch: 0.1 })),
    // heaved up: squared, risen onto the rear leg as the lead knee comes up, the back arching
    K(0.04, B({ ...body, twist: 0.05, hipTwist: 0.04, lean: -0.3, crouch: 0.02, step: 0.26, back: 0.42, width: 0.18, headPitch: -0.4 }), { hop: 0.04 }),
    // the load: up on the rear toes, stretched long and arched right back under the hung hammer,
    // turned a little right after it; held, breathing
    K(0.2, B({ ...body, twist: -0.22, hipTwist: -0.1, lean: -0.46, crouch: 0.04, step: 0.24, back: 0.44, width: 0.18, side: 0.05, headPitch: -0.45 }), { hop: 0.06 }),
    K(0.28, B({ ...body, twist: -0.25, hipTwist: -0.12, lean: -0.5, crouch: 0.04, step: 0.24, back: 0.45, width: 0.18, side: 0.06, headPitch: -0.48 }), { hop: 0.06 }),
    // the release: the knee drives down into the stamp, the hips snap square and through, then
    // the trunk folds over the front thigh and the arms whip it over last
    K(0.36, B({ ...body, twist: -0.12, hipTwist: 0.0, lean: -0.18, crouch: -0.06, step: 0.44, back: 0.46, width: 0.22, headPitch: -0.35 }), { hop: 0.03 }),
    K(0.45, B({ ...body, twist: -0.04, lean: 0.46, crouch: -0.26, step: 0.62, back: 0.5, width: 0.26, headPitch: -0.3 }), { hop: 0 }),
    // overshoot and absorb: folded deep, the knees giving, the momentum dragging him round a little
    K(0.56, B({ ...body, twist: -0.12, hipTwist: -0.06, lean: 0.8, crouch: -0.42, step: 0.62, back: 0.52, width: 0.27, headPitch: -0.25 })),
    K(0.64, B({ ...body, twist: -0.2, hipTwist: -0.1, lean: 0.76, crouch: -0.46, step: 0.62, back: 0.52, width: 0.28, headPitch: -0.2 })),
    // straightening slowly, turned a little right under the shouldered hammer, chest up
    K(0.8, B({ ...body, twist: -0.32, hipTwist: -0.14, lean: 0.24, crouch: -0.2, step: 0.52, back: 0.44, width: 0.24, headPitch: -0.05 })),
    K(1.0, B({ ...body, twist: -0.4, hipTwist: -0.18, lean: -0.04, crouch: -0.1, step: 0.46, back: 0.4, width: 0.23, headPitch: -0.12 })),
  ],
  main: { kind: 'hold' },
  // the lead knee drawn up high under the raised hammer, then stamped far out into the blow
  kick: {
    foot: 'L',
    from: -0.02,
    to: 0.42,
    path: track([
      [0, [0.18, 0.04, 0.3]],
      [0.32, [0.17, 0.48, 0.18]],
      [0.72, [0.17, 0.5, 0.2]],
      [1, [0.19, 0.12, 0.62]],
    ]),
  },
  impacts: [-0.75, 0.45],
  start: -1.7,
  chamber: -0.95,
  rest: 1.0,
  end: 1.07,
  lead: 0.04,
  ghosts: [0.36, 0.52],
  fx: [
    fx(-1.6, 'dust', 'tip', 1.0),
    fx(-1.42, 'quake', 'tip', 0.7),
    fx(-1.02, 'stomp', 'feet', 1.1),
    fx(-1.02, 'shake', 'root', 0.5),
    fx(-0.86, 'dust', 'feet', 0.8),
    fx(-0.75, 'flashline', 'tip', 1.0),
    fx(-0.75, 'sparkle', 'tip', 1.0, '#ffffff'),
    fx(-0.72, 'whirl', 'root', 0.9, '#ffe2b0'),
    fx(-0.4, 'embers', 'root', 1.0),
    fx(0.06, 'sparkle', 'tip', 1.0, '#ffd27a'),
    fx(0.08, 'embers', 'root', 1.3),
    fx(0.41, 'stomp', 'feet', 1.3),
    fx(0.24, 'embers', 'root', 0.9),
    fx(0.45, 'shockwave', 'tip', 2.2),
    fx(0.45, 'quake', 'tip', 1.6),
    fx(0.45, 'shake', 'root', 2.0),
    fx(0.46, 'embers', 'root', 1.6),
    fx(0.5, 'dust', 'tip', 1.5),
    fx(0.62, 'dust', 'tip', 1.0),
    fx(0.64, 'dust', 'feet', 1.0),
  ],
  trail: { life: 0.28, glow: 0.8 },
}), earthsplitter, G2);
