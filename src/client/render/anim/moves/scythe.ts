/**
 * Wraith, scythe. Every cut is a reap: the shaft turns about a point between the hands and the
 * hips do the sweeping, so the blade hooks round and draws back toward the reaper. A twirl before
 * the reverse cut, a long spin that brings the blade round after three quarters of a turn, an
 * executioner's cut from overhead, a rising reap out of it, a two-turn requiem on the mist, a
 * gliding one-handed reap, a backhand that rips the ground open, a reap drawn back while drifting
 * away, a twirl over the head, a diagonal fall through the air, a somersault that buries the blade,
 * green fire along the ground, and a chain of souls flung out to drag them in.
 */
import { B, K, P, Style, X, arc, circle, fx, hitAt, line, mv, seq, track } from '../author';
import type { Motion, V3 } from '../author';

const body = B({ front: 'L', step: 0.26, back: 0.26, width: 0.16, crouch: -0.11, lean: 0.1, twist: -0.28 });
const SOUL = '#63c74d';

/**
 * A reap: the shaft turning about a point between the hands, the right hand just above the pivot.
 * The left hand rides below the right (closer in for the reverse cut), so the arms only cross in the
 * follow-through.
 */
const reap = (pivot: V3, dirs: V3[], grip2 = -0.4) => arc(pivot, 0.1, dirs, grip2);

// Harvest: from the right, round through them, drawn back on the left
const harvest = reap([0.06, 0.32, 0.3], [[-0.75, 0.38, 0.35], [-0.55, 0.3, 0.8], [0.0, 0.24, 1], [0.4, 0.14, 0.9], [0.55, 0.05, 0.65]]);
const harvestHit = hitAt(harvest, 2);

// Thresh: a twirl in front (one hand), then the reverse reap from the left
const thresh = seq(
  [
    [-1.4, -0.3, arc([-0.2, 0.42, 0.32], -0.25, circle([0, 1, 0.15], [1, 0, 0.15], 1, 0, 12), NaN)],
    [-0.3, 1.07, reap([-0.06, 0.32, 0.3], [[0.75, 0.38, 0.35], [0.55, 0.3, 0.8], [0.0, 0.24, 1], [-0.4, 0.14, 0.9], [-0.55, 0.05, 0.65]], -0.12)],
  ],
  0.1,
);
const threshHit = hitAt(thresh, 2, 1);

// Execution: raised behind the head, then down over them and drawn back
const execution = arc([0.06, 0.42, 0.2], 0.12, [[0.1, 0.55, -0.82], [0.02, 1, 0.1], [0, 0.6, 0.8], [0, 0.3, 0.95], [0, -0.25, 0.97], [0, -0.6, 0.8]], -0.4);
const executionHit = hitAt(execution, 3);

// Reaping Arc: the same reap, low enough to take their ankles
const lowReap = reap([0.06, 0.24, 0.3], [[-0.8, -0.1, 0.3], [-0.55, -0.24, 0.8], [0.0, -0.3, 1], [0.4, -0.27, 0.85], [0.6, -0.15, 0.5]]);
const lowHit = hitAt(lowReap, 2);

// Severance: carried on from the overhead down to the left, then reaped up across to the right
const severance = reap([-0.04, 0.3, 0.3], [[0.75, -0.4, 0.45], [0.45, -0.25, 0.9], [0.0, 0.05, 1], [-0.45, 0.45, 0.75], [-0.6, 0.7, 0.35]], -0.2);
const severanceHit = hitAt(severance, 2);

// Drift Reap: one-handed at full stretch, trailing behind on the right and flicked round
const drift = arc([-0.3, 0.42, 0.0], 0.5, [[-0.5, -0.3, -0.8], [-0.95, -0.2, 0.05], [-0.55, -0.12, 0.85], [0.0, -0.08, 1], [0.5, -0.04, 0.85], [0.75, 0.0, 0.5]]);
const driftHit = hitAt(drift, 3);

// Soul Rend: from behind the left shoulder down into a flat backhand sweep, round to the right
const rend = reap([-0.04, 0.3, 0.32], [[0.6, 0.35, -0.72], [0.95, 0.0, 0.2], [0.5, -0.28, 0.85], [0.0, -0.3, 1], [-0.55, -0.25, 0.8], [-0.9, -0.1, 0.3]], -0.15);
const rendHit = hitAt(rend, 3);

// Mournful Step: reached out to the left and drawn back across to the right, the pivot pulled in
const mourn = arc([0.0, 0.35, 0.36], 0.1, [[0.85, 0.25, 0.5], [0.35, 0.14, 0.95], [-0.1, 0.05, 1], [-0.55, -0.05, 0.8], [-0.85, -0.1, 0.4]], -0.15, { pivot1: [-0.08, 0.3, 0.08] });
const mournHit = hitAt(mourn, 2);

// Grave Wind: the shaft twirled flat over the head, the circle sinking to their neck by the second pass
const graveWind = arc([0.0, 0.88, 0.1], 0.12, circle([1, 0, 0], [0, 0, 1], 1.5, 0, 12), -0.4, { pivot1: [0.0, 0.62, 0.22] });
const graveHit = hitAt(graveWind, 10);

// Ghost Fall: from high on the right, falling across them to low on the left
const ghostFall = reap([0.0, 0.4, 0.3], [[-0.6, 0.75, 0.3], [-0.45, 0.5, 0.75], [-0.05, 0.05, 1], [0.4, -0.4, 0.8], [0.6, -0.7, 0.35]]);
const ghostHit = hitAt(ghostFall, 2);

// Last Rites: held up behind through the somersault, then over and down, the point into the ground
const rites = seq([
  [-1.0, 0.0, line([0.0, 0.45, 0.15], [0.07, 0.54, 0.04], [0.1, 0.6, -0.8], [0.08, 0.35, -0.94], [0, 1, 0.3], -0.45, -0.45)],
  [0.0, 1.07, arc([0.06, 0.5, 0.15], 0.12, [[0.08, 0.35, -0.94], [0.02, 1, 0.05], [0, 0.45, 0.9], [0, -0.25, 0.97], [0, -0.7, 0.72], [0, -0.82, 0.57]], -0.45)],
]);
const ritesHit = hitAt(rites, 4, 1);

/** The scythe keyed along s (the entrance): straight moves between keyed grips [s, pos, dir, edge, grip2], held outside them. */
type Grip = [number, V3, V3, V3, number];
const keyed = (ks: Grip[], blend = 0.03): Motion => {
  const hold = (k: Grip, from: number, to: number): [number, number, Motion] => [from, to, line(k[1], k[1], k[2], k[2], k[3], k[4], k[4])];
  const parts: [number, number, Motion][] = [hold(ks[0], ks[0][0] - 1, ks[0][0])];
  for (let i = 1; i < ks.length; i++) {
    const a = ks[i - 1];
    const b = ks[i];
    parts.push([a[0], b[0], line(a[1], b[1], a[2], b[2], b[3], a[4], b[4])]);
  }
  parts.push(hold(ks[ks.length - 1], ks[ks.length - 1][0], ks[ks.length - 1][0] + 1));
  return seq(parts, blend);
};
const BLOOD = '#ff3a3a';

export const scythe: Style = {
  axis: '-x',
  offAxis: '-x',
  trail: { light: '#d8ffe0', heavy: SOUL, special: '#ff3a3a' },
  sparks: ['#ffffff', '#b8ffd0', SOUL],
  guard: P(body, X([-0.18, 0.1, 0.22], [0.3, 0.85, 0.45], [0.2, -0.2, 1], '-x', 0.45)),
  block: P(B({ ...body, crouch: -0.16 }), X([-0.15, 0.25, 0.32], [0.25, 1, 0.1], [0.3, 0, 1], '-x', 0.42)),
  moves: {
    // Harvest: the hips swing it, the blade hooks round them
    l0: mv({
      keys: [
        K(-0.15, B({ ...body, twist: -0.95, hipTwist: -0.3, lean: 0.06 })),
        K(harvestHit + 0.1, B({ ...body, twist: 0.0, hipTwist: 0.0, lean: 0.3, crouch: -0.2, step: 0.4 })),
        K(1.05, B({ ...body, twist: 0.75, hipTwist: 0.3, lean: 0.32, crouch: -0.22, step: 0.42 })),
      ],
      main: harvest,
      impacts: [harvestHit],
      fx: [fx(harvestHit, 'wisps', 'tip', 0.6)],
    }),
    // Thresh: a twirl of the scythe in front, then the reverse reap
    l1: mv({
      keys: [
        K(-1.4, B({ ...body, twist: 0.2, lean: 0.05 })),
        K(-0.3, B({ ...body, twist: 0.85, hipTwist: 0.3, lean: 0.05 })),
        K(threshHit + 0.1, B({ ...body, twist: 0.0, hipTwist: 0.0, lean: 0.3, crouch: -0.2, step: 0.4 })),
        K(1.05, B({ ...body, twist: -0.8, hipTwist: -0.3, lean: 0.32, crouch: -0.22, step: 0.42 })),
      ],
      main: thresh,
      impacts: [threshHit],
      start: -1.4,
      chamber: -1.3,
      flow: 1.3,
      blendIn: 0.3,
      fx: [fx(-0.8, 'wisps', 'tip', 0.4), fx(threshHit, 'wisps', 'tip', 0.6)],
    }),
    // Gyre: the blade held out on the right and a long turn to the right; it trails round and
    // reaches them three quarters of the way, and the turn carries on home
    l2: mv({
      keys: [
        K(-1.6, B({ ...body, twist: 0.3, lean: 0.2, crouch: -0.2 }), { spin: 0 }),
        K(-1.0, B({ ...body, twist: 0.0, lean: 0.25, crouch: -0.24, step: 0.2, back: 0.2, width: 0.2 }), { spin: -0.15 }),
        K(0.55, B({ ...body, twist: 0.0, lean: 0.28, crouch: -0.26, step: 0.2, back: 0.2, width: 0.2 }), { spin: -0.825 }),
        K(1.1, B({ ...body, twist: -0.1, lean: 0.24, crouch: -0.22, step: 0.24, back: 0.24 }), { spin: -1 }),
      ],
      main: line([-0.16, 0.3, 0.2], [-0.16, 0.3, 0.2], [-1, 0.2, 0.3], [-1, 0.15, 0.3], [0, 0, 1], -0.4, -0.4),
      impacts: [0.45],
      start: -1.6,
      chamber: -1.2,
      flow: 1.35,
      blendIn: 0.3,
      fx: [fx(-0.9, 'whirl', 'root', 0.9, '#b8ffd0'), fx(0.45, 'wisps', 'tip', 0.8)],
      trail: { life: 0.24, glow: 0.5 },
    }),
    // Execution: up behind the head, down over them like a headsman's stroke, and drawn back
    h: mv({
      keys: [
        K(-0.2, B({ ...body, lean: -0.26, crouch: -0.02, twist: -0.1, headPitch: -0.15 })),
        K(executionHit + 0.1, B({ ...body, lean: 0.42, crouch: -0.24, twist: 0.0, step: 0.45, back: 0.3 })),
        K(1.05, B({ ...body, lean: 0.5, crouch: -0.3, twist: 0.0, step: 0.48, back: 0.32, headPitch: 0.1 })),
      ],
      main: execution,
      impacts: [executionHit],
      chamber: -0.12,
      fx: [fx(executionHit, 'wisps', 'tip', 1.4), fx(executionHit + 0.05, 'soulfire', 'tip', 0.8), fx(executionHit, 'shake', 'root', 0.5)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    // Severance: on out of the overhead, the blade dragged low to the left and reaped up and across
    // to the right, the reaper rising on the mist with it
    h1: mv({
      keys: [
        K(-0.15, B({ ...body, twist: 0.8, hipTwist: 0.3, lean: 0.38, crouch: -0.28, side: 0.1 })),
        K(severanceHit + 0.1, B({ ...body, twist: 0.0, hipTwist: 0.0, lean: 0.16, crouch: -0.14, side: -0.08, lift: 0.04 })),
        K(1.05, B({ ...body, twist: -0.7, hipTwist: -0.3, lean: -0.06, crouch: -0.06, side: -0.15, headPitch: -0.15, lift: 0.12 })),
      ],
      main: severance,
      impacts: [severanceHit],
      chamber: -0.1,
      fx: [fx(0.15, 'soulfire', 'tip', 0.6), fx(severanceHit, 'wisps', 'tip', 1.0)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    // Requiem: lifted on the mist into two turns to the left with the scythe held out high; it
    // sinks through them on the second turn and the reaper comes down hard
    h2: mv({
      keys: [
        K(-1.6, B({ ...body, twist: -0.5, hipTwist: -0.2, lean: 0.2, crouch: -0.2 }), { spin: 0, hop: 0 }),
        K(-1.0, B({ ...body, twist: -0.2, lean: 0.1, crouch: -0.08 }), { spin: 0.15, hop: 0.1 }),
        K(-0.3, B({ ...body, twist: 0.0, lean: 0.0, crouch: 0.0, side: 0.12, headPitch: -0.2 }), { spin: 0.85, hop: 0.35 }),
        K(0.45, B({ ...body, twist: 0.1, lean: 0.15, crouch: 0.0, side: 0.1 }), { spin: 1.25, hop: 0.4 }),
        K(1.0, B({ ...body, twist: 0.2, lean: 0.4, crouch: -0.25 }), { spin: 1.85, hop: 0.1 }),
        K(1.3, B({ ...body, twist: 0.0, lean: 0.45, crouch: -0.32 }), { spin: 2, hop: 0 }),
        K(1.6, B({ ...body, lean: 0.3, crouch: -0.2 }), { spin: 2, hop: 0 }),
      ],
      main: seq([
        [-1.6, -0.6, line([-0.3, 0.4, 0.2], [-0.45, 0.5, 0.15], [-0.7, 0.6, 0.35], [-0.8, 0.55, 0.2], [0, 0, 1], -0.45, -0.45)],
        [-0.6, 0.45, line([-0.45, 0.5, 0.15], [-0.45, 0.36, 0.2], [-0.8, 0.55, 0.2], [-0.95, 0.0, 0.3], [0, 0, 1], -0.45, -0.45)],
        [0.45, 1.4, line([-0.45, 0.36, 0.2], [-0.3, 0.18, 0.3], [-0.95, 0.0, 0.3], [-0.8, -0.45, 0.4], [0, 0, 1], -0.45, -0.45)],
      ]),
      impacts: [0.45],
      start: -1.6,
      chamber: -1.0,
      flow: 1.4,
      blendIn: 0.3,
      lead: 0,
      end: 1.3,
      rest: 1.6,
      settle: 0.6,
      fx: [
        fx(-0.9, 'whirl', 'root', 1.0, '#b8ffd0'),
        fx(-0.3, 'wisps', 'tip', 0.6),
        fx(0.45, 'wisps', 'tip', 1.2),
        fx(0.45, 'soulfire', 'tip', 0.9),
        fx(0.45, 'shake', 'root', 0.6),
        fx(1.25, 'shockwave', 'feet', 0.9),
      ],
      trail: { life: 0.26, glow: 0.7 },
    }),
    // Drift Reap: gliding in bent low, the scythe one-handed and trailing behind, flicked round
    // through them at full stretch
    dl: mv({
      keys: [
        K(-0.2, B({ ...body, twist: -0.9, hipTwist: -0.35, lean: 0.5, crouch: -0.25, side: -0.1, lift: 0.05 })),
        K(driftHit + 0.1, B({ ...body, twist: 0.05, hipTwist: 0.0, lean: 0.48, crouch: -0.28 })),
        K(1.05, B({ ...body, twist: 0.7, hipTwist: 0.3, lean: 0.4, crouch: -0.26 })),
      ],
      main: drift,
      free: track([
        [-0.6, [0.38, 0.3, 0.3]],
        [0.2, [0.42, 0.36, 0.22]],
        [0.7, [0.36, 0.28, 0.12]],
        [1.1, [0.3, 0.2, 0.1]],
      ]),
      impacts: [driftHit],
      chamber: -0.1,
      ghosts: [-0.2, 0.7],
      fx: [fx(-0.1, 'smoke', 'feet', 0.8), fx(driftHit, 'wisps', 'tip', 0.7)],
      trail: { life: 0.2, glow: 0.4 },
    }),
    // Soul Rend: surging in with the blade behind the left shoulder, then a flat backhand reap that
    // rips the ground open round to the right
    dh: mv({
      keys: [
        K(-0.2, B({ ...body, twist: 0.95, hipTwist: 0.4, lean: 0.3, crouch: -0.15, side: 0.1 })),
        K(rendHit + 0.1, B({ ...body, twist: 0.0, hipTwist: 0.0, lean: 0.55, crouch: -0.34 })),
        K(1.05, B({ ...body, twist: -0.85, hipTwist: -0.35, lean: 0.48, crouch: -0.3 })),
      ],
      main: rend,
      impacts: [rendHit],
      chamber: -0.1,
      ghosts: [-0.15, 0.75],
      fx: [
        fx(-0.15, 'smoke', 'feet', 1.0),
        fx(hitAt(rend, 2), 'soulfire', 'tip', 0.8),
        fx(rendHit, 'quake', 'tip', 1.0),
        fx(rendHit, 'soulfire', 'tip', 1.2),
        fx(rendHit, 'wisps', 'tip', 1.2),
        fx(rendHit, 'shake', 'root', 0.5),
        fx(hitAt(rend, 4), 'soulfire', 'tip', 0.8),
      ],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Mournful Step: drifting back with the head bowed, the blade reached out to the left and drawn
    // back across them as it goes
    bl: mv({
      keys: [
        K(-0.15, B({ ...body, twist: 0.6, hipTwist: 0.2, lean: 0.15, crouch: -0.12, headPitch: 0.1 })),
        K(mournHit + 0.1, B({ ...body, twist: -0.1, hipTwist: -0.1, lean: -0.32, crouch: -0.22, side: 0.08, headPitch: 0.4 })),
        K(1.05, B({ ...body, twist: -0.5, hipTwist: -0.25, lean: -0.36, crouch: -0.24, headPitch: 0.45 })),
      ],
      main: mourn,
      impacts: [mournHit],
      fx: [fx(0.0, 'smoke', 'feet', 0.9), fx(mournHit, 'wisps', 'tip', 0.6), fx(0.9, 'wisps', 'tip', 0.4)],
    }),
    // Grave Wind: swaying back with the scythe twirled flat over the head; the second pass comes
    // round at their neck
    bh: mv({
      keys: [
        K(0.0, B({ ...body, twist: 0.15, lean: -0.05, crouch: -0.08, headPitch: -0.2 })),
        K(0.4, B({ ...body, twist: -0.15, lean: -0.3, crouch: -0.14, side: 0.1, headPitch: -0.3, lift: 0.05 })),
        K(graveHit + 0.05, B({ ...body, twist: 0.0, lean: -0.36, crouch: -0.2, side: -0.08, headPitch: -0.2 })),
        K(1.05, B({ ...body, twist: -0.1, lean: -0.32, crouch: -0.24 })),
      ],
      main: graveWind,
      impacts: [graveHit],
      start: 0,
      chamber: 0.08,
      flow: 1.3,
      blendIn: 0.3,
      fx: [fx(0.05, 'smoke', 'feet', 0.8), fx(0.3, 'whirl', 'root', 0.8, '#b8ffd0'), fx(0.65, 'whirl', 'root', 1.0, '#b8ffd0'), fx(graveHit, 'wisps', 'tip', 1.0)],
      trail: { life: 0.26, glow: 0.6 },
    }),
    // Ghost Fall: tipped over in the air with the blade high on the right, dropping through a
    // diagonal reap down to the left
    jl: mv({
      keys: [
        K(-0.15, B({ ...body, twist: -0.6, hipTwist: -0.2, lean: -0.05, crouch: -0.05, side: 0.25 }), { roll: -0.05, hop: 0.2 }),
        K(ghostHit + 0.1, B({ ...body, twist: 0.0, lean: 0.3, crouch: -0.15, side: -0.1 }), { roll: 0.05, hop: 0.08 }),
        K(1.05, B({ ...body, twist: 0.6, hipTwist: 0.2, lean: 0.38, crouch: -0.2, side: -0.2 }), { roll: 0.07, hop: 0 }),
      ],
      main: ghostFall,
      impacts: [ghostHit],
      chamber: -0.1,
      ghosts: [-0.1, 0.5],
      fx: [fx(ghostHit, 'wisps', 'tip', 0.7)],
      trail: { life: 0.2, glow: 0.4 },
    }),
    // Last Rites: a somersault in the air with the scythe held up behind, then over and down, the
    // point driven into the ground as the reaper lands
    jh: mv({
      keys: [
        K(-1.0, B({ ...body, lean: -0.1, crouch: -0.1 }), { flip: 0, hop: 0 }),
        K(-0.6, B({ ...body, lean: 0.2, crouch: -0.15 }), { flip: 0.3, hop: 0.4 }),
        K(-0.2, B({ ...body, lean: 0.1, crouch: -0.1 }), { flip: 0.8, hop: 0.5 }),
        K(0.2, B({ ...body, lean: -0.25, crouch: 0.0, headPitch: -0.1 }), { flip: 1, hop: 0.35 }),
        K(0.55, B({ ...body, lean: 0.2, crouch: -0.1 }), { hop: 0.15 }),
        K(ritesHit, B({ ...body, twist: -0.1, lean: 0.6, crouch: -0.4, headPitch: 0.1 }), { hop: 0 }),
        K(1.2, B({ ...body, twist: -0.1, lean: 0.55, crouch: -0.38 })),
      ],
      main: rites,
      impacts: [ritesHit],
      start: -1.0,
      chamber: 0.05,
      flow: 1.3,
      blendIn: 0.25,
      lead: 0,
      end: 1.1,
      rest: 1.08,
      fx: [
        fx(ritesHit, 'shockwave', 'tip', 1.0),
        fx(ritesHit, 'soulfire', 'tip', 1.0),
        fx(ritesHit, 'wisps', 'tip', 1.2),
      ],
      trail: { life: 0.24, glow: 0.6 },
    }),
    // Reaping Arc: crouched low, the blade at their ankles, green fire licking up along its path
    sp: mv({
      keys: [
        K(-0.2, B({ ...body, twist: -1.0, hipTwist: -0.35, crouch: -0.34, lean: 0.38, step: 0.3, back: 0.32, width: 0.2 })),
        K(lowHit + 0.1, B({ ...body, twist: 0.0, hipTwist: 0.0, crouch: -0.4, lean: 0.44, step: 0.46, back: 0.36, width: 0.22 })),
        K(1.05, B({ ...body, twist: 0.85, hipTwist: 0.35, crouch: -0.36, lean: 0.4, step: 0.46, back: 0.36, width: 0.22 })),
      ],
      main: lowReap,
      impacts: [lowHit],
      chamber: -0.1,
      fx: [
        fx(hitAt(lowReap, 1), 'soulfire', 'tip', 0.8),
        fx(lowHit, 'soulfire', 'tip', 1.2),
        fx(lowHit, 'wisps', 'tip', 0.8),
        fx(hitAt(lowReap, 3), 'soulfire', 'tip', 0.8),
        fx(0.95, 'soulfire', 'tip', 0.6),
      ],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Soul Hook: the scythe swung up over the shoulder and flung at them overhand; a chain of
    // souls reaches out, and the reaper hauls it back in
    ab: mv({
      keys: [
        K(-0.6, B({ ...body, lean: -0.3, twist: -0.5, crouch: -0.04 })),
        K(0.85, B({ ...body, lean: 0.36, twist: 0.2, crouch: -0.2, step: 0.42 })),
        K(1.35, B({ ...body, lean: -0.1, twist: -0.3, crouch: -0.24, step: 0.36, back: 0.34 })),
        K(1.7, B({ ...body, lean: 0.06, twist: -0.28, crouch: -0.14 })),
      ],
      main: seq(
        [
          [-0.6, 1.0, arc([-0.1, 0.45, 0.15], -0.1, [[-0.2, 0.55, -0.8], [-0.1, 1, 0.1], [0, 0.45, 0.9], [0.03, 0.12, 1]], 0.35)],
          [1.0, 1.7, arc([-0.12, 0.3, 0.15], -0.1, [[0.03, 0.12, 1], [0.2, 0.7, 0.5]], 0.35)],
        ],
        0.08,
      ),
      impacts: [0.85],
      start: -0.6,
      chamber: -0.1,
      end: 1.0,
      rest: 1.7,
      settle: 0.7,
      fx: [fx(0.85, 'chain', 'tip', 10), fx(0.85, 'wisps', 'tip', 1.0), fx(1.35, 'wisps', 'tip', 0.6)],
      trail: { life: 0.2, glow: 0.6 },
    }),
  },
  // Ring entrance, Out of the Mist: fog rolls in and the reaper rises out of it bent double with its
  // back turned, turns slowly to face them with the blade dragged one-handed along the floor in green
  // fire, then whirls once round under the scythe raised flat overhead and comes down into guard
  entrance: mv({
    keys: [
      // sunk in the mist, rising, turned away
      K(0.0, B({ ...body, lift: -1.05, crouch: -0.3, lean: 0.85, twist: 0.2, side: 0.12, headPitch: 0.6 }), { spin: 0.42 }),
      K(0.1, B({ ...body, lift: -0.9, crouch: -0.3, lean: 0.8, twist: 0.2, side: 0.12, headPitch: 0.6 })),
      K(0.22, B({ ...body, lift: -0.4, crouch: -0.22, lean: 0.5, twist: 0.15, side: 0.06, headPitch: 0.45 })),
      K(0.34, B({ ...body, lift: 0.04, crouch: -0.1, lean: 0.2, twist: 0.05, headPitch: 0.25 })),
      // the slow turn to face them, the head leading
      K(0.4, B({ ...body, lift: 0.04, crouch: -0.12, lean: 0.24, twist: 0.0, headPitch: 0.2 }), { spin: 0.42 }),
      K(0.52, B({ ...body, lift: 0.04, crouch: -0.14, lean: 0.28, twist: -0.7, hipTwist: 0.0, headPitch: 0.1 }), { spin: 0.3 }),
      K(0.66, B({ ...body, lift: 0.03, crouch: -0.14, lean: 0.26, twist: -0.4, headPitch: 0.0 }), { spin: 0.0 }),
      // one whirl round under the raised scythe
      K(0.72, B({ ...body, lift: 0.08, crouch: -0.04, lean: -0.08, twist: 0.0, headPitch: -0.15 }), { spin: 0.0 }),
      K(0.8, B({ ...body, lift: 0.22, crouch: 0.0, lean: -0.1, twist: 0.0, side: 0.06, headPitch: -0.1 }), { spin: -0.55 }),
      K(0.86, B({ ...body, lift: 0.14, crouch: -0.04, lean: 0.0, twist: -0.1, headPitch: -0.05 }), { spin: -1 }),
      K(0.97, body),
    ],
    main: keyed([
      [0.0, [-0.34, 0.08, 0.0], [-0.15, 0.6, -0.8], [-0.4, 0.0, -0.2], NaN],
      [0.3, [-0.34, 0.06, 0.02], [-0.2, 0.2, -1], [0, -1, 0], NaN],
      // dragged along the floor, trailing behind on the right
      [0.4, [-0.36, -0.08, 0.02], [-0.25, -0.75, -0.6], [-0.7, -0.5, 0.2], NaN],
      [0.66, [-0.4, -0.06, 0.08], [-0.6, -0.75, -0.15], [-0.4, -0.5, 0.7], NaN],
      // raised flat over the head, the blade pointing out ahead
      [0.74, [-0.12, 0.98, 0.14], [-1, 0.08, 0.1], [0, -0.2, 1], -0.5],
      [0.86, [-0.12, 0.98, 0.14], [-1, 0.08, 0.1], [0, -0.2, 1], -0.5],
      [0.97, [-0.18, 0.1, 0.22], [0.3, 0.85, 0.45], [0.2, -0.2, 1], 0.45],
    ]),
    free: track([
      [0.0, [0.3, 0.2, 0.2]],
      [0.34, [0.34, 0.26, 0.28]],
      [0.5, [0.38, 0.3, 0.34]],
      [0.66, [0.34, 0.3, 0.3]],
    ]),
    lead: 0,
    ghosts: [0.74, 0.88],
    fx: [
      fx(0.0, 'fog', 'root', 1.6),
      fx(0.12, 'fog', 'root', 1.0),
      fx(0.26, 'wisps', 'root', 0.8),
      fx(0.4, 'soulfire', 'tip', 0.7),
      fx(0.47, 'soulfire', 'tip', 0.8),
      fx(0.5, 'wisps', 'tip', 0.7),
      fx(0.55, 'soulfire', 'tip', 0.9),
      fx(0.63, 'soulfire', 'tip', 0.8),
      fx(0.75, 'whirl', 'root', 1.1, BLOOD),
      fx(0.8, 'wisps', 'tip', 0.8, BLOOD),
      fx(0.84, 'whirl', 'root', 0.8, BLOOD),
      fx(0.9, 'wisps', 'tip', 0.6),
    ],
  }),
};
