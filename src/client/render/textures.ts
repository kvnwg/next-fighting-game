/** Procedural pixel-art textures (drawn on tiny canvases, sampled with nearest filtering). */
import * as THREE from 'three';
import { GroundTex } from '../../shared/maps';
import { seededRandom } from '../../shared/math';

const cache = new Map<string, THREE.CanvasTexture>();

function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, rand: () => number) => void): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, seededRandom(key.length * 7919 + size));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  cache.set(key, t);
  return t;
}

function speckle(g: CanvasRenderingContext2D, rand: () => number, size: number, colors: string[], density: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (rand() < density) {
        g.fillStyle = colors[Math.floor(rand() * colors.length)];
        g.fillRect(x, y, 1, 1);
      }
    }
  }
}

/** World meters covered by one repeat of each ground texture. */
export const GROUND_TILE_METERS: Record<GroundTex, number> = {
  grass: 4,
  stone: 4,
  snow: 4,
  obsidian: 4,
  planks: 3,
  moss: 4,
  tiles: 3,
  sand: 4,
  path: 3,
};

export function groundTexture(kind: GroundTex): THREE.CanvasTexture {
  const S = 32;
  return canvasTex(`ground-${kind}`, S, (g, rand) => {
    switch (kind) {
      case 'grass':
        g.fillStyle = '#5f9a3e';
        g.fillRect(0, 0, S, S);
        speckle(g, rand, S, ['#548c36', '#6aa846', '#4d8231', '#78b34f'], 0.45);
        for (let i = 0; i < 14; i++) {
          const x = Math.floor(rand() * S);
          const y = Math.floor(rand() * S);
          g.fillStyle = '#86c25a';
          g.fillRect(x, y, 1, 2);
          g.fillStyle = '#3f7027';
          g.fillRect(x + 1, y + 1, 1, 1);
        }
        break;
      case 'moss':
        g.fillStyle = '#2f4f2c';
        g.fillRect(0, 0, S, S);
        speckle(g, rand, S, ['#28452a', '#365c33', '#22392a', '#3d6838'], 0.5);
        break;
      case 'stone':
        g.fillStyle = '#7d8086';
        g.fillRect(0, 0, S, S);
        speckle(g, rand, S, ['#73767c', '#878a90', '#6a6d73', '#91949a'], 0.5);
        g.fillStyle = '#5c5f65';
        for (let i = 0; i < 6; i++) {
          let x = Math.floor(rand() * S);
          let y = Math.floor(rand() * S);
          for (let k = 0; k < 6; k++) {
            g.fillRect(x, y, 1, 1);
            x = (x + (rand() < 0.5 ? 1 : 0) + S) % S;
            y = (y + (rand() < 0.6 ? 1 : -1) + S) % S;
          }
        }
        break;
      case 'tiles': {
        g.fillStyle = '#b9ada0';
        g.fillRect(0, 0, S, S);
        speckle(g, rand, S, ['#b0a497', '#c2b6a9', '#a99d90'], 0.4);
        g.fillStyle = '#8a7f74';
        for (let i = 0; i < S; i += 16) {
          g.fillRect(0, i, S, 1);
          g.fillRect(i + ((i / 16) % 2) * 8, 0, 1, S);
        }
        g.fillRect(8, 0, 1, 16);
        g.fillRect(24, 16, 1, 16);
        break;
      }
      case 'snow':
        g.fillStyle = '#eef4fb';
        g.fillRect(0, 0, S, S);
        speckle(g, rand, S, ['#e1eaf5', '#f8fbff', '#d5e2f0'], 0.35);
        break;
      case 'obsidian':
        g.fillStyle = '#2a2230';
        g.fillRect(0, 0, S, S);
        speckle(g, rand, S, ['#241d2a', '#33293a', '#1e1824', '#3d2f44'], 0.5);
        g.fillStyle = '#6a3a2a';
        for (let i = 0; i < 5; i++) g.fillRect(Math.floor(rand() * S), Math.floor(rand() * S), 1, 1);
        break;
      case 'planks':
        // weathered, greyish wood: warm light tints it without pushing it into saturated reds
        g.fillStyle = '#9a8270';
        g.fillRect(0, 0, S, S);
        for (let row = 0; row < 4; row++) {
          const base = ['#9a8270', '#8c7564', '#a68c78', '#927a68'][row];
          g.fillStyle = base;
          g.fillRect(0, row * 8, S, 8);
          g.fillStyle = '#5a4a44';
          g.fillRect(0, row * 8 + 7, S, 1);
          g.fillRect(((row * 13) % S) + 4, row * 8, 1, 7);
          g.fillStyle = '#b49c88';
          for (let i = 0; i < 6; i++) g.fillRect(Math.floor(rand() * S), row * 8 + 1 + Math.floor(rand() * 5), 2, 1);
        }
        break;
      case 'sand':
        g.fillStyle = '#d8c08a';
        g.fillRect(0, 0, S, S);
        speckle(g, rand, S, ['#cfb67f', '#e0c995', '#c6ad76'], 0.45);
        break;
      case 'path':
        g.fillStyle = '#9b7b55';
        g.fillRect(0, 0, S, S);
        speckle(g, rand, S, ['#8f714c', '#a7865e', '#846845', '#b09068'], 0.5);
        break;
    }
  });
}

export function lavaTexture(): THREE.CanvasTexture {
  const S = 32;
  return canvasTex('lava', S, (g, rand) => {
    g.fillStyle = '#ff5a10';
    g.fillRect(0, 0, S, S);
    speckle(g, rand, S, ['#ff7a1a', '#ffb02a', '#e0400a', '#ffd84a'], 0.5);
    g.fillStyle = '#b02a08';
    for (let i = 0; i < 8; i++) g.fillRect(Math.floor(rand() * S), Math.floor(rand() * S), 3, 1);
  });
}

export function barkTexture(): THREE.CanvasTexture {
  const S = 16;
  return canvasTex('bark', S, (g, rand) => {
    g.fillStyle = '#5a3d28';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#4a3220';
    for (let x = 0; x < S; x += 3) g.fillRect(x, 0, 1, S);
    speckle(g, rand, S, ['#6a4a32', '#3e2a1a'], 0.2);
  });
}

export function stoneBlockTexture(): THREE.CanvasTexture {
  const S = 32;
  return canvasTex('stoneblock', S, (g, rand) => {
    g.fillStyle = '#8d9097';
    g.fillRect(0, 0, S, S);
    speckle(g, rand, S, ['#83868d', '#979aa1', '#7a7d84'], 0.45);
    g.fillStyle = '#5d6066';
    for (let y = 0; y < S; y += 8) {
      g.fillRect(0, y, S, 1);
      const off = (y / 8) % 2 ? 8 : 0;
      for (let x = off; x < S; x += 16) g.fillRect(x, y, 1, 8);
    }
  });
}

export function bambooTexture(): THREE.CanvasTexture {
  const S = 16;
  return canvasTex('bamboo', S, (g) => {
    g.fillStyle = '#6c9a3a';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#86b44c';
    g.fillRect(2, 0, 3, S);
    g.fillStyle = '#4e7428';
    g.fillRect(0, 14, S, 2);
  });
}

/** A text glyph on a transparent canvas (used for the perilous warning). */
export function glyphTexture(text: string, color: string, bg: string): THREE.CanvasTexture {
  return canvasTex(`glyph-${text}-${color}-${bg}`, 32, (g) => {
    g.fillStyle = bg;
    g.beginPath();
    g.arc(16, 16, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.font = 'bold 22px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 16, 17);
  });
}

/** Fighters: a darker shadow band so the lit side and the rim read clearly. */
let charGradient: THREE.DataTexture | null = null;
export function charRamp(): THREE.DataTexture {
  if (charGradient) return charGradient;
  const data = new Uint8Array([30, 30, 170, 255]);
  charGradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  charGradient.minFilter = THREE.NearestFilter;
  charGradient.magFilter = THREE.NearestFilter;
  charGradient.generateMipmaps = false;
  charGradient.needsUpdate = true;
  return charGradient;
}

/** 4-step gradient for toon shading. */
let toonGradient: THREE.DataTexture | null = null;
export function toonRamp(): THREE.DataTexture {
  if (toonGradient) return toonGradient;
  const data = new Uint8Array([90, 150, 210, 255]);
  toonGradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  toonGradient.minFilter = THREE.NearestFilter;
  toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.generateMipmaps = false;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

const matCache = new Map<string, THREE.Material>();

/** Shared cel-shaded material for a flat colour. */
export function toon(color: string, opts: { emissive?: string; map?: THREE.Texture; key?: string } = {}): THREE.MeshToonMaterial {
  const key = `${color}|${opts.emissive ?? ''}|${opts.key ?? ''}`;
  const hit = matCache.get(key);
  if (hit && !opts.map) return hit as THREE.MeshToonMaterial;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), map: opts.map ?? null });
  if (opts.emissive) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = 1;
  }
  if (!opts.map) matCache.set(key, m);
  return m;
}
