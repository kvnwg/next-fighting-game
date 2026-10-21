/**
 * The Warden's heavy chain, dash heavy, backstep heavy and air attacks (spread into the style in
 * greathammer.ts).
 *
 * The hammer leads and he follows it: every one of these starts from the head resting on the floor
 * (or from where the last one left it), commits the whole body behind a swing at full stretch, and
 * lets the hammer's weight carry him through and down after it.
 */
import { B, K, N, arc, fx, hitAt, line, mv, seq } from '../author';
import type { KeyIn, MoveDef, V3 } from '../author';
import { G2, GUARD_AT, GUARD_DIR, body, swung } from './greathammer-base';

/** Where an arc's grip sits for one of its directions. */
const gripAt = (pivot: V3, r: number, dir: V3): V3 => {
  const d = N(dir);
  return [pivot[0] + d.x * r, pivot[1] + d.y * r, pivot[2] + d.z * r];
};
/** The pivot that puts an arc's grip at `at` for direction `dir`. */
const pivotFor = (at: V3, r: number, dir: V3): V3 => gripAt(at, -r, dir);
/** Directions in a near-flat ring around the body (0 = ahead, 90 = his left, 180 = behind), tilted up by `y`. */
const ring = (fromDeg: number, toDeg: number, y: number, steps: number): V3[] => {
  const out: V3[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
    out.push([Math.sin(a), y, Math.cos(a)]);
  }
  return out;
};

// Felled Oak: ripped up out of the floor round his right side until it stands straight up in front
// of his face like a tree, then toppled forward through the target, his hands following it down
/** the guard's direction lifted a little, for openings that crouch and lean into it (the head stays on the floor) */
const LIFTED: V3 = [-0.12, -0.4, 0.9];
const OAK_UP: V3 = [0, 1, 0.06];
const OAK_TOP: V3 = [0, 0.5, 0.4];
const OAK_DOWN: V3 = [0, 0.6, 0.8];
const OAK_END: V3 = [-0.03, 0.42, 0.5];
const oakRaise = arc(pivotFor(GUARD_AT, 0.12, LIFTED), 0.12, [LIFTED, [-0.65, -0.12, 0.72], [-0.75, 0.45, 0.45], [-0.25, 0.95, 0.15], OAK_UP], G2, { pivot1: pivotFor(OAK_TOP, 0.12, OAK_UP) });
const oakFall = arc(pivotFor(OAK_TOP, 0.05, OAK_UP), 0.05, [OAK_UP, [0, 0.85, 0.52], [0, 0.68, 0.73], OAK_DOWN], G2, { pivot1: pivotFor(OAK_END, 0.05, OAK_DOWN) });
const OAK_TOP_S = 0.4;
const oak = seq([
  [-0.2, OAK_TOP_S, oakRaise],
  [OAK_TOP_S, 1.07, oakFall],
], 0.04);
const oakHit = hitAt(oak, 2, 1);
const oakGround = hitAt(oak, 3, 1) - 0.06;

// Rip-Up: out of the Oak's crater the head is dragged back along the floor round his right side
// until it trails behind him, then ripped up diagonally through the target to high on his left
const RIP_BACK: V3 = [-0.55, -0.6, -0.58];
const RIP_PIVOT: V3 = [-0.05, 0.3, 0.14];
const RIP_R = 0.28;
const ripDrag = arc(pivotFor(OAK_END, 0.05, OAK_DOWN), 0.05, [OAK_DOWN, [-0.35, -0.1, 0.93], [-0.8, -0.45, 0.4], RIP_BACK], G2, { pivot1: pivotFor(gripAt(RIP_PIVOT, RIP_R, RIP_BACK), 0.05, RIP_BACK) });
const RIP_END: V3 = [0.55, 0.82, 0.15];
const RIP_PIVOT1: V3 = [0.02, 0.36, 0.18];
const ripUp = arc(RIP_PIVOT, RIP_R, [RIP_BACK, [-0.85, -0.5, 0.15], [-0.5, -0.35, 0.8], [0.05, 0.45, 0.89], [0.5, 0.75, 0.43], RIP_END], G2, { pivot1: RIP_PIVOT1 });
const RIP_BACK_S = 0;
const rip = seq([
  [-1, RIP_BACK_S, ripDrag],
  [RIP_BACK_S, 1.07, ripUp],
], 0.05);
const ripHit = hitAt(rip, 3, 1);

// Helicopter: the hammer is lifted off his left shoulder into a flat whirl over his head; he turns
// a full circle under it as it goes round one and a half times, rises after it, and brings it over
// the top and down
const HELI_PIVOT: V3 = [0, 0.9, 0.16];
const HELI_R = 0.05;
const HELI_FROM = ring(80, 80, 0.25, 1)[0];
const HELI_TO = ring(255, 255, 0.25, 1)[0];
// the hands climb above the helm with the haft still steep, and only then does it lie down flat
const HELI_RISE: V3 = [0.5, 0.85, 0.16];
const HELI_EDGE: V3 = [0.17, 0, -0.98];
const HELI_RISE_AT: V3 = [0.1, 0.95, 0.32];
const heliLift = seq([
  [0, 0.6, line(gripAt(RIP_PIVOT1, RIP_R, RIP_END), HELI_RISE_AT, RIP_END, HELI_RISE, HELI_EDGE, G2)],
  [0.6, 1, line(HELI_RISE_AT, gripAt(HELI_PIVOT, HELI_R, HELI_FROM), HELI_RISE, HELI_FROM, HELI_EDGE, G2)],
], 0.1);
const heliWhirl = arc(HELI_PIVOT, HELI_R, ring(80, 255, 0.25, 6), G2);
const heliSlam = arc([0, 0.62, 0.18], 0.3, [HELI_TO, [-0.55, 0.82, -0.1], [-0.15, 0.95, 0.25], [0, 0.65, 0.76], [0, 0.3, 0.95], [0, -0.52, 0.85]], G2, { pivot1: [-0.03, 0.58, 0.17] });
const HELI_START = -1.6;
const HELI_WHIRL = -1.38;
const HELI_SLAM = -0.08;
const heli = seq([
  [HELI_START, HELI_WHIRL, heliLift],
  [HELI_WHIRL, HELI_SLAM, heliWhirl],
  [HELI_SLAM, 1.07, heliSlam],
], 0.06);
const heliHit = hitAt(heli, 4, 2);
const heliGround = hitAt(heli, 5, 2) - 0.05;

// Prone Slam: swung back along his right side and up behind the shoulder through the dash, then
// over the top as he dives flat behind it, arms at full stretch, the head landing far ahead
const DIVE_COCK: V3 = [-0.3, 0.55, -0.78];
const DIVE_COCK_AT: V3 = [-0.22, 0.7, 0.14];
const DIVE_END: V3 = [0, 0.68, 0.73];
const DIVE_END_AT: V3 = [-0.03, 0.62, 0.5];
const diveCock = arc(pivotFor(GUARD_AT, 0.1, LIFTED), 0.1, [LIFTED, [-0.8, -0.22, 0.45], [-0.85, 0.25, -0.45], DIVE_COCK], G2, { pivot1: pivotFor(DIVE_COCK_AT, 0.1, DIVE_COCK) });
const diveOver = arc(pivotFor(DIVE_COCK_AT, 0.1, DIVE_COCK), 0.1, [DIVE_COCK, [-0.15, 1, -0.05], [0, 0.85, 0.52], DIVE_END], G2, { pivot1: pivotFor(DIVE_END_AT, 0.1, DIVE_END) });
const DIVE_COCK_S = -0.05;
const dive = seq([
  [-0.6, DIVE_COCK_S, diveCock],
  [DIVE_COCK_S, 1.07, diveOver],
], 0.05);
const diveHit = hitAt(dive, 2, 1);
const diveGround = hitAt(dive, 3, 1) - 0.05;

// Reverse Launcher: the head is dug in under the target as he steps away, then heaved up through
// it and on over his head, the hands ending overhead and the hammer hanging back behind him
const REV_DIG: V3 = [0, -0.32, 0.95];
const REV_DIG_AT: V3 = [-0.06, 0.06, 0.42];
const REV_UP: V3 = [-0.05, 1, 0.05];
const REV_TOP_AT: V3 = [-0.08, 0.84, 0.26];
const REV_END: V3 = [-0.12, 0.45, -0.88];
const REV_END_AT: V3 = [-0.1, 0.86, 0.22];
const REV_TOP_S = 0.78;
const rev = seq([
  [-0.6, 0, line(GUARD_AT, REV_DIG_AT, GUARD_DIR, REV_DIG, [0, -0.5, -0.86], G2)],
  [0, REV_TOP_S, arc(REV_DIG_AT, 0, [REV_DIG, [0, 0.15, 0.99], [0, 0.55, 0.84], [0, 0.85, 0.52], REV_UP], G2, { pivot1: REV_TOP_AT })],
  [REV_TOP_S, 1.07, arc(REV_TOP_AT, 0, [REV_UP, [-0.1, 0.8, -0.6], REV_END], G2, { pivot1: REV_END_AT })],
], 0.05);
const revHit = hitAt(rev, 1, 1);

// Somersault: drawn up behind his head, then held out at arm's length as he flips forward, so it
// comes over the top and down in front; tucked in along his chest for the rest of the turn
const SOM_COCK: V3 = [-0.35, 0.6, -0.72];
const SOM_COCK_AT: V3 = [-0.12, 0.62, 0.34];
const SOM_OUT_AT: V3 = [-0.03, 0.3, 0.45];
const SOM_TUCK: V3 = [-0.05, -0.45, 0.89];
const somCock = arc(pivotFor(GUARD_AT, 0.1, GUARD_DIR), 0.1, [GUARD_DIR, [-0.6, 0.3, 0.75], [-0.35, 0.9, 0.1], SOM_COCK], G2, { pivot1: pivotFor(SOM_COCK_AT, 0.1, SOM_COCK) });
const somOver = arc(pivotFor(SOM_COCK_AT, 0.1, SOM_COCK), 0.1, [SOM_COCK, [-0.1, 1, 0.05], [0, 0.85, 0.52], [0, 0.4, 0.92], [0, 0, 1]], G2, { pivot1: pivotFor(SOM_OUT_AT, 0.1, [0, 0, 1]) });
const somTuck = arc(pivotFor(SOM_OUT_AT, 0.1, [0, 0, 1]), 0.1, [[0, 0, 1], SOM_TUCK], G2, { pivot1: pivotFor(GUARD_AT, 0.1, SOM_TUCK) });
const somersault = seq([
  [-0.4, -0.06, somCock],
  [-0.06, 1.07, somOver],
  [1.07, 1.3, somTuck],
], 0.05);
const somHit = hitAt(somersault, 2, 1);

// Skyfall: hoisted straight overhead as he flips, so that upside down at the top he is doing a
// handstand on the haft; the flip carries it on behind, over the top and down into the floor
const SKY_UP: V3 = [0, 1, 0.12];
const SKY_UP_AT: V3 = [-0.05, 0.94, 0.24];
const SKY_END: V3 = [0, 0.25, 0.97];
const SKY_END_AT: V3 = [-0.03, 0.46, 0.52];
const SKY_TOP_S = 0.22;
const sky = seq([
  [-0.2, SKY_TOP_S, arc(pivotFor(GUARD_AT, 0.1, GUARD_DIR), 0.1, [GUARD_DIR, [-0.3, 0.2, 0.93], [-0.1, 0.85, 0.5], SKY_UP], G2, { pivot1: pivotFor(SKY_UP_AT, 0.1, SKY_UP) })],
  [SKY_TOP_S, 1.07, arc(pivotFor(SKY_UP_AT, 0.1, SKY_UP), 0.1, [SKY_UP, [0, 0.92, 0.4], [0, 0.7, 0.7], [0, 0.45, 0.9], SKY_END], G2, { pivot1: pivotFor(SKY_END_AT, 0.1, SKY_END) })],
], 0.05);
const skyChamber = hitAt(sky, 1, 1);
const skyHit = hitAt(sky, 3, 1);
const skyGround = hitAt(sky, 4, 1) - 0.05;

// The quiet bodies the hammer paths were drawn against: `swung` keeps each hammer on the world
// path it has with these while the body that really throws it coils, unwinds and follows through.
const oakDrawn: KeyIn[] = [
  K(-0.2, B({ ...body, crouch: -0.2, lean: 0.28, twist: -0.25 })),
  K(0.0, B({ ...body, crouch: -0.32, lean: 0.36, twist: -0.5, hipTwist: -0.15, headPitch: 0.1 })),
  K(OAK_TOP_S, B({ ...body, crouch: 0.02, lean: -0.16, twist: -0.06, step: 0.24, back: 0.3, width: 0.2, headPitch: -0.35 })),
  K(oakHit, B({ ...body, crouch: -0.3, lean: 0.55, twist: -0.02, step: 0.5, back: 0.42, width: 0.2, headPitch: -0.2 })),
  K(oakGround + 0.06, B({ ...body, crouch: -0.45, lean: 0.85, twist: 0, step: 0.62, back: 0.5, width: 0.22, headPitch: -0.35 })),
  K(1.12, B({ ...body, crouch: -0.47, lean: 0.88, twist: 0, step: 0.62, back: 0.5, width: 0.22, headPitch: -0.32 })),
];
const ripDrawn: KeyIn[] = [
  K(-1, B({ ...body, crouch: -0.45, lean: 0.85, twist: 0, step: 0.62, back: 0.5, width: 0.22, headPitch: -0.35 })),
  K(-0.5, B({ ...body, crouch: -0.36, lean: 0.55, twist: -0.5, hipTwist: -0.2, step: 0.5, back: 0.46, width: 0.22, headPitch: -0.1 })),
  K(RIP_BACK_S, B({ ...body, crouch: -0.38, lean: 0.4, twist: -0.95, hipTwist: -0.35, step: 0.44, back: 0.46, width: 0.22, headPitch: 0.05 })),
  K(ripHit, B({ ...body, crouch: -0.2, lean: 0.18, twist: -0.22, hipTwist: -0.05, step: 0.5, back: 0.4, width: 0.2 })),
  K(1.05, B({ ...body, front: 'R', crouch: -0.04, lean: -0.14, twist: 0.8, hipTwist: 0.35, step: 0.42, back: 0.34, width: 0.2, headPitch: -0.18 })),
];
const heliDrawn: KeyIn[] = [
  K(HELI_START, B({ ...body, front: 'R', crouch: -0.04, lean: -0.14, twist: 0.8, hipTwist: 0.35, step: 0.42, back: 0.34, width: 0.2, headPitch: -0.18 }), { spin: 0, hop: 0 }),
  K(HELI_WHIRL, B({ ...body, crouch: -0.16, lean: -0.08, twist: 0.4, hipTwist: 0.1, step: 0.3, back: 0.3, width: 0.26, headPitch: -0.25 }), { spin: 0.04 }),
  K(-0.95, B({ ...body, crouch: -0.14, lean: -0.12, twist: 0.25, step: 0.3, back: 0.3, width: 0.26, headPitch: -0.25 }), { spin: 0.38 }),
  K(-0.5, B({ ...body, crouch: -0.08, lean: -0.14, twist: 0.1, step: 0.3, back: 0.3, width: 0.24, headPitch: -0.25 }), { spin: 0.72, hop: 0.06 }),
  K(HELI_SLAM, B({ ...body, crouch: 0.02, lean: -0.24, twist: -0.3, hipTwist: -0.1, step: 0.32, back: 0.3, width: 0.22, headPitch: -0.3 }), { spin: 1, hop: 0.22 }),
  K(0.2, B({ ...body, crouch: 0.0, lean: -0.2, twist: -0.12, step: 0.36, back: 0.3, width: 0.22, headPitch: -0.25 }), { hop: 0.3 }),
  K(heliHit, B({ ...body, crouch: -0.24, lean: 0.3, twist: 0, step: 0.5, back: 0.4, width: 0.24, headPitch: -0.1 }), { hop: 0.08 }),
  K(heliGround + 0.06, B({ ...body, crouch: -0.46, lean: 0.24, twist: 0, step: 0.36, back: 0.36, width: 0.34, headPitch: 0.05 }), { hop: 0 }),
  K(1.12, B({ ...body, crouch: -0.48, lean: 0.24, twist: 0, step: 0.36, back: 0.36, width: 0.34, headPitch: 0.08 })),
];
const diveDrawn: KeyIn[] = [
  K(-0.6, B({ ...body, crouch: -0.24, lean: 0.3, twist: -0.3, step: 0.4, back: 0.4 })),
  K(DIVE_COCK_S, B({ ...body, crouch: -0.34, lean: 0.45, twist: -0.5, hipTwist: -0.12, step: 0.36, back: 0.44, headPitch: -0.1 }), { hop: 0, flip: 0 }),
  K(diveHit - 0.12, B({ ...body, crouch: -0.16, lean: 0.72, twist: -0.12, step: 0.5, back: 0.56, headPitch: -0.35 }), { hop: 0.18, flip: 0.03 }),
  K(diveHit, B({ ...body, crouch: -0.3, lean: 0.9, twist: -0.02, step: 0.58, back: 0.62, headPitch: -0.45 }), { hop: 0.1, flip: 0.04 }),
  K(diveGround + 0.06, B({ ...body, crouch: -0.5, lean: 1.05, twist: 0, step: 0.66, back: 0.66, width: 0.2, headPitch: -0.5 }), { hop: 0, flip: 0 }),
  K(1.12, B({ ...body, crouch: -0.5, lean: 1.05, twist: 0, step: 0.66, back: 0.66, width: 0.2, headPitch: -0.48 })),
];
const revDrawn: KeyIn[] = [
  K(-0.6, B({ ...body, crouch: -0.14, lean: 0.14, twist: -0.2 })),
  K(0, B({ ...body, crouch: -0.36, lean: 0.06, twist: -0.08, step: 0.22, back: 0.52, headPitch: 0.15 })),
  K(revHit, B({ ...body, crouch: -0.22, lean: -0.08, twist: 0, step: 0.2, back: 0.58, headPitch: -0.15 })),
  K(1.0, B({ ...body, crouch: -0.28, lean: -0.38, twist: 0.05, step: 0.18, back: 0.66, width: 0.2, headPitch: -0.3 })),
];
const somDrawn: KeyIn[] = [
  K(-0.4, B({ ...body, crouch: -0.14, lean: 0.05, twist: -0.25 }), { flip: 0, hop: 0 }),
  K(-0.06, B({ ...body, crouch: -0.06, lean: -0.22, twist: -0.1, headPitch: -0.2 }), { flip: -0.03 }),
  K(somHit, B({ ...body, crouch: -0.18, lean: 0.22, twist: 0, headPitch: 0.1 }), { flip: 0.18, hop: 0.3 }),
  K(0.8, B({ ...body, crouch: -0.32, lean: 0.4, twist: 0, headPitch: 0.2 }), { flip: 0.55, hop: 0.4 }),
  K(1.07, B({ ...body, crouch: -0.3, lean: 0.35, twist: 0, headPitch: 0.15 }), { flip: 0.8, hop: 0.2 }),
  K(1.3, B({ ...body, crouch: -0.2, lean: 0.2, twist: -0.1 }), { flip: 1, hop: 0 }),
];
const skyDrawn: KeyIn[] = [
  K(-0.2, B({ ...body, crouch: -0.2, lean: 0.2, twist: -0.15 }), { flip: 0, hop: 0 }),
  K(0.0, B({ ...body, crouch: -0.3, lean: 0.32, twist: 0, headPitch: 0.1 }), { flip: 0.15, hop: 0.1 }),
  K(SKY_TOP_S, B({ ...body, crouch: 0.05, lean: 0.0, twist: 0, step: 0.1, back: 0.1, width: 0.12, headPitch: -0.1 }), { flip: 0.5, hop: 0.6 }),
  K(skyChamber, B({ ...body, crouch: 0.02, lean: -0.08, twist: 0, step: 0.12, back: 0.12, width: 0.12, headPitch: -0.1 }), { flip: 0.62, hop: 0.5 }),
  K(skyHit, B({ ...body, crouch: -0.22, lean: 0.35, twist: 0, step: 0.36, back: 0.3, width: 0.24, headPitch: -0.15 }), { flip: 1, hop: 0.06 }),
  K(skyGround + 0.06, B({ ...body, crouch: -0.52, lean: 0.6, twist: 0, step: 0.3, back: 0.3, width: 0.32, headPitch: -0.2 }), { hop: 0 }),
  K(1.12, B({ ...body, crouch: -0.54, lean: 0.62, twist: 0, step: 0.3, back: 0.3, width: 0.32, headPitch: -0.18 })),
];

export const WARDEN_B: Partial<Record<string, MoveDef>> = {
  // Felled Oak: wound right and sunk low, he rips the hammer up out of the floor and stands it on
  // end in front of him like a tree, rising onto his toes under it, chest open; then it topples
  // through the target, the lead foot steps in, the hips drive through and he crunches down after
  // it, almost flat behind the haft as the head bursts into the ground
  h: swung(mv({
    keys: [
      K(-0.2, B({ ...body, crouch: -0.25, lean: 0.3, twist: -0.5, hipTwist: -0.2 })),
      // wound right and sunk low as it is ripped up round his right side
      K(0.0, B({ ...body, crouch: -0.44, lean: 0.3, twist: -1.1, hipTwist: -0.55, step: 0.26, back: 0.4, width: 0.22, headPitch: 0.1 })),
      // up on his toes under the standing hammer, the chest open
      K(OAK_TOP_S, B({ ...body, crouch: 0.06, lean: -0.32, twist: -0.2, hipTwist: -0.05, step: 0.26, back: 0.34, width: 0.18, headPitch: -0.45 }), { hop: 0.08 }),
      // the lead foot steps in and the hips drive through as it starts to fall
      K(0.8, B({ ...body, crouch: -0.16, lean: 0.25, twist: 0.05, hipTwist: 0.22, step: 0.5, back: 0.4, width: 0.22, headPitch: -0.3 }), { hop: 0.03 }),
      // crunched down after it, all the weight on the front leg
      K(oakHit, B({ ...body, crouch: -0.42, lean: 0.72, twist: 0.3, hipTwist: 0.25, step: 0.62, back: 0.46, width: 0.26, headPitch: -0.25 }), { hop: 0 }),
      K(oakGround + 0.06, B({ ...body, crouch: -0.5, lean: 0.92, twist: 0.35, hipTwist: 0.28, step: 0.66, back: 0.52, width: 0.28, headPitch: -0.35 })),
      K(1.12, B({ ...body, crouch: -0.52, lean: 0.94, twist: 0.35, hipTwist: 0.28, step: 0.66, back: 0.52, width: 0.28, headPitch: -0.32 })),
    ],
    main: oak,
    impacts: [oakHit],
    start: -0.2,
    chamber: OAK_TOP_S,
    travel: 0.18,
    blendIn: 0.3,
    end: 1.04,
    rest: 1.02,
    settle: 0.4,
    lead: 0.02,
    fx: [
      fx(-0.08, 'dust', 'tip', 1.1),
      fx(OAK_TOP_S - 0.02, 'sparkle', 'tip', 0.7, '#ffd27a'),
      fx(oakGround, 'shockwave', 'tip', 1.5),
      fx(oakGround, 'shake', 'root', 1.4),
      fx(oakGround, 'dust', 'tip', 1.3),
      fx(oakGround + 0.03, 'stomp', 'feet', 1),
    ],
    trail: { life: 0.22, glow: 0.6 },
  }), oakDrawn),
  // Rip-Up: he hauls himself round to the right, winding up hard as the head drags back along the
  // floor until it trails behind him; then the hips unwind first and it is ripped up through the
  // target from low on his right to high on his left, the body turning on after it and the right
  // foot stepping through
  h1: swung(mv({
    keys: [
      K(-1, B({ ...body, crouch: -0.5, lean: 0.92, twist: 0.35, hipTwist: 0.28, step: 0.66, back: 0.52, width: 0.28, headPitch: -0.35 })),
      K(-0.5, B({ ...body, crouch: -0.4, lean: 0.5, twist: -0.7, hipTwist: -0.35, step: 0.5, back: 0.5, width: 0.24, headPitch: -0.1 })),
      // hauled round to the right as the head trails behind him: wound up, the weight on the rear leg
      K(RIP_BACK_S, B({ ...body, crouch: -0.46, lean: 0.32, twist: -1.3, hipTwist: -0.7, step: 0.44, back: 0.52, width: 0.24, headPitch: 0.05 })),
      // the hips unwind first
      K(0.4, B({ ...body, crouch: -0.38, lean: 0.3, twist: -0.6, hipTwist: 0.05, step: 0.52, back: 0.46, width: 0.22 })),
      K(ripHit, B({ ...body, crouch: -0.24, lean: 0.25, twist: 0.65, hipTwist: 0.45, step: 0.56, back: 0.4, width: 0.2 })),
      // and he rises after it, turning on through, the right foot stepping through
      K(1.05, B({ ...body, front: 'R', crouch: -0.02, lean: -0.2, twist: 1.2, hipTwist: 0.65, step: 0.44, back: 0.36, width: 0.22, headPitch: -0.2 })),
    ],
    main: rip,
    impacts: [ripHit],
    start: -1,
    chamber: RIP_BACK_S,
    travel: 0.15,
    blendIn: 0.25,
    fx: [
      fx(-0.85, 'quake', 'tip', 0.8),
      fx(-0.55, 'quake', 'tip', 0.9),
      fx(-0.25, 'quake', 'tip', 1),
      fx(hitAt(rip, 1, 1), 'quake', 'tip', 1.2),
      fx(ripHit, 'flashline', 'tip', 1),
      fx(ripHit, 'stomp', 'feet', 0.9),
    ],
    trail: { life: 0.22, glow: 0.55 },
  }), ripDrawn),
  // Helicopter: the finisher. The hammer goes up into a flat whirl over his head and he turns a
  // full circle under it, leaning out against its pull and rising after it; wound back right on
  // his toes at the top, it comes over and down, and he crunches into a deep, wide squat behind it
  // as the ground explodes
  h2: swung(mv({
    keys: [
      K(HELI_START, B({ ...body, front: 'R', crouch: -0.02, lean: -0.2, twist: 1.2, hipTwist: 0.65, step: 0.44, back: 0.36, width: 0.22, headPitch: -0.2 }), { spin: 0, hop: 0 }),
      // the whole body turns under the whirl, leaning out against its pull
      K(HELI_WHIRL, B({ ...body, crouch: -0.2, lean: -0.1, twist: 0.4, hipTwist: 0.25, step: 0.3, back: 0.3, width: 0.28, side: -0.06, headPitch: -0.25 }), { spin: 0.04 }),
      K(-0.95, B({ ...body, crouch: -0.18, lean: -0.16, twist: 0.1, hipTwist: 0.3, step: 0.3, back: 0.3, width: 0.28, side: 0.06, headPitch: -0.25 }), { spin: 0.4 }),
      K(-0.5, B({ ...body, crouch: -0.1, lean: -0.18, twist: 0.0, hipTwist: 0.2, step: 0.3, back: 0.3, width: 0.26, side: -0.06, headPitch: -0.25 }), { spin: 0.72, hop: 0.06 }),
      // risen onto his toes and wound back right under it at the top, the chest open
      K(HELI_SLAM, B({ ...body, crouch: 0.04, lean: -0.32, twist: -0.75, hipTwist: -0.35, step: 0.32, back: 0.34, width: 0.22, headPitch: -0.35 }), { spin: 1, hop: 0.22 }),
      K(0.2, B({ ...body, crouch: 0.06, lean: -0.3, twist: -0.5, hipTwist: -0.1, step: 0.4, back: 0.32, width: 0.22, headPitch: -0.3 }), { hop: 0.3 }),
      // then crunched down into the blow
      K(heliHit, B({ ...body, crouch: -0.3, lean: 0.45, twist: 0.3, hipTwist: 0.25, step: 0.56, back: 0.42, width: 0.3, headPitch: -0.15 }), { hop: 0.06 }),
      K(heliGround + 0.06, B({ ...body, crouch: -0.5, lean: 0.78, twist: 0.35, hipTwist: 0.25, step: 0.5, back: 0.42, width: 0.38, headPitch: -0.05 }), { hop: 0 }),
      K(1.12, B({ ...body, crouch: -0.52, lean: 0.78, twist: 0.35, hipTwist: 0.25, step: 0.5, back: 0.42, width: 0.38, headPitch: -0.02 })),
    ],
    main: heli,
    impacts: [heliHit],
    start: HELI_START,
    chamber: HELI_WHIRL,
    flow: 1.35,
    blendIn: 0.25,
    end: 1.02,
    rest: 1.0,
    settle: 0.45,
    fx: [
      fx(HELI_WHIRL, 'dust', 'feet', 0.9),
      fx(-1.15, 'whirl', 'root', 1.2, '#ffe2b0'),
      fx(-0.6, 'whirl', 'root', 1.3, '#ffe2b0'),
      fx(heliGround, 'shockwave', 'tip', 1.8),
      fx(heliGround, 'embers', 'root', 1.3),
      fx(heliGround, 'shake', 'root', 1.5),
      fx(heliGround, 'quake', 'tip', 1.2),
      fx(heliGround + 0.03, 'stomp', 'feet', 1.2),
    ],
    trail: { life: 0.26, glow: 0.7 },
  }), heliDrawn),
  // Prone Slam: out of the dash the hammer swings back along his right side and up behind the
  // shoulder as he winds up on the rear leg; then he launches off it, hips first, and dives after
  // it, the body all but flat and the arms at full stretch as it comes over the top and lands far
  // out ahead
  dh: swung(mv({
    keys: [
      K(-0.6, B({ ...body, crouch: -0.3, lean: 0.32, twist: -0.5, hipTwist: -0.2, step: 0.4, back: 0.44 })),
      // wound right with the hammer cocked behind the shoulder, the weight back on the rear leg
      K(DIVE_COCK_S, B({ ...body, crouch: -0.44, lean: 0.3, twist: -1.1, hipTwist: -0.55, step: 0.36, back: 0.52, width: 0.22, headPitch: -0.05 }), { hop: 0, flip: 0 }),
      K(0.4, B({ ...body, crouch: -0.3, lean: 0.35, twist: -0.5, hipTwist: 0.0, step: 0.44, back: 0.54 }), { hop: 0.06 }),
      // launched up off the rear foot, the hips through first, the chest still open
      K(diveHit - 0.12, B({ ...body, crouch: -0.1, lean: 0.55, twist: -0.05, hipTwist: 0.25, step: 0.5, back: 0.58, headPitch: -0.4 }), { hop: 0.2, flip: 0.03 }),
      K(diveHit, B({ ...body, crouch: -0.32, lean: 0.95, twist: 0.3, hipTwist: 0.3, step: 0.6, back: 0.62, width: 0.2, headPitch: -0.45 }), { hop: 0.1, flip: 0.04 }),
      K(diveGround + 0.06, B({ ...body, crouch: -0.52, lean: 1.08, twist: 0.35, hipTwist: 0.3, step: 0.68, back: 0.66, width: 0.24, headPitch: -0.5 }), { hop: 0, flip: 0 }),
      K(1.12, B({ ...body, crouch: -0.52, lean: 1.08, twist: 0.35, hipTwist: 0.3, step: 0.68, back: 0.66, width: 0.24, headPitch: -0.48 })),
    ],
    main: dive,
    impacts: [diveHit],
    start: -0.6,
    chamber: DIVE_COCK_S,
    travel: 0.25,
    blendIn: 0.3,
    end: 1.04,
    rest: 1.02,
    settle: 0.4,
    ghosts: [DIVE_COCK_S - 0.1, diveGround + 0.05],
    fx: [
      fx(-0.55, 'dust', 'feet', 1.1),
      fx(diveHit - 0.12, 'dust', 'feet', 1),
      fx(diveGround, 'shockwave', 'tip', 1.4),
      fx(diveGround, 'shake', 'root', 1.1),
      fx(diveGround + 0.04, 'stomp', 'feet', 1.1),
    ],
    trail: { life: 0.22, glow: 0.6 },
  }), diveDrawn),
  // Reverse Launcher: the left foot reaches back and the hips sink and wind onto it as the head is
  // dug in under the target; then the hips heave round and it goes up through it and on over his
  // head as he rises and leans away after it, the hammer ending hung back over his shoulders
  bh: swung(mv({
    keys: [
      K(-0.6, B({ ...body, crouch: -0.2, lean: 0.16, twist: -0.3, hipTwist: -0.15 }), { hop: 0 }),
      // the hips sunk back onto the reaching rear leg, wound right over the dug-in head
      K(0, B({ ...body, crouch: -0.46, lean: 0.2, twist: -0.5, hipTwist: -0.3, step: 0.24, back: 0.56, width: 0.22, headPitch: 0.15 })),
      // the hips heave round and up first
      K(revHit, B({ ...body, crouch: -0.25, lean: -0.05, twist: 0.25, hipTwist: 0.25, step: 0.22, back: 0.6, headPitch: -0.15 })),
      // up on his toes as it goes over, leaning away after it
      K(0.6, B({ ...body, crouch: -0.05, lean: -0.35, twist: 0.35, hipTwist: 0.2, step: 0.2, back: 0.64, width: 0.2, headPitch: -0.4 }), { hop: 0.06 }),
      K(1.0, B({ ...body, crouch: -0.3, lean: -0.45, twist: 0.2, hipTwist: 0.1, step: 0.18, back: 0.72, width: 0.22, headPitch: -0.3 }), { hop: 0 }),
    ],
    main: rev,
    impacts: [revHit],
    start: -0.6,
    chamber: 0,
    travel: 0.3,
    end: 1.05,
    rest: 1.0,
    settle: 0.4,
    fx: [
      fx(-0.05, 'dust', 'tip', 1.1),
      fx(0.02, 'quake', 'tip', 0.8),
      fx(revHit, 'flashline', 'tip', 1.1),
      fx(revHit, 'sparkle', 'tip', 1, '#ffffff'),
      fx(revHit + 0.05, 'dust', 'feet', 0.9),
    ],
    trail: { life: 0.2, glow: 0.5 },
  }), revDrawn),
  // Somersault: in the air the hammer is drawn up behind his head, his back arched and wound
  // right, and he jack-knifes into a forward flip with it held out at arm's length; it comes over
  // the top and down through the target, then folds in along his chest for the rest of the turn
  jl: swung(mv({
    keys: [
      K(-0.4, B({ ...body, crouch: -0.16, lean: 0.05, twist: -0.45, hipTwist: -0.2 }), { flip: 0, hop: 0 }),
      // arched back and wound right as it is drawn up behind his head
      K(-0.06, B({ ...body, crouch: 0.02, lean: -0.32, twist: -0.8, hipTwist: -0.4, headPitch: -0.25 }), { flip: -0.03 }),
      K(0.3, B({ ...body, crouch: -0.08, lean: 0.0, twist: -0.2, hipTwist: 0.1, headPitch: -0.05 }), { flip: 0.07, hop: 0.15 }),
      // then jack-knifed over it into the flip
      K(somHit, B({ ...body, crouch: -0.3, lean: 0.45, twist: 0.3, hipTwist: 0.2, headPitch: 0.1 }), { flip: 0.18, hop: 0.3 }),
      K(0.8, B({ ...body, crouch: -0.38, lean: 0.5, twist: 0.25, hipTwist: 0.15, headPitch: 0.2 }), { flip: 0.55, hop: 0.4 }),
      K(1.07, B({ ...body, crouch: -0.32, lean: 0.38, twist: 0.1, headPitch: 0.15 }), { flip: 0.8, hop: 0.2 }),
      K(1.3, B({ ...body, crouch: -0.2, lean: 0.2, twist: -0.1 }), { flip: 1, hop: 0 }),
    ],
    main: somersault,
    impacts: [somHit],
    start: -0.4,
    chamber: -0.06,
    travel: 0.2,
    blendIn: 0.4,
    end: 1.07,
    rest: 1.3,
    settle: 0.6,
    lead: 0.04,
    fx: [fx(somHit, 'sparkle', 'tip', 0.9, '#ffd27a'), fx(somHit, 'flashline', 'tip', 0.8)],
    trail: { life: 0.2, glow: 0.45 },
  }), somDrawn),
  // Skyfall: the hammer goes up overhead as he flips forward, so that upside down at the top of
  // the jump he is standing on his hands on the haft, stretched straight; the flip rolls on, the
  // hammer comes over the top from behind, and he crunches down into a wide squat behind it as it
  // hits the floor
  jh: swung(mv({
    keys: [
      K(-0.2, B({ ...body, crouch: -0.24, lean: 0.22, twist: -0.45, hipTwist: -0.2 }), { flip: 0, hop: 0 }),
      K(0.0, B({ ...body, crouch: -0.36, lean: 0.3, twist: -0.7, hipTwist: -0.35, headPitch: 0.1 }), { flip: 0.15, hop: 0.1 }),
      // stretched out straight on the haft, upside down
      K(SKY_TOP_S, B({ ...body, crouch: 0.1, lean: -0.05, twist: -0.1, hipTwist: -0.05, step: 0.1, back: 0.1, width: 0.12, headPitch: -0.15 }), { flip: 0.5, hop: 0.6 }),
      K(skyChamber, B({ ...body, crouch: 0.04, lean: -0.2, twist: -0.2, hipTwist: -0.08, step: 0.12, back: 0.12, width: 0.12, headPitch: -0.2 }), { flip: 0.62, hop: 0.5 }),
      // then crunched down into the slam as he lands, the stance wide
      K(skyHit, B({ ...body, crouch: -0.3, lean: 0.6, twist: 0.25, hipTwist: 0.2, step: 0.4, back: 0.32, width: 0.28, headPitch: -0.2 }), { flip: 1, hop: 0.06 }),
      K(skyGround + 0.06, B({ ...body, crouch: -0.55, lean: 0.75, twist: 0.3, hipTwist: 0.2, step: 0.34, back: 0.32, width: 0.36, headPitch: -0.25 }), { hop: 0 }),
      K(1.12, B({ ...body, crouch: -0.56, lean: 0.76, twist: 0.3, hipTwist: 0.2, step: 0.34, back: 0.32, width: 0.36, headPitch: -0.22 })),
    ],
    main: sky,
    impacts: [skyHit],
    start: -0.2,
    chamber: skyChamber,
    travel: 0.12,
    blendIn: 0.3,
    end: 1.04,
    rest: 1.0,
    settle: 0.4,
    lead: 0.04,
    fx: [
      fx(SKY_TOP_S, 'sparkle', 'tip', 0.7, '#ffd27a'),
      fx(skyGround, 'shockwave', 'tip', 1.4),
      fx(skyGround, 'stomp', 'feet', 1.1),
      fx(skyGround, 'shake', 'root', 1),
    ],
    trail: { life: 0.22, glow: 0.6 },
  }), skyDrawn),
};
