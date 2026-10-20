/**
 * Third-person orbit camera with a Sekiro-style lock-on. Framed over the right shoulder: the player
 * sits in the lower-left third and, when locked on, the opponent sits right of centre, unblocked.
 */
import * as THREE from 'three';
import { angleDiff, clamp, forward, yawTo } from '../shared/math';

/** Narrower than a typical action camera so the opponent reads bigger. */
export const CAMERA_FOV = 50;
/** Sideways offset of the camera (and its aim) to the player's right, in metres. */
const SHOULDER = 1.4;

export class CameraRig {
  yaw = 0;
  pitch = 0.4;
  distance = 6.6;
  private shakeT = 0;
  private shakeAmp = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private initialized = false;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    camera.fov = CAMERA_FOV;
    camera.updateProjectionMatrix();
  }

  addMouse(dx: number, dy: number, sensitivity: number, invertY: boolean, locked: boolean): void {
    const k = 0.0024 * sensitivity;
    if (!locked) this.yaw -= dx * k;
    this.pitch = clamp(this.pitch + dy * k * (invertY ? -1 : 1), -0.35, 1.2);
  }

  zoom(dy: number): void {
    this.distance = clamp(this.distance + dy * 0.004, 3.2, 11);
  }

  shake(amount: number, time = 0.25): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeT = Math.max(this.shakeT, time);
  }

  snapBehind(yaw: number): void {
    this.yaw = yaw;
    this.initialized = false;
  }

  /** Optional hook to pull the camera in front of obstacles. Mutates `to`. */
  constrain: ((from: THREE.Vector3, to: THREE.Vector3) => void) | null = null;

  update(dt: number, player: THREE.Vector3, target: THREE.Vector3 | null): void {
    if (target) {
      const want = yawTo(player.x, player.z, target.x, target.z);
      this.yaw += angleDiff(this.yaw, want) * (1 - Math.exp(-dt * 8));
    }
    const f = forward(this.yaw);
    const cosP = Math.cos(this.pitch);
    const desired = new THREE.Vector3(
      player.x - f.x * this.distance * cosP,
      player.y + 2.0 + Math.sin(this.pitch) * this.distance,
      player.z - f.z * this.distance * cosP,
    );
    // over the right shoulder so the player doesn't block the opponent
    desired.x += -Math.cos(this.yaw) * SHOULDER;
    desired.z += Math.sin(this.yaw) * SHOULDER;
    if (desired.y < 0.4) desired.y = 0.4;
    this.constrain?.(new THREE.Vector3(player.x, player.y + 1.6, player.z), desired);

    // aim above the player's head so they sit low in frame; with a target, aim between the two
    const lookAt = new THREE.Vector3(player.x, player.y + 1.9, player.z);
    if (target) {
      lookAt.lerp(new THREE.Vector3(target.x, target.y + 1.3, target.z), 0.45);
    }
    // aim a little further right than the camera sits, pushing the player toward the left third
    lookAt.x += -Math.cos(this.yaw) * SHOULDER * 1.3;
    lookAt.z += Math.sin(this.yaw) * SHOULDER * 1.3;

    if (!this.initialized) {
      this.pos.copy(desired);
      this.look.copy(lookAt);
      this.initialized = true;
    } else {
      const k = 1 - Math.exp(-dt * 18);
      this.pos.lerp(desired, k);
      this.look.lerp(lookAt, 1 - Math.exp(-dt * 20));
    }
    this.camera.position.copy(this.pos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT) * 4;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.position.z += (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    this.camera.lookAt(this.look);
  }
}
