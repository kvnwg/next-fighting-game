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
 * while giving ground, a cut from overhead and a plunge into the floor from the air, lightning
 * called down from the sky with the glaive raised to it (Thunderstrike), and a vault clean over
 * them that drives the glaive into the ground behind him (Vault Strike). Lightning crackles along
 * the glaive through every heavy.
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

// Piercing Step: cocked high on the right, the right fist at the shoulder and the left at the chest
// behind it, the shaft a long diagonal across the body with the blade raised far out above his
// right shoulder; then brought down onto the line and driven out at their chest as the front
// foot stamps
const pierce = glaive([
  [-0.3, G_R, G_DIR, -0.3],
  [-0.08, [-0.24, 0.6, 0.28], [-0.5, 0.8, -0.3], -0.3],
  // swung upright out at his right side, so the butt drops past the outside of the hip
  [0.02, [-0.45, 0.48, 0.18], [-0.12, 0.92, 0.36], -0.3],
  [0.16, [-0.33, 0.26, -0.06], [0.1, 0.13, 1], -0.3],
  [0.45, [-0.3, 0.29, 0.4], [0.1, 0.15, 1], -0.15],
  [1.07, [-0.33, 0.29, 0.43], [0.1, 0.13, 1], -0.15],
]);

// Rising Fang: the blade dropped to the floor out at his left, the shaft slanting down across his
// front, and ripped up through them; then drawn straight back and thrust level
const fang = glaive([
  [-0.3, G_R, G_DIR, 0.35],
  [-0.08, [-0.15, 0.17, 0.28], [0.78, -0.18, 0.6], 0.35],
  [0.4, [-0.28, 0.25, 0.2], [0.05, 0.45, 0.9], 0.35],
  [0.65, [-0.3, 0.23, 0.0], [0.1, 0.12, 1], 0.35],
  [0.9, [-0.3, 0.29, 0.38], [0.1, 0.14, 1], 0.15],
  [1.1, [-0.3, 0.29, 0.4], [0.1, 0.13, 1], 0.15],
]);

// Flat Sweep: the shaft laid level across the chest with the blade out wide at his left at
// shoulder height, then swept flat across them from their left to their right
const sweep = glaive([
  at(-0.9, G),
  [-0.5, [-0.22, 0.32, 0.22], [0.75, 0.0, 0.65], 0.5],
  [-0.12, [-0.2, 0.42, 0.3], [0.92, 0.14, 0.36], 0.5],
  [0.45, [-0.3, 0.25, 0.15], [0.05, 0.06, 1], 0.45],
  [0.75, [-0.15, 0.28, 0.35], [-0.45, 0.08, 0.9], 0.45],
  [1.07, [0.05, 0.32, 0.4], [-0.7, 0.1, 0.7], 0.45],
]);

// Lunging Cut: raised straight up the right side, the blade standing high over his head in the
// right hand alone while the left is thrown out for balance, then brought over the top and laid
// out level into a deep lunge
const H_END: GK = [1.07, [-0.1, 0.22, 0.8], [0.06, -0.33, 0.94], NaN];
const lunge = glaive([
  at(-1.0, G),
  [-0.55, [-0.18, 0.28, 0.23], [-0.15, 0.95, 0.2], SP],
  [-0.12, [-0.33, 0.9, -0.2], [-0.05, 0.95, -0.3], NaN],
  [0.05, [-0.28, 0.85, 0.1], [-0.1, 0.95, 0.3], NaN],
  [0.22, [-0.2, 0.62, 0.45], [-0.05, 0.55, 0.85], NaN],
  [0.45, [-0.12, 0.33, 0.78], [0.0, 0.05, 1], NaN],
  H_END,
]);

// Cross Cleave: the left hand back on the shaft and the blade cocked high and out wide over the
// left shoulder, then cleaved down across them from their upper left to the floor at their right
const H1_END: GK = [1.07, [-0.42, 0.2, 0.0], [-0.55, -0.3, 0.78], 0.35];
const cross = glaive([
  [-1.0, H_END[1], H_END[2], NaN],
  [-0.6, [-0.05, 0.45, 0.3], [0.2, 0.75, 0.2], 0.4],
  [-0.12, [0.08, 0.55, 0.18], [0.8, 0.55, -0.25], 0.4],
  [0.2, [-0.33, 0.35, 0.15], [0.1, 0.45, 0.9], 0.4],
  [0.45, [-0.38, 0.23, 0.08], [-0.15, 0.05, 1], 0.4],
  H1_END,
]);

// Thunderclap: the left hand lets go and takes the shaft again behind the right, the glaive is
// raised flat overhead with the blade out to the right and held there, a bar laid over his head,
// then brought down and round in the right
// hand while the left lets go once more and takes it again up toward the blade, and it is driven
// into a low thrust
const splitter = glaive([
  at(-1.4, H1_END),
  [-1.2, [-0.15, 0.5, 0.15], [-0.6, 0.3, 0.6], NaN],
  [-1.0, [-0.05, 0.78, 0.3], [-0.95, 0.05, 0.2], -0.5],
  [-0.55, [-0.06, 0.74, 0.3], [-0.95, 0.15, 0.1], -0.5],
  [-0.12, [-0.1, 0.92, 0.18], [-0.9, 0.2, -0.38], -0.5],
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

// Thunderstrike: the glaive raised straight up to the sky in one hand while the other points at
// them, held there as the lightning gathers on the blade, then swung down to point at them as the
// bolt falls where they stood
const THUNDER_HIT = 0.45;
const thunder = glaive([
  [-1.6, G_R, G_DIR, SP],
  [-1.0, [-0.24, 0.95, 0.12], [0.05, 1, 0.04], NaN],
  [0.15, [-0.24, 0.98, 0.12], [0.05, 1, 0.08], NaN],
  [THUNDER_HIT, [-0.2, 0.56, 0.42], [0.05, -0.22, 1], NaN],
  [1.4, [-0.2, 0.52, 0.42], [0.05, -0.24, 1], NaN],
  [1.8, G_R, G_DIR, SP],
]);

// Vault Strike: the blade end planted ahead and the body swung up over it in a forward somersault
// with the shaft held tight to the chest, then landed in a crouch with the glaive driven down and
// back under the arm into the ground behind him, where they stand
const VAULT_HIT = 0.45;
const vault = glaive([
  [-1.0, [-0.15, 0.4, 0.3], [0.1, -0.85, 0.5], 0.4],
  [-0.55, [-0.2, 0.55, 0.15], [0.1, 0.9, 0.3], 0.4],
  [0.0, [-0.22, 0.5, 0.18], [0.1, 0.92, 0.22], 0.4],
  [VAULT_HIT, [-0.3, 0.28, -0.08], [-0.1, -0.55, -0.83], 0.3],
  [1.1, [-0.3, 0.26, -0.08], [-0.1, -0.58, -0.81], 0.3],
  [1.45, G_R, G_DIR, SP],
]);

// Serpent Lunge: turned side-on and cocked like a javelin, the right fist by the ear and the blade
// raised high out to the right while the left arm aims at them; then brought onto the line, the left
// hand takes it again, and it is shot out level at full stretch, both hands together near the butt
const serpent = glaive([
  [-0.4, [-0.3, 0.25, -0.05], [0.08, 0.08, 1], NaN],
  [-0.1, [-0.42, 0.62, -0.12], [-0.5, 0.45, 0.72], NaN],
  [0.15, [-0.36, 0.34, -0.05], [0.08, 0.1, 1], 0.2],
  [0.45, [-0.35, 0.3, 0.43], [0.08, 0.1, 1], 0.1],
  [1.07, [-0.35, 0.3, 0.45], [0.08, 0.08, 1], 0.1],
]);

// Rising Dragon: the left hand lets go and the blade trails low and wide out to the right in the
// right hand through the charge, the left arm pumping; it is swung round at the floor, the left hand
// takes the shaft behind the right, and it is ripped up through them
const dragon = glaive([
  at(-1.0, G),
  [-0.8, [-0.3, 0.2, 0.1], [-0.3, -0.1, 0.9], NaN],
  [-0.6, [-0.4, 0.15, 0.05], [-0.85, -0.2, 0.0], NaN],
  [-0.12, [-0.46, 0.2, 0.02], [-0.92, -0.1, 0.15], NaN],
  [0.2, [-0.25, 0.3, 0.25], [-0.35, 0.1, 0.93], -0.35],
  [0.45, [0.12, 0.3, 0.45], [-0.35, 0.35, 0.87], -0.35],
  [1.07, [0.0, 0.5, 0.42], [0.25, 0.9, 0.35], -0.35],
]);
const dragonFree = track([
  [-1.0, [-0.19, 0.32, 0.48]],
  [-0.8, [0.3, 0.3, 0.3]],
  [-0.6, [0.35, 0.22, -0.2]],
  [-0.36, [0.3, 0.3, 0.32]],
  [-0.12, [0.5, 0.35, 0.1]],
  [0.12, [0.1, 0.3, 0.4]],
]);

// Parting Sweep: the left hand lets go and is flung out to the left while the right swings the
// blade up and out wide on the right at head height, the
// left takes the shaft again up toward the blade and the two sweep it back across them to their
// left while the feet give ground
const parting = glaive([
  [-0.2, G_R, G_DIR, NaN],
  [-0.06, [-0.45, 0.45, -0.14], [-0.8, 0.25, 0.55], NaN],
  [0.22, [-0.25, 0.33, -0.08], [-0.4, 0.05, 0.9], 0.35],
  [0.45, [-0.28, 0.38, 0.1], [0.05, 0.08, 1], 0.35],
  [1.07, [-0.2, 0.3, 0.23], [0.75, 0.05, 0.65], 0.4],
]);
const partingFree = track([
  [-0.2, [-0.19, 0.32, 0.48]],
  [-0.06, [0.62, 0.48, 0.1]],
  [0.22, [-0.1, 0.3, 0.4]],
]);

// Wheel Retreat: the blade raised straight up in front, wheeled back over the head and cocked high
// up over the left shoulder, then brought down across them as the feet give ground
const wheel = glaive([
  at(-1.4, G),
  [-1.0, [-0.23, 0.35, 0.25], [0.05, 1, 0.15]],
  [-0.6, [0.0, 0.73, 0.2], [0.8, 0.3, -0.5]],
  [-0.12, [0.1, 0.55, 0.05], [0.55, 0.6, -0.58]],
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

// Skyfall Plunge: in the air the glaive turned blade-down in both hands raised over the head, the
// shaft slanting across the front and the blade hung out wide at his left hip, then the body drops
// after it and it is plunged down into the floor in front
const plunge = glaive([
  at(-1.0, G),
  [-0.5, [-0.18, 0.75, 0.25], [0.4, -0.75, 0.45], 0.35],
  [-0.12, [-0.16, 0.84, 0.28], [0.55, -0.7, 0.45], 0.35],
  [0.45, [-0.35, 0.78, 0.25], [0.15, -0.55, 0.82], 0.3],
  [1.1, [-0.35, 0.78, 0.3], [0.15, -0.6, 0.79], 0.3],
]);

// Execution, Lightning Spike: the glaive presented upright, then twirled flat over the head in the
// right hand, wound back round the left and whipped past their face; then drawn back as far as the
// arm reaches, high behind the right ear with the blade aimed down at their chest, and held there
// while the bolt strikes it; then the stride, the hips, the trunk and last the arm, faster and
// faster, run them through and on; held, sunk into, and wrenched out and stood upright
const EXEC_HIT = 2.15;
const EX_AIM: V3 = [0.12, -0.55, 0.83];
const EX_HIT_DIR: V3 = [0.22, -0.3, 0.93];
const EX_HIT_R: V3 = [-0.3, 0.74, 0.22];
const EX_AIM_R: V3 = [-0.28, 0.85, -0.55];
const EX_TU: V3 = [0, -0.22, 1];
const EX_TV: V3 = [-1, -0.1, 0];
const EX_PIVOT: V3 = [-0.22, 0.86, 0.18];
const execGlaive = seq(
  [
    [0.0, 0.3, line(G_R, [-0.23, 0.28, 0.28], G_DIR, [0.05, 1, 0.12], UPE, SP, 0.5, { body: true })],
    [0.3, 0.5, line([-0.23, 0.28, 0.28], [-0.25, 0.62, 0.22], [0.05, 1, 0.12], [0.0, 0.25, 1], UPE, 0.5, NaN, { body: true })],
    // flat over the head in the right hand: round the right and behind, unhurried, wound on round the
    // left, then whipped forward past their face and on round to the right
    [0.5, 0.84, arc(EX_PIVOT, -0.15, circle(EX_TU, EX_TV, 0.6, 0, 8), NaN, { body: true })],
    [0.84, 0.95, arc(EX_PIVOT, -0.15, circle(EX_TU, EX_TV, 0.4, 216, 6), NaN, { body: true })],
    [0.95, 1.08, arc(EX_PIVOT, -0.15, circle(EX_TU, EX_TV, 0.25, 0, 4), NaN, { body: true })],
    // drawn back as far as it goes: the right arm stretched long up behind the ear, the blade aimed
    // down at their chest, the left arm pointing it at them
    [1.08, 1.38, line([-0.25, 0.84, 0.05], EX_AIM_R, [-1, -0.1, 0], EX_AIM, UPE, NaN, NaN, { body: true })],
    // held, the stretch breathing a little further
    [1.38, 1.66, line(EX_AIM_R, [-0.29, 0.86, -0.58], EX_AIM, EX_AIM, UPE, NaN, NaN, { body: true })],
    // the release, slow and then explosive: the arm comes last, most of its travel in the last 0.13 s
    [1.66, 1.85, line([-0.29, 0.86, -0.58], [-0.33, 0.84, -0.45], EX_AIM, [0.13, -0.52, 0.84], UPE, NaN, NaN, { body: true })],
    [1.85, 2.02, line([-0.33, 0.84, -0.45], [-0.36, 0.8, -0.08], [0.13, -0.52, 0.84], [0.18, -0.42, 0.89], UPE, NaN, NaN, { body: true })],
    [2.02, EXEC_HIT, line([-0.36, 0.8, -0.08], EX_HIT_R, [0.18, -0.42, 0.89], EX_HIT_DIR, UPE, NaN, NaN, { body: true })],
    // carried on through them, then the weight sinks into it
    [EXEC_HIT, 2.4, line(EX_HIT_R, [-0.22, 0.7, 0.36], EX_HIT_DIR, [0.2, -0.36, 0.91], UPE, NaN, NaN, { body: true })],
    [2.4, 2.5, line([-0.22, 0.7, 0.36], [-0.22, 0.68, 0.37], [0.2, -0.36, 0.91], [0.2, -0.37, 0.9], UPE, NaN, NaN, { body: true })],
    // the left hand takes the shaft, it is wrenched back out along its line and swung up to stand
    // upright at his right side
    [2.5, 2.66, line([-0.22, 0.68, 0.37], [-0.28, 0.6, -0.05], [0.2, -0.37, 0.9], [0.1, -0.3, 0.95], UPE, 0.4, 0.4, { body: true })],
    [2.66, 2.82, line([-0.28, 0.6, -0.05], [-0.28, 0.25, 0.23], [0.1, -0.3, 0.95], [0.05, 1, 0.1], UPE, 0.4, 0.5, { body: true })],
    [2.82, 4.0, line([-0.28, 0.25, 0.23], [-0.28, 0.25, 0.23], [0.05, 1, 0.1], [0.05, 1, 0.1], UPE, 0.5, 0.5, { body: true })],
  ],
  0.04,
);

// Entrance: landed in a crouch where the bolt struck, the glaive trailing back in the right hand;
// ripped up over the shoulder into a flat spin overhead that spirals down into a windmill at his
// right side; caught in both hands and drawn back as the lightning gathers in the blade; and driven
// out at them in a long lunging thrust
const IN_CROUCH_R: V3 = [-0.5, 0.3, -0.05];
const IN_TRAIL: V3 = [-0.35, 0.1, -0.93];
const IN_UP: V3 = [0.0, 0.5, 0.86];
// the overhead spin's plane, tilted up at the front, and where it spirals down to at his side
const IN_SPIN_U: V3 = [0, 0.35, 0.94];
const IN_SPIN_V: V3 = [-1, 0.05, 0];
const IN_SPIN_TOP: V3 = [-0.1, 1.12, 0.1];
const IN_SPIN_SIDE: V3 = [-0.32, 0.6, 0.18];
const IN_MILL: V3 = [-0.42, 0.45, 0.16];
const IN_COIL_R: V3 = [-0.3, 0.36, -0.28];
const IN_AIM: V3 = [0.06, 0.1, 1];
const IN_THRUST_R: V3 = [-0.2, 0.4, 0.55];
const entranceSpear = seq(
  [
    // crouched, trailing back
    [-0.1, 0.1, line(IN_CROUCH_R, IN_CROUCH_R, IN_TRAIL, IN_TRAIL, UPE, NaN, NaN, { body: true })],
    // ripped up over the shoulder, the arm swinging it from behind round to the front
    [0.1, 0.22, arc([-0.3, 0.55, 0.0], 0.32, [IN_TRAIL, [-0.3, 0.75, -0.6], [-0.15, 0.97, 0.15], IN_UP], NaN, { body: true, pivot1: [-0.18, 0.8, 0.1] })],
    // spun flat overhead in the right hand, twice round, spiralling down to his right side...
    [0.22, 0.56, arc(IN_SPIN_TOP, -0.15, circle(IN_SPIN_U, IN_SPIN_V, 2, 0, 16), NaN, { body: true, pivot1: IN_SPIN_SIDE })],
    // ...and on round upright there, a windmill: down past his front, under, and up behind
    [0.56, 0.66, arc(IN_SPIN_SIDE, -0.15, circle([-0.1, 0.3, 0.95], [0, -1, 0.1], 1, 0, 8), NaN, { body: true, pivot1: IN_MILL })],
    // caught in both hands and drawn back, aimed at them
    [0.66, 0.72, line([-0.36, 0.42, 0.2], IN_COIL_R, IN_AIM, IN_AIM, UPE, NaN, SP, { body: true })],
    // the thrust, the left hand sliding back down the shaft as it goes out
    [0.72, 0.77, line(IN_COIL_R, IN_THRUST_R, IN_AIM, IN_AIM, UPE, SP, -0.1, { body: true })],
    [0.77, 0.9, line(IN_THRUST_R, [-0.21, 0.4, 0.52], IN_AIM, IN_AIM, UPE, -0.1, -0.1, { body: true })],
    // and back to the guard
    [0.9, 1.0, line([-0.21, 0.4, 0.52], G_R, IN_AIM, G_DIR, UPE, -0.1, SP, { body: true })],
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
    // Piercing Step: the weight back and the trunk arched as it is cocked high on the right, then it
    // comes down onto the line, the front foot stamps, the hips and trunk unwind behind it and the
    // arms drive it out at their chest
    l0: mv({
      keys: [
        GUARD_KEY(-0.3),
        K(-0.08, b({ twist: -0.75, hipTwist: -0.5, lean: -0.15, side: 0.08, crouch: -0.24, step: 0.24, back: 0.46, headPitch: -0.05 })),
        K(0.16, b({ twist: -0.95, hipTwist: -0.4, lean: 0.2, crouch: -0.33, step: 0.55, back: 0.47 })),
        K(0.45, b({ twist: -0.7, hipTwist: -0.25, lean: 0.42, crouch: -0.36, step: 0.72, back: 0.48 })),
        K(1.07, b({ twist: -0.8, hipTwist: -0.3, lean: 0.45, crouch: -0.36, step: 0.72, back: 0.48 })),
      ],
      main: pierce,
      impacts: [0.45],
      start: -0.3,
      fx: [fx(0.4, 'dust', 'feet', 0.5), fx(0.45, 'sparkle', 'tip', 0.6)],
    }),
    // Rising Fang: squared up and sunk low with the blade dropped to the floor at the left, then the
    // hips lift and turn right and it rips up through them; the hands draw it straight back and the front foot
    // stamps for a level thrust
    l1: mv({
      keys: [
        GUARD_KEY(-0.3),
        K(-0.08, b({ twist: -0.1, hipTwist: -0.2, lean: 0.3, crouch: -0.38, step: 0.3, back: 0.44, side: -0.06 })),
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
    // Flat Sweep: the stance widens and the body winds left with the blade out wide at the left,
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
        K(-0.12, b({ twist: -1.1, hipTwist: -0.7, lean: -0.28, side: -0.18, crouch: -0.3, step: 0.18, back: 0.55, headPitch: -0.1 })),
        K(0.08, b({ front: 'R', twist: -0.3, hipTwist: -0.05, lean: 0.25, crouch: -0.3, step: 0.15, back: 0.2 })),
        K(0.45, b({ front: 'R', twist: 0.6, hipTwist: 0.3, lean: 0.75, crouch: -0.5, step: 0.9, back: 0.6, width: 0.18 })),
        K(1.07, b({ front: 'R', twist: 0.5, hipTwist: 0.35, lean: 0.82, crouch: -0.56, step: 0.9, back: 0.6, width: 0.2 })),
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
        K(-1.0, b({ front: 'R', twist: 0.5, hipTwist: 0.35, lean: 0.82, crouch: -0.56, step: 0.9, back: 0.6, width: 0.2 })),
        K(-0.6, b({ front: 'R', twist: 0.3, hipTwist: 0.2, lean: 0.2, crouch: -0.3, step: 0.55, back: 0.45 })),
        K(-0.12, b({ front: 'R', twist: 0.47, hipTwist: 0.5, lean: -0.24, side: 0.12, crouch: -0.3, step: 0.45, back: 0.5, headPitch: -0.1 })),
        K(0.2, b({ front: 'R', twist: -0.2, hipTwist: 0.0, lean: 0.2, crouch: -0.35, step: 0.7, back: 0.5 })),
        K(0.45, b({ front: 'R', twist: -0.8, hipTwist: -0.35, lean: 0.55, crouch: -0.45, step: 0.85, back: 0.55, width: 0.2 })),
        K(1.07, b({ front: 'R', twist: -1.3, hipTwist: -0.65, lean: 0.62, crouch: -0.52, step: 0.85, back: 0.55, width: 0.22 })),
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
        K(-1.4, b({ front: 'R', twist: -1.3, hipTwist: -0.65, lean: 0.62, crouch: -0.52, step: 0.85, back: 0.55, width: 0.22 })),
        K(-1.0, b({ twist: -0.6, hipTwist: -0.3, lean: -0.05, crouch: -0.1, step: 0.25, back: 0.28, headPitch: -0.12 })),
        K(-0.55, b({ twist: -0.9, hipTwist: -0.5, lean: -0.08, crouch: -0.06, step: 0.22, back: 0.32, headPitch: -0.15 })),
        K(-0.12, b({ twist: -1.2, hipTwist: -0.9, lean: -0.25, side: 0.12, crouch: -0.18, step: 0.18, back: 0.5, headPitch: -0.12 })),
        K(0.2, b({ twist: -1.0, hipTwist: -0.45, lean: 0.2, crouch: -0.3, step: 0.55, back: 0.5 })),
        K(0.45, b({ twist: -0.85, hipTwist: -0.25, lean: 0.58, crouch: -0.55, step: 0.92, back: 0.6, width: 0.2 })),
        K(1.07, b({ twist: -0.75, hipTwist: -0.2, lean: 0.64, crouch: -0.6, step: 0.92, back: 0.6, width: 0.22 })),
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
    // Thunderstrike: the glaive raised straight up to the sky one-handed while the free arm points at
    // them, lightning gathering on the blade, then swung down to point at them as the bolt falls on
    // the ground marked where they stood (be off it)
    sp: mv({
      keys: [
        K(-1.6, body),
        // drawn up tall, square to them, the glaive going up
        K(-1.0, b({ twist: -0.25, hipTwist: -0.2, crouch: -0.1, lean: -0.16, step: 0.26, back: 0.3, headPitch: -0.3 })),
        K(0.15, b({ twist: -0.25, hipTwist: -0.2, crouch: -0.08, lean: -0.2, step: 0.26, back: 0.3, headPitch: -0.38 })),
        // the point brought down onto them as the bolt falls
        K(THUNDER_HIT, b({ twist: -0.5, hipTwist: -0.3, crouch: -0.3, lean: 0.28, step: 0.38, back: 0.32, headPitch: 0.0 })),
        K(1.4, b({ twist: -0.5, hipTwist: -0.3, crouch: -0.3, lean: 0.26, step: 0.38, back: 0.32 })),
        K(1.8, body),
      ],
      main: thunder,
      // the free arm aimed at them while the glaive is raised
      free: track([
        [-1.6, [0.3, 0.2, 0.2]],
        [-1.0, [0.12, 0.56, 0.62]],
        [0.15, [0.12, 0.58, 0.64]],
        [THUNDER_HIT, [0.4, 0.4, 0.2]],
        [1.8, [0.3, 0.2, 0.2]],
      ]),
      impacts: [THUNDER_HIT],
      start: -1.6,
      chamber: -1.0,
      flow: 1.0,
      blendIn: 0.3,
      end: 1.4,
      rest: 1.8,
      settle: 0.6,
      fx: [
        fx(-0.95, 'sparkle', 'tip', 1.2, BOLT),
        fx(-0.6, 'bolt', 'tip', 0.45, BOLT),
        fx(-0.25, 'sparkle', 'tip', 1.4, BOLT),
        fx(0.05, 'bolt', 'tip', 0.55, BOLT),
        fx(THUNDER_HIT, 'flashline', 'tip', 1.2, BOLT),
      ],
      trail: { life: 0.26, glow: 0.9 },
    }),
    // Vault Strike: the blade planted ahead and the body swung up and over it in a forward
    // somersault, clean over them, untouchable; landed in a crouch with the glaive driven back under
    // the arm into the ground behind him, lightning bursting out all round
    ab: mv({
      keys: [
        K(-1.0, b({ crouch: -0.32, lean: 0.3 }), { flip: 0, hop: 0 }),
        K(-0.7, b({ crouch: -0.08, lean: 0.05 }), { flip: 0.05, hop: 0.45 }),
        K(-0.25, b({ crouch: 0.0, lean: -0.1, headPitch: 0.2 }), { flip: 0.45, hop: 1.25 }),
        K(0.15, b({ crouch: -0.12, lean: 0.1 }), { flip: 0.92, hop: 0.4 }),
        K(VAULT_HIT, b({ front: 'R', twist: -1.0, hipTwist: -0.5, crouch: -0.48, lean: 0.36, step: 0.34, back: 0.36, width: 0.22, headPitch: -0.1 }), { flip: 1, hop: 0 }),
        K(1.1, b({ front: 'R', twist: -1.0, hipTwist: -0.5, crouch: -0.46, lean: 0.34, step: 0.34, back: 0.36, width: 0.22 }), { flip: 1, hop: 0 }),
        K(1.45, body, { flip: 1, hop: 0 }),
      ],
      main: vault,
      impacts: [VAULT_HIT],
      start: -1.0,
      chamber: -0.7,
      flow: 1.0,
      blendIn: 0.25,
      end: 1.1,
      rest: 1.45,
      settle: 0.6,
      ghosts: [-0.7, 0.3],
      fx: [
        fx(-0.95, 'dust', 'feet', 1.0),
        fx(-0.3, 'sparkle', 'tip', 1.0, BOLT),
        fx(VAULT_HIT, 'shockwave', 'feet', 1.1, BOLT),
        fx(VAULT_HIT, 'bolt', 'tip', 0.7, BOLT),
        fx(VAULT_HIT + 0.01, 'dust', 'feet', 1.3),
      ],
      trail: { life: 0.24, glow: 0.85 },
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
      free: track([
        [-0.4, [0.3, 0.35, 0.4]],
        [-0.1, [0.8, 0.55, 0.15]],
        [0.12, [0.4, 0.45, 0.35]],
      ]),
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
        K(-0.12, b({ twist: -0.8, hipTwist: -0.6, crouch: -0.46, lean: 0.35, step: 0.6, back: 0.55 }), { hop: 0 }),
        K(0.45, b({ twist: 0.6, hipTwist: 0.35, crouch: -0.3, lean: 0.35, step: 0.85, back: 0.5 }), { hop: 0.05 }),
        K(1.07, b({ twist: -0.3, hipTwist: 0.3, crouch: -0.06, lean: -0.12, step: 0.75, back: 0.55, headPitch: -0.2 }), { hop: 0.04 }),
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
        K(-0.12, b({ twist: 0.97, hipTwist: 0.55, lean: -0.28, side: -0.1, crouch: -0.3, back: 0.62, step: 0.22 })),
        K(0.45, b({ twist: -0.8, hipTwist: -0.35, lean: 0.35, crouch: -0.36, step: 0.28, back: 0.62 })),
        K(1.07, b({ twist: -1.15, hipTwist: -0.6, lean: 0.34, crouch: -0.44, step: 0.24, back: 0.62 })),
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
        K(-0.12, b({ twist: -0.35, crouch: 0.02, lean: -0.32, headPitch: -0.16, step: 0.25, back: 0.25 }), { hop: 0.36, flip: -0.03 }),
        K(0.45, b({ twist: -0.93, hipTwist: -0.5, crouch: -0.6, lean: 0.25, step: 0.6, back: 0.5, width: 0.22 }), { hop: 0, flip: 0.02 }),
        K(1.1, b({ twist: -0.85, hipTwist: -0.45, crouch: -0.62, lean: 0.28, step: 0.6, back: 0.5, width: 0.2 }), { flip: 0 }),
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
      // the twirl: the body rises and turns with it, then coils left behind the blade
      K(0.55, b({ twist: -0.2, hipTwist: -0.15, crouch: -0.03, lean: -0.05, step: 0.22, back: 0.24, headPitch: 0.1 })),
      K(0.8, b({ twist: 0.35, hipTwist: 0.15, crouch: -0.12, lean: -0.1, side: -0.05, step: 0.22, back: 0.3, headPitch: 0.12 })),
      // and unwinds hard to the right as it whips past their face
      K(0.95, b({ twist: -0.25, hipTwist: -0.1, crouch: -0.1, lean: 0.12, step: 0.3, back: 0.26, headPitch: 0.1 })),
      K(1.08, b({ twist: -0.55, hipTwist: -0.35, crouch: -0.14, lean: 0.0, step: 0.26, back: 0.34, headPitch: 0.12 })),
      // the full load: all the weight on the bent rear leg, hips and shoulders turned right away from
      // them, the trunk arched back and leaning over the rear foot, eyes on the target
      K(1.38, b({ twist: -1.0, hipTwist: -0.75, crouch: -0.26, lean: -0.3, side: 0.1, step: 0.22, back: 0.55, headPitch: 0.2 })),
      K(1.66, b({ twist: -1.05, hipTwist: -0.78, crouch: -0.28, lean: -0.32, side: 0.11, step: 0.22, back: 0.56, headPitch: 0.2 })),
      // the release, ground up: the front foot strides, the hips snap round, the trunk pitches in
      K(1.85, b({ twist: -0.95, hipTwist: -0.45, crouch: -0.3, lean: -0.1, step: 0.55, back: 0.55, headPitch: 0.15 })),
      K(2.02, b({ twist: -0.55, hipTwist: 0.05, crouch: -0.34, lean: 0.3, step: 0.82, back: 0.56, width: 0.18, headPitch: 0.1 })),
      K(EXEC_HIT, b({ twist: -0.2, hipTwist: 0.1, crouch: -0.36, lean: 0.48, step: 0.85, back: 0.56, width: 0.18, headPitch: 0.1 })),
      // the mass carries on into it, then the knees give and the weight sinks
      K(2.4, b({ twist: -0.1, hipTwist: 0.1, crouch: -0.44, lean: 0.56, step: 0.85, back: 0.56, width: 0.2, headPitch: 0.18 })),
      K(2.5, b({ twist: -0.12, hipTwist: 0.08, crouch: -0.47, lean: 0.52, step: 0.85, back: 0.56, width: 0.2, headPitch: 0.2 })),
      // wrenched out with a push back off the front foot, and straightening tall over them
      K(2.66, b({ twist: -0.55, hipTwist: -0.3, crouch: -0.2, lean: 0.05, step: 0.4, back: 0.45, headPitch: 0.2 })),
      K(3.0, b({ twist: -0.6, hipTwist: -0.35, crouch: -0.1, lean: -0.02, step: 0.3, back: 0.32, headPitch: 0.1 })),
    ],
    main: execGlaive,
    // the left hand flung out for balance through the twirl, pointing at them through the aim,
    // flung back against the drive, and onto the shaft to wrench it out
    free: track([
      [0.45, [-0.12, 0.62, 0.3]],
      [0.6, [0.55, 0.5, 0.2]],
      [0.8, [0.62, 0.42, -0.05]],
      [1.0, [0.6, 0.5, 0.15]],
      [1.3, [0.6, 0.52, 0.28]],
      [1.66, [0.62, 0.5, 0.3]],
      [1.95, [0.55, 0.38, 0.0]],
      [2.1, [0.42, 0.22, -0.36]],
      [2.45, [0.4, 0.2, -0.34]],
      [2.56, [0.1, 0.4, 0.4]],
    ]),
    impacts: [0.95, EXEC_HIT],
    // the spear driven in: a thrust, not a push
    strike: 1.85,
    start: 0,
    chamber: 0.5,
    end: 2.62,
    rest: 3.0,
    ghosts: [1.9, 2.25],
    fx: [
      fx(0.3, 'sparkle', 'tip', 0.7, BOLT),
      fx(0.55, 'whirl', 'main', 0.9, BOLT),
      fx(0.95, 'flashline', 'tip', 0.8, BOLT),
      fx(1.4, 'bolt', 'tip', 1.0),
      fx(1.42, 'sparkle', 'tip', 1.0, BOLT),
      fx(1.45, 'embers', 'root', 0.7, BOLT),
      fx(1.8, 'stomp', 'feet', 0.9),
      fx(EXEC_HIT, 'flashline', 'tip', 1.6, BOLT),
      fx(EXEC_HIT, 'bolt', 'tip', 1.2),
      fx(EXEC_HIT, 'sparkle', 'tip', 1.3, BOLT),
      fx(EXEC_HIT + 0.02, 'shockwave', 'feet', 1.1, BOLT),
      fx(2.5, 'embers', 'tip', 0.8, BOLT),
      fx(2.45, 'dust', 'feet', 0.7),
      fx(2.8, 'dust', 'feet', 0.8),
      fx(2.82, 'shockwave', 'feet', 0.6, BOLT),
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
  // Entrance, Storm of the North (see entranceSpear): the bolt, the rise, the spin, the gathering
  // and the thrust, one motion
  entrance: mv({
    keys: [
      // landed hard: right knee down, left hand on the floor, head bowed
      K(0.0, b({ front: 'R', twist: -0.3, hipTwist: 0, crouch: -0.56, lean: 0.4, step: 0.36, back: 0.36, width: 0.24, headPitch: 0.45 })),
      K(0.1, b({ front: 'R', twist: -0.35, hipTwist: 0, crouch: -0.54, lean: 0.36, step: 0.36, back: 0.36, width: 0.24, headPitch: 0.3 })),
      // up off the floor with the glaive, onto the toes
      K(0.18, b({ front: 'R', twist: -0.1, hipTwist: 0, crouch: 0.0, lean: -0.12, step: 0.22, back: 0.22, width: 0.16, headPitch: -0.12 }), { hop: 0.12 }),
      K(0.24, b({ twist: 0.05, hipTwist: 0.05, crouch: -0.06, lean: -0.06, step: 0.24, back: 0.24, width: 0.16, headPitch: -0.1 }), { hop: 0 }),
      // turning under the spin, a step round with each turn
      K(0.33, b({ twist: 0.3, hipTwist: 0.15, crouch: -0.1, lean: -0.04, step: 0.26, back: 0.22, width: 0.17, headPitch: -0.12 })),
      K(0.42, b({ twist: -0.25, hipTwist: -0.12, crouch: -0.08, lean: -0.02, step: 0.24, back: 0.26, width: 0.17, headPitch: -0.08 })),
      K(0.5, b({ twist: 0.2, hipTwist: 0.1, crouch: -0.12, lean: 0.0, step: 0.26, back: 0.24, width: 0.17, headPitch: -0.05 })),
      // the windmill at his right side, turned into it
      K(0.6, b({ twist: -0.55, hipTwist: -0.3, crouch: -0.14, lean: 0.06, step: 0.28, back: 0.28, width: 0.17, headPitch: 0.0 })),
      // the coil: the weight back over the rear leg, the hips and shoulders turned away, eyes on them
      K(0.7, b({ twist: -0.95, hipTwist: -0.6, crouch: -0.3, lean: -0.16, side: 0.06, step: 0.26, back: 0.5, width: 0.18, headPitch: 0.1 })),
      // the lunge: the front foot strides out, the hips snap round, the trunk drives in behind it
      K(0.75, b({ twist: -0.35, hipTwist: 0.02, crouch: -0.4, lean: 0.42, step: 0.8, back: 0.55, width: 0.18, headPitch: 0.05 })),
      K(0.88, b({ twist: -0.32, hipTwist: 0.02, crouch: -0.42, lean: 0.4, step: 0.8, back: 0.55, width: 0.18, headPitch: 0.05 })),
      K(1.0, body),
    ],
    main: entranceSpear,
    // the left hand on the floor, thrown out wide for balance through the spin, then onto the shaft
    free: track([
      [0.0, [0.34, -0.2, 0.42]],
      [0.1, [0.34, -0.18, 0.4]],
      [0.2, [0.55, 0.45, 0.2]],
      [0.5, [0.6, 0.5, 0.1]],
      [0.62, [0.5, 0.45, 0.25]],
      [0.7, [-0.05, 0.4, 0.15]],
    ]),
    lead: 0,
    ghosts: [0.72, 0.8],
    fx: [
      fx(0.0, 'bolt', 'root', 1.6),
      fx(0.01, 'shockwave', 'root', 1.0, BOLT),
      fx(0.01, 'dust', 'feet', 1.4),
      fx(0.02, 'shake', 'root', 0.8),
      fx(0.06, 'sparkle', 'tip', 0.8, BOLT),
      fx(0.14, 'dust', 'feet', 0.9),
      fx(0.3, 'whirl', 'main', 0.9, BOLT),
      fx(0.44, 'whirl', 'main', 0.9, BOLT),
      fx(0.5, 'bolt', 'tip', 0.5),
      fx(0.6, 'sparkle', 'tip', 0.9, BOLT),
      fx(0.67, 'bolt', 'tip', 0.9),
      fx(0.68, 'embers', 'root', 0.8, BOLT),
      fx(0.74, 'stomp', 'feet', 1.0),
      fx(0.76, 'flashline', 'tip', 1.5, BOLT),
      fx(0.76, 'bolt', 'tip', 1.2),
      fx(0.77, 'shockwave', 'front', 1.2, BOLT),
      fx(0.9, 'embers', 'tip', 0.7, BOLT),
    ],
  }),
};
