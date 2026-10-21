/**
 * Materials for the voxel world. Built-in three.js materials, patched in onBeforeCompile with:
 *  - per-vertex ambient occlusion baked by the voxel mesher (aAO), the "smooth lighting" look
 *  - wind sway (aVox.x is how far a vertex may move; instances sway out of step)
 *  - light through leaves when you look toward the sun (aVox.y is how leafy a vertex is)
 *  - exponential height fog that glows toward the sun, shared by everything
 *  - a rim light for fighters, so they stand out against busy scenery
 */
import * as THREE from 'three';
import { bindGlobals, FOG_GLSL, GLOBALS_GLSL, WIND_GLSL } from './globals';

export interface PatchOpts {
  /** the geometry carries aAO */
  ao?: boolean;
  /** the geometry carries aVox and moves in the wind */
  sway?: boolean;
  /** leaves: lit from behind when the sun is beyond them (needs aVox) */
  leaf?: boolean;
  /** fighters: a rim of light around the silhouette */
  rim?: boolean;
  /** grass: bends away from fighters walking through it (uses aVox.x as the bend) */
  push?: boolean;
  /** sprite atlas with this many cells side by side; each instance picks one with aSprite */
  atlas?: number;
  /** clouds: sunlit faces, a glow where they cross the sun, and haze with distance */
  cloud?: boolean;
  /** scenery: dissolves where it stands between the camera and a fighter (see G.uSee) */
  see?: boolean;
}

/**
 * The see-through: a dithered hole, a tube from the camera to each fighter, through anything in
 * the way. Only what's nearer the camera than the fighter, so the ground and walls behind stay.
 */
const SEE_GLSL = /* glsl */ `
#ifdef VOX_SEE
  for (int i = 0; i < 2; i++) {
    vec4 s = uSee[i];
    if (s.w <= 0.0) continue;
    vec3 ray = s.xyz - cameraPosition;
    float len = length(ray);
    vec3 rd = ray / max(len, 1e-3);
    float t = dot(vWorldPos - cameraPosition, rd);
    if (t < 0.3 || t > len - s.w * 0.7) continue;
    float d = length(vWorldPos - cameraPosition - rd * t);
    // the tube opens a little toward the fighter
    float r = s.w * mix(0.75, 1.0, t / len);
    float k = 1.0 - smoothstep(r * 0.55, r, d);
    if (k <= 0.0) continue;
    // 4x4 ordered dither, so the hole reads as a soft-edged screen door, not a hard cut
    vec2 q = floor(gl_FragCoord.xy);
    vec2 lo = mod(q, 2.0);
    vec2 hi = mod(floor(q * 0.5), 2.0);
    float bayer = (4.0 * mod(2.0 * lo.x + 3.0 * lo.y, 4.0) + mod(2.0 * hi.x + 3.0 * hi.y, 4.0) + 0.5) / 16.0;
    if (k * 0.92 > bayer) discard;
  }
#endif
`;

const VERT_DECL = /* glsl */ `
${GLOBALS_GLSL}
${WIND_GLSL}
varying vec3 vWorldPos;
#ifdef VOX_AO
attribute float aAO;
varying float vAO;
#endif
#if defined(VOX_SWAY) || defined(VOX_LEAF) || defined(VOX_PUSH)
attribute vec2 aVox;
#endif
#ifdef VOX_LEAF
varying float vLeaf;
#endif
#ifdef VOX_ATLAS
attribute float aSprite;
#endif
`;

/** project_vertex, but in world space so the wind can push vertices around. */
const PROJECT = /* glsl */ `
vec4 voxWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  voxWorld = instanceMatrix * voxWorld;
  float voxPhase = dot(instanceMatrix[3].xz, vec2(0.37, 0.61));
#else
  float voxPhase = dot(modelMatrix[3].xz, vec2(0.37, 0.61));
#endif
voxWorld = modelMatrix * voxWorld;
#ifdef VOX_SWAY
  voxWorld.xyz += voxWind(voxWorld.xyz, aVox.x, voxPhase);
#endif
#ifdef VOX_PUSH
  for (int i = 0; i < 4; i++) {
    vec4 p = uPushers[i];
    if (p.w <= 0.0) continue;
    vec2 away = voxWorld.xz - p.xz;
    float d = length(away);
    float k = (1.0 - smoothstep(p.w * 0.35, p.w, d)) * aVox.x * 7.0;
    voxWorld.xz += away / max(d, 1e-3) * k * 0.6;
    voxWorld.y -= k * 0.35;
  }
#endif
vWorldPos = voxWorld.xyz;
vec4 mvPosition = viewMatrix * voxWorld;
gl_Position = projectionMatrix * mvPosition;
#ifdef VOX_AO
  vAO = aAO;
#endif
#ifdef VOX_LEAF
  vLeaf = aVox.y;
#endif
`;

const FRAG_DECL = /* glsl */ `
${GLOBALS_GLSL}
${FOG_GLSL}
varying vec3 vWorldPos;
#ifdef VOX_AO
varying float vAO;
#endif
#ifdef VOX_LEAF
varying float vLeaf;
#endif
`;

const LIGHT_MODS = /* glsl */ `
#ifdef VOX_AO
  // occlusion darkens the sky light most; direct sun keeps most of its punch
  reflectedLight.indirectDiffuse *= vAO;
  reflectedLight.directDiffuse *= mix(1.0, vAO, 0.35);
#endif
#ifdef VOX_LEAF
  {
    vec3 voxView = normalize(vWorldPos - cameraPosition);
    float through = pow(max(dot(voxView, uSunDir), 0.0), 4.0);
    #ifdef VOX_AO
      float leafAO = vAO;
    #else
      float leafAO = 1.0;
    #endif
    reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * (through * 1.1 + 0.08) * vLeaf * leafAO;
  }
#endif
#ifdef VOX_RIM
  {
    vec3 voxN = normal;
    vec3 voxV = normalize(vViewPosition);
    float rim = 1.0 - clamp(dot(voxN, voxV), 0.0, 1.0);
    vec3 sunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
    float sunSide = 0.45 + 0.55 * clamp(dot(voxN, sunView) * 0.8 + 0.45, 0.0, 1.0);
    totalEmissiveRadiance += uRim.rgb * pow(rim, 3.0) * uRim.a * sunSide;
  }
#endif
`;

const FOG = /* glsl */ `
#ifdef VOX_CLOUD
  {
    // faces turned to the sun catch it, the cloud glows where it crosses the sun (the silver
    // lining), and far off it melts into the haze
    vec3 voxN = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    vec3 voxView = normalize(vWorldPos - cameraPosition);
    float toward = max(dot(voxView, uSunDir), 0.0);
    float lit = max(dot(voxN, uSunDir), 0.0);
    gl_FragColor.rgb += uSunColor * (lit * 0.1 + pow(toward, 3.0) * 0.1 + pow(toward, 16.0) * 0.45);
    float far = 1.0 - exp(-length(vWorldPos.xz - cameraPosition.xz) * 0.0018);
    vec3 haze = mix(uFogColor, uFogSunColor, pow(toward, uFog.w));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, haze, far * 0.3);
  }
#endif
#ifdef USE_FOG
  #ifdef VOX_CLOUD
    // half the ground haze: clouds keep their dark undersides against a bright sky
    gl_FragColor.rgb = mix(gl_FragColor.rgb, voxFog(gl_FragColor.rgb, vWorldPos), 0.5);
  #else
    gl_FragColor.rgb = voxFog(gl_FragColor.rgb, vWorldPos);
  #endif
#endif
`;

function definesFor(o: PatchOpts): Record<string, string> {
  const d: Record<string, string> = {};
  if (o.ao) d.VOX_AO = '';
  if (o.sway) d.VOX_SWAY = '';
  if (o.leaf) d.VOX_LEAF = '';
  if (o.rim) d.VOX_RIM = '';
  if (o.push) d.VOX_PUSH = '';
  if (o.cloud) d.VOX_CLOUD = '';
  if (o.see) d.VOX_SEE = '';
  if (o.atlas) d.VOX_ATLAS = `${o.atlas.toFixed(1)}`;
  return d;
}

/** Give a built-in material (Lambert, Basic, Toon, Phong, Standard) the world features. */
export function patchMaterial<T extends THREE.Material>(m: T, o: PatchOpts = {}): T {
  m.defines = { ...(m.defines ?? {}), ...definesFor(o) };
  m.onBeforeCompile = (shader) => {
    bindGlobals(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <project_vertex>', PROJECT)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#if defined(VOX_ATLAS) && defined(USE_MAP)\n  vMapUv.x = (vMapUv.x + aSprite) / VOX_ATLAS;\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${SEE_GLSL}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${LIGHT_MODS}`)
      .replace('#include <fog_fragment>', FOG);
  };
  m.customProgramCacheKey = () => `vox:${Object.keys(definesFor(o)).join(',')}`;
  return m;
}

export interface LitOpts extends PatchOpts {
  color?: THREE.ColorRepresentation;
  vertexColors?: boolean;
  map?: THREE.Texture | null;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  alphaTest?: number;
}

/** A lit, shadow-receiving world material. */
export function litMaterial(o: LitOpts = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({
    color: o.color ?? '#ffffff',
    vertexColors: o.vertexColors ?? false,
    map: o.map ?? null,
    emissive: o.emissive ?? '#000000',
    emissiveIntensity: o.emissiveIntensity ?? 1,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    alphaTest: o.alphaTest ?? 0,
  });
  return patchMaterial(m, { see: true, ...o });
}

/** Shadow-pass material that moves with the wind like the mesh it stands in for. */
export function swayDepthMaterial(): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.defines = { VOX_SWAY: '' };
  m.onBeforeCompile = (shader) => {
    bindGlobals(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLOBALS_GLSL}\n${WIND_GLSL}\nvarying vec3 vWorldPos;\nattribute vec2 aVox;\n`)
      .replace('#include <project_vertex>', PROJECT);
  };
  m.customProgramCacheKey = () => 'vox-depth-sway';
  return m;
}

const lambertCache = new Map<string, THREE.MeshLambertMaterial>();

/** Shared plain-colour lit material (for small props built from boxes). */
export function solid(color: THREE.ColorRepresentation, opts: { emissive?: THREE.ColorRepresentation; emissiveIntensity?: number } = {}): THREE.MeshLambertMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? 1}`;
  const hit = lambertCache.get(key);
  if (hit) return hit;
  const m = litMaterial({ color, emissive: opts.emissive, emissiveIntensity: opts.emissiveIntensity });
  lambertCache.set(key, m);
  return m;
}
