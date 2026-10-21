/**
 * Bust portraits of each fighter, rendered once in-engine and cached as data URLs.
 *
 * Every fighter is framed to its own silhouette: a first pass renders the upper body and finds the
 * top of the head (hat, hood or helm) and where the face sits, then the portrait is cropped from
 * just over the head down to the upper chest, so the fighter fills the frame whatever they wear.
 *
 * The look is a woodblock poster, all hard edges and no gradients: a dark ground in the fighter's
 * colour, a sun disc behind the head cut by bands, their name in kanji faint down the side, and the
 * fighter lit from the side with a rim of their colour, inked round with a hard drop shadow.
 */
import * as THREE from 'three';
import { CHARACTERS, CharacterId } from '../../shared/characters';
import { CharacterModel } from './character';
import { G } from './gfx/globals';

const cache = new Map<CharacterId, string>();
/** the portrait's size in pixels, and how much bigger it's drawn before being scaled down */
const OUT = 192;
const SS = 2;
/** the framing pass: resolution, and its half-extent around the head in body scales */
const PROBE = 160;
const PROBE_HALF = 0.85;
const INK = '#120e16';

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
  const def = CHARACTERS[id];
  const accent = new THREE.Color(def.palette.accent);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#c8d0e8', '#2a2030', 0.9));
  // warm key from the front-left, a cool fill, and the fighter's colour raking in from behind
  const key = new THREE.DirectionalLight('#ffe8cc', 3.2);
  key.position.set(-2.2, 2.2, 2.6);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#b8c8ff', 0.9);
  fill.position.set(1.5, 0.4, 3);
  scene.add(fill);
  const back = new THREE.DirectionalLight(accent, 3.5);
  back.position.set(2.5, 1.6, -3);
  scene.add(back);
  const model = new CharacterModel(id);
  for (let i = 0; i < 12; i++) {
    model.update({ state: 'idle', elapsed: 0, dur: 0, attack: null, windup: 0, speed: 0, moveForward: 1, moveSide: 0, airborne: false, blockHeld: false, buff: false }, 0.05);
  }
  model.root.rotation.y = 0.5;
  scene.add(model.root);
  const s = model.scale;
  const headY = 1.74 * s;

  // the world shaders' rim light and fog are shared uniforms: the fighter's colour for the rim,
  // and no haze, just for this
  const rim = G.uRim.value.clone();
  const fog = G.uFog.value.x;
  G.uRim.value.set(accent.r, accent.g, accent.b, 1.1);
  G.uFog.value.x = 0;

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
  const yTop = Math.min(top, headY + 0.36 * s) + 0.1 * s;
  const yBot = headY - 0.52 * s;
  const size = yTop - yBot;
  // the face a little left of centre, looking across at the sun
  const cam = ortho(faceX + size * 0.06, (yTop + yBot) / 2, size / 2);

  // 2. the fighter
  const big = OUT * SS;
  const px = renderRGBA(renderer, scene, cam, big);
  model.dispose();
  G.uRim.value.copy(rim);
  G.uFog.value.x = fog;
  const fig = document.createElement('canvas');
  fig.width = fig.height = big;
  fig.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), big, big), 0, 0);
  const silhouette = (color: string) => {
    const c = document.createElement('canvas');
    c.width = c.height = big;
    const g = c.getContext('2d')!;
    g.drawImage(fig, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, big, big);
    return c;
  };

  // 3. the poster
  const hexOf = (c: THREE.Color) => `#${c.getHexString()}`;
  const ground = hexOf(accent.clone().lerp(new THREE.Color(INK), 0.93));
  const sun = hexOf(accent.clone().lerp(new THREE.Color('#fff4e0'), 0.12));
  const shade = hexOf(accent.clone().lerp(new THREE.Color(INK), 0.78));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = big;
  const g = canvas.getContext('2d')!;
  g.fillStyle = ground;
  g.fillRect(0, 0, big, big);
  // the sun behind the head, cut by bands that thicken toward the bottom
  const cx = big * 0.6;
  const cy = big * 0.4;
  const r = big * 0.3;
  g.fillStyle = sun;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = ground;
  for (let i = 0, y = cy + r * 0.18; i < 4; i++) {
    const h = big * (0.012 + i * 0.012);
    g.fillRect(0, y, big, h);
    y += h + big * (0.05 - i * 0.008);
  }
  // the name in kanji, faint, down the left edge
  g.fillStyle = shade;
  g.font = `900 ${Math.round(big * 0.17)}px "Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  [...def.jp].forEach((ch, i) => g.fillText(ch, big * 0.12, big * 0.05 + i * big * 0.18));
  // the fighter: a hard drop shadow, an ink outline, then the figure
  const o = Math.round(big * 0.018);
  g.drawImage(silhouette(shade), o * 2.2, o * 2.2);
  const ink = silhouette(INK);
  for (let a = 0; a < 8; a++) g.drawImage(ink, Math.round(Math.cos((a * Math.PI) / 4) * o), Math.round(Math.sin((a * Math.PI) / 4) * o));
  g.drawImage(fig, 0, 0);
  // a thin inner keyline in the fighter's colour
  g.strokeStyle = sun;
  g.lineWidth = Math.max(2, big * 0.012);
  g.strokeRect(big * 0.03, big * 0.03, big * 0.94, big * 0.94);

  const out = document.createElement('canvas');
  out.width = out.height = OUT;
  const og = out.getContext('2d')!;
  og.imageSmoothingQuality = 'high';
  og.drawImage(canvas, 0, 0, OUT, OUT);
  const url = out.toDataURL();
  cache.set(id, url);
  return url;
}
