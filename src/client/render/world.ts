/** Builds the 3D scene for a map (lobby or arena) from its shared MapDef. */
import * as THREE from 'three';
import { MapDef, Shape } from '../../shared/maps';
import { seededRandom } from '../../shared/math';
import { LeaderboardEntry } from '../../shared/protocol';
import { rankOf } from '../../shared/ranks';
import { buildProp } from './props';
import { FX_LAYER } from './renderer';
import { GROUND_TILE_METERS, groundTexture, lavaTexture, stoneBlockTexture, toon } from './textures';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/**
 * Gradient sky with a sun (or moon) disc, a glow around it and two layers of drifting cloud
 * streaks. The disc is brighter than 1.0 so the bloom pass picks it up.
 */
const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 mid;
uniform vec3 bottom;
uniform vec3 glowColor;
uniform vec3 discColor;
uniform vec3 cloudColor;
uniform vec3 sunDir;
uniform float discSize;
uniform float glowStrength;
uniform float clouds;
uniform float time;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += noise(p) * a;
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float sd = max(dot(d, sunDir), 0.0);
  // three stops: horizon, a band of colour above it, and the zenith
  vec3 c = mix(bottom, mid, smoothstep(-0.02, 0.2, h));
  c = mix(c, top, smoothstep(0.16, 0.65, h));
  // warm bloom of light around the sun, strongest along the horizon
  float glow = pow(sd, 6.0) * 0.55 + pow(sd, 40.0) * 0.6;
  glow *= mix(1.0, 1.6, smoothstep(0.35, 0.0, abs(h - sunDir.y)));
  c += glowColor * glow * glowStrength;

  // cloud streaks: long thin bands drifting slowly, lit on the side facing the sun
  float az = atan(d.x, d.z);
  float band = smoothstep(-0.02, 0.06, h) * smoothstep(0.42, 0.12, h);
  vec2 p1 = vec2(az * 6.0 + time * 0.006, h * 38.0);
  vec2 p2 = vec2(az * 10.0 - time * 0.004 + 4.0, h * 60.0 + 3.0);
  float n1 = smoothstep(0.52, 0.7, fbm(p1 * vec2(1.0, 0.6)));
  float n2 = smoothstep(0.56, 0.72, fbm(p2 * vec2(1.0, 0.5)));
  float cloud = max(n1, n2 * 0.8) * band * clouds;
  vec3 lit = mix(cloudColor, glowColor * 1.15 + 0.15, pow(sd, 3.0));
  c = mix(c, lit, cloud * 0.85);

  float disc = smoothstep(discSize, discSize + 0.0004, sd);
  c = mix(c, discColor, disc * (1.0 - cloud * 0.6));
  gl_FragColor = vec4(c, 1.0);
}`;

/** Drifting mist sheet: soft noise, faded toward the edges of the sheet. */
const MIST_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const MIST_FRAG = /* glsl */ `
uniform vec3 color;
uniform float opacity;
uniform float time;
uniform float scale;
uniform vec2 drift;
varying vec3 vWorld;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 p = vWorld.xz * scale + drift * time;
  float n = noise(p) * 0.6 + noise(p * 2.1 + 7.3) * 0.3 + noise(p * 4.3 - 2.1) * 0.1;
  float edge = smoothstep(0.5, 0.2, length(vUv - 0.5));
  float a = smoothstep(0.38, 0.72, n) * edge * opacity;
  gl_FragColor = vec4(color, a);
}`;

const ZONE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const ZONE_FRAG = /* glsl */ `
uniform float time;
uniform vec3 color;
varying vec2 vUv;
void main() {
  float stripes = step(0.5, fract(vUv.x * 60.0 + time * 0.4));
  float fade = (1.0 - vUv.y);
  float a = fade * fade * (0.25 + stripes * 0.2);
  a += smoothstep(0.08, 0.0, vUv.y) * 0.5;
  gl_FragColor = vec4(color, a);
}`;

const MAX_POINT_LIGHTS = 8;

export class MapView {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  /** Direction toward the sun and the colour of the rim light it puts on the fighters. */
  readonly sunDir: THREE.Vector3;
  readonly rimColor: THREE.Color;
  private animators: ((t: number, dt: number) => void)[] = [];
  private lightBudget = MAX_POINT_LIGHTS;
  private boardCanvas: HTMLCanvasElement | null = null;
  private boardTex: THREE.CanvasTexture | null = null;
  private time = 0;

  constructor(
    readonly map: MapDef,
    readonly scene: THREE.Scene,
  ) {
    const th = map.theme;
    scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    scene.background = new THREE.Color(th.skyBottom);

    // sky dome with the sun / moon disc
    const dir = new THREE.Vector3(...th.sunDir).normalize();
    this.sunDir = dir.clone();
    this.rimColor = new THREE.Color(th.sun).lerp(new THREE.Color('#ffffff'), th.night ? 0.3 : 0.45).multiplyScalar(th.night ? 1.1 : 1.6);
    const discDir = new THREE.Vector3(...(th.sunDisc ?? th.sunDir)).normalize();
    const skyBottom = new THREE.Color(th.skyBottom);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(350, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          top: { value: new THREE.Color(th.skyTop) },
          mid: { value: th.skyMid ? new THREE.Color(th.skyMid) : mixSRGB(skyBottom, new THREE.Color(th.skyTop), 0.45) },
          bottom: { value: skyBottom },
          glowColor: { value: new THREE.Color(th.night ? '#8a9ad8' : th.sun) },
          discColor: { value: new THREE.Color(th.night ? '#f4f1dc' : '#fffaf0').multiplyScalar(th.night ? 1.2 : 3) },
          cloudColor: { value: skyBottom.clone().lerp(new THREE.Color(th.skyTop), 0.35) },
          sunDir: { value: discDir },
          discSize: { value: Math.cos(th.night ? 0.045 : th.sunDisc ? 0.085 : 0.05) },
          glowStrength: { value: th.night ? 0.35 : th.sunDisc ? 0.55 : 0.4 },
          clouds: { value: this.map.id === 'forge' ? 0 : 1 },
          time: { value: 0 },
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    sky.renderOrder = -10;
    this.group.add(sky);
    const skyMat = sky.material;
    this.animators.push((t) => {
      skyMat.uniforms.time.value = t;
    });

    // lights
    const hemi = new THREE.HemisphereLight(th.ambient, '#3a3530', th.ambientIntensity);
    this.group.add(hemi);
    this.sun = new THREE.DirectionalLight(th.sun, th.sunIntensity);
    this.sun.position.copy(dir).multiplyScalar(40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    const ext = map.kind === 'lobby' ? 30 : 28;
    sc.left = -ext;
    sc.right = ext;
    sc.top = ext;
    sc.bottom = -ext;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0015;
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    this.buildFloor();
    this.buildEdges();
    this.buildDecals();
    this.buildHazards();
    this.buildProps();
    this.buildScenery();
    if (map.safeZone) this.buildSafeZone();
    this.scatterDecor();

    scene.add(this.group);
  }

  private shapeGeometry(s: Shape): THREE.BufferGeometry {
    const g = s.type === 'circle' ? new THREE.CircleGeometry(s.r, 48) : new THREE.PlaneGeometry(s.hw * 2, s.hd * 2);
    g.rotateX(-Math.PI / 2);
    g.translate(s.x, 0, s.z);
    return g;
  }

  private groundMaterial(tex: ReturnType<typeof groundTexture>, s: Shape, kind: keyof typeof GROUND_TILE_METERS): THREE.MeshLambertMaterial {
    const t = tex.clone();
    t.needsUpdate = true;
    const tile = GROUND_TILE_METERS[kind];
    const w = s.type === 'circle' ? s.r * 2 : s.hw * 2;
    const d = s.type === 'circle' ? s.r * 2 : s.hd * 2;
    t.repeat.set(w / tile, d / tile);
    return new THREE.MeshLambertMaterial({ map: t });
  }

  private buildFloor(): void {
    const th = this.map.theme;
    for (const s of this.map.floor) {
      const mesh = new THREE.Mesh(this.shapeGeometry(s), this.groundMaterial(groundTexture(th.ground), s, th.ground));
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    if (this.map.edge === 'void') {
      // cliffs under the floor
      const rock = toon(th.edge, { map: stoneBlockTexture(), key: `cliff-${th.edge}` });
      for (const s of this.map.floor) {
        let m: THREE.Mesh;
        if (s.type === 'circle') {
          m = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r * 0.55, 14, 20), rock);
          m.position.set(s.x, -7.02, s.z);
        } else {
          m = new THREE.Mesh(new THREE.BoxGeometry(s.hw * 2, 1.2, s.hd * 2), toon('#4a3326'));
          m.position.set(s.x, -0.62, s.z);
          // support beams under the bridge
          for (let z = -s.hd + 2; z < s.hd; z += 4) {
            const beam = new THREE.Mesh(new THREE.BoxGeometry(s.hw * 2 + 0.4, 0.3, 0.4), toon('#3a2618'));
            beam.position.set(s.x, -1.3, s.z + z);
            this.group.add(beam);
          }
        }
        m.receiveShadow = true;
        this.group.add(m);
      }
    } else {
      // surrounding ground so the world doesn't end at the wall
      const outer = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshLambertMaterial({ color: new THREE.Color(th.fog).multiplyScalar(0.7) }));
      if (this.map.kind === 'lobby' || this.map.id === 'sakura' || this.map.id === 'bamboo' || this.map.id === 'ruins') {
        const t = groundTexture(this.map.id === 'ruins' ? 'moss' : this.map.id === 'sakura' ? 'grass' : th.ground).clone();
        t.needsUpdate = true;
        t.repeat.set(125, 125);
        outer.material = new THREE.MeshLambertMaterial({ map: t, color: '#cfcfcf' });
      }
      outer.rotation.x = -Math.PI / 2;
      outer.position.y = -0.03;
      outer.receiveShadow = true;
      this.group.add(outer);
    }
  }

  private buildEdges(): void {
    if (this.map.edge !== 'wall') return;
    const id = this.map.id;
    const rand = seededRandom(99);
    const stone = toon(this.map.theme.edge, { map: stoneBlockTexture(), key: `wall-${this.map.theme.edge}` });
    const wallHeight = id === 'forge' ? 4 : id === 'lobby' ? 1.2 : id === 'bamboo' ? 0 : 1.4;
    const place = (x: number, z: number, rot: number, len: number) => {
      if (id === 'bamboo') {
        const p = buildProp('bamboo', { night: false, animate: () => {}, light: () => {}, seed: Math.floor(rand() * 1e6) });
        p.position.set(x, 0, z);
        p.scale.setScalar(1.1);
        this.group.add(p);
        return;
      }
      if (id === 'lobby') {
        const p = buildProp('fence', { night: false, animate: () => {}, light: () => {}, seed: 1 });
        p.position.set(x, 0, z);
        p.rotation.y = rot + Math.PI / 2;
        p.scale.set(1, 1, len / 2);
        this.group.add(p);
        return;
      }
      let h = wallHeight;
      if (id === 'ruins') h = 0.6 + rand() * 1.8;
      const w = new THREE.Mesh(new THREE.BoxGeometry(len + 0.05, h, 0.7), stone);
      w.position.set(x, h / 2, z);
      w.rotation.y = rot;
      w.castShadow = true;
      w.receiveShadow = true;
      this.group.add(w);
      if (id === 'sakura') {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.18, 1.0), toon('#4a4a58'));
        cap.position.set(x, h + 0.09, z);
        cap.rotation.y = rot;
        this.group.add(cap);
      }
    };
    for (const s of this.map.floor) {
      if (s.type === 'circle') {
        const r = s.r + 0.4;
        const seg = Math.max(16, Math.round((Math.PI * 2 * r) / 2));
        for (let i = 0; i < seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          place(s.x + Math.sin(a) * r, s.z + Math.cos(a) * r, a, ((Math.PI * 2 * r) / seg) * 1.02);
        }
      } else {
        const step = 2;
        for (let x = -s.hw + step / 2; x < s.hw; x += step) {
          place(s.x + x, s.z - s.hd - 0.4, 0, step);
          place(s.x + x, s.z + s.hd + 0.4, 0, step);
        }
        for (let z = -s.hd + step / 2; z < s.hd; z += step) {
          place(s.x - s.hw - 0.4, s.z + z, Math.PI / 2, step);
          place(s.x + s.hw + 0.4, s.z + z, Math.PI / 2, step);
        }
      }
    }
  }

  private buildDecals(): void {
    this.map.decals.forEach((d, i) => {
      const mat = this.groundMaterial(groundTexture(d.tex), d.shape, d.tex);
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -1 - i;
      mat.polygonOffsetUnits = -1 - i;
      const mesh = new THREE.Mesh(this.shapeGeometry(d.shape), mat);
      mesh.position.y = 0.01 + i * 0.004;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    });
  }

  private buildHazards(): void {
    for (const h of this.map.hazards) {
      const tex = lavaTexture().clone();
      tex.needsUpdate = true;
      const size = h.shape.type === 'circle' ? h.shape.r * 2 : h.shape.hw * 2;
      tex.repeat.set(size / 2.5, size / 2.5);
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: '#ffffff' });
      const mesh = new THREE.Mesh(this.shapeGeometry(h.shape), mat);
      mesh.position.y = 0.03;
      this.group.add(mesh);
      // rim
      if (h.shape.type === 'circle') {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(h.shape.r + 0.1, 0.25, 4, 24), toon('#2a1c18'));
        rim.rotation.x = Math.PI / 2;
        rim.position.set(h.shape.x, 0.05, h.shape.z);
        this.group.add(rim);
        this.addLight(this.group, '#ff6a20', 10, h.shape.r * 3, 0.8, h.shape.x, h.shape.z);
      }
      const off = Math.random();
      this.animators.push((t) => {
        tex.offset.set(Math.sin(t * 0.3 + off) * 0.1, t * 0.05);
      });
    }
  }

  private addLight(parent: THREE.Object3D, color: string, intensity: number, distance: number, y: number, x = 0, z = 0): void {
    if (this.lightBudget <= 0) return;
    this.lightBudget--;
    const l = new THREE.PointLight(color, intensity, distance, 1.6);
    l.position.set(x, y, z);
    parent.add(l);
    const base = intensity;
    const off = Math.random() * 10;
    this.animators.push((t) => {
      l.intensity = base * (0.85 + Math.sin(t * 7 + off) * 0.08 + Math.sin(t * 13 + off) * 0.05);
    });
  }

  private buildProps(): void {
    const night = !!this.map.theme.night || !!this.map.theme.dusk;
    this.map.props.forEach((p, i) => {
      const g = buildProp(p.kind, {
        night,
        seed: i * 7919 + Math.round(p.x * 13 + p.z * 17),
        animate: (fn) => this.animators.push(fn),
        light: (parent, color, intensity, distance, y) => this.addLight(parent, color, intensity, distance, y),
      });
      g.position.set(p.x, 0, p.z);
      g.rotation.y = p.rot ?? 0;
      g.scale.setScalar(p.s ?? 1);
      if (p.kind === 'rankBoard') this.attachBoard(g);
      this.group.add(g);
    });
  }

  private attachBoard(g: THREE.Group): void {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 96;
    this.boardCanvas = c;
    this.boardTex = new THREE.CanvasTexture(c);
    this.boardTex.magFilter = THREE.NearestFilter;
    this.boardTex.minFilter = THREE.NearestFilter;
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.25, 0.1), [
      toon('#4a3020'),
      toon('#4a3020'),
      toon('#4a3020'),
      toon('#4a3020'),
      new THREE.MeshBasicMaterial({ map: this.boardTex }),
      toon('#4a3020'),
    ]);
    face.position.set(0, 1.9, 0.05);
    face.castShadow = true;
    g.add(face);
    this.setLeaderboard([]);
  }

  /** Draw the top of the ladder onto the in-world board in the plaza. */
  setLeaderboard(entries: LeaderboardEntry[]): void {
    const c = this.boardCanvas;
    if (!c || !this.boardTex) return;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2b1d14';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#e8c44a';
    g.font = '10px monospace';
    g.textBaseline = 'top';
    g.fillText('RANKED LADDER', 22, 4);
    g.fillStyle = '#8a6a4a';
    g.fillRect(6, 16, c.width - 12, 1);
    if (entries.length === 0) {
      g.fillStyle = '#c9b8a0';
      g.fillText('no one placed yet', 14, 40);
      g.fillText('play 5 ranked games', 8, 54);
    }
    entries.slice(0, 7).forEach((e, i) => {
      const r = rankOf(e.mmr, e.placements);
      g.fillStyle = r.color;
      g.fillText(`${i + 1}.`, 6, 21 + i * 10);
      g.fillStyle = '#f0e6d8';
      g.fillText(e.name.slice(0, 11), 20, 21 + i * 10);
      g.fillStyle = r.color;
      g.fillText(String(e.mmr), 96, 21 + i * 10);
    });
    this.boardTex.needsUpdate = true;
  }

  private buildScenery(): void {
    const th = this.map.theme;
    const rand = seededRandom(7);
    if (this.map.id === 'forge') {
      // cavern walls instead of open sky
      const rock = toon('#2a1e1c');
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const r = 28 + rand() * 6;
        const h = 14 + rand() * 18;
        const m = new THREE.Mesh(new THREE.ConeGeometry(5 + rand() * 4, h, 5), rock);
        m.position.set(Math.sin(a) * r, h / 2 - 2, Math.cos(a) * r);
        this.group.add(m);
      }
      return;
    }
    // Aerial perspective: three mountain ranges, each farther one paler and closer to the haze
    // (sky horizon) colour, so depth reads at a glance. Distant scenery ignores the scene fog and
    // is pre-tinted instead.
    const haze = new THREE.Color(th.fog);
    const near = new THREE.Color(th.scenery ?? (th.night ? '#10142a' : '#4a5462'));
    const hazeAt = (k: number) => mixSRGB(near, haze, k);
    const base = this.map.edge === 'void' ? -30 : -1;
    const ringR = this.map.kind === 'lobby' ? 150 : 95;
    const lift = this.map.edge === 'void' ? 30 : 0;
    const ranges = [
      { r: ringR * 2.2, spread: 30, count: 18, haze: 0.85, h: [45, 80] },
      { r: ringR * 1.6, spread: 25, count: 16, haze: 0.62, h: [30, 55] },
      { r: ringR, spread: 20, count: 12, haze: 0.15, h: [16, 34] },
    ];
    // leave a valley where a low sun disc sits so the peaks don't hide it
    const sunAz = th.sunDisc ? Math.atan2(th.sunDisc[0], th.sunDisc[2]) : null;
    for (const range of ranges) {
      const col = hazeAt(range.haze);
      // mostly self-lit so the sun doesn't pull distant ranges back out of the haze
      const mat = new THREE.MeshLambertMaterial({ color: col.clone().multiplyScalar(0.06), emissive: col.clone().multiplyScalar(0.92), fog: false });
      // snow caps catch the light, so they lean toward the sun's colour rather than plain white
      const capCol = mixSRGB(col, mixSRGB(new THREE.Color('#ffffff'), new THREE.Color(th.sun), 0.35), 0.4);
      const capMat = new THREE.MeshLambertMaterial({ color: capCol.clone().multiplyScalar(0.06), emissive: capCol.clone().multiplyScalar(0.92), fog: false });
      for (let i = 0; i < range.count; i++) {
        const a = (i / range.count) * Math.PI * 2 + rand() * 0.25;
        const r = range.r + rand() * range.spread;
        let h = range.h[0] + rand() * (range.h[1] - range.h[0]) + lift;
        if (sunAz !== null) {
          const off = Math.abs(Math.atan2(Math.sin(a - sunAz), Math.cos(a - sunAz)));
          if (off < 0.32) continue;
          if (off < 0.6) h *= 0.55;
        }
        const w = h * (0.45 + rand() * 0.35);
        const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), mat);
        m.position.set(Math.sin(a) * r, base + h / 2, Math.cos(a) * r);
        m.rotation.y = rand() * 3;
        this.group.add(m);
        if (h - lift > range.h[0] + (range.h[1] - range.h[0]) * 0.6 && !th.night) {
          const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.3, h * 0.3, 5), capMat);
          cap.position.set(m.position.x, base + h * 0.85, m.position.z);
          cap.rotation.y = m.rotation.y;
          this.group.add(cap);
        }
      }
    }
    if (this.map.edge === 'void') {
      // sea of clouds below: pale, mostly self-lit puffs that drift slowly
      const abyss = th.below === 'abyss';
      const cloud = new THREE.MeshBasicMaterial({ color: mixSRGB(new THREE.Color(abyss ? '#1a1420' : '#ffe2b8'), haze, abyss ? 0.35 : 0.35), fog: false });
      const clouds = new THREE.Group();
      for (let i = 0; i < 90; i++) {
        const a = rand() * Math.PI * 2;
        const r = 12 + rand() * 110;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + rand() * 7, 0), cloud);
        m.scale.set(1.4, 0.3, 1);
        m.rotation.y = rand() * 3;
        m.position.set(Math.sin(a) * r, -14 - rand() * 10, Math.cos(a) * r);
        clouds.add(m);
      }
      this.group.add(clouds);
      this.animators.push((t) => {
        clouds.rotation.y = t * 0.01;
      });
      this.buildMist(haze);
    }
  }

  /** Low mist hanging under and around the floor of void maps, in drifting layers. */
  private buildMist(haze: THREE.Color): void {
    const color = mixSRGB(haze, new THREE.Color('#ffffff'), 0.35);
    const layers = [
      { y: -0.9, size: 70, opacity: 0.45, scale: 0.09, drift: [0.35, 0.12] },
      { y: -3.2, size: 120, opacity: 0.6, scale: 0.05, drift: [-0.25, 0.18] },
      { y: -7.5, size: 180, opacity: 0.7, scale: 0.03, drift: [0.2, -0.1] },
    ];
    for (const l of layers) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: color },
          opacity: { value: l.opacity },
          time: { value: 0 },
          scale: { value: l.scale },
          drift: { value: new THREE.Vector2(l.drift[0], l.drift[1]) },
        },
        vertexShader: MIST_VERT,
        fragmentShader: MIST_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(l.size, l.size), mat);
      sheet.rotation.x = -Math.PI / 2;
      sheet.position.y = l.y;
      sheet.layers.set(FX_LAYER);
      sheet.renderOrder = 2;
      this.group.add(sheet);
      this.animators.push((t) => {
        mat.uniforms.time.value = t;
      });
    }
  }

  private buildSafeZone(): void {
    const z = this.map.safeZone!;
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color('#7ff0ff') } },
      vertexShader: ZONE_VERT,
      fragmentShader: ZONE_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(z.r, z.r, 3.5, 64, 1, true), mat);
    wall.position.set(z.x, 1.75, z.z);
    wall.layers.set(FX_LAYER);
    this.group.add(wall);
    const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 0.25, z.r, 64), new THREE.MeshBasicMaterial({ color: '#9ff6ff', transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(z.x, 0.05, z.z);
    ring.layers.set(FX_LAYER);
    this.group.add(ring);
    this.animators.push((t) => {
      mat.uniforms.time.value = t;
    });
  }

  /** Non-colliding clutter: grass tufts, flowers, snow lumps... */
  private scatterDecor(): void {
    const ground = this.map.theme.ground;
    const rand = seededRandom(4242);
    let colors: string[] = [];
    let count = 0;
    if (ground === 'grass') {
      colors = ['#6fb04a', '#7cc256', '#5a9a3c', '#f2e86a', '#f29ac0', '#ffffff'];
      count = this.map.kind === 'lobby' ? 1400 : 300;
    } else if (ground === 'moss') {
      colors = ['#3f6a35', '#4c7a3e', '#2f5a2c'];
      count = 350;
    } else if (ground === 'snow') {
      colors = ['#e6eef8', '#d0dcea'];
      count = 160;
    } else if (this.map.id === 'sakura') {
      colors = ['#f6b8cc', '#f39dba', '#ffd6e2'];
      count = 260;
    } else if (ground === 'stone') {
      colors = ['#5b7a4a', '#4a6a3c'];
      count = 180;
    }
    if (!count) return;
    const geo = new THREE.BoxGeometry(0.12, 0.22, 0.12);
    geo.translate(0, 0.11, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    let placed = 0;
    for (let i = 0; i < count * 3 && placed < count; i++) {
      const fs = this.map.floor[0];
      let x: number;
      let z: number;
      if (fs.type === 'circle') {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * fs.r;
        x = fs.x + Math.sin(a) * r;
        z = fs.z + Math.cos(a) * r;
      } else {
        x = fs.x + (rand() * 2 - 1) * fs.hw;
        z = fs.z + (rand() * 2 - 1) * fs.hd;
      }
      if (this.map.decals.some((d) => d.tex !== 'sand' && d.tex !== 'moss' && inShape(d.shape, x, z))) continue;
      if (this.map.decals.some((d) => d.tex === 'sand' && inShape(d.shape, x, z)) && rand() < 0.85) continue;
      const flower = rand() < 0.12;
      const sc = flower ? 0.6 : 0.6 + rand() * 0.9;
      s.set(sc, flower ? 0.8 : sc * (0.6 + rand()), sc);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
      p.set(x, 0, z);
      m.compose(p, q, s);
      mesh.setMatrixAt(placed, m);
      const ci = flower ? colors.length - 1 - Math.floor(rand() * Math.min(3, colors.length)) : Math.floor(rand() * Math.min(3, colors.length));
      mesh.setColorAt(placed, c.set(colors[Math.max(0, ci)]));
      placed++;
    }
    mesh.count = placed;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt;
    for (const a of this.animators) a(this.time, dt);
    // keep the shadow camera centred on the action
    const dir = new THREE.Vector3(...this.map.theme.sunDir).normalize();
    const fx = Math.round(focus.x / 4) * 4;
    const fz = Math.round(focus.z / 4) * 4;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + dir.x * 40, dir.y * 40, fz + dir.z * 40);
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if ((m as THREE.MeshLambertMaterial).map && m.userData.shared !== true) {
            // cloned textures are per-map; base textures are cached and shared
          }
        }
      }
    });
  }
}

/** Blend two colours the way a painter would (in sRGB, not linear light). */
function mixSRGB(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  const x = a.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  const y = b.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  return new THREE.Color().setRGB(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t, THREE.SRGBColorSpace);
}

function inShape(s: Shape, x: number, z: number): boolean {
  if (s.type === 'circle') return Math.hypot(x - s.x, z - s.z) <= s.r;
  return Math.abs(x - s.x) <= s.hw && Math.abs(z - s.z) <= s.hd;
}
