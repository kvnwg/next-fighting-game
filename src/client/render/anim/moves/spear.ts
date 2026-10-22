/**
 * Lancer, glaive. A broad blade on a long pole, worked the way the reference player works it: the
 * right hand holds the shaft a third of the way up from the butt, and the left hand slides along it,
 * up toward the blade for the guard and the sweeps, back against the right hand for the long
 * thrusts, and behind it when the blade comes round on the right. Every blow is driven from the
 * ground: the front foot steps or the stance widens first, the hips turn, the trunk follows them,
 * and the arms and the long shaft come last. A stepping thrust, a rising cut and a thrust out of
 * it, a flat sweep at the waist, a one-handed cut over the top into a deep lunge, a cleave from
 * over the left shoulder, the glaive raised overhead and driven down and round into a low thrust,
 * the overhead twirl that drops into two full turns at the ankles, a long side-on lunge out of the
 * dash, a charge that rips the blade up from the floor, a backhand sweep and a wheel over the top
 * while giving ground, a cut from overhead and a plunge into the floor from the air, and the Pole
 * Vault out of reach. Lightning crackles along the glaive through every heavy.
 */
import { B, K, N, P, Style, X, arc, circle, fx, line, mv, seq, track } from '../author';
import type { BodyPose, Motion, V3 } from '../author';

// the guard of the reference: left foot forward, the body turned right so the left shoulder leads,
// the right fist low at the right hip, the left forward up the shaft and the blade at their face
const ST = -0.6;
const body = B({ front: 'L', step: 0.3, back: 0.3, width: 0.16, crouch: -0.2, lean: 0.1, twist: ST, hipTwist: -0.4 });
const b = (o: Partial<BodyPose>) => B({ ...body, ...o });
const UPE: V3 = [0, 1, 0];
/** this fighter's arms are 1.125x the reference arm, so a real spread of the hands is 1/ARM in pose units */
const ARM = 1.125;
/** the left hand's spread from the right along the shaft (real metres): + toward the blade, - toward the butt */
const SP = 0.45;

/**
 * The glaive keyed along s in body space: [s, the right hand (it holds the grip), the shaft's
 * direction, the left hand's spread (NaN: let go, one-handed), the edge for a straight move].
 * Between keys whose directions differ the shaft turns about the point between the hands (its
 * edge leading); between keys that point the same way it slides straight (thrusts, with the left
 * hand sliding along it). Held before the first key and after the last.
 */
type GK = [number, V3, V3, number?, V3?];
const spread = (k: GK) => k[3] ?? SP;
const half = (k: GK) => (Number.isFinite(spread(k)) ? spread(k) / (2 * ARM) : 0);
const mid = (k: GK): V3 => {
  const d = N(k[2]);
  const o = half(k);
  return [k[1][0] + d.x * o, k[1][1] + d.y * o, k[1][2] + d.z * o];
};
const glaive = (ks: GK[], blend = 0.05): Motion => {
  const parts: [number, number, Motion][] = [];
  const hold = (k: GK, from: number, to: number, edge: V3) => parts.push([from, to, line(k[1], k[1], k[2], k[2], edge, spread(k), spread(k), { body: true })]);
  let edge: V3 = ks[0][4] ?? UPE;
  hold(ks[0], ks[0][0] - 10, ks[0][0], edge);
  for (let i = 1; i < ks.length; i++) {
    const a = ks[i - 1];
    const c = ks[i];
    const da = N(a[2]);
    const dc = N(c[2]);
    if (da.angleTo(dc) < 0.2) {
      edge = c[4] ?? a[4] ?? edge;
      parts.push([a[0], c[0], line(a[1], c[1], a[2], c[2], edge, spread(a), spread(c), { body: true })]);
    } else {
      parts.push([a[0], c[0], arc(mid(a), -half(a), [a[2], c[2]], spread(a), { body: true, pivot1: mid(c) })]);
      // the edge the arc ends on (its direction of travel), carried into whatever holds after it
      const t = da.clone().cross(dc).normalize().cross(dc).normalize();
      edge = [t.x, t.y, t.z];
    }
  }
  const last = ks[ks.length - 1];
  hold(last, last[0], last[0] + 10, edge);
  return seq(parts, blend);
};

const G_R: V3 = [-0.25, 0.2, 0.1];
const G_DIR: V3 = [0.16, 0.3, 0.94];
const G: GK = [0, G_R, G_DIR, SP];
const at = (s: number, k: GK): GK => [s, k[1], k[2], k[3], k[4]];

const BOLT = '#ffe27a'; // the golden lightning that crackles along the glaive through the heavies

// Piercing Step: drawn back along its line to the right hip, then driven out at their chest as the
// front foot stamps, the left hand sliding back down the shaft to meet the right
const pierce = glaive([
  at(-0.3, G),
  [-0.08, [-0.33, 0.2, -0.12], [0.1, 0.12, 1], 0.4],
  [0.45, [-0.3, 0.29, 0.4], [0.1, 0.15, 1], 0.15],
  [1.07, [-0.33, 0.29, 0.43], [0.1, 0.13, 1], 0.15],
]);

// Rising Fang: the blade dropped low at the right and ripped up through them, then drawn straight
// back and thrust level
const fang = glaive([
  at(-0.3, G),
  [-0.08, [-0.35, 0.28, -0.03], [-0.45, -0.35, 0.8], 0.3],
  [0.4, [-0.28, 0.25, 0.2], [0.05, 0.45, 0.9], 0.4],
  [0.65, [-0.3, 0.23, 0.0], [0.1, 0.12, 1], 0.35],
  [0.9, [-0.3, 0.29, 0.38], [0.1, 0.14, 1], 0.15],
  [1.1, [-0.3, 0.29, 0.4], [0.1, 0.13, 1], 0.15],
]);

// Flat Sweep: the blade dropped low at the left, the shaft laid across the hips, then swept flat
// across them at the waist from their left to their right
const sweep = glaive([
  at(-0.9, G),
  [-0.5, [-0.23, 0.25, 0.15], [0.7, -0.35, 0.6], 0.5],
  [-0.12, [-0.2, 0.12, 0.25], [0.95, -0.12, 0.15], 0.5],
  [0.45, [-0.3, 0.25, 0.15], [0.05, 0.06, 1], 0.45],
  [0.75, [-0.15, 0.28, 0.35], [-0.45, 0.08, 0.9], 0.45],
  [1.07, [0.05, 0.32, 0.4], [-0.7, 0.1, 0.7], 0.45],
]);

// Lunging Cut: raised up the right side, the left hand letting go and thrown out for balance, then
// the glaive brought over the top in the right hand alone and laid out level into a deep lunge
const H_END: GK = [1.07, [-0.1, 0.25, 0.78], [0.05, -0.25, 0.97], NaN];
const lunge = glaive([
  at(-1.0, G),
  [-0.55, [-0.18, 0.28, 0.23], [-0.15, 0.95, 0.2], SP],
  [-0.12, [-0.3, 0.85, -0.05], [-0.2, 0.85, -0.45], NaN],
  [0.05, [-0.28, 0.85, 0.1], [-0.1, 0.95, 0.3], NaN],
  [0.22, [-0.2, 0.62, 0.45], [-0.05, 0.55, 0.85], NaN],
  [0.45, [-0.12, 0.33, 0.78], [0.0, 0.05, 1], NaN],
  H_END,
]);

// Cross Cleave: the left hand back on the shaft and the blade cocked high over the left shoulder,
// then cleaved down across them from their upper left to the floor at their right
const H1_END: GK = [1.07, [-0.4, 0.23, 0.0], [-0.45, -0.3, 0.85], 0.35];
const cross = glaive([
  [-1.0, H_END[1], H_END[2], NaN],
  [-0.6, [-0.05, 0.45, 0.3], [0.2, 0.75, 0.2], SP],
  [-0.12, [0.0, 0.45, 0.33], [0.35, 0.8, -0.45], 0.4],
  [0.2, [-0.28, 0.35, 0.08], [0.1, 0.45, 0.9], 0.4],
  [0.45, [-0.38, 0.23, 0.08], [-0.15, 0.05, 1], 0.4],
  H1_END,
]);

// Thunderclap: the left hand lets go and takes the shaft again behind the right, the glaive is
// raised flat overhead with the blade out to the right, then brought down and round in the right
// hand while the left lets go once more and takes it again up toward the blade, and it is driven
// into a low thrust
const splitter = glaive([
  at(-1.4, H1_END),
  [-1.2, [-0.15, 0.5, 0.15], [-0.6, 0.3, 0.6], NaN],
  [-1.0, [-0.05, 0.68, 0.3], [-0.95, -0.15, 0.15], -0.5],
  [-0.55, [-0.06, 0.55, 0.32], [-0.95, 0.0, 0.1], -0.5],
  [-0.12, [-0.08, 0.45, 0.32], [-0.95, 0.1, 0.05], -0.5],
  [0.0, [-0.15, 0.55, 0.3], [-0.85, 0.0, 0.5], NaN],
  [0.2, [-0.33, 0.33, 0.03], [-0.4, -0.05, 0.9], 0.3],
  [0.45, [-0.33, 0.25, 0.35], [0.1, 0.2, 1], 0.3],
  [1.07, [-0.38, 0.23, 0.38], [0.12, 0.02, 1], 0.3],
]);
// the left hand's way round: from the cleave to its hold behind the right, and from there forward
const splitterFree = track([
  [-1.4, [-0.4, 0.2, 0.35]],
  [-1.2, [0.2, 0.6, 0.3]],
  [-1.0, [0.4, 0.8, 0.1]],
  [-0.12, [0.42, 0.6, 0.1]],
  [0.0, [0.4, 0.55, 0.15]],
  [0.2, [-0.2, 0.3, 0.5]],
]);

// Whirlwind: twirled one-handed flat over the head, dropped to the ankles, and swept round low
const whirl = seq(
  [
    [-1.6, -0.85, arc([-0.28, 0.88, 0.16], -0.15, circle([0, 0, 1], [-1, -0.28, 0], 1.25, 0, 14), NaN)],
    [-0.85, -0.45, line([-0.28, 0.76, 0.22], [-0.28, 0.14, 0.26], [0, 0, 1], [-0.05, -0.28, 1], UPE, NaN, NaN, { body: true })],
    [-0.45, 1.9, line([-0.28, 0.14, 0.26], [-0.28, 0.14, 0.26], [-0.05, -0.28, 1], [-0.05, -0.28, 1], UPE, NaN, NaN, { body: true })],
  ],
  0.08,
);

// Serpent Lunge: turned side-on and drawn back along its line, then shot out level at full
// stretch, both hands slid back together near the butt
const serpent = glaive([
  [-0.4, [-0.3, 0.2, -0.05], [0.08, 0.08, 1], 0.3],
  [-0.1, [-0.33, 0.2, -0.08], [0.08, 0.08, 1], 0.3],
  [0.45, [-0.35, 0.3, 0.43], [0.08, 0.1, 1], 0.1],
  [1.07, [-0.35, 0.3, 0.45], [0.08, 0.08, 1], 0.1],
]);

// Rising Dragon: the left hand drops behind the right and the blade trails low behind on the right
// through the charge, swung round at the floor and ripped up through them
const dragon = glaive([
  at(-1.0, G),
  [-0.8, [-0.3, 0.2, 0.1], [-0.3, -0.1, 0.9], NaN],
  [-0.6, [-0.38, 0.12, 0.0], [-0.5, -0.25, -0.6], -0.3],
  [-0.12, [-0.4, 0.2, 0.03], [-0.6, -0.3, 0.45], -0.3],
  [0.45, [0.12, 0.3, 0.45], [-0.35, 0.35, 0.87], -0.35],
  [1.07, [-0.1, 0.48, 0.3], [0.25, 0.9, 0.35], -0.35],
]);
const dragonFree = track([
  [-1.0, [-0.19, 0.32, 0.48]],
  [-0.8, [0.0, 0.25, 0.3]],
  [-0.6, [-0.16, 0.21, 0.22]],
]);

// Parting Sweep: the left hand lets go and the right swings the blade out wide on the right, the
// left takes the shaft again up toward the blade and the two sweep it back across them to their
// left while the feet give ground
const parting = glaive([
  at(-0.2, G),
  [-0.06, [-0.43, 0.33, -0.03], [-0.85, 0.0, 0.5], NaN],
  [0.22, [-0.25, 0.33, -0.08], [-0.4, 0.05, 0.9], 0.35],
  [0.45, [-0.28, 0.38, 0.1], [0.05, 0.08, 1], 0.35],
  [1.07, [-0.2, 0.3, 0.23], [0.75, 0.05, 0.65], 0.4],
]);
const partingFree = track([
  [-0.2, [-0.19, 0.32, 0.48]],
  [-0.06, [0.35, 0.3, 0.25]],
  [0.22, [-0.1, 0.3, 0.4]],
]);

// Wheel Retreat: the blade raised straight up in front, wheeled back over the head and cocked high
// over the left shoulder, then brought down across them as the feet give ground
const wheel = glaive([
  at(-1.4, G),
  [-1.0, [-0.23, 0.35, 0.25], [0.05, 1, 0.15]],
  [-0.6, [0.0, 0.73, 0.2], [0.8, 0.3, -0.5]],
  [-0.12, [0.0, 0.58, 0.1], [0.47, 0.73, -0.52]],
  [0.15, [-0.15, 0.48, 0.42], [0.05, 0.5, 0.85]],
  [0.45, [-0.33, 0.28, 0.05], [-0.1, 0.1, 1]],
  [1.07, [-0.35, 0.4, -0.05], [-0.45, -0.35, 0.8], 0.35],
]);

// Skywheel: in the air the glaive raised flat overhead with the blade out to the left, the body
// rolled away from it, then swept round at their chest and on across to the right
const skywheel = glaive([
  [-0.6, [-0.2, 0.88, 0.15], [0.95, 0.1, 0.2], 0.5],
  [-0.15, [-0.2, 0.83, 0.18], [0.95, 0.15, -0.05], 0.5],
  [0.45, [-0.35, 0.38, 0.05], [-0.05, 0.0, 1], 0.45],
  [0.75, [-0.15, 0.36, 0.35], [-0.4, 0.03, 0.9], 0.45],
  [1.07, [0.08, 0.32, 0.42], [-0.7, 0.05, 0.7], 0.45],
]);

// Skyfall Plunge: in the air the glaive turned blade-down in both hands raised high, then the body
// drops after it and it is plunged down into the floor in front
const plunge = glaive([
  at(-1.0, G),
  [-0.5, [-0.15, 0.85, 0.15], [0.05, -0.95, 0.25]],
  [-0.12, [-0.12, 0.85, 0.15], [0.0, -0.89, 0.45]],
  [0.45, [-0.35, 0.78, 0.25], [0.15, -0.55, 0.82], 0.3],
  [1.1, [-0.35, 0.78, 0.3], [0.15, -0.6, 0.79], 0.3],
]);

// Execution, Lightning Spike: the glaive presented upright, then twirled flat over the head in the
// right hand, the blade whipping past their face; caught in both hands, turned and drawn back high
// by the right ear with the blade aimed down at their chest while the bolt strikes it; then the step,
// the drop and the drive that runs them through, held, and wrenched out and stood upright
const EXEC_HIT = 2.15;
const EX_AIM: V3 = [0.12, -0.62, 0.78];
const EX_HIT_DIR: V3 = [0.22, -0.3, 0.93];
const EX_HIT_R: V3 = [-0.3, 0.74, 0.22];
const EX_AIM_R: V3 = [-0.36, 0.84, -0.4];
const execGlaive = seq(
  [
    [0.0, 0.3, line(G_R, [-0.23, 0.28, 0.28], G_DIR, [0.05, 1, 0.12], UPE, SP, 0.5, { body: true })],
    [0.3, 0.5, line([-0.23, 0.28, 0.28], [-0.25, 0.62, 0.22], [0.05, 1, 0.12], [0.0, 0.25, 1], UPE, 0.5, NaN, { body: true })],
    // flat over the head in the right hand: forward, round the right, behind, the left, forward again
    [0.5, 1.08, arc([-0.22, 0.86, 0.18], -0.15, circle([0, -0.22, 1], [-1, -0.1, 0], 1.25, 0, 14), NaN, { body: true })],
    [1.08, 1.2, line([-0.25, 0.84, 0.05], [-0.34, 0.82, -0.32], [0.0, -0.1, -1], EX_AIM, UPE, NaN, NaN, { body: true })],
    // loaded high by the right ear like a harpoon, the left arm pointing it at them, the weight
    // rocking further back
    [1.2, 1.62, line([-0.34, 0.82, -0.32], EX_AIM_R, EX_AIM, EX_AIM, UPE, NaN, NaN, { body: true })],
    // the drive: down its line in the right hand alone, the left arm flung back against it
    [1.62, 1.95, line(EX_AIM_R, [-0.33, 0.8, -0.05], EX_AIM, [0.18, -0.42, 0.89], UPE, NaN, NaN, { body: true })],
    [1.95, EXEC_HIT, line([-0.33, 0.8, -0.05], EX_HIT_R, [0.18, -0.42, 0.89], EX_HIT_DIR, UPE, NaN, NaN, { body: true })],
    // pinned: pressed on through
    [EXEC_HIT, 2.45, line(EX_HIT_R, [-0.26, 0.72, 0.3], EX_HIT_DIR, [0.2, -0.34, 0.92], UPE, NaN, NaN, { body: true })],
    // the left hand takes the shaft and it is wrenched back out along its line and swung up to stand upright at his right side
    [2.45, 2.62, line([-0.26, 0.72, 0.3], [-0.28, 0.6, -0.05], [0.2, -0.34, 0.92], [0.1, -0.3, 0.95], UPE, 0.4, 0.4, { body: true })],
    [2.62, 2.8, line([-0.28, 0.6, -0.05], [-0.28, 0.25, 0.23], [0.1, -0.3, 0.95], [0.05, 1, 0.1], UPE, 0.4, 0.5, { body: true })],
    [2.8, 4.0, line([-0.28, 0.25, 0.23], [-0.28, 0.25, 0.23], [0.05, 1, 0.1], [0.05, 1, 0.1], UPE, 0.5, 0.5, { body: true })],
  ],
  0.05,
);

// Entrance: planted upright beside the kneeling body where the bolt struck, wrenched out, twirled
// once in both hands across the front, then raised and its butt spike slammed into the floor
const UPRIGHT: V3 = [0.04, 1, 0.08];
const IN_PLANT: V3 = [-0.42, 0.28, 0.22];
const IN_LIFT: V3 = [-0.36, 0.6, 0.3];
const IN_RAISE: V3 = [-0.3, 0.62, 0.32];
const IN_SLAM: V3 = [-0.3, 0.16, 0.32];
const IN_STAND: V3 = [-0.32, 0.04, 0.3];
// the twirl's plane leans back, so the blade passes low in front and high behind the head
const TWIRL_UP: V3 = [0, 0.7, -0.72];
const entranceSpear = seq(
  [
    [0.0, 0.34, line(IN_PLANT, [-0.42, 0.27, 0.22], UPRIGHT, UPRIGHT, [1, 0, 0], NaN, NaN, { body: true })],
    [0.34, 0.42, line(IN_PLANT, IN_LIFT, UPRIGHT, [0.1, 1, 0.1], [1, 0, 0], NaN, NaN, { body: true })],
    [0.42, 0.47, line(IN_LIFT, [-0.1, 0.62, 0.42], [0.1, 1, 0.1], TWIRL_UP, [1, 0, 0], -0.3, -0.6, { body: true })],
    [0.47, 0.65, arc([-0.1, 0.5, 0.3], 0.3, circle(TWIRL_UP, [-1, 0, 0], 1, 0, 12), -0.6, { body: true })],
    [0.65, 0.71, line([-0.1, 0.62, 0.42], IN_RAISE, TWIRL_UP, UPRIGHT, [1, 0, 0], -0.6, -0.45, { body: true })],
    [0.71, 0.76, line(IN_RAISE, IN_SLAM, UPRIGHT, UPRIGHT, [1, 0, 0], -0.45, -0.45, { body: true })],
    [0.76, 0.82, line(IN_SLAM, IN_STAND, UPRIGHT, UPRIGHT, [1, 0, 0], -0.45, NaN, { body: true })],
    [0.82, 0.9, line(IN_STAND, [-0.32, 0.04, 0.3], UPRIGHT, UPRIGHT, [1, 0, 0], NaN, NaN, { body: true })],
    [0.9, 1.0, line([-0.32, 0.04, 0.3], G_R, UPRIGHT, G_DIR, UPE, NaN, SP, { body: true })],
  ],
  0.025,
);

const GUARD_KEY = (s: number) => K(s, body);

export const spear: Style = {
  axis: 'x',
  offAxis: 'x',
  trail: { light: '#e0fbff', heavy: '#2ce8f5', special: '#ff4a3a' },
  sparks: ['#ffffff', '#bff8ff', '#2ce8f5'],
  guard: P(body, X(G_R, G_DIR, UPE, 'x', SP, ST)),
  // the shaft held level across the chest in both fists, the blade out to the left
  block: P(b({ crouch: -0.24, twist: -0.3, hipTwist: -0.3, lean: 0.05, step: 0.28, back: 0.34, width: 0.18 }), X([-0.25, 0.5, 0.3], [1, 0.2, 0.06], [0, 1, 0.3], 'x', 0.5, -0.3)),
  moves: {
    // Piercing Step: the weight back and the body wound further right as it is drawn back, then
    // the front foot stamps, the hips and trunk unwind behind it and the arms drive it out at
    // their chest
    l0: mv({
      keys: [
        GUARD_KEY(-0.3),
        K(-0.08, b({ twist: -1.0, hipTwist: -0.6, lean: -0.05, crouch: -0.26, step: 0.24, back: 0.42, headPitch: 0.05 })),
        K(0.45, b({ twist: -0.7, hipTwist: -0.25, lean: 0.42, crouch: -0.36, step: 0.72, back: 0.48 })),
        K(1.07, b({ twist: -0.8, hipTwist: -0.3, lean: 0.45, crouch: -0.36, step: 0.72, back: 0.48 })),
      ],
      main: pierce,
      impacts: [0.45],
      start: -0.3,
      fx: [fx(0.4, 'dust', 'feet', 0.5), fx(0.45, 'sparkle', 'tip', 0.6)],
    }),
    // Rising Fang: wound right and sunk low with the blade dropped at the right, then the hips lift
    // and turn and it rips up through them; the hands draw it straight back and the front foot
    // stamps for a level thrust
    l1: mv({
      keys: [
        GUARD_KEY(-0.3),
        K(-0.08, b({ twist: -1.3, hipTwist: -0.7, lean: 0.25, crouch: -0.36, step: 0.26, back: 0.44, side: 0.08 })),
        K(0.4, b({ twist: -1.1, hipTwist: -0.5, lean: 0.2, crouch: -0.28, step: 0.5, back: 0.46, headPitch: -0.05 })),
        K(0.65, b({ twist: -1.1, hipTwist: -0.6, lean: 0.1, crouch: -0.3, step: 0.45, back: 0.46 })),
        K(0.9, b({ twist: -0.8, hipTwist: -0.3, lean: 0.4, crouch: -0.36, step: 0.75, back: 0.5 })),
        K(1.1, b({ twist: -0.8, hipTwist: -0.3, lean: 0.38, crouch: -0.34, step: 0.75, back: 0.5 })),
      ],
      main: fang,
      impacts: [0.4, 0.9],
      start: -0.3,
      end: 1.1,
      fx: [fx(0.4, 'sparkle', 'tip', 0.5), fx(0.85, 'dust', 'feet', 0.4), fx(0.9, 'sparkle', 'tip', 0.7)],
    }),
    // Flat Sweep: the stance widens and the body winds left over the blade laid low at the left,
    // then the hips drive round to the right, the trunk follows and it is swept flat across them
    l2: mv({
      keys: [
        GUARD_KEY(-0.9),
        K(-0.5, b({ twist: -0.3, hipTwist: -0.2, lean: 0.15, crouch: -0.3, width: 0.2 })),
        K(-0.12, b({ twist: 0.1, hipTwist: 0.1, lean: 0.15, crouch: -0.36, width: 0.22, step: 0.28, back: 0.36 })),
        K(0.45, b({ twist: -1.0, hipTwist: -0.55, lean: 0.3, crouch: -0.36, width: 0.22, step: 0.42, back: 0.4 })),
        K(1.07, b({ twist: -0.65, hipTwist: -0.6, lean: 0.2, crouch: -0.32, width: 0.2, step: 0.42, back: 0.4 })),
      ],
      main: sweep,
      impacts: [0.45],
      start: -0.9,
      chamber: -0.12,
      blendIn: 0.35,
      fx: [fx(0.3, 'dust', 'feet', 0.6), fx(0.45, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Lunging Cut: the weight back and the body arched as the glaive rises up the right side and
    // the left arm is flung out; the right foot steps through into the deepest lunge and the right
    // arm brings it over the top and lays it out level at them, the left arm thrown back
    h: mv({
      keys: [
        GUARD_KEY(-1.0),
        K(-0.55, b({ twist: -0.3, hipTwist: -0.25, lean: 0.0, crouch: -0.2, step: 0.28, back: 0.34 })),
        K(-0.12, b({ twist: -0.9, hipTwist: -0.5, lean: -0.15, side: -0.12, crouch: -0.24, step: 0.2, back: 0.42, headPitch: -0.08 })),
        K(0.08, b({ front: 'R', twist: -0.3, hipTwist: -0.05, lean: 0.25, crouch: -0.3, step: 0.15, back: 0.2 })),
        K(0.45, b({ front: 'R', twist: 0.6, hipTwist: 0.3, lean: 0.75, crouch: -0.5, step: 0.9, back: 0.6, width: 0.18 })),
        K(1.07, b({ front: 'R', twist: 0.4, hipTwist: 0.3, lean: 0.75, crouch: -0.5, step: 0.9, back: 0.6, width: 0.18 })),
      ],
      main: lunge,
      // the free arm flung out to the left for balance, then thrown back as the right arm lays it out
      free: track([
        [-0.55, [0.3, 0.3, 0.3]],
        [-0.12, [0.62, 0.45, 0.22]],
        [0.15, [0.6, 0.35, 0.0]],
        [0.45, [0.42, 0.2, -0.38]],
        [1.07, [0.4, 0.18, -0.36]],
      ]),
      impacts: [0.45],
      start: -1.0,
      chamber: -0.12,
      blendIn: 0.35,
      fx: [fx(0.3, 'dust', 'feet', 0.8), fx(0.45, 'flashline', 'tip', 1.1, BOLT), fx(0.45, 'sparkle', 'tip', 1.0), fx(0.5, 'stomp', 'feet', 0.6)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    // Cross Cleave: out of the lunge the left hand takes the shaft again and the body rises and
    // winds left with the blade cocked over the left shoulder, then the hips drive back right, the
    // trunk bows after them and it is cleaved down across them
    h1: mv({
      keys: [
        K(-1.0, b({ front: 'R', twist: 0.4, hipTwist: 0.3, lean: 0.75, crouch: -0.5, step: 0.9, back: 0.6, width: 0.18 })),
        K(-0.6, b({ front: 'R', twist: 0.3, hipTwist: 0.2, lean: 0.2, crouch: -0.3, step: 0.55, back: 0.45 })),
        K(-0.12, b({ front: 'R', twist: 0.3, hipTwist: 0.35, lean: -0.1, crouch: -0.24, step: 0.5, back: 0.4, headPitch: -0.08 })),
        K(0.2, b({ front: 'R', twist: -0.2, hipTwist: 0.0, lean: 0.2, crouch: -0.35, step: 0.7, back: 0.5 })),
        K(0.45, b({ front: 'R', twist: -0.8, hipTwist: -0.35, lean: 0.55, crouch: -0.45, step: 0.85, back: 0.55, width: 0.2 })),
        K(1.07, b({ front: 'R', twist: -1.1, hipTwist: -0.5, lean: 0.55, crouch: -0.45, step: 0.85, back: 0.55, width: 0.2 })),
      ],
      main: cross,
      free: track([
        [-1.0, [0.4, 0.18, -0.36]],
        [-0.8, [0.3, 0.5, 0.2]],
      ]),
      impacts: [0.45],
      start: -1.0,
      chamber: -0.12,
      blendIn: 0.3,
      fx: [fx(0.3, 'dust', 'feet', 0.8), fx(0.45, 'flashline', 'tip', 1.1, BOLT), fx(0.45, 'sparkle', 'tip', 0.9, BOLT), fx(0.85, 'quake', 'tip', 0.9)],
      trail: { life: 0.22, glow: 0.6 },
    }),
    // Thunderclap: the body rises tall and winds right as the glaive goes up flat overhead with
    // the blade out to the right; then the front foot strides out, the hips turn back to the left,
    // the trunk drops after them and it is driven down and round into a low thrust with a thunderclap
    h2: mv({
      keys: [
        K(-1.4, b({ front: 'R', twist: -1.1, hipTwist: -0.5, lean: 0.55, crouch: -0.45, step: 0.85, back: 0.55, width: 0.2 })),
        K(-1.0, b({ twist: -0.6, hipTwist: -0.3, lean: -0.05, crouch: -0.1, step: 0.25, back: 0.28, headPitch: -0.12 })),
        K(-0.55, b({ twist: -0.9, hipTwist: -0.5, lean: -0.08, crouch: -0.06, step: 0.22, back: 0.32, headPitch: -0.15 })),
        K(-0.12, b({ twist: -1.05, hipTwist: -0.7, lean: -0.1, crouch: -0.1, step: 0.2, back: 0.4, headPitch: -0.1 })),
        K(0.2, b({ twist: -1.0, hipTwist: -0.45, lean: 0.2, crouch: -0.3, step: 0.55, back: 0.5 })),
        K(0.45, b({ twist: -0.93, hipTwist: -0.3, lean: 0.5, crouch: -0.5, step: 0.9, back: 0.6, width: 0.2 })),
        K(1.07, b({ twist: -1.0, hipTwist: -0.35, lean: 0.55, crouch: -0.5, step: 0.9, back: 0.6, width: 0.2 })),
      ],
      main: splitter,
      free: splitterFree,
      impacts: [0.45],
      start: -1.4,
      chamber: -0.12,
      blendIn: 0.3,
      settle: 0.45,
      ghosts: [-0.1, 0.5],
      fx: [
        fx(-1.0, 'whirl', 'root', 0.8, BOLT),
        fx(0.3, 'stomp', 'feet', 0.8),
        fx(0.45, 'flashline', 'tip', 1.2, BOLT),
        fx(0.45, 'sparkle', 'tip', 1.2, BOLT),
        fx(0.62, 'shockwave', 'tip', 1.1, BOLT),
        fx(0.62, 'bolt', 'tip', 0.8),
      ],
      trail: { life: 0.26, glow: 0.8 },
    }),
    // Whirlwind: the glaive twirled flat over the head in one hand, then down into a crouch with it
    // level at the ankles for two full turns; jump it
    sp: mv({
      keys: [
        K(-1.6, b({ crouch: -0.12, lean: -0.05, twist: 0.2, hipTwist: 0 }), { spin: 0 }),
        K(-1.0, b({ crouch: -0.06, lean: -0.1, twist: -0.2, hipTwist: 0, headPitch: -0.12 }), { spin: 0 }),
        K(-0.6, b({ front: 'R', twist: -0.2, hipTwist: 0, crouch: -0.4, lean: 0.3, step: 0.2, back: 0.24, width: 0.24 }), { spin: -0.1 }),
        K(0.55, b({ front: 'R', twist: -0.1, hipTwist: 0, crouch: -0.42, lean: 0.32, step: 0.2, back: 0.24, width: 0.24 }), { spin: -1 }),
        K(1.6, b({ front: 'R', twist: -0.1, hipTwist: 0, crouch: -0.34, lean: 0.24, step: 0.24, back: 0.26, width: 0.22 }), { spin: -2 }),
        K(1.9, b({ crouch: -0.18, lean: 0.12 }), { spin: -2 }),
      ],
      main: whirl,
      // the free arm thrown up and out for balance through the twirl and the turns
      free: track([
        [-1.6, [0.3, 0.2, 0.2]],
        [-1.2, [0.6, 0.62, 0.1]],
        [-0.6, [0.66, 0.45, 0.12]],
        [1.5, [0.66, 0.45, 0.12]],
        [1.9, [0.34, 0.2, 0.2]],
      ]),
      impacts: [0.45],
      start: -1.6,
      chamber: -1.5,
      flow: 1.3,
      blendIn: 0.3,
      end: 1.6,
      rest: 1.9,
      settle: 0.6,
      fx: [
        fx(-1.4, 'whirl', 'main', 0.8, '#bff8ff'),
        fx(-0.5, 'stomp', 'feet', 0.7),
        fx(-0.2, 'whirl', 'root', 1.0, '#bff8ff'),
        fx(0.0, 'quake', 'tip', 0.8),
        fx(0.45, 'quake', 'tip', 1.2),
        fx(0.45, 'whirl', 'root', 1.3, '#2ce8f5'),
        fx(1.0, 'quake', 'tip', 0.8),
      ],
      trail: { life: 0.26, glow: 0.7 },
    }),
    // Serpent Lunge: out of the dash the body turns side-on and the glaive is drawn back along its
    // line, then the front foot shoots out into the longest lunge and both arms drive it out level
    dl: mv({
      keys: [
        K(-0.4, b({ twist: -1.05, hipTwist: -0.7, crouch: -0.3, lean: 0.35, step: 0.45, back: 0.45 })),
        K(-0.1, b({ twist: -1.3, hipTwist: -0.85, crouch: -0.36, lean: 0.3, step: 0.4, back: 0.5 })),
        K(0.45, b({ twist: -0.8, hipTwist: -0.55, crouch: -0.5, lean: 0.5, step: 0.95, back: 0.62, width: 0.18 })),
        K(1.07, b({ twist: -0.8, hipTwist: -0.55, crouch: -0.5, lean: 0.48, step: 0.95, back: 0.62, width: 0.18 })),
      ],
      main: serpent,
      impacts: [0.45],
      start: -0.4,
      chamber: -0.1,
      blendIn: 0.4,
      ghosts: [-0.1, 0.5],
      fx: [fx(-0.3, 'dust', 'feet', 0.8), fx(0.45, 'flashline', 'tip', 1.1, BOLT), fx(0.45, 'sparkle', 'tip', 0.8)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Rising Dragon: a running charge with the left hand behind the right and the blade trailing low
    // behind on the right; the last stride plants, the hips whip round to the left, the body rises
    // behind them and it is ripped up off the floor through them
    dh: mv({
      keys: [
        K(-1.0, b({ twist: -0.7, crouch: -0.25, lean: 0.35, step: 0.35, back: 0.35 }), { hop: 0 }),
        K(-0.8, b({ front: 'R', twist: -0.8, crouch: -0.22, lean: 0.42 }), { hop: 0.08 }),
        K(-0.6, b({ twist: -0.8, hipTwist: -0.5, crouch: -0.28, lean: 0.4, step: 0.4, back: 0.4 }), { hop: 0 }),
        K(-0.36, b({ front: 'R', twist: -0.8, hipTwist: -0.4, crouch: -0.26, lean: 0.4 }), { hop: 0.08 }),
        K(-0.12, b({ twist: -0.83, hipTwist: -0.55, crouch: -0.42, lean: 0.4, step: 0.6, back: 0.5 }), { hop: 0 }),
        K(0.45, b({ twist: 0.6, hipTwist: 0.35, crouch: -0.3, lean: 0.35, step: 0.85, back: 0.5 }), { hop: 0.05 }),
        K(1.07, b({ twist: -0.4, hipTwist: 0.2, crouch: -0.12, lean: 0.0, step: 0.75, back: 0.55, headPitch: -0.15 }), { hop: 0 }),
      ],
      main: dragon,
      free: dragonFree,
      impacts: [0.45],
      start: -1.0,
      chamber: -0.12,
      blendIn: 0.3,
      travel: 0.3,
      ghosts: [-0.4, 0.6],
      fx: [
        fx(-0.8, 'dust', 'feet', 0.7),
        fx(-0.36, 'dust', 'feet', 0.7),
        fx(-0.15, 'quake', 'tip', 0.9),
        fx(0.45, 'flashline', 'tip', 1.4, BOLT),
        fx(0.45, 'sparkle', 'tip', 1.1, BOLT),
      ],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Parting Sweep: the rear foot steps away and the weight sinks back over it while the body winds
    // right with the blade out on the right, then the hips turn left and it is swept back across
    // their chest
    bl: mv({
      keys: [
        GUARD_KEY(-0.2),
        K(-0.06, b({ twist: -1.0, hipTwist: -0.6, lean: -0.05, crouch: -0.24, step: 0.24, back: 0.48 })),
        K(0.22, b({ twist: -1.0, hipTwist: -0.45, lean: 0.05, crouch: -0.28, step: 0.22, back: 0.56 })),
        K(0.45, b({ twist: -0.8, hipTwist: -0.25, lean: 0.1, crouch: -0.3, step: 0.22, back: 0.62 })),
        K(1.07, b({ twist: -0.3, hipTwist: 0.0, lean: -0.1, crouch: -0.32, step: 0.2, back: 0.62, headPitch: 0.06 })),
      ],
      main: parting,
      free: partingFree,
      impacts: [0.45],
      start: -0.2,
      chamber: -0.06,
      fx: [fx(0.2, 'dust', 'feet', 0.5), fx(0.45, 'sparkle', 'tip', 0.6)],
    }),
    // Wheel Retreat: stepping back, the blade raised straight up in front, wheeled back over the head
    // with the body rising and winding left, then the hips turn back right and it is brought down
    // across them as they follow
    bh: mv({
      keys: [
        GUARD_KEY(-1.4),
        K(-1.0, b({ twist: -0.8, hipTwist: -0.45, crouch: -0.2, back: 0.42, lean: 0.0 })),
        K(-0.6, b({ twist: -0.2, hipTwist: -0.1, crouch: -0.18, back: 0.5, lean: -0.05, headPitch: -0.1 })),
        K(-0.12, b({ twist: 0.72, hipTwist: 0.3, lean: -0.15, crouch: -0.22, back: 0.55, step: 0.26 })),
        K(0.45, b({ twist: -0.8, hipTwist: -0.35, lean: 0.35, crouch: -0.36, step: 0.28, back: 0.62 })),
        K(1.07, b({ twist: -1.1, hipTwist: -0.5, lean: 0.3, crouch: -0.36, step: 0.24, back: 0.62 })),
      ],
      main: wheel,
      impacts: [0.45],
      start: -1.4,
      chamber: -1.3,
      flow: 1.25,
      blendIn: 0.3,
      fx: [fx(-0.8, 'whirl', 'main', 0.7, BOLT), fx(-0.2, 'dust', 'feet', 0.7), fx(0.45, 'flashline', 'tip', 1.0, BOLT), fx(0.45, 'sparkle', 'tip', 1.0, BOLT)],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Skywheel: in the air the glaive goes up flat overhead with the blade out to the left and the
    // body rolls away from it, then it comes round at their chest as the body rolls back and turns
    jl: mv({
      keys: [
        K(-0.6, b({ twist: -0.2, hipTwist: -0.1, crouch: -0.1, lean: 0.0 }), { roll: 0, hop: 0.05 }),
        K(-0.15, b({ twist: 0.25, hipTwist: 0.1, crouch: -0.05, lean: -0.05 }), { roll: -0.09, hop: 0.3 }),
        K(0.45, b({ twist: -0.9, hipTwist: -0.4, crouch: -0.12, lean: 0.3 }), { roll: 0.02, hop: 0.25 }),
        K(1.1, b({ twist: -0.3, hipTwist: -0.3, lean: 0.3, crouch: -0.2 }), { roll: 0, hop: 0.1 }),
      ],
      main: skywheel,
      impacts: [0.45],
      start: -0.6,
      chamber: -0.15,
      blendIn: 0.3,
      fx: [fx(-0.3, 'whirl', 'root', 0.6, '#bff8ff'), fx(0.45, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.18, glow: 0.3 },
    }),
    // Skyfall Plunge: in the air the glaive is turned blade-down and both hands go up high, then the
    // whole body drops and bows after it and it is plunged down into the floor in front
    jh: mv({
      keys: [
        K(-1.0, body, { hop: 0, flip: 0 }),
        K(-0.5, b({ twist: -0.6, crouch: -0.05, lean: -0.1 }), { hop: 0.2 }),
        K(-0.12, b({ twist: -0.4, crouch: 0.0, lean: -0.2, headPitch: -0.1, step: 0.25, back: 0.25 }), { hop: 0.32, flip: -0.02 }),
        K(0.45, b({ twist: -0.93, hipTwist: -0.5, crouch: -0.55, lean: 0.25, step: 0.6, back: 0.5, width: 0.2 }), { hop: 0, flip: 0.02 }),
        K(1.1, b({ twist: -0.8, hipTwist: -0.45, crouch: -0.55, lean: 0.3, step: 0.6, back: 0.5, width: 0.2 }), { flip: 0 }),
      ],
      main: plunge,
      impacts: [0.45],
      start: -1.0,
      chamber: -0.12,
      travel: 0.3,
      blendIn: 0.35,
      fx: [fx(0.45, 'stomp', 'feet', 1.0), fx(0.45, 'sparkle', 'tip', 1.0, BOLT), fx(0.6, 'shockwave', 'tip', 1.1, BOLT)],
      trail: { life: 0.24, glow: 0.7 },
    }),
  },
  // Execution, Lightning Spike (see execGlaive): one flourish past their face, then run through
  // the chest; they are jerked upright on the shaft and fold off it
  executeReact: 'impale',
  execute: mv({
    keys: [
      K(0.0, body),
      // presenting the glaive: tall, square, looking down at them
      K(0.3, b({ twist: -0.45, hipTwist: -0.25, crouch: -0.06, lean: 0.0, step: 0.24, back: 0.26, headPitch: 0.25 })),
      // the twirl: the body rises and turns with it
      K(0.55, b({ twist: -0.2, hipTwist: -0.15, crouch: -0.03, lean: -0.05, step: 0.22, back: 0.24, headPitch: 0.1 })),
      K(0.95, b({ twist: 0.1, hipTwist: 0.0, crouch: -0.06, lean: -0.06, step: 0.22, back: 0.24, headPitch: 0.08 })),
      // caught and drawn back: the trunk winds right, the weight goes onto the rear leg
      K(1.2, b({ twist: -0.85, hipTwist: -0.5, crouch: -0.16, lean: -0.15, side: 0.05, step: 0.3, back: 0.4, headPitch: 0.14 })),
      K(1.62, b({ twist: -1.0, hipTwist: -0.6, crouch: -0.2, lean: -0.22, side: 0.06, step: 0.28, back: 0.46, headPitch: 0.16 })),
      // the front foot strides, the hips drop and turn, the trunk pitches after them
      K(1.85, b({ twist: -0.75, hipTwist: -0.25, crouch: -0.3, lean: 0.1, step: 0.55, back: 0.5, headPitch: 0.1 })),
      K(EXEC_HIT, b({ twist: -0.25, hipTwist: 0.0, crouch: -0.3, lean: 0.4, step: 0.8, back: 0.55, width: 0.18, headPitch: 0.1 })),
      K(2.45, b({ twist: -0.25, hipTwist: 0.0, crouch: -0.34, lean: 0.42, step: 0.8, back: 0.55, width: 0.18, headPitch: 0.15 })),
      // wrenched out with a push back off the front foot, and straightening tall over them
      K(2.62, b({ twist: -0.55, hipTwist: -0.3, crouch: -0.2, lean: 0.05, step: 0.4, back: 0.45, headPitch: 0.2 })),
      K(3.0, b({ twist: -0.6, hipTwist: -0.35, crouch: -0.1, lean: -0.02, step: 0.3, back: 0.32, headPitch: 0.1 })),
    ],
    main: execGlaive,
    // the left hand flung out for balance through the twirl, pointing at them through the aim,
    // thrown back against the drive, and onto the shaft to wrench it out
    free: track([
      [0.45, [-0.12, 0.62, 0.3]],
      [0.6, [0.55, 0.5, 0.2]],
      [1.0, [0.6, 0.5, 0.1]],
      // pointing the blade at them through the aim
      [1.25, [0.6, 0.52, 0.28]],
      [1.62, [0.6, 0.5, 0.3]],
      // flung back as the right arm drives it in, then forward to take the shaft
      [1.95, [0.55, 0.38, 0.0]],
      [EXEC_HIT, [0.42, 0.22, -0.36]],
      [2.4, [0.4, 0.2, -0.34]],
      [2.5, [0.1, 0.4, 0.4]],
    ]),
    impacts: [0.95, EXEC_HIT],
    start: 0,
    chamber: 0.5,
    end: 2.62,
    rest: 3.0,
    ghosts: [1.75, 2.2],
    fx: [
      fx(0.3, 'sparkle', 'tip', 0.7, BOLT),
      fx(0.55, 'whirl', 'main', 0.9, BOLT),
      fx(0.95, 'flashline', 'tip', 0.8, BOLT),
      fx(1.3, 'bolt', 'tip', 1.0),
      fx(1.32, 'sparkle', 'tip', 1.0, BOLT),
      fx(1.35, 'embers', 'root', 0.7, BOLT),
      fx(1.85, 'stomp', 'feet', 0.9),
      fx(EXEC_HIT, 'flashline', 'tip', 1.6, BOLT),
      fx(EXEC_HIT, 'bolt', 'tip', 1.2),
      fx(EXEC_HIT, 'sparkle', 'tip', 1.3, BOLT),
      fx(EXEC_HIT + 0.02, 'shockwave', 'feet', 1.1, BOLT),
      fx(2.5, 'embers', 'tip', 0.8, BOLT),
      fx(2.78, 'dust', 'feet', 0.8),
      fx(2.8, 'shockwave', 'feet', 0.6, BOLT),
    ],
    trail: { life: 0.28, glow: 0.9 },
  }),
  // Pole Vault: the butt planted, a backflip over the glaive, and a landing well out of reach
  leap: mv({
    keys: [
      K(0.0, b({ crouch: -0.3, lean: 0.2 }), { flip: 0, hop: 0 }),
      K(0.18, b({ crouch: -0.05, lean: -0.1 }), { flip: -0.08, hop: 0.35 }),
      K(0.5, b({ crouch: 0.0, lean: -0.1 }), { flip: -0.5, hop: 1.1 }),
      K(0.82, b({ crouch: -0.05, lean: 0.05 }), { flip: -0.95, hop: 0.45 }),
      K(1.0, b({ crouch: -0.3, lean: 0.25 }), { flip: -1, hop: 0 }),
    ],
    main: seq(
      [
        // the glaive planted point-up behind the hands, then carried tight through the flip
        [0.0, 0.3, line([-0.15, 0.4, 0.3], [-0.2, 0.55, 0.15], [0.1, -0.85, 0.5], [0.1, 0.9, 0.3], UPE, 0.4, 0.4, { body: true })],
        [0.3, 1.0, line([-0.2, 0.55, 0.15], G_R, [0.1, 0.9, 0.3], G_DIR, UPE, 0.4, SP, { body: true })],
      ],
      0.08,
    ),
    impacts: [0.5],
    start: 0,
    rest: 1,
    ghosts: [0.1, 0.9],
    fx: [fx(0.05, 'dust', 'feet', 1.0), fx(0.98, 'dust', 'feet', 0.9)],
    trail: { life: 0.2, glow: 0.4 },
  }),
  // Entrance: revealed kneeling where the lightning struck, head bowed and the glaive planted beside
  // him; he wrenches it free, twirls it once across his front, and slams the butt spike down
  entrance: mv({
    keys: [
      K(0.0, b({ front: 'R', twist: -0.35, hipTwist: 0, crouch: -0.5, lean: 0.34, step: 0.34, back: 0.36, width: 0.22, headPitch: 0.45 })),
      K(0.3, b({ front: 'R', twist: -0.35, hipTwist: 0, crouch: -0.51, lean: 0.36, step: 0.34, back: 0.36, width: 0.22, headPitch: 0.5 })),
      K(0.37, b({ front: 'R', twist: -0.3, hipTwist: 0, crouch: -0.3, lean: 0.14, step: 0.3, back: 0.3, width: 0.18, headPitch: 0.1 })),
      K(0.44, b({ front: 'R', twist: -0.2, hipTwist: 0, crouch: -0.14, lean: 0.0, step: 0.26, back: 0.26, width: 0.16, headPitch: -0.04 })),
      K(0.56, b({ front: 'R', twist: -0.05, hipTwist: 0, crouch: -0.16, lean: 0.02, step: 0.26, back: 0.26, width: 0.16 })),
      K(0.65, b({ front: 'R', twist: -0.25, hipTwist: 0, crouch: -0.14, lean: 0.0, step: 0.26, back: 0.26, width: 0.16 })),
      K(0.71, b({ front: 'R', twist: -0.3, hipTwist: 0, crouch: -0.06, lean: -0.08, step: 0.24, back: 0.24, width: 0.16, headPitch: -0.06 })),
      K(0.76, b({ front: 'R', twist: -0.3, hipTwist: 0, crouch: -0.22, lean: 0.12, step: 0.28, back: 0.28, width: 0.2, headPitch: 0.04 })),
      K(0.82, b({ front: 'R', twist: -0.3, hipTwist: 0, crouch: -0.03, lean: -0.06, step: 0.22, back: 0.22, width: 0.16, headPitch: -0.12 })),
      K(0.9, b({ twist: -0.4, hipTwist: -0.2, crouch: -0.06, lean: -0.02, step: 0.24, back: 0.24, width: 0.16, headPitch: -0.12 })),
      K(1.0, body),
    ],
    main: entranceSpear,
    // the left hand braced on the knee, then on the shaft for the twirl and slam, then a fist at the hip
    free: track([
      [0.0, [0.22, -0.02, 0.36]],
      [0.34, [0.22, -0.02, 0.36]],
      [0.42, [0.28, 0.2, 0.2]],
      [0.8, [0.26, 0.2, 0.2]],
      [0.86, [0.28, 0.02, 0.04]],
      [0.95, [0.28, 0.02, 0.04]],
    ]),
    lead: 0,
    ghosts: [0.47, 0.65],
    fx: [
      fx(0.02, 'bolt', 'root', 1.4),
      fx(0.02, 'shockwave', 'root', 0.8, BOLT),
      fx(0.04, 'dust', 'feet', 1.4),
      fx(0.2, 'sparkle', 'tip', 0.6, BOLT),
      fx(0.38, 'dust', 'feet', 0.8),
      fx(0.5, 'sparkle', 'tip', 0.8, BOLT),
      fx(0.56, 'bolt', 'tip', 0.5),
      fx(0.62, 'sparkle', 'tip', 0.8, BOLT),
      fx(0.76, 'shockwave', 'feet', 1.2, BOLT),
      fx(0.76, 'bolt', 'root', 1.0),
      fx(0.77, 'embers', 'root', 0.8, BOLT),
    ],
  }),
};
