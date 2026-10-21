import { PerspectiveCamera, Vector3 } from 'three';
import type { Pillar } from './arena.ts';

export interface Subject {
  x: number;
  y: number;
  z: number;
}

export interface CamPose {
  pos: Vector3;
  look: Vector3;
  fov: number;
  roll: number;
}

export interface Shot {
  duration: number;
  from: CamPose;
  to: CamPose;
  ease?: (t: number) => number;
}

interface Shake {
  amp: number;
  roll: number;
  dur: number;
  t: number;
  seed: number;
}

export type ShakeKind = 'small' | 'large';

const SHAKES: Record<ShakeKind, { amp: number; roll: number; dur: number }> = {
  small: { amp: 0.05, roll: 0, dur: 0.1 },
  large: { amp: 0.2, roll: 0.035, dur: 0.25 },
};

/**
 * Lock-on framing. The boom swings off the fighters' axis toward your right and sits above head
 * height, so you stand left of center and the opponent shows in the upper middle of the frame
 * instead of behind your back (as in the reference clips).
 */
const FRAME = { yaw: 0.45, maxYaw: 1.1, elev: 0.3, boom: 3.6, side: 0.4, pivot: 1.5, lookAtOpponent: 0.65 };

export interface FighterSize {
  height: number;
  halfWidth: number;
}

const DEFAULT_SIZE: FighterSize = { height: 1.75, halfWidth: 0.32 };

/** Whether, seen from `cam`, the opponent stands clear of your fighter instead of behind them. */
function clearView(cam: Vector3, me: Subject, op: Subject, mine: FighterSize, theirs: FighterSize): boolean {
  const dx = op.x - cam.x;
  const dz = op.z - cam.z;
  const len2 = dx * dx + dz * dz || 1;
  // How far along the sight line to the opponent you stand (0 at the camera, 1 at them).
  const t = ((me.x - cam.x) * dx + (me.z - cam.z) * dz) / len2;
  if (t <= 0 || t >= 1) return true;
  const off = Math.hypot(cam.x + dx * t - me.x, cam.z + dz * t - me.z);
  // At your depth the opponent looks t times as wide as they are.
  return off >= mine.halfWidth + theirs.halfWidth * t + 0.1;
}

const PUNCH_IN = 0.08;
const PUNCH_HOLD = 0.35;
const PUNCH_OUT = 0.3;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const damp = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);

const tmp = new Vector3();
const tmp2 = new Vector3();
const framePivot = new Vector3();
const framePos = new Vector3();
const frameLook = new Vector3();

/** Lock-on camera from the design doc: shoulder rig, springs, collision, punch-ins and additive shakes. */
export class LockOnCamera {
  readonly camera: PerspectiveCamera;
  baseFov = 72;
  /** Settings toggle and device scaling for shake amplitude. */
  shakeScale = 1;
  mobile = false;
  pillars: Pillar[] = [];
  private pos = new Vector3(0, 3, -9);
  private look = new Vector3(0, 1.2, 0);
  private fov = 72;
  private roll = 0;
  private shakes: Shake[] = [];
  private punchT = -1;
  private punchTarget = new Vector3();
  private kickOffset = new Vector3();
  private kickVel = new Vector3();
  private knockdown = 0;
  /** Each fighter's height and half-width (you, then the opponent), so a big fighter never hides the other. */
  sizes: [FighterSize, FighterSize] = [DEFAULT_SIZE, DEFAULT_SIZE];
  /** True while even the widest angle leaves your fighter in front of the opponent; they fade out. */
  blocking = false;
  private shots: Shot[] = [];
  private shotT = 0;
  private shotDone: (() => void) | null = null;
  private time = 0;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(72, aspect, 0.1, 400);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  shake(kind: ShakeKind): void {
    const s = SHAKES[kind];
    this.shakes.push({ ...s, t: 0, seed: Math.random() * 100 });
  }

  punchIn(at: Subject): void {
    this.punchT = 0;
    this.punchTarget.set(at.x, at.y + 1.1, at.z);
  }

  kick(dirX: number, dirZ: number, amount = 0.2): void {
    this.kickVel.x += dirX * amount * 14;
    this.kickVel.z += dirZ * amount * 14;
  }

  /** Plays a list of cinematic shots; lock-on resumes when they finish. */
  playShots(shots: Shot[]): Promise<void> {
    this.shots = shots;
    this.shotT = 0;
    return new Promise((resolve) => {
      this.shotDone = resolve;
    });
  }

  stopShots(): void {
    this.shots = [];
    const done = this.shotDone;
    this.shotDone = null;
    done?.();
  }

  get inCinematic(): boolean {
    return this.shots.length > 0;
  }

  /** Snap to the lock-on framing (no smoothing), e.g. when a fight starts after a cinematic. */
  snapNext = false;

  update(dt: number, me: Subject, op: Subject, opts: { dodging: boolean; knockedDown: boolean }): void {
    this.time += dt;
    if (this.shots.length > 0) {
      this.updateShots(dt);
      return;
    }

    this.knockdown += ((opts.knockedDown ? 1 : 0) - this.knockdown) * damp(dt, 0.3);
    const target = this.framing(me, op, this.knockdown);

    if (this.snapNext) {
      this.pos.copy(target.pos);
      this.look.copy(target.look);
      this.snapNext = false;
    } else {
      this.pos.lerp(target.pos, damp(dt, 0.12));
      this.look.lerp(target.look, damp(dt, 0.2));
    }

    let fovTarget = this.baseFov + (opts.dodging ? 5 : 0);
    let roll = 0;
    const cam = this.camera.position.copy(this.pos);
    const look = tmp.copy(this.look);

    if (this.punchT >= 0) {
      this.punchT += dt;
      const t = this.punchT;
      const p =
        t < PUNCH_IN ? t / PUNCH_IN : t < PUNCH_IN + PUNCH_HOLD ? 1 : Math.max(0, 1 - (t - PUNCH_IN - PUNCH_HOLD) / PUNCH_OUT);
      if (t > PUNCH_IN + PUNCH_HOLD + PUNCH_OUT) this.punchT = -1;
      const k = easeInOut(p);
      // Halve the boom toward the victim, narrow the field of view, add a slight roll.
      const toCam = tmp2.subVectors(this.pos, this.punchTarget);
      const len = toCam.length() || 1;
      toCam.multiplyScalar((len * 0.5) / len).add(this.punchTarget);
      cam.lerp(toCam, k);
      look.lerp(this.punchTarget, k * 0.8);
      fovTarget -= 15 * k;
      roll += 0.07 * k;
    }

    // Kick: a spring offset toward the hit direction.
    this.kickVel.addScaledVector(this.kickOffset, -260 * dt);
    this.kickVel.multiplyScalar(Math.exp(-18 * dt));
    this.kickOffset.addScaledVector(this.kickVel, dt);
    cam.add(this.kickOffset);

    // Shakes add up; one never replaces another.
    let sx = 0;
    let syy = 0;
    let sr = 0;
    for (const s of this.shakes) {
      s.t += dt;
      const env = Math.max(0, 1 - s.t / s.dur) ** 2;
      const n = (o: number) => Math.sin(this.time * 47 + s.seed + o) * 0.6 + Math.sin(this.time * 83 + s.seed * 1.7 + o) * 0.4;
      sx += s.amp * env * n(0);
      syy += s.amp * env * n(2.1);
      sr += s.roll * env * n(4.2);
    }
    this.shakes = this.shakes.filter((s) => s.t < s.dur);
    const scale = this.shakeScale * (this.mobile ? 0.7 : 1);
    cam.x += sx * scale;
    cam.y += syy * scale;
    roll += sr * scale;

    this.fov += (fovTarget - this.fov) * damp(dt, 0.08);
    this.roll += (roll - this.roll) * damp(dt, 0.05);
    this.apply(look, this.fov, this.roll);
  }

  /** Where the lock-on rig wants to be for these two fighters (no smoothing, shakes or punch-ins). */
  private framing(me: Subject, op: Subject, knockdown: number): { pos: Vector3; look: Vector3 } {
    let ax = me.x - op.x;
    let az = me.z - op.z;
    const dist = Math.hypot(ax, az) || 1;
    ax /= dist;
    az /= dist;
    // Right of the fighter, who faces the opponent (forward = -away).
    const rightX = az;
    const rightZ = -ax;
    const ce = Math.cos(FRAME.elev);
    const se = Math.sin(FRAME.elev);
    // A taller fighter gets a higher pivot and a longer boom, so they don't fill the frame.
    const [mine, theirs] = this.sizes;
    const scale = Math.sqrt(Math.max(1, mine.height / DEFAULT_SIZE.height));

    // Lengthen the boom as the fighters separate, and pull back while you're on the floor.
    let reach = Math.min(6.5, Math.max(3.1, FRAME.boom + (dist - 3) * 0.35)) * scale;
    reach += knockdown * 1.5 + (this.mobile ? 0.6 : 0);
    const pivot = framePivot.set(me.x + rightX * FRAME.side * scale, me.y * 0.6 + FRAME.pivot * scale, me.z + rightZ * FRAME.side * scale);

    // The angle is fixed, except that it swings wider when your fighter would cover the opponent.
    for (let yaw = FRAME.yaw; ; yaw += 0.05) {
      const boomX = ax * Math.cos(yaw) + rightX * Math.sin(yaw);
      const boomZ = az * Math.cos(yaw) + rightZ * Math.sin(yaw);
      const boom = this.collide(pivot, boomX, boomZ, reach * ce) / ce;
      framePos.set(pivot.x + boomX * boom * ce, pivot.y + boom * se - knockdown * 0.35, pivot.z + boomZ * boom * ce);
      const clear = clearView(framePos, me, op, mine, theirs);
      this.blocking = !clear;
      if (clear || yaw >= FRAME.maxYaw) break;
    }

    // Mostly toward the opponent's chest, and up after them when they jump over you.
    const k = FRAME.lookAtOpponent;
    frameLook.set(
      op.x * k + me.x * (1 - k),
      theirs.height * 0.68 + op.y * k + me.y * (1 - k) + Math.max(0, op.y - me.y - 1.5) * 0.4,
      op.z * k + me.z * (1 - k),
    );
    return { pos: framePos, look: frameLook };
  }

  /** The resting lock-on pose, so a cinematic can end exactly where the fight camera starts. */
  restPose(me: Subject, op: Subject): CamPose {
    const { pos, look } = this.framing(me, op, 0);
    return { pos: pos.clone(), look: look.clone(), fov: this.baseFov, roll: 0 };
  }

  private apply(look: Vector3, fov: number, roll: number): void {
    this.camera.lookAt(look);
    this.camera.rotateZ(roll);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Pulls the camera in if a pillar sits between it and the fighter (horizontal reach in, reach out). */
  private collide(pivot: Vector3, ax: number, az: number, boom: number): number {
    let best = boom;
    for (const p of this.pillars) {
      const px = p.x - pivot.x;
      const pz = p.z - pivot.z;
      const along = px * ax + pz * az;
      if (along <= 0 || along > best) continue;
      const perp = Math.abs(px * az - pz * ax);
      if (perp < p.r + 0.35) best = Math.max(2.2, along - p.r - 0.4);
    }
    return best;
  }

  private updateShots(dt: number): void {
    this.shotT += dt;
    let shot = this.shots[0]!;
    while (this.shotT >= shot.duration) {
      this.shotT -= shot.duration;
      this.shots.shift();
      if (this.shots.length === 0) {
        this.pos.copy(shot.to.pos);
        this.look.copy(shot.to.look);
        this.fov = shot.to.fov;
        this.roll = 0;
        this.apply(shot.to.look, shot.to.fov, 0);
        const done = this.shotDone;
        this.shotDone = null;
        done?.();
        return;
      }
      shot = this.shots[0]!;
    }
    const t = (shot.ease ?? easeInOut)(Math.min(1, this.shotT / shot.duration));
    const pos = this.camera.position.lerpVectors(shot.from.pos, shot.to.pos, t);
    this.pos.copy(pos);
    const look = tmp.lerpVectors(shot.from.look, shot.to.look, t);
    this.look.copy(look);
    this.fov = shot.from.fov + (shot.to.fov - shot.from.fov) * t;
    const roll = shot.from.roll + (shot.to.roll - shot.from.roll) * t;
    this.apply(look, this.fov, roll);
  }
}

export function camPose(pos: [number, number, number], look: [number, number, number], fov = 60, roll = 0): CamPose {
  return { pos: new Vector3(...pos), look: new Vector3(...look), fov, roll };
}
