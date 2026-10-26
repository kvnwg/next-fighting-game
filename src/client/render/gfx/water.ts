/**
 * Water: a flat mirror (the scene is rendered upside down into a texture, at a resolution set by the
 * quality tier), broken up by scrolling ripples, mixed with the water's own colour by a fresnel
 * term, with sun glints sharp enough to bloom. Rain adds expanding ring ripples. Without
 * reflections (the low tier) it reflects a sky gradient instead.
 */
import * as THREE from 'three';
import { bindGlobals, FOG_GLSL, G, GLOBALS_GLSL } from './globals';

const VERT = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vRefl;
varying vec3 vWorldPos;
void main() {
  vRefl = textureMatrix * vec4(position, 1.0);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
${GLOBALS_GLSL}
${FOG_GLSL}
uniform sampler2D tRefl;
uniform float hasRefl;
uniform vec3 deep;
uniform vec3 shallow;
uniform vec3 skyHorizon;
uniform vec3 skyZenith;
uniform vec3 ambient;
uniform float ripple;
uniform float rain;
uniform float opacity;
varying vec4 vRefl;
varying vec3 vWorldPos;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float waves(vec2 p) {
  float t = uTime;
  vec2 w = uWind.xy * 0.6;
  return noise(p * 0.7 + w * t * 0.5) * 0.5 + noise(p * 1.9 - w.yx * t * 0.7 + 3.1) * 0.3 + noise(p * 4.3 + vec2(t * 0.4, -t * 0.3)) * 0.2;
}
/** expanding rings where raindrops land */
vec2 rings(vec2 p) {
  vec2 cell = floor(p * 1.6);
  vec2 g = vec2(0.0);
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec2 c = cell + vec2(float(i), float(j));
      float h = hash(c);
      float t = fract(uTime * (0.6 + h * 0.5) + h * 7.0);
      vec2 o = (c + vec2(hash(c + 3.1), hash(c + 7.7))) / 1.6;
      vec2 d = p - o;
      float r = length(d);
      float wave = sin((r - t * 0.55) * 60.0) * smoothstep(0.08, 0.0, abs(r - t * 0.55)) * (1.0 - t);
      g += d / max(r, 1e-3) * wave;
    }
  }
  return g;
}

void main() {
  vec3 view = normalize(vWorldPos - cameraPosition);
  vec2 p = vWorldPos.xz;
  float e = 0.08;
  float h0 = waves(p);
  vec3 n = normalize(vec3(-(waves(p + vec2(e, 0.0)) - h0) / e * ripple, 1.0, -(waves(p + vec2(0.0, e)) - h0) / e * ripple));
  if (rain > 0.0) {
    vec2 rg = rings(p) * rain * 0.35;
    n = normalize(n + vec3(rg.x, 0.0, rg.y));
  }
  vec3 r = reflect(view, n);
  vec3 refl;
  if (hasRefl > 0.5) {
    vec2 uv = vRefl.xy / vRefl.w + n.xz * 0.04;
    refl = texture2D(tRefl, uv).rgb;
  } else {
    refl = mix(skyHorizon, skyZenith, clamp(r.y * 1.8, 0.0, 1.0));
  }
  float cosV = max(dot(-view, n), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
  fres = mix(0.35, 1.0, fres);
  vec3 body = mix(shallow, deep, smoothstep(0.0, 0.6, cosV)) * (ambient + uSunColor * max(uSunDir.y, 0.0) * 0.4);
  vec3 c = mix(body, refl, fres);
  float sd = max(dot(r, uSunDir), 0.0);
  c += uSunColor * (pow(sd, 600.0) * 30.0 + pow(sd, 60.0) * 0.6);
  c = voxFog(c, vWorldPos);
  c = mix(c, uDarkColor, uDark);
  gl_FragColor = vec4(c, mix(opacity, 1.0, fres));
}`;

export interface WaterOptions {
  /** surface shape in the XZ plane: a rectangle or a disc */
  shape: { type: 'rect'; x: number; z: number; w: number; d: number } | { type: 'circle'; x: number; z: number; r: number };
  y: number;
  deep: string;
  shallow: string;
  skyHorizon: THREE.Color;
  skyZenith: THREE.Color;
  ambient: THREE.Color;
  /** reflection resolution relative to the screen (0 = sky only) */
  reflections: number;
  ripple?: number;
  rain?: number;
  opacity?: number;
}

/** True while any water is rendering its reflection, so reflections don't nest. */
let reflecting = false;

/**
 * Every water surface at the same height shares one reflection, rendered once a frame by whichever
 * of them draws first (a lake and six puddles cost one extra scene render, not seven).
 */
interface Mirror {
  target: THREE.WebGLRenderTarget;
  cam: THREE.PerspectiveCamera;
  /** the reflection camera's projection before the oblique clip, for texture lookups */
  proj: THREE.Matrix4;
  stamp: number;
  users: number;
  /** every surface sharing it, all hidden while it renders (they sample it, so can't draw into it) */
  meshes: Set<THREE.Mesh>;
}
const mirrors = new Map<string, Mirror>();

export class Water {
  readonly mesh: THREE.Mesh;
  private readonly mirror: Mirror | null = null;
  private readonly key: string;
  private readonly mat: THREE.ShaderMaterial;

  constructor(o: WaterOptions) {
    const geo = o.shape.type === 'rect' ? new THREE.PlaneGeometry(o.shape.w, o.shape.d) : new THREE.CircleGeometry(o.shape.r, 48);
    this.key = o.y.toFixed(2);
    if (o.reflections > 0) {
      let m = mirrors.get(this.key);
      if (!m) {
        m = { target: new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true }), cam: new THREE.PerspectiveCamera(), proj: new THREE.Matrix4(), stamp: -1, users: 0, meshes: new Set() };
        // only the world and fighters: no particles, grass or combat effects in the reflection
        m.cam.layers.set(0);
        mirrors.set(this.key, m);
      }
      m.users++;
      this.mirror = m;
    }
    const textureMatrix = new THREE.Matrix4();
    const uniforms: Record<string, THREE.IUniform> = {
      tRefl: { value: this.mirror?.target.texture ?? null },
      hasRefl: { value: this.mirror ? 1 : 0 },
      textureMatrix: { value: textureMatrix },
      deep: { value: new THREE.Color(o.deep) },
      shallow: { value: new THREE.Color(o.shallow) },
      skyHorizon: { value: o.skyHorizon.clone() },
      skyZenith: { value: o.skyZenith.clone() },
      ambient: { value: o.ambient.clone() },
      ripple: { value: o.ripple ?? 0.06 },
      rain: { value: o.rain ?? 0 },
      opacity: { value: o.opacity ?? 0.85 },
    };
    bindGlobals(uniforms);
    this.mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: true });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(o.shape.x, o.y, o.shape.z);
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = false;
    const mirror = this.mirror;
    if (!mirror) return;
    mirror.meshes.add(this.mesh);

    const scale = o.reflections;
    const plane = new THREE.Plane();
    const normal = new THREE.Vector3();
    const reflectorPos = new THREE.Vector3();
    const camPos = new THREE.Vector3();
    const rotation = new THREE.Matrix4();
    const lookAt = new THREE.Vector3();
    const clip = new THREE.Vector4();
    const view = new THREE.Vector3();
    const target = new THREE.Vector3();
    const q = new THREE.Vector4();
    const size = new THREE.Vector2();
    const rc = mirror.cam;
    this.mesh.onBeforeRender = (renderer, scene, camera) => {
      if (reflecting) return;
      const mesh = this.mesh;
      const lookup = () => {
        textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
        textureMatrix.multiply(mirror.proj).multiply(rc.matrixWorldInverse).multiply(mesh.matrixWorld);
      };
      if (mirror.stamp === G.uTime.value) {
        lookup();
        return;
      }
      reflectorPos.setFromMatrixPosition(mesh.matrixWorld);
      camPos.setFromMatrixPosition(camera.matrixWorld);
      rotation.extractRotation(mesh.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotation);
      view.subVectors(reflectorPos, camPos);
      if (view.dot(normal) > 0) return;
      mirror.stamp = G.uTime.value;
      view.reflect(normal).negate().add(reflectorPos);
      rotation.extractRotation(camera.matrixWorld);
      lookAt.set(0, 0, -1).applyMatrix4(rotation).add(camPos);
      target.subVectors(reflectorPos, lookAt).reflect(normal).negate().add(reflectorPos);
      rc.position.copy(view);
      rc.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
      rc.lookAt(target);
      rc.far = (camera as THREE.PerspectiveCamera).far;
      rc.updateMatrixWorld();
      rc.projectionMatrix.copy(camera.projectionMatrix);
      mirror.proj.copy(camera.projectionMatrix);
      lookup();
      // oblique near plane: clip everything below the water
      plane.setFromNormalAndCoplanarPoint(normal, reflectorPos).applyMatrix4(rc.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const pm = rc.projectionMatrix;
      q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
      q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
      q.z = -1;
      q.w = (1 + pm.elements[10]) / pm.elements[14];
      clip.multiplyScalar(2 / clip.dot(q));
      pm.elements[2] = clip.x;
      pm.elements[6] = clip.y;
      pm.elements[10] = clip.z + 1 - 0.003;
      pm.elements[14] = clip.w;
      renderer.getDrawingBufferSize(size);
      const w = Math.max(1, Math.round(size.x * scale));
      const h = Math.max(1, Math.round(size.y * scale));
      if (mirror.target.width !== w || mirror.target.height !== h) mirror.target.setSize(w, h);
      for (const m of mirror.meshes) m.visible = false;
      reflecting = true;
      const prevTarget = renderer.getRenderTarget();
      const prevShadow = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(mirror.target);
      renderer.state.buffers.depth.setMask(true);
      renderer.clear();
      renderer.render(scene, rc);
      renderer.shadowMap.autoUpdate = prevShadow;
      renderer.setRenderTarget(prevTarget);
      reflecting = false;
      for (const m of mirror.meshes) m.visible = true;
    };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mirror?.meshes.delete(this.mesh);
    if (this.mirror && --this.mirror.users <= 0) {
      this.mirror.target.dispose();
      mirrors.delete(this.key);
    }
  }
}
