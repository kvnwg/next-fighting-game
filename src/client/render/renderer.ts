/**
 * The "3D pixel" look: the scene renders into a small target (screen / pixelSize) with nearest
 * filtering, then a composite pass upscales it with crisp outlines from depth + normals and a light
 * ordered-dither posterize. Particles and other effects live on FX_LAYER and are excluded from the
 * outline pass so they never get edges.
 */
import * as THREE from 'three';

export const FX_LAYER = 1;

const COMPOSITE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform float outline;
uniform float highlight;
uniform float levels;
uniform float flash;
uniform vec3 flashColor;
uniform float vignette;
varying vec2 vUv;

float linearDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).r * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - z * (far - near));
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

void main() {
  vec4 col = texture2D(tColor, vUv);
  float d = linearDepth(vUv);
  vec3 n = texture2D(tNormal, vUv).rgb * 2.0 - 1.0;

  // silhouette: a neighbour noticeably farther away means we are on the near side of an edge
  float edge = 0.0;
  float crease = 0.0;
  vec2 offs[4];
  offs[0] = vec2(texel.x, 0.0);
  offs[1] = vec2(-texel.x, 0.0);
  offs[2] = vec2(0.0, texel.y);
  offs[3] = vec2(0.0, -texel.y);
  float thresh = 0.06 + d * 0.04;
  for (int i = 0; i < 4; i++) {
    float nd = linearDepth(vUv + offs[i]);
    if (nd - d > thresh) edge = 1.0;
    vec3 nn = texture2D(tNormal, vUv + offs[i]).rgb * 2.0 - 1.0;
    if (abs(nd - d) < thresh && dot(n, nn) < 0.75 && dot(n - nn, vec3(1.0)) > 0.0) crease = 1.0;
  }
  float sky = step(far * 0.98, d);
  edge *= 1.0 - sky;
  crease *= (1.0 - sky) * (1.0 - edge);

  vec3 c = col.rgb;
  c *= 1.0 - outline * edge;
  c *= 1.0 + highlight * crease;

  // soft posterize with ordered dither for a hand-pixelled feel
  vec2 px = vUv / texel;
  c = floor(c * levels + 0.5 + bayer4(px) * 0.5) / levels;

  // vignette + combat flash
  vec2 v = vUv - 0.5;
  c *= 1.0 - dot(v, v) * vignette;
  c = mix(c, flashColor, flash);

  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  pixelSize: number;
  private colorTarget: THREE.WebGLRenderTarget;
  private normalTarget: THREE.WebGLRenderTarget;
  private normalMaterial = new THREE.MeshNormalMaterial();
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  width = 1;
  height = 1;
  flash = 0;
  flashColor = new THREE.Color('#ffffff');

  constructor(
    readonly container: HTMLElement,
    pixelSize = 3,
  ) {
    this.pixelSize = pixelSize;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    this.camera.layers.enable(FX_LAYER);
    this.scene = new THREE.Scene();

    const mkTarget = (depth: boolean) => {
      const t = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        type: THREE.HalfFloatType,
      });
      if (depth) t.depthTexture = new THREE.DepthTexture(1, 1);
      return t;
    };
    this.colorTarget = mkTarget(true);
    this.normalTarget = mkTarget(false);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tDepth: { value: this.colorTarget.depthTexture },
        tNormal: { value: this.normalTarget.texture },
        texel: { value: new THREE.Vector2() },
        near: { value: this.camera.near },
        far: { value: this.camera.far },
        outline: { value: 0.45 },
        highlight: { value: 0.22 },
        levels: { value: 32 },
        flash: { value: 0 },
        flashColor: { value: this.flashColor },
        vignette: { value: 0.55 },
      },
      vertexShader: COMPOSITE_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setPixelSize(px: number): void {
    this.pixelSize = px;
    this.resize();
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    const lw = Math.max(1, Math.floor(w / this.pixelSize));
    const lh = Math.max(1, Math.floor(h / this.pixelSize));
    this.colorTarget.setSize(lw, lh);
    this.normalTarget.setSize(lw, lh);
    (this.material.uniforms.texel.value as THREE.Vector2).set(1 / lw, 1 / lh);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    const r = this.renderer;
    this.camera.layers.enable(FX_LAYER);
    r.setRenderTarget(this.colorTarget);
    r.render(this.scene, this.camera);

    // normals for crease highlights, without effects
    this.camera.layers.disable(FX_LAYER);
    const bg = this.scene.background;
    const fog = this.scene.fog;
    this.scene.background = null;
    this.scene.fog = null;
    this.scene.overrideMaterial = this.normalMaterial;
    r.setRenderTarget(this.normalTarget);
    r.setClearColor(0x8080ff, 1);
    r.clear();
    r.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    this.scene.background = bg;
    this.scene.fog = fog;
    this.camera.layers.enable(FX_LAYER);

    this.material.uniforms.flash.value = this.flash;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
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
