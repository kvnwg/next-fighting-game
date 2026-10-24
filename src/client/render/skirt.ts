/**
 * A robe that flows: the Wraith's skirt and the mist at its hem, deformed every frame as cloth hung
 * from the waist. The hem trails behind as he moves and swings on past him when he stops, lags as
 * he turns and flares out in a spin, hangs plumb whatever the hips do, ripples round the hem, drapes
 * over a knee stepping into it, and drags along the ground rather than through it.
 *
 * The voxel meshes are deformed in place: every vertex moves by a smooth function of where it sits
 * at rest, so faces that share a corner at rest still share it (the robe never tears open). The
 * normals are left as they are: the toon shading reads the folds well enough as the robe sways.
 */
import * as THREE from 'three';

interface Part {
  mesh: THREE.Mesh;
  pos: THREE.BufferAttribute;
  /**
   * Each voxel corner is shared by the faces that meet there (four vertices apiece), so the corners
   * are moved once each and copied out: `corner` maps a vertex to its corner
   */
  corner: Uint32Array;
  /** where each corner moves to this frame */
  moved: Float32Array;
  /** the corners at rest, relative to the waist (the skirt's pivot) */
  rest: Float32Array;
  /**
   * What each corner's motion depends on that never changes, worked out once: how far down the robe
   * it is (t, 0 at the waist to 1 at the hem), t^1.5 (how far its lag carries it) and that as a
   * TWIST_STEPS row, its distance from the robe's middle, and the ripple's phase there (sin, cos)
   */
  t: Float32Array;
  w: Float32Array;
  row: Uint8Array;
  rad: Float32Array;
  rs: Float32Array;
  rc: Float32Array;
}

/** the twist's rows down the robe: a vertex turns with its row (fine enough not to show steps) */
const TWIST_STEPS = 64;

/** A leg under the robe: its hip, knee and ankle joints. */
export interface SkirtLeg {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  end: THREE.Object3D;
}

// the hem's lag behind the waist (m): a damped spring toward where the air and the body's lurches
// push it, at most MAX_LAG. DRAG is how far back it streams per m/s, INERTIA per m/s^2 of a lurch
const LAG_K = 38;
const LAG_ZETA = 0.42;
const DRAG = 0.15;
const INERTIA = 0.022;
const MAX_LAG = 0.42;
// the hem's lag behind the body's turn (rad)
const TWIST_K = 28;
const TWIST_ZETA = 0.45;
const MAX_TWIST = 1.1;
// how much the robe flares in a spin (per rad/s) and at speed (per m/s), at most
const FLARE_SPIN = 0.05;
const FLARE_SPEED = 0.03;
const MAX_FLARE = 0.4;
/**
 * A leg stepping into the robe bulges it: the cloth over it is pushed out toward the leg plus its
 * girth (m), in a broad swell (SWELL leg widths to each side), but by no more than MAX_BULGE (m).
 * The legs are never seen, so the robe only has to show the step, not wrap the leg.
 */
const LEG_R = 0.085;
const SWELL = 4;
const MAX_BULGE = 0.1;
/** ripples round the hem: how many, and how deep (m) standing and at speed */
const RIPPLES = 5;
const RIPPLE = 0.012;
const RIPPLE_SPEED = 0.01;

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _lag = new THREE.Vector3();
const _down = new THREE.Vector3();
const _up = new THREE.Vector3();
const _twistC = new Float32Array(TWIST_STEPS);
const _twistS = new Float32Array(TWIST_STEPS);
const _legs = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Skirt {
  private readonly parts: Part[];
  /** waist to the lowest point of the hem at rest (local units) */
  private readonly len: number;
  private readonly prev = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly acc = new THREE.Vector3();
  private readonly lag = new THREE.Vector3();
  private readonly lagV = new THREE.Vector3();
  private started = false;
  private yaw = 0;
  private hemYaw = 0;
  private hemYawV = 0;
  private spin = 0;
  private flare = 0;
  private phase = 0;

  /** `meshes` all hang from the same pivot, the waist. */
  constructor(meshes: THREE.Mesh[], private readonly legs: SkirtLeg[]) {
    let len = 0.1;
    for (const mesh of meshes) {
      const a = (mesh.geometry as THREE.BufferGeometry).getAttribute('position')!;
      for (let i = 0; i < a.count; i++) len = Math.max(len, -a.getY(i));
    }
    this.len = len;
    this.parts = meshes.map((mesh) => {
      const geo = mesh.geometry as THREE.BufferGeometry;
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      pos.setUsage(THREE.DynamicDrawUsage);
      const at = new Map<string, number>();
      const corner = new Uint32Array(pos.count);
      const corners: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
        let c = at.get(key);
        if (c === undefined) {
          c = corners.length / 3;
          at.set(key, c);
          corners.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        }
        corner[i] = c;
      }
      const rest = new Float32Array(corners);
      const n = rest.length / 3;
      const part: Part = { mesh, pos, corner, moved: new Float32Array(n * 3), rest, t: new Float32Array(n), w: new Float32Array(n), row: new Uint8Array(n), rad: new Float32Array(n), rs: new Float32Array(n), rc: new Float32Array(n) };
      for (let i = 0; i < n; i++) {
        const x = rest[i * 3]!;
        const z = rest[i * 3 + 2]!;
        const t = Math.min(1, Math.max(0, -rest[i * 3 + 1]!) / len);
        const w = t * Math.sqrt(t);
        part.t[i] = t;
        part.w[i] = w;
        part.row[i] = Math.round(w * (TWIST_STEPS - 1));
        part.rad[i] = Math.sqrt(x * x + z * z);
        const a = Math.atan2(z, x) * RIPPLES + t * 5;
        part.rs[i] = Math.sin(a);
        part.rc[i] = Math.cos(a);
      }
      // it swings well clear of where it hangs at rest: don't let the camera cull it early
      geo.computeBoundingSphere();
      geo.boundingSphere!.radius += 0.8;
      return part;
    });
  }

  /** Flow toward this frame's pose. `floor` is the ground's height (-Infinity in the air). */
  step(dt: number, floor: number): void {
    if (dt <= 0 || !this.parts.length) return;
    const mesh = this.parts[0]!.mesh;
    mesh.updateWorldMatrix(true, false);
    mesh.matrixWorld.decompose(_p, _q, _s);
    const S = _s.y;
    // the waist's motion
    if (!this.started) {
      this.prev.copy(_p);
      this.yaw = this.hemYaw = this.bodyYaw();
      this.started = true;
    }
    _v.subVectors(_p, this.prev).divideScalar(dt);
    this.prev.copy(_p);
    // a teleport or respawn is not a gust
    if (_v.lengthSq() > 30 * 30) _v.copy(this.vel);
    _a.subVectors(_v, this.vel).divideScalar(dt);
    if (_a.length() > 50) _a.setLength(50);
    this.acc.lerp(_a, Math.min(1, dt * 18));
    this.vel.copy(_v);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const yaw = this.bodyYaw();
    this.spin += (wrap(yaw - this.yaw) / dt - this.spin) * Math.min(1, dt * 12);
    this.yaw = yaw;

    // the hem streams back from the way it moves and swings against the body's lurches
    _lag.set(-this.vel.x * DRAG - this.acc.x * INERTIA, 0, -this.vel.z * DRAG - this.acc.z * INERTIA);
    if (_lag.length() > MAX_LAG) _lag.setLength(MAX_LAG);
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    const damp = 2 * LAG_ZETA * Math.sqrt(LAG_K);
    const twistDamp = 2 * TWIST_ZETA * Math.sqrt(TWIST_K);
    for (let i = 0; i < steps; i++) {
      this.lagV.x += (LAG_K * (_lag.x - this.lag.x) - damp * this.lagV.x) * h;
      this.lagV.z += (LAG_K * (_lag.z - this.lag.z) - damp * this.lagV.z) * h;
      this.lag.x += this.lagV.x * h;
      this.lag.z += this.lagV.z * h;
      this.hemYawV += (TWIST_K * wrap(yaw - this.hemYaw) - twistDamp * this.hemYawV) * h;
      this.hemYaw += this.hemYawV * h;
    }
    if (this.lag.length() > MAX_LAG * 1.2) this.lag.setLength(MAX_LAG * 1.2);
    let twist = wrap(this.hemYaw - yaw);
    if (Math.abs(twist) > MAX_TWIST) {
      twist = Math.sign(twist) * MAX_TWIST;
      this.hemYaw = yaw + twist;
    }
    const flare = Math.min(MAX_FLARE, Math.abs(this.spin) * FLARE_SPIN + speed * FLARE_SPEED);
    this.flare += (flare - this.flare) * Math.min(1, dt * (flare > this.flare ? 10 : 3));
    this.phase += dt * (2.2 + speed * 2.5);

    // into the robe's own frame (its units, which the model's scale shrinks or grows)
    _q.invert();
    _down.set(0, -1, 0).applyQuaternion(_q);
    _up.copy(_down).negate();
    const lag = _lag.copy(this.lag).applyQuaternion(_q).divideScalar(S);
    // it hangs plumb while he is about upright, and lies along him when he is down or flipping
    const tilt = Math.acos(Math.min(1, -_down.y));
    const plumb = Math.min(1, Math.max(0, 1 - (tilt - 0.6) / 0.5));
    // swung out on its length like a pendulum, the hem rises
    const lift = lag.lengthSq() / (2 * this.len);
    const ripple = (RIPPLE + Math.min(0.03, speed * RIPPLE_SPEED)) / S;
    const legR = LEG_R / S;
    const swell = legR * SWELL;
    const bulge = MAX_BULGE / S;
    const lowest = floor === -Infinity ? -Infinity : (floor - _p.y) / S + 0.004 / S;
    for (let l = 0; l < this.legs.length; l++) {
      const leg = this.legs[l]!;
      mesh.worldToLocal(leg.upper.getWorldPosition(_legs[l * 3]!));
      mesh.worldToLocal(leg.lower.getWorldPosition(_legs[l * 3 + 1]!));
      mesh.worldToLocal(leg.end.getWorldPosition(_legs[l * 3 + 2]!));
    }

    // the ripple's travel round the hem, and the twist down the robe's rows, for this frame
    const pc = Math.cos(this.phase);
    const ps = Math.sin(this.phase);
    for (let j = 0; j < TWIST_STEPS; j++) {
      const a = (twist * j) / (TWIST_STEPS - 1);
      _twistC[j] = Math.cos(a);
      _twistS[j] = Math.sin(a);
    }

    for (const part of this.parts) {
      const { rest, t: tt, w: ww, row, rad, rs, rc, pos, corner, moved: out } = part;
      for (let i = 0, n = rest.length / 3; i < n; i++) {
        const rx = rest[i * 3]!;
        const ry = rest[i * 3 + 1]!;
        const rz = rest[i * 3 + 2]!;
        const d = ry < 0 ? -ry : 0;
        const t = tt[i]!;
        const w = ww[i]!;
        // flared out in a spin and rippling round the hem (sin(a - phase), from a's sin and cos)
        const r = rad[i]!;
        const t2 = t * t;
        const k = 1 + this.flare * t2 + (r > 1e-4 ? (ripple * t2 * (rs[i]! * pc - rc[i]! * ps)) / r : 0);
        let x = rx * k;
        let y = ry;
        let z = rz * k;
        // the hem lagging round behind the turn
        if (twist !== 0) {
          const c = _twistC[row[i]!]!;
          const s = _twistS[row[i]!]!;
          const tx = x * c + z * s;
          z = -x * s + z * c;
          x = tx;
        }
        // hung plumb from the waist, trailing behind
        x += (_down.x * d) * plumb + lag.x * w;
        y += (_down.y + 1) * d * plumb + lag.y * w + lift * w;
        z += (_down.z * d) * plumb + lag.z * w;
        // draped over a leg pressing into it: the cloth is pushed out to clear the leg at its height
        const h0 = Math.sqrt(x * x + z * z);
        let hr = h0;
        if (hr > 1e-4) {
          const ux = x / hr;
          const uz = z / hr;
          for (let l = 0; l < this.legs.length; l++) {
            const hip = _legs[l * 3]!;
            const knee = _legs[l * 3 + 1]!;
            const foot = _legs[l * 3 + 2]!;
            let px: number;
            let pz: number;
            if (y >= knee.y) {
              const u = Math.min(1, Math.max(0, (y - knee.y) / Math.max(1e-4, hip.y - knee.y)));
              px = knee.x + (hip.x - knee.x) * u;
              pz = knee.z + (hip.z - knee.z) * u;
            } else {
              const u = Math.min(1, Math.max(0, (y - foot.y) / Math.max(1e-4, knee.y - foot.y)));
              px = foot.x + (knee.x - foot.x) * u;
              pz = foot.z + (knee.z - foot.z) * u;
            }
            const perp = Math.abs(px * uz - pz * ux);
            const need = px * ux + pz * uz + legR;
            if (need > hr && perp < swell) {
              const q = 1 - (perp * perp) / (swell * swell);
              hr += Math.min(bulge, need - hr) * q * q;
            }
          }
          if (hr !== h0) {
            const sc = hr / h0;
            x *= sc;
            z *= sc;
          }
        }
        // and never through the ground: what would go under it lies along it instead, spread out
        if (lowest !== -Infinity) {
          const below = lowest - (x * _up.x + y * _up.y + z * _up.z);
          if (below > 0) {
            x += _up.x * below;
            y += _up.y * below;
            z += _up.z * below;
            if (r > 1e-4) {
              x += (rx / r) * below * 0.5;
              z += (rz / r) * below * 0.5;
            }
          }
        }
        out[i * 3] = x;
        out[i * 3 + 1] = y;
        out[i * 3 + 2] = z;
      }
      // and every face's vertices from their corners
      const arr = pos.array as Float32Array;
      for (let i = 0, n = pos.count; i < n; i++) {
        const c = corner[i]! * 3;
        arr[i * 3] = out[c]!;
        arr[i * 3 + 1] = out[c + 1]!;
        arr[i * 3 + 2] = out[c + 2]!;
      }
      pos.needsUpdate = true;
    }
  }

  /** The body's heading in the world, from the robe's frame. */
  private bodyYaw(): number {
    const e = this.parts[0]!.mesh.matrixWorld.elements;
    return Math.atan2(e[8]!, e[10]!);
  }
}
