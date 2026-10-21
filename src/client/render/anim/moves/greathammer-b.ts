/**
 * The Warden's heavy chain, dash heavy, backstep heavy and air attacks (spread into the style in
 * greathammer.ts).
 *
 * The big blows: the hammer goes up over a shoulder or over the top in a full windmill, the whole
 * body rising under it, and comes down at full stretch out in front of him as he crunches down
 * behind it; every one ends with the head in the floor ahead.
 */
import { B, K, fx, mv } from '../author';
import type { MoveDef, V3 } from '../author';
import { G2, H, aim, body, heave } from './greathammer-base';

const LOW: V3 = [-0.04, 0.2, 0.32];
const OUT: V3 = [-0.06, 0.24, 0.46];
const REST: V3 = [-0.05, 0.3, 0.42];
const OVER: V3 = [-0.02, 0.76, 0.34];
const GUARD_DIR = aim(42, -40);

// Windmill Slam: the head swung out to his left and down past his left heel, on up behind him in
// a great wheel over the left shoulder, over the top and straight down into the floor in front
const windmill = [
  H(-0.6, LOW, GUARD_DIR),
  H(-0.38, [0.02, 0.2, 0.36], aim(85, -34)),
  H(-0.16, [0.06, 0.3, 0.32], aim(135, -12)),
  H(0.02, [0.08, 0.5, 0.32], aim(165, 30)),
  H(0.14, [0.04, 0.7, 0.34], aim(180, 62)),
  H(0.28, OVER, aim(0, 84)),
  H(0.37, [-0.02, 0.56, 0.42], aim(0, 45)),
  H(0.45, OUT, aim(0, 4)),
  H(0.58, REST, aim(0, -30)),
  H(1.07, REST, aim(0, -30)),
];

// Cross Cleave: out of the crater the head is hauled up round his right side and over the right
// shoulder, then cleaved down diagonally across the front into the floor ahead of his left foot
const cleave = [
  H(-0.5, REST, aim(0, -30)),
  H(-0.25, [-0.12, 0.28, 0.34], aim(-70, -16)),
  H(-0.05, [-0.14, 0.46, 0.32], aim(-135, 22)),
  H(0.1, [-0.12, 0.64, 0.32], aim(-165, 52)),
  H(0.28, [-0.06, 0.74, 0.36], aim(-50, 72)),
  H(0.45, OUT, aim(12, -2)),
  H(0.6, [0.02, 0.3, 0.42], aim(32, -30)),
  H(1.07, [0.02, 0.3, 0.42], aim(40, -40)),
];

// Earthbreaker: hoisted straight up overhead, tipped back behind his head as he leaps, then
// brought over and down at full stretch as he lands, kneeling, the head buried far out ahead
const quake = [
  H(-1.1, [0.02, 0.3, 0.42], aim(40, -40)),
  H(-0.75, [-0.04, 0.34, 0.42], aim(18, 20)),
  H(-0.45, [-0.04, 0.6, 0.36], aim(5, 68)),
  H(-0.2, OVER, aim(0, 88)),
  H(0.05, [-0.02, 0.76, 0.36], aim(180, 66)),
  H(0.27, [-0.02, 0.76, 0.38], aim(0, 78)),
  H(0.37, [-0.04, 0.56, 0.42], aim(0, 42)),
  H(0.45, OUT, aim(0, 0)),
  H(0.58, REST, aim(0, -28)),
  H(1.07, REST, aim(0, -32)),
];

// Diving Smash: cocked back over his left shoulder through the dash, then flung over the top
// with his whole body diving after it, flat out behind the haft as it lands far ahead
const dive = [
  H(-0.6, LOW, GUARD_DIR),
  H(-0.35, [0.02, 0.34, 0.34], aim(100, 6)),
  H(-0.1, [0.08, 0.5, 0.32], aim(150, 38)),
  H(0.05, [0.08, 0.6, 0.32], aim(175, 50)),
  H(0.27, [0.0, 0.74, 0.36], aim(20, 80)),
  H(0.37, [-0.02, 0.56, 0.44], aim(0, 40)),
  H(0.45, OUT, aim(0, -4)),
  H(0.58, REST, aim(0, -28)),
  H(1.07, REST, aim(0, -32)),
];

// Retreating Sweep: lifted out to his left and wound back behind him at the chest, then swept flat
// round the front as he steps away and on round behind his right shoulder
const sweep = [
  H(-0.6, LOW, GUARD_DIR),
  H(-0.35, [0.0, 0.3, 0.32], aim(95, 4)),
  H(-0.1, [0.02, 0.4, 0.26], aim(130, 12)),
  H(0.05, [0.02, 0.42, 0.24], aim(150, 12)),
  H(0.25, [0.03, 0.4, 0.38], aim(80, 8)),
  H(0.45, [-0.06, 0.34, 0.46], aim(10, 6)),
  H(0.65, [-0.12, 0.34, 0.4], aim(-62, 4)),
  H(0.85, [-0.16, 0.32, 0.36], aim(-90, -4)),
  H(1.07, [-0.16, 0.28, 0.36], aim(-98, -12)),
];

// Air Whirl: in the air the hammer is flung out to his right and whirled flat round him the other
// way at chest height, a full turn of the body with it at the end of his arms
const whirl: ReturnType<typeof H>[] = [H(-0.7, LOW, GUARD_DIR), H(-0.45, [-0.08, 0.3, 0.34], aim(-60, -4))];
for (let i = 1; i <= 9; i++) whirl.push(H(-0.45 + (0.9 * i) / 9, [-0.04, 0.32, 0.44], aim(-60 + (420 / 9) * i, 4)));
whirl.push(H(0.65, [-0.02, 0.3, 0.42], aim(410, 0)), H(0.85, [0.0, 0.26, 0.38], aim(440, -10)), H(1.07, [0.0, 0.2, 0.36], aim(450, -22)));

// Meteor: in the air the hammer goes up and back behind his head as he arches, then he jack-knifes
// forward over it and it comes over the top and down ahead into the floor as he lands
const meteor = [
  H(-0.4, LOW, GUARD_DIR),
  H(-0.15, [-0.02, 0.55, 0.36], aim(15, 55)),
  H(0.05, [-0.02, 0.74, 0.34], aim(175, 62)),
  H(0.27, [-0.02, 0.74, 0.38], aim(0, 80)),
  H(0.37, [-0.04, 0.56, 0.42], aim(0, 42)),
  H(0.45, OUT, aim(0, -4)),
  H(0.58, REST, aim(0, -30)),
  H(1.07, REST, aim(0, -34)),
];

export const WARDEN_B: Partial<Record<string, MoveDef>> = {
  // Windmill Slam: wound left and sunk as the head goes back past his left heel; then he rises
  // up onto his toes under it as it wheels up behind him, the chest open and the back arched; and
  // the lead foot stamps, the hips drive through and he crunches down after it, all his weight on
  // the front leg as it bursts into the floor in front of him
  h: heave(mv({
    keys: [
      K(-0.6, body),
      K(-0.3, B({ ...body, twist: 0.95, hipTwist: 0.5, lean: 0.3, crouch: -0.4, step: 0.28, back: 0.44, width: 0.22 })),
      // risen under it at the top
      K(0.14, B({ ...body, twist: 0.45, hipTwist: 0.2, lean: -0.32, crouch: 0.04, step: 0.3, back: 0.4, width: 0.2, headPitch: -0.4 }), { hop: 0.06 }),
      K(0.32, B({ ...body, twist: 0.1, hipTwist: -0.1, lean: 0.1, crouch: -0.18, step: 0.52, back: 0.42, width: 0.24, headPitch: -0.25 }), { hop: 0.02 }),
      // crunched down into the blow
      K(0.45, B({ ...body, twist: -0.15, hipTwist: -0.15, lean: 0.8, crouch: -0.5, step: 0.64, back: 0.46, width: 0.28, headPitch: -0.3 }), { hop: 0 }),
      K(0.7, B({ ...body, twist: -0.2, hipTwist: -0.15, lean: 0.95, crouch: -0.56, step: 0.66, back: 0.48, width: 0.3, headPitch: -0.35 })),
      K(1.07, B({ ...body, twist: -0.2, hipTwist: -0.15, lean: 0.92, crouch: -0.56, step: 0.66, back: 0.48, width: 0.3, headPitch: -0.3 })),
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
  // Cross Cleave: he hauls himself round to the right as it comes up out of the crater, wound
  // right and rising onto his toes with the hammer up behind the right shoulder; then the hips turn
  // back first, the left foot steps across, and he cleaves it down across himself, bent over it
  h1: heave(mv({
    keys: [
      K(-0.5, B({ ...body, twist: -0.2, hipTwist: -0.15, lean: 0.9, crouch: -0.56, step: 0.66, back: 0.48, width: 0.3 })),
      K(-0.2, B({ ...body, twist: -0.9, hipTwist: -0.5, lean: 0.3, crouch: -0.38, step: 0.42, back: 0.46, width: 0.24 })),
      K(0.1, B({ ...body, twist: -1.15, hipTwist: -0.55, lean: -0.28, crouch: 0.02, step: 0.34, back: 0.42, width: 0.2, side: -0.08, headPitch: -0.3 }), { hop: 0.05 }),
      K(0.3, B({ ...body, twist: -0.45, hipTwist: 0.15, lean: 0.2, crouch: -0.24, step: 0.5, back: 0.44, width: 0.24 }), { hop: 0 }),
      K(0.45, B({ ...body, twist: 0.5, hipTwist: 0.4, lean: 0.75, crouch: -0.48, step: 0.62, back: 0.46, width: 0.28, headPitch: -0.3 })),
      K(0.75, B({ ...body, twist: 0.75, hipTwist: 0.45, lean: 0.85, crouch: -0.52, step: 0.62, back: 0.44, width: 0.3, headPitch: -0.3 }), { spin: 0.04 }),
      K(1.07, B({ ...body, twist: 0.7, hipTwist: 0.42, lean: 0.8, crouch: -0.5, step: 0.6, back: 0.42, width: 0.3, headPitch: -0.25 }), { spin: 0.05 }),
    ],
    main: { kind: 'hold' },
    start: -0.5,
    chamber: 0.1,
    travel: 0.15,
    blendIn: 0.3,
    lead: 0.05,
    fx: [fx(-0.45, 'quake', 'tip', 0.9), fx(0.45, 'flashline', 'tip', 1.1), fx(0.5, 'shockwave', 'tip', 1.2), fx(0.5, 'shake', 'root', 1.1), fx(0.52, 'dust', 'tip', 1.2)],
    trail: { life: 0.22, glow: 0.55 },
  }), cleave, G2),
  // Earthbreaker: the finisher. He stands the hammer straight up over his head, then tips it back
  // behind him and leaps, arched back under it; it comes over the top and he lands into a deep
  // kneeling lunge behind it as it buries itself far out ahead and the ground explodes
  h2: heave(mv({
    keys: [
      K(-1.1, B({ ...body, twist: 0.7, hipTwist: 0.42, lean: 0.8, crouch: -0.5, step: 0.6, back: 0.42, width: 0.3 }), { hop: 0 }),
      K(-0.6, B({ ...body, twist: 0.1, hipTwist: 0.05, lean: -0.05, crouch: -0.2, step: 0.32, back: 0.32, width: 0.24, headPitch: -0.2 })),
      // stood up straight under it, the haft vertical over the helm
      K(-0.2, B({ ...body, twist: 0.0, lean: -0.15, crouch: -0.32, step: 0.3, back: 0.34, width: 0.26, headPitch: -0.45 })),
      // leaping, arched back under it as it tips behind him
      K(0.05, B({ ...body, twist: 0.0, lean: -0.38, crouch: 0.06, step: 0.36, back: 0.4, width: 0.2, headPitch: -0.4 }), { hop: 0.42 }),
      K(0.3, B({ ...body, twist: 0.0, lean: 0.25, crouch: -0.12, step: 0.6, back: 0.5, width: 0.22, headPitch: -0.25 }), { hop: 0.3 }),
      K(0.45, B({ ...body, twist: -0.1, lean: 0.62, crouch: -0.46, step: 0.72, back: 0.62, width: 0.26, headPitch: -0.25 }), { hop: 0.08 }),
      // landed kneeling, the back knee all but down, the chest up behind the haft
      K(0.6, B({ ...body, twist: -0.1, lean: 0.5, crouch: -0.74, step: 0.74, back: 0.72, width: 0.28, headPitch: -0.15 }), { hop: 0 }),
      K(1.07, B({ ...body, twist: -0.1, lean: 0.46, crouch: -0.74, step: 0.74, back: 0.72, width: 0.28, headPitch: -0.1 })),
    ],
    main: { kind: 'hold' },
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
      fx(0.47, 'shockwave', 'tip', 1.9),
      fx(0.47, 'quake', 'tip', 1.3),
      fx(0.47, 'shake', 'root', 1.6),
      fx(0.5, 'embers', 'root', 1.3),
      fx(0.58, 'stomp', 'feet', 1.2),
    ],
    trail: { life: 0.26, glow: 0.7 },
  }), quake, G2),
  // Diving Smash: out of the dash the hammer is cocked back over his left shoulder as he runs,
  // wound left; then he launches off the rear foot, hips first, and dives after it, the body all
  // but flat and the arms at full stretch as it comes over the top and lands far out ahead
  dh: heave(mv({
    keys: [
      K(-0.6, B({ ...body, lean: 0.35, crouch: -0.3, step: 0.4, back: 0.44 })),
      K(0.05, B({ ...body, twist: 0.85, hipTwist: 0.4, lean: 0.25, crouch: -0.36, step: 0.36, back: 0.56, width: 0.2, headPitch: -0.1 })),
      K(0.3, B({ ...body, twist: 0.25, hipTwist: -0.1, lean: 0.55, crouch: -0.14, step: 0.56, back: 0.6, width: 0.2, headPitch: -0.35 }), { hop: 0.16 }),
      K(0.45, B({ ...body, twist: -0.1, hipTwist: -0.15, lean: 1.0, crouch: -0.34, step: 0.7, back: 0.66, width: 0.2, headPitch: -0.45 }), { hop: 0.06 }),
      K(0.65, B({ ...body, twist: -0.15, hipTwist: -0.15, lean: 1.08, crouch: -0.52, step: 0.74, back: 0.68, width: 0.24, headPitch: -0.5 }), { hop: 0 }),
      K(1.07, B({ ...body, twist: -0.15, hipTwist: -0.15, lean: 1.05, crouch: -0.52, step: 0.74, back: 0.68, width: 0.24, headPitch: -0.45 })),
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
      K(0.05, B({ ...body, twist: 1.2, hipTwist: 0.6, lean: 0.12, crouch: -0.34, step: 0.3, back: 0.5, width: 0.22, side: 0.06 })),
      K(0.28, B({ ...body, twist: 0.4, hipTwist: -0.15, lean: 0.25, crouch: -0.36, step: 0.24, back: 0.6, width: 0.22 })),
      K(0.45, B({ ...body, twist: -0.4, hipTwist: -0.38, lean: 0.3, crouch: -0.36, step: 0.22, back: 0.66, width: 0.24, headPitch: -0.15 })),
      K(0.75, B({ ...body, twist: -0.95, hipTwist: -0.5, lean: -0.15, crouch: -0.34, step: 0.2, back: 0.74, width: 0.26, side: -0.08 }), { spin: -0.08 }),
      K(1.07, B({ ...body, twist: -0.95, hipTwist: -0.5, lean: -0.22, crouch: -0.36, step: 0.2, back: 0.74, width: 0.26 }), { spin: -0.1 }),
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
      K(-0.1, B({ ...body, twist: -0.3, hipTwist: 0.2, lean: 0.15, crouch: -0.36, step: 0.2, back: 0.16, side: -0.14 }), { spin: 0.4, hop: 0.24 }),
      K(0.45, B({ ...body, twist: 0.4, hipTwist: 0.35, lean: 0.25, crouch: -0.34, step: 0.22, back: 0.18, side: -0.1, headPitch: -0.15 }), { spin: 0.96, hop: 0.26 }),
      K(0.8, B({ ...body, twist: 0.6, hipTwist: 0.4, lean: 0.3, crouch: -0.32, side: -0.05 }), { spin: 1.06, hop: 0.12 }),
      K(1.07, B({ ...body, twist: 0.5, hipTwist: 0.35, lean: 0.25, crouch: -0.3 }), { spin: 1.08, hop: 0 }),
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
      K(0.05, B({ ...body, twist: 0.1, lean: -0.4, crouch: 0.04, step: 0.2, back: 0.2, width: 0.16, headPitch: -0.35 }), { flip: -0.05, hop: 0.4 }),
      // jack-knifed over it, the knees tucked
      K(0.3, B({ ...body, lean: 0.35, crouch: -0.34, step: 0.24, back: 0.2, width: 0.2, headPitch: -0.2 }), { flip: 0.07, hop: 0.3 }),
      K(0.45, B({ ...body, twist: -0.05, lean: 0.75, crouch: -0.4, step: 0.4, back: 0.36, width: 0.28, headPitch: -0.3 }), { flip: 0.03, hop: 0.06 }),
      K(0.6, B({ ...body, twist: -0.05, lean: 0.8, crouch: -0.6, step: 0.36, back: 0.36, width: 0.36, headPitch: -0.25 }), { flip: 0, hop: 0 }),
      K(1.07, B({ ...body, twist: -0.05, lean: 0.76, crouch: -0.58, step: 0.36, back: 0.36, width: 0.36, headPitch: -0.2 })),
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
