/**
 * Juggernaut, greathammer. Everything is weight: the hammer is thrown more than swung, the body
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
