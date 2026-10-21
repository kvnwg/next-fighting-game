/**
 * Warden, warhammer. The hammer leads and he follows it: between blows its head rests on the
 * floor, and every swing tears it up out of the ground, drags the whole body after it, and
 * usually ends with it back in the dirt. He holds it by the very end for all the reach it has,
 * and on the big blows drops almost flat behind it. The lights chain a shin-high ground sweep, a
 * flat helicopter whirl overhead and an uppercut launch that ends with the hammer straight up;
 * the special is a full turn with the head ripping along the floor at ankle height.
 */
import { B, K, N, P, Style, X, arc, fx, hitAt, line, mv, seq, track } from '../author';
import type { KeyIn, V3 } from '../author';
import { G2, GUARD_AT, GUARD_DIR, GUARD_EDGE, GUARD_G2, body, swung } from './greathammer-base';
import { WARDEN_B } from './greathammer-b';

/** Where an arc's grip sits for one of its directions (negative r: the pivot behind the grip). */
const gripAt = (pivot: V3, r: number, dir: V3): V3 => {
  const d = N(dir);
  return [pivot[0] + d.x * r, pivot[1] + d.y * r, pivot[2] + d.z * r];
};

// Ground Sweep: dragged back along the floor round to behind his right heel, then whipped flat
// round the front at shin height and on out to the left, where it skids back down onto the ground
const groundSweep = arc([-0.1, 0.24, 0.18], 0.2, [GUARD_DIR, [-0.55, -0.55, 0.6], [-0.85, -0.42, -0.1], [-0.68, -0.48, -0.5], [-0.95, -0.15, 0.2], [-0.66, 0.42, 0.62], [-0.25, 0.64, 0.73], [0.6, 0.5, 0.62], [0.88, 0.24, 0.42]], G2, { pivot1: [0.02, 0.2, 0.24] });
const groundSweepBack = hitAt(groundSweep, 3);
const groundSweepHit = hitAt(groundSweep, 6);

// Hurricane: ripped up out of the floor on the right into both fists over the helm, then one flat
// helicopter turn overhead (right, behind, left) that hits as it comes past the front
const HURR_AT: V3 = [0, 0.92, 0.08];
const hurricane = seq(
  [
    [-1.2, -0.45, arc([-0.2, 0.45, 0.2], 0.2, [GUARD_DIR, [-0.75, -0.35, 0.55], [-0.98, 0.15, 0.1], [-0.8, 0.25, -0.55]], G2, { pivot1: [-0.12, 0.9, 0.05] })],
    [-0.45, 0.75, arc(HURR_AT, 0.06, [[-0.8, 0.25, -0.55], [0, 0.25, -1], [0.95, 0.08, -0.3], [0.85, -0.16, 0.52], [0, -0.38, 1], [-0.8, -0.4, 0.5]], G2)],
    [0.75, 1.07, arc([-0.12, 0.7, 0.12], 0.2, [[-0.8, -0.4, 0.5], [-0.75, -0.55, 0.38], [-0.45, -0.7, 0.55]], G2, { pivot1: [-0.14, 0.32, 0.2] })],
  ],
  0.08,
);
const hurricaneHit = hitAt(hurricane, 4, 1);

// Launcher: the head swung back low past his right heel, then under and up the centre line
// through the target and on until the hammer stands straight up at full stretch above him; it
// then topples over to his right and down onto the floor again
const LAUNCH_TOP: V3 = [-0.1, 0.99, -0.06];
const LAUNCH_PIVOT: V3 = [-0.08, 0.74, 0.24];
const LAUNCH_LOW: V3 = [0, 0.32, 0.18];
const launcher = seq(
  [
    [-0.4, 0, arc(gripAt(GUARD_AT, -0.2, GUARD_DIR), 0.2, [GUARD_DIR, [-0.7, -0.5, 0.3], [-0.3, -0.7, -0.62]], G2, { pivot1: LAUNCH_LOW })],
    [0, 0.45, arc(LAUNCH_LOW, 0.2, [[-0.3, -0.7, -0.62], [-0.85, -0.38, 0.1], [-0.35, -0.06, 0.93], [0, 0.12, 1]], G2)],
    [0.45, 1.07, arc(LAUNCH_LOW, 0.2, [[0, 0.12, 1], [-0.04, 0.72, 0.7], LAUNCH_TOP], G2, { pivot1: LAUNCH_PIVOT })],
    [1.07, 1.45, arc(LAUNCH_PIVOT, 0.2, [LAUNCH_TOP, [-0.62, 0.72, 0.3], [-0.55, -0.05, 0.83], GUARD_DIR], G2, { pivot1: gripAt(GUARD_AT, -0.2, GUARD_DIR) })],
  ],
  0.05,
);
const launcherChamber = 0;
const launcherHit = 0.45;

// Earthshaker: torn out of the floor and dragged out behind on the right; one full turn of the
// body with the head skimming the floor at the end of his arms, ripped across the front at the
// ankles, tearing on out to the left
const quake = seq(
  [
    [-1.3, -0.7, arc([-0.08, 0.3, 0.2], 0.18, [GUARD_DIR, [-0.6, -0.6, 0.5], [-0.92, -0.42, -0.1], [-0.7, -0.55, -0.45]], G2)],
    [-0.7, 0.1, arc([-0.08, 0.26, 0.14], 0.18, [[-0.7, -0.55, -0.45], [-0.88, -0.45, -0.15], [-0.92, -0.38, 0.05]], G2)],
    [0.1, 1.07, arc([-0.02, 0.22, 0.2], 0.2, [[-0.92, -0.38, 0.05], [-0.68, 0.02, 0.73], [-0.25, 0.32, 0.92], [0.5, 0.18, 0.85], [0.92, -0.1, 0.35]], G2)],
  ],
  0.07,
);
const quakeHit = hitAt(quake, 2, 2);

// Pole Lunge: the head dragged back to his feet, then rammed straight out along the floor ahead of
// the charge at full stretch, and let drop onto the ground
const POLE_BACK: V3 = [-0.16, 0.12, 0.04];
const POLE_OUT: V3 = [-0.04, 0.22, 0.42];
const poleLunge = seq(
  [
    [-0.4, 0.0, line(GUARD_AT, POLE_BACK, [-0.1, -0.1, 0.99], [-0.08, 0.04, 1], GUARD_EDGE, G2)],
    [0.0, 0.62, line(POLE_BACK, POLE_OUT, [-0.08, 0.04, 1], [0, 0.4, 0.92], [0, -1, 0.1], G2)],
    [0.62, 1.07, line(POLE_OUT, [-0.04, 0.18, 0.44], [0, 0.4, 0.92], [0, 0.36, 0.93], [0, -1, 0.3], G2)],
  ],
  0.06,
);
const poleLungeHit = 0.62;

// Pole Push: the head lifted off the floor and jabbed into them at the hips; then planted on the
// ground ahead and leant on, the arms locked, as he pushes himself back off it
const PUSH_IN: V3 = [-0.02, 0.24, 0.42];
const PUSH_PLANT: V3 = [-0.02, 0.14, 0.4];
const polePush = seq(
  [
    [-0.4, 0.05, arc([-0.1, 0.24, 0.12], 0.14, [GUARD_DIR, [-0.08, -0.15, 1], [-0.04, 0.3, 0.95]], G2, { pivot1: [-0.1, 0.22, 0.04] })],
    [0.05, 0.45, line([-0.1, 0.26, 0.17], PUSH_IN, [-0.04, 0.3, 0.95], [0, 0.05, 1], [0, -1, 0.1], G2)],
    [0.45, 1.07, line(PUSH_IN, PUSH_PLANT, [0, 0.05, 1], [0, -0.8, 0.6], [0, -0.6, -0.8], G2)],
  ],
  0.06,
);
const polePushHit = 0.45;

// Ring entrance, played in place. Arrival: crouched beside the hammer planted head-down on his
// right, one hand on the haft, he stamps twice and stands up, the hands sliding down the haft so
// the hammer stays put in the dirt. Signature: he takes it in both hands, springs, and vaults
// over it, the body tipping flat above the planted haft before it is ripped up and carried round
// with him through the somersault. Challenge: he lands into one helicopter turn overhead and
// slams it down in front, dropping flat behind it, then rises into guard.
// (The grips while it is planted are worked out for each body key below so that the hammer stays
// at one spot on the floor: grip at (-0.55, 1.1, 0.45) m, haft (-0.2, -0.7, 0.69).)
const ENT_EDGE: V3 = [0.05, -0.7, -0.7];
const ENT_PLANT: [number, V3, V3][] = [
  [0.0, [-0.244, 0.435, 0.298], [0.013, -0.473, 0.881]],
  [0.1, [-0.244, 0.325, 0.338], [0.013, -0.542, 0.84]],
  [0.17, [-0.252, 0.21, 0.357], [-0.002, -0.607, 0.795]],
  [0.24, [-0.259, 0.159, 0.358], [-0.016, -0.623, 0.782]],
  [0.33, [-0.262, 0.094, 0.356], [-0.023, -0.698, 0.716]],
  [0.4, [-0.297, 0.392, 0.261], [-0.094, -0.439, 0.893]],
  [0.45, [-0.309, 0.071, 0.364], [-0.112, -0.266, 0.957]],
  [0.52, [-0.314, 0.389, 0.553], [-0.164, 0.755, 0.635]],
];
const ENT_SLAM_AT: V3 = [-0.05, 0.25, 0.4];
const ENT_SLAM_DIR: V3 = [-0.05, 0.58, 0.81];
const entSlamHit = 0.785;
const entPlanted = (from: number, to: number, g2: number): [number, number, ReturnType<typeof line>][] => {
  const out: [number, number, ReturnType<typeof line>][] = [];
  for (let i = 0; i < ENT_PLANT.length - 1; i++) {
    const [s0, p0, d0] = ENT_PLANT[i];
    const [s1, p1, d1] = ENT_PLANT[i + 1];
    if (s0 >= from - 1e-6 && s1 <= to + 1e-6) out.push([s0, s1, line(p0, p1, d0, d1, ENT_EDGE, g2)]);
  }
  return out;
};
const entrance = seq(
  [
    [-1, 0.0, line(ENT_PLANT[0][1], ENT_PLANT[0][1], ENT_PLANT[0][2], ENT_PLANT[0][2], ENT_EDGE)],
    ...entPlanted(0, 0.33, NaN),
    [0.33, 0.4, line(ENT_PLANT[4][1], ENT_PLANT[5][1], ENT_PLANT[4][2], ENT_PLANT[5][2], ENT_EDGE, G2)],
    ...entPlanted(0.4, 0.52, G2),
    // ripped up out of the floor and carried over with him through the somersault, held in close
    [0.52, 0.6, arc([-0.22, 0.3, 0.25], 0.2, [ENT_PLANT[7][2], [-0.55, 0.15, 0.82], [-0.92, 0.1, 0.2]], G2)],
    [0.6, 0.645, arc([-0.22, 0.3, 0.25], 0.2, [[-0.92, 0.1, 0.2], [-0.9, 0.2, -0.3], [-0.8, 0.25, -0.55]], G2, { pivot1: [-0.04, 0.9, 0.08] })],
    // one helicopter turn overhead
    [0.645, 0.765, arc(HURR_AT, 0.06, [[-0.8, 0.25, -0.55], [0, 0.25, -1], [0.95, 0.08, -0.3], [0.85, 0.1, 0.52], [0, 0.35, 1]], G2)],
    // and down into the floor in front of him
    [0.765, 0.776, line([0, 0.97, 0.14], [0, 0.66, 0.46], [0, 0.35, 1], [0, 0.42, 0.92], [0, -1, 0.3], G2)],
    [0.776, entSlamHit, line([0, 0.66, 0.46], ENT_SLAM_AT, [0, 0.42, 0.92], ENT_SLAM_DIR, [0, -1, 0.3], G2)],
    [entSlamHit, 0.88, line(ENT_SLAM_AT, ENT_SLAM_AT, ENT_SLAM_DIR, ENT_SLAM_DIR, [0, -1, 0.3], G2)],
    [0.88, 0.96, line(ENT_SLAM_AT, GUARD_AT, ENT_SLAM_DIR, GUARD_DIR, GUARD_EDGE, G2, GUARD_G2)],
    [0.96, 2, line(GUARD_AT, GUARD_AT, GUARD_DIR, GUARD_DIR, GUARD_EDGE, GUARD_G2)],
  ],
  0.015,
);

// The quiet bodies the hammer paths were drawn against: `swung` keeps each hammer on the world
// path it has with these while the body that really throws it coils, unwinds and follows through.
const groundSweepDrawn: KeyIn[] = [
  K(0, B({ ...body, lean: 0.2, crouch: -0.18 })),
  K(groundSweepBack, B({ ...body, twist: -0.7, hipTwist: -0.25, lean: 0.35, crouch: -0.3, step: 0.34, back: 0.3, width: 0.2 })),
  K(groundSweepHit, B({ ...body, twist: 0.0, hipTwist: 0.0, lean: 0.8, crouch: -0.5, step: 0.66, back: 0.42, width: 0.2, headPitch: -0.35 })),
  K(1.0, B({ ...body, twist: 0.6, hipTwist: 0.25, lean: 0.82, crouch: -0.54, step: 0.66, back: 0.44, width: 0.2, headPitch: -0.3 })),
];
const hurricaneDrawn: KeyIn[] = [
  K(-1.2, B({ ...body })),
  K(-0.45, B({ ...body, twist: -0.6, hipTwist: -0.2, lean: -0.08, crouch: -0.08, step: 0.3, back: 0.3, width: 0.24, headPitch: -0.1 })),
  K(0.0, B({ ...body, twist: -0.2, hipTwist: -0.05, lean: -0.14, crouch: -0.06, step: 0.34, back: 0.3, width: 0.25, headPitch: -0.15 })),
  K(hurricaneHit, B({ ...body, twist: 0.15, hipTwist: 0.05, lean: -0.06, crouch: -0.12, step: 0.4, back: 0.32, width: 0.25, headPitch: -0.1 })),
  K(1.05, B({ ...body, twist: -0.35, hipTwist: -0.1, lean: 0.12, crouch: -0.26, step: 0.4, back: 0.32, width: 0.24 })),
];
const launcherDrawn: KeyIn[] = [
  K(-0.4, B({ ...body, lean: 0.2, crouch: -0.16 })),
  K(launcherChamber, B({ ...body, twist: -0.45, hipTwist: -0.15, lean: 0.5, crouch: -0.46, step: 0.38, back: 0.34, width: 0.22, headPitch: 0.1 })),
  K(hitAt(launcher, 2, 0), B({ ...body, twist: -0.2, hipTwist: -0.05, lean: 0.36, crouch: -0.36, step: 0.44, back: 0.34, width: 0.2 })),
  K(launcherHit, B({ ...body, twist: -0.05, lean: 0.08, crouch: -0.16, step: 0.46, back: 0.32, width: 0.18, headPitch: -0.15 }), { hop: 0 }),
  K(1.05, B({ ...body, twist: 0.0, lean: -0.2, crouch: 0.04, step: 0.46, back: 0.32, width: 0.17, headPitch: -0.4 }), { hop: 0.1 }),
  K(1.25, B({ ...body, twist: -0.25, lean: 0.05, crouch: -0.1, step: 0.4, back: 0.3, headPitch: -0.1 }), { hop: 0 }),
  K(1.45, B({ ...body })),
];
const quakeDrawn: KeyIn[] = [
  K(-1.3, B({ ...body }), { spin: 0 }),
  K(-0.7, B({ ...body, twist: -0.8, hipTwist: -0.3, crouch: -0.36, lean: 0.38, step: 0.3, back: 0.34, width: 0.24 }), { spin: 0 }),
  K(-0.2, B({ ...body, twist: -0.55, hipTwist: -0.2, crouch: -0.46, lean: 0.45, step: 0.36, back: 0.34, width: 0.26 }), { spin: 0.5 }),
  K(quakeHit, B({ ...body, twist: 0.0, hipTwist: 0.0, crouch: -0.5, lean: 0.55, step: 0.5, back: 0.36, width: 0.26, headPitch: -0.15 }), { spin: 1 }),
  K(1.05, B({ ...body, twist: 0.6, hipTwist: 0.25, crouch: -0.46, lean: 0.5, step: 0.5, back: 0.36, width: 0.26 }), { spin: 1.08 }),
];
const poleLungeDrawn: KeyIn[] = [
  K(-0.3, B({ ...body, twist: -0.35, crouch: -0.3, lean: 0.45, step: 0.4, back: 0.4, width: 0.18 })),
  K(0.0, B({ ...body, twist: -0.3, crouch: -0.36, lean: 0.52, step: 0.5, back: 0.46, width: 0.18 })),
  K(poleLungeHit, B({ ...body, twist: -0.05, crouch: -0.4, lean: 0.6, step: 0.74, back: 0.5, width: 0.17, headPitch: -0.2 })),
  K(1.05, B({ ...body, twist: -0.05, crouch: -0.42, lean: 0.58, step: 0.74, back: 0.5, width: 0.17, headPitch: -0.15 })),
];
const polePushDrawn: KeyIn[] = [
  K(-0.4, B({ ...body })),
  K(0.05, B({ ...body, twist: -0.3, lean: 0.12, crouch: -0.14, step: 0.3, back: 0.28 })),
  K(polePushHit, B({ ...body, twist: -0.05, lean: 0.32, crouch: -0.2, step: 0.42, back: 0.3, headPitch: -0.05 })),
  K(0.75, B({ ...body, twist: -0.05, lean: 0.1, crouch: -0.3, step: 0.3, back: 0.6, width: 0.2 })),
  K(1.05, B({ ...body, twist: -0.1, lean: -0.2, crouch: -0.34, step: 0.24, back: 0.7, width: 0.2, headPitch: 0.1 })),
];

const entranceDrawn: KeyIn[] = [
  K(0, B({ ...body, twist: -0.3, lean: 0.28, crouch: -0.42, step: 0.26, back: 0.26, width: 0.2, headPitch: 0.45 })),
  K(0.06, B({ ...body, twist: -0.3, lean: 0.24, crouch: -0.38, step: 0.26, back: 0.26, width: 0.2, side: -0.06, headPitch: 0.4 })),
  K(0.1, B({ ...body, twist: -0.3, lean: 0.2, crouch: -0.3, step: 0.3, back: 0.26, width: 0.22, headPitch: 0.35 })),
  K(0.17, B({ ...body, twist: -0.28, lean: 0.12, crouch: -0.22, lift: 0.04, step: 0.3, back: 0.26, width: 0.22, side: 0.06, headPitch: 0.25 })),
  K(0.24, B({ ...body, twist: -0.26, lean: 0.1, crouch: -0.12, step: 0.3, back: 0.28, width: 0.24, headPitch: 0.1 })),
  K(0.33, B({ ...body, twist: -0.25, lean: 0.0, crouch: -0.08, step: 0.3, back: 0.28, width: 0.24, headPitch: -0.05 })),
  K(0.4, B({ ...body, twist: -0.15, lean: 0.32, crouch: -0.36, step: 0.3, back: 0.3, width: 0.22, headPitch: 0.1 }), { flip: 0, hop: 0 }),
  K(0.45, B({ ...body, twist: -0.1, lean: 0.2, crouch: -0.12, step: 0.3, back: 0.3, width: 0.2 }), { flip: 0.05, hop: 0.3 }),
  K(0.52, B({ ...body, twist: -0.05, lean: 0.1, crouch: -0.2, step: 0.2, back: 0.2, width: 0.18 }), { flip: 0.25, hop: 0.95 }),
  K(0.58, B({ ...body, twist: -0.05, lean: 0.2, crouch: -0.2, step: 0.2, back: 0.2, width: 0.18 }), { flip: 0.62, hop: 0.65 }),
  K(0.645, B({ ...body, twist: -0.5, lean: 0.2, crouch: -0.32, step: 0.3, back: 0.3, width: 0.24 }), { flip: 1, hop: 0 }),
  K(0.7, B({ ...body, twist: -0.3, lean: -0.1, crouch: -0.12, step: 0.32, back: 0.3, width: 0.24, headPitch: -0.15 })),
  K(0.765, B({ ...body, twist: 0.1, lean: -0.05, crouch: -0.14, step: 0.36, back: 0.3, width: 0.24, headPitch: -0.1 })),
  K(entSlamHit, B({ ...body, twist: -0.05, lean: 0.7, crouch: -0.45, step: 0.5, back: 0.4, width: 0.22, headPitch: -0.3 })),
  K(0.88, B({ ...body, twist: -0.05, lean: 0.62, crouch: -0.42, step: 0.5, back: 0.4, width: 0.22, headPitch: -0.35 })),
  K(0.96, body),
];

export const greathammer: Style = {
  axis: 'x',
  offAxis: 'x',
  trail: { light: '#ffe2b0', heavy: '#ffb347', special: '#ff4a2a' },
  sparks: ['#ffb04a', '#ffffff', '#ff7a2a'],
  // planted: the head down on the floor ahead on the right, both hands low on the haft, waiting
  guard: P(body, X(GUARD_AT, GUARD_DIR, GUARD_EDGE, 'x', GUARD_G2)),
  // braced: the hammer hauled up off the floor and held across in front, head high on the right
  block: P(B({ ...body, crouch: -0.2, lean: 0.16, twist: -0.1, width: 0.2 }), X([0.05, 0.3, 0.36], [-0.72, 0.62, 0.2], [0.15, 0.1, 1], 'x', G2)),
  moves: {
    // Ground Sweep: wound up hard to the right on the rear leg, then the lead foot lunges long, the
    // hips whip round ahead of the shoulders and the body drops almost flat behind the hammer, arms
    // out at full stretch as it whips round the front at shin height and drags him on round after it
    l0: swung(mv({
      keys: [
        K(0, B({ ...body, twist: -0.5, hipTwist: -0.2, lean: 0.2, crouch: -0.2 })),
        // coiled: hips and shoulders wound right, the weight sunk onto the long rear leg
        K(groundSweepBack, B({ ...body, twist: -1.25, hipTwist: -0.65, lean: 0.12, crouch: -0.42, step: 0.3, back: 0.46, width: 0.22, headPitch: 0.1 })),
        // the lead foot lunges out and the hips unwind first, the shoulders still back
        K(0.56, B({ ...body, twist: -0.6, hipTwist: 0.05, lean: 0.45, crouch: -0.42, step: 0.56, back: 0.46, width: 0.21, headPitch: -0.1 })),
        K(groundSweepHit, B({ ...body, twist: 0.75, hipTwist: 0.42, lean: 0.8, crouch: -0.52, step: 0.68, back: 0.42, width: 0.2, headPitch: -0.35 })),
        // carried on round after it, the rear foot dragging
        K(1.0, B({ ...body, twist: 0.85, hipTwist: 0.5, lean: 0.76, crouch: -0.54, step: 0.66, back: 0.32, width: 0.28, headPitch: -0.3 }), { spin: 0.06 }),
        K(1.07, B({ ...body, twist: 0.88, hipTwist: 0.52, lean: 0.74, crouch: -0.54, step: 0.66, back: 0.3, width: 0.29, headPitch: -0.28 }), { spin: 0.08 }),
      ],
      main: groundSweep,
      impacts: [groundSweepHit],
      chamber: groundSweepBack,
      travel: 0.3,
      fx: [fx(0.1, 'dust', 'tip', 0.9), fx(groundSweepHit, 'dust', 'tip', 1.1), fx(0.95, 'dust', 'tip', 1.2)],
      trail: { life: 0.18, glow: 0.35 },
    }), groundSweepDrawn),
    // Hurricane: he rips the hammer up out of the floor and whirls it once flat over his head like
    // a rotor, his whole body turning a full circle under it, hips first, leaning out against its
    // pull, and it comes round the front at head height
    l1: swung(mv({
      keys: [
        K(-1.2, B({ ...body }), { spin: 0 }),
        // sunk on the right as it is ripped up out of the floor
        K(-0.45, B({ ...body, twist: -0.75, hipTwist: -0.4, lean: 0.05, crouch: -0.2, step: 0.3, back: 0.36, width: 0.24, side: -0.06, headPitch: -0.1 }), { spin: 0 }),
        // the whole body turns under it as it goes round behind, the hips first, the shoulders held back
        K(-0.1, B({ ...body, twist: 0.3, hipTwist: -0.2, lean: 0.12, crouch: -0.14, step: 0.34, back: 0.32, width: 0.26, side: -0.12, headPitch: -0.15 }), { spin: -0.35 }),
        K(0.25, B({ ...body, twist: -0.2, hipTwist: -0.45, lean: -0.05, crouch: -0.12, step: 0.38, back: 0.32, width: 0.26, side: 0.1, headPitch: -0.12 }), { spin: -0.7 }),
        // leaning out against its pull as it comes round the front
        K(hurricaneHit, B({ ...body, twist: -0.3, hipTwist: -0.4, lean: -0.1, crouch: -0.2, step: 0.42, back: 0.34, width: 0.26, side: 0.05, headPitch: -0.12 }), { spin: -0.95 }),
        K(1.05, B({ ...body, twist: -0.7, hipTwist: -0.5, lean: 0.15, crouch: -0.3, step: 0.42, back: 0.28, width: 0.3, side: 0.03 }), { spin: -1.1 }),
      ],
      main: hurricane,
      impacts: [hurricaneHit],
      start: -1.2,
      chamber: -0.45,
      flow: 1.5,
      blendIn: 0.35,
      fx: [fx(-1.1, 'dust', 'tip', 1), fx(-0.3, 'whirl', 'root', 1.2, '#ffe2b0'), fx(hurricaneHit, 'whirl', 'root', 0.9, '#ffe2b0')],
      trail: { life: 0.26, glow: 0.5 },
    }), hurricaneDrawn),
    // Launcher: he sinks deep and winds right as the head swings back past his right heel, then the
    // hips drive round and up out of the crouch onto his toes, the hammer rising up the centre line
    // and on to straight overhead, his chest thrown open under it
    l2: swung(mv({
      keys: [
        K(-0.4, B({ ...body, twist: -0.4, hipTwist: -0.15, lean: 0.2, crouch: -0.2 }), { hop: 0 }),
        // coiled low: wound right, the weight sunk deep on the rear leg
        K(launcherChamber, B({ ...body, twist: -1.15, hipTwist: -0.6, lean: 0.42, crouch: -0.52, step: 0.36, back: 0.44, width: 0.24, headPitch: 0.1 })),
        // the lead foot plants and the hips drive round and up first
        K(0.2, B({ ...body, twist: -0.55, hipTwist: -0.05, lean: 0.38, crouch: -0.45, step: 0.5, back: 0.4, width: 0.22 })),
        K(launcherHit, B({ ...body, twist: 0.3, hipTwist: 0.35, lean: 0.12, crouch: -0.2, step: 0.52, back: 0.36, width: 0.2, headPitch: -0.2 }), { hop: 0.04 }),
        // up on his toes under it, the chest thrown open
        K(1.05, B({ ...body, twist: 0.5, hipTwist: 0.35, lean: -0.35, crouch: 0.06, step: 0.5, back: 0.3, width: 0.17, headPitch: -0.5 }), { hop: 0.18 }),
        K(1.25, B({ ...body, twist: -0.1, lean: 0.05, crouch: -0.14, step: 0.4, back: 0.3, headPitch: -0.1 }), { hop: 0 }),
        K(1.45, B({ ...body })),
      ],
      main: launcher,
      impacts: [launcherHit],
      start: -0.4,
      chamber: launcherChamber,
      travel: 0.3,
      rest: 1.45,
      settle: 0.65,
      fx: [fx(hitAt(launcher, 2, 0), 'dust', 'tip', 1.1), fx(launcherHit, 'flashline', 'tip', 1.2), fx(launcherHit, 'sparkle', 'tip', 1.2, '#ffffff')],
      trail: { life: 0.2, glow: 0.5 },
    }), launcherDrawn),
    // Earthshaker: the perilous sweep. Wound right and sunk low, the hips lead and the hammer drags
    // the Warden through one whole turn and on, low and leaning out over it, the head skimming the
    // floor; it tears through the ankles as it comes round the front and ploughs on out to the left
    sp: swung(mv({
      keys: [
        K(-1.3, B({ ...body }), { spin: 0 }),
        // wound right and sunk low behind it as it is torn out and dragged out behind
        K(-0.7, B({ ...body, twist: -1.25, hipTwist: -0.65, crouch: -0.42, lean: 0.3, step: 0.3, back: 0.44, width: 0.26, side: -0.08 }), { spin: 0 }),
        // the hips lead the turn, the shoulders dragged after them, leaning out over the head
        K(-0.2, B({ ...body, twist: -0.75, hipTwist: -0.15, crouch: -0.5, lean: 0.45, step: 0.4, back: 0.38, width: 0.28, side: -0.12 }), { spin: 0.45 }),
        K(quakeHit, B({ ...body, twist: 0.7, hipTwist: 0.4, crouch: -0.52, lean: 0.62, step: 0.52, back: 0.36, width: 0.28, side: -0.05, headPitch: -0.15 }), { spin: 0.95 }),
        K(1.05, B({ ...body, twist: 1.0, hipTwist: 0.6, crouch: -0.48, lean: 0.55, step: 0.5, back: 0.3, width: 0.3 }), { spin: 1.12 }),
      ],
      main: quake,
      impacts: [quakeHit],
      start: -1.3,
      chamber: -0.7,
      flow: 1.6,
      blendIn: 0.3,
      fx: [
        fx(-1.2, 'dust', 'tip', 1),
        fx(-0.5, 'quake', 'tip', 0.9),
        fx(-0.1, 'quake', 'tip', 1.1),
        fx(quakeHit, 'quake', 'tip', 1.4),
        fx(quakeHit, 'stomp', 'feet', 1),
        fx(0.8, 'quake', 'tip', 1),
      ],
      trail: { life: 0.24, glow: 0.65 },
    }), quakeDrawn),
    // Pole Lunge: out of the dash, drawn back to his right hip, then a long stride and the hips
    // squaring into it: bent double behind the haft, he runs the head along the floor into them
    // like a battering ram, arms locked at full stretch
    dl: swung(mv({
      keys: [
        K(-0.3, B({ ...body, twist: -0.65, hipTwist: -0.3, crouch: -0.34, lean: 0.4, step: 0.4, back: 0.46, width: 0.2 })),
        // drawn back to his right hip, the weight on the rear leg
        K(0.0, B({ ...body, twist: -1.0, hipTwist: -0.5, crouch: -0.44, lean: 0.4, step: 0.44, back: 0.56, width: 0.2 })),
        // the lead foot strides out and the hips square into it first
        K(0.32, B({ ...body, twist: -0.4, hipTwist: 0.05, crouch: -0.42, lean: 0.55, step: 0.68, back: 0.54, width: 0.19 })),
        K(poleLungeHit, B({ ...body, twist: 0.35, hipTwist: 0.35, crouch: -0.46, lean: 0.72, step: 0.86, back: 0.5, width: 0.18, headPitch: -0.2 })),
        K(1.05, B({ ...body, twist: 0.5, hipTwist: 0.4, crouch: -0.5, lean: 0.78, step: 0.86, back: 0.4, width: 0.22, headPitch: -0.15 })),
      ],
      main: poleLunge,
      impacts: [poleLungeHit],
      start: -0.4,
      chamber: 0.0,
      travel: 0.5,
      ghosts: [0.0, 0.7],
      fx: [fx(0.0, 'dust', 'feet', 1.1), fx(0.3, 'quake', 'tip', 0.7), fx(poleLungeHit, 'stomp', 'feet', 0.9), fx(poleLungeHit, 'shake', 'tip', 0.6), fx(1.0, 'dust', 'tip', 1)],
      trail: { life: 0.14, glow: 0.3 },
    }), poleLungeDrawn),
    // Pole Push: the hips turn the jab into them, then the head is planted on the floor ahead; he
    // leans on the haft, arms locked, and shoves himself back off it, the rear foot reaching back
    // and the hips sinking
    bl: swung(mv({
      keys: [
        K(-0.4, B({ ...body })),
        K(0.05, B({ ...body, twist: -0.75, hipTwist: -0.4, lean: 0.06, crouch: -0.26, step: 0.28, back: 0.36, width: 0.2 })),
        // the hips square into the jab, the shoulders after
        K(0.3, B({ ...body, twist: -0.2, hipTwist: 0.1, lean: 0.3, crouch: -0.24, step: 0.4, back: 0.34 })),
        K(polePushHit, B({ ...body, twist: 0.3, hipTwist: 0.3, lean: 0.42, crouch: -0.26, step: 0.46, back: 0.32, headPitch: -0.05 })),
        // then all his weight thrown back off the planted haft
        K(0.75, B({ ...body, twist: 0.05, hipTwist: 0.05, lean: 0.05, crouch: -0.36, step: 0.3, back: 0.66, width: 0.22 })),
        K(1.05, B({ ...body, twist: -0.15, hipTwist: -0.1, lean: -0.24, crouch: -0.4, step: 0.22, back: 0.72, width: 0.22, headPitch: 0.1 })),
      ],
      main: polePush,
      impacts: [polePushHit],
      start: -0.4,
      chamber: 0.05,
      travel: 0.5,
      fx: [fx(polePushHit, 'shake', 'tip', 0.6), fx(0.85, 'stomp', 'tip', 0.9), fx(0.9, 'dust', 'feet', 1)],
      trail: { life: 0.16, glow: 0.35 },
    }), polePushDrawn),
    // the heavy chain, the dash and backstep heavies and the air attacks
    ...WARDEN_B,
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
  // Ring entrance: crouched by the planted hammer, two stamps as he stands; the vault over it and
  // the somersault that rips it out; a helicopter turn overhead with the whole body turning under
  // it, and the slam, crunched down behind it
  entrance: swung(mv({
    keys: [
      K(0, B({ ...body, twist: -0.3, lean: 0.28, crouch: -0.42, step: 0.26, back: 0.26, width: 0.2, headPitch: 0.45 })),
      K(0.06, B({ ...body, twist: -0.3, lean: 0.24, crouch: -0.38, step: 0.26, back: 0.26, width: 0.2, side: -0.06, headPitch: 0.4 })),
      K(0.1, B({ ...body, twist: -0.3, lean: 0.2, crouch: -0.3, step: 0.3, back: 0.26, width: 0.22, headPitch: 0.35 })),
      K(0.17, B({ ...body, twist: -0.28, lean: 0.12, crouch: -0.22, lift: 0.04, step: 0.3, back: 0.26, width: 0.22, side: 0.06, headPitch: 0.25 })),
      K(0.24, B({ ...body, twist: -0.26, lean: 0.1, crouch: -0.12, step: 0.3, back: 0.28, width: 0.24, headPitch: 0.1 })),
      K(0.33, B({ ...body, twist: -0.25, lean: 0.0, crouch: -0.08, step: 0.3, back: 0.28, width: 0.24, headPitch: -0.05 })),
      K(0.4, B({ ...body, twist: -0.15, lean: 0.32, crouch: -0.36, step: 0.3, back: 0.3, width: 0.22, headPitch: 0.1 }), { flip: 0, hop: 0 }),
      K(0.45, B({ ...body, twist: -0.1, lean: 0.2, crouch: -0.12, step: 0.3, back: 0.3, width: 0.2 }), { flip: 0.05, hop: 0.3 }),
      K(0.52, B({ ...body, twist: -0.05, lean: 0.1, crouch: -0.2, step: 0.2, back: 0.2, width: 0.18 }), { flip: 0.25, hop: 0.95 }),
      K(0.58, B({ ...body, twist: -0.05, lean: 0.2, crouch: -0.2, step: 0.2, back: 0.2, width: 0.18 }), { flip: 0.62, hop: 0.65 }),
      // lands wound right and sunk low, then the whole body turns under the whirl overhead
      K(0.645, B({ ...body, twist: -0.75, hipTwist: -0.4, lean: 0.25, crouch: -0.4, step: 0.3, back: 0.34, width: 0.26 }), { flip: 1, hop: 0, spin: 0 }),
      K(0.7, B({ ...body, twist: 0.2, hipTwist: -0.2, lean: -0.12, crouch: -0.16, step: 0.32, back: 0.3, width: 0.26, side: -0.06, headPitch: -0.15 }), { spin: -0.45 }),
      // the chest open as it comes round the front, then crunched down into the slam
      K(0.765, B({ ...body, twist: 0.0, hipTwist: -0.15, lean: -0.14, crouch: -0.14, step: 0.34, back: 0.3, width: 0.22, side: 0.04, headPitch: -0.3 }), { spin: -1 }),
      K(entSlamHit, B({ ...body, twist: 0.15, hipTwist: 0.15, lean: 0.7, crouch: -0.46, step: 0.5, back: 0.42, width: 0.28, headPitch: -0.3 })),
      K(0.88, B({ ...body, twist: 0.25, hipTwist: 0.2, lean: 0.8, crouch: -0.52, step: 0.52, back: 0.42, width: 0.32, headPitch: -0.35 })),
      K(0.96, body),
    ],
    main: entrance,
    free: track([
      [0.0, [0.3, 0.08, 0.26]],
      [0.1, [0.32, 0.06, 0.24]],
      [0.24, [0.34, 0.05, 0.16]],
      [0.33, [0.33, 0.04, 0.1]],
    ]),
    kick: {
      foot: 'L',
      from: 0.02,
      to: 0.1,
      path: seq([
        [0, 0.6, line([0.17, 0.05, 0.22], [0.2, 0.5, 0.34], [0, 0, 1], [0, 0, 1], [0, 1, 0])],
        [0.6, 0.75, line([0.2, 0.5, 0.34], [0.2, 0.52, 0.34], [0, 0, 1], [0, 0, 1], [0, 1, 0])],
        [0.75, 1, line([0.2, 0.52, 0.34], [0.19, 0.05, 0.32], [0, 0, 1], [0, 0, 1], [0, 1, 0])],
      ], 0.04),
    },
    start: 0,
    rest: 1,
    lead: 0,
    fx: [
      fx(0.1, 'stomp', 'feet', 1.2),
      fx(0.1, 'shake', 'root', 0.8),
      fx(0.24, 'stomp', 'feet', 1.5),
      fx(0.24, 'shake', 'root', 1.1),
      fx(0.45, 'dust', 'feet', 1.2),
      fx(0.45, 'dust', 'tip', 1),
      fx(0.53, 'quake', 'tip', 0.8),
      fx(0.645, 'stomp', 'feet', 1.2),
      fx(0.66, 'whirl', 'root', 1.2, '#ffe2b0'),
      fx(entSlamHit, 'shockwave', 'tip', 1.6),
      fx(entSlamHit, 'quake', 'tip', 1.2),
      fx(entSlamHit, 'shake', 'root', 1.2),
      fx(entSlamHit + 0.01, 'embers', 'root', 1.3),
      fx(0.88, 'embers', 'root', 0.8),
    ],
    trail: { life: 0.24, glow: 0.5 },
  }), entranceDrawn, G2, 0.52),
};
