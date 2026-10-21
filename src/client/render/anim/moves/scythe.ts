/**
 * Reaper, scythe. Every cut is a reap: the shaft turns about a point between the hands and the
 * hips do the sweeping, so the blade hooks round and draws back toward the reaper. A twirl before
 * the reverse cut, a long spin that brings the blade round after three quarters of a turn, an
 * executioner's cut from overhead, green fire along the ground, and a chain of souls flung out to
 * drag them in.
 */
import { B, K, P, Style, X, arc, circle, fx, hitAt, line, mv, seq } from '../author';
import type { V3 } from '../author';

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
};
