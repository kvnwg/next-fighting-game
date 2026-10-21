/**
 * Builds the 3D scene for a map (lobby or arena) from its shared MapDef and its client-side recipe
 * (render/maps/): the lighting mood, sky and clouds, the voxel floor and the scenery around it,
 * gameplay props as voxel models, grass, ambient particles, water and lava.
 */
import * as THREE from 'three';
import { MapDef, PropKind, Shape } from '../../shared/maps';
import { LeaderboardEntry } from '../../shared/protocol';
import { rankOf } from '../../shared/ranks';
import { G } from './gfx/globals';
import { buildGrass } from './gfx/grass';
import { litMaterial, swayDepthMaterial } from './gfx/materials';
import { Particles } from './gfx/particles';
import { CloudLayer, Sky } from './gfx/sky';
import { buildTrees, TreeKind, TreePlacement } from './gfx/trees';
import { propParts, propVariants, sceneryParts, SceneryKind } from './gfx/voxprops';
import { Water } from './gfx/water';
import { glowMaterial, worldMaterial } from './maps/kit';
import { BuildContext, Look, MapRecipe, PropPlacement } from './maps/look';
import { RECIPES } from './maps/recipes';
import { DETAIL_LAYER, FX_LAYER, GameRenderer, defaultGrade } from './renderer';

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
  float a = fade * fade * (0.18 + stripes * 0.12);
  a += smoothstep(0.08, 0.0, vUv.y) * 0.4;
  gl_FragColor = vec4(color, a);
}`;

const LAVA_VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const LAVA_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vWorldPos;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  // one value per voxel cell: blocky, flowing lava with a cooling crust
  vec2 cell = floor(vWorldPos.xz / 0.25);
  float t = uTime;
  float n = noise(cell * 0.18 + vec2(t * 0.22, t * 0.15)) * 0.6 + noise(cell * 0.45 - vec2(t * 0.3, -t * 0.2)) * 0.4;
  vec3 crust = vec3(0.09, 0.025, 0.02);
  vec3 hot = vec3(5.0, 1.2, 0.18);
  vec3 c = mix(crust, hot, smoothstep(0.38, 0.7, n));
  c += vec3(3.0, 1.6, 0.4) * pow(max(n - 0.55, 0.0) * 2.2, 3.0);
  gl_FragColor = vec4(c, 1.0);
}`;

const MAX_LIGHTS = 8;
const SCENERY = new Set<string>(['pagoda', 'archBridge', 'lilyPads', 'steppingStones', 'gardenRock', 'arch', 'altar', 'reeds', 'jetty', 'petalRaft']);
const TREE_KINDS: Partial<Record<PropKind, TreeKind>> = { sakura: 'sakura', pine: 'pine', deadTree: 'deadTree', bamboo: 'bamboo', bush: 'bush' };
/** collider-ish radius per prop kind, to keep scenery off the props */
const FOOTPRINT: Partial<Record<PropKind, number>> = { shrine: 3, torii: 2.5, ruinWall: 2.6, statue: 1.2, well: 1.2, bamboo: 1.2, rock: 1.1, pillar: 0.9, brokenPillar: 1, rankBoard: 1.8 };

export class MapView {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly sunDir: THREE.Vector3;
  private readonly recipe: MapRecipe;
  private readonly look: Look;
  private animators: ((t: number, dt: number) => void)[] = [];
  private disposables: { dispose(): void }[] = [];
  private clouds: CloudLayer[] = [];
  private follow: Particles[] = [];
  private lights: { x: number; y: number; z: number; color: string; intensity: number; distance: number }[] = [];
  private boardCanvas: HTMLCanvasElement | null = null;
  private boardTex: THREE.CanvasTexture | null = null;
  private time = 0;

  constructor(
    readonly map: MapDef,
    readonly scene: THREE.Scene,
    readonly renderer: GameRenderer,
  ) {
    this.recipe = RECIPES[map.id] ?? RECIPES.sakura;
    const look = (this.look = this.recipe.look);
    const q = renderer.quality;

    // ---------------------------------------------------------------- mood
    this.sunDir = new THREE.Vector3(...look.light.dir).normalize();
    G.uSunDir.value.copy(this.sunDir);
    G.uSunColor.value.set(look.light.color).multiplyScalar(look.light.intensity * 0.45);
    G.uFogColor.value.set(look.fog.color);
    G.uFogSunColor.value.set(look.fog.sun);
    G.uFog.value.set(look.fog.density, look.fog.falloff, look.fog.base ?? 0, look.fog.glow ?? 6);
    const wind = look.wind ?? { dir: [0.8, 0.6], strength: 1, gust: 0.6 };
    const wl = Math.hypot(wind.dir[0], wind.dir[1]) || 1;
    G.uWind.value.set(wind.dir[0] / wl, wind.dir[1] / wl, wind.strength, wind.gust);
    const rim = look.rim ?? { color: look.light.color, strength: 0.55 };
    renderer.setRim(rim.color, rim.strength);
    const grade = defaultGrade();
    const lg = look.grade ?? {};
    Object.assign(grade, {
      exposure: lg.exposure ?? grade.exposure,
      contrast: lg.contrast ?? grade.contrast,
      saturation: lg.saturation ?? grade.saturation,
      vignette: lg.vignette ?? grade.vignette,
      bloom: lg.bloom ?? grade.bloom,
      bloomThreshold: lg.bloomThreshold ?? grade.bloomThreshold,
      rays: look.sky.none ? 0 : lg.rays ?? grade.rays,
    });
    if (lg.lift) grade.lift.set(lg.lift);
    if (lg.gain) grade.gain.set(lg.gain);
    grade.rayColor.set(lg.rayColor ?? look.light.color);
    renderer.grade = grade;
    // built-in fog for anything not using the world materials
    scene.fog = new THREE.Fog(look.fog.color, 30, 260);
    scene.background = look.sky.none ? new THREE.Color(look.fog.color) : null;

    if (!look.sky.none) {
      const sky = new Sky({
        zenith: look.sky.zenith,
        horizon: look.sky.horizon,
        band: look.sky.band,
        bandAmount: look.sky.bandAmount,
        below: look.sky.below,
        sun: look.light.color,
        discDir: new THREE.Vector3(...(look.disc ?? look.light.dir)),
        night: !!look.sky.night,
        glow: look.sky.glow,
        discSize: look.sky.discSize,
      });
      this.group.add(sky.mesh);
      this.disposables.push(sky);
    }
    for (const [i, c] of (look.clouds ?? []).entries()) {
      const layer = new CloudLayer({ ...c, seed: 3 + i * 17, half: Math.round(c.half * (q.level === 'low' ? 0.7 : 1)) });
      this.clouds.push(layer);
      layer.group.name = 'clouds';
      this.group.add(layer.group);
      this.disposables.push(layer);
    }

    // ---------------------------------------------------------------- light
    const hemi = new THREE.HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.intensity);
    this.group.add(hemi);
    this.sun = new THREE.DirectionalLight(look.light.color, look.light.intensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    this.sun.shadow.radius = q.shadowRadius;
    const ext = look.shadowExtent ?? (map.kind === 'lobby' ? 34 : 30);
    const sc = this.sun.shadow.camera;
    sc.left = -ext;
    sc.right = ext;
    sc.top = ext;
    sc.bottom = -ext;
    sc.near = 1;
    sc.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    // ---------------------------------------------------------------- scenery
    const ctx = this.context();
    const pine = this.recipe.pine ?? 'pine';
    const trees: TreePlacement[] = [];
    const props: PropPlacement[] = [];
    for (const p of map.props) {
      const tk = TREE_KINDS[p.kind];
      if (tk) trees.push({ kind: p.kind === 'pine' ? pine : tk, x: p.x, z: p.z, rot: p.rot, s: p.s });
      else props.push({ kind: p.kind, x: p.x, z: p.z, rot: p.rot, s: p.s, style: this.recipe.propStyle });
      ctx.taken.push({ x: p.x, z: p.z, r: (FOOTPRINT[p.kind] ?? 0.6) * (p.s ?? 1) });
    }
    ctx.trees(trees);
    ctx.props(props);
    this.recipe.build(ctx);
    this.buildHazards();
    if (map.safeZone) this.buildSafeZone();
    for (const p of map.props) if (p.kind === 'rankBoard') this.attachBoard(p.x, p.z, p.rot ?? 0, p.s ?? 1);
    this.placeLights();

    scene.add(this.group);
  }

  private context(): BuildContext {
    const q = this.renderer.quality;
    const look = this.look;
    const ambient = new THREE.Color(look.hemi.sky).multiplyScalar(look.hemi.intensity * 0.55);
    const detail = q.level === 'low' ? 0.6 : q.level === 'medium' ? 0.85 : 1;
    const ctx: BuildContext = {
      map: this.map,
      group: this.group,
      quality: q,
      look,
      taken: [],
      trees: (list, opts = {}) => {
        if (!list.length) return;
        const g = buildTrees(list, opts.detail ?? detail, { shadows: opts.shadows ?? true, chunk: opts.chunk });
        (opts.into ?? this.group).add(g);
      },
      props: (list, into) => this.addProps(list, into),
      grass: (o) => {
        const g = buildGrass(o, q.grass);
        g.name = 'grass';
        g.traverse((m) => m.layers.set(DETAIL_LAYER));
        this.group.add(g);
      },
      particles: (o) => {
        const count = Math.round(o.count * q.particles);
        if (count <= 0) return;
        const p = new Particles({ ...o, count, ambient });
        p.mesh.layers.set(DETAIL_LAYER);
        this.group.add(p.mesh);
        this.disposables.push(p);
        if (!o.anchored && o.kind !== 'fireflies' && o.kind !== 'spores' && o.kind !== 'embers') this.follow.push(p);
      },
      water: (o) => {
        const w = new Water({
          ...o,
          reflections: q.reflections,
          skyHorizon: new THREE.Color(look.sky.horizon),
          skyZenith: new THREE.Color(look.sky.zenith),
          ambient,
        });
        this.group.add(w.mesh);
        this.disposables.push(w);
      },
      light: (x, y, z, color, intensity, distance) => this.lights.push({ x, y, z, color, intensity, distance }),
      animate: (fn) => this.animators.push(fn),
    };
    return ctx;
  }

  /** Voxel props, one instanced mesh per part, kind, style and variant. */
  private addProps(list: PropPlacement[], into: THREE.Object3D = this.group): void {
    const groups = new Map<string, PropPlacement[]>();
    for (const p of list) {
      const variants = SCENERY.has(p.kind) ? 1 : propVariants(p.kind as PropKind);
      const variant = p.variant ?? Math.floor(Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453) % 1 * variants);
      const key = `${p.kind}|${p.style ?? this.recipe.propStyle}|${variant}|${Math.floor(p.x / 30)},${Math.floor(p.z / 30)}`;
      const arr = groups.get(key) ?? [];
      arr.push(p);
      groups.set(key, arr);
    }
    const m = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [key, arr] of groups) {
      const [kind, style, variant] = key.split('|');
      const parts = SCENERY.has(kind) ? sceneryParts(kind as SceneryKind, Number(variant)) : propParts(kind as PropKind, style as never, Number(variant));
      if (!parts) continue;
      const matrices = arr.map((p) => {
        quat.setFromAxisAngle(up, p.rot ?? 0);
        const s = p.s ?? 1;
        return m.compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), quat, new THREE.Vector3(s, s, s)).clone();
      });
      const inst = (geo: THREE.BufferGeometry | undefined, mat: THREE.Material, shadows: boolean, depth?: THREE.Material) => {
        if (!geo) return;
        const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
        mesh.name = `prop:${kind}`;
        matrices.forEach((mm, i) => mesh.setMatrixAt(i, mm));
        mesh.castShadow = shadows;
        mesh.receiveShadow = true;
        if (depth) mesh.customDepthMaterial = depth as THREE.MeshDepthMaterial;
        mesh.computeBoundingSphere();
        into.add(mesh);
      };
      inst(parts.solid, worldMaterial(), true);
      inst(parts.sway, swayMat(), true, swayDepthMaterial());
      inst(parts.glow, glowMaterial(), false);
      inst(parts.glass, glassMat(), true);
      for (const [i, p] of arr.entries()) {
        const mm = matrices[i];
        for (const l of parts.lights ?? []) {
          const v = new THREE.Vector3(l.x, l.y, l.z).applyMatrix4(mm);
          this.lights.push({ x: v.x, y: v.y, z: v.z, color: l.color, intensity: l.intensity, distance: l.distance * (p.s ?? 1) });
        }
        for (const f of parts.flames ?? []) this.addFlame(new THREE.Vector3(f.x, f.y, f.z).applyMatrix4(mm), f.size * (p.s ?? 1));
      }
    }
  }

  /** A fire: glowing voxels that lick upward, flicker and change shape. */
  private addFlame(at: THREE.Vector3, size: number): void {
    const g = new THREE.Group();
    g.position.copy(at);
    const cubes: THREE.Mesh[] = [];
    const cols = ['#ffd27a', '#ffa23a', '#ff6a1a', '#ff4a10'];
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Color(cols[i % cols.length]).multiplyScalar(4 - (i % cols.length) * 0.6);
      const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      cube.layers.set(FX_LAYER);
      g.add(cube);
      cubes.push(cube);
    }
    this.group.add(g);
    const seed = at.x * 3.1 + at.z * 1.7;
    this.animators.push((t) => {
      cubes.forEach((c, i) => {
        const life = (t * (1.4 + (i % 3) * 0.3) + i * 0.37 + seed) % 1;
        const s = size * 0.32 * (1 - life) * (0.7 + 0.3 * Math.sin(t * 11 + i));
        c.scale.setScalar(Math.max(0.001, s));
        c.position.set(Math.sin(i * 2.4 + t * 2) * size * 0.18 * (1 - life), life * size * 1.3, Math.cos(i * 1.7 + t * 2.3) * size * 0.18 * (1 - life));
        c.rotation.set(t + i, t * 0.7 + i, 0);
        (c.material as THREE.MeshBasicMaterial).opacity = 1 - life;
      });
    });
  }

  private placeLights(): void {
    if (!this.look.lit) return;
    const budget = this.renderer.quality.level === 'low' ? 4 : this.renderer.quality.level === 'medium' ? MAX_LIGHTS : MAX_LIGHTS + 4;
    // the lights nearest the fight matter most
    const chosen = [...this.lights].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).slice(0, budget);
    for (const l of chosen) {
      const light = new THREE.PointLight(l.color, l.intensity, l.distance, 1.5);
      light.position.set(l.x, l.y, l.z);
      this.group.add(light);
      const base = l.intensity;
      const off = l.x * 1.3 + l.z * 0.7;
      this.animators.push((t) => {
        light.intensity = base * (0.88 + Math.sin(t * 7 + off) * 0.07 + Math.sin(t * 13.7 + off * 2) * 0.05);
      });
    }
  }

  private buildHazards(): void {
    for (const h of this.map.hazards) {
      const mat = new THREE.ShaderMaterial({ uniforms: { uTime: G.uTime }, vertexShader: LAVA_VERT, fragmentShader: LAVA_FRAG });
      const geo = shapeGeometry(h.shape);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = -0.06;
      this.group.add(mesh);
      this.disposables.push(mat);
      if (h.shape.type === 'circle') this.lights.push({ x: h.shape.x, y: 0.8, z: h.shape.z, color: '#ff6a20', intensity: 12, distance: h.shape.r * 3.2 });
    }
  }

  private buildSafeZone(): void {
    const z = this.map.safeZone!;
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: G.uTime, color: { value: new THREE.Color('#9ff0ff') } },
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
    this.disposables.push(mat);
  }

  private attachBoard(x: number, z: number, rot: number, s: number): void {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 192;
    this.boardCanvas = c;
    this.boardTex = new THREE.CanvasTexture(c);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.boardTex.anisotropy = 4;
    // pixel type: keep the letters blocky up close
    this.boardTex.magFilter = THREE.NearestFilter;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.84, 2.2), new THREE.MeshBasicMaterial({ map: this.boardTex }));
    face.position.set(0, 1.9, 0.02);
    const holder = new THREE.Group();
    holder.position.set(x, 0, z);
    holder.rotation.y = rot;
    holder.scale.setScalar(s);
    holder.add(face);
    this.group.add(holder);
    this.setLeaderboard([]);
  }

  /** Draw the top of the ladder onto the in-world board in the plaza. */
  setLeaderboard(entries: LeaderboardEntry[]): void {
    const c = this.boardCanvas;
    if (!c || !this.boardTex) return;
    const g = c.getContext('2d')!;
    g.fillStyle = '#16120f';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#e8c44a';
    g.font = '600 18px "Pixelify Sans", monospace';
    g.textBaseline = 'top';
    g.textAlign = 'center';
    g.fillText('RANKED LADDER', c.width / 2, 10);
    g.fillStyle = 'rgba(232,196,74,0.4)';
    g.fillRect(16, 34, c.width - 32, 1);
    g.textAlign = 'left';
    g.font = '500 15px "Pixelify Sans", monospace';
    if (entries.length === 0) {
      g.fillStyle = '#c9b8a0';
      g.textAlign = 'center';
      g.fillText('No one has placed yet', c.width / 2, 80);
      g.fillText('Play 5 ranked games', c.width / 2, 102);
    }
    entries.slice(0, 7).forEach((e, i) => {
      const r = rankOf(e.mmr, e.placements);
      const y = 42 + i * 20;
      g.fillStyle = r.color;
      g.fillText(`${i + 1}`, 18, y);
      g.fillStyle = '#f0e6d8';
      g.fillText(e.name.slice(0, 16), 44, y);
      g.fillStyle = r.color;
      g.textAlign = 'right';
      g.fillText(String(e.mmr), c.width - 18, y);
      g.textAlign = 'left';
    });
    this.boardTex.needsUpdate = true;
  }

  /** Where fighters stand, so the grass parts around them. */
  setPushers(points: THREE.Vector3[]): void {
    for (let i = 0; i < 4; i++) {
      const p = points[i];
      if (p) G.uPushers.value[i].set(p.x, p.y, p.z, 0.9);
      else G.uPushers.value[i].set(0, 0, 0, 0);
    }
  }

  /** Triangles per scenery category (for profiling). */
  breakdown(): Record<string, number> {
    const out: Record<string, number> = {};
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      let cat = '';
      for (let p: THREE.Object3D | null = m; p && !cat; p = p.parent) cat = p.name;
      cat ||= 'other';
      const tris = (m.geometry.index ? m.geometry.index.count : (m.geometry.attributes.position?.count ?? 0)) / 3;
      const n = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
      out[cat] = (out[cat] ?? 0) + Math.round(tris * n);
    });
    return out;
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt;
    G.uTime.value = this.time;
    for (const a of this.animators) a(this.time, dt);
    for (const c of this.clouds) c.update(dt);
    for (const p of this.follow) p.setCenter(focus);
    // the shadow box follows the action, snapped to whole metres so shadows don't crawl
    const fx = Math.round(focus.x / 2) * 2;
    const fz = Math.round(focus.z / 2) * 2;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * 60, this.sunDir.y * 60, fz + this.sunDir.z * 60);
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const d of this.disposables) d.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      // shared geometry (trees, props) is cached and reused across maps; only per-map meshes go
      if (m.isMesh && m.geometry && !m.geometry.userData.cached) m.geometry.dispose();
    });
    for (let i = 0; i < 4; i++) G.uPushers.value[i].set(0, 0, 0, 0);
  }
}

let sway: THREE.MeshLambertMaterial | null = null;
function swayMat(): THREE.MeshLambertMaterial {
  sway ??= litMaterial({ vertexColors: true, ao: true, sway: true, side: THREE.DoubleSide });
  return sway;
}

let glass: THREE.MeshLambertMaterial | null = null;
function glassMat(): THREE.MeshLambertMaterial {
  glass ??= litMaterial({ vertexColors: true, ao: true, emissive: '#3a7ab8', emissiveIntensity: 0.9, transparent: true, opacity: 0.88 });
  return glass;
}

function shapeGeometry(s: Shape): THREE.BufferGeometry {
  const g = s.type === 'circle' ? new THREE.CircleGeometry(s.r, 48) : new THREE.PlaneGeometry(s.hw * 2, s.hd * 2);
  g.rotateX(-Math.PI / 2);
  g.translate(s.x, 0, s.z);
  return g;
}
