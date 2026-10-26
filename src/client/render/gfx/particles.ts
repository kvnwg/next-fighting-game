/**
 * Ambient particles, animated entirely on the GPU: every particle is a little voxel with a seed, and
 * the vertex shader works out where it is from the time, so thousands cost nothing on the CPU.
 *  - petals and leaves flutter down, tumbling, drift with the wind, rest on the ground a while
 *  - snow falls slowly and wanders
 *  - embers rise, flicker and fade
 *  - fireflies wander and blink
 *  - rain streaks down
 *  - dust motes hang in the air and glint where the sun catches them
 */
import * as THREE from 'three';
import { bindGlobals, FOG_GLSL, GLOBALS_GLSL } from './globals';

export type ParticleKind = 'petals' | 'leaves' | 'snow' | 'embers' | 'fireflies' | 'rain' | 'dust' | 'spores';

const VERT = /* glsl */ `
${GLOBALS_GLSL}
attribute vec4 aSeed;
attribute vec3 aColor;
uniform vec3 uCenter;
uniform vec3 uSize;
uniform float uScale;
uniform float uGround;
varying vec3 vColor;
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying float vAlpha;

mat3 rotAxis(vec3 a, float t) {
  float c = cos(t);
  float s = sin(t);
  float k = 1.0 - c;
  return mat3(c + a.x * a.x * k, a.y * a.x * k + a.z * s, a.z * a.x * k - a.y * s,
              a.x * a.y * k - a.z * s, c + a.y * a.y * k, a.z * a.y * k + a.x * s,
              a.x * a.z * k + a.y * s, a.y * a.z * k - a.x * s, c + a.z * a.z * k);
}

vec3 wrapXZ(vec3 p) {
  vec3 lo = uCenter - uSize * 0.5;
  p.xz = lo.xz + mod(p.xz - lo.xz, uSize.xz);
  return p;
}

void main() {
  vec4 s = aSeed;
  // positions are absolute in x/z (wrapped into the box around uCenter), so the box can follow the
  // camera without dragging the particles along
  vec3 start = (s.xyz - 0.5) * uSize + vec3(0.0, uCenter.y, 0.0);
#if defined(KIND_FIREFLIES) || defined(KIND_SPORES) || defined(KIND_EMBERS)
  start = uCenter + (s.xyz - 0.5) * uSize;
#endif
  float t = uTime;
  vec3 p;
  mat3 rot = mat3(1.0);
  float scale = uScale;
  vAlpha = 1.0;
  vec2 wind = uWind.xy * uWind.z;

#if defined(KIND_PETALS) || defined(KIND_LEAVES)
  float fall = uSize.y / (0.9 + s.w * 0.7);          // seconds from the top to the ground
  float rest = 4.0 + s.x * 4.0;                       // seconds lying on the ground
  float cyc = fall + rest;
  float tt = mod(t + s.w * cyc * 7.31, cyc);
  float drop = min(tt, fall);
  float y = uCenter.y + uSize.y * 0.5 - drop / fall * uSize.y;
  p = vec3(start.x, max(y, uGround), start.z);
  p.xz += wind * drop * 0.9 + vec2(sin(drop * 1.7 + s.x * 30.0), cos(drop * 1.3 + s.y * 30.0)) * 0.55;
  p = wrapXZ(p);
  vec3 axis = normalize(vec3(s.y - 0.5, 0.35, s.z - 0.5) + 0.001);
  if (tt < fall) {
    rot = rotAxis(axis, drop * (2.5 + s.z * 3.0));
  } else {
    // lying flat, fading before it's lifted back up
    rot = rotAxis(vec3(0.0, 1.0, 0.0), s.x * 6.28);
    p.y = uGround + 0.01;
    vAlpha = 1.0 - smoothstep(rest * 0.6, rest, tt - fall);
  }
#elif defined(KIND_SNOW)
  float fall = uSize.y / (0.55 + s.w * 0.4);
  float tt = mod(t + s.w * fall * 5.7, fall);
  p = vec3(start.x, uCenter.y + uSize.y * 0.5 - tt / fall * uSize.y, start.z);
  p.xz += wind * tt * 0.6 + vec2(sin(tt * 0.9 + s.x * 20.0), cos(tt * 0.7 + s.y * 20.0)) * 0.4;
  p = wrapXZ(p);
  vAlpha = smoothstep(0.0, 0.05, tt / fall) * (1.0 - smoothstep(0.95, 1.0, tt / fall));
#elif defined(KIND_RAIN)
  float fall = 0.55 + s.w * 0.25;
  float tt = mod(t + s.w * 17.0, fall);
  p = vec3(start.x, uCenter.y + uSize.y * 0.5 - tt / fall * uSize.y, start.z);
  p.xz += wind * tt * 2.0;
  p = wrapXZ(p);
  vAlpha = 0.55;
#elif defined(KIND_EMBERS)
  float life = 3.0 + s.w * 3.0;
  float tt = mod(t + s.w * life * 9.1, life);
  p = vec3(start.x, uGround + tt * (0.9 + s.z * 0.8), start.z);
  p.xz += vec2(sin(tt * 2.1 + s.x * 40.0), cos(tt * 1.7 + s.y * 40.0)) * 0.35 + wind * tt * 0.3;
  rot = rotAxis(normalize(s.xyz - 0.5 + 0.001), tt * 4.0);
  vAlpha = (1.0 - tt / life) * (0.7 + 0.3 * sin(t * 13.0 + s.x * 50.0));
  scale *= 1.0 - tt / life * 0.6;
#elif defined(KIND_FIREFLIES) || defined(KIND_SPORES)
  p = start + vec3(sin(t * (0.2 + s.x * 0.3) + s.y * 20.0) * 1.6, sin(t * (0.3 + s.z * 0.2) + s.x * 11.0) * 0.6, cos(t * (0.25 + s.y * 0.3) + s.z * 17.0) * 1.6);
  #ifdef KIND_FIREFLIES
    vAlpha = smoothstep(0.2, 0.9, sin(t * (0.8 + s.w * 1.2) + s.x * 40.0) * 0.5 + 0.5);
  #else
    p.y += mod(t * 0.15 + s.w * 10.0, uSize.y) - uSize.y * 0.5;
    vAlpha = 0.6 + 0.4 * sin(t * 2.0 + s.x * 30.0);
  #endif
#else
  // dust motes: slow drift, glinting as they turn
  p = start + vec3(sin(t * 0.13 + s.x * 30.0), sin(t * 0.17 + s.y * 30.0) * 0.5, cos(t * 0.11 + s.z * 30.0)) * 1.2;
  p.xz += wind * t * 0.15;
  p = wrapXZ(p);
  p.y = max(p.y, uGround + 0.2);
  vAlpha = pow(max(0.0, sin(t * (0.6 + s.w) + s.x * 60.0)), 4.0);
#endif

  vec3 local = rot * (position * scale);
#ifdef KIND_RAIN
  local = position * vec3(scale, scale * 30.0, scale);
#endif
  vec3 wp = p + local;
  vColor = aColor;
  vNormalW = normalize(rot * normal);
  vWorldPos = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = /* glsl */ `
${GLOBALS_GLSL}
${FOG_GLSL}
uniform vec3 uAmbient;
varying vec3 vColor;
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying float vAlpha;
void main() {
  if (vAlpha < 0.02) discard;
#ifdef GLOW
  vec3 c = vColor;
#else
  vec3 n = normalize(vNormalW);
  if (!gl_FrontFacing) n = -n;
  float sun = max(dot(n, uSunDir), 0.0);
  vec3 view = normalize(vWorldPos - cameraPosition);
  float through = pow(max(dot(view, uSunDir), 0.0), 4.0);
  vec3 c = vColor * (uAmbient + uSunColor * (sun * 0.75 + through * 0.9));
  #ifdef KIND_DUST
    c = vColor * (uAmbient * 0.5 + uSunColor * (0.6 + through * 3.0));
  #endif
#endif
#ifdef USE_FOG_PARTICLES
  c = voxFog(c, vWorldPos);
#endif
  gl_FragColor = vec4(c, vAlpha);
}`;

export interface ParticleOptions {
  kind: ParticleKind;
  count: number;
  /** the box they live in */
  center: THREE.Vector3;
  size: THREE.Vector3;
  /** voxel size (metres) */
  scale?: number;
  /** palette (glowing kinds: these are HDR, so values above 1 bloom) */
  colors: (string | THREE.Color)[];
  /** brightness multiplier for glowing kinds */
  intensity?: number;
  /** ambient light colour for lit kinds */
  ambient?: THREE.Color;
  ground?: number;
  seed?: number;
}

const GLOWING = new Set<ParticleKind>(['embers', 'fireflies', 'spores']);

export class Particles {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;

  constructor(o: ParticleOptions) {
    const base =
      o.kind === 'petals' ? new THREE.BoxGeometry(1, 0.28, 1) : o.kind === 'leaves' ? new THREE.BoxGeometry(1.4, 0.25, 1) : o.kind === 'rain' ? new THREE.BoxGeometry(0.3, 1, 0.3) : new THREE.BoxGeometry(1, 1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('normal', base.attributes.normal);
    const seeds = new Float32Array(o.count * 4);
    const cols = new Float32Array(o.count * 3);
    let a = (o.seed ?? 7) >>> 0;
    const rand = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const palette = o.colors.map((c) => (c instanceof THREE.Color ? c.clone() : new THREE.Color(c)));
    const k = GLOWING.has(o.kind) ? o.intensity ?? 4 : 1;
    for (let i = 0; i < o.count; i++) {
      seeds.set([rand(), rand(), rand(), rand()], i * 4);
      const c = palette[Math.floor(rand() * palette.length)];
      cols.set([c.r * k, c.g * k, c.b * k], i * 3);
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(cols, 3));
    geo.instanceCount = o.count;
    const defines: Record<string, string> = { [`KIND_${o.kind.toUpperCase()}`]: '', USE_FOG_PARTICLES: '' };
    if (GLOWING.has(o.kind)) defines.GLOW = '';
    const uniforms: Record<string, THREE.IUniform> = {
      uCenter: { value: o.center.clone() },
      uSize: { value: o.size.clone() },
      uScale: { value: o.scale ?? 0.06 },
      uGround: { value: o.ground ?? 0 },
      uAmbient: { value: o.ambient ?? new THREE.Color(0.5, 0.5, 0.55) },
    };
    bindGlobals(uniforms);
    this.mat = new THREE.ShaderMaterial({
      uniforms,
      defines,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: o.kind === 'petals' || o.kind === 'leaves',
      side: THREE.DoubleSide,
      blending: GLOWING.has(o.kind) || o.kind === 'rain' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** Move the box (e.g. to stay around the camera). */
  setCenter(v: THREE.Vector3): void {
    (this.mat.uniforms.uCenter.value as THREE.Vector3).copy(v);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
