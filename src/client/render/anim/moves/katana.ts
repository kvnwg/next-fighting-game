/**
 * Ronin, katana. A duelist's kenjutsu, big and committed: the blade rides low and forward at the
 * right hip in one hand, every cut coils the hips away first and then throws the whole body after
 * the blade, landing on the front knee with the chest pitched over it. The lights stay one-handed
 * (the arm thrown out at full length, the left flung back for balance); the heavies close both
 * hands on the hilt; the special is the Gatotsu, the blade drawn back level beside the head and
 * fired down its own line on a lunge that ends almost flat.
 *
 * Most paths are authored relative to the hips (`body: true`), so a blade that points ahead
 * points at the opponent however far the torso has wound or pitched.
 *
 * The moves with a clear moment in the reference (the sword clip, player in yellow) are keyed joint
 * by joint from traces of it (`keyed`): where the fists sit in front of the chest at each phase,
 * and where the blade points. Swallow Cut is the flat cut at 1.50-1.75 s, Rising Petal the hanging
 * point-down whip at 3.42-3.75 s, Heaven Splitter the jodan cut at 1.92-2.33 s, Gatotsu the thrust
 * at 2.67-3.00 s, Ground Wheel the wide low sweep at 4.00-4.33 s.
 */
import { B, K, P, Style, X, arc, fx, hitAt, line, mv, N, seq, track } from '../author';
import type { KeyIn, Motion, V3 } from '../author';

/** The scabbard (torso space): runs back and down from the left hip; the Iai grip sits just outside its mouth. */
const IAI_GRIP: V3 = [-0.06, 0.16, 0.32];
export const KATANA_SHEATH: V3 = [0.5, -0.42, -0.76];
export const KATANA_SHEATH_MOUTH: V3 = (() => {
  const d = N(KATANA_SHEATH);
  return [IAI_GRIP[0] + d.x * 0.19, IAI_GRIP[1] + d.y * 0.19, IAI_GRIP[2] + d.z * 0.19];
})();

const G2 = -0.13; // the left hand rides 13 cm down the handle
const body = B({ front: 'R', step: 0.28, back: 0.26, width: 0.13, crouch: -0.13, lean: 0.14, twist: 0.06 });
const stanceBody = B({ ...body, crouch: -0.24, lean: 0.32, twist: 0.25, step: 0.32, back: 0.3 });
/** Guard: one hand, low at the right hip, the point level at their knees; the left hand rests on the saya. */
const GUARD_GRIP: V3 = [-0.2, 0.06, 0.34];
const GUARD_DIR: V3 = [-0.14, -0.12, 1];
const GUARD_EDGE: V3 = [0, -1, -0.1];
const SAYA: V3 = [0.1, 0.07, 0.15];

const H = { body: true };
const one = (pivot: V3, r: number, dirs: V3[], pivot1?: V3) => arc(pivot, r, dirs, NaN, { body: true, pivot1 });
const two = (pivot: V3, r: number, dirs: V3[], pivot1?: V3) => arc(pivot, r, dirs, G2, { body: true, pivot1 });


/** A torso-space point seen from the hips, for a torso turned `twist` and pitched `lean` (bodyToTorso undone). */
function fromTorso(p: V3, twist: number, lean: number): V3 {
  const y = p[1] * Math.cos(lean) - p[2] * Math.sin(lean);
  const z = p[1] * Math.sin(lean) + p[2] * Math.cos(lean);
  return [p[0] * Math.cos(twist) + z * Math.sin(twist), y, -p[0] * Math.sin(twist) + z * Math.cos(twist)];
}

/** Where the grip sits relative to the torso as the blade reaches direction i: [i, grip, twist, lean]. */
type Anchor = [number, V3, number, number];

/**
 * A hips-relative swing (aimed in the world, so the hit points at the opponent however the body is
 * wound) whose grip passes through two torso-space spots, so the hands stay where the arms can put
 * them: on a deep lean the head drops forward into the space a level cut would otherwise use.
 */
function swing(r: number, dirs: V3[], grip2: number, a: Anchor, b: Anchor): Motion {
  const probe = arc([0, 0, 0], r, dirs);
  const pivotAt = ([i, g, tw, ln]: Anchor): [number, V3] => {
    const p = fromTorso(g, tw, ln);
    const d = N(dirs[i]);
    return [hitAt(probe, i), [p[0] - d.x * r, p[1] - d.y * r, p[2] - d.z * r]];
  };
  const [fa, pa] = pivotAt(a);
  const [fb, pb] = pivotAt(b);
  const k = (j: number) => (pb[j] - pa[j]) / (fb - fa);
  const p0: V3 = [pa[0] - k(0) * fa, pa[1] - k(1) * fa, pa[2] - k(2) * fa];
  const p1: V3 = [p0[0] + k(0), p0[1] + k(1), p0[2] + k(2)];
  return arc(p0, r, dirs, grip2, { body: true, pivot1: p1 });
}

/**
 * A weapon key traced off the reference: at s the fist sits at `grip` in torso space (in front of the
 * chest where the trace has it, so the arms can be checked joint by joint) and the blade points along
 * `dir` in the hips' frame (world aim, so a blade that points ahead hits), or in torso space with
 * `torso` (blades laid back past the hat). `g2` closes the left hand on the hilt.
 */
interface WKey {
  s: number;
  grip: V3;
  dir: V3;
  g2?: number;
  torso?: boolean;
}

/** The torso's turn and pitch where the body keys have it at s (linear between keys). */
function torsoAt(keys: KeyIn[], s: number): [number, number] {
  const k = keys.slice().sort((a, b) => a.s - b.s);
  if (s <= k[0].s) return [k[0].b.twist, k[0].b.lean];
  for (let i = 0; i < k.length - 1; i++) {
    if (s > k[i + 1].s) continue;
    const t = (s - k[i].s) / Math.max(1e-6, k[i + 1].s - k[i].s);
    return [k[i].b.twist + (k[i + 1].b.twist - k[i].b.twist) * t, k[i].b.lean + (k[i + 1].b.lean - k[i].b.lean) * t];
  }
  const l = k[k.length - 1];
  return [l.b.twist, l.b.lean];
}

/**
 * Straight runs between traced keys; the edge leads the way the blade is travelling. Each fist is
 * taken through the torso as the body keys will have turned and pitched it there (the body leads
 * the weapon by `lead`), so it lands where it was traced in front of the chest.
 */
function keyed(body: KeyIn[], keys: WKey[], lead = 0.1, blend = 0.05): Motion {
  const at = keys.map((k) => torsoAt(body, k.s + lead));
  const pos = keys.map((k, i) => fromTorso(k.grip, at[i][0], at[i][1]));
  const dir = keys.map((k, i) => N(k.torso ? fromTorso(k.dir, at[i][0], at[i][1]) : k.dir));
  const n = keys.length;
  const edge = dir.map((d, i) => {
    const e = dir[Math.min(n - 1, i + 1)].clone().sub(dir[Math.max(0, i - 1)]);
    e.addScaledVector(d, -e.dot(d));
    return e.lengthSq() > 1e-6 ? e.normalize() : N([0, 1, 0]);
  });
  const v = (x: ReturnType<typeof N>): V3 => [x.x, x.y, x.z];
  const g = (k: WKey) => k.g2 ?? NaN;
  const parts: [number, number, Motion][] = [[keys[0].s - 5, keys[0].s, line(pos[0], pos[0], v(dir[0]), v(dir[0]), v(edge[0]), g(keys[0]), g(keys[0]), H)]];
  for (let i = 0; i < n - 1; i++) {
    const e = edge[i].clone().add(edge[i + 1]);
    parts.push([keys[i].s, keys[i + 1].s, line(pos[i], pos[i + 1], v(dir[i]), v(dir[i + 1]), v(e), g(keys[i]), g(keys[i + 1]), H)]);
  }
  parts.push([keys[n - 1].s, keys[n - 1].s + 5, line(pos[n - 1], pos[n - 1], v(dir[n - 1]), v(dir[n - 1]), v(edge[n - 1]), g(keys[n - 1]), g(keys[n - 1]), H)]);
  return seq(parts, blend);
}

// Swallow Cut (ref 1.50-1.75 s): the point drops low on the right, ahead of the right foot; the fists
// sweep flat across the hips from right to left, the left hand closing on the pommel as the blade
// points at them, and carry on round to the left chest, the point rising up past the left shoulder
const swallowHit = 0.45;
const swallowBody = [
  K(-0.1, B({ ...body, twist: -0.5, hipTwist: -0.25, lean: 0.12, crouch: -0.12, step: 0.3, back: 0.3 })),
  K(0.28, B({ ...body, twist: -0.1, hipTwist: 0.15, lean: 0.2, crouch: -0.18, step: 0.44, back: 0.32 })),
  K(swallowHit, B({ ...body, twist: 0.3, hipTwist: 0.3, lean: 0.28, crouch: -0.22, step: 0.52, back: 0.34 })),
  K(0.85, B({ ...body, twist: 0.75, hipTwist: 0.35, lean: 0.24, crouch: -0.22, step: 0.54, back: 0.34 })),
  K(1.05, B({ ...body, twist: 0.8, hipTwist: 0.35, lean: 0.32, crouch: -0.3, step: 0.54, back: 0.34, headPitch: 0.08 })),
];
const swallow = keyed(swallowBody, [
  { s: -0.1, grip: [-0.3, 0.06, 0.2], dir: [-0.65, -0.33, 0.68] },
  { s: 0.28, grip: [-0.22, 0.1, 0.38], dir: [-0.55, -0.2, 0.8] },
  { s: swallowHit, grip: [-0.1, 0.18, 0.4], dir: [0.02, -0.04, 1], g2: G2 },
  { s: 0.62, grip: [0.02, 0.24, 0.36], dir: [0.72, 0.1, 0.68], g2: G2 },
  { s: 0.85, grip: [0.12, 0.34, 0.3], dir: [0.75, 0.62, -0.2], g2: G2 },
  { s: 1.05, grip: [0.12, 0.32, 0.28], dir: [0.72, 0.6, -0.35], g2: G2 },
]);

// Rising Petal (ref 3.42-3.75 s): out of the wrap the blade hangs point-down by the right of the chest,
// then one hand whips it up through them and out flat to the right, the arm at full length at
// shoulder height and the left arm flung out the other way
const petalHit = 0.45;
const petalBody = [
  K(-0.1, B({ ...body, twist: 0.25, hipTwist: 0.15, lean: 0.2, crouch: -0.16, step: 0.36, back: 0.3 })),
  K(0.3, B({ ...body, twist: 0.05, hipTwist: -0.1, lean: 0.28, crouch: -0.2, step: 0.48, back: 0.32 })),
  K(petalHit, B({ ...body, twist: -0.15, hipTwist: -0.22, lean: 0.32, crouch: -0.2, step: 0.55, back: 0.32 })),
  K(0.7, B({ ...body, twist: -0.5, hipTwist: -0.28, lean: 0.22, crouch: -0.16, step: 0.54, back: 0.32, side: -0.06 })),
  K(1.0, B({ ...body, twist: -0.65, hipTwist: -0.3, lean: 0.15, crouch: -0.12, step: 0.52, back: 0.3, side: -0.12, headPitch: -0.05 })),
];
const petal = keyed(petalBody, [
  { s: -0.1, grip: [-0.16, 0.32, 0.36], dir: [-0.12, -0.62, 0.78] },
  { s: 0.3, grip: [-0.14, 0.34, 0.42], dir: [-0.06, -0.4, 0.92] },
  { s: petalHit, grip: [-0.12, 0.34, 0.44], dir: [-0.12, 0.02, 1] },
  { s: 0.7, grip: [-0.4, 0.44, 0.42], dir: [-0.75, 0.08, 0.66] },
  { s: 1.0, grip: [-0.66, 0.5, 0.22], dir: [-0.98, 0.1, 0.12] },
]);

// Twin Swallow: both hands meet in hasso by the right shoulder; kesa down to the low left, then
// the blade turns over and snaps back flat from left to right
const twin = seq([
  [-0.1, 0.62, swing(0.24, [[-0.8, 0.55, -0.25], [-0.6, 0.65, 0.45], [-0.15, 0.3, 1], [0.45, -0.35, 0.82], [0.7, -0.5, 0.45]], G2, [0, [-0.2, 0.62, 0.1], -0.45, 0.1], [2, [-0.06, 0.4, 0.44], 0.4, 0.5])],
  [0.62, 1.12, two([0.0, 0.34, 0.24], 0.24, [[0.7, -0.5, 0.45], [0.85, -0.08, 0.5], [0.45, 0.02, 0.9], [-0.05, 0.05, 1], [-0.65, 0.02, 0.75], [-0.9, -0.05, 0.25]], [-0.04, 0.34, 0.26])],
], 0.06);
const twinHits = [hitAt(twin, 2, 0), hitAt(twin, 3, 1)];

// Heaven Splitter (ref 1.92-2.33 s): jodan, both fists above the brim of the hat with the blade laid
// back over its crown and the chest leaning back over the straight rear leg; the blade comes over
// through upright and down the centre line as the whole body folds over the front knee
/**
 * Jodan, in torso space: the fists at the front edge of the brim, just above it (higher is out of
 * reach), and the blade raised steeply back over the crown. Both are authored short of that, since
 * a heavy's tell pushes its chamber about half as far again from guard: the fists come up from
 * the chin and the upright blade is turned a further ~25 degrees back.
 */
const JODAN_GRIP: V3 = [-0.085, 0.47, 0.29];
const JODAN_DIR: V3 = [-0.06, 1, -0.07];
const heavenHit = 0.45;
const heavenBody = [
  K(-0.2, B({ ...body, twist: -0.05, lean: -0.17, crouch: 0.0, step: 0.22, back: 0.36, headPitch: -0.2 })),
  K(0.15, B({ ...body, twist: 0.0, lean: 0.05, crouch: -0.08, step: 0.42, back: 0.36 }), { hop: 0.08 }),
  K(heavenHit, B({ ...body, twist: 0.03, lean: 0.78, crouch: -0.38, step: 0.64, back: 0.4 }), { hop: 0 }),
  K(1.05, B({ ...body, twist: 0.03, lean: 1.0, crouch: -0.48, step: 0.66, back: 0.42, headPitch: 0.15 })),
];
const heaven = keyed(heavenBody, [
  { s: -0.16, grip: JODAN_GRIP, dir: JODAN_DIR, g2: G2, torso: true },
  { s: 0.1, grip: [-0.02, 0.74, 0.33], dir: [0.0, 0.98, 0.2], g2: G2, torso: true },
  { s: 0.3, grip: [0.0, 0.62, 0.48], dir: [0.0, 0.7, 0.72], g2: G2 },
  { s: heavenHit, grip: [-0.02, 0.44, 0.48], dir: [0.0, 0.1, 1], g2: G2 },
  { s: 0.75, grip: [-0.02, 0.38, 0.46], dir: [0.0, -0.06, 1], g2: G2 },
  { s: 1.05, grip: [-0.02, 0.34, 0.44], dir: [0.0, -0.1, 1], g2: G2 },
]);

// Iai Flash: out of the scabbard mouth, flat across the body
const draw = arc([-0.167, 0.2, 0.421], 0.15, [[0.9, 0, -0.4], [0.7, 0.14, 0.7], [0, 0.3, 1], [-0.8, 0.36, 0.55], [-0.95, 0.4, -0.15]], NaN, { pivot1: [-0.34, 0.4, 0.24] });
const drawHit = hitAt(draw, 2);

// Ground Wheel (ref 4.00-4.33 s): out of the fold the sword arm is flung out wide to the right, the
// point down by the right knee and the stance spread wide and low; one hand sweeps it flat across
// the front at their thighs and on round to the left as the hips unwind
const wheelHit = 0.45;
const wheelBody = [
  K(-0.08, B({ ...body, twist: -0.45, hipTwist: -0.25, lean: 0.32, crouch: -0.34, step: 0.42, back: 0.36, width: 0.2 })),
  K(0.25, B({ ...body, twist: -0.2, hipTwist: 0.0, lean: 0.36, crouch: -0.4, step: 0.5, back: 0.4, width: 0.2 })),
  K(wheelHit, B({ ...body, twist: 0.1, hipTwist: 0.2, lean: 0.4, crouch: -0.42, step: 0.58, back: 0.4, width: 0.18 })),
  K(1.0, B({ ...body, twist: 0.8, hipTwist: 0.3, lean: 0.3, crouch: -0.3, step: 0.58, back: 0.38, width: 0.16, headPitch: -0.05 })),
];
const wheel = keyed(wheelBody, [
  { s: -0.06, grip: [-0.5, 0.2, 0.2], dir: [-0.85, -0.2, 0.48] },
  { s: 0.25, grip: [-0.45, 0.14, 0.36], dir: [-0.62, -0.25, 0.74] },
  { s: wheelHit, grip: [-0.22, 0.16, 0.42], dir: [0.0, -0.18, 0.98] },
  { s: 0.7, grip: [-0.05, 0.18, 0.38], dir: [0.7, -0.15, 0.7] },
  { s: 1.0, grip: [0.05, 0.22, 0.3], dir: [0.92, -0.1, 0.36] },
]);

// Crescent Moon: a full turn to the left with the blade trailing low, rising up the right side as
// the turn closes; a leap, and a kesa cleave from high on the right that lands on the front knee
const crescent = swing(0.25, [[-0.75, -0.25, -0.6], [-0.95, 0.1, -0.2], [-0.85, 0.45, -0.25], [-0.6, 0.62, 0.5], [-0.15, 0.3, 1], [0.45, -0.12, 0.88], [0.65, -0.15, 0.74]], G2, [2, [-0.16, 0.5, 0.16], -0.55, 0.0], [6, [0.05, 0.46, 0.44], 0.5, 0.76]);
const crescentTop = hitAt(crescent, 3);
const crescentHit = hitAt(crescent, 4);

// Gatotsu (ref 2.67-3.00 s): standing tall on a short stance, the sword hand drawn back beside the
// right temple with the elbow high and the blade upright, the left hand reaching at them; the lunge
// starts with the blade still back, then both hands close on the hilt and fire it straight down the
// line, the rear leg straight and the chest pitched over the front knee
const gatotsuHit = 0.8;
const gatotsuBody = [
  K(-0.4, B({ ...body, twist: -0.2, lean: 0.05, crouch: -0.1, step: 0.24, back: 0.24 })),
  K(-0.1, B({ ...body, twist: -0.32, hipTwist: -0.17, lean: 0.03, crouch: -0.08, step: 0.21, back: 0.24 })),
  K(0.3, B({ ...body, twist: -0.4, hipTwist: -0.15, lean: 0.3, crouch: -0.2, step: 0.5, back: 0.45 })),
  K(gatotsuHit, B({ ...body, twist: -0.2, hipTwist: 0.0, lean: 0.6, crouch: -0.32, step: 0.85, back: 0.66, headPitch: -0.15 })),
  K(1.08, B({ ...body, twist: -0.2, hipTwist: 0.0, lean: 0.62, crouch: -0.32, step: 0.85, back: 0.66, headPitch: -0.15 })),
];
const gatotsu = keyed(gatotsuBody, [
  { s: -0.4, grip: [-0.22, 0.25, 0.32], dir: [-0.05, 0.3, 0.95] },
  { s: -0.1, grip: [-0.33, 0.37, 0.11], dir: [-0.45, 0.88, -0.1], torso: true },
  { s: 0.3, grip: [-0.42, 0.5, 0.12], dir: [-0.4, 0.7, 0.6], torso: true },
  { s: 0.55, grip: [-0.28, 0.48, 0.25], dir: [0.03, 0.15, 1], g2: G2 },
  { s: gatotsuHit, grip: [-0.08, 0.48, 0.52], dir: [0.03, -0.02, 1], g2: G2 },
  { s: 1.08, grip: [-0.08, 0.47, 0.52], dir: [0.02, -0.06, 1], g2: G2 },
], 0.1, 0.04);

// Gale Step: running with the blade trailed low behind the right hip in one hand, the point whips
// round to the front and the arm shoots it out level on a fencer's lunge
const gale = seq([
  [-0.3, 0.5, one([-0.16, 0.26, 0.0], 0.24, [[-0.3, -0.3, -0.9], [-0.95, -0.15, 0.15], [-0.4, 0.05, 0.9], [-0.05, 0.06, 1]], [-0.12, 0.38, 0.2])],
  [0.5, 0.85, line([-0.13, 0.4, 0.44], [-0.1, 0.42, 0.74], [-0.05, 0.06, 1], [0.0, 0.02, 1], [0, -1, 0], NaN, NaN, H)],
  [0.85, 1.1, line([-0.1, 0.42, 0.74], [-0.1, 0.38, 0.7], [0.0, 0.02, 1], [0.0, -0.1, 1], [0, -1, 0], NaN, NaN, H)],
], 0.05);
const galeHit = 0.8;

// Thunder Draw: hasso on the run, the blade dropping to the right as both hands close, one flat
// passing cut at the waist, and the body folds right over the front knee as it carries round
const thunder = swing(0.26, [[-0.92, 0.35, -0.15], [-0.95, 0.1, -0.1], [-0.6, -0.05, 0.8], [0.0, -0.05, 1], [0.65, -0.1, 0.75], [0.95, -0.05, 0.1], [0.72, -0.1, -0.65]], G2, [0, [-0.22, 0.5, 0.12], -0.75, 0.42], [3, [-0.06, 0.45, 0.41], 0.4, 0.62]);
const thunderHit = hitAt(thunder, 3);

// Fading Cut: one-handed gyaku kiriage, low on the right up to high on the left, as the rear foot
// slides back and the hips sink onto it
const fading = one([-0.06, 0.34, 0.12], 0.3, [[-0.55, -0.45, 0.7], [-0.4, -0.28, 0.87], [0.0, 0.05, 1], [0.5, 0.55, 0.67], [0.6, 0.8, 0.0]], [0.02, 0.42, 0.22]);
const fadingHit = hitAt(fading, 2);

// Mountain Wall: the blade hung point-down in front (the wall), wheeled up past the left shoulder
// on a hop back, and cut down from high on the left as the weight lands
const wall = two([0, 0.42, 0.14], 0.25, [[0.3, -0.6, 0.72], [0.85, -0.3, 0.4], [0.75, 0.55, -0.3], [0.45, 0.85, 0.2], [0.12, 0.3, 1], [-0.4, -0.2, 0.9], [-0.62, -0.28, 0.72]], [0.0, 0.36, 0.3]);
const wallTop = hitAt(wall, 3);
const wallHit = hitAt(wall, 4);

// Swallow Dive: in the air, one hand, the blade held out backhand on the left; the whole body
// whips a turn to the right and the arm flings it flat across the front
const dive = one([0.02, 0.36, 0.12], 0.3, [[0.9, 0.2, -0.35], [0.85, 0.15, 0.5], [0.0, 0.05, 1], [-0.7, -0.05, 0.7], [-0.92, -0.15, 0.1]], [-0.02, 0.38, 0.28]);
const diveHit = hitAt(dive, 2);

// Falling Star: the Heaven Splitter's jodan, reached through a forward somersault, then straight down
// through the target and on into the ground
const starTop = 0.32;
const starHit = 0.5;
const starGround = 0.72;
const starBody = [
  K(0, B({ ...body, twist: 0.0, lean: 0.25, crouch: -0.2, headPitch: 0.1 }), { flip: 0 }),
  K(0.2, B({ ...body, twist: 0.0, lean: 0.4, crouch: -0.24 }), { flip: 0.45, hop: 0.4 }),
  K(starTop, B({ ...body, twist: 0.02, lean: -0.05, crouch: -0.06, step: 0.36, headPitch: -0.14 }), { flip: 0.94, hop: 0.2 }),
  K(starHit, B({ ...body, twist: 0.03, lean: 0.55, crouch: -0.3, step: 0.5, back: 0.32 }), { flip: 1, hop: 0 }),
  K(starGround, B({ ...body, twist: 0.03, lean: 0.75, crouch: -0.48, step: 0.56, back: 0.36 })),
  K(1.06, B({ ...body, twist: 0.03, lean: 0.78, crouch: -0.5, step: 0.56, back: 0.36, headPitch: 0.12 })),
];
const star = keyed(starBody, [
  { s: 0, grip: [-0.13, 0.33, 0.34], dir: [0, 0.95, 0.3], g2: G2, torso: true },
  { s: 0.18, grip: [-0.09, 0.45, 0.28], dir: [0, 1, 0.15], g2: G2, torso: true },
  { s: starTop, grip: JODAN_GRIP, dir: JODAN_DIR, g2: G2, torso: true },
  { s: starHit, grip: [-0.02, 0.44, 0.46], dir: [0, 0.15, 1], g2: G2 },
  { s: starGround, grip: [-0.02, 0.38, 0.46], dir: [0, -0.35, 0.94], g2: G2 },
  { s: 1.06, grip: [-0.02, 0.38, 0.46], dir: [0, -0.4, 0.92], g2: G2 },
]);

// Ring entrance. Iai at rest: the blade in the scabbard, the right hand on the hilt and the left on the
// saya; the koiguchi push slides the guard a finger's width out (ENT_KOI); then a flat nukitsuke at
// throat height toward the opponent, held in zanshin, an o-chiburi off the right temple, and guard.
/** Where an arc's grip sits for one of its directions. */
const gripAt = (pivot: V3, r: number, dir: V3): V3 => {
  const d = N(dir);
  return [pivot[0] + d.x * r, pivot[1] + d.y * r, pivot[2] + d.z * r];
};
const ENT_KOI: V3 = gripAt(IAI_GRIP, -0.05, KATANA_SHEATH);
const ENT_SAYA: V3 = [0.08, 0.09, 0.16];
const ENT_HELD: V3 = [-0.85, 0.08, 0.52];
const ENT_FLICKED: V3 = [-0.6, -0.45, 0.65];
// the hilt runs out along the scabbard's line until the point clears the mouth, then the blade wheels
// round the hand, flat, from the left hip to the opponent and on out to the right
const ENT_OUT: V3 = gripAt(ENT_KOI, -0.32, KATANA_SHEATH);
const entDraw = arc(gripAt(ENT_OUT, -0.08, KATANA_SHEATH), 0.08, [KATANA_SHEATH, [0.9, 0.02, -0.4], [0.7, 0.08, 0.7], [0, 0.1, 1], [-0.6, 0.1, 0.8], ENT_HELD], NaN, { pivot1: [-0.55, 0.42, 0.38] });
const entDrawEnd = gripAt([-0.55, 0.42, 0.38], 0.08, ENT_HELD);
const entFlickPivot: V3 = gripAt(entDrawEnd, -0.16, ENT_HELD);
const entChiburi = arc(entFlickPivot, 0.16, [ENT_HELD, [-0.55, 0.8, -0.2], [-0.3, 0.9, 0.3], ENT_FLICKED]);
const entFlicked = gripAt(entFlickPivot, 0.16, ENT_FLICKED);
const entFlick = 0.875;
const entrance = seq([
  [-1, 0.4, line(IAI_GRIP, IAI_GRIP, KATANA_SHEATH, KATANA_SHEATH, [0, 1, 0])],
  [0.4, 0.45, line(IAI_GRIP, ENT_KOI, KATANA_SHEATH, KATANA_SHEATH, [0, 1, 0])],
  [0.45, 0.735, line(ENT_KOI, ENT_KOI, KATANA_SHEATH, KATANA_SHEATH, [0, 1, 0])],
  [0.735, 0.75, line(ENT_KOI, ENT_OUT, KATANA_SHEATH, KATANA_SHEATH, [0, 1, 0])],
  [0.75, 0.795, entDraw],
  [0.795, 0.835, line(entDrawEnd, entDrawEnd, ENT_HELD, ENT_HELD, [0, 0.7, -0.7])],
  [0.835, entFlick, entChiburi],
  [entFlick, 0.96, line(entFlicked, GUARD_GRIP, ENT_FLICKED, GUARD_DIR, GUARD_EDGE)],
  [0.96, 2, line(GUARD_GRIP, GUARD_GRIP, GUARD_DIR, GUARD_DIR, GUARD_EDGE)],
], 0.012);

// Execution, the last iai. The s axis is seconds here (the execution plays it linearly: the blow at
// 2.15 s, the rest at 3.0). The blood of the breaking blow is shaken off and the blade fed home in one
// snap; then stillness in iai, head bowed under the hat, breathing; the eyes come up and the thumb
// frees the guard. The hips sink and coil, and the draw explodes out of the mouth on a long sliding
// step: round from low by the left hip, rising across the kneeling man's neck, the arm thrown out
// high to the right at full length in zanshin. Then the o-chiburi off the right temple, down to the low guard.
const EXEC_HIT = 2.15;
const execBody = [
  K(0.0, B({ ...body, twist: -0.2, lean: 0.12, crouch: -0.14 })),
  K(0.28, B({ ...body, twist: -0.35, lean: 0.1, crouch: -0.12, side: -0.05 })),
  K(0.5, B({ ...body, twist: 0.15, lean: 0.2, crouch: -0.18, step: 0.3 })),
  K(0.66, B({ ...stanceBody, crouch: -0.2, lean: 0.26, headPitch: 0.2 })),
  K(0.95, B({ ...stanceBody, crouch: -0.24, lean: 0.3, headPitch: 0.42 })),
  K(1.2, B({ ...stanceBody, crouch: -0.21, lean: 0.28, headPitch: 0.4 })),
  K(1.42, B({ ...stanceBody, crouch: -0.25, lean: 0.3, headPitch: -0.08 })),
  K(1.7, B({ ...stanceBody, crouch: -0.3, lean: 0.28, twist: 0.4, hipTwist: 0.15, step: 0.34, back: 0.34, headPitch: -0.05 })),
  K(1.92, B({ ...stanceBody, crouch: -0.33, lean: 0.3, twist: 0.45, hipTwist: 0.2, step: 0.38, back: 0.36, headPitch: -0.05 })),
  K(EXEC_HIT, B({ ...body, crouch: -0.28, lean: 0.3, twist: -0.2, hipTwist: -0.25, step: 0.85, back: 0.5 })),
  K(2.45, B({ ...body, crouch: -0.32, lean: 0.32, twist: -0.55, hipTwist: -0.3, step: 0.88, back: 0.52, headPitch: 0.05 })),
  K(2.75, B({ ...body, crouch: -0.24, lean: 0.22, twist: -0.25, hipTwist: -0.15, step: 0.6, back: 0.4, headPitch: 0.1 })),
  K(3.0, B({ ...body, crouch: -0.18, lean: 0.16, twist: -0.05, step: 0.4, back: 0.32, headPitch: 0.15 })),
];
const execMain = keyed(execBody, [
  // the blood of the break shaken off: up beside the right temple, flicked down to the low right
  { s: 0.0, grip: GUARD_GRIP, dir: GUARD_DIR, torso: true },
  { s: 0.12, grip: [-0.36, 0.5, 0.2], dir: [-0.5, 0.85, -0.15], torso: true },
  { s: 0.28, grip: [-0.42, 0.12, 0.38], dir: [-0.55, -0.3, 0.78], torso: true },
  // noto in one snap: swung flat round to the left hip, the point fed into the mouth, home
  { s: 0.4, grip: [-0.1, 0.18, 0.42], dir: [0.15, -0.05, 1], torso: true },
  { s: 0.5, grip: [0.0, 0.14, 0.36], dir: [0.9, 0.02, -0.4], torso: true },
  { s: 0.56, grip: ENT_OUT, dir: KATANA_SHEATH, torso: true },
  { s: 0.64, grip: IAI_GRIP, dir: KATANA_SHEATH, torso: true },
  // stillness, then the thumb pushes the guard free of the mouth and holds it there, loaded
  { s: 1.42, grip: IAI_GRIP, dir: KATANA_SHEATH, torso: true },
  { s: 1.48, grip: ENT_KOI, dir: KATANA_SHEATH, torso: true },
  { s: 1.94, grip: ENT_KOI, dir: KATANA_SHEATH, torso: true },
  // the draw: out along the scabbard's line, then round from low by the left hip, rising across
  // through the neck to high on the right (the edge leads up and out)
  { s: 2.0, grip: ENT_OUT, dir: KATANA_SHEATH, torso: true },
  { s: 2.06, grip: [0.0, 0.24, 0.44], dir: [0.8, -0.35, 0.5] },
  { s: EXEC_HIT, grip: [-0.02, 0.48, 0.48], dir: [0.15, 0.22, 0.96] },
  { s: 2.3, grip: [-0.5, 0.6, 0.38], dir: [-0.6, 0.55, 0.58] },
  // zanshin: held high out to the right at full stretch
  { s: 2.45, grip: [-0.62, 0.64, 0.26], dir: [-0.75, 0.45, 0.48] },
  // o-chiburi: up beside the right temple and snapped down to the low right, where the guard is
  { s: 2.58, grip: [-0.4, 0.62, 0.12], dir: [-0.55, 0.8, -0.2], torso: true },
  { s: 2.72, grip: [-0.36, 0.1, 0.36], dir: [-0.45, -0.28, 0.85], torso: true },
  { s: 3.0, grip: GUARD_GRIP, dir: GUARD_DIR, torso: true },
], 0.1, 0.02);

export const katana: Style = {
  axis: 'y',
  offAxis: 'y',
  trail: { light: '#e8f4ff', heavy: '#bfe0ff', special: '#ff5a4a' },
  sparks: ['#ffffff', '#c8e8ff', '#fff6c0'],
  guard: P(body, X(GUARD_GRIP, GUARD_DIR, GUARD_EDGE, 'y'), null, SAYA),
  // both hands, the blade slanted up across the front, edge out
  block: P(B({ ...body, crouch: -0.18, lean: 0.04, twist: -0.1 }), X([-0.08, 0.3, 0.36], [0.4, 0.82, 0.3], [0, -0.2, 1], 'y', G2)),
  // iai: blade in the scabbard (see KATANA_SHEATH), right hand on the hilt, left hand on the saya
  stance: P(stanceBody, X(IAI_GRIP, KATANA_SHEATH, [0, 1, 0], 'y'), null, [0.08, 0.09, 0.16]),
  moves: {
    // Swallow Cut: weight settles on the back foot as the point drops low on the right; the hips open
    // first, the shoulders follow and the fists sweep flat across the waist, the left hand closing on
    // the pommel at the hit, then the wrap carries the blade up past the left shoulder
    l0: mv({
      keys: swallowBody,
      main: swallow,
      free: track([
        [-0.1, [0.14, 0.12, 0.2]],
        [0.28, [0.12, 0.16, 0.3]],
      ]),
      impacts: [swallowHit],
      chamber: -0.1,
      fx: [fx(swallowHit, 'sparkle', 'tip', 0.6), fx(swallowHit + 0.06, 'dust', 'feet', 0.6)],
    }),
    // Rising Petal: the chest turns left over the hanging blade; the hips unwind first and the one arm
    // whips the point up through them and out flat to the right, at full length at shoulder height,
    // the left arm flung out the other way and the body leaning away from the throw
    l1: mv({
      keys: petalBody,
      main: petal,
      free: track([
        [-0.1, [0.24, 0.28, 0.24]],
        [petalHit, [0.42, 0.36, 0.05]],
        [1.0, [0.6, 0.62, -0.05]],
      ]),
      impacts: [petalHit],
      chamber: -0.1,
      fx: [fx(petalHit, 'sparkle', 'tip', 0.6)],
    }),
    // Twin Swallow: tsubame-gaeshi. Both hands close in hasso by the right shoulder, weight back; the
    // kesa lands on a long step, the blade turns over in a blink and snaps back flat across.
    l2: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.65, hipTwist: -0.25, lean: -0.08, crouch: -0.06, step: 0.3, back: 0.32, headPitch: -0.05 })),
        K(twinHits[0] - 0.12, B({ ...body, twist: -0.25, hipTwist: 0.15, lean: 0.26, crouch: -0.18, step: 0.5, back: 0.34 })),
        K(twinHits[0], B({ ...body, twist: 0.25, hipTwist: 0.2, lean: 0.5, crouch: -0.3, step: 0.6, back: 0.36 })),
        K((twinHits[0] + twinHits[1]) / 2, B({ ...body, twist: 0.5, hipTwist: 0.1, lean: 0.5, crouch: -0.32, step: 0.62, back: 0.36 })),
        K(twinHits[1], B({ ...body, twist: -0.15, hipTwist: -0.15, lean: 0.48, crouch: -0.3, step: 0.64, back: 0.36 })),
        K(1.1, B({ ...body, twist: -0.7, hipTwist: -0.2, lean: 0.4, crouch: -0.3, step: 0.64, back: 0.36, headPitch: 0.08 })),
      ],
      main: twin,
      impacts: twinHits,
      chamber: -0.1,
      end: 1.1,
      fx: [fx(twinHits[0], 'sparkle', 'tip', 0.6), fx(twinHits[1], 'sparkle', 'tip', 0.8), fx(twinHits[1], 'dust', 'feet', 0.7)],
    }),
    // Heaven Splitter: tall in jodan with the chest leaning back over the straight rear leg; one long
    // stamping step and the hips drive the whole body down over the cut, folding almost flat over
    // the front knee as the blade carries on down the centre line
    h: mv({
      keys: heavenBody,
      main: heaven,
      impacts: [heavenHit],
      start: 0,
      chamber: -0.16,
      fx: [fx(heavenHit, 'stomp', 'feet', 1), fx(heavenHit, 'flashline', 'tip', 1.1)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Gatotsu: drawn up tall on a short stance, the sword hand cocked back beside the temple; the lunge
    // goes first with the blade still back, then both arms fire it straight down the line, the rear
    // leg driving straight and the chest pitched out over the front knee
    sp: mv({
      keys: gatotsuBody,
      main: gatotsu,
      free: track([
        [-0.4, [0.15, 0.2, 0.3]],
        [-0.1, [0.28, 0.42, 0.38]],
        [0.4, [0.2, 0.45, 0.35]],
      ]),
      impacts: [gatotsuHit],
      start: -0.4,
      chamber: -0.1,
      end: 1.08,
      ghosts: [0.0, 0.88],
      fx: [fx(-0.1, 'dust', 'feet', 1.2), fx(gatotsuHit, 'flashline', 'tip', 1.5, '#ffffff'), fx(gatotsuHit, 'spiral', 'tip', 1.1), fx(gatotsuHit, 'sparkle', 'tip', 1.2, '#ff8a6a')],
      trail: { life: 0.22, glow: 0.9 },
    }),
    // Iai Flash: out of the scabbard in one rising horizontal stroke, one-handed, the whole body
    // driving through on a long step; a streak of light and a gust of petals, a chiburi, then guard.
    ia: mv({
      keys: [
        K(-0.1, stanceBody),
        K(drawHit * 0.5, B({ ...body, crouch: -0.26, lean: 0.42, twist: 0.35, step: 0.5, back: 0.4 })),
        K(drawHit + 0.1, B({ ...body, crouch: -0.24, lean: 0.46, twist: 0.2, step: 0.7, back: 0.46 })),
        K(1.0, B({ ...body, crouch: -0.28, lean: 0.4, twist: -0.6, step: 0.72, back: 0.46, headPitch: 0.05 })),
        K(1.3, B({ ...body, crouch: -0.2, lean: 0.24, twist: -0.3, step: 0.5, back: 0.36, headPitch: 0.08 })),
      ],
      main: seq([
        [-0.2, 1.05, draw],
        // chiburi: the blood flicked off with a snap of the wrist, ending low on the right like the guard
        [1.05, 1.3, arc([-0.34, 0.4, 0.24], 0.15, [[-0.95, 0.42, -0.1], [-0.75, -0.4, 0.45], [-0.35, -0.3, 0.88]])],
      ], 0.06),
      free: track([
        [-0.1, [0.08, 0.09, 0.16]],
        [drawHit, [0.36, 0.22, -0.14]],
        [1.3, SAYA],
      ]),
      impacts: [drawHit],
      rest: 1.3,
      settle: 0.55,
      ghosts: [0.1, 0.8],
      fx: [fx(0.0, 'dust', 'feet', 1.1), fx(drawHit, 'flashline', 'tip', 1.6, '#ffffff'), fx(drawHit + 0.05, 'petals', 'tip', 1.2), fx(1.25, 'sparkle', 'tip', 0.4, '#ffffff')],
      trail: { life: 0.28, glow: 1 },
    }),
    // Ground Wheel: the second heavy. Out of the fold the sword arm is flung out wide to the right and
    // the stance drops wide and low; the hips fire first and one hand sweeps the blade flat across
    // their thighs and round to the left, the free arm thrown back to balance it
    h1: mv({
      keys: wheelBody,
      main: wheel,
      free: track([
        [-0.08, [0.4, 0.35, 0.1]],
        [wheelHit, [0.45, 0.3, -0.1]],
        [1.0, [0.3, 0.25, -0.2]],
      ]),
      impacts: [wheelHit],
      start: 0,
      chamber: -0.06,
      travel: 0.3,
      fx: [fx(wheelHit - 0.06, 'dust', 'feet', 0.9), fx(wheelHit, 'quake', 'tip', 0.7), fx(wheelHit, 'flashline', 'tip', 1.1)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Crescent Moon: the finisher. A full turn to the left on the lead foot, the blade trailing low;
    // it rises up the right side as the turn closes, a leap, and the kesa cleave lands on a stamp.
    h2: mv({
      keys: [
        K(0, B({ ...body, front: 'L', twist: -0.6, lean: 0.2, crouch: -0.14, step: 0.52, back: 0.3 }), { spin: 0 }),
        K(0.16, B({ ...body, front: 'L', twist: -0.3, lean: 0.26, crouch: -0.32, step: 0.3, back: 0.3, width: 0.16 }), { spin: 0.3 }),
        K(hitAt(crescent, 2), B({ ...body, front: 'R', twist: -0.55, hipTwist: -0.2, lean: 0.0, crouch: -0.12, step: 0.4, back: 0.36 }), { spin: 0.82, hop: 0.12 }),
        K(crescentTop, B({ ...body, front: 'R', twist: -0.5, hipTwist: -0.1, lean: -0.15, crouch: -0.04, step: 0.48, back: 0.38, headPitch: -0.12 }), { spin: 0.95, hop: 0.3 }),
        K(crescentHit, B({ ...body, twist: 0.2, hipTwist: 0.2, lean: 0.62, crouch: -0.38, step: 0.68, back: 0.38 }), { spin: 1, hop: 0 }),
        K(1.06, B({ ...body, twist: 0.5, hipTwist: 0.25, lean: 0.78, crouch: -0.46, step: 0.7, back: 0.38, headPitch: 0.12 }), { spin: 1 }),
      ],
      main: crescent,
      impacts: [crescentHit],
      start: 0,
      chamber: 0.12,
      flow: 1.5,
      blendIn: 0.35,
      ghosts: [0.15, crescentHit + 0.05],
      fx: [
        fx(0.05, 'dust', 'feet', 0.9),
        fx(0.3, 'whirl', 'root', 0.9, '#e8f4ff'),
        fx(crescentHit, 'stomp', 'feet', 1.1),
        fx(crescentHit, 'flashline', 'tip', 1.3),
        fx(crescentHit + 0.05, 'petals', 'tip', 1),
      ],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Gale Step: out of the dash, running low with the blade trailed behind the right hip in one hand;
    // the point whips round and the arm shoots it out level, the right shoulder driving through and
    // the left arm flung back
    dl: mv({
      keys: [
        K(-0.3, B({ ...body, twist: -0.65, hipTwist: -0.2, crouch: -0.24, lean: 0.55, step: 0.45, back: 0.45 })),
        K(0.5, B({ ...body, twist: 0.1, hipTwist: 0.1, crouch: -0.3, lean: 0.6, step: 0.72, back: 0.55 })),
        K(galeHit, B({ ...body, twist: 0.6, hipTwist: 0.2, crouch: -0.36, lean: 0.7, step: 0.9, back: 0.6, width: 0.1 })),
        K(1.08, B({ ...body, twist: 0.6, hipTwist: 0.2, crouch: -0.36, lean: 0.66, step: 0.9, back: 0.6, width: 0.1 })),
      ],
      main: gale,
      free: track([
        [-0.3, [0.24, 0.26, 0.24]],
        [0.5, [0.34, 0.3, 0.06]],
        [galeHit, [0.5, 0.36, -0.2]],
      ]),
      impacts: [galeHit],
      start: -0.3,
      chamber: -0.3,
      end: 1.08,
      fx: [fx(-0.2, 'dust', 'feet', 1), fx(galeHit, 'spiral', 'tip', 1), fx(galeHit, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.16, glow: 0.4 },
    }),
    // Thunder Draw: the dash heavy. Hasso on the run, then both hands drop the blade to the right and
    // drive one flat passing cut at the waist; the body folds right over the front knee as it carries
    // round, a white streak hanging behind
    dh: mv({
      keys: [
        K(-0.15, B({ ...body, twist: -0.8, hipTwist: -0.3, crouch: -0.24, lean: 0.4, step: 0.45, back: 0.45 })),
        K(thunderHit - 0.15, B({ ...body, twist: -0.4, hipTwist: 0.1, crouch: -0.34, lean: 0.55, step: 0.75, back: 0.55 })),
        K(thunderHit, B({ ...body, twist: 0.3, hipTwist: 0.25, crouch: -0.34, lean: 0.58, step: 0.9, back: 0.6, width: 0.12 })),
        K(1.05, B({ ...body, twist: 0.9, hipTwist: 0.3, crouch: -0.5, lean: 0.85, step: 0.9, back: 0.6, headPitch: 0.1 })),
      ],
      main: thunder,
      impacts: [thunderHit],
      chamber: -0.03,
      ghosts: [-0.1, 0.85],
      fx: [fx(-0.05, 'dust', 'feet', 1.2), fx(thunderHit, 'flashline', 'tip', 1.6, '#fff6c0'), fx(thunderHit, 'sparkle', 'tip', 1, '#fff6c0'), fx(thunderHit + 0.12, 'dust', 'feet', 1)],
      trail: { life: 0.26, glow: 0.9 },
    }),
    // Fading Cut: the rear foot slides back and the hips sink onto it while one hand rips the blade
    // up from low on the right to high on the left, the chest leaning in over it
    bl: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.6, hipTwist: -0.2, lean: 0.26, crouch: -0.18, step: 0.3, back: 0.3 })),
        K(fadingHit - 0.15, B({ ...body, twist: -0.2, hipTwist: 0.1, lean: 0.2, crouch: -0.28, step: 0.32, back: 0.5 })),
        K(fadingHit, B({ ...body, twist: 0.25, hipTwist: 0.15, lean: 0.16, crouch: -0.34, step: 0.32, back: 0.64, headPitch: 0.06 })),
        K(1.05, B({ ...body, twist: 0.65, hipTwist: 0.2, lean: -0.14, crouch: -0.3, step: 0.3, back: 0.68, headPitch: -0.1 })),
      ],
      main: fading,
      free: track([
        [-0.1, [0.2, 0.26, 0.26]],
        [fadingHit, [0.46, 0.28, -0.1]],
        [1.05, [0.4, 0.2, -0.16]],
      ]),
      impacts: [fadingHit],
      start: 0,
      chamber: -0.08,
      travel: 0.4,
      fx: [fx(fadingHit - 0.08, 'dust', 'feet', 0.8), fx(fadingHit, 'sparkle', 'tip', 0.6)],
    }),
    // Mountain Wall: the blade hung point-down in front as a wall, then wheeled up past the left
    // shoulder on a hop back, and cut down from high on the left as the weight lands on the back foot
    bh: mv({
      keys: [
        K(0, B({ ...body, twist: 0.25, lean: 0.05, crouch: -0.12, step: 0.26, back: 0.3 })),
        K(hitAt(wall, 2), B({ ...body, twist: 0.5, hipTwist: 0.2, lean: -0.15, crouch: -0.04, step: 0.24, back: 0.55, headPitch: -0.1 }), { hop: 0.06 }),
        K(wallTop, B({ ...body, twist: 0.35, hipTwist: 0.1, lean: -0.2, crouch: -0.04, step: 0.22, back: 0.68, headPitch: -0.12 }), { hop: 0.08 }),
        K(wallHit, B({ ...body, twist: -0.2, hipTwist: -0.15, lean: 0.4, crouch: -0.36, step: 0.3, back: 0.62 }), { hop: 0 }),
        K(1.05, B({ ...body, twist: -0.4, hipTwist: -0.2, lean: 0.46, crouch: -0.4, step: 0.3, back: 0.62, headPitch: 0.1 })),
      ],
      main: wall,
      impacts: [wallHit],
      start: 0,
      chamber: hitAt(wall, 2),
      travel: 0.3,
      fx: [fx(wallTop, 'dust', 'feet', 0.9), fx(wallHit, 'stomp', 'feet', 0.8), fx(wallHit, 'flashline', 'tip', 1.1)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Swallow Dive: in the air the torso coils left with the blade held out backhand in one hand; the
    // whole body whips a turn to the right and the arm flings the blade flat across the front
    jl: mv({
      keys: [
        K(0, B({ ...body, twist: 0.7, hipTwist: 0.2, lean: 0.12, crouch: -0.14 }), { spin: 0 }),
        K(hitAt(dive, 1), B({ ...body, twist: 0.4, hipTwist: -0.1, lean: 0.28, crouch: -0.18 }), { spin: -0.62 }),
        K(diveHit, B({ ...body, twist: -0.15, hipTwist: -0.2, lean: 0.4, crouch: -0.2 }), { spin: -0.95 }),
        K(1.05, B({ ...body, twist: -0.7, hipTwist: -0.25, lean: 0.36, crouch: -0.18 }), { spin: -1.02 }),
      ],
      main: dive,
      free: track([
        [0, [0.2, 0.3, 0.28]],
        [diveHit, [0.48, 0.4, -0.1]],
        [1.05, [0.44, 0.36, -0.14]],
      ]),
      impacts: [diveHit],
      start: 0,
      chamber: 0.1,
      flow: 1.3,
      blendIn: 0.4,
      fx: [fx(diveHit, 'sparkle', 'tip', 0.7), fx(diveHit, 'flashline', 'tip', 0.8)],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Falling Star: a forward somersault in the air with the blade in jodan, then straight down
    // through the target and into the ground, landing folded over the front knee
    jh: mv({
      keys: starBody,
      main: star,
      impacts: [starHit],
      start: 0,
      chamber: 0.1,
      flow: 1.4,
      blendIn: 0.35,
      end: 1.02,
      fx: [fx(starHit, 'flashline', 'tip', 1.2), fx(starGround, 'shockwave', 'tip', 0.9), fx(starGround, 'stomp', 'feet', 1)],
      trail: { life: 0.22, glow: 0.6 },
    }),
  },
  // Execution: the last iai (see execMain). One blow, rising across the neck; the cut
  // spins them half round
  executeReact: 'spin',
  execute: mv({
    keys: execBody,
    main: execMain,
    free: track([
      [0.0, SAYA],
      [0.5, KATANA_SHEATH_MOUTH],
      [0.66, ENT_SAYA],
      [1.94, ENT_SAYA],
      // saya-biki: the left hand draws the scabbard back as the right draws the blade
      [2.1, [0.24, 0.06, -0.04]],
      [2.45, [0.3, 0.1, -0.08]],
      [2.8, [0.2, 0.1, 0.06]],
      [3.0, SAYA],
    ]),
    impacts: [EXEC_HIT],
    start: 0,
    chamber: 1.95,
    end: 2.5,
    rest: 3.0,
    ghosts: [1.96, 2.35],
    fx: [
      fx(0.28, 'sparkle', 'tip', 0.6, '#ff4a3a'),
      fx(0.64, 'sparkle', 'main', 0.5, '#ffffff'),
      fx(0.66, 'dust', 'feet', 0.5),
      fx(0.8, 'fog', 'feet', 1.1),
      fx(1.0, 'petals', 'root', 0.8),
      fx(1.48, 'sparkle', 'main', 0.7, '#ffffff'),
      fx(1.97, 'dust', 'feet', 1.2),
      fx(EXEC_HIT, 'flashline', 'tip', 2, '#ffffff'),
      fx(EXEC_HIT, 'shake', 'root', 1),
      fx(EXEC_HIT + 0.02, 'petals', 'tip', 1.6),
      fx(2.72, 'sparkle', 'tip', 0.6, '#ff4a3a'),
    ],
    trail: { life: 0.34, glow: 1, color: '#ffffff' },
  }),
  // Ring entrance: still under the hat with a hand on the hilt; the thumb frees the guard and the
  // eyes come up; then one flat draw at the opponent, zanshin, the chiburi, and the low guard
  entrance: mv({
    keys: [
      K(0, B({ ...body, twist: 0.18, crouch: -0.04, lean: 0.1, step: 0.1, back: 0.1, width: 0.1, headPitch: 0.45 })),
      K(0.1, B({ ...body, twist: 0.18, crouch: -0.05, lean: 0.12, step: 0.1, back: 0.1, width: 0.1, headPitch: 0.45 })),
      K(0.19, B({ ...body, twist: 0.22, crouch: -0.13, lean: 0.16, step: 0.28, back: 0.24, width: 0.12, headPitch: 0.42 })),
      K(0.4, B({ ...body, twist: 0.22, crouch: -0.14, lean: 0.17, step: 0.28, back: 0.24, width: 0.12, headPitch: 0.42 })),
      K(0.47, B({ ...body, twist: 0.24, crouch: -0.15, lean: 0.17, step: 0.28, back: 0.24, width: 0.12, headPitch: 0.36 })),
      K(0.62, B({ ...body, twist: 0.24, crouch: -0.15, lean: 0.12, step: 0.28, back: 0.24, width: 0.12, headPitch: -0.04 })),
      K(0.73, B({ ...body, twist: 0.28, crouch: -0.19, lean: 0.16, step: 0.28, back: 0.26, width: 0.12, headPitch: -0.04 })),
      K(0.795, B({ ...body, twist: -0.5, crouch: -0.26, lean: 0.3, step: 0.5, back: 0.34, width: 0.12, headPitch: 0.02 })),
      K(0.835, B({ ...body, twist: -0.56, crouch: -0.27, lean: 0.28, step: 0.5, back: 0.34, width: 0.12, headPitch: 0.02 })),
      K(entFlick, B({ ...body, twist: -0.4, crouch: -0.22, lean: 0.2, step: 0.44, back: 0.32, headPitch: 0.05 })),
      K(0.96, body),
    ],
    main: entrance,
    free: track([
      [0.0, ENT_SAYA],
      [0.735, ENT_SAYA],
      [0.79, [0.24, 0.1, -0.02]],
      [0.86, [0.22, 0.12, 0.02]],
      [0.96, SAYA],
    ]),
    start: 0,
    rest: 1,
    lead: 0,
    ghosts: [0.735, 0.8],
    fx: [
      fx(0.02, 'dust', 'feet', 0.6),
      fx(0.05, 'petals', 'root', 0.9),
      fx(0.19, 'dust', 'feet', 0.7),
      fx(0.45, 'sparkle', 'main', 0.5, '#ffffff'),
      fx(0.75, 'dust', 'feet', 1),
      fx(hitAt(entrance, 3, 4), 'flashline', 'tip', 1.6, '#ffffff'),
      fx(hitAt(entrance, 3, 4) + 0.006, 'petals', 'tip', 1.3),
      fx(entFlick, 'sparkle', 'tip', 0.5, '#ffffff'),
    ],
    trail: { life: 0.28, glow: 1 },
  }),
};
