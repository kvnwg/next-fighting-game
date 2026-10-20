/** Head-and-shoulders portraits of each fighter, rendered once in-engine and cached as data URLs. */
import * as THREE from 'three';
import { CharacterId } from '../../shared/characters';
import { CharacterModel } from './character';

const cache = new Map<CharacterId, string>();
const SIZE = 56;

export function portraitURL(renderer: THREE.WebGLRenderer, id: CharacterId): string {
  const hit = cache.get(id);
  if (hit) return hit;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#e6ecff', '#3a3040', 1.5));
  const key = new THREE.DirectionalLight('#fff0dc', 2.6);
  key.position.set(1.6, 2.4, 3);
  scene.add(key);
  // frontal fill so hooded and masked faces don't vanish into the frame
  const fill = new THREE.DirectionalLight('#dfe6ff', 1.2);
  fill.position.set(-0.5, 0.3, 3);
  scene.add(fill);
  const model = new CharacterModel(id);
  for (let i = 0; i < 12; i++) {
    model.update({ state: 'idle', elapsed: 0, dur: 0, attack: null, windup: 0, speed: 0, moveForward: 1, moveSide: 0, airborne: false, blockHeld: false, buff: false }, 0.05);
  }
  model.root.rotation.y = 0.35;
  scene.add(model.root);
  const headY = 1.74 * model.scale;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(0.12, headY + 0.08, 1.75 * model.scale);
  cam.lookAt(0, headY - 0.04, 0);

  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prevTarget = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(SIZE, SIZE);
  // WebGL rows are bottom-up
  for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
  g.putImageData(img, 0, 0);
  const url = canvas.toDataURL();
  cache.set(id, url);
  model.dispose();
  rt.dispose();
  return url;
}
