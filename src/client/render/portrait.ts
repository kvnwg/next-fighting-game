/**
 * Bust portraits of each fighter, rendered once in-engine and cached as data URLs.
 *
 * Every fighter is framed to its own silhouette: a first pass renders the upper body and finds the
 * top of the head (hat, hood or helm) and where the face sits, then the portrait is cropped from
 * just over the head down to the upper chest, so the fighter fills the frame whatever they wear.
 * It's rendered at 4x and folded down to a small pixel-art sprite with a hard alpha edge and a dark
 * ink outline, to sit on a flat colour like the rest of the pixel UI.
 */
import * as THREE from 'three';
import { CharacterId } from '../../shared/characters';
import { CharacterModel } from './character';

const cache = new Map<CharacterId, string>();
/** the sprite's size in pixels (shown with image-rendering: pixelated) */
const OUT = 64;
const SS = 4;
/** the framing pass: resolution, and its half-extent around the head in body scales */
const PROBE = 160;
const PROBE_HALF = 0.85;
const INK: [number, number, number] = [18, 14, 22];

function renderRGBA(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, size: number): Uint8Array {
  const rt = new THREE.WebGLRenderTarget(size, size);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prevTarget = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  rt.dispose();
  // WebGL rows are bottom-up: flip so row 0 is the top
  const out = new Uint8Array(px.length);
  for (let y = 0; y < size; y++) out.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  return out;
}

function ortho(cx: number, cy: number, half: number): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(cx - half, cx + half, cy + half, cy - half, 0.1, 30);
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);
  return cam;
}

export function portraitURL(renderer: THREE.WebGLRenderer, id: CharacterId): string {
  const hit = cache.get(id);
  if (hit) return hit;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#e6ecff', '#3a3040', 1.6));
  const key = new THREE.DirectionalLight('#fff0dc', 2.6);
  key.position.set(1.6, 2.4, 3);
  scene.add(key);
  // frontal fill so hooded and masked faces don't vanish into the frame
  const fill = new THREE.DirectionalLight('#dfe6ff', 1.4);
  fill.position.set(-0.5, 0.3, 3);
  scene.add(fill);
  const model = new CharacterModel(id);
  for (let i = 0; i < 12; i++) {
    model.update({ state: 'idle', elapsed: 0, dur: 0, attack: null, windup: 0, speed: 0, moveForward: 1, moveSide: 0, airborne: false, blockHeld: false, buff: false }, 0.05);
  }
  model.root.rotation.y = 0.35;
  scene.add(model.root);
  const s = model.scale;
  const headY = 1.74 * s;

  // 1. framing: where are the top of the head and the face?
  const half = PROBE_HALF * s;
  const probe = renderRGBA(renderer, scene, ortho(0, headY, half), PROBE);
  const toX = (col: number) => -half + ((col + 0.5) / PROBE) * half * 2;
  const toY = (row: number) => headY + half - ((row + 0.5) / PROBE) * half * 2;
  const band = 0.3 * s; // the head column: ignores weapons slung across the back or held out
  let top = headY + 0.15 * s;
  let sumX = 0;
  let nX = 0;
  for (let row = 0; row < PROBE; row++) {
    const y = toY(row);
    for (let col = 0; col < PROBE; col++) {
      if (probe[(row * PROBE + col) * 4 + 3] < 128) continue;
      const x = toX(col);
      if (Math.abs(x) > band) continue;
      if (y > top && y < headY + 0.6 * s) top = y;
      if (Math.abs(y - headY) < 0.12 * s) {
        sumX += x;
        nX++;
      }
    }
  }
  const faceX = nX ? sumX / nX : 0;
  // tall crests, horns and spear tips may run off the top rather than shrink the face
  const yTop = Math.min(top, headY + 0.36 * s) + 0.03 * s;
  const yBot = headY - 0.4 * s;
  const size = yTop - yBot;
  const cam = ortho(faceX, (yTop + yBot) / 2, size / 2);

  // 2. the portrait, at 4x
  const big = OUT * SS;
  const px = renderRGBA(renderer, scene, cam, big);
  model.dispose();

  // 3. fold down: average the opaque samples, hard alpha edge, then a 1px ink outline
  const rgba = new Uint8ClampedArray(OUT * OUT * 4);
  const solid = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * big + x * SS + sx) * 4;
          if (px[i + 3] < 128) continue;
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
          n++;
        }
      }
      if (n * 2 < SS * SS) continue;
      const o = (y * OUT + x) * 4;
      rgba[o] = r / n;
      rgba[o + 1] = g / n;
      rgba[o + 2] = b / n;
      rgba[o + 3] = 255;
      solid[y * OUT + x] = 1;
    }
  }
  const near = (x: number, y: number) => x >= 0 && y >= 0 && x < OUT && y < OUT && solid[y * OUT + x] === 1;
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      if (solid[y * OUT + x] || !(near(x + 1, y) || near(x - 1, y) || near(x, y + 1) || near(x, y - 1))) continue;
      const o = (y * OUT + x) * 4;
      rgba[o] = INK[0];
      rgba[o + 1] = INK[1];
      rgba[o + 2] = INK[2];
      rgba[o + 3] = 255;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = OUT;
  canvas.getContext('2d')!.putImageData(new ImageData(rgba, OUT, OUT), 0, 0);
  const url = canvas.toDataURL();
  cache.set(id, url);
  return url;
}
