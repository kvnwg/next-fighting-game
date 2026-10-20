/**
 * Two looks share one pipeline:
 *
 * "clean" (default): the scene renders at full resolution with smooth texture filtering, then a
 * composite pass inks a soft outline around fighters, traces their sun-facing edge with a rim
 * light, adds a wide bloom and colour-grades the frame (cool shadows, warm highlights). FXAA
 * smooths every edge at the end.
 *
 * "pixel": the scene renders into a small target (screen / pixelSize) with nearest filtering and
 * the composite upscales it. On the way it:
 *  - inks a 1px silhouette around fighters (CHAR_LAYER, found with a separate mask pass) and traces
 *    their sun-facing edge with a rim light, so they pop off the background
 *  - darkens depth edges and lifts normal creases on everything else
 *  - adds a small bloom from bright pixels (lanterns, the sun, sparks)
 *  - snaps every colour to a fixed palette through a lookup table, dithering only where the image
 *    is a smooth gradient (sky and its haze, bloom). The dither pattern is locked to screen pixels.
 * Particles and other effects live on FX_LAYER and are excluded from the outline passes.
 */
import * as THREE from 'three';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { applyTextureFilter, ArtStyle, setTextureStyle } from './textures';

export const FX_LAYER = 1;
/** Fighters (and their weapons): they get the ink outline and rim light. */
export const CHAR_LAYER = 2;

export type { ArtStyle };

/**
 * ENDESGA 32 by Endesga (lospec.com/palette-list/endesga-32), plus a few hand-picked additions it
 * lacks: two teals for fighter outfits, a warm grey ramp for stone and weathered wood, and a
 * blossom pink.
 */
export const PALETTE = [
  '#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633',
  '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e',
  '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
  '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569',
  '#1e6f75', '#4fa6a0', '#5e5450', '#9a8c84', '#cfc4bb', '#f2a7c0',
];

const LUT_N = 32;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const MASK_VERT = /* glsl */ `
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const MASK_FRAG = /* glsl */ `
varying float vDepth;
void main() { gl_FragColor = vec4(vDepth, 1.0, 0.0, 1.0); }`;

const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform float threshold;
uniform float near;
uniform float far;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // the sky draws its own glow around the sun; blooming it too would wash out what stands in front
  float z = texture2D(tDepth, vUv).r * 2.0 - 1.0;
  float d = (2.0 * near * far) / (far + near - z * (far - near));
  float sky = step(far * 0.8, d);
  gl_FragColor = vec4(c * smoothstep(threshold, threshold * 1.8, l) * (1.0 - sky), 1.0);
}`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tInput, vUv).rgb * 0.227;
  c += texture2D(tInput, vUv + dir * 1.385).rgb * 0.316;
  c += texture2D(tInput, vUv - dir * 1.385).rgb * 0.316;
  c += texture2D(tInput, vUv + dir * 3.231).rgb * 0.070;
  c += texture2D(tInput, vUv - dir * 3.231).rgb * 0.070;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform sampler2D tMask;
uniform sampler2D tBloom;
uniform sampler2D tLut;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform float inkWidth;
uniform float time;
uniform float outline;
uniform float highlight;
uniform vec3 inkColor;
uniform vec3 rimColor;
uniform float rimStrength;
uniform vec2 sunScreen;
uniform float backlit;
uniform float bloom;
uniform float exposure;
uniform float dither;
uniform vec2 fogRange;
uniform float flash;
uniform vec3 flashColor;
uniform float vignette;
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform vec3 grade;
uniform float saturation;
varying vec2 vUv;

float linearDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).r * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - z * (far - near));
}

/** Is the pixel at uv the visible surface of a fighter? */
float charAt(vec2 uv, float d) {
  vec4 m = texture2D(tMask, uv);
  return step(0.5, m.g) * step(abs(m.r - d), 0.08 + d * 0.01);
}

float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0;
  m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0;
  m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  for (int k = 0; k < 16; k++) { if (k == i) return m[k] / 16.0 - 0.5; }
  return 0.0;
}

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 acesFilmic(vec3 color) {
  const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= exposure / 0.6;
  color = ACESOutputMat * RRTAndODTFit(ACESInputMat * color);
  return clamp(color, 0.0, 1.0);
}

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 palette(vec3 c) {
  vec3 q = floor(clamp(c, 0.0, 1.0) * ${LUT_N - 1}.0 + 0.5);
  vec2 uv = vec2((q.r + q.b * ${LUT_N}.0 + 0.5) / ${LUT_N * LUT_N}.0, (q.g + 0.5) / ${LUT_N}.0);
  return texture2D(tLut, uv).rgb;
}

void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  float d = linearDepth(vUv);
  vec3 n = texture2D(tNormal, vUv).rgb * 2.0 - 1.0;
  float sky = step(far * 0.8, d); // the sky dome sits just inside the far plane
  float isChar = charAt(vUv, d);

#ifdef CLEAN
  // eight taps around a ring inkWidth pixels wide, so the outline is round and even
  const int TAPS = 8;
  vec2 offs[8];
  offs[0] = vec2(1.0, 0.0);
  offs[1] = vec2(-1.0, 0.0);
  offs[2] = vec2(0.0, 1.0);
  offs[3] = vec2(0.0, -1.0);
  offs[4] = vec2(0.7071, 0.7071);
  offs[5] = vec2(-0.7071, 0.7071);
  offs[6] = vec2(0.7071, -0.7071);
  offs[7] = vec2(-0.7071, -0.7071);
#else
  const int TAPS = 4;
  vec2 offs[4];
  offs[0] = vec2(1.0, 0.0);
  offs[1] = vec2(-1.0, 0.0);
  offs[2] = vec2(0.0, 1.0);
  offs[3] = vec2(0.0, -1.0);
#endif
  float edge = 0.0;
  float crease = 0.0;
  float ink = 0.0;
  float rim = 0.0;
  float thresh = 0.06 + d * 0.04;
  for (int i = 0; i < TAPS; i++) {
    vec2 uv = vUv + offs[i] * texel * inkWidth;
    float nd = linearDepth(uv);
    float nChar = charAt(uv, nd);
    // a neighbour noticeably farther away means we are on the near side of an edge
    if (nd - d > thresh) edge = 1.0;
    vec3 nn = texture2D(tNormal, vUv + offs[i] * texel).rgb * 2.0 - 1.0;
    if (abs(nd - d) < thresh && dot(n, nn) < 0.75 && dot(n - nn, vec3(1.0)) > 0.0) crease = 1.0;
    // fighter silhouette: ink the background pixel just outside a nearer fighter
    if (nChar > 0.5 && (isChar < 0.5 || d - nd > thresh) && d - nd > 0.02) ink = 1.0;
    // rim: fighter pixel whose neighbour toward the sun is background
    if (isChar > 0.5 && (nChar < 0.5 || nd - d > thresh)) {
      float w = max(0.0, dot(offs[i], sunScreen)) * (1.0 - backlit * 0.5) + backlit * (offs[i].y > 0.0 ? 0.9 : 0.35);
      rim = max(rim, w);
    }
  }
  // distant scenery is soft: no ink lines once it is in the haze
  float fogAmt = smoothstep(fogRange.x, fogRange.y, d);
  edge *= (1.0 - sky) * (1.0 - fogAmt);
#ifdef CLEAN
  // painted look: linework only on the nearby world, fading out well before the haze
  edge *= 1.0 - smoothstep(fogRange.x * 0.4, fogRange.x * 0.8, d) * (1.0 - isChar);
#endif
  crease *= (1.0 - sky) * (1.0 - edge) * (1.0 - fogAmt);

  c *= 1.0 - (isChar > 0.5 ? 0.65 : outline) * edge;
  c *= 1.0 + highlight * crease;
  c = mix(c, rimColor, clamp(rim * rimStrength, 0.0, 1.0) * (1.0 - edge));

  vec3 glow = texture2D(tBloom, vUv).rgb * bloom;
  c += glow;

  c = acesFilmic(c);
  c = mix(c, inkColor, ink);

  // vignette + combat flash
  vec2 v = vUv - 0.5;
  c *= 1.0 - dot(v, v) * vignette;
  c = mix(c, flashColor, flash);
  c = toSRGB(c);

#ifdef CLEAN
  // grade: shadows lean cool indigo, highlights warm, a gentle S-curve and a little extra colour
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, c * shadowTint * 1.6, (1.0 - smoothstep(0.0, 0.55, lum)) * grade.x);
  c = mix(c, c * highlightTint * 1.1, smoothstep(0.45, 1.0, lum) * grade.y);
  c = mix(c, c * c * (3.0 - 2.0 * c), grade.z);
  float g = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(g), c, saturation);
  // a whisper of grain hides banding in the sky gradient
  float noise = fract(sin(dot(gl_FragCoord.xy + fract(time) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
  c += (noise - 0.5) / 128.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
#else
  // palette snap; dither only smooth gradients (the sky and its haze, glow) so flat textures and
  // pre-tinted scenery stay clean
  float glowAmt = clamp(dot(glow, vec3(0.33)) * 3.0, 0.0, 1.0);
  float amt = max(sky, glowAmt) * (1.0 - ink) * (1.0 - isChar);
  amt *= 1.0 - smoothstep(0.9, 0.97, min(c.r, min(c.g, c.b))); // keep the sun disc a clean white
  c += bayer4(floor(vUv / texel)) * dither * amt;
  gl_FragColor = vec4(palette(c), 1.0);
#endif
}`;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function oklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const lutCache = new Map<string, Uint8Array>();

/** 32x32x32 sRGB cube laid out as a 1024x32 strip; each cell holds its nearest palette colour (OKLab). */
function paletteLut(colors: string[]): THREE.DataTexture {
  const tex = new THREE.DataTexture(lutData(colors), LUT_N * LUT_N, LUT_N, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function lutData(colors: string[]): Uint8Array {
  const key = colors.join();
  const hit = lutCache.get(key);
  if (hit) return hit;
  const pal = colors.map((hex) => {
    const c = new THREE.Color(hex);
    // THREE.Color stores linear values; we want the sRGB bytes
    const srgb = c.clone().convertLinearToSRGB();
    return { lab: oklab(srgb.r, srgb.g, srgb.b), rgb: [srgb.r, srgb.g, srgb.b] };
  });
  const N = LUT_N;
  const data = new Uint8Array(N * N * N * 4);
  for (let b = 0; b < N; b++) {
    for (let g = 0; g < N; g++) {
      for (let r = 0; r < N; r++) {
        const [L, A, B] = oklab(r / (N - 1), g / (N - 1), b / (N - 1));
        let best = pal[0];
        let bd = Infinity;
        for (const p of pal) {
          // favour hue over lightness: dark greens stay green and dark reds stay red instead of
          // all collapsing into the palette's near-black
          const dl = (L - p.lab[0]) * 0.8;
          const da = (A - p.lab[1]) * 2.2;
          const db = (B - p.lab[2]) * 2.2;
          const dist = dl * dl + da * da + db * db;
          if (dist < bd) {
            bd = dist;
            best = p;
          }
        }
        const i = (g * N * N + b * N + r) * 4;
        data[i] = Math.round(best.rgb[0] * 255);
        data[i + 1] = Math.round(best.rgb[1] * 255);
        data[i + 2] = Math.round(best.rgb[2] * 255);
        data[i + 3] = 255;
      }
    }
  }
  lutCache.set(key, data);
  return data;
}

const _sun = new THREE.Vector3();

/** Upper bound on rendered pixels in clean mode, so phones with 3x screens stay smooth. */
const CLEAN_MAX_PIXELS = 2_000_000;

export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  pixelSize: number;
  style: ArtStyle;
  private colorTarget: THREE.WebGLRenderTarget;
  private normalTarget: THREE.WebGLRenderTarget;
  private maskTarget: THREE.WebGLRenderTarget;
  private bloomA: THREE.WebGLRenderTarget;
  private bloomB: THREE.WebGLRenderTarget;
  /** clean mode: the graded frame, before FXAA */
  private finalTarget: THREE.WebGLRenderTarget;
  private normalMaterial = new THREE.MeshNormalMaterial();
  private maskMaterial = new THREE.ShaderMaterial({ vertexShader: MASK_VERT, fragmentShader: MASK_FRAG });
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private brightMaterial: THREE.ShaderMaterial;
  private blurMaterial: THREE.ShaderMaterial;
  private fxaaMaterial: THREE.ShaderMaterial;
  private clock = 0;
  width = 1;
  height = 1;
  flash = 0;
  flashColor = new THREE.Color('#ffffff');
  /** World direction toward the sun (drives the fighters' rim light). */
  readonly sunDir = new THREE.Vector3(0.3, 1, 0.4).normalize();

  constructor(
    readonly container: HTMLElement,
    pixelSize = 3,
    style: ArtStyle = 'clean',
  ) {
    this.pixelSize = pixelSize;
    this.style = style;
    setTextureStyle(style);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = style === 'clean' ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    this.camera.layers.enable(FX_LAYER);
    this.scene = new THREE.Scene();

    const mkTarget = (depth: boolean, filter: THREE.MagnificationTextureFilter = THREE.NearestFilter, type: THREE.TextureDataType = THREE.HalfFloatType) => {
      const t = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: filter,
        magFilter: filter,
        type,
        depthBuffer: depth,
      });
      return t;
    };
    this.colorTarget = mkTarget(true);
    this.colorTarget.depthTexture = new THREE.DepthTexture(1, 1);
    this.normalTarget = mkTarget(true);
    this.maskTarget = mkTarget(true);
    this.bloomA = mkTarget(false, THREE.LinearFilter);
    this.bloomB = mkTarget(false, THREE.LinearFilter);
    this.finalTarget = mkTarget(false, THREE.LinearFilter, THREE.UnsignedByteType);

    this.brightMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tDepth: { value: this.colorTarget.depthTexture },
        threshold: { value: 1.15 },
        near: { value: this.camera.near },
        far: { value: this.camera.far },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: BRIGHT_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: { tInput: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.fxaaMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      vertexShader: FXAAShader.vertexShader,
      fragmentShader: FXAAShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.fxaaMaterial.uniforms.tDiffuse.value = this.finalTarget.texture;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tDepth: { value: this.colorTarget.depthTexture },
        tNormal: { value: this.normalTarget.texture },
        tMask: { value: this.maskTarget.texture },
        tBloom: { value: this.bloomA.texture },
        tLut: { value: paletteLut(PALETTE) },
        texel: { value: new THREE.Vector2() },
        near: { value: this.camera.near },
        far: { value: this.camera.far },
        inkWidth: { value: 1 },
        time: { value: 0 },
        outline: { value: 0.4 },
        highlight: { value: 0.22 },
        inkColor: { value: new THREE.Color('#181425') },
        rimColor: { value: new THREE.Color('#fff0d0') },
        rimStrength: { value: 0.8 },
        sunScreen: { value: new THREE.Vector2(0, 1) },
        backlit: { value: 0 },
        bloom: { value: 0.45 },
        exposure: { value: 1 },
        dither: { value: 0.09 },
        fogRange: { value: new THREE.Vector2(1e4, 1e4) },
        flash: { value: 0 },
        flashColor: { value: this.flashColor },
        vignette: { value: 0.55 },
        shadowTint: { value: new THREE.Color('#5a5490') },
        highlightTint: { value: new THREE.Color('#fff2dc') },
        // shadow tint, highlight tint, contrast
        grade: { value: new THREE.Vector3(0.35, 0.5, 0.25) },
        saturation: { value: 1.1 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.applyStyle();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setPixelSize(px: number): void {
    this.pixelSize = px;
    this.resize();
  }

  /** Switch between the clean cel-shaded look and the 3D pixel look. */
  setStyle(style: ArtStyle): void {
    if (style === this.style) return;
    this.style = style;
    setTextureStyle(style);
    this.renderer.shadowMap.type = style === 'clean' ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    // textures already in the scene pick up the new filtering; materials recompile for the new shadow type
    this.scene.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      if (!mats) return;
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        const map = (m as THREE.MeshLambertMaterial).map;
        if (map && map.userData.styled) applyTextureFilter(map, style);
        m.needsUpdate = true;
      }
    });
    this.applyStyle();
    this.resize();
  }

  private applyStyle(): void {
    const clean = this.style === 'clean';
    const u = this.material.uniforms;
    this.material.defines = clean ? { CLEAN: '' } : {};
    this.material.needsUpdate = true;
    for (const t of [this.colorTarget, this.normalTarget, this.maskTarget]) {
      t.texture.minFilter = THREE.NearestFilter;
      t.texture.magFilter = THREE.NearestFilter;
    }
    // clean mode: lighter linework on the world, softer creases, a wider glow
    u.outline.value = clean ? 0.22 : 0.4;
    u.highlight.value = clean ? 0.08 : 0.22;
    u.bloom.value = clean ? 0.7 : 0.45;
    u.vignette.value = clean ? 0.45 : 0.55;
    this.brightMaterial.uniforms.threshold.value = clean ? 0.95 : 1.15;
  }

  /** Swap the colour palette every pixel is snapped to. */
  setPalette(colors: string[]): void {
    const u = this.material.uniforms.tLut;
    (u.value as THREE.DataTexture).dispose();
    u.value = paletteLut(colors);
  }

  /** Fighters' rim light colour (usually a brightened sun colour). */
  setRim(color: THREE.ColorRepresentation, strength = 0.8): void {
    (this.material.uniforms.rimColor.value as THREE.Color).set(color);
    this.material.uniforms.rimStrength.value = strength;
  }

  /** Render pixels per CSS pixel in clean mode: the device ratio, capped by a pixel budget. */
  private cleanScale(w: number, h: number): number {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return Math.max(0.75, Math.min(dpr, Math.sqrt(CLEAN_MAX_PIXELS / Math.max(1, w * h))));
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    const clean = this.style === 'clean';
    const scale = clean ? this.cleanScale(w, h) : 1;
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(w, h);
    const lw = clean ? Math.max(1, Math.round(w * scale)) : Math.max(1, Math.floor(w / this.pixelSize));
    const lh = clean ? Math.max(1, Math.round(h * scale)) : Math.max(1, Math.floor(h / this.pixelSize));
    this.colorTarget.setSize(lw, lh);
    this.normalTarget.setSize(lw, lh);
    this.maskTarget.setSize(lw, lh);
    // clean mode blooms from a quarter-size image so the glow spreads wider
    const bs = clean ? 2 : 1;
    this.bloomA.setSize(Math.max(1, lw >> bs), Math.max(1, lh >> bs));
    this.bloomB.setSize(Math.max(1, lw >> bs), Math.max(1, lh >> bs));
    this.finalTarget.setSize(clean ? lw : 1, clean ? lh : 1);
    (this.fxaaMaterial.uniforms.resolution.value as THREE.Vector2).set(1 / lw, 1 / lh);
    (this.material.uniforms.texel.value as THREE.Vector2).set(1 / lw, 1 / lh);
    // outline width in render pixels: about 2 CSS pixels, scaled up a little on big screens
    this.material.uniforms.inkWidth.value = clean ? Math.max(1.5, scale * Math.max(1.6, Math.min(2.6, h / 420))) : 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(): void {
    const r = this.renderer;
    const cam = this.camera;
    const u = this.material.uniforms;
    const clean = this.style === 'clean';
    cam.layers.enable(FX_LAYER);
    r.setRenderTarget(this.colorTarget);
    r.render(this.scene, cam);

    // normals for crease highlights, then the fighter mask, without effects or sky
    cam.layers.disable(FX_LAYER);
    const bg = this.scene.background;
    const fog = this.scene.fog;
    this.scene.background = null;
    this.scene.fog = null;
    this.scene.overrideMaterial = this.normalMaterial;
    r.setRenderTarget(this.normalTarget);
    r.setClearColor(0x8080ff, 1);
    r.clear();
    r.render(this.scene, cam);

    cam.layers.set(CHAR_LAYER);
    this.scene.overrideMaterial = this.maskMaterial;
    r.setRenderTarget(this.maskTarget);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, cam);
    this.scene.overrideMaterial = null;
    this.scene.background = bg;
    this.scene.fog = fog;
    cam.layers.set(0);
    cam.layers.enable(FX_LAYER);

    // bloom: bright pass at reduced resolution, blurred both ways (twice in clean mode, for a wider glow)
    this.pass(this.brightMaterial, this.bloomA);
    const bu = this.blurMaterial.uniforms;
    for (let i = 0; i < (clean ? 2 : 1); i++) {
      const spread = i + 1;
      bu.tInput.value = this.bloomA.texture;
      (bu.dir.value as THREE.Vector2).set(spread / this.bloomA.width, 0);
      this.pass(this.blurMaterial, this.bloomB);
      bu.tInput.value = this.bloomB.texture;
      (bu.dir.value as THREE.Vector2).set(0, spread / this.bloomA.height);
      this.pass(this.blurMaterial, this.bloomA);
    }

    // rim light comes from the sun's side of the screen
    cam.updateMatrixWorld();
    _sun.copy(this.sunDir).transformDirection(cam.matrixWorldInverse);
    const s = u.sunScreen.value as THREE.Vector2;
    s.set(_sun.x, _sun.y);
    if (s.lengthSq() < 1e-6) s.set(0, 1);
    s.normalize();
    u.backlit.value = Math.max(0, Math.min(1, -_sun.z * 1.4));
    const f = this.scene.fog;
    (u.fogRange.value as THREE.Vector2).set(f instanceof THREE.Fog ? f.near : 1e4, f instanceof THREE.Fog ? f.far : 1e4);
    u.exposure.value = r.toneMappingExposure;
    u.flash.value = this.flash;
    this.clock = (this.clock + 1 / 60) % 1000;
    u.time.value = this.clock;
    r.setClearColor(0x000000, 1);
    if (clean) {
      this.pass(this.material, this.finalTarget);
      this.pass(this.fxaaMaterial, null);
    } else {
      this.pass(this.material, null);
    }
  }

  /** Project a world point to CSS pixels. Returns null when behind the camera. */
  project(v: THREE.Vector3, out: { x: number; y: number }): boolean {
    const p = v.clone().project(this.camera);
    if (p.z > 1 || p.z < -1) return false;
    out.x = (p.x * 0.5 + 0.5) * this.width;
    out.y = (-p.y * 0.5 + 0.5) * this.height;
    return true;
  }
}
