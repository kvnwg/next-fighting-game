import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Points,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Camera,
} from 'three';

const POINT_VERT = `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  attribute float aRot;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vRot;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
    vAlpha = aAlpha;
    vColor = aColor;
    vRot = aRot;
  }`;

const SPARK_FRAG = `
  varying float vAlpha;
  varying vec3 vColor;
  varying float vRot;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(vColor * (1.0 + (1.0 - d * 2.0)), vAlpha * a);
  }`;

const SHARD_FRAG = `
  varying float vAlpha;
  varying vec3 vColor;
  varying float vRot;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    // A thin sliver of glass.
    if (abs(p.x) * 2.6 + abs(p.y) > 0.5) discard;
    gl_FragColor = vec4(vColor, vAlpha);
  }`;

export interface EmitOptions {
  at: { x: number; y: number; z: number };
  count: number;
  colors: number[];
  speed: [number, number];
  life: [number, number];
  size: [number, number];
  /** Bias direction; particles spread around it. */
  dir?: [number, number, number];
  spread?: number;
  gravity?: number;
  drag?: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

class PointPool {
  readonly points: Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly alpha: Float32Array;
  private readonly color: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private cursor = 0;
  private readonly material: ShaderMaterial;

  constructor(
    private readonly capacity: number,
    frag: string,
    additive: boolean,
  ) {
    const geo = new BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.size = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3);
    this.rot = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1));
    geo.setAttribute('aColor', new BufferAttribute(this.color, 3));
    geo.setAttribute('aRot', new BufferAttribute(this.rot, 1));
    this.material = new ShaderMaterial({
      vertexShader: POINT_VERT,
      fragmentShader: frag,
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  setScale(viewportHeight: number): void {
    this.material.uniforms.uScale!.value = viewportHeight * 0.9;
  }

  emit(o: EmitOptions): void {
    const c = new Color();
    for (let n = 0; n < o.count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      this.pos[i * 3] = o.at.x;
      this.pos[i * 3 + 1] = o.at.y;
      this.pos[i * 3 + 2] = o.at.z;
      let dx = rand(-1, 1);
      let dy = rand(-1, 1);
      let dz = rand(-1, 1);
      if (o.dir) {
        const s = o.spread ?? 0.6;
        dx = o.dir[0] + dx * s;
        dy = o.dir[1] + dy * s;
        dz = o.dir[2] + dz * s;
      }
      const len = Math.hypot(dx, dy, dz) || 1;
      const speed = rand(...o.speed);
      this.vel[i * 3] = (dx / len) * speed;
      this.vel[i * 3 + 1] = (dy / len) * speed;
      this.vel[i * 3 + 2] = (dz / len) * speed;
      this.life[i] = this.maxLife[i] = rand(...o.life);
      this.baseSize[i] = rand(...o.size);
      c.setHex(o.colors[n % o.colors.length]!);
      this.color[i * 3] = c.r;
      this.color[i * 3 + 1] = c.g;
      this.color[i * 3 + 2] = c.b;
      this.rot[i] = rand(0, Math.PI * 2);
      this.spin[i] = rand(-12, 12);
      this.gravity[i] = o.gravity ?? 6;
      this.drag[i] = o.drag ?? 2.5;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i]! <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i]! -= dt;
      const k = Math.max(0, this.life[i]! / this.maxLife[i]!);
      const drag = Math.exp(-this.drag[i]! * dt);
      this.vel[i * 3]! *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! * drag - this.gravity[i]! * dt;
      this.vel[i * 3 + 2]! *= drag;
      this.pos[i * 3]! += this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1]! += this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2]! += this.vel[i * 3 + 2]! * dt;
      if (this.pos[i * 3 + 1]! < 0.02) {
        this.pos[i * 3 + 1] = 0.02;
        this.vel[i * 3 + 1] = Math.abs(this.vel[i * 3 + 1]!) * 0.3;
      }
      this.rot[i]! += this.spin[i]! * dt;
      this.alpha[i] = k;
      this.size[i] = this.baseSize[i]! * (0.4 + 0.6 * k);
    }
    const g = this.points.geometry;
    for (const name of ['position', 'aSize', 'aAlpha', 'aRot']) (g.getAttribute(name) as BufferAttribute).needsUpdate = true;
    (g.getAttribute('aColor') as BufferAttribute).needsUpdate = true;
  }
}

function radialTexture(inner: string, outer: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

interface Timed<T> {
  obj: T;
  t: number;
  dur: number;
  active: boolean;
}

/** All combat effects. Pools everything so a long fight never allocates. */
export class Vfx {
  private readonly sparks: PointPool;
  private readonly shards: PointPool;
  private readonly arcs: Timed<Mesh>[] = [];
  private readonly flashes: Timed<Sprite>[] = [];
  private readonly rings: Timed<Mesh>[] = [];
  private readonly flashTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

  constructor(
    scene: Scene,
    private readonly density: number,
  ) {
    this.sparks = new PointPool(Math.round(700 * Math.max(0.4, density)), SPARK_FRAG, true);
    this.shards = new PointPool(Math.round(220 * Math.max(0.4, density)), SHARD_FRAG, false);
    scene.add(this.sparks.points, this.shards.points);
    for (let i = 0; i < 8; i++) {
      const arc = new Mesh(
        new RingGeometry(0.9, 1.25, 28, 1, 0, Math.PI * 0.85),
        new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
      );
      arc.visible = false;
      scene.add(arc);
      this.arcs.push({ obj: arc, t: 0, dur: 0.18, active: false });
    }
    for (let i = 0; i < 8; i++) {
      const s = new Sprite(new SpriteMaterial({ map: this.flashTex, color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false }));
      s.visible = false;
      scene.add(s);
      this.flashes.push({ obj: s, t: 0, dur: 0.14, active: false });
    }
    for (let i = 0; i < 4; i++) {
      const ring = new Mesh(
        new RingGeometry(0.6, 0.85, 40),
        new MeshBasicMaterial({ color: 0xd8d2c4, transparent: true, opacity: 0, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      scene.add(ring);
      this.rings.push({ obj: ring, t: 0, dur: 0.6, active: false });
    }
  }

  setViewport(height: number): void {
    this.sparks.setScale(height);
    this.shards.setScale(height);
  }

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.density));
  }

  sparksAt(o: EmitOptions): void {
    this.sparks.emit({ ...o, count: this.n(o.count) });
  }

  shardsAt(o: EmitOptions): void {
    this.shards.emit({ ...o, count: this.n(o.count) });
  }

  /** A wide white crescent facing the camera, as in the reference's slash arcs. */
  slashArc(at: { x: number; y: number; z: number }, camera: Camera, color = 0xffffff, scale = 1): void {
    const slot = this.arcs.find((a) => !a.active) ?? this.arcs[0]!;
    slot.active = true;
    slot.t = 0;
    const m = slot.obj;
    m.visible = true;
    m.position.set(at.x, at.y, at.z);
    m.quaternion.copy(camera.quaternion);
    m.rotateZ(rand(0, Math.PI * 2));
    m.scale.setScalar(scale);
    (m.material as MeshBasicMaterial).color.setHex(color);
  }

  flash(at: { x: number; y: number; z: number }, color: number, size = 1.6, dur = 0.14): void {
    const slot = this.flashes.find((f) => !f.active) ?? this.flashes[0]!;
    slot.active = true;
    slot.t = 0;
    slot.dur = dur;
    slot.obj.visible = true;
    slot.obj.position.set(at.x, at.y, at.z);
    slot.obj.userData.size = size;
    slot.obj.material.color.setHex(color);
  }

  dustRing(x: number, z: number): void {
    const slot = this.rings.find((r) => !r.active) ?? this.rings[0]!;
    slot.active = true;
    slot.t = 0;
    slot.obj.visible = true;
    slot.obj.position.set(x, 0.03, z);
  }

  update(dt: number): void {
    this.sparks.update(dt);
    this.shards.update(dt);
    for (const a of this.arcs) {
      if (!a.active) continue;
      a.t += dt;
      const k = a.t / a.dur;
      const mat = a.obj.material as MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - k) * 0.9;
      a.obj.scale.multiplyScalar(1 + dt * 2.5);
      if (k >= 1) {
        a.active = false;
        a.obj.visible = false;
      }
    }
    for (const f of this.flashes) {
      if (!f.active) continue;
      f.t += dt;
      const k = f.t / f.dur;
      const s = (f.obj.userData.size as number) * (0.4 + k * 1.2);
      f.obj.scale.set(s, s, s);
      f.obj.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) {
        f.active = false;
        f.obj.visible = false;
      }
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      const k = r.t / r.dur;
      r.obj.scale.setScalar(1 + k * 2.4);
      (r.obj.material as MeshBasicMaterial).opacity = Math.max(0, 1 - k) * 0.6;
      if (k >= 1) {
        r.active = false;
        r.obj.visible = false;
      }
    }
  }
}

const TRAIL_SAMPLES = 14;

/** Ribbon between a weapon's blade base and tip over the last few frames. */
export class WeaponTrail {
  readonly mesh: Mesh;
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  private readonly bases: Vector3[] = [];
  private readonly tips: Vector3[] = [];
  private fade = 0;
  private active = false;

  constructor(scene: Scene, color = 0xffffff) {
    const geo = new BufferGeometry();
    this.positions = new Float32Array(TRAIL_SAMPLES * 2 * 3);
    this.alphas = new Float32Array(TRAIL_SAMPLES * 2);
    geo.setAttribute('position', new BufferAttribute(this.positions, 3));
    geo.setAttribute('aAlpha', new BufferAttribute(this.alphas, 1));
    const index: number[] = [];
    for (let i = 0; i < TRAIL_SAMPLES - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(index);
    const mat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(color) }, uFade: { value: 1 } },
      vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uFade; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * uFade * 0.75); }',
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Push the blade's current world position; `on` while the swing is live. */
  sample(base: Vector3, tip: Vector3, on: boolean, dt: number): void {
    if (on) {
      if (!this.active) {
        this.bases.length = 0;
        this.tips.length = 0;
      }
      this.active = true;
      this.fade = 1;
      this.bases.unshift(base.clone());
      this.tips.unshift(tip.clone());
      if (this.bases.length > TRAIL_SAMPLES) {
        this.bases.pop();
        this.tips.pop();
      }
    } else {
      this.active = false;
      this.fade = Math.max(0, this.fade - dt * 7);
    }
    const n = this.bases.length;
    this.mesh.visible = this.fade > 0 && n > 1;
    if (!this.mesh.visible) return;
    for (let i = 0; i < TRAIL_SAMPLES; i++) {
      const b = this.bases[Math.min(i, n - 1)]!;
      const t = this.tips[Math.min(i, n - 1)]!;
      this.positions.set([b.x, b.y, b.z], i * 6);
      this.positions.set([t.x, t.y, t.z], i * 6 + 3);
      const a = i < n ? 1 - i / TRAIL_SAMPLES : 0;
      this.alphas[i * 2] = a * 0.35;
      this.alphas[i * 2 + 1] = a;
    }
    (this.mesh.material as ShaderMaterial).uniforms.uFade!.value = this.fade;
    this.mesh.geometry.getAttribute('position').needsUpdate = true;
    this.mesh.geometry.getAttribute('aAlpha').needsUpdate = true;
  }
}
