/**
 * The 3D half of the title screen: the Ronin on the cliff and a camera that moves between a few
 * shots of him, gliding from one to the next along an arc. Every shot drifts a little on its own,
 * so the frame is never quite still.
 */
import * as THREE from 'three';
import { G } from '../render/gfx/globals';
import { GameRenderer } from '../render/renderer';
import { MapView } from '../render/world';
import { TitleRonin, clothGust } from './ronin';

export type TitleShot = 'boot' | 'vista' | 'name' | 'greet' | 'rise';

interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  /** how far the camera wanders around the shot (metres) and how fast */
  drift: number;
  rate: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const SHOTS: Record<TitleShot, Shot> = {
  // the opening: close on his back and the scarf lifting off his shoulders
  boot: { pos: V(0.7, 0.8, -1.0), look: V(-0.45, 0.45, 0.9), fov: 38, drift: 0.04, rate: 0.5 },
  // behind him, the valley and the great peak beyond; he sits right of centre
  vista: { pos: V(1.45, 1.05, -2.45), look: V(1.25, -0.55, 9), fov: 50, drift: 0.1, rate: 0.22 },
  // out over the drop at his left, the sunset valley filling the left of the frame
  name: { pos: V(2.75, 0.95, 0.15), look: V(-0.2, 0.42, 1.55), fov: 46, drift: 0.07, rate: 0.3 },
  // in front of him on his open side (the scarf streams off the other), as he turns to look at you
  greet: { pos: V(-1.5, 0.88, 1.45), look: V(-0.3, 0.64, -0.2), fov: 40, drift: 0.03, rate: 0.4 },
  // low, as he rises and reaches for his sword
  rise: { pos: V(-1.55, 0.48, 1.45), look: V(0.0, 1.05, -0.2), fov: 48, drift: 0.02, rate: 0.4 },
};

/** Where the camera bows out over the void when it swings from behind him round to his side... */
const ARC_VIA = V(4.4, 1.6, -1.2);
/** ...and when it crosses in front of him. */
const FRONT_VIA = V(0.1, 1.05, 2.9);

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class TitleScene {
  /** the shot list, open to tweaking from the console in dev builds */
  static readonly shots = SHOTS;
  readonly ronin: TitleRonin;
  private shot: TitleShot = 'boot';
  private from = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50 };
  private blend = 1;
  private blendDur = 1;
  private via: THREE.Vector3 | null = null;
  private time = 0;
  private cur = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50 };
  /** extra camera push toward the look point (metres), e.g. a slow dolly in */
  push = 0;
  /** camera shake, decaying */
  private shake = 0;
  private gustT = 0;
  private gustPeak = 0;
  /** a soft warm fill from the camera's side, so he isn't only a silhouette against the sunset */
  private fill = new THREE.PointLight('#ffd6b4', 1.6, 7, 1.2);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: GameRenderer,
    private readonly map: MapView,
  ) {
    const w = G.uWind.value;
    this.ronin = new TitleRonin(new THREE.Vector2(w.x, w.y));
    scene.add(this.ronin.root);
    scene.add(this.fill);
    this.cut('boot');
  }

  get current(): TitleShot {
    return this.shot;
  }

  /** Jump straight to a shot. */
  cut(shot: TitleShot): void {
    this.shot = shot;
    this.blend = 1;
    const s = SHOTS[shot];
    this.cur.pos.copy(s.pos);
    this.cur.look.copy(s.look);
    this.cur.fov = s.fov;
  }

  /** Glide to a shot over `seconds`, swinging out over the drop when going from behind him to his side. */
  go(shot: TitleShot, seconds: number): void {
    if (shot === this.shot && this.blend >= 1) return;
    this.from.pos.copy(this.cur.pos);
    this.from.look.copy(this.cur.look);
    this.from.fov = this.cur.fov;
    const behind = this.shot === 'vista' || this.shot === 'boot';
    this.via = behind && shot === 'name' ? ARC_VIA : this.shot === 'name' && (shot === 'greet' || shot === 'rise') ? FRONT_VIA : null;
    this.shot = shot;
    this.blend = 0;
    this.blendDur = Math.max(0.01, seconds);
  }

  /** A gust: the cloth whips and the petals race, easing off over a few seconds. */
  gust(strength = 1): void {
    this.gustPeak = Math.max(this.gustPeak * Math.max(0, 1 - this.gustT / 3), strength);
    this.gustT = 0;
  }

  kick(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;

    this.gustT += dt;
    const g = this.gustPeak * Math.max(0, 1 - this.gustT / 3.2) * Math.min(1, this.gustT * 6);
    clothGust.value = g;

    const target = SHOTS[this.shot];
    const drift = V(Math.sin(t * target.rate) * target.drift, Math.sin(t * target.rate * 0.7 + 1) * target.drift * 0.4, Math.cos(t * target.rate * 0.8) * target.drift * 0.6);
    const to = { pos: target.pos.clone().add(drift), look: target.look, fov: target.fov };
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendDur);
      const k = ease(this.blend);
      if (this.via) {
        // quadratic bezier through the swing point
        const a = this.from.pos.clone().lerp(this.via, k);
        const b = this.via.clone().lerp(to.pos, k);
        this.cur.pos.copy(a.lerp(b, k));
      } else {
        this.cur.pos.lerpVectors(this.from.pos, to.pos, k);
      }
      this.cur.look.lerpVectors(this.from.look, to.look, k);
      this.cur.fov = THREE.MathUtils.lerp(this.from.fov, to.fov, k);
    } else {
      this.cur.pos.lerp(to.pos, 1 - Math.exp(-dt * 2));
      this.cur.look.lerp(to.look, 1 - Math.exp(-dt * 2));
      this.cur.fov += (to.fov - this.cur.fov) * (1 - Math.exp(-dt * 2));
    }

    // the shots are framed for landscape, with him off to one side; on a tall screen, swing the
    // look toward him and open the lens so he stays in the picture
    const tall = THREE.MathUtils.clamp((1.25 - this.renderer.width / Math.max(1, this.renderer.height)) / 0.75, 0, 1);
    const look = this.cur.look.clone().lerp(this.ronin.root.position.clone().add(V(0, 0.75, 0)), tall * 0.75);
    const fov = this.cur.fov + tall * 14;

    const cam = this.renderer.camera;
    const dir = look.clone().sub(this.cur.pos).normalize();
    cam.position.copy(this.cur.pos).addScaledVector(dir, this.push);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.05;
      cam.position.add(V(Math.sin(t * 61) * s, Math.sin(t * 47 + 1) * s, Math.sin(t * 53 + 2) * s));
    }
    cam.lookAt(look);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    this.fill.position.copy(cam.position).lerp(this.ronin.root.position, 0.35).add(V(0, 0.6, 0));
    this.ronin.camPos.copy(cam.position);
    this.ronin.update(dt);
    this.map.update(dt, this.ronin.root.position);
  }

  dispose(): void {
    clothGust.value = 0;
    this.ronin.dispose();
    const cam = this.renderer.camera;
    cam.fov = 60;
    cam.updateProjectionMatrix();
    this.scene.remove(this.ronin.root);
    this.scene.remove(this.fill);
  }
}
