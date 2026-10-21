/**
 * Sky: a gradient dome with the sun's glow, a sun disc bright enough to bloom, or at night a
 * crescent moon with a halo, twinkling stars and a faint band of the Milky Way. Clouds are blocky,
 * Minecraft-style slabs that drift with the wind, lit on top and shaded underneath.
 */
import * as THREE from 'three';
import { G } from './globals';
import { patchMaterial } from './materials';
import { hash3 } from './noise';
import { VoxelVolume, meshVoxels, mixHex, hex } from './voxel';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // pinned just inside the far plane, behind everything
  p.z = p.w * 0.999999;
  gl_Position = p;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 band;
uniform float bandAmount;
uniform vec3 below;
uniform vec3 glowColor;
uniform vec3 discDir;
uniform float glowStrength;
uniform vec3 discColor;
uniform float discCos;
uniform float night;
uniform float stars;
uniform float time;
varying vec3 vDir;

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float hash1(float n) { return fract(sin(n) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 57.0 + i.z * 113.0;
  return mix(mix(mix(hash1(n), hash1(n + 1.0), f.x), mix(hash1(n + 57.0), hash1(n + 58.0), f.x), f.y),
             mix(mix(hash1(n + 113.0), hash1(n + 114.0), f.x), mix(hash1(n + 170.0), hash1(n + 171.0), f.x), f.y), f.z);
}

float starField(vec3 d, float scale, float threshold) {
  vec3 p = d * scale;
  vec3 id = floor(p);
  float h = hash(id);
  if (h < threshold) return 0.0;
  vec3 c = id + 0.5 + (vec3(hash(id + 1.3), hash(id + 2.7), hash(id + 5.1)) - 0.5) * 0.6;
  float dist = length(p - c);
  float tw = 0.65 + 0.35 * sin(time * (1.5 + h * 3.0) + h * 80.0);
  return smoothstep(0.32, 0.0, dist) * tw * (h - threshold) / (1.0 - threshold);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
  // a band of colour just above the horizon (sunset pinks, morning gold)
  c = mix(c, band, exp(-abs(h - 0.06) * 9.0) * bandAmount);
  c = mix(c, below, smoothstep(0.0, -0.2, h));

  float sd = max(dot(d, discDir), 0.0);
  // broad haze and tight glow around the sun (or moon), stronger along the horizon
  float glow = pow(sd, 3.0) * 0.22 + pow(sd, 24.0) * 0.5 + pow(sd, 300.0) * 1.6;
  glow *= 1.0 + smoothstep(0.3, 0.0, abs(h - discDir.y)) * 0.6;
  c += glowColor * glow * glowStrength;

  if (night > 0.5) {
    // crescent: the lit disc minus a second disc offset away from the sun side
    float moon = smoothstep(discCos, discCos + 0.00008, sd);
    vec3 off = normalize(discDir + normalize(cross(discDir, vec3(0.0, 1.0, 0.0))) * 0.022 + vec3(0.0, 0.01, 0.0));
    float bite = smoothstep(discCos, discCos + 0.00008, max(dot(d, off), 0.0));
    c += discColor * moon * (1.0 - bite);
    // stars, fewer near the horizon haze and the moon, a denser band across the sky
    vec3 bandN = normalize(vec3(0.35, 0.55, 0.75));
    float mw = exp(-pow(dot(d, bandN), 2.0) * 14.0);
    float s = starField(d, 160.0, 0.988) * 1.4 + starField(d, 320.0, 0.982 - mw * 0.03) * 0.7;
    float fadeH = smoothstep(0.02, 0.25, h) * (1.0 - smoothstep(0.995, 0.9999, sd));
    c += vec3(0.85, 0.9, 1.0) * s * stars * fadeH;
    float dust = noise(d * 6.0) * 0.6 + noise(d * 13.0) * 0.4;
    c += vec3(0.25, 0.22, 0.45) * mw * smoothstep(0.35, 0.8, dust) * 0.18 * stars * fadeH;
  } else {
    c += discColor * smoothstep(discCos, discCos + 0.00015, sd);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

export interface SkyTheme {
  zenith: string;
  horizon: string;
  /** colour of the band hugging the horizon, and how strong it is */
  band?: string;
  bandAmount?: number;
  /** below the horizon (void maps look down into it) */
  below?: string;
  sun: string;
  /** where the disc and glow sit (defaults to the light direction) */
  discDir: THREE.Vector3;
  night: boolean;
  glow?: number;
  /** angular radius of the disc in radians */
  discSize?: number;
}

export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;

  constructor(t: SkyTheme) {
    const sun = new THREE.Color(t.sun);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: new THREE.Color(t.zenith) },
        horizon: { value: new THREE.Color(t.horizon) },
        band: { value: new THREE.Color(t.band ?? t.horizon) },
        bandAmount: { value: t.bandAmount ?? 0 },
        below: { value: new THREE.Color(t.below ?? t.horizon) },
        glowColor: { value: t.night ? new THREE.Color('#9fb4ff') : sun.clone() },
        discDir: { value: t.discDir.clone().normalize() },
        glowStrength: { value: t.glow ?? (t.night ? 0.45 : 1) },
        discColor: { value: t.night ? new THREE.Color('#fbf6e4').multiplyScalar(6) : new THREE.Color('#fff6e8').lerp(sun, 0.25).multiplyScalar(40) },
        discCos: { value: Math.cos(t.discSize ?? (t.night ? 0.04 : 0.03)) },
        night: { value: t.night ? 1 : 0 },
        stars: { value: t.night ? 1 : 0 },
        time: G.uTime,
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), this.mat);
    this.mesh.renderOrder = -100;
    this.mesh.frustumCulled = false;
    // the dome follows the camera so it never clips
    this.mesh.onBeforeRender = (_r, _s, camera) => {
      this.mesh.position.copy(camera.position);
      this.mesh.updateMatrixWorld();
    };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

export interface CloudOptions {
  /** height of the layer's base, metres */
  y: number;
  /** cell footprint and thickness, metres */
  cell: number;
  thick: number;
  /** fraction of the sky covered, 0..1 */
  cover: number;
  /** half-width of the layer in cells */
  half: number;
  top: string;
  side: string;
  bottom: string;
  opacity?: number;
  seed?: number;
  /** metres per second along the wind */
  speed?: number;
  /** two layers of cells, so the clouds have bulk */
  layers?: number;
}

/**
 * A drifting layer of blocky clouds. The pattern repeats every `2 * half` cells, and the layer is
 * drawn twice end to end, so it can scroll forever without a seam.
 */
export class CloudLayer {
  readonly group = new THREE.Group();
  private readonly period: number;
  private offset = 0;
  private readonly speed: number;

  constructor(o: CloudOptions) {
    const n = o.half * 2;
    const layers = o.layers ?? 1;
    const vol = new VoxelVolume(n, layers, n, [o.cell, o.thick / layers, o.cell], [-(n * o.cell) / 2, o.y, -(n * o.cell) / 2]);
    const seed = o.seed ?? 3;
    // periodic noise: lattice coordinates wrap at the period so the edges match up
    const per = (x: number, z: number, s: number) => {
      const xi = Math.floor(x);
      const zi = Math.floor(z);
      const fx = x - xi;
      const fz = z - zi;
      const p = Math.max(1, Math.round(n / s));
      const w = (a: number) => ((a % p) + p) % p;
      const h = (a: number, b: number) => hash3(w(a), 0, w(b), seed + s);
      const sx = fx * fx * (3 - 2 * fx);
      const sz = fz * fz * (3 - 2 * fz);
      const a = h(xi, zi) + (h(xi + 1, zi) - h(xi, zi)) * sx;
      const b = h(xi, zi + 1) + (h(xi + 1, zi + 1) - h(xi, zi + 1)) * sx;
      return a + (b - a) * sz;
    };
    const top = hex(o.top);
    const side = hex(o.side);
    const bottom = hex(o.bottom);
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const v = per(x / 6, z / 6, 6) * 0.6 + per(x / 3, z / 3, 3) * 0.3 + per(x / 1.5, z / 1.5, 1.5) * 0.1;
        if (v < 1 - o.cover) continue;
        // the deeper into a cloud, the darker its underside: thin edges stay light
        const depth = Math.min(1, (v - (1 - o.cover)) / (o.cover * 0.35));
        const under = mixHex(side, bottom, 0.55 + depth * 0.45);
        for (let y = 0; y < layers; y++) {
          // each layer up covers less: only the thick middle of a cloud rises to the top
          if (y > 0 && v < 1 - o.cover * (1 - (0.45 * y) / (layers - 1))) continue;
          vol.set(x, y, z, y === 0 ? under : top);
        }
      }
    }
    const geo = meshVoxels(vol, { jitter: 0, ao: [0.72, 0.8, 0.9, 1] });
    // shade by facing: lit tops, softer sides; undersides keep their depth shading
    const nor = geo.attributes.normal;
    const col = geo.attributes.color;
    const ct = new THREE.Color(top);
    const cs = new THREE.Color(side);
    for (let i = 0; i < nor.count; i++) {
      const ny = nor.getY(i);
      if (ny < -0.5) continue;
      const c = ny > 0.5 ? ct : cs;
      col.setXYZ(i, c.r, c.g, c.b);
    }
    const mat = patchMaterial(
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1, depthWrite: true }),
      { ao: true, cloud: true },
    );
    this.period = n * o.cell;
    for (const k of [0, 1]) {
      const m = new THREE.Mesh(geo, mat);
      m.position.x = k * this.period;
      m.frustumCulled = false;
      m.renderOrder = -50;
      this.group.add(m);
    }
    this.speed = o.speed ?? 2;
  }

  update(dt: number): void {
    // the two copies span [offset - 1.5P, offset + 0.5P], always covering the middle of the map
    this.offset = (this.offset + dt * this.speed) % this.period;
    this.group.position.x = this.offset - this.period;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}
