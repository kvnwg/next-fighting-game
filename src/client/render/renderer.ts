/**
 * The frame, shader-pack style:
 *  1. the scene renders in linear HDR (multisampled on the higher tiers) with soft sun shadows
 *  2. bright light blooms through a mip chain: the sun, lanterns, sparks, petals catching the light
 *  3. god rays: the sky around the sun is smeared toward the sun's place on screen, so light
 *     streams through gaps in the trees and clouds
 *  4. composite: exposure, ACES, the map's grade (white balance, lifted shadows, saturation,
 *     contrast), vignette, combat flashes and a little grain; FXAA when not multisampled
 * Fighters get their rim light in their own material (see gfx/materials.ts).
 */
import * as THREE from 'three';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { G } from './gfx/globals';
import { Quality, qualityPreset, QualitySetting } from './gfx/quality';

export const FX_LAYER = 1;
/** Fighters and their weapons. */
export const CHAR_LAYER = 2;
/** Grass and ambient particles: drawn by the main camera, left out of water reflections. */
export const DETAIL_LAYER = 3;

/** A map's look after the scene is lit: see Renderer.grade. */
export interface Grade {
  exposure: number;
  contrast: number;
  saturation: number;
  /** added to the shadows (a cool lift reads as sky light in the shade) */
  lift: THREE.Color;
  /** multiplies the image (white balance: warm for golden hour, blue for moonlight) */
  gain: THREE.Color;
  vignette: number;
  bloom: number;
  bloomThreshold: number;
  /** god ray strength (0 = off) and colour */
  rays: number;
  rayColor: THREE.Color;
}

export function defaultGrade(): Grade {
  return {
    exposure: 1,
    contrast: 1.06,
    saturation: 1.08,
    lift: new THREE.Color(0.012, 0.012, 0.02),
    gain: new THREE.Color(1, 1, 1),
    vignette: 0.35,
    bloom: 0.5,
    bloomThreshold: 0.9,
    rays: 0.6,
    rayColor: new THREE.Color('#ffe2b0'),
  };
}

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 texel;
uniform float threshold;
varying vec2 vUv;
void main() {
  // 4 bilinear taps = a 4x4 box: the half-res first level without shimmer
  vec3 c = texture2D(tInput, vUv + texel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tInput, vUv + texel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tInput, vUv + texel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tInput, vUv + texel * vec2(1.0, 1.0)).rgb;
  c = min(c * 0.25, vec3(24.0));
  float br = max(c.r, max(c.g, c.b));
  float knee = threshold * 0.5;
  float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, br - threshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}`;

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 texel;
varying vec2 vUv;
void main() {
  vec3 a = texture2D(tInput, vUv + texel * vec2(-2.0, 2.0)).rgb;
  vec3 b = texture2D(tInput, vUv + texel * vec2(0.0, 2.0)).rgb;
  vec3 c = texture2D(tInput, vUv + texel * vec2(2.0, 2.0)).rgb;
  vec3 d = texture2D(tInput, vUv + texel * vec2(-2.0, 0.0)).rgb;
  vec3 e = texture2D(tInput, vUv).rgb;
  vec3 f = texture2D(tInput, vUv + texel * vec2(2.0, 0.0)).rgb;
  vec3 g = texture2D(tInput, vUv + texel * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture2D(tInput, vUv + texel * vec2(0.0, -2.0)).rgb;
  vec3 i = texture2D(tInput, vUv + texel * vec2(2.0, -2.0)).rgb;
  vec3 j = texture2D(tInput, vUv + texel * vec2(-1.0, 1.0)).rgb;
  vec3 k = texture2D(tInput, vUv + texel * vec2(1.0, 1.0)).rgb;
  vec3 l = texture2D(tInput, vUv + texel * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture2D(tInput, vUv + texel * vec2(1.0, -1.0)).rgb;
  vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(o, 1.0);
}`;

const UP_FRAG = /* glsl */ `
uniform sampler2D tLow;
uniform sampler2D tHigh;
uniform vec2 texel;
varying vec2 vUv;
void main() {
  // 3x3 tent over the smaller level, added onto this level
  vec3 s = texture2D(tLow, vUv).rgb * 4.0;
  s += (texture2D(tLow, vUv + texel * vec2(-1.0, 0.0)).rgb + texture2D(tLow, vUv + texel * vec2(1.0, 0.0)).rgb
      + texture2D(tLow, vUv + texel * vec2(0.0, -1.0)).rgb + texture2D(tLow, vUv + texel * vec2(0.0, 1.0)).rgb) * 2.0;
  s += texture2D(tLow, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tLow, vUv + texel * vec2(1.0, -1.0)).rgb
      + texture2D(tLow, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tLow, vUv + texel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + s / 16.0, 1.0);
}`;

const RAY_MASK_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 sunUv;
uniform float aspect;
varying vec2 vUv;
void main() {
  // open sky only (the sky dome writes no depth), weighted toward the sun
  float sky = step(0.99999, texture2D(tDepth, vUv).r);
  vec3 c = texture2D(tColor, vUv).rgb;
  vec2 dv = (vUv - sunUv) * vec2(aspect, 1.0);
  float nearSun = exp(-dot(dv, dv) * 5.0);
  float l = min(dot(c, vec3(0.2126, 0.7152, 0.0722)), 6.0);
  gl_FragColor = vec4(vec3(l * sky * nearSun), 1.0);
}`;

const RAY_BLUR_FRAG = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 sunUv;
uniform float reach;
uniform float decay;
varying vec2 vUv;
void main() {
  vec2 delta = (sunUv - vUv) * reach / float(SAMPLES);
  float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec2 uv = vUv + delta * j;
  float illum = 1.0;
  float sum = 0.0;
  float wsum = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    sum += texture2D(tInput, uv).r * illum;
    wsum += illum;
    illum *= decay;
    uv += delta;
  }
  gl_FragColor = vec4(vec3(sum / wsum), 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform float bloom;
uniform float rays;
uniform vec3 rayColor;
uniform float exposure;
uniform float contrast;
uniform float saturation;
uniform vec3 lift;
uniform vec3 gain;
uniform float vignette;
uniform float flash;
uniform vec3 flashColor;
uniform float time;
uniform float aspect;
varying vec2 vUv;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 c) {
  const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  return clamp(outM * RRTAndODTFit(inM * c), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  c += texture2D(tBloom, vUv).rgb * bloom;
  c += texture2D(tRays, vUv).r * rayColor * rays;
  c *= exposure * gain;
  c = aces(c);
  c += lift * (1.0 - smoothstep(0.0, 0.5, luma(c)));
  c = mix(vec3(luma(c)), c, saturation);
  c = toSRGB(clamp(c, 0.0, 1.0));
  c = clamp((c - 0.5) * contrast + 0.5, 0.0, 1.0);
  vec2 v = (vUv - 0.5) * vec2(aspect, 1.0);
  c *= 1.0 - smoothstep(0.35, 1.25, length(v)) * vignette;
  c = mix(c, flashColor, flash);
  float n = fract(sin(dot(gl_FragCoord.xy + fract(time) * 71.0, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) / 160.0;
  gl_FragColor = vec4(c, 1.0);
}`;

const _sun = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export interface RendererOptions {
  /** trim the resolution while the frame rate struggles (the 'auto' quality setting) */
  dynamicResolution?: boolean;
  /** small embedded views (the character select preview) */
  preview?: boolean;
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  quality: Quality;
  grade: Grade = defaultGrade();
  width = 1;
  height = 1;
  flash = 0;
  flashColor = new THREE.Color('#ffffff');
  private hdr!: THREE.WebGLRenderTarget;
  private ldr: THREE.WebGLRenderTarget;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private rayA: THREE.WebGLRenderTarget;
  private rayB: THREE.WebGLRenderTarget;
  private black: THREE.DataTexture;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private prefilter: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private rayMask: THREE.ShaderMaterial;
  private rayBlur: THREE.ShaderMaterial;
  private composite: THREE.ShaderMaterial;
  private fxaa: THREE.ShaderMaterial;
  private dynamic: boolean;
  private dynScale = 1;
  private frameMs = 16;
  private lastFrame = 0;
  private slowFor = 0;
  private fastFor = 0;
  private clock = 0;

  constructor(
    readonly container: HTMLElement,
    setting: QualitySetting | Quality = 'auto',
    private readonly opts: RendererOptions = {},
  ) {
    this.quality = typeof setting === 'string' ? qualityPreset(setting) : setting;
    this.dynamic = !!opts.dynamicResolution;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'game-canvas';
    // count the whole frame (shadows, reflections, post), not just the last pass
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1400);
    this.camera.layers.enable(FX_LAYER);
    this.camera.layers.enable(DETAIL_LAYER);
    this.scene = new THREE.Scene();

    const rt = (type: THREE.TextureDataType = THREE.HalfFloatType) =>
      new THREE.WebGLRenderTarget(1, 1, { type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
    this.ldr = rt(THREE.UnsignedByteType);
    this.rayA = rt();
    this.rayB = rt();
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;

    const mat = (frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string | number> = {}) =>
      new THREE.ShaderMaterial({ uniforms, defines, vertexShader: QUAD_VERT, fragmentShader: frag, depthTest: false, depthWrite: false, toneMapped: false });
    this.prefilter = mat(PREFILTER_FRAG, { tInput: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 } });
    this.downMat = mat(DOWN_FRAG, { tInput: { value: null }, texel: { value: new THREE.Vector2() } });
    this.upMat = mat(UP_FRAG, { tLow: { value: null }, tHigh: { value: null }, texel: { value: new THREE.Vector2() } });
    this.rayMask = mat(RAY_MASK_FRAG, { tColor: { value: null }, tDepth: { value: null }, sunUv: { value: new THREE.Vector2() }, aspect: { value: 1 } });
    this.rayBlur = mat(RAY_BLUR_FRAG, { tInput: { value: null }, sunUv: { value: new THREE.Vector2() }, reach: { value: 1 }, decay: { value: 0.96 } }, { SAMPLES: 32 });
    this.composite = mat(COMPOSITE_FRAG, {
      tColor: { value: null },
      tBloom: { value: this.black },
      tRays: { value: this.black },
      bloom: { value: 0.5 },
      rays: { value: 0 },
      rayColor: { value: new THREE.Color() },
      exposure: { value: 1 },
      contrast: { value: 1 },
      saturation: { value: 1 },
      lift: { value: new THREE.Color() },
      gain: { value: new THREE.Color() },
      vignette: { value: 0.35 },
      flash: { value: 0 },
      flashColor: { value: this.flashColor },
      time: { value: 0 },
      aspect: { value: 1 },
    });
    this.fxaa = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      vertexShader: FXAAShader.vertexShader,
      fragmentShader: FXAAShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.fxaa.uniforms.tDiffuse.value = this.ldr.texture;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
  }

  /** World direction toward the sun (the map sets it through the shared uniforms). */
  get sunDir(): THREE.Vector3 {
    return G.uSunDir.value;
  }

  setQuality(setting: QualitySetting | Quality): void {
    this.quality = typeof setting === 'string' ? qualityPreset(setting) : setting;
    this.dynamic = typeof setting === 'string' ? setting === 'auto' : this.dynamic;
    this.dynScale = 1;
    this.applyQuality();
  }

  /** Fighters' rim light colour and strength. */
  setRim(color: THREE.ColorRepresentation, strength = 0.6): void {
    const c = new THREE.Color(color);
    G.uRim.value.set(c.r, c.g, c.b, strength);
  }

  private applyQuality(): void {
    const q = this.quality;
    this.hdr?.dispose();
    this.hdr = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      samples: q.msaa,
      depthBuffer: true,
      generateMipmaps: false,
    });
    this.hdr.depthTexture = new THREE.DepthTexture(1, 1);
    for (const t of [...this.down, ...this.up]) t.dispose();
    this.down = [];
    this.up = [];
    const mips = this.opts.preview ? 4 : q.bloomMips;
    for (let i = 0; i < mips; i++) {
      this.down.push(new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }));
      this.up.push(new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }));
    }
    this.rayBlur.defines.SAMPLES = Math.max(8, q.godRaySamples);
    this.rayBlur.needsUpdate = true;
    // shadows: map size and softness; lights pick the size up when their map is rebuilt
    this.scene.traverse((o) => {
      const l = o as THREE.DirectionalLight;
      if (l.isDirectionalLight && l.castShadow) {
        l.shadow.mapSize.set(q.shadowSize, q.shadowSize);
        l.shadow.radius = q.shadowRadius;
        l.shadow.map?.dispose();
        l.shadow.map = null;
      }
    });
    this.resize();
  }

  /** Render pixels per CSS pixel: the device ratio, capped by the tier's pixel budget, times the dynamic scale. */
  private pixelRatio(w: number, h: number): number {
    const q = this.quality;
    const dpr = Math.min(window.devicePixelRatio || 1, q.maxDpr);
    return Math.max(0.5, Math.min(dpr, Math.sqrt(q.maxPixels / Math.max(1, w * h))) * this.dynScale);
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    const pr = this.pixelRatio(w, h);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    const lw = Math.max(1, Math.round(w * pr));
    const lh = Math.max(1, Math.round(h * pr));
    this.hdr.setSize(lw, lh);
    this.ldr.setSize(lw, lh);
    let bw = lw;
    let bh = lh;
    for (let i = 0; i < this.down.length; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      this.down[i].setSize(bw, bh);
      this.up[i].setSize(bw, bh);
    }
    const rs = this.quality.godRayScale;
    this.rayA.setSize(Math.max(1, Math.round(lw * rs)), Math.max(1, Math.round(lh * rs)));
    this.rayB.setSize(Math.max(1, Math.round(lw * rs)), Math.max(1, Math.round(lh * rs)));
    (this.fxaa.uniforms.resolution.value as THREE.Vector2).set(1 / lw, 1 / lh);
    this.composite.uniforms.aspect.value = w / h;
    this.rayMask.uniforms.aspect.value = w / h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  /** Trim or restore the render resolution to hold the frame rate (auto quality only). */
  private adapt(): void {
    const now = performance.now();
    if (this.lastFrame) this.frameMs += (Math.min(100, now - this.lastFrame) - this.frameMs) * 0.05;
    this.lastFrame = now;
    if (!this.dynamic) return;
    if (this.frameMs > 21) {
      this.slowFor++;
      this.fastFor = 0;
    } else if (this.frameMs < 14.5) {
      this.fastFor++;
      this.slowFor = 0;
    } else {
      this.slowFor = Math.max(0, this.slowFor - 1);
      this.fastFor = Math.max(0, this.fastFor - 1);
    }
    if (this.slowFor > 120 && this.dynScale > 0.55) {
      this.dynScale = Math.max(0.55, this.dynScale * 0.85);
      this.slowFor = 0;
      this.resize();
    } else if (this.fastFor > 300 && this.dynScale < 1) {
      this.dynScale = Math.min(1, this.dynScale / 0.9);
      this.fastFor = 0;
      this.resize();
    }
  }

  /** Draw calls and triangles in the last frame. */
  get stats(): { calls: number; triangles: number } {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  render(): void {
    this.renderer.info.reset();
    this.adapt();
    const r = this.renderer;
    const g = this.grade;
    const q = this.quality;
    this.clock = (this.clock + 1 / 60) % 1000;

    r.setRenderTarget(this.hdr);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(this.scene, this.camera);

    // bloom: threshold into half res, down the chain, back up adding each level
    const cu = this.composite.uniforms;
    if (this.down.length > 0 && g.bloom > 0) {
      const pu = this.prefilter.uniforms;
      pu.tInput.value = this.hdr.texture;
      (pu.texel.value as THREE.Vector2).set(1 / this.hdr.width, 1 / this.hdr.height);
      pu.threshold.value = g.bloomThreshold;
      this.pass(this.prefilter, this.down[0]);
      const du = this.downMat.uniforms;
      for (let i = 1; i < this.down.length; i++) {
        du.tInput.value = this.down[i - 1].texture;
        (du.texel.value as THREE.Vector2).set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
        this.pass(this.downMat, this.down[i]);
      }
      const uu = this.upMat.uniforms;
      let low = this.down[this.down.length - 1];
      for (let i = this.down.length - 2; i >= 0; i--) {
        uu.tLow.value = low.texture;
        uu.tHigh.value = this.down[i].texture;
        (uu.texel.value as THREE.Vector2).set(1 / low.width, 1 / low.height);
        this.pass(this.upMat, this.up[i]);
        low = this.up[i];
      }
      cu.tBloom.value = low.texture;
      cu.bloom.value = g.bloom / this.down.length;
    } else {
      cu.tBloom.value = this.black;
      cu.bloom.value = 0;
    }

    // god rays, when the sun is in front of us and near the screen
    let rays = 0;
    if (q.godRays && g.rays > 0 && !this.opts.preview) {
      const cam = this.camera;
      cam.getWorldDirection(_fwd);
      const facing = _fwd.dot(G.uSunDir.value);
      if (facing > 0.05) {
        _sun.copy(G.uSunDir.value).multiplyScalar(800).add(cam.position).project(cam);
        const su = new THREE.Vector2(_sun.x * 0.5 + 0.5, _sun.y * 0.5 + 0.5);
        const off = Math.max(Math.abs(su.x - 0.5), Math.abs(su.y - 0.5));
        const vis = Math.min(1, (facing - 0.05) * 4) * (1 - THREE.MathUtils.smoothstep(off, 0.55, 1.1));
        if (vis > 0.01) {
          const mu = this.rayMask.uniforms;
          mu.tColor.value = this.hdr.texture;
          mu.tDepth.value = this.hdr.depthTexture;
          (mu.sunUv.value as THREE.Vector2).copy(su);
          this.pass(this.rayMask, this.rayA);
          const bu = this.rayBlur.uniforms;
          (bu.sunUv.value as THREE.Vector2).copy(su);
          bu.tInput.value = this.rayA.texture;
          bu.reach.value = 1.0;
          bu.decay.value = 0.965;
          this.pass(this.rayBlur, this.rayB);
          bu.tInput.value = this.rayB.texture;
          bu.reach.value = 0.35;
          bu.decay.value = 0.985;
          this.pass(this.rayBlur, this.rayA);
          rays = g.rays * vis;
        }
      }
    }
    cu.tRays.value = rays > 0 ? this.rayA.texture : this.black;
    cu.rays.value = rays;
    (cu.rayColor.value as THREE.Color).copy(g.rayColor);

    cu.tColor.value = this.hdr.texture;
    cu.exposure.value = g.exposure;
    cu.contrast.value = g.contrast;
    cu.saturation.value = g.saturation;
    (cu.lift.value as THREE.Color).copy(g.lift);
    (cu.gain.value as THREE.Color).copy(g.gain);
    cu.vignette.value = g.vignette;
    cu.flash.value = this.flash;
    cu.time.value = this.clock;
    r.setClearColor(0x000000, 1);
    if (q.msaa > 0) {
      this.pass(this.composite, null);
    } else {
      this.pass(this.composite, this.ldr);
      this.pass(this.fxaa, null);
    }
  }

  /** Project a world point to CSS pixels. Returns false when behind the camera. */
  project(v: THREE.Vector3, out: { x: number; y: number }): boolean {
    const p = v.clone().project(this.camera);
    if (p.z > 1 || p.z < -1) return false;
    out.x = (p.x * 0.5 + 0.5) * this.width;
    out.y = (-p.y * 0.5 + 0.5) * this.height;
    return true;
  }

  dispose(): void {
    this.hdr.dispose();
    this.ldr.dispose();
    for (const t of [...this.down, ...this.up, this.rayA, this.rayB]) t.dispose();
    this.renderer.dispose();
  }
}
