/**
 * Third-person orbit camera with a hard lock-on, framed like Dueling Grounds: locked on, it sits
 * close behind you and just off to the side, low and nearly level, with the opponent held in the
 * middle of the frame. Free, it orbits over the right shoulder.
 */
import * as THREE from 'three';
import { angleDiff, clamp, forward, yawTo } from '../shared/math';
import { G } from './render/gfx/globals';
import { COMBAT } from '../shared/config';

/** Wide, like Dueling Grounds (Roblox's 70): the camera sits close behind you, so it needs the width. */
export const CAMERA_FOV = 70;
/** Sideways offset of the camera (and its aim) to the player's right, in metres. */
const SHOULDER = 1.4;
/** The fixed framing while locked on: pitch and boom length (scaled with your fighter's size). */

/** A camera pose for cinematic shots. */
export interface CamPose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  /** who must stay in view when that isn't what it looks at: the pose is pulled in front of props in between */
  subject?: THREE.Vector3;
}

export interface Shot {
  duration: number;
  from: CamPose;
  to: CamPose;
  /** the camera's path bends toward this point (a quadratic Bezier), e.g. to swing round someone */
  via?: THREE.Vector3;
  /** the same for where it looks: at `from.look` here, the view lingers before panning on */
  lookVia?: THREE.Vector3;
}

interface Shake {
  amp: number;
  roll: number;
  dur: number;
  t: number;
  seed: number;
}

/** Punch-in: in fast, hold on the moment, ease back out. */
const PUNCH_IN = 0.08;
const PUNCH_HOLD = 0.22;
const PUNCH_OUT = 0.3;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class CameraRig {
  yaw = 0;
  pitch = 0.4;
  distance = 6.6;
  /** settings ("reduce camera shake") and device scaling for shake and punch-ins */
  shakeScale = 1;
  /** your fighter's size relative to the reference body: bigger fighters get a wider, longer framing */
  subjectScale = 1;
  /** the same for the opponent being framed */
  targetScale = 1;
  private locked = false;
  private shakes: Shake[] = [];
  private time = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private initialized = false;
  /** the ground the duel camera stands on: follows your height slowly, so a jump doesn't lift the view */
  private baseY = 0;
  private fov = CAMERA_FOV;
  private roll = 0;
  private punchT = -1;
  private punchTarget = new THREE.Vector3();
  private punchS = 1;
  private kickOffset = new THREE.Vector3();
  private kickVel = new THREE.Vector3();
  private shots: Shot[] = [];
  private shotT = 0;
  /** total length of the shots already played through (for syncShots) */
  private shotsPlayed = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    camera.fov = CAMERA_FOV;
    camera.updateProjectionMatrix();
  }

  addMouse(dx: number, dy: number, sensitivity: number, invertY: boolean, locked: boolean): void {
    // locked on, the framing is fixed: look-around only out of a duel
    this.locked = locked;
    if (locked) return;
    const k = 0.0024 * sensitivity;
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch + dy * k * (invertY ? -1 : 1), -0.35, 1.2);
  }

  zoom(dy: number): void {
    if (this.locked) return;
    this.distance = clamp(this.distance + dy * 0.004, 3.2, 11);
  }

  /** Shakes add up (one never cuts another short); smooth noise with a little roll, fading out. */
  shake(amount: number, time = 0.25): void {
    if (this.shakes.length > 8) this.shakes.shift();
    this.shakes.push({ amp: amount * 0.55, roll: amount * 0.12, dur: Math.max(0.05, time * 1.2), t: 0, seed: Math.random() * 100 });
  }

  /**
   * Nudge in on a big moment, narrowing and tilting the view a touch. `strength` 1 is the most
   * it ever does (a deathblow); a deflect or a broken guard is a small fraction of that, so the
   * duel stays framed.
   */
  punchIn(at: THREE.Vector3, strength = 0.3): void {
    if (this.shakeScale < 0.5) return;
    // a bigger punch already running isn't cut short by a smaller one
    if (this.punchT >= 0 && this.punchT < PUNCH_IN + PUNCH_HOLD && this.punchS > strength) return;
    this.punchS = strength;
    this.punchT = 0;
    this.punchTarget.set(at.x, at.y + 1.2, at.z);
  }

  /** Knock the camera along a hit's direction on a spring. */
  kick(dirX: number, dirZ: number, amount = 0.2): void {
    this.kickVel.x += dirX * amount * 14 * this.shakeScale;
    this.kickVel.z += dirZ * amount * 14 * this.shakeScale;
  }

  /** Play cinematic shots (match intros); the follow camera resumes when they finish. */
  playShots(shots: Shot[], startAt = 0): void {
    // the poses the shots start and end on keep clear of props too, so every held frame is clear
    for (const shot of shots) {
      for (const p of [shot.from, shot.to]) this.constrain?.(p.subject ?? p.look, p.pos);
    }
    this.shots = shots;
    // joining late starts partway through
    this.shotT = startAt;
    this.shotsPlayed = 0;
  }

  /**
   * Pin the shots to an outside clock (seconds since they started), so a cinematic timed to the
   * server (an execution) stays on its animation even if frames drop.
   */
  syncShots(t: number): void {
    if (this.shots.length) this.shotT = Math.max(0, t - this.shotsPlayed);
  }

  stopShots(): void {
    this.shots = [];
  }

  snapBehind(yaw: number): void {
    this.yaw = yaw;
    this.initialized = false;
  }

  /**
   * Optional hook to pull the camera in front of obstacles. Mutates `to`. Moving shots only keep
   * inside the walls: a prop crossing the foreground mid-swing is fine, a lurch toward the subject is not.
   */
  constrain: ((from: THREE.Vector3, to: THREE.Vector3, wallsOnly?: boolean) => void) | null = null;

  /**
   * Turn the follow camera to face the target and say where it will rest: the end pose for a
   * cinematic that hands back to it without a seam.
   */
  restPose(player: THREE.Vector3, target: THREE.Vector3): CamPose {
    this.yaw = yawTo(player.x, player.z, target.x, target.z);
    const { pos, look, subject } = this.aim(player, target);
    return { pos, look, fov: CAMERA_FOV, subject };
  }

  /** Where the follow camera wants to be and to look, at the current yaw. */
  private aim(player: THREE.Vector3, target: THREE.Vector3 | null) {
    if (target) return this.duelAim(player, target);
    const f = forward(this.yaw);
    const pitch = this.pitch;
    const distance = this.distance;
    const shoulder = SHOULDER;
    const cosP = Math.cos(pitch);
    const pos = new THREE.Vector3(
      player.x - f.x * distance * cosP,
      player.y + 2.0 + Math.sin(pitch) * distance,
      player.z - f.z * distance * cosP,
    );
    // over the right shoulder so the player doesn't block the opponent
    pos.x += -Math.cos(this.yaw) * shoulder;
    pos.z += Math.sin(this.yaw) * shoulder;
    if (pos.y < 0.4) pos.y = 0.4;
    const subject = new THREE.Vector3(player.x, player.y + 1.6, player.z);
    this.constrain?.(subject, pos);

    // aim above the player's head so they sit low in frame
    const look = new THREE.Vector3(player.x, player.y + 1.9, player.z);
    // aim a little further right than the camera sits, pushing the player toward the left third
    look.x += -Math.cos(this.yaw) * shoulder * 1.3;
    look.z += Math.sin(this.yaw) * shoulder * 1.3;
    return { pos, look, subject };
  }

  /**
   * The duel camera, framed like Dueling Grounds: close behind you (about two body heights back)
   * and only a little off to the side, low and nearly level, hard-locked on the opponent so they
   * stay in the middle of the frame. It never takes the mouse.
   */
  private duelAim(player: THREE.Vector3, target: THREE.Vector3) {
    // framed for the bigger of the two
    const k = Math.max(1, this.subjectScale, this.targetScale);
    const d = Math.max(0.5, Math.hypot(target.x - player.x, target.z - player.z));
    // the axis follows the smoothed yaw, so the camera doesn't jitter with every step
    const u = forward(this.yaw);
    const rx = -u.z;
    const rz = u.x;
    // just off the line between you: ~24° up close (so your own back doesn't hide them), ~11° apart
    const close = THREE.MathUtils.smoothstep(d, 1.5, 7);
    const phi = THREE.MathUtils.lerp(0.42, 0.2, close);
    // and the whole view nudged over your right shoulder, so you stand a little left of centre
    const sh = THREE.MathUtils.lerp(0.55, 0.3, close) * k;
    // about two body heights behind you, a little further when they're far off
    const boom = THREE.MathUtils.clamp(3.3 + d * 0.08, 3.4, 4.2) * k;
    const bx = -u.x * Math.cos(phi) + rx * Math.sin(phi);
    const bz = -u.z * Math.cos(phi) + rz * Math.sin(phi);
    // eye a little over head height, looking nearly level; it stands on the slow ground height,
    // so a jump (yours or theirs) plays out in a steady frame instead of lurching it
    const ground = Math.min(player.y, this.baseY);
    const lift = Math.max(0, player.y - ground);
    // and when they're in the air it sinks a little to look up at them
    const above = Math.max(0, target.y - ground);
    const pos = new THREE.Vector3(player.x + bx * boom + rx * sh, ground + 2.3 * k + lift * 0.3 - above * 0.2, player.z + bz * boom + rz * sh);
    const subject = new THREE.Vector3(target.x, target.y + 1.2 * k, target.z);
    // only what's behind you pulls it in (it mustn't end up inside a tree or a wall). Something
    // between you and them doesn't move it at all: the prop dissolves instead (see G.uSee)
    this.constrain?.(_chest.set(player.x, player.y + 1.4 * k, player.z), pos);
    // look at them, at chest height, tilting up after whoever is in the air
    const air = above + lift * 0.35;
    const look = new THREE.Vector3(player.x + u.x * d * 0.85 + rx * sh, ground + 1.35 * k + air, player.z + u.z * d * 0.85 + rz * sh);
    return { pos, look, subject };
  }

  update(dt: number, player: THREE.Vector3, target: THREE.Vector3 | null, opts: { dodging?: boolean } = {}): void {
    this.time += dt;
    if (this.shots.length > 0 && this.updateShots(dt)) {
      // cinematics are framed by hand
      G.uSee.value[0].w = 0;
      G.uSee.value[1].w = 0;
      return;
    }
    {
      const k = Math.max(1, this.subjectScale, this.targetScale);
      G.uSee.value[0].set(player.x, player.y + 1.2 * k, player.z, 0.95 * k);
      if (target) G.uSee.value[1].set(target.x, target.y + 1.2 * k, target.z, 1.05 * k);
      else G.uSee.value[1].w = 0;
    }
    if (target) {
      const want = yawTo(player.x, player.z, target.x, target.z);
      // a hard lock: the opponent never drifts far from the middle
      this.yaw += angleDiff(this.yaw, want) * (1 - Math.exp(-dt * 18));
    }
    // a jump barely lifts the duel camera (it catches up with slopes and drops, not hops)
    if (!this.initialized) this.baseY = player.y;
    else this.baseY += (player.y - this.baseY) * (1 - Math.exp(-dt * (player.y < this.baseY ? 8 : 0.9)));
    const { pos: desired, look: lookAt } = this.aim(player, target);

    if (!this.initialized) {
      this.pos.copy(desired);
      this.look.copy(lookAt);
      this.initialized = true;
    } else {
      const k = 1 - Math.exp(-dt * 18);
      this.pos.lerp(desired, k);
      this.look.lerp(lookAt, 1 - Math.exp(-dt * 20));
    }
    const cam = this.camera.position.copy(this.pos);
    const look = _look.copy(this.look);
    let fovTarget = CAMERA_FOV + (opts.dodging ? 5 : 0);
    let roll = 0;

    if (this.punchT >= 0) {
      this.punchT += dt;
      const t = this.punchT;
      const p = t < PUNCH_IN ? t / PUNCH_IN : t < PUNCH_IN + PUNCH_HOLD ? 1 : Math.max(0, 1 - (t - PUNCH_IN - PUNCH_HOLD) / PUNCH_OUT);
      if (t > PUNCH_IN + PUNCH_HOLD + PUNCH_OUT) this.punchT = -1;
      const k = easeInOut(p) * this.punchS;
      // at full strength: a third off the boom toward the moment, the view narrowed and tilted
      _to.subVectors(this.pos, this.punchTarget).multiplyScalar(0.67).add(this.punchTarget);
      cam.lerp(_to, k);
      look.lerp(this.punchTarget, k * 0.5);
      fovTarget -= 7 * k;
      roll += 0.04 * k;
    }

    // kick: a spring offset along the hit
    this.kickVel.addScaledVector(this.kickOffset, -260 * dt);
    this.kickVel.multiplyScalar(Math.exp(-18 * dt));
    this.kickOffset.addScaledVector(this.kickVel, dt);
    cam.add(this.kickOffset);

    let sx = 0;
    let sy = 0;
    let sr = 0;
    for (const s of this.shakes) {
      s.t += dt;
      const env = Math.max(0, 1 - s.t / s.dur) ** 2;
      const n = (o: number) => Math.sin(this.time * 47 + s.seed + o) * 0.6 + Math.sin(this.time * 83 + s.seed * 1.7 + o) * 0.4;
      sx += s.amp * env * n(0);
      sy += s.amp * env * n(2.1);
      sr += s.roll * env * n(4.2);
    }
    this.shakes = this.shakes.filter((s) => s.t < s.dur);
    // shake sideways relative to the view
    cam.x += Math.cos(this.yaw) * sx * this.shakeScale;
    cam.z -= Math.sin(this.yaw) * sx * this.shakeScale;
    cam.y += sy * this.shakeScale;
    roll += sr * this.shakeScale;

    this.fov += (fovTarget - this.fov) * (1 - Math.exp(-dt / 0.08));
    this.roll += (roll - this.roll) * (1 - Math.exp(-dt / 0.05));
    this.apply(look, this.fov, this.roll);
  }

  private apply(look: THREE.Vector3, fov: number, roll: number): void {
    this.camera.lookAt(look);
    if (roll) this.camera.rotateZ(roll);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Advance the cinematic; true while a shot is still playing. */
  private updateShots(dt: number): boolean {
    this.shotT += dt;
    let shot = this.shots[0];
    while (this.shotT >= shot.duration) {
      this.shotT -= shot.duration;
      this.shotsPlayed += shot.duration;
      this.shots.shift();
      if (this.shots.length === 0) {
        // hand back to the follow camera from where the last shot ended
        this.pos.copy(shot.to.pos);
        this.look.copy(shot.to.look);
        this.fov = shot.to.fov;
        return false;
      }
      shot = this.shots[0];
    }
    const pose = posed(shot, this.shotT);
    this.pos.copy(pose.pos);
    this.look.copy(pose.look);
    this.constrain?.(this.look, this.pos, true);
    this.fov = pose.fov;
    this.camera.position.copy(this.pos);
    this.apply(this.look, this.fov, 0);
    return true;
  }
}

const _look = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _to = new THREE.Vector3();

const bezier = (a: THREE.Vector3, via: THREE.Vector3, b: THREE.Vector3, k: number) =>
  new THREE.Vector3().addScaledVector(a, (1 - k) ** 2).addScaledVector(via, 2 * k * (1 - k)).addScaledVector(b, k * k);

/** The camera `t` seconds into a shot. */
function posed(shot: Shot, t: number): CamPose {
  const k = easeInOut(clamp(t / shot.duration, 0, 1));
  const pos = shot.via ? bezier(shot.from.pos, shot.via, shot.to.pos, k) : shot.from.pos.clone().lerp(shot.to.pos, k);
  const look = shot.lookVia ? bezier(shot.from.look, shot.lookVia, shot.to.look, k) : shot.from.look.clone().lerp(shot.to.look, k);
  return { pos, look, fov: shot.from.fov + (shot.to.fov - shot.from.fov) * k };
}

/** Who a cinematic shot frames: where they stand, which way they face and how big they are. */
export interface ShotSubject {
  pos: THREE.Vector3;
  yaw: number;
  scale: number;
}

/**
 * The match intro's camera: a slow push in on the opponent, then on you, then a swing round behind
 * your shoulder that ends on `end`, the follow camera's resting pose (see `CameraRig.restPose`).
 */
export function introShots(me: ShotSubject, op: ShotSubject, end: CamPose): Shot[] {
  // in front of them, off to their right (side > 0) or left (side < 0)
  const closeUp = (f: ShotSubject, dist: number, side: number, y: number): THREE.Vector3 => {
    const fw = forward(f.yaw);
    return new THREE.Vector3(f.pos.x + fw.x * dist - Math.cos(f.yaw) * side, f.pos.y + y * f.scale, f.pos.z + fw.z * dist + Math.sin(f.yaw) * side);
  };
  const chest = (f: ShotSubject) => new THREE.Vector3(f.pos.x, f.pos.y + 1.3 * f.scale, f.pos.z);
  // both close-ups from the same side of the line between them, so the two face each other on screen;
  // then the camera swings round your left (never through you) and settles over your right shoulder.
  // A beat longer than the intro, so the lock-on is in place when the follow camera takes over.
  return [
    { duration: 1.2, from: { pos: closeUp(op, 3.2, 1.0, 1.6), look: chest(op), fov: 42 }, to: { pos: closeUp(op, 2.4, 0.7, 1.45), look: chest(op), fov: 40 } },
    { duration: 1.1, from: { pos: closeUp(me, 3.2, -1.0, 1.6), look: chest(me), fov: 42 }, to: { pos: closeUp(me, 2.4, -0.7, 1.45), look: chest(me), fov: 40 } },
    { duration: 1.3, from: { pos: closeUp(me, 2.4, -0.7, 1.45), look: chest(me), fov: 40 }, via: closeUp(me, -1.0, -4.0, 2.0), lookVia: chest(me), to: end },
  ];
}

/**
 * The execution's camera, timed to the paired animation: wide and low from the side as it begins,
 * over the kneeling victim's shoulder up at the executioner winding up, low and close from the
 * front quarter as the blow comes down (starting high, for a weapon raised overhead, and tilting
 * down onto the blow), then pulling up and away as they go down.
 * `a` is the executioner, `d` the victim, `k` the bigger body scale.
 */
export function executionShots(a: THREE.Vector3, d: THREE.Vector3, k: number): Shot[] {
  const A = a.clone();
  const D = d.clone();
  const u = new THREE.Vector3(D.x - A.x, 0, D.z - A.z);
  if (u.lengthSq() < 1e-4) u.set(0, 0, 1);
  u.normalize();
  const r = new THREE.Vector3(u.z, 0, -u.x);
  const mid = A.clone().add(D).multiplyScalar(0.5);
  const at = (base: THREE.Vector3, ru: number, uu: number, y: number) => base.clone().addScaledVector(r, ru * k).addScaledVector(u, uu * k).setY(base.y + y * k);
  const pose = (pos: THREE.Vector3, look: THREE.Vector3, fov: number, subject?: THREE.Vector3): CamPose => ({ pos, look, fov, subject });
  const hit = COMBAT.executeHitAt / 1000;
  const s1 = 0.75;
  const s2 = hit - 0.55;
  return [
    { duration: s1, from: pose(at(mid, 5.6, -0.4, 0.45), at(mid, 0, 0, 1.0), 38), to: pose(at(mid, 4.9, 0.6, 0.6), at(mid, 0, 0, 1.0), 34) },
    { duration: s2 - s1, from: pose(at(D, 2.2, 2.5, 2.0), at(A, 0, 0, 1.35), 36, at(A, 0, 0, 1.2)), to: pose(at(D, 1.9, 2.1, 1.85), at(A, 0, 0, 1.45), 32, at(A, 0, 0, 1.2)) },
    { duration: hit - s2 + 0.15, from: pose(at(mid, -4.6, -0.9, 0.55), at(mid, 0, 0.1, 1.45), 44), to: pose(at(mid, -4.0, -0.7, 0.5), at(mid, 0, 0.15, 0.95), 35) },
    { duration: COMBAT.executeTime / 1000 - hit - 0.15, from: pose(at(mid, 3.4, -0.6, 1.2), at(D, 0, 0, 0.6), 36), to: pose(at(mid, 6.2, -1.8, 3.2), at(D, 0, 0, 0.5), 44), via: at(mid, 5.2, 0.4, 2) },
  ];
}
