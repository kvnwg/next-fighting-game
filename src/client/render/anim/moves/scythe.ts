/**
 * Wraith, chain sickle (kusarigama). The sickle rides in the right hand by the ring of its chain
 * and every blow throws it: the right arm drives it out along the line of the cast and the chain
 * pays out after it, so a move is authored as the line the sickle flies along, swept round through
 * the windup so the chain whips in before the throw lands in front of the Wraith. An overhand cast
 * from the right shoulder, a dart cast punched out from beside the ear, a turn that slings it out on the spin, a
 * vertical cast from over the head, a lasso whirled at the side and thrown straight, a leaping turn
 * that brings it down on them, a diving throw, a rising backhand out of the dash, a flick on the
 * retreat, a whirl over the head while drifting away, a cartwheel in the air, a somersault that
 * drops it on them, a wheel at the side sunk into a sweep along the ground in green fire, and a
 * chain of souls flung out to drag them in.
 */
import { B, K, P, Style, X, arc, circle, fx, hitAt, line, mv, seq, track } from '../author';
import type { Motion, V3 } from '../author';

const body = B({ front: 'L', step: 0.18, back: 0.2, width: 0.11, crouch: -0.07, lean: 0.08, twist: -0.3 });
const SOUL = '#63c74d';

/** The right shoulder: casts turn about it, the arm driving the chain out along the throw. */
const SH: V3 = [-0.28, 0.48, 0.04];

/** A cast: the hand rides `r` out along the line of the throw from the pivot, so the arm extends with it. */
const cast = (dirs: V3[], r = 0.42, pivot: V3 = SH, opts: { pivot1?: V3; edgeSign?: number } = {}): Motion => arc(pivot, r, dirs, NaN, opts);

/** A whirl: the sickle swung round on a short chain by the wrist, in the plane of u and v. */
const whirl = (pivot: V3, u: V3, v: V3, turns: number, startDeg = 0, r = 0.12, pivot1?: V3): Motion =>
  arc(pivot, r, circle(u, v, turns, startDeg, Math.ceil(Math.abs(turns) * 10)), NaN, { pivot1 });

// Overhand Cast: flung up over the right shoulder with the arm raised high, then the arm comes
// over the top and drives straight out at them at shoulder height, the chain following it out
const overhand = cast([[-0.32, 0.78, -0.54], [-0.22, 1, 0.02], [-0.1, 0.62, 0.78], [-0.02, 0.14, 1], [0.2, -0.02, 0.98], [0.42, -0.12, 0.9]], 0.42, SH, { edgeSign: -1 });
const overhandHit = hitAt(overhand, 3);

// Dart Cast: the hand cocked up beside the ear with the sickle hanging down the back, then the arm
// punches straight out and up at their head, the sickle whipped over the hand and away along it
const dart = cast([[0.5, -0.62, -0.6], [0.05, 0.25, -0.97], [-0.12, 0.98, -0.1], [-0.06, 0.62, 0.78], [0, 0.02, 1], [0.06, -0.1, 0.99], [0.12, -0.18, 0.98]], 0.16, [-0.22, 0.64, -0.08], { pivot1: [-0.2, 0.6, 0.42], edgeSign: -1 });
const dartHit = hitAt(dart, 4);

// Vertical cast: raised straight up over the head, then over the top and down out onto them
const vertical = cast([[-0.12, 0.93, -0.35], [-0.08, 1, 0.05], [-0.05, 0.8, 0.6], [-0.02, 0.45, 0.89], [0, 0.2, 0.98], [0.03, 0.02, 1], [0.06, -0.12, 0.99]], 0.44, [-0.24, 0.54, 0.02]);
const verticalHit = hitAt(vertical, 4);

// Lasso: whirled flat at the right side, then thrown dead straight, the arm reaching after it
const LASSO_HIT = 0.45;
const lasso = seq(
  [
    [-1.4, -0.15, whirl([-0.42, 0.32, 0.12], [0, 0.12, 1], [-1, 0.12, 0], -1.5, 0, 0.14, [-0.44, 0.4, 0.06])],
    [-0.15, LASSO_HIT, line([-0.44, 0.4, 0.06], [-0.2, 0.5, 0.52], [0, 0.12, 1], [0, 0.2, 1], [0, -1, 0])],
    [LASSO_HIT, 1.07, line([-0.2, 0.5, 0.52], [-0.3, 0.42, 0.2], [0, 0.2, 1], [-0.15, 0.32, 0.94], [0, -1, 0])],
  ],
  0.1,
);

// Heaven's Fall: held high and swung round over the head through the leap, then brought down on them
const fall = seq(
  [
    [-1.6, -0.25, whirl([-0.1, 0.95, 0.05], [0, 0.35, 1], [-1, 0.35, 0], -1.25, 0, 0.1)],
    [-0.25, 1.07, cast([[0, 0.35, 1], [-0.05, 0.95, 0.3], [-0.02, 0.85, 0.55], [0, 0.5, 0.87], [0.02, 0.3, 0.95], [0.05, 0.15, 0.98]], 0.42, [-0.16, 0.58, 0.04])],
  ],
  0.12,
);
const fallHit = hitAt(fall, 3, 1);

// Drift: held back at the right hip, then thrown straight ahead like a spear as the body dives
const DRIFT_HIT = 0.45;
const drift = seq(
  [
    [-0.4, DRIFT_HIT, line([-0.36, 0.12, -0.22], [-0.12, 0.52, 0.5], [-0.1, 0.35, 0.93], [-0.02, 0.62, 0.79], [0, -1, 0])],
    [DRIFT_HIT, 1.07, line([-0.12, 0.52, 0.5], [-0.2, 0.42, 0.3], [-0.02, 0.62, 0.79], [0.2, 0.5, 0.84], [0, -1, 0])],
  ],
  0.08,
);

// Soul Rend: from low behind the left hip, rising across them and away up to the right
const rend = cast([[0.65, -0.45, -0.6], [0.95, -0.3, 0.05], [0.6, 0.12, 0.79], [0.02, 0.5, 0.86], [-0.5, 0.7, 0.5], [-0.75, 0.62, 0.2]], 0.34, [-0.04, 0.36, 0.1]);
const rendHit = hitAt(rend, 3);

// Mournful Flick: a short forehand snap from the right, flat at the waist, the arm drawn back after
const flick = cast([[-0.95, -0.15, -0.3], [-0.85, -0.18, 0.5], [-0.02, -0.3, 1], [0.5, -0.3, 0.86], [0.6, -0.15, 0.5]], 0.36, [-0.24, 0.36, 0.1], { pivot1: [-0.22, 0.4, -0.06] });
const flickHit = hitAt(flick, 2);

// Grave Wind: whirled flat over the head, the circle tipping forward until it flies out at them
const GRAVE_HIT = 0.45;
const graveWind = seq(
  [
    [-1.4, 0.05, whirl([-0.12, 1.0, 0.05], [-1, 0.15, 0], [0, 0.15, 1], -1.6, 180, 0.1, [-0.14, 0.9, 0.14])],
    [0.05, GRAVE_HIT, cast([[-0.95, 0.0, 0.1], [-0.6, -0.12, 0.75], [0, -0.22, 1]], 0.36, [-0.16, 0.72, 0.1])],
    [GRAVE_HIT, 1.07, cast([[0, -0.22, 1], [0.5, -0.15, 0.85], [0.8, 0.0, 0.5]], 0.3, [-0.12, 0.6, 0.12])],
  ],
  0.1,
);

// Ghost Wheel: held up over the head through the cartwheel, then swung down round the right side
// as the body comes upright, and the turn slings it at them
const wheelAir = cast([[-0.35, 0.93, -0.1], [-0.72, 0.68, 0.15], [-0.78, 0.22, 0.58], [-0.05, 0.05, 1], [0.5, 0.0, 0.85], [0.7, -0.15, 0.6]], 0.4);
const wheelAirHit = hitAt(wheelAir, 3);

// Last Rites: held up behind through the somersault, then over and down on them as the Wraith lands
const rites = seq([
  [-1.0, 0.0, line([-0.2, 0.62, -0.05], [-0.2, 0.7, -0.15], [-0.1, 0.5, -0.86], [-0.1, 0.8, -0.6], [0, 1, 0])],
  [0.0, 1.07, cast([[-0.1, 0.8, -0.6], [-0.05, 1, 0.1], [0, 0.6, 0.8], [0, 0.42, 0.91], [0, 0.1, 1], [0.05, -0.05, 1]], 0.4, [-0.18, 0.6, 0.04])],
]);
const ritesHit = hitAt(rites, 3, 1);

// Reaping Arc: wheeled at the right side, faster and lower, then swept flat round along the ground
const reaping = seq(
  [
    [-1.6, -0.2, whirl([-0.46, 0.26, 0.08], [0, 1, 0.1], [0, 0.1, 1], 1.75, 90, 0.12, [-0.5, 0.12, 0.06])],
    [-0.2, 1.07, cast([[-0.15, 0.2, -1], [-0.95, 0.12, -0.2], [-0.75, 0.1, 0.66], [-0.02, 0.12, 1], [0.6, 0.1, 0.8], [0.9, 0.12, 0.4]], 0.3, [-0.2, 0.2, 0.12])],
  ],
  0.1,
);
const reapingHit = hitAt(reaping, 3, 1);

/** The sickle keyed along s (the entrance): straight moves between keyed grips [s, pos, dir, edge], held outside them. */
type Grip = [number, V3, V3, V3];
const keyed = (ks: Grip[], blend = 0.03): Motion => {
  const hold = (k: Grip, from: number, to: number): [number, number, Motion] => [from, to, line(k[1], k[1], k[2], k[2], k[3])];
  const parts: [number, number, Motion][] = [hold(ks[0], ks[0][0] - 1, ks[0][0])];
  for (let i = 1; i < ks.length; i++) {
    const a = ks[i - 1];
    const b = ks[i];
    parts.push([a[0], b[0], line(a[1], b[1], a[2], b[2], b[3])]);
  }
  parts.push(hold(ks[ks.length - 1], ks[ks.length - 1][0], ks[ks.length - 1][0] + 1));
  return seq(parts, blend);
};
const BLOOD = '#ff3a3a';

/** The guard: both hands low, the sickle at the right hip with its head raised toward them, the left
 * hand in front of the left hip paying out the chain. */
const GUARD_POS: V3 = [-0.3, 0.0, 0.2];
const GUARD_DIR: V3 = [-0.15, 0.48, 0.86];
const GUARD_EDGE: V3 = [0, -0.9, 0.45];
const GUARD_FREE: V3 = [0.2, 0.04, 0.24];

/**
 * The execution, Noose of Souls. s runs in seconds of the 3 s execution: the blow at EXEC_HIT
 * (2.15 s), and the chain pays out around each impact (throwOut), so the overhead lasso swells
 * out to its full length over their head at the flourish and the cast lands it on them.
 */
const EXEC_HIT = 2.15;
const EXEC_PASS = 1.38;
const noose = seq(
  [
    // let down on its chain and wheeled forward at the right side, the wrist turning it
    [0.0, 0.72, whirl([-0.36, 0.26, 0.12], [0, 1, 0.1], [0, 0.1, 1], 1, 0, 0.1, [-0.28, 0.62, 0.04])],
    // raised over the head and whirled flat, widening: right, ahead, left, behind
    [0.72, 1.62, whirl([-0.2, 0.92, 0.02], [-1, 0.14, 0], [0, 0.14, 1], 1.75, 0, 0.12, [-0.22, 0.86, -0.12])],
    // the serve: from behind the head, the elbow drives up and forward and the sickle flies over
    // the top and down onto the back of their neck
    [1.62, 2.17, cast([[0, -0.14, -1], [-0.06, 0.72, -0.69], [-0.06, 1, 0.04], [-0.02, 0.62, 0.78], [0, -0.62, 0.78], [-0.1, -0.68, 0.72]], 0.16, [-0.2, 0.74, -0.22], { pivot1: [-0.16, 0.9, -0.1] })],
    // hauled: the fist yanked down and back to the right hip, the hooked blade reaping across
    // their throat as the chain reels it in
    [2.17, 2.62, line([-0.17, 0.98, -0.08], [-0.42, 0.16, -0.04], [-0.1, -0.68, 0.72], [-0.8, -0.32, 0.5], [0, -1, 0.2])],
    // caught, one turn at the side to shake it off, and down to the guard's hold
    [2.62, 3.0, whirl([-0.36, 0.14, 0.12], [0, 0.1, 1], [0, -1, 0.1], 1, 0, 0.1, [-0.32, 0.0, 0.18])],
  ],
  0.09,
);
const nooseHit = hitAt(noose, 4, 2);

export const scythe: Style = {
  axis: '-x',
  offAxis: '-x',
  trail: { light: '#d8ffe0', heavy: SOUL, special: '#ff3a3a' },
  sparks: ['#ffffff', '#b8ffd0', SOUL],
  guard: P(body, X(GUARD_POS, GUARD_DIR, GUARD_EDGE, '-x'), null, GUARD_FREE),
  // the sickle across the chest in both hands, blade up, the chain hanging from the right
  block: P(B({ ...body, crouch: -0.12, twist: -0.1 }), X([-0.26, 0.4, 0.32], [1, 0.12, 0.05], [0, 1, 0.2], '-x', 0.42)),
  moves: {
    // Overhand Cast (the reference's main throw): coiled on the rear foot with the hips and chest
    // turned away, the throwing arm raised high and the sickle flung up behind it; the front foot
    // plants, the hips then the chest turn through, the arm comes over the top and the elbow
    // straightens out at them at shoulder height, the free arm sweeping back with the slack
    l0: mv({
      keys: [
        K(-0.15, B({ ...body, twist: -0.7, hipTwist: -0.35, lean: -0.12, crouch: -0.04, step: 0.12, back: 0.26, headPitch: -0.12 })),
        K(overhandHit + 0.1, B({ ...body, twist: 0.2, hipTwist: 0.12, lean: 0.3, crouch: -0.13, step: 0.38, back: 0.24, headPitch: 0.05 })),
        K(1.05, B({ ...body, twist: 0.45, hipTwist: 0.22, lean: 0.32, crouch: -0.14, step: 0.4, back: 0.24 })),
      ],
      main: overhand,
      free: track([
        [-0.15, [0.24, 0.08, 0.26]],
        [overhandHit, [0.42, 0.22, -0.16]],
        [1.0, [0.36, 0.14, -0.04]],
      ]),
      impacts: [overhandHit],
      fx: [fx(overhandHit, 'wisps', 'tip', 0.6)],
    }),
    // Dart Cast: the hand cocked up beside the right ear, elbow high, the sickle hanging down the
    // back; a short step in, the chest squares up and the arm punches straight out and up at their
    // head, the sickle whipping over the hand and away along the line of the arm
    l1: mv({
      keys: [
        K(-0.2, B({ ...body, twist: -0.45, hipTwist: -0.18, lean: -0.06, crouch: -0.05, step: 0.14, back: 0.24, headPitch: -0.05 })),
        K(dartHit + 0.1, B({ ...body, twist: 0.08, hipTwist: 0.06, lean: 0.22, crouch: -0.11, step: 0.34, back: 0.22, headPitch: -0.12 })),
        K(1.05, B({ ...body, twist: 0.2, hipTwist: 0.1, lean: 0.24, crouch: -0.12, step: 0.36, back: 0.22 })),
      ],
      main: dart,
      free: track([
        [-0.2, [0.22, 0.06, 0.28]],
        [dartHit, [0.26, 0.1, 0.16]],
        [1.0, [0.24, 0.06, 0.2]],
      ]),
      impacts: [dartHit],
      chamber: 0.02,
      fx: [fx(dartHit, 'flashline', 'main', 0.5, '#b8ffd0'), fx(dartHit, 'wisps', 'tip', 0.6)],
    }),
    // Gyre: a long turn to the right with the sickle swung out at arm's length; three quarters
    // round the chain flies out at them, and the turn carries it on round
    l2: mv({
      keys: [
        K(-1.6, B({ ...body, twist: 0.3, lean: 0.2, crouch: -0.13 }), { spin: 0 }),
        K(-1.0, B({ ...body, twist: 0.0, lean: 0.24, crouch: -0.16, step: 0.2, back: 0.2, width: 0.22 }), { spin: -0.15 }),
        K(0.55, B({ ...body, twist: 0.0, lean: 0.26, crouch: -0.17, step: 0.2, back: 0.2, width: 0.22, side: -0.1 }), { spin: -0.825 }),
        K(1.1, B({ ...body, twist: -0.1, lean: 0.24, crouch: -0.14, step: 0.24, back: 0.24 }), { spin: -1 }),
      ],
      main: seq([
        [-1.6, 0.45, line([-0.4, 0.42, 0.0], [-0.52, 0.42, 0.2], [-0.9, -0.05, -0.3], [-0.88, 0.22, 0.45], [0, -1, 0])],
        [0.45, 1.4, line([-0.52, 0.42, 0.2], [-0.38, 0.36, 0.22], [-0.88, 0.22, 0.45], [-0.5, 0.15, 0.85], [0, -1, 0])],
      ]),
      free: track([
        [-1.6, [0.3, 0.2, 0.25]],
        [0.0, [0.45, 0.35, 0.05]],
        [1.1, [0.32, 0.2, 0.15]],
      ]),
      impacts: [0.45],
      start: -1.6,
      chamber: -1.2,
      flow: 1.35,
      blendIn: 0.3,
      fx: [fx(-0.9, 'whirl', 'root', 0.9, '#b8ffd0'), fx(0.45, 'wisps', 'tip', 0.8)],
      trail: { life: 0.24, glow: 0.5 },
    }),
    // Execution: the free arm thrown out to the left with the slack for balance, the sickle swung
    // straight up over the head as the weight rocks back; then the front foot drives in, the body
    // folds forward from the hips and the arm brings it over the top and down out onto them
    h: mv({
      keys: [
        K(-0.2, B({ ...body, lean: -0.24, crouch: -0.04, twist: -0.22, hipTwist: -0.12, headPitch: -0.22, step: 0.16, back: 0.3, side: 0.06 })),
        K(verticalHit + 0.1, B({ ...body, lean: 0.42, crouch: -0.17, twist: 0.08, hipTwist: 0.06, step: 0.46, back: 0.3 })),
        K(1.05, B({ ...body, lean: 0.48, crouch: -0.19, twist: 0.12, hipTwist: 0.08, step: 0.48, back: 0.3, headPitch: 0.1 })),
      ],
      main: vertical,
      free: track([
        [-0.2, [0.56, 0.42, 0.12]],
        [verticalHit, [0.32, 0.12, 0.18]],
        [1.0, [0.3, 0.08, 0.2]],
      ]),
      impacts: [verticalHit],
      chamber: -0.12,
      fx: [fx(verticalHit, 'wisps', 'tip', 1.4), fx(verticalHit + 0.05, 'soulfire', 'tip', 0.8), fx(verticalHit, 'shake', 'root', 0.5)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    // Severance: up out of the fold, the sickle whirled flat as a lasso at the right side, then
    // thrown dead straight at them with the arm reaching after it, and reeled back
    h1: mv({
      keys: [
        K(-1.4, B({ ...body, lean: 0.4, crouch: -0.17, twist: -0.2 })),
        K(-0.2, B({ ...body, twist: -0.7, hipTwist: -0.3, lean: 0.02, crouch: -0.09, side: 0.06 })),
        K(LASSO_HIT + 0.1, B({ ...body, twist: 0.05, hipTwist: 0.05, lean: 0.24, crouch: -0.14, step: 0.48, side: -0.06 })),
        K(1.05, B({ ...body, twist: -0.25, hipTwist: -0.1, lean: 0.08, crouch: -0.12, step: 0.4, back: 0.32 })),
      ],
      main: lasso,
      free: track([
        [-1.4, [0.3, 0.12, 0.2]],
        [-0.2, [0.3, 0.3, 0.3]],
        [LASSO_HIT, [0.32, 0.18, 0.0]],
        [1.0, [0.22, 0.16, 0.28]],
      ]),
      impacts: [LASSO_HIT],
      start: -1.4,
      chamber: -0.2,
      blendIn: 0.25,
      fx: [fx(-0.8, 'whirl', 'root', 0.6, '#b8ffd0'), fx(LASSO_HIT, 'flashline', 'main', 0.8, SOUL), fx(LASSO_HIT, 'wisps', 'tip', 1.0)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    // Requiem: crouched, then springing up into a turn to the left with the sickle swung round over
    // the head, and down on them as the Wraith lands
    h2: mv({
      keys: [
        K(-1.6, B({ ...body, twist: -0.4, hipTwist: -0.2, lean: 0.3, crouch: -0.21, width: 0.22 }), { spin: 0, hop: 0 }),
        K(-1.1, B({ ...body, twist: -0.2, lean: 0.05, crouch: -0.04 }), { spin: 0.12, hop: 0.2 }),
        K(-0.5, B({ ...body, twist: 0.0, lean: -0.2, crouch: 0.0, headPitch: -0.2 }), { spin: 0.65, hop: 0.45 }),
        K(-0.1, B({ ...body, twist: -0.1, lean: -0.3, crouch: -0.01, headPitch: -0.2 }), { spin: 0.95, hop: 0.35 }),
        K(fallHit + 0.1, B({ ...body, twist: 0.0, lean: 0.58, crouch: -0.23, step: 0.5, back: 0.34 }), { spin: 1, hop: 0 }),
        K(1.3, B({ ...body, twist: 0.0, lean: 0.55, crouch: -0.23, step: 0.5, back: 0.34 })),
        K(1.6, B({ ...body, lean: 0.3, crouch: -0.13 })),
      ],
      main: fall,
      free: track([
        [-1.6, [0.25, 0.05, 0.3]],
        [-0.5, [0.45, 0.4, 0.0]],
        [fallHit, [0.3, 0.2, 0.25]],
        [1.3, [0.3, 0.1, 0.2]],
      ]),
      impacts: [fallHit],
      start: -1.6,
      chamber: -1.0,
      flow: 1.4,
      blendIn: 0.3,
      lead: 0.05,
      end: 1.3,
      rest: 1.6,
      settle: 0.6,
      fx: [
        fx(-1.15, 'dust', 'feet', 0.8),
        fx(-0.8, 'whirl', 'root', 1.0, '#b8ffd0'),
        fx(fallHit, 'wisps', 'tip', 1.2),
        fx(fallHit, 'soulfire', 'tip', 0.9),
        fx(fallHit, 'shockwave', 'tip', 0.8),
        fx(fallHit + 0.05, 'stomp', 'feet', 0.8),
      ],
      trail: { life: 0.26, glow: 0.7 },
    }),
    // Drift Reap: diving in low with the sickle held back at the hip, thrown straight out ahead of
    // the dive like a spear, the left arm reaching with it
    dl: mv({
      keys: [
        K(-0.4, B({ ...body, twist: -0.75, hipTwist: -0.3, lean: 0.45, crouch: -0.18, side: -0.08 })),
        K(DRIFT_HIT + 0.1, B({ ...body, twist: 0.05, hipTwist: 0.0, lean: 0.62, crouch: -0.23, step: 0.52, back: 0.4 })),
        K(1.05, B({ ...body, twist: 0.25, hipTwist: 0.1, lean: 0.5, crouch: -0.2, step: 0.48, back: 0.38 })),
      ],
      main: drift,
      free: track([
        [-0.4, [0.36, 0.42, 0.42]],
        [DRIFT_HIT, [0.32, 0.38, 0.38]],
        [1.1, [0.3, 0.2, 0.15]],
      ]),
      impacts: [DRIFT_HIT],
      start: -0.4,
      chamber: -0.3,
      ghosts: [-0.3, 0.7],
      fx: [fx(-0.2, 'smoke', 'feet', 0.8), fx(DRIFT_HIT, 'flashline', 'main', 0.7, '#b8ffd0'), fx(DRIFT_HIT, 'wisps', 'tip', 0.7)],
      trail: { life: 0.2, glow: 0.4 },
    }),
    // Soul Rend: surging in wound round to the left, the sickle low behind the left hip, then a
    // rising backhand cast up across them that tears the ground open beneath it
    dh: mv({
      keys: [
        K(-0.2, B({ ...body, twist: 1.0, hipTwist: 0.4, lean: 0.4, crouch: -0.2, side: 0.12 })),
        K(rendHit + 0.1, B({ ...body, twist: 0.0, hipTwist: 0.0, lean: 0.5, crouch: -0.2, step: 0.5, back: 0.38 })),
        K(1.05, B({ ...body, twist: -0.8, hipTwist: -0.3, lean: 0.1, crouch: -0.09, side: -0.1, headPitch: -0.15 })),
      ],
      main: rend,
      free: track([
        [-0.2, [0.4, 0.1, -0.1]],
        [rendHit, [0.36, 0.22, 0.1]],
        [1.0, [0.38, 0.3, 0.05]],
      ]),
      impacts: [rendHit],
      chamber: -0.1,
      ghosts: [-0.15, 0.75],
      fx: [
        fx(-0.15, 'smoke', 'feet', 1.0),
        fx(hitAt(rend, 1), 'quake', 'tip', 0.8),
        fx(hitAt(rend, 2), 'soulfire', 'tip', 0.8),
        fx(rendHit, 'soulfire', 'tip', 1.2),
        fx(rendHit, 'wisps', 'tip', 1.2),
        fx(rendHit, 'shake', 'root', 0.5),
      ],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Mournful Step: the weight rocking back onto the rear foot, a short forehand flick from the
    // right snapped out at their waist and drawn in again as the Wraith gives ground
    bl: mv({
      keys: [
        K(-0.15, B({ ...body, twist: -0.75, hipTwist: -0.25, lean: 0.2, crouch: -0.09 })),
        K(flickHit + 0.1, B({ ...body, twist: 0.05, hipTwist: 0.05, lean: -0.28, crouch: -0.14, back: 0.42, step: 0.16, side: 0.06, headPitch: 0.2 })),
        K(1.05, B({ ...body, twist: 0.4, hipTwist: 0.15, lean: -0.34, crouch: -0.16, back: 0.44, step: 0.14, headPitch: 0.3 })),
      ],
      main: flick,
      free: track([
        [-0.15, [0.3, 0.25, 0.3]],
        [flickHit, [0.4, 0.3, -0.05]],
        [1.0, [0.3, 0.2, 0.15]],
      ]),
      impacts: [flickHit],
      fx: [fx(0.0, 'smoke', 'feet', 0.9), fx(flickHit, 'wisps', 'tip', 0.6)],
    }),
    // Grave Wind: swaying back with the sickle whirled flat over the head; the circle tips toward
    // them and it flies out at their head
    bh: mv({
      keys: [
        K(-1.4, B({ ...body, twist: 0.1, lean: 0.0, crouch: -0.07, headPitch: -0.2 })),
        K(-0.6, B({ ...body, twist: -0.15, lean: -0.28, crouch: -0.09, side: 0.08, headPitch: -0.3, back: 0.4 })),
        K(GRAVE_HIT + 0.1, B({ ...body, twist: 0.0, lean: -0.12, crouch: -0.14, side: -0.04, headPitch: -0.1, back: 0.46, step: 0.16 })),
        K(1.05, B({ ...body, twist: 0.35, lean: -0.3, crouch: -0.16, back: 0.46, step: 0.14 })),
      ],
      main: graveWind,
      free: track([
        [-1.4, [0.3, 0.3, 0.2]],
        [-0.6, [0.45, 0.45, 0.0]],
        [GRAVE_HIT, [0.4, 0.3, 0.05]],
        [1.0, [0.3, 0.2, 0.15]],
      ]),
      impacts: [GRAVE_HIT],
      start: -1.4,
      chamber: -1.3,
      flow: 1.3,
      blendIn: 0.3,
      fx: [fx(-1.2, 'smoke', 'feet', 0.8), fx(-0.9, 'whirl', 'root', 0.8, '#b8ffd0'), fx(-0.3, 'whirl', 'root', 1.0, '#b8ffd0'), fx(GRAVE_HIT, 'wisps', 'tip', 1.0)],
      trail: { life: 0.26, glow: 0.6 },
    }),
    // Ghost Wheel: a cartwheel in the air, the sickle held up over the head and the free arm flung
    // wide; coming upright it swings down round the right side and the turn slings it out at them
    jl: mv({
      keys: [
        K(-0.9, B({ ...body, twist: -0.3, lean: 0.0, crouch: -0.03 }), { roll: 0, hop: 0.1 }),
        K(-0.3, B({ ...body, twist: -0.5, lean: 0.1, crouch: -0.07, side: 0.1 }), { roll: -0.55, hop: 0.3 }),
        K(wheelAirHit + 0.1, B({ ...body, twist: 0.0, lean: 0.3, crouch: -0.1, side: -0.05 }), { roll: -1, hop: 0.1 }),
        K(1.05, B({ ...body, twist: 0.5, hipTwist: 0.2, lean: 0.34, crouch: -0.13, side: -0.1 }), { roll: -1, hop: 0 }),
      ],
      main: wheelAir,
      free: track([
        [-0.9, [0.56, 0.36, 0.05]],
        [wheelAirHit, [0.46, 0.3, 0.0]],
        [1.0, [0.3, 0.2, 0.15]],
      ]),
      impacts: [wheelAirHit],
      start: -0.9,
      chamber: -0.85,
      flow: 1.2,
      blendIn: 0.25,
      ghosts: [-0.6, 0.5],
      fx: [fx(wheelAirHit, 'wisps', 'tip', 0.7)],
      trail: { life: 0.2, glow: 0.4 },
    }),
    // Last Rites: a somersault in the air with the sickle held up behind, then thrown over and down
    // onto them as the Wraith lands, the ground cracking under it
    jh: mv({
      keys: [
        K(-1.0, B({ ...body, lean: -0.1, crouch: -0.07 }), { flip: 0, hop: 0 }),
        K(-0.6, B({ ...body, lean: 0.2, crouch: -0.1 }), { flip: 0.3, hop: 0.4 }),
        K(-0.2, B({ ...body, lean: 0.1, crouch: -0.07 }), { flip: 0.8, hop: 0.5 }),
        K(0.15, B({ ...body, lean: -0.3, crouch: 0.0, headPitch: -0.1 }), { flip: 1, hop: 0.35 }),
        K(ritesHit + 0.1, B({ ...body, twist: -0.05, lean: 0.55, crouch: -0.26, step: 0.46, headPitch: 0.1 }), { hop: 0 }),
        K(1.2, B({ ...body, twist: -0.05, lean: 0.5, crouch: -0.25, step: 0.46 })),
      ],
      main: rites,
      free: track([
        [-1.0, [0.3, 0.2, 0.2]],
        [-0.2, [0.4, 0.4, 0.1]],
        [ritesHit, [0.3, 0.2, 0.25]],
      ]),
      impacts: [ritesHit],
      start: -1.0,
      chamber: 0.05,
      flow: 1.3,
      blendIn: 0.25,
      lead: 0,
      end: 1.1,
      rest: 1.08,
      fx: [fx(ritesHit, 'shockwave', 'tip', 1.0), fx(ritesHit, 'soulfire', 'tip', 1.0), fx(ritesHit, 'wisps', 'tip', 1.2), fx(ritesHit, 'stomp', 'feet', 0.7)],
      trail: { life: 0.24, glow: 0.6 },
    }),
    // Reaping Arc: the sickle wheeled at the right side, faster and lower as the Wraith sinks into a
    // wide crouch, then swept round flat along the ground at their ankles in green fire
    sp: mv({
      keys: [
        K(-1.6, B({ ...body, twist: -0.4, lean: 0.1, crouch: -0.09 })),
        K(-0.5, B({ ...body, twist: -0.9, hipTwist: -0.3, crouch: -0.14, lean: 0.2, step: 0.18, back: 0.2, width: 0.28, side: 0.1 })),
        K(reapingHit + 0.1, B({ ...body, twist: 0.0, hipTwist: 0.0, crouch: -0.17, lean: 0.36, step: 0.26, back: 0.2, width: 0.3 })),
        K(1.05, B({ ...body, twist: 0.8, hipTwist: 0.3, crouch: -0.16, lean: 0.34, step: 0.26, back: 0.2, width: 0.3 })),
      ],
      main: reaping,
      free: track([
        [-1.6, [0.3, 0.2, 0.25]],
        [-0.5, [0.38, 0.3, 0.3]],
        [reapingHit, [0.45, 0.25, 0.1]],
        [1.0, [0.35, 0.2, 0.15]],
      ]),
      impacts: [reapingHit],
      start: -1.6,
      chamber: -1.5,
      flow: 1.25,
      blendIn: 0.3,
      fx: [
        fx(-1.2, 'whirl', 'root', 0.7, BLOOD),
        fx(-0.6, 'whirl', 'root', 1.0, BLOOD),
        fx(hitAt(reaping, 2, 1), 'soulfire', 'tip', 0.8),
        fx(reapingHit, 'soulfire', 'tip', 1.2),
        fx(reapingHit, 'wisps', 'tip', 0.8),
        fx(hitAt(reaping, 4, 1), 'soulfire', 'tip', 0.8),
        fx(0.95, 'soulfire', 'tip', 0.6),
      ],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Soul Hook: the sickle swung up over the shoulder and thrown overhand straight at them; a chain
    // of souls reaches out after it, and the Wraith hauls it back in hand over hand
    ab: mv({
      keys: [
        K(-0.6, B({ ...body, lean: -0.3, twist: -0.6, crouch: -0.03 })),
        K(0.85, B({ ...body, lean: 0.36, twist: 0.05, crouch: -0.13, step: 0.44 })),
        K(1.35, B({ ...body, lean: -0.15, twist: -0.4, crouch: -0.17, step: 0.36, back: 0.38 })),
        K(1.7, B({ ...body, lean: 0.06, twist: -0.3, crouch: -0.09 })),
      ],
      main: seq(
        [
          [-0.6, 1.0, cast([[-0.25, 0.5, -0.83], [-0.2, 1, 0.05], [-0.08, 0.6, 0.8], [0, 0.28, 0.96]], 0.42)],
          [1.0, 1.7, line([-0.2, 0.6, 0.45], [-0.3, 0.1, 0.2], [0, 0.28, 0.96], [-0.12, 0.2, 1], [0, -1, 0])],
        ],
        0.08,
      ),
      free: track([
        [-0.6, [0.3, 0.4, 0.3]],
        [0.85, [0.28, 0.2, 0.15]],
        [1.2, [0.1, 0.4, 0.45]],
        [1.5, [0.2, 0.15, 0.25]],
      ]),
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
  // Ring entrance, Out of the Mist: fog rolls in and the Wraith rises out of it bent double with its
  // back turned, turns slowly to face them with the sickle dragged along the floor in green fire,
  // then whirls once round under the sickle raised over the head and comes down into guard
  entrance: mv({
    keys: [
      // sunk in the mist, rising, turned away
      K(0.0, B({ ...body, lift: -1.05, crouch: -0.2, lean: 0.85, twist: 0.2, side: 0.12, headPitch: 0.6 }), { spin: 0.42 }),
      K(0.1, B({ ...body, lift: -0.9, crouch: -0.2, lean: 0.8, twist: 0.2, side: 0.12, headPitch: 0.6 })),
      K(0.22, B({ ...body, lift: -0.4, crouch: -0.14, lean: 0.5, twist: 0.15, side: 0.06, headPitch: 0.45 })),
      K(0.34, B({ ...body, lift: 0.04, crouch: -0.07, lean: 0.2, twist: 0.05, headPitch: 0.25 })),
      // the slow turn to face them, the head leading
      K(0.4, B({ ...body, lift: 0.04, crouch: -0.08, lean: 0.24, twist: 0.0, headPitch: 0.2 }), { spin: 0.42 }),
      K(0.52, B({ ...body, lift: 0.04, crouch: -0.09, lean: 0.28, twist: -0.7, hipTwist: 0.0, headPitch: 0.1 }), { spin: 0.3 }),
      K(0.66, B({ ...body, lift: 0.03, crouch: -0.09, lean: 0.26, twist: -0.4, headPitch: 0.0 }), { spin: 0.0 }),
      // one whirl round under the raised sickle
      K(0.72, B({ ...body, lift: 0.08, crouch: -0.03, lean: -0.08, twist: 0.0, headPitch: -0.15 }), { spin: 0.0 }),
      K(0.8, B({ ...body, lift: 0.22, crouch: 0.0, lean: -0.1, twist: 0.0, side: 0.06, headPitch: -0.1 }), { spin: -0.55 }),
      K(0.86, B({ ...body, lift: 0.14, crouch: -0.03, lean: 0.0, twist: -0.1, headPitch: -0.05 }), { spin: -1 }),
      K(0.97, body),
    ],
    main: keyed([
      [0.0, [-0.34, 0.08, 0.0], [-0.15, 0.6, -0.8], [-0.4, 0.0, -0.2]],
      [0.3, [-0.34, 0.06, 0.02], [-0.2, 0.2, -1], [0, -1, 0]],
      // dragged along the floor, trailing behind on the right
      [0.4, [-0.36, -0.08, 0.02], [-0.25, -0.75, -0.6], [-0.7, -0.5, 0.2]],
      [0.66, [-0.4, -0.06, 0.08], [-0.6, -0.75, -0.15], [-0.4, -0.5, 0.7]],
      // raised over the head, the point out ahead
      [0.74, [-0.16, 0.98, 0.12], [-0.3, 0.3, 1], [0, -1, 0]],
      [0.86, [-0.16, 0.98, 0.12], [-0.3, 0.3, 1], [0, -1, 0]],
      [0.97, GUARD_POS, GUARD_DIR, GUARD_EDGE],
    ]),
    free: track([
      [0.0, [0.3, 0.2, 0.2]],
      [0.34, [0.34, 0.26, 0.28]],
      [0.5, [0.38, 0.3, 0.34]],
      [0.66, [0.34, 0.3, 0.3]],
      [0.86, [0.4, 0.45, 0.1]],
      [0.97, GUARD_FREE],
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
  // Execution, Noose of Souls: the sickle let down and wheeled at the side, raised and whirled flat
  // over the head in a widening lasso that sweeps out over them, then served over the top onto the
  // back of the neck and hauled in, reaping across the throat; they are spun round off the hook
  executeReact: 'spin',
  execute: mv({
    keys: [
      K(0.0, body),
      // drawing up tall over them, square, looking down
      K(0.35, B({ ...body, twist: -0.1, hipTwist: 0.0, crouch: -0.01, lean: -0.04, step: 0.14, back: 0.2, headPitch: 0.25 })),
      // the arm rises with the wheel, the chest opening to the right
      K(0.72, B({ ...body, twist: -0.22, hipTwist: -0.05, crouch: -0.03, lean: -0.08, step: 0.14, back: 0.22, headPitch: 0.1 })),
      // the lasso overhead: the trunk counter-sways under it, the weight settling, eyes up on it
      K(1.05, B({ ...body, twist: -0.04, hipTwist: 0.02, crouch: -0.06, lean: -0.1, side: 0.05, step: 0.16, back: 0.22, headPitch: -0.12 })),
      K(EXEC_PASS, B({ ...body, twist: 0.14, hipTwist: 0.06, crouch: -0.08, lean: -0.06, side: -0.03, step: 0.16, back: 0.22, headPitch: 0.05 })),
      // loading the serve: weight back on the rear leg, hips then chest wound right, leaning away
      K(1.66, B({ ...body, twist: -0.62, hipTwist: -0.34, crouch: -0.08, lean: -0.18, side: 0.06, step: 0.12, back: 0.3, headPitch: 0.05 })),
      // the front foot strides in and plants, the hips turn through ahead of the chest
      K(1.92, B({ ...body, twist: -0.26, hipTwist: 0.06, crouch: -0.13, lean: 0.04, step: 0.36, back: 0.26, headPitch: 0.12 })),
      K(EXEC_HIT, B({ ...body, twist: 0.16, hipTwist: 0.14, crouch: -0.14, lean: 0.06, step: 0.34, back: 0.26, headPitch: 0.22 })),
      // the haul: driven back off the front foot, hips and chest wrenched round to the right
      K(2.32, B({ ...body, twist: -0.36, hipTwist: -0.18, crouch: -0.13, lean: -0.1, step: 0.3, back: 0.36, headPitch: 0.12 })),
      K(2.62, B({ ...body, twist: -0.78, hipTwist: -0.38, crouch: -0.1, lean: -0.14, side: 0.05, step: 0.26, back: 0.34, headPitch: 0.1 })),
      // straightening tall, turning back to face what is left of them
      K(3.0, B({ ...body, twist: -0.3, crouch: -0.04, lean: 0.0, headPitch: 0.2 })),
    ],
    main: noose,
    // the slack paid out ahead, then flung wide to the left to balance the lasso, reaching at them
    // through the load, swept back by the serve, and seizing the chain to haul it in
    free: track([
      [0.0, GUARD_FREE],
      [0.4, [0.24, 0.12, 0.32]],
      [0.95, [0.56, 0.42, 0.14]],
      [EXEC_PASS, [0.58, 0.46, 0.06]],
      [1.68, [0.34, 0.5, 0.42]],
      [EXEC_HIT, [0.42, 0.22, -0.16]],
      [2.36, [0.12, 0.3, 0.36]],
      [2.62, [0.06, 0.14, 0.14]],
      [3.0, GUARD_FREE],
    ]),
    impacts: [EXEC_PASS, nooseHit],
    start: 0,
    chamber: 0.5,
    end: 2.7,
    rest: 3.0,
    ghosts: [1.8, 2.36],
    fx: [
      fx(0.05, 'smoke', 'feet', 1.0),
      fx(0.3, 'fog', 'root', 0.8),
      fx(0.45, 'soulfire', 'tip', 0.6),
      fx(0.8, 'wisps', 'tip', 0.7),
      fx(0.95, 'whirl', 'root', 1.0, '#b8ffd0'),
      fx(1.2, 'wisps', 'tip', 0.9),
      fx(EXEC_PASS, 'whirl', 'root', 1.4, SOUL),
      fx(EXEC_PASS, 'wisps', 'tip', 1.1),
      fx(1.92, 'stomp', 'feet', 0.8),
      fx(1.95, 'spiral', 'main', 0.9, SOUL),
      fx(nooseHit, 'flashline', 'main', 1.4, SOUL),
      fx(nooseHit, 'soulfire', 'tip', 1.4),
      fx(nooseHit, 'wisps', 'tip', 1.5),
      fx(nooseHit, 'shake', 'root', 0.7),
      fx(2.34, 'smoke', 'feet', 1.0),
      fx(2.45, 'flashline', 'tip', 0.9, BLOOD),
      fx(2.7, 'wisps', 'tip', 0.8, BLOOD),
      fx(2.85, 'soulfire', 'tip', 0.6),
    ],
    trail: { life: 0.3, glow: 0.9 },
  }),
};
