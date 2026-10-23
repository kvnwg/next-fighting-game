/**
 * A meadow of voxel grass: each blade a little stack of blocks, grown on the GPU around the camera
 * so a field can be thick without a million instances on the CPU. Each blade's place is a cell of
 * a grid fixed to the world (it never swims as the camera moves); a mask texture says how thick
 * the grass grows where (none on paths and paving), how dry it is, and where flowers are. A second,
 * coarser grid of chunkier blades carries the field out to the middle distance.
 *
 * Wind rolls across in waves you can watch travel: each block of a blade shifts whole, so they bend
 * in steps, like everything else in the world. Bent over, they show their paler side; they glow
 * when the sun is behind them, the lower blocks sit in shade, and fighters push through them.
 */
import * as THREE from 'three';
import { patchMaterial } from './materials';

export interface MeadowOptions {
  /** the area the mask covers (the grass never grows outside it) */
  bounds: { x0: number; z0: number; x1: number; z1: number };
  /** 0..1 how thick the grass grows at (x, z) */
  density: (x: number, z: number) => number;
  /** 0..1 how dry (straw-coloured) it is at (x, z) */
  dry?: (x: number, z: number) => number;
  /** 0..1 how many flowers grow at (x, z) */
  flowers?: (x: number, z: number) => number;
  /** blade colours: root, tip, and the dry tip */
  root: string;
  tip: string;
  dryTip: string;
  /** flower heads */
  bloom: string[];
  /** blade height (metres, before variation) */
  height?: number;
}

/** Spacing (m) and reach (m) of the near and far grids, per quality tier. */
const TIERS = {
  low: { near: [0.34, 10], far: [1.0, 28] },
  medium: { near: [0.26, 14], far: [0.75, 40] },
  high: { near: [0.2, 18], far: [0.6, 50] },
  ultra: { near: [0.17, 20], far: [0.5, 56] },
} as const;

/**
 * One blade: a stack of unit blocks (x and z -0.5..0.5, y from the block's index to the one above,
 * so position.y counts blocks), each with its four sides and a top. aSeg is the block's index.
 */
function bladeGeometry(segments: number): THREE.InstancedBufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const seg: number[] = [];
  const idx: number[] = [];
  const face = (k: number, corners: number[][], n: number[]) => {
    const b = pos.length / 3;
    for (const c of corners) {
      pos.push(c[0], c[1] + k, c[2]);
      nor.push(n[0], n[1], n[2]);
      seg.push(k);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const h = 0.5;
  for (let k = 0; k < segments; k++) {
    face(k, [[h, 0, h], [h, 0, -h], [h, 1, -h], [h, 1, h]], [1, 0, 0]);
    face(k, [[-h, 0, -h], [-h, 0, h], [-h, 1, h], [-h, 1, -h]], [-1, 0, 0]);
    face(k, [[-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h]], [0, 0, 1]);
    face(k, [[h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h]], [0, 0, -1]);
    face(k, [[-h, 1, h], [h, 1, h], [h, 1, -h], [-h, 1, -h]], [0, 1, 0]);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(pos.map(() => 1), 3));
  g.setIndex(idx);
  return g;
}

function maskTexture(o: MeadowOptions, res: number): THREE.DataTexture {
  const data = new Uint8Array(res * res * 4);
  const w = o.bounds.x1 - o.bounds.x0;
  const d = o.bounds.z1 - o.bounds.z0;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = o.bounds.x0 + ((i + 0.5) / res) * w;
      const z = o.bounds.z0 + ((j + 0.5) / res) * d;
      const k = (j * res + i) * 4;
      data[k] = Math.round(Math.max(0, Math.min(1, o.density(x, z))) * 255);
      data[k + 1] = Math.round(Math.max(0, Math.min(1, o.dry?.(x, z) ?? 0)) * 255);
      data[k + 2] = Math.round(Math.max(0, Math.min(1, o.flowers?.(x, z) ?? 0)) * 255);
      data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

const VERT_DECL = /* glsl */ `
uniform sampler2D uMeadowMask;
uniform vec4 uMeadowBox;
uniform vec4 uMeadowGrid;
uniform float uMeadowInner;
uniform float uMeadowWide;
uniform float uMeadowSegs;
attribute float aSeg;
uniform vec3 uBladeRoot;
uniform vec3 uBladeTip;
uniform vec3 uBladeDry;
uniform vec3 uBloom[4];
varying float vBladeH;
varying float vGust;
// a hash without sine: fract(sin(x) * 43758) keeps only ~8 bits at these sizes, and lands on 0
vec2 meadowHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
`;

/** Grows the blade: its place, size, bend and push, its normal, and its colour (into vColor). */
const BLADE = /* glsl */ `
vec3 objectNormal;
vec3 bladePos;
vec3 bladeColor;
{
  float s = uMeadowGrid.x;
  float G = uMeadowGrid.y;
  float R = uMeadowGrid.z;
  float id = float(gl_InstanceID);
  float iz = floor(id / G);
  float ix = id - iz * G;
  vec2 cell = floor(cameraPosition.xz / s) - floor(G * 0.5) + vec2(ix, iz);
  vec2 r = meadowHash(cell);
  vec2 r2 = meadowHash(cell + 17.31);
  vec2 root = (cell + r) * s;
  float dist = length(root - cameraPosition.xz);
  vec2 muv = (root - uMeadowBox.xy) * uMeadowBox.zw;
  vec4 mask = texture2D(uMeadowMask, muv);
  float inside = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
  float dens = mask.r * inside;
  // thinner with distance (wider to make up for it), gone past the reach, and the far grid only
  // takes over where the near one gives out
  float near = clamp(1.0 - (dist - R * 0.4) / (R * 0.6), 0.0, 1.0);
  float keep = mix(0.3, 1.0, near * near);
  // (smoothstep's edges always ascending: the other way round is undefined, and NaN on some GPUs)
  float edge = (1.0 - smoothstep(R * 0.82, R, dist)) * (uMeadowInner > 0.0 ? smoothstep(uMeadowInner * 0.78, uMeadowInner, dist) : 1.0);
  float alive = (r2.x < dens * keep ? 1.0 : 0.0) * edge;
  float flower = step(1.0 - mask.b * 0.07, r2.y) * alive;
  float height = (0.6 + r2.y * 0.7) * mix(0.55, 1.0, dens) * uMeadowGrid.w * alive * mix(0.4, 1.0, edge) * (1.0 + flower * 0.2);
  float width = (0.07 + r.x * 0.03) * (1.0 + (1.0 - keep) * 0.8) * uMeadowWide;
  vec2 fdir = normalize(r - 0.5 + 1e-3);

  // wind: long gust fronts rolling along it, a quicker ripple, and the tips' flutter
  vec2 wd = normalize(uWind.xy + 1e-4);
  vec2 wx = vec2(-wd.y, wd.x);
  float t = uTime;
  float along = dot(root, wd);
  float wave = sin(along * 0.21 - t * 1.6 + sin(dot(root, wx) * 0.06 + t * 0.2) * 2.2) * 0.5 + 0.5;
  float ripple = sin(along * 0.67 - t * 2.9 + r.x * 2.0) * 0.5 + 0.5;
  float gust = wave * wave * 0.8 + ripple * 0.2;
  float flutter = sin(t * 7.3 + r.x * 37.0) * (0.05 + gust * 0.07);
  float lean = (0.3 + r2.x * 0.3 + gust * 1.1 * uWind.w) * uWind.z + flutter;
  vec2 bendDir = normalize(wd * 0.85 + fdir * (r.y - 0.5) * 0.5);
  vec2 off = bendDir * lean;
  // fighters walking through push it aside
  for (int i = 0; i < 4; i++) {
    vec4 p = uPushers[i];
    if (p.w <= 0.0) continue;
    vec2 away = root - p.xz;
    float d = length(away);
    float k = 1.0 - smoothstep(p.w * 0.3, p.w * 1.3, d);
    off += away / max(d, 1e-3) * k * 1.4;
  }
  // each block moves whole, by how far up the blade its middle is: the blade bends in steps
  float n = uMeadowSegs;
  float h = (aSeg + 0.5) / n;
  float curve = h * h;
  // a bent blade is shorter, not longer
  float sag = 1.0 / (1.0 + dot(off, off) * 0.35);
  float block = height / n;
  bladePos = vec3(root.x, position.y * block * sag, root.y);
  // each block a little narrower than the one under it
  bladePos.xz += position.xz * width * (1.0 - aSeg * 0.16);
  bladePos.xz += off * curve * height;
  // no blade here: every vertex at one point under the ground, so nothing at all is drawn
  if (height <= 0.001) bladePos = vec3(root.x, -1.0, root.y);
  objectNormal = normal;

  vec3 tipCol = mix(uBladeTip, uBladeDry, clamp(mask.g + (r.x - 0.5) * 0.35, 0.0, 1.0));
  // one colour per block, banded root to tip
  bladeColor = mix(uBladeRoot, tipCol, h);
  bladeColor *= 0.88 + r2.y * 0.24;
  // bent over by a gust, a blade shows its paler side
  bladeColor = mix(bladeColor, bladeColor * 1.28 + vec3(0.02, 0.03, 0.0), gust * h * 0.55);
  int b = int(floor(r.x * 3.999));
  vec3 bloom = b == 0 ? uBloom[0] : b == 1 ? uBloom[1] : b == 2 ? uBloom[2] : uBloom[3];
  bladeColor = mix(bladeColor, bloom, flower * step(n - 1.5, aSeg));
  vBladeH = h;
  vGust = gust;
  vColor.rgb = bladeColor;
}
`;

const FRAG_DECL = /* glsl */ `
varying float vBladeH;
varying float vGust;
`;

const LIGHT = /* glsl */ `
{
  // the lower blocks in the shade of the blades around them
  reflectedLight.indirectDiffuse *= mix(0.5, 1.05, vBladeH);
  reflectedLight.directDiffuse *= mix(0.65, 1.0, vBladeH);
  // the sun through the blades when you look toward it
  vec3 toFrag = normalize(vWorldPos - cameraPosition);
  float through = pow(max(dot(toFrag, uSunDir), 0.0), 3.0);
  reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * (through * 0.9 + 0.06) * vBladeH * vBladeH;
}
`;

function material(o: MeadowOptions, mask: THREE.Texture, box: THREE.Vector4, grid: THREE.Vector4, inner: number, wide: number, segs: number): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  patchMaterial(m, { see: true });
  const base = m.onBeforeCompile;
  const bloom = [0, 1, 2, 3].map((i) => new THREE.Color(o.bloom[i % o.bloom.length] ?? '#ffffff'));
  m.onBeforeCompile = (shader, r) => {
    base.call(m, shader, r);
    Object.assign(shader.uniforms, {
      uMeadowMask: { value: mask },
      uMeadowBox: { value: box },
      uMeadowGrid: { value: grid },
      uMeadowInner: { value: inner },
      uMeadowWide: { value: wide },
      uMeadowSegs: { value: segs },
      uBladeRoot: { value: new THREE.Color(o.root) },
      uBladeTip: { value: new THREE.Color(o.tip) },
      uBladeDry: { value: new THREE.Color(o.dryTip) },
      uBloom: { value: bloom },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <beginnormal_vertex>', BLADE)
      .replace('#include <begin_vertex>', 'vec3 transformed = bladePos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${LIGHT}`);
  };
  m.customProgramCacheKey = () => 'meadow';
  return m;
}

/** The meadow: a near grid of blades and a far one of chunkier ones, both following the camera. */
export function buildMeadow(o: MeadowOptions, level: keyof typeof TIERS): THREE.Group {
  const group = new THREE.Group();
  group.name = 'grass';
  const tier = TIERS[level];
  const w = o.bounds.x1 - o.bounds.x0;
  const d = o.bounds.z1 - o.bounds.z0;
  const mask = maskTexture(o, Math.min(1024, Math.ceil(Math.max(w, d) * 4)));
  const box = new THREE.Vector4(o.bounds.x0, o.bounds.z0, 1 / w, 1 / d);
  const height = o.height ?? 0.6;
  const layers: [number, number, number, number, number][] = [
    // spacing, reach, where it starts, blade width, segments
    [tier.near[0], tier.near[1], 0, 1, 3],
    [tier.far[0], tier.far[1], tier.near[1] * 0.85, 2.2, 2],
  ];
  for (const [s, reach, inner, wide, segs] of layers) {
    const G = Math.ceil((reach * 2) / s);
    const geo = bladeGeometry(segs);
    geo.instanceCount = G * G;
    const grid = new THREE.Vector4(s, G, reach, height);
    const mesh = new THREE.Mesh(geo, material(o, mask, box, grid, inner, wide, segs));
    // placed in the shader around the camera: never culled, never casting
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    group.add(mesh);
  }
  return group;
}
