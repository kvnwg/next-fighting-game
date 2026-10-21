/** Particles, weapon trails, warning glyphs and weather. Everything here lives on FX_LAYER. */
import * as THREE from 'three';
import { Weather } from '../../shared/maps';
import { FX_LAYER } from './renderer';
import { glyphTexture } from './textures';

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  gravity: number;
  drag: number;
  /** >0: drawn as a streak stretched along its velocity (sparks) */
  stretch: number;
  /** size multiplier reached at the end of its life (smoke billows out) */
  grow: number;
  color: THREE.Color;
}

/** Which effect a move's cue asks for (see FxKind in anim/author.ts). */
export type CueKind =
  | 'dust'
  | 'stomp'
  | 'shockwave'
  | 'quake'
  | 'sparkle'
  | 'flashline'
  | 'petals'
  | 'spiral'
  | 'whirl'
  | 'smoke'
  | 'wisps'
  | 'soulfire'
  | 'chi'
  | 'holy'
  | 'roar'
  | 'shake';

const _up = new THREE.Vector3(0, 1, 0);
const _vel = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const DUST = ['#c8b49a', '#a8957c', '#ddd0bc'];
const DEBRIS = ['#6b5a48', '#4a3d31', '#8a7660'];

const MAX_PARTICLES = 900;

let starGeo: THREE.BufferGeometry | null = null;
/** Four-pointed sparkle used for deflect/impact flashes. */
function starGeometry(): THREE.BufferGeometry {
  if (starGeo) return starGeo;
  const s = new THREE.Shape();
  const pts = 8;
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.5 : 0.09;
    const x = Math.sin(a) * r;
    const y = Math.cos(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  starGeo = new THREE.ShapeGeometry(s);
  return starGeo;
}

export class Effects {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];
  private mesh: THREE.InstancedMesh;
  private flashes: { mesh: THREE.Mesh; life: number; max: number; sx: number; sy: number }[] = [];
  private rings: { mesh: THREE.Mesh; life: number; max: number; grow: number }[] = [];
  private beams: { mesh: THREE.Mesh; life: number; max: number; width: number }[] = [];
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private tmpP = new THREE.Vector3();
  private weather: WeatherSystem | null = null;

  constructor(readonly scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(FX_LAYER);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.1, gravity: 0, drag: 0, stretch: 0, grow: 1, color: new THREE.Color() });
      this.mesh.setColorAt(i, new THREE.Color('#ffffff'));
    }
    this.mesh.count = 0;
    this.group.add(this.mesh);
    scene.add(this.group);
  }

  setWeather(kind: Weather | null): void {
    this.weather?.dispose();
    this.weather = kind ? new WeatherSystem(kind, this.group) : null;
  }

  private spawn(): Particle | null {
    for (const p of this.particles) if (!p.alive) return p;
    return null;
  }

  burst(
    pos: THREE.Vector3,
    opts: { count: number; color: string | string[]; speed: number; up?: number; life?: number; size?: number; gravity?: number; spread?: number; drag?: number; stretch?: number; grow?: number },
  ): void {
    const colors = Array.isArray(opts.color) ? opts.color : [opts.color];
    for (let i = 0; i < opts.count; i++) {
      const p = this.spawn();
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * (opts.spread ?? 1.2);
      const sp = opts.speed * (0.4 + Math.random() * 0.8);
      p.alive = true;
      p.x = pos.x;
      p.y = pos.y;
      p.z = pos.z;
      p.vx = Math.cos(a) * Math.cos(e) * sp;
      p.vz = Math.sin(a) * Math.cos(e) * sp;
      p.vy = Math.sin(e) * sp + (opts.up ?? 0);
      p.max = p.life = (opts.life ?? 0.5) * (0.6 + Math.random() * 0.8);
      p.size = (opts.size ?? 0.08) * (0.7 + Math.random() * 0.6);
      p.gravity = opts.gravity ?? 9;
      p.drag = opts.drag ?? 1.5;
      p.stretch = opts.stretch ?? 0;
      p.grow = opts.grow ?? 1;
      p.color.set(colors[Math.floor(Math.random() * colors.length)]);
    }
  }

  /** One particle with an explicit velocity (spirals, wisps, sweeps). */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: string, o: { life?: number; size?: number; gravity?: number; drag?: number; stretch?: number; grow?: number } = {}): void {
    const p = this.spawn();
    if (!p) return;
    p.alive = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.max = p.life = (o.life ?? 0.5) * (0.8 + Math.random() * 0.4);
    p.size = (o.size ?? 0.08) * (0.8 + Math.random() * 0.4);
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 1.5;
    p.stretch = o.stretch ?? 0;
    p.grow = o.grow ?? 1;
    p.color.set(color);
  }

  /** Billboard flash (parry spark star, impact). */
  flash(pos: THREE.Vector3, color: string, size: number, life = 0.15): void {
    const mesh = new THREE.Mesh(
      starGeometry(),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    mesh.position.copy(pos);
    mesh.scale.setScalar(size);
    mesh.layers.set(FX_LAYER);
    mesh.rotation.z = Math.random() * Math.PI;
    this.group.add(mesh);
    this.flashes.push({ mesh, life, max: life, sx: size, sy: size });
    // a smaller, stretched second star rotated 45deg adds sparkle
    const m2 = mesh.clone();
    m2.material = mesh.material.clone();
    this.group.add(m2);
    this.flashes.push({ mesh: m2, life, max: life, sx: size * 1.5, sy: size * 0.45 });
  }

  /** Expanding ring (posture break, deathblow, landing). Flat on the ground unless given a normal. */
  ring(pos: THREE.Vector3, color: string, radius: number, life = 0.45, normal?: THREE.Vector3, additive = false): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    if (normal) mesh.quaternion.setFromUnitVectors(Z_AXIS, normal.clone().normalize());
    else mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, pos.y + (normal ? 0 : 0.06), pos.z);
    mesh.scale.setScalar(0.2);
    mesh.layers.set(FX_LAYER);
    this.group.add(mesh);
    this.rings.push({ mesh, life, max: life, grow: radius });
  }

  /** A bright streak between two points that thins out as it fades (draw cuts, light shafts, chains). */
  beam(a: THREE.Vector3, b: THREE.Vector3, color: string, width = 0.05, life = 0.22): void {
    const len = a.distanceTo(b);
    if (len < 1e-3) return;
    const mesh = new THREE.Mesh(
      beamGeometry(),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    );
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(_up, _c.subVectors(b, a).normalize());
    mesh.scale.set(width, len, width);
    mesh.layers.set(FX_LAYER);
    this.group.add(mesh);
    this.beams.push({ mesh, life, max: life, width });
  }

  /** Sparks thrown in a cone along `dir` (impacts spray the way the weapon was travelling). */
  spray(pos: THREE.Vector3, dir: THREE.Vector3, colors: string[], count: number, speed: number, cone = 0.55, o: { life?: number; size?: number; gravity?: number; stretch?: number } = {}): void {
    const d = _a.copy(dir).normalize();
    for (let i = 0; i < count; i++) {
      const sp = speed * (0.45 + Math.random() * 0.8);
      const vx = d.x + (Math.random() - 0.5) * 2 * cone;
      const vy = d.y + (Math.random() - 0.35) * 2 * cone;
      const vz = d.z + (Math.random() - 0.5) * 2 * cone;
      const l = Math.hypot(vx, vy, vz) || 1;
      this.emit(pos.x, pos.y, pos.z, (vx / l) * sp, (vy / l) * sp, (vz / l) * sp, colors[i % colors.length], { life: o.life ?? 0.26, size: o.size ?? 0.05, gravity: o.gravity ?? 5, drag: 3.5, stretch: o.stretch ?? 0.1 });
    }
  }

  /** A guard shattering: big pale flakes flung mostly along the blow, tumbling down. */
  shards(pos: THREE.Vector3, dir: THREE.Vector3, count = 36): void {
    const cols = ['#ffffff', '#e8f0ff', '#cfe0ff', '#ffe6d6'];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 7;
      const vx = dir.x * sp * 0.6 + Math.cos(a) * sp * 0.6;
      const vz = dir.z * sp * 0.6 + Math.sin(a) * sp * 0.6;
      this.emit(pos.x, pos.y, pos.z, vx, 1 + Math.random() * 4, vz, cols[i % cols.length], { life: 0.75, size: 0.12 + Math.random() * 0.14, gravity: 9, drag: 1.5, stretch: 0.02 });
    }
    this.flash(pos, '#ffffff', 1.6, 0.16);
  }

  /** A bright slash streak through an impact, along the swing: a coloured stroke with a white core. */
  slash(pos: THREE.Vector3, dir: THREE.Vector3, color: string, length = 1.2, width = 0.07): void {
    // fresh vectors: beam() uses the shared scratch ones
    const d = dir.clone().normalize().multiplyScalar(length / 2);
    const a = pos.clone().sub(d);
    const b = pos.clone().add(d);
    this.beam(a, b, color, width, 0.14);
    this.beam(a, b, '#ffffff', width * 0.38, 0.1);
  }

  // ---------------------------------------------------------------- move effects

  /** A soft puff of dust at the feet. */
  dust(pos: THREE.Vector3, scale = 1): void {
    this.burst(pos, { count: Math.round(10 * scale), color: DUST, speed: 2.2 * scale, up: 0.6, life: 0.55, size: 0.11 * scale, gravity: 1, drag: 4, spread: 0.4, grow: 2.2 });
  }

  /** Thrown stones and clods. */
  debris(pos: THREE.Vector3, scale = 1): void {
    this.burst(pos, { count: Math.round(14 * scale), color: DEBRIS, speed: 5 * scale, up: 4 * scale, life: 0.9, size: 0.09, gravity: 18, drag: 0.6, spread: 0.6 });
  }

  /** A ground impact: dust ring, debris, a ring of light. */
  shockwave(pos: THREE.Vector3, scale = 1, color = '#ffd27a'): void {
    this.ring(pos, color, 3.2 * scale, 0.5, undefined, true);
    this.ring(pos, '#c8b49a', 2.2 * scale, 0.7);
    this.debris(pos, 1.3 * scale);
    for (let i = 0; i < 14 * scale; i++) {
      const a = (i / (14 * scale)) * Math.PI * 2;
      this.emit(pos.x, pos.y + 0.1, pos.z, Math.cos(a) * 6 * scale, 0.6, Math.sin(a) * 6 * scale, DUST[i % 3], { life: 0.6, size: 0.16 * scale, drag: 5, gravity: 0.5, grow: 2.5 });
    }
    this.flash(_a.copy(pos).setY(pos.y + 0.3), color, 1.2 * scale, 0.15);
  }

  /** Earth thrown up where a sweep skims the ground. */
  quake(pos: THREE.Vector3, dir: THREE.Vector3, scale = 1): void {
    for (let i = 0; i < 10 * scale; i++) {
      const s = 1 + Math.random() * 2;
      this.emit(pos.x, 0.08, pos.z, dir.x * s + (Math.random() - 0.5) * 2, 3 + Math.random() * 4, dir.z * s + (Math.random() - 0.5) * 2, DEBRIS[i % 3], { life: 0.8, size: 0.1, gravity: 16, drag: 0.5 });
    }
    this.dust(_a.copy(pos).setY(0.05), 0.8 * scale);
  }

  sparkle(pos: THREE.Vector3, color = '#ffffff', scale = 1): void {
    this.flash(pos, color, 0.55 * scale, 0.14);
    this.burst(pos, { count: Math.round(6 * scale), color: [color, '#ffffff'], speed: 4, life: 0.25, size: 0.04, gravity: 2, drag: 4, stretch: 0.06 });
  }

  /** Cherry petals scattered from a cut. */
  petals(pos: THREE.Vector3, scale = 1): void {
    const cols = ['#f6b8cc', '#f39dba', '#ffd6e2', '#ffffff'];
    for (let i = 0; i < 22 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3;
      this.emit(pos.x, pos.y, pos.z, Math.cos(a) * sp, 0.5 + Math.random() * 2, Math.sin(a) * sp, cols[i % 4], { life: 1.2, size: 0.07, gravity: 1.2, drag: 2.5 });
    }
  }

  /** Wind spiralling along a thrust. */
  spiral(pos: THREE.Vector3, dir: THREE.Vector3, color: string, length = 2.2, scale = 1): void {
    const d = _a.copy(dir).normalize();
    const u = _b.crossVectors(d, _up);
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
    u.normalize();
    const w = _c.crossVectors(d, u).normalize();
    const turns = 3;
    const n = Math.round(36 * scale);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const ang = t * turns * Math.PI * 2;
      const r = 0.25 + t * 0.15;
      const ox = (u.x * Math.cos(ang) + w.x * Math.sin(ang)) * r;
      const oy = (u.y * Math.cos(ang) + w.y * Math.sin(ang)) * r;
      const oz = (u.z * Math.cos(ang) + w.z * Math.sin(ang)) * r;
      const x = pos.x + d.x * length * t + ox;
      const y = pos.y + d.y * length * t + oy;
      const z = pos.z + d.z * length * t + oz;
      this.emit(x, y, z, d.x * 4 + ox * 4, d.y * 4 + oy * 4, d.z * 4 + oz * 4, i % 3 ? color : '#ffffff', { life: 0.35, size: 0.06, drag: 3, stretch: 0.05 });
    }
  }

  /** A ring of wind around the fighter (spins). */
  whirl(pos: THREE.Vector3, scale = 1, color = '#e8f6ff'): void {
    this.ring(_a.copy(pos).setY(Math.max(0.05, pos.y - 0.9)), color, 3 * scale, 0.4, undefined, true);
    const n = Math.round(28 * scale);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 1.1 * scale;
      this.emit(pos.x + Math.cos(a) * r, pos.y - 0.4 + Math.random() * 0.6, pos.z + Math.sin(a) * r, -Math.sin(a) * 6, 0.4, Math.cos(a) * 6, i % 2 ? color : '#ffffff', { life: 0.35, size: 0.06, drag: 2, stretch: 0.05 });
    }
  }

  /** Shadow smoke (vanishes, the Assassin's dashes). */
  smoke(pos: THREE.Vector3, scale = 1, color = '#3a2a5a'): void {
    const cols = [color, '#1d1730', '#6a4a9a'];
    for (let i = 0; i < 18 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 1.6;
      this.emit(pos.x, pos.y + Math.random() * 1.2, pos.z, Math.cos(a) * sp, 0.4 + Math.random() * 0.8, Math.sin(a) * sp, cols[i % 3], { life: 0.7, size: 0.16 * scale, gravity: -0.4, drag: 2.5, grow: 2.6 });
    }
  }

  /** A lightning bolt from the sky onto `pos`: a jagged main channel, a few forks, a flash and a scorch ring. */
  bolt(pos: THREE.Vector3, color = '#ffe27a', scale = 1): void {
    const top = new THREE.Vector3(pos.x + (Math.random() - 0.5) * 2, pos.y + 16, pos.z + (Math.random() - 0.5) * 2);
    let a = top;
    const steps = 9;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const j = i === steps ? 0 : 0.7 * (1 - k * 0.6);
      const b = new THREE.Vector3(top.x + (pos.x - top.x) * k + (Math.random() - 0.5) * j, top.y + (pos.y - top.y) * k, top.z + (pos.z - top.z) * k + (Math.random() - 0.5) * j);
      this.beam(a, b, color, 0.12 * scale, 0.32);
      this.beam(a, b, '#ffffff', 0.04 * scale, 0.26);
      if (i > 2 && i < steps && Math.random() < 0.45) {
        const fork = b.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, -1.4 - Math.random(), (Math.random() - 0.5) * 2.4));
        this.beam(b, fork, color, 0.05 * scale, 0.22);
      }
      a = b;
    }
    this.flash(new THREE.Vector3(pos.x, pos.y + 0.6, pos.z), '#fff6d0', 4 * scale, 0.25);
    this.ring(pos, color, 2.6 * scale, 0.5, undefined, true);
    this.spray(new THREE.Vector3(pos.x, pos.y + 0.1, pos.z), new THREE.Vector3(0, 1, 0), [color, '#ffffff'], 26 * scale, 6, 1.2, { life: 0.5, size: 0.05, gravity: 9, stretch: 0.05 });
  }

  /**
   * The flare of a clean hit: one long thin glowing line across the target along the cut, a short
   * cross-line, and a four-point star at the contact.
   */
  hitFlare(pos: THREE.Vector3, along: THREE.Vector3, toCam: THREE.Vector3, color = '#ff3a5a', scale = 1): void {
    const a = new THREE.Vector3().copy(along).projectOnPlane(toCam);
    if (a.lengthSq() < 1e-4) a.set(1, 0, 0);
    a.normalize();
    const b = new THREE.Vector3().crossVectors(toCam, a).normalize();
    const L = 1.9 * scale;
    this.beam(pos.clone().addScaledVector(a, -L), pos.clone().addScaledVector(a, L), color, 0.07 * scale, 0.22);
    this.beam(pos.clone().addScaledVector(a, -L * 0.9), pos.clone().addScaledVector(a, L * 0.9), '#ffffff', 0.022 * scale, 0.16);
    this.beam(pos.clone().addScaledVector(b, -0.45 * scale), pos.clone().addScaledVector(b, 0.45 * scale), '#ffe0e6', 0.03 * scale, 0.12);
    this.flash(pos, '#ffffff', 0.9 * scale, 0.1);
    this.flash(pos, color, 1.7 * scale, 0.2);
  }

  /** A shatter: white and red shards flung out in every direction. */
  shatter(pos: THREE.Vector3, scale = 1): void {
    for (let i = 0; i < 46 * scale; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = 5 + Math.random() * 9;
      this.emit(pos.x, pos.y, pos.z, r * Math.cos(t) * sp, u * sp + 2, r * Math.sin(t) * sp, i % 4 ? '#ffffff' : '#ff2a3a', { life: 0.55, size: 0.07, gravity: 7, drag: 2.5, stretch: 0.14 });
    }
    this.flash(pos, '#ffffff', 3 * scale, 0.18);
    this.ring(pos, '#ffffff', 3.4 * scale, 0.4, undefined, true);
  }

  /** Low mist rolling out across the ground. */
  fog(pos: THREE.Vector3, scale = 1, color = '#b8c0cc'): void {
    for (let i = 0; i < 34 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.8;
      const sp = 0.4 + Math.random() * 1.1;
      this.emit(pos.x + Math.cos(a) * r, 0.05 + Math.random() * 0.25, pos.z + Math.sin(a) * r, Math.cos(a) * sp, 0.03, Math.sin(a) * sp, i % 3 ? color : '#8a92a0', { life: 2.6, size: 0.3 * scale, drag: 0.7, grow: 3.2 });
    }
  }

  /** Sparks and embers rising around a fighter. */
  embers(pos: THREE.Vector3, scale = 1, color = '#ff9a3a'): void {
    for (let i = 0; i < 28 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.3 + Math.random() * 1.1;
      this.emit(pos.x + Math.cos(a) * r, 0.1 + Math.random() * 1.4, pos.z + Math.sin(a) * r, Math.cos(a) * 0.3, 0.8 + Math.random() * 1.4, Math.sin(a) * 0.3, i % 4 ? color : '#ffe2a0', { life: 1.4, size: 0.04, gravity: -0.6, drag: 0.8 });
    }
  }

  /** Soul wisps rising and curling away. */
  wisps(pos: THREE.Vector3, color = '#7cffb2', scale = 1): void {
    for (let i = 0; i < 12 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit(pos.x, pos.y, pos.z, Math.cos(a) * 1.2, 1.2 + Math.random() * 1.5, Math.sin(a) * 1.2, i % 3 ? color : '#e8fff0', { life: 0.9, size: 0.07, gravity: -1.2, drag: 1.5, grow: 1.6 });
    }
  }

  /** Green fire licking along the ground under a sweep. */
  soulfire(pos: THREE.Vector3, scale = 1): void {
    const cols = ['#63c74d', '#3cff8a', '#b8ffd0', '#1e6f45'];
    for (let i = 0; i < 16 * scale; i++) {
      this.emit(pos.x + (Math.random() - 0.5) * 0.6, 0.08, pos.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 1.5 + Math.random() * 2.2, (Math.random() - 0.5) * 0.6, cols[i % 4], { life: 0.7, size: 0.1, gravity: -0.6, drag: 2, grow: 0.4 });
    }
  }

  /** A burst of chi: a ring facing the strike and sparks thrown forward. */
  chi(pos: THREE.Vector3, dir: THREE.Vector3, color = '#ff9a2a', scale = 1): void {
    this.ring(pos, color, 1.8 * scale, 0.3, dir, true);
    this.ring(pos, '#fff0c8', 1.1 * scale, 0.22, dir, true);
    this.flash(pos, color, 0.8 * scale, 0.12);
    for (let i = 0; i < 14 * scale; i++) {
      this.emit(pos.x, pos.y, pos.z, dir.x * (5 + Math.random() * 5) + (Math.random() - 0.5) * 3, (Math.random() - 0.3) * 3, dir.z * (5 + Math.random() * 5) + (Math.random() - 0.5) * 3, i % 2 ? color : '#ffe0a0', { life: 0.3, size: 0.05, drag: 3, stretch: 0.07 });
    }
  }

  /** A golden flare with shafts of light. */
  holy(pos: THREE.Vector3, scale = 1): void {
    const gold = '#ffd86a';
    this.ring(_a.copy(pos).setY(0.05), gold, 3 * scale, 0.6, undefined, true);
    this.flash(_b.copy(pos).setY(pos.y + 0.4), '#fff4c0', 1.4 * scale, 0.22);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.9;
      const x = pos.x + Math.cos(a) * r;
      const z = pos.z + Math.sin(a) * r;
      this.beam(_a.set(x, 0, z), _b.set(x, 2.6 + Math.random() * 1.6, z), gold, 0.07 * scale, 0.45);
    }
    this.burst(pos, { count: Math.round(18 * scale), color: [gold, '#ffffff'], speed: 3, up: 2, life: 0.8, size: 0.05, gravity: -1, drag: 2 });
  }

  /** A war cry: a red pulse and a ring of force. */
  roar(pos: THREE.Vector3, scale = 1): void {
    this.ring(_a.copy(pos).setY(0.05), '#ff4a2a', 3.4 * scale, 0.5, undefined, true);
    this.ring(_a.copy(pos).setY(0.05), '#ffb02a', 2.4 * scale, 0.7, undefined, true);
    this.dust(_a.copy(pos).setY(0.05), 1.4 * scale);
    this.burst(_a.copy(pos).setY(pos.y + 1), { count: 24, color: ['#ff6a2a', '#ffb030', '#ff2a1a'], speed: 5, up: 1, life: 0.5, size: 0.07, gravity: -2, drag: 2 });
  }

  update(dt: number, camera: THREE.Camera): void {
    let n = 0;
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02 && p.gravity > 0) {
        p.y = 0.02;
        p.vy *= -0.3;
        p.vx *= 0.5;
        p.vz *= 0.5;
      }
      const age = 1 - p.life / p.max;
      const s = p.size * (1 + (p.grow - 1) * age) * Math.min(1, (p.life / p.max) * 2);
      this.tmpP.set(p.x, p.y, p.z);
      if (p.stretch > 0) {
        _vel.set(p.vx, p.vy, p.vz);
        const speed = _vel.length();
        if (speed > 1e-4) this.tmpQ.setFromUnitVectors(_up, _vel.multiplyScalar(1 / speed));
        this.tmpS.set(s * 0.6, s * (1 + speed * p.stretch), s * 0.6);
      } else {
        this.tmpQ.identity();
        this.tmpS.set(s, s, s);
      }
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.mesh.setMatrixAt(n, this.tmpM);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const t = 1 - f.life / f.max;
      f.mesh.quaternion.copy(camera.quaternion);
      f.mesh.rotateZ(f.sx !== f.sy ? Math.PI / 4 + t * 0.4 : t * 0.4);
      const k = 0.6 + t * 0.9;
      f.mesh.scale.set(f.sx * k, f.sy * k, 1);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t * t);
      if (f.life <= 0) {
        this.group.remove(f.mesh);
        (f.mesh.material as THREE.Material).dispose();
        this.flashes.splice(i, 1);
      }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const bm = this.beams[i];
      bm.life -= dt;
      const t = 1 - bm.life / bm.max;
      const w = bm.width * (1 - t * 0.8);
      bm.mesh.scale.x = w;
      bm.mesh.scale.z = w;
      (bm.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t * t);
      if (bm.life <= 0) {
        this.group.remove(bm.mesh);
        (bm.mesh.material as THREE.Material).dispose();
        this.beams.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.2 + t * r.grow);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      if (r.life <= 0) {
        this.group.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
    this.weather?.update(dt, camera.position);
  }

  dispose(): void {
    this.weather?.dispose();
    this.scene.remove(this.group);
  }
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
let beamGeo: THREE.BufferGeometry | null = null;
/** A unit cylinder along +Y, shared by every beam. */
function beamGeometry(): THREE.BufferGeometry {
  if (!beamGeo) beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  return beamGeo;
}

/** A ribbon following a weapon's base->tip segment while it swings. */
export class WeaponTrail {
  readonly mesh: THREE.Mesh;
  /** seconds a point of the ribbon lives */
  private life = 0.13;
  private readonly max = 72;
  private pts: { b: THREE.Vector3; t: THREE.Vector3; age: number }[] = [];
  private positions: Float32Array;
  private alphas: Float32Array;
  private prevPos = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  private hasPrev = false;
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  constructor(color: string) {
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.max * 2 * 3);
    this.alphas = new Float32Array(this.max * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    const idx: number[] = [];
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, glow: { value: 0 } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      // the leading edge burns toward white; glow brightens heavy and special swings
      fragmentShader: `uniform vec3 color; uniform float glow; varying float vA; void main(){ vec3 c = mix(color, vec3(1.0), vA * (0.35 + glow * 0.4)); gl_FragColor = vec4(c * (1.0 + glow * 0.6), min(1.0, vA * (0.85 + glow * 0.3))); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(FX_LAYER);
    this.mesh.visible = false;
  }

  setColor(c: string): void {
    ((this.mesh.material as THREE.ShaderMaterial).uniforms.color.value as THREE.Color).set(c);
  }

  /** Per-move look: how long the ribbon lingers and how bright it burns. */
  setStyle(life: number, glow: number): void {
    this.life = life;
    (this.mesh.material as THREE.ShaderMaterial).uniforms.glow.value = glow;
  }

  /**
   * Feed the weapon's world transform each frame plus its trail anchors in weapon space. Between
   * frames the transform is interpolated (slerped), so fast swings leave a smooth curve, not a fan.
   */
  update(dt: number, emitting: boolean, pos: THREE.Vector3, quat: THREE.Quaternion, scale: number, base: THREE.Vector3, tip: THREE.Vector3): void {
    for (const pt of this.pts) pt.age += dt;
    while (this.pts.length && this.pts[this.pts.length - 1].age > this.life) this.pts.pop();
    if (emitting && this.hasPrev) {
      const angle = this.prevQuat.angleTo(quat);
      const moved = this.prevPos.distanceTo(pos);
      const steps = Math.max(1, Math.min(10, Math.ceil(Math.max(angle / 0.05, moved / 0.04))));
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        this.p.lerpVectors(this.prevPos, pos, k);
        this.q.slerpQuaternions(this.prevQuat, quat, k);
        this.pts.unshift({
          b: base.clone().multiplyScalar(scale).applyQuaternion(this.q).add(this.p),
          t: tip.clone().multiplyScalar(scale).applyQuaternion(this.q).add(this.p),
          age: dt * (1 - k),
        });
      }
      if (this.pts.length > this.max) this.pts.length = this.max;
    }
    this.prevPos.copy(pos);
    this.prevQuat.copy(quat);
    this.hasPrev = true;

    const count = this.pts.length;
    this.mesh.visible = count > 1;
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.max; i++) {
      const pt = this.pts[Math.min(i, count - 1)];
      this.positions.set([pt.b.x, pt.b.y, pt.b.z], i * 6);
      this.positions.set([pt.t.x, pt.t.y, pt.t.z], i * 6 + 3);
      const a = i < count ? Math.pow(1 - pt.age / this.life, 1.6) : 0;
      this.alphas[i * 2] = a * 0.15;
      this.alphas[i * 2 + 1] = a;
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
  }

  /** Drop the trail (e.g. after a teleport). */
  reset(): void {
    this.pts = [];
    this.hasPrev = false;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Floating icon above a fighter (perilous warning). */
export function makeGlyph(text: string, color: string, bg: string): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(text, color, bg), depthTest: false, transparent: true, toneMapped: false }));
  s.scale.setScalar(0.7);
  s.layers.set(FX_LAYER);
  s.renderOrder = 10;
  return s;
}

const WEATHER: Record<Weather, { count: number; colors: string[]; size: [number, number, number]; fall: number; sway: number; area: number; height: number; wind?: [number, number] }> = {
  petals: { count: 320, colors: ['#f6b8cc', '#f39dba', '#ffd6e2'], size: [0.14, 0.02, 0.11], fall: 0.8, sway: 1.2, area: 26, height: 12, wind: [1.4, 0.4] },
  snow: { count: 500, colors: ['#ffffff', '#e8f0fa'], size: [0.07, 0.07, 0.07], fall: 1.6, sway: 0.8, area: 28, height: 14 },
  embers: { count: 240, colors: ['#ffb030', '#ff7a1a', '#ffd84a'], size: [0.06, 0.06, 0.06], fall: -1.2, sway: 0.6, area: 22, height: 10, wind: [0.5, 0.2] },
  rain: { count: 700, colors: ['#9fb8d0', '#c0d4e6'], size: [0.025, 0.5, 0.025], fall: 16, sway: 0.1, area: 26, height: 16 },
  fireflies: { count: 120, colors: ['#e8ff7a', '#c8ff5a'], size: [0.07, 0.07, 0.07], fall: 0, sway: 0.6, area: 24, height: 4 },
  leaves: { count: 160, colors: ['#e07a2a', '#c8502a', '#e8a83a'], size: [0.12, 0.02, 0.09], fall: 1.1, sway: 1.8, area: 28, height: 12, wind: [1.0, 0.3] },
  pollen: { count: 140, colors: ['#fff6c0', '#ffffff'], size: [0.04, 0.04, 0.04], fall: 0.15, sway: 0.5, area: 30, height: 6 },
};

class WeatherSystem {
  private mesh: THREE.InstancedMesh;
  private pts: { x: number; y: number; z: number; ph: number; spd: number }[] = [];
  private cfg: (typeof WEATHER)[Weather];
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private one = new THREE.Vector3(1, 1, 1);
  private p = new THREE.Vector3();

  constructor(
    readonly kind: Weather,
    readonly parent: THREE.Group,
  ) {
    this.cfg = WEATHER[kind];
    const [w, h, d] = this.cfg.size;
    const glow = kind === 'embers' || kind === 'fireflies';
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ transparent: kind === 'rain', opacity: kind === 'rain' ? 0.6 : 1, toneMapped: !glow }),
      this.cfg.count,
    );
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(FX_LAYER);
    const c = new THREE.Color();
    for (let i = 0; i < this.cfg.count; i++) {
      this.pts.push({
        x: (Math.random() * 2 - 1) * this.cfg.area,
        y: Math.random() * this.cfg.height,
        z: (Math.random() * 2 - 1) * this.cfg.area,
        ph: Math.random() * 10,
        spd: 0.7 + Math.random() * 0.6,
      });
      this.mesh.setColorAt(i, c.set(this.cfg.colors[i % this.cfg.colors.length]));
    }
    parent.add(this.mesh);
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.t += dt;
    const { area, height, fall, sway, wind } = this.cfg;
    const base = this.kind === 'fireflies' || this.kind === 'pollen' ? 0.3 : 0;
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      p.y -= fall * p.spd * dt;
      p.x += Math.sin(this.t * 0.9 + p.ph) * sway * dt;
      p.z += Math.cos(this.t * 0.7 + p.ph * 1.3) * sway * dt;
      if (wind) {
        // a steady breeze carries them across the screen
        p.x += wind[0] * p.spd * dt;
        p.z += wind[1] * p.spd * dt;
      }
      if (this.kind === 'fireflies') p.y = 0.5 + Math.sin(this.t * 0.8 + p.ph) * 1.2 + 1.2;
      if (p.y < 0) p.y += height;
      if (p.y > height) p.y -= height;
      // wrap around the camera
      let wx = p.x - cam.x;
      let wz = p.z - cam.z;
      wx = ((((wx + area) % (area * 2)) + area * 2) % (area * 2)) - area;
      wz = ((((wz + area) % (area * 2)) + area * 2) % (area * 2)) - area;
      p.x = cam.x + wx;
      p.z = cam.z + wz;
      this.p.set(p.x, p.y + base, p.z);
      this.e.set(this.t * p.spd + p.ph, this.t * 0.5 + p.ph, 0);
      if (this.kind === 'rain') this.e.set(0, 0, 0.1);
      this.q.setFromEuler(this.e);
      let s = 1;
      if (this.kind === 'fireflies') s = 0.6 + Math.max(0, Math.sin(this.t * 3 + p.ph * 5)) * 0.8;
      this.one.setScalar(s);
      this.m.compose(this.p, this.q, this.one);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
