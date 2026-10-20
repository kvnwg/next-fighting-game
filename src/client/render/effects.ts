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
  color: THREE.Color;
}

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
      this.particles.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.1, gravity: 0, drag: 0, color: new THREE.Color() });
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
    opts: { count: number; color: string | string[]; speed: number; up?: number; life?: number; size?: number; gravity?: number; spread?: number; drag?: number },
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
      p.color.set(colors[Math.floor(Math.random() * colors.length)]);
    }
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

  /** Expanding ground ring (posture break, deathblow, landing). */
  ring(pos: THREE.Vector3, color: string, radius: number, life = 0.45): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, pos.y + 0.06, pos.z);
    mesh.scale.setScalar(0.2);
    mesh.layers.set(FX_LAYER);
    this.group.add(mesh);
    this.rings.push({ mesh, life, max: life, grow: radius });
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
      const s = p.size * Math.min(1, (p.life / p.max) * 2);
      this.tmpP.set(p.x, p.y, p.z);
      this.tmpS.set(s, s, s);
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

/** A ribbon following a weapon's base->tip segment while it swings. */
export class WeaponTrail {
  readonly mesh: THREE.Mesh;
  private readonly n = 12;
  private bases: THREE.Vector3[] = [];
  private tips: THREE.Vector3[] = [];
  private positions: Float32Array;
  private alphas: Float32Array;
  private active = false;
  private fade = 0;

  constructor(color: string) {
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.n * 2 * 3);
    this.alphas = new Float32Array(this.n * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    const idx: number[] = [];
    for (let i = 0; i < this.n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, fade: { value: 1 } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float fade; varying float vA; void main(){ gl_FragColor = vec4(color, vA * fade * 0.85); }`,
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

  update(dt: number, emitting: boolean, base: THREE.Vector3, tip: THREE.Vector3): void {
    if (emitting) {
      if (!this.active) {
        this.bases = [];
        this.tips = [];
      }
      this.active = true;
      this.fade = 1;
      this.bases.unshift(base.clone());
      this.tips.unshift(tip.clone());
      if (this.bases.length > this.n) {
        this.bases.pop();
        this.tips.pop();
      }
    } else if (this.active) {
      this.fade -= dt * 6;
      if (this.fade <= 0) this.active = false;
    }
    this.mesh.visible = this.active && this.bases.length > 1;
    if (!this.mesh.visible) return;
    const count = this.bases.length;
    for (let i = 0; i < this.n; i++) {
      const j = Math.min(i, count - 1);
      const b = this.bases[j];
      const t = this.tips[j];
      this.positions.set([b.x, b.y, b.z], i * 6);
      this.positions.set([t.x, t.y, t.z], i * 6 + 3);
      const a = i < count ? 1 - i / this.n : 0;
      this.alphas[i * 2] = a * 0.3;
      this.alphas[i * 2 + 1] = a;
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
    (this.mesh.material as THREE.ShaderMaterial).uniforms.fade.value = this.fade;
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

const WEATHER: Record<Weather, { count: number; colors: string[]; size: [number, number, number]; fall: number; sway: number; area: number; height: number }> = {
  petals: { count: 260, colors: ['#f6b8cc', '#f39dba', '#ffd6e2'], size: [0.1, 0.02, 0.08], fall: 0.9, sway: 1.2, area: 26, height: 12 },
  snow: { count: 500, colors: ['#ffffff', '#e8f0fa'], size: [0.07, 0.07, 0.07], fall: 1.6, sway: 0.8, area: 28, height: 14 },
  embers: { count: 240, colors: ['#ffb030', '#ff7a1a', '#ffd84a'], size: [0.06, 0.06, 0.06], fall: -1.2, sway: 0.6, area: 22, height: 10 },
  rain: { count: 700, colors: ['#9fb8d0', '#c0d4e6'], size: [0.025, 0.5, 0.025], fall: 16, sway: 0.1, area: 26, height: 16 },
  fireflies: { count: 120, colors: ['#e8ff7a', '#c8ff5a'], size: [0.07, 0.07, 0.07], fall: 0, sway: 0.6, area: 24, height: 4 },
  leaves: { count: 160, colors: ['#e07a2a', '#c8502a', '#e8a83a'], size: [0.12, 0.02, 0.09], fall: 1.1, sway: 1.8, area: 28, height: 12 },
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
    const { area, height, fall, sway } = this.cfg;
    const base = this.kind === 'fireflies' || this.kind === 'pollen' ? 0.3 : 0;
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      p.y -= fall * p.spd * dt;
      p.x += Math.sin(this.t * 0.9 + p.ph) * sway * dt;
      p.z += Math.cos(this.t * 0.7 + p.ph * 1.3) * sway * dt;
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
