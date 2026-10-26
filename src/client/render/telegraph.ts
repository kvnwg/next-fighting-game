/**
 * The warning painted on the ground under a perilous area attack's windup: the strip a fissure
 * will split or a thrown spear will fly down and back, the band a ring of fire will sweep, or the
 * circle lightning will strike. A dim
 * blocky field with a hard bright rim; a fill grows across it as the blow comes and reaches the
 * far edge the moment it lands. Then the ground flashes in the attack's own colour and, for a
 * fissure, a glowing crack lingers.
 */
import * as THREE from 'three';
import { AttackShape } from '../../shared/characters';
import { FX_LAYER } from './renderer';

const VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uKind;
uniform vec2 uDim;
uniform float uProgress;
uniform float uTime;
uniform float uFade;
uniform float uStrike;
uniform float uCrack;
uniform vec3 uColor;
uniform vec3 uHit;
varying vec2 vP;

float hash(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  // in blocks, like everything else in the world
  vec2 q = (floor(vP * 8.0) + 0.5) / 8.0;
  float d;
  float t;
  if (uKind < 0.5) {
    // a strip straight ahead: x across, z along it
    d = max(abs(q.x) - uDim.x, max(-q.y, q.y - uDim.y));
    t = clamp(q.y / uDim.y, 0.0, 1.0);
  } else if (uKind < 1.5) {
    float r = length(q);
    d = max(uDim.x - r, r - uDim.y);
    t = (r - uDim.x) / (uDim.y - uDim.x);
  } else {
    float r = length(q);
    d = r - uDim.x;
    t = r / uDim.x;
  }
  if (d > 0.0) discard;
  float rim = 1.0 - step(0.13, -d);
  vec3 col;
  float a;
  if (uStrike <= 0.0) {
    float fill = step(t, uProgress);
    float front = fill * (1.0 - step(0.06, uProgress - t));
    // faint bands crawling toward the far edge, quicker as it comes
    float band = step(0.7, fract(t * 5.0 - uTime * (1.2 + uProgress * 3.0)));
    float beat = 0.8 + 0.2 * sin(uTime * (9.0 + uProgress * 16.0));
    a = (0.14 + band * 0.08 + fill * 0.26 + front * 0.4 + rim * 0.7) * beat;
    col = uColor * (1.0 + rim * 0.8 + front * 1.2);
  } else {
    // the blow has landed (uStrike seconds ago): the ground flashes and fades
    float k = clamp(uStrike / 0.4, 0.0, 1.0);
    a = (1.0 - k) * (1.0 - k) * (0.6 + rim * 0.4);
    col = mix(vec3(1.0), uHit, 0.35 + k * 0.6) * 1.6;
    if (uCrack > 0.5) {
      // a crack zigzagging down the middle of the strip, glowing like embers as it cools
      float seg = floor(q.y * 1.6);
      float f = fract(q.y * 1.6);
      float x = mix(hash(seg) - 0.5, hash(seg + 1.0) - 0.5, f) * uDim.x * 0.9;
      float crack = 1.0 - step(0.09 + 0.05 * hash(floor(q.y * 8.0)), abs(q.x - x));
      float glow = crack * (1.0 - smoothstep(0.3, 1.6, uStrike));
      a = max(a, glow);
      col = mix(col, uHit * 2.2, glow);
    }
  }
  gl_FragColor = vec4(col, a * uFade);
}`;

const KIND: Record<AttackShape['kind'], number> = { line: 0, ring: 1, zone: 2 };

export class Telegraph {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private age = 0;
  /** seconds since the blow landed, or <0 before it */
  private struck = -1;
  private cancelled = false;
  /** how long the after-image lasts once struck (a fissure's crack lingers) */
  private readonly after: number;

  /** `crack`: a strip splits open as it lands and the crack lingers (a fissure, not a thrown spear) */
  constructor(shape: AttackShape, range: number, color = '#ff2a2a', hit = '#ffd27a', crack = shape.kind === 'line') {
    let geo: THREE.PlaneGeometry;
    let dim: [number, number];
    if (shape.kind === 'line') {
      geo = new THREE.PlaneGeometry(shape.width * 2 + 0.5, range + 0.5).rotateX(-Math.PI / 2).translate(0, 0, range / 2);
      dim = [shape.width, range];
    } else {
      const r = shape.kind === 'ring' ? range : shape.radius;
      geo = new THREE.PlaneGeometry(r * 2 + 0.5, r * 2 + 0.5).rotateX(-Math.PI / 2);
      dim = shape.kind === 'ring' ? [shape.inner, range] : [shape.radius, 0];
    }
    this.after = crack ? 1.6 : 0.45;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uKind: { value: KIND[shape.kind] },
        uDim: { value: new THREE.Vector2(...dim) },
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uFade: { value: 0 },
        uStrike: { value: -1 },
        uCrack: { value: crack ? 1 : 0 },
        uColor: { value: new THREE.Color(color) },
        uHit: { value: new THREE.Color(hit) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.layers.set(FX_LAYER);
    this.mesh.renderOrder = 2;
  }

  /** Put it on the ground at (x, z), turned to face `yaw` (only a strip cares). */
  place(x: number, z: number, yaw: number): void {
    this.mesh.position.set(x, 0.05, z);
    this.mesh.rotation.y = yaw;
  }

  /** How far through the windup the blow is (0..1): the fill reaches the far edge at 1. */
  set progress(k: number) {
    this.mat.uniforms.uProgress.value = Math.max(0, Math.min(1, k));
  }

  /** The blow lands now. */
  strike(): void {
    if (this.struck < 0) this.struck = 0;
  }

  /** The attack was stopped before it landed: fade quickly away. */
  cancel(): void {
    this.cancelled = true;
  }

  /** Advance; false once it has faded out and can be thrown away. */
  update(dt: number): boolean {
    this.age += dt;
    const u = this.mat.uniforms;
    u.uTime.value = this.age;
    if (this.struck >= 0) {
      this.struck += dt;
      u.uStrike.value = this.struck;
      u.uFade.value = 1;
      return this.struck < this.after;
    }
    if (this.cancelled) {
      u.uFade.value -= dt * 5;
      return u.uFade.value > 0;
    }
    u.uFade.value = Math.min(1, this.age * 8);
    return true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
