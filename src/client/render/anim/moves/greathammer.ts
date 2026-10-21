/**
 * Warden, warhammer. Everything is weight: the hammer is thrown more than swung, the body
 * chases it, and whatever it meets (the ground included) gets hit hard. The lights chain from a
 * diagonal smash into a full-turn cyclone, the heavy leaps and cracks the earth, and the special
 * tears a trench through the ground at ankle height.
 */
import { B, K, P, Style, X, arc, fx, hitAt, line, mv, seq } from '../author';

const G2 = -0.33; // the left hand rides down by the pommel
const body = B({ front: 'L', step: 0.26, back: 0.26, width: 0.17, crouch: -0.11, lean: 0.1, twist: -0.22 });

// Skullcrusher: off the right shoulder, diagonally down through the target, into the dirt on the left
const crush = arc([0, 0.36, 0.14], 0.2, [[-0.45, 0.85, -0.3], [-0.4, 0.8, 0.55], [-0.06, 0.48, 1], [0.32, -0.3, 0.85], [0.4, -0.85, 0.35]], G2);
const crushHit = hitAt(crush, 2);

// Cyclone: a low pendulum back to the right, a full turn with the hammer dragged behind, and the whip
const cyclone = seq(
  [
    [-1.5, -0.95, arc([0, 0.3, 0.12], 0.2, [[0.4, -0.85, 0.35], [0, -0.75, 0.65], [-0.55, -0.55, 0.45], [-0.85, -0.3, -0.35]], G2)],
    [-0.95, 0.2, arc([0, 0.32, 0.12], 0.2, [[-0.85, -0.3, -0.35], [-0.95, 0.0, 0.05], [-0.85, 0.12, 0.5]], G2)],
    [0.2, 1.07, arc([0, 0.32, 0.14], 0.2, [[-0.85, 0.12, 0.5], [-0.45, 0.24, 0.9], [0, 0.3, 1], [0.4, 0.0, 0.9], [0.5, -0.55, 0.6]], G2)],
  ],
  0.08,
);
const cycloneHit = hitAt(cyclone, 2, 2);

// Meteor: a windmill from low behind, up over the head at the top of the leap, and down
const meteor = arc([0, 0.48, 0.08], 0.2, [[-0.3, -0.65, -0.7], [-0.12, 0.2, -1], [0, 1, -0.12], [0, 0.75, 0.66], [0, 0.35, 0.94], [0, -0.35, 0.94], [0, -0.75, 0.66]], G2);
const meteorApex = hitAt(meteor, 2);
const meteorHit = hitAt(meteor, 4);

// Earthshaker: dragged low behind on the right, ripped around through the ankles, flung up on the left
const quake = arc([-0.05, 0.24, 0.12], 0.17, [[-0.7, -0.35, -0.45], [-0.9, -0.16, 0.15], [-0.45, -0.14, 0.8], [0.05, -0.12, 1], [0.35, -0.08, 0.9], [0.42, 0.15, 0.75], [0.2, 0.45, 0.6]], G2);
const quakeHit = hitAt(quake, 3);

// Grave Bell: out of the Cyclone's low finish the head drops back beside the right foot, scrapes
// forward along the ground and is heaved straight up the centre line, under the chin
const bell = arc([0, 0.3, 0.14], 0.2, [[0.4, -0.7, 0.55], [-0.55, -0.72, -0.35], [-0.25, -0.88, 0.4], [-0.05, -0.3, 0.95], [0, 0.42, 0.9], [0.05, 0.88, 0.45], [0.1, 1, -0.08]], G2, { pivot1: [0, 0.5, 0.1] });
const bellChamber = hitAt(bell, 1);
const bellHit = hitAt(bell, 4);

// Avalanche: heaved up out of the dirt onto the left shoulder, then down diagonally to the right
const avalanche = arc([0.02, 0.36, 0.14], 0.2, [[0, -0.6, 0.8], [0.7, -0.45, 0.3], [0.75, 0.35, -0.3], [0.45, 0.85, -0.3], [0.4, 0.8, 0.55], [0.06, 0.5, 1], [-0.32, -0.25, 0.9], [-0.42, -0.7, 0.55]], G2);
const avalancheChamber = hitAt(avalanche, 3);
const avalancheHit = hitAt(avalanche, 5);

// Worldbreaker: dragged round behind on the right through a full turn, rising, over the top and
// straight down into the ground
const breaker = arc([0, 0.4, 0.12], 0.2, [[-0.42, -0.7, 0.55], [-0.85, -0.45, -0.25], [-0.8, 0.25, -0.55], [-0.3, 0.85, -0.45], [0, 1, -0.08], [0, 0.6, 0.8], [0, 0.15, 1], [0, -0.35, 0.94]], G2);
const breakerHit = hitAt(breaker, 6);
const breakerGround = hitAt(breaker, 7);

// Battering Ram: head first, from the right hip straight out
const ram = line([-0.14, 0.12, 0.02], [0.0, 0.32, 0.4], [0.06, 0.1, 1], [0, 0.04, 1], [1, 0, 0], G2, G2, { body: true });
const ramHit = 0.75;

// Landslide: dragged head-down behind on the right, then ripped up through the target to high left
const slide = arc([-0.04, 0.3, 0.12], 0.18, [[-0.3, -0.95, 0.05], [-0.6, -0.78, 0.3], [-0.35, -0.5, 0.8], [0.05, 0.35, 0.94], [0.42, 0.7, 0.58], [0.5, 0.85, 0.15]], G2);
const slideHit = hitAt(slide, 3);

// Rampart: flat from the right at head height, ending stood up on the left like a wall
const rampartSweep = arc([0, 0.4, 0.14], 0.2, [[-0.6, 0.6, -0.4], [-0.85, 0.3, 0.3], [-0.3, 0.26, 0.92], [0.05, 0.24, 1], [0.6, 0.2, 0.76], [0.8, 0.14, 0.3]], G2);
const rampart = seq([
  [0, 1.07, rampartSweep],
  [1.07, 1.36, arc([0.1, 0.32, 0.18], 0.2, [[0.8, 0.14, 0.3], [0.45, 0.75, 0.45], [0.15, 0.95, 0.25]], G2)],
], 0.07);
const rampartHit = hitAt(rampart, 3, 0);

// Gravestone: hoisted straight up, then dropped head-first into the ground in front, haft upright
const grave = arc([0, 0.42, 0.16], 0.18, [[-0.35, 0.85, -0.25], [0, 1, -0.15], [0, 0.6, 0.8], [0, 0.05, 1], [0, -0.6, 0.8], [0, -0.95, 0.3]], G2, { pivot1: [0, 0.52, 0.3] });
const graveTop = hitAt(grave, 1);
const graveHit = hitAt(grave, 3);

// Boulder Drop: a short chop from the right shoulder, over and down
const boulder = arc([0, 0.42, 0.12], 0.2, [[-0.35, 0.85, -0.25], [-0.15, 0.97, 0.15], [-0.06, 0.55, 0.83], [0, 0.0, 1], [0.06, -0.3, 0.95]], G2);
const boulderHit = hitAt(boulder, 3);

// Meteor Fall: cocked down behind the back, then over the top and down with a jackknife
const fall = arc([0, 0.45, 0.1], 0.2, [[-0.35, 0.85, -0.25], [0, 0.3, -0.95], [0, 0.95, -0.3], [0, 0.6, 0.8], [0, 0.0, 1], [0, -0.5, 0.86]], G2);
const fallCocked = hitAt(fall, 1);
const fallHit = hitAt(fall, 4);

export const greathammer: Style = {
  axis: 'x',
  offAxis: 'x',
  trail: { light: '#ffe2b0', heavy: '#ffb347', special: '#ff4a2a' },
  sparks: ['#ffb04a', '#ffffff', '#ff7a2a'],
  // resting over the right shoulder
  guard: P(body, X([0.07, 0.41, 0.13], [-0.35, 0.85, -0.25], [-1, 0, 0.2], 'x', G2)),
  block: P(B({ ...body, crouch: -0.16 }), X([0.15, 0.5, 0.32], [-1, 0.15, 0.05], [0, 1, 0.3], 'x', -0.3)),
  moves: {
    // Skullcrusher: the hips unwind right to left and drag the hammer through
    l0: mv({
      keys: [
        K(-0.2, B({ ...body, twist: -0.75, hipTwist: -0.25, lean: -0.05, crouch: -0.05, step: 0.22, headPitch: -0.05 })),
        K(crushHit, B({ ...body, twist: 0.05, hipTwist: 0.05, lean: 0.38, crouch: -0.22, step: 0.46, back: 0.3 })),
        K(1.0, B({ ...body, twist: 0.6, hipTwist: 0.25, lean: 0.52, crouch: -0.3, step: 0.5, back: 0.32, headPitch: 0.1 })),
      ],
      main: crush,
      impacts: [crushHit],
      chamber: -0.15,
      fx: [fx(0.64, 'dust', 'tip', 1.1)],
      trail: { glow: 0.3 },
    }),
    // Cyclone: the hammer swings back like a pendulum, the body whips through a full turn after it,
    // and the head comes round flat at chest height
    l1: mv({
      keys: [
        K(-1.5, B({ ...body, twist: 0.4, hipTwist: 0.2, lean: 0.4, crouch: -0.26, step: 0.45, back: 0.3 })),
        K(-0.95, B({ ...body, twist: -0.85, hipTwist: -0.3, lean: 0.22, crouch: -0.2, step: 0.32, back: 0.3, width: 0.2 }), { spin: 0 }),
        K(-0.5, B({ ...body, twist: -0.65, hipTwist: -0.2, lean: 0.2, crouch: -0.22, step: 0.32, back: 0.3, width: 0.2 }), { spin: 0.3 }),
        K(0.0, B({ ...body, twist: -0.4, hipTwist: -0.1, lean: 0.25, crouch: -0.24, step: 0.36, back: 0.3, width: 0.2 }), { spin: 0.62 }),
        K(cycloneHit + 0.1, B({ ...body, twist: 0.0, hipTwist: 0.0, lean: 0.35, crouch: -0.26, step: 0.45, back: 0.32 }), { spin: 1 }),
        K(1.1, B({ ...body, twist: 0.45, hipTwist: 0.2, lean: 0.45, crouch: -0.3, step: 0.46, back: 0.32, headPitch: 0.08 }), { spin: 1.08 }),
      ],
      main: cyclone,
      impacts: [cycloneHit],
      start: -1.5,
      chamber: -0.9,
      flow: 1.6,
      blendIn: 0.4,
      fx: [fx(-0.9, 'dust', 'feet', 0.8), fx(-0.2, 'whirl', 'root', 0.9, '#ffe2b0'), fx(0.85, 'dust', 'tip', 1)],
      trail: { life: 0.22, glow: 0.45 },
    }),
    // Meteor: crouch, leap, the hammer windmills up over the head at the top of the jump, hangs,
    // and comes down with the whole body behind it. The ground cracks.
    h: mv({
      keys: [
        K(0.0, B({ ...body, crouch: -0.3, lean: 0.28, twist: -0.25, hipTwist: -0.1, step: 0.3, back: 0.3, headPitch: 0.15 })),
        K(0.2, B({ ...body, crouch: -0.42, lean: 0.34, twist: -0.2, hipTwist: -0.1, step: 0.32, back: 0.32, headPitch: 0.1 }), { hop: 0 }),
        K(0.34, B({ ...body, crouch: -0.06, lean: -0.05, twist: -0.1, step: 0.3, back: 0.3 }), { hop: 0.25 }),
        K(meteorApex + 0.1, B({ ...body, crouch: 0.0, lean: -0.32, twist: -0.05, step: 0.32, back: 0.3, headPitch: -0.2 }), { hop: 0.62 }),
        K(meteorHit - 0.02, B({ ...body, crouch: -0.12, lean: 0.2, twist: 0.0, step: 0.42, back: 0.32 }), { hop: 0.3 }),
        K(meteorHit + 0.1, B({ ...body, crouch: -0.22, lean: 0.38, twist: 0.02, step: 0.48, back: 0.34 }), { hop: 0.04 }),
        K(meteorHit + 0.22, B({ ...body, crouch: -0.4, lean: 0.58, twist: 0.02, step: 0.5, back: 0.34, headPitch: 0.1 }), { hop: 0 }),
        K(1.12, B({ ...body, crouch: -0.44, lean: 0.62, twist: 0.02, step: 0.5, back: 0.34, headPitch: 0.15 })),
      ],
      main: meteor,
      impacts: [meteorHit],
      start: 0,
      chamber: meteorApex,
      travel: 0.3,
      end: 1.02,
      rest: 0.98,
      settle: 0.35,
      fx: [fx(0.24, 'dust', 'feet', 1.2), fx(meteorHit + 0.07, 'shockwave', 'tip', 1.3), fx(meteorHit + 0.07, 'stomp', 'feet', 1)],
      trail: { life: 0.2, glow: 0.6 },
    }),
    // Earthshaker: coiled all the way round to the right with the head in the dirt, then ripped
    // through everything at ankle height; the hammer's weight drags the body round after it
    sp: mv({
      keys: [
        K(-0.3, B({ ...body, twist: -1.0, hipTwist: -0.4, crouch: -0.3, lean: 0.3, step: 0.3, back: 0.34, width: 0.22, headPitch: 0.1 })),
        K(quakeHit + 0.1, B({ ...body, twist: -0.12, hipTwist: -0.05, crouch: -0.4, lean: 0.42, step: 0.45, back: 0.36, width: 0.24 })),
        K(0.8, B({ ...body, twist: 0.6, hipTwist: 0.3, crouch: -0.32, lean: 0.3, step: 0.45, back: 0.36, width: 0.24 }), { spin: 0.06 }),
        K(1.1, B({ ...body, twist: 0.9, hipTwist: 0.4, crouch: -0.18, lean: 0.1, step: 0.4, back: 0.34, width: 0.2, headPitch: -0.05 }), { spin: 0.12 }),
      ],
      main: quake,
      impacts: [quakeHit],
      chamber: -0.08,
      fx: [
        fx(-0.06, 'dust', 'tip', 0.9),
        fx(hitAt(quake, 2), 'quake', 'tip', 1),
        fx(quakeHit, 'quake', 'tip', 1.3),
        fx(quakeHit, 'stomp', 'feet', 1),
        fx(hitAt(quake, 4), 'quake', 'tip', 1),
      ],
      trail: { life: 0.22, glow: 0.6 },
    }),
    // Grave Bell: the end of the light chain. The hips drop deep and wind right as the head falls
    // back beside the right foot; then the legs drive the hammer up the centre line from the dirt,
    // the whole body rising onto the toes after it.
    l2: mv({
      keys: [
        K(0, B({ ...body, twist: 0.45, hipTwist: 0.2, lean: 0.42, crouch: -0.3, step: 0.46, back: 0.32 })),
        K(bellChamber, B({ ...body, twist: -0.5, hipTwist: -0.2, lean: 0.42, crouch: -0.42, step: 0.4, back: 0.34, width: 0.22, headPitch: 0.15 })),
        K(hitAt(bell, 3), B({ ...body, twist: -0.18, hipTwist: -0.05, lean: 0.24, crouch: -0.32, step: 0.44, back: 0.32, width: 0.2 })),
        K(bellHit, B({ ...body, twist: 0.0, lean: -0.12, crouch: -0.06, step: 0.46, back: 0.32, headPitch: -0.2 }), { hop: 0.07 }),
        K(1.05, B({ ...body, twist: 0.1, lean: -0.28, crouch: 0.0, step: 0.46, back: 0.32, headPitch: -0.3 }), { hop: 0 }),
      ],
      main: bell,
      impacts: [bellHit],
      start: 0,
      chamber: bellChamber,
      travel: 0.3,
      fx: [fx(hitAt(bell, 2), 'dust', 'tip', 1.1), fx(bellHit, 'sparkle', 'tip', 1, '#ffd27a')],
      trail: { life: 0.2, glow: 0.4 },
    }),
    // Avalanche: the second heavy. Out of the Meteor's crater the hammer is heaved up onto the left
    // shoulder, and the hips unwind left to right as the right foot steps through and it comes down.
    h1: mv({
      keys: [
        K(0, B({ ...body, crouch: -0.42, lean: 0.58, twist: 0.02, step: 0.5, back: 0.34 })),
        K(avalancheChamber, B({ ...body, twist: 0.6, hipTwist: 0.25, lean: -0.06, crouch: -0.1, step: 0.28, back: 0.3, headPitch: -0.06 })),
        K(avalancheHit, B({ ...body, front: 'R', twist: -0.05, hipTwist: -0.05, lean: 0.38, crouch: -0.26, step: 0.5, back: 0.32 })),
        K(1.0, B({ ...body, front: 'R', twist: -0.6, hipTwist: -0.25, lean: 0.5, crouch: -0.32, step: 0.52, back: 0.34, headPitch: 0.1 })),
      ],
      main: avalanche,
      impacts: [avalancheHit],
      start: 0,
      chamber: avalancheChamber,
      travel: 0.25,
      fx: [fx(avalancheHit, 'stomp', 'feet', 1), fx(1.0, 'dust', 'tip', 1.2)],
      trail: { life: 0.2, glow: 0.55 },
    }),
    // Worldbreaker: the finisher. The hammer drags the Warden round through a full turn, climbing
    // behind him as it goes, until it is over his head; then he drops onto his knee and brings it
    // straight down. The ground breaks.
    h2: mv({
      keys: [
        K(0, B({ ...body, front: 'R', twist: -0.6, lean: 0.48, crouch: -0.3, step: 0.5, back: 0.34 }), { spin: 0 }),
        K(hitAt(breaker, 2), B({ ...body, front: 'R', twist: -0.5, hipTwist: -0.15, lean: 0.12, crouch: -0.16, step: 0.3, back: 0.3, width: 0.22 }), { spin: 0.45 }),
        K(hitAt(breaker, 4), B({ ...body, twist: -0.1, lean: -0.3, crouch: 0.0, step: 0.36, back: 0.32, width: 0.22, headPitch: -0.2 }), { spin: 0.92 }),
        K(breakerHit, B({ ...body, twist: 0.0, lean: 0.42, crouch: -0.32, step: 0.5, back: 0.36, width: 0.2 }), { spin: 1 }),
        K(breakerGround + 0.05, B({ ...body, twist: 0.0, lean: 0.62, crouch: -0.56, step: 0.52, back: 0.38, width: 0.2, headPitch: 0.12 })),
        K(1.12, B({ ...body, twist: 0.0, lean: 0.64, crouch: -0.58, step: 0.52, back: 0.38, width: 0.2, headPitch: 0.15 })),
      ],
      main: breaker,
      impacts: [breakerHit],
      start: 0,
      chamber: 0.12,
      flow: 1.5,
      blendIn: 0.3,
      end: 1.0,
      rest: 1.0,
      settle: 0.4,
      fx: [
        fx(0.08, 'dust', 'feet', 1),
        fx(hitAt(breaker, 3), 'whirl', 'root', 1.1, '#ffe2b0'),
        fx(breakerGround, 'shockwave', 'tip', 1.8),
        fx(breakerGround, 'quake', 'tip', 1.2),
        fx(breakerGround, 'stomp', 'feet', 1.2),
      ],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Battering Ram: out of the dash, shoulder dropped, the haft levelled at the hip and the head
    // rammed straight out ahead of the charge
    dl: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.4, crouch: -0.26, lean: 0.42, step: 0.34, back: 0.36, width: 0.2 })),
        K(ramHit, B({ ...body, twist: -0.12, crouch: -0.3, lean: 0.52, step: 0.66, back: 0.46, width: 0.18, headPitch: 0.1 })),
        K(1.05, B({ ...body, twist: -0.08, crouch: -0.3, lean: 0.48, step: 0.66, back: 0.46, width: 0.18 })),
      ],
      main: ram,
      impacts: [ramHit],
      chamber: -0.06,
      end: 1.0,
      fx: [fx(0, 'dust', 'feet', 1.1), fx(ramHit, 'stomp', 'feet', 0.9), fx(ramHit, 'shake', 'tip', 0.6)],
      trail: { life: 0.14, glow: 0.3 },
    }),
    // Landslide: the dash heavy. The hammer dragged head-down behind on the right through the whole
    // charge, ploughing the ground, then ripped up through the target to high on the left
    dh: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.55, hipTwist: -0.15, crouch: -0.3, lean: 0.55, step: 0.5, back: 0.44 })),
        K(hitAt(slide, 2), B({ ...body, twist: -0.3, crouch: -0.34, lean: 0.5, step: 0.66, back: 0.48 })),
        K(slideHit, B({ ...body, twist: 0.12, hipTwist: 0.05, crouch: -0.22, lean: 0.32, step: 0.72, back: 0.48 })),
        K(1.05, B({ ...body, twist: 0.6, hipTwist: 0.2, crouch: -0.12, lean: 0.1, step: 0.7, back: 0.46, headPitch: -0.12 })),
      ],
      main: slide,
      impacts: [slideHit],
      chamber: -0.05,
      travel: 0.7,
      ghosts: [-0.05, 0.75],
      fx: [fx(-0.04, 'quake', 'tip', 0.9), fx(hitAt(slide, 1), 'quake', 'tip', 1.1), fx(hitAt(slide, 2), 'quake', 'tip', 1.2), fx(slideHit, 'stomp', 'feet', 1)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    // Rampart: the left foot steps back and the weight sinks onto it as the hammer comes flat across
    // from the right at head height; it ends stood up on the left, a wall between them
    bl: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.55, hipTwist: -0.15, lean: -0.04, crouch: -0.12, step: 0.26, back: 0.3 })),
        K(rampartHit, B({ ...body, twist: 0.05, hipTwist: 0.05, lean: -0.14, crouch: -0.26, step: 0.22, back: 0.62 })),
        K(1.05, B({ ...body, twist: 0.5, hipTwist: 0.15, lean: -0.1, crouch: -0.3, step: 0.22, back: 0.6 })),
        K(1.36, B({ ...body, twist: 0.2, lean: -0.04, crouch: -0.24, step: 0.24, back: 0.52, headPitch: 0.05 })),
      ],
      main: rampart,
      impacts: [rampartHit],
      start: 0,
      chamber: -0.06,
      end: 1.07,
      rest: 1.36,
      settle: 0.55,
      fx: [fx(rampartHit - 0.06, 'dust', 'feet', 1), fx(1.3, 'stomp', 'feet', 0.6)],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Gravestone: a long step back as the hammer is hoisted straight up; then it is dropped
    // head-first into the ground in front and left standing there, both hands on the haft
    bh: mv({
      keys: [
        K(-0.2, B({ ...body, twist: -0.2, lean: -0.08, crouch: -0.06 })),
        K(graveTop, B({ ...body, twist: -0.05, lean: -0.3, crouch: -0.02, step: 0.2, back: 0.62, headPitch: -0.15 })),
        K(graveHit, B({ ...body, twist: 0.0, lean: 0.04, crouch: -0.2, step: 0.2, back: 0.56 })),
        K(1.0, B({ ...body, twist: 0.0, lean: 0.06, crouch: -0.16, step: 0.22, back: 0.52, headPitch: 0.12 })),
      ],
      main: grave,
      impacts: [graveHit],
      chamber: graveTop,
      travel: 0.3,
      end: 1.0,
      rest: 1.0,
      settle: 0.45,
      fx: [fx(graveTop, 'stomp', 'feet', 0.8), fx(0.95, 'shockwave', 'tip', 1), fx(0.95, 'dust', 'tip', 1.2)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Boulder Drop: in the air the Warden hunches and tips forward, chopping the hammer short from
    // the right shoulder down onto whatever is below
    jl: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.4, lean: -0.1, crouch: -0.1, headPitch: -0.05 }), { flip: 0 }),
        K(boulderHit, B({ ...body, twist: -0.05, lean: 0.48, crouch: -0.2, headPitch: 0.12 }), { flip: 0.1 }),
        K(1.05, B({ ...body, twist: 0.1, lean: 0.52, crouch: -0.22, headPitch: 0.15 }), { flip: 0.06 }),
      ],
      main: boulder,
      impacts: [boulderHit],
      chamber: -0.1,
      fx: [fx(boulderHit, 'sparkle', 'tip', 0.8, '#ffd27a')],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Meteor Fall: arched back in the air with the head hanging behind him, the Warden jackknifes
    // and brings the hammer over the top, landing square in a wide squat behind it. The ground breaks.
    jh: mv({
      keys: [
        K(0, B({ ...body, twist: -0.2, lean: 0.0, crouch: -0.08 }), { flip: 0 }),
        K(fallCocked, B({ ...body, twist: 0.0, lean: -0.38, crouch: -0.04, headPitch: -0.2 }), { flip: -0.04 }),
        K(fallHit, B({ ...body, twist: 0.0, lean: 0.5, crouch: -0.28, step: 0.2, back: 0.16, width: 0.26, headPitch: 0.1 }), { flip: 0.05 }),
        K(1.0, B({ ...body, twist: 0.0, lean: 0.58, crouch: -0.5, step: 0.12, back: 0.12, width: 0.34, headPitch: 0.15 }), { flip: 0 }),
      ],
      main: fall,
      impacts: [fallHit],
      start: 0,
      chamber: fallCocked,
      travel: 0.3,
      end: 1.0,
      rest: 1.0,
      fx: [fx(1.0, 'shockwave', 'tip', 1.4), fx(1.0, 'stomp', 'feet', 1.1)],
      trail: { life: 0.22, glow: 0.6 },
    }),
  },
  // War Cry: the hammer hoisted overhead in both hands, a wide stance, the head thrown back
  roar: mv({
    keys: [
      K(0, B({ ...body })),
      K(0.22, B({ ...body, lean: -0.3, crouch: -0.04, headPitch: -0.45, twist: 0, step: 0.3, back: 0.3, width: 0.22 })),
      K(0.34, B({ ...body, lean: -0.38, crouch: -0.2, headPitch: -0.6, twist: 0, step: 0.32, back: 0.32, width: 0.27 })),
      K(0.8, B({ ...body, lean: -0.3, crouch: -0.17, headPitch: -0.5, twist: 0, step: 0.32, back: 0.32, width: 0.27 })),
      K(1, B({ ...body })),
    ],
    main: line([0.05, 0.8, 0.12], [0.05, 0.86, 0.1], [-1, 0.12, 0.05], [-1, 0.18, 0.05], [0, 1, 0], G2),
    impacts: [0.34],
    start: 0,
    rest: 1,
    lead: 0,
    fx: [fx(0.32, 'roar', 'root', 1.2)],
  }),
};
