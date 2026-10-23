/**
 * The lobby's dueling rings while sealed: a wall of light rising from the sand edge, pixel bars
 * climbing it, bright at the foot and fading up. It rises when a duel seals the ring and sinks
 * when it opens again.
 */
import * as THREE from 'three';
import { FX_LAYER } from './renderer';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  // the wall rises from the ground as it seals
  float h = vUv.y / max(uLevel, 0.001);
  if (h > 1.0) discard;
  float fade = pow(1.0 - h, 1.7);
  // blocky bars around the ring, and bands of light climbing it
  float bars = step(0.55, fract(floor(vUv.x * 160.0) / 3.0 + 0.17));
  float climb = step(0.85, fract(floor(h * 14.0) / 14.0 * 3.0 - uTime * 0.9));
  float a = fade * (0.28 + bars * 0.22 + climb * 0.35) + step(h, 0.04) * 0.9;
  gl_FragColor = vec4(uColor * (1.2 + fade * 2.5), a * min(1.0, uLevel * 1.5));
}`;

interface Wall {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  level: number;
  target: number;
}

export class RingWalls {
  readonly group = new THREE.Group();
  private walls: Wall[];
  private time = 0;

  constructor(rings: readonly { x: number; z: number; r: number }[]) {
    this.walls = rings.map((r) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uColor: { value: new THREE.Color('#ff5a32') } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r.r, r.r, 3.2, 72, 1, true), mat);
      mesh.position.set(r.x, 1.6, r.z);
      mesh.layers.set(FX_LAYER);
      mesh.visible = false;
      this.group.add(mesh);
      return { mesh, mat, level: 0, target: 0 };
    });
  }

  /** Raise (sealed) or lower ring `i`'s wall; gold once the duel is over. */
  set(i: number, sealed: boolean, over = false): void {
    const w = this.walls[i];
    if (!w) return;
    w.target = sealed ? 1 : 0;
    (w.mat.uniforms.uColor.value as THREE.Color).set(over ? '#ffc04a' : '#ff5a32');
  }

  update(dt: number): void {
    this.time += dt;
    for (const w of this.walls) {
      w.level += (w.target - w.level) * Math.min(1, dt * (w.target > w.level ? 3 : 2));
      if (w.target === 0 && w.level < 0.01) w.level = 0;
      w.mesh.visible = w.level > 0;
      w.mat.uniforms.uLevel.value = w.level;
      w.mat.uniforms.uTime.value = this.time;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const w of this.walls) {
      w.mesh.geometry.dispose();
      w.mat.dispose();
    }
  }
}
