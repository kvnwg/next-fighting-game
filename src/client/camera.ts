/** Third-person orbit camera with a Sekiro-style lock-on. */
import * as THREE from 'three';
import { angleDiff, clamp, forward, yawTo } from '../shared/math';

export class CameraRig {
  yaw = 0;
  pitch = 0.32;
  distance = 6.2;
  private shakeT = 0;
  private shakeAmp = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private initialized = false;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

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
      player.y + 1.7 + Math.sin(this.pitch) * this.distance,
      player.z - f.z * this.distance * cosP,
    );
    // shoulder offset to the right so the player isn't dead centre
    desired.x += -Math.cos(this.yaw) * 0.6;
    desired.z += Math.sin(this.yaw) * 0.6;
    if (desired.y < 0.4) desired.y = 0.4;
    this.constrain?.(new THREE.Vector3(player.x, player.y + 1.6, player.z), desired);

    const lookAt = new THREE.Vector3(player.x, player.y + 1.4, player.z);
    if (target) {
      lookAt.lerp(new THREE.Vector3(target.x, target.y + 1.2, target.z), 0.3);
    }
    lookAt.x += -Math.cos(this.yaw) * 0.6;
    lookAt.z += Math.sin(this.yaw) * 0.6;

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
