/** Low-poly prop builders. Each returns a group positioned at the origin; the caller places it. */
import * as THREE from 'three';
import { PropKind } from '../../shared/maps';
import { seededRandom } from '../../shared/math';
import { bambooTexture, barkTexture, stoneBlockTexture, toon, toonRamp } from './textures';

export interface PropContext {
  /** dark enough (night or dusk) that lanterns cast light */
  night: boolean;
  /** register per-frame animation */
  animate: (fn: (t: number) => void) => void;
  /** request a point light (budgeted by the caller) */
  light: (parent: THREE.Object3D, color: string, intensity: number, distance: number, y: number) => void;
  seed: number;
}

function box(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, parent?: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent?.add(m);
  return m;
}

function cyl(mat: THREE.Material, rt: number, rb: number, h: number, seg: number, x = 0, y = 0, z = 0, parent?: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent?.add(m);
  return m;
}

function blob(mat: THREE.Material, r: number, x: number, y: number, z: number, parent: THREE.Object3D, detail = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const bark = () => toon('#6a4a32', { map: barkTexture(), key: 'bark' });

export function buildProp(kind: PropKind, ctx: PropContext): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(ctx.seed);
  switch (kind) {
    case 'sakura': {
      const trunk = cyl(bark(), 0.18, 0.3, 2.4, 6, 0, 1.2, 0, g);
      trunk.rotation.z = 0.08;
      const branch = cyl(bark(), 0.08, 0.14, 1.4, 5, 0.5, 2.4, 0, g);
      branch.rotation.z = -0.9;
      const pinks = ['#f6b8cc', '#f39dba', '#fbd0dc', '#ee8fb0'].map((c) => toon(c));
      for (let i = 0; i < 7; i++) {
        const a = rand() * Math.PI * 2;
        const r = 0.4 + rand() * 1.0;
        blob(pinks[i % pinks.length], 0.75 + rand() * 0.45, Math.cos(a) * r, 2.7 + rand() * 0.9, Math.sin(a) * r, g);
      }
      break;
    }
    case 'pine': {
      cyl(bark(), 0.15, 0.25, 1.6, 6, 0, 0.8, 0, g);
      const greens = ['#2f6b3a', '#3a7d45', '#285c33'].map((c) => toon(c));
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(1.6 - i * 0.32, 1.5, 7), greens[i % 3]);
        c.position.y = 1.6 + i * 0.85;
        c.rotation.y = rand() * Math.PI;
        c.castShadow = true;
        g.add(c);
      }
      break;
    }
    case 'deadTree': {
      const wood = toon('#4a3a32');
      cyl(wood, 0.12, 0.22, 2.6, 5, 0, 1.3, 0, g);
      for (let i = 0; i < 4; i++) {
        const b = cyl(wood, 0.04, 0.08, 1.0, 4, 0, 1.4 + i * 0.35, 0, g);
        b.rotation.z = (i % 2 ? 1 : -1) * (0.7 + rand() * 0.4);
        b.rotation.y = rand() * Math.PI * 2;
        b.position.x = Math.sin(b.rotation.y) * 0.3;
      }
      const snow = toon('#f2f6fb');
      box(snow, 0.3, 0.08, 0.3, 0, 2.6, 0, g);
      break;
    }
    case 'bamboo': {
      const mat = toon('#6c9a3a', { map: bambooTexture(), key: 'bamboo' });
      const leaf = toon('#5b8c33');
      const n = 5 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand();
        const r = 0.2 + rand() * 0.55;
        const h = 5 + rand() * 4;
        const stalk = cyl(mat, 0.09, 0.11, h, 6, Math.cos(a) * r, h / 2, Math.sin(a) * r, g);
        stalk.rotation.z = (rand() - 0.5) * 0.12;
        const tex = (mat.map as THREE.Texture).clone();
        tex.repeat.set(1, h / 1.2);
        tex.needsUpdate = true;
        for (let k = 0; k < 3; k++) {
          const l = box(leaf, 0.7, 0.04, 0.22, Math.cos(a) * r + 0.3, h * (0.55 + k * 0.15), Math.sin(a) * r, g);
          l.rotation.y = rand() * Math.PI * 2;
          l.rotation.z = -0.4;
        }
      }
      break;
    }
    case 'rock': {
      const mat = toon(['#7d7f86', '#8a8c92', '#6f7178'][Math.floor(rand() * 3)]);
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), mat);
      r.scale.set(1.1, 0.75, 0.95);
      r.position.y = 0.4;
      r.rotation.set(rand(), rand(), rand());
      r.castShadow = true;
      r.receiveShadow = true;
      g.add(r);
      break;
    }
    case 'pillar':
    case 'brokenPillar': {
      const stone = toon('#a8a49a', { map: stoneBlockTexture(), key: 'stoneblock' });
      box(stone, 1.4, 0.35, 1.4, 0, 0.18, 0, g);
      const h = kind === 'pillar' ? 4.2 : 1.6 + rand() * 1.4;
      cyl(stone, 0.6, 0.65, h, 8, 0, 0.35 + h / 2, 0, g);
      if (kind === 'pillar') box(stone, 1.4, 0.35, 1.4, 0, 0.35 + h + 0.18, 0, g);
      else {
        const chunk = cyl(stone, 0.55, 0.6, 1.0, 8, 1.2, 0.4, 0.4, g);
        chunk.rotation.z = Math.PI / 2;
        chunk.rotation.y = rand() * 3;
      }
      break;
    }
    case 'lantern': {
      const stone = toon('#9a978e');
      box(stone, 0.6, 0.15, 0.6, 0, 0.08, 0, g);
      cyl(stone, 0.12, 0.15, 0.9, 6, 0, 0.6, 0, g);
      box(stone, 0.55, 0.12, 0.55, 0, 1.1, 0, g);
      // own material per lantern so each one flickers on its own; bright enough to bloom
      const light = new THREE.MeshToonMaterial({ color: '#ffb050', emissive: '#ff9a3a', emissiveIntensity: 0.9, gradientMap: toonRamp() });
      box(light, 0.36, 0.34, 0.36, 0, 1.33, 0, g).castShadow = false;
      const off = rand() * 10;
      ctx.animate((t) => {
        light.emissiveIntensity = 0.85 + Math.sin(t * 6.3 + off) * 0.18 + Math.sin(t * 15.7 + off * 2) * 0.1 + (Math.sin(t * 1.3 + off) > 0.96 ? -0.35 : 0);
      });
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 4), stone);
      roof.position.y = 1.7;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      g.add(roof);
      if (ctx.night) ctx.light(g, '#ffcf98', 3.2, 8, 1.35);
      break;
    }
    case 'torii': {
      const red = toon('#c8352b');
      const black = toon('#2a2222');
      cyl(red, 0.2, 0.24, 4.2, 8, -2, 2.1, 0, g);
      cyl(red, 0.2, 0.24, 4.2, 8, 2, 2.1, 0, g);
      box(black, 5.6, 0.28, 0.45, 0, 4.25, 0, g);
      box(red, 5.0, 0.22, 0.35, 0, 4.0, 0, g);
      box(red, 4.6, 0.2, 0.3, 0, 3.35, 0, g);
      box(black, 0.5, 0.25, 0.5, -2, 0.12, 0, g);
      box(black, 0.5, 0.25, 0.5, 2, 0.12, 0, g);
      break;
    }
    case 'shrine': {
      const wood = toon('#7a3a2a');
      const roofMat = toon('#3a3a44');
      const stone = toon('#8d8a82');
      box(stone, 4.6, 0.4, 3.8, 0, 0.2, 0, g);
      box(wood, 3.6, 2.2, 2.8, 0, 1.5, 0, g);
      box(toon('#2a1a14'), 1.2, 1.6, 0.05, 0, 1.2, 1.41, g);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.6, 4), roofMat);
      roof.position.y = 3.4;
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1.15, 1, 0.95);
      roof.castShadow = true;
      g.add(roof);
      box(toon('#d9b24a'), 0.3, 0.3, 0.3, 0, 4.3, 0, g);
      break;
    }
    case 'brazier': {
      const iron = toon('#3a3434');
      cyl(iron, 0.35, 0.2, 0.9, 6, 0, 0.45, 0, g);
      cyl(iron, 0.55, 0.4, 0.3, 8, 0, 1.0, 0, g);
      const fire = toon('#ffb030', { emissive: '#ff6a10' });
      const flames: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const f = box(fire, 0.25, 0.4, 0.25, (i - 1) * 0.15, 1.35, (i % 2) * 0.1, g);
        f.castShadow = false;
        flames.push(f);
      }
      const off = rand() * 10;
      ctx.animate((t) => {
        flames.forEach((f, i) => {
          f.scale.y = 0.8 + Math.sin(t * 9 + i * 2 + off) * 0.3;
          f.position.y = 1.3 + f.scale.y * 0.1;
        });
      });
      ctx.light(g, '#ff8a3a', 8, 10, 1.6);
      break;
    }
    case 'banner': {
      const pole = toon('#5a3d28');
      cyl(pole, 0.05, 0.05, 3.2, 5, 0, 1.6, 0, g);
      const cloth = box(toon('#b8323a'), 0.04, 1.6, 0.8, 0, 2.2, 0.42, g);
      box(toon('#e8c44a'), 0.05, 0.3, 0.3, 0, 2.4, 0.42, g);
      const off = rand() * 10;
      ctx.animate((t) => {
        cloth.rotation.y = Math.sin(t * 1.6 + off) * 0.15;
      });
      break;
    }
    case 'crystal': {
      const ice = new THREE.MeshToonMaterial({ color: '#a8dcff', emissive: '#4a8ac0', emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
      for (let i = 0; i < 4; i++) {
        const h = 1.4 + rand() * 1.8;
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), ice);
        c.scale.set(0.6, h, 0.6);
        c.position.set((rand() - 0.5) * 0.9, h * 0.45, (rand() - 0.5) * 0.9);
        c.rotation.set((rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4);
        c.castShadow = true;
        g.add(c);
      }
      break;
    }
    case 'ruinWall': {
      const stone = toon('#8f938c', { map: stoneBlockTexture(), key: 'stoneblock' });
      const segs = 5;
      for (let i = 0; i < segs; i++) {
        const h = 1.2 + rand() * 1.8;
        box(stone, 1.0, h, 0.9, -2 + i * 1.0, h / 2, 0, g);
      }
      const moss = toon('#4f7a3c');
      box(moss, 1.1, 0.12, 1.0, -1, 0.06, 0, g);
      break;
    }
    case 'statue': {
      const stone = toon('#b7b3a8');
      box(stone, 1.8, 0.8, 1.8, 0, 0.4, 0, g);
      box(stone, 0.9, 1.4, 0.6, 0, 1.5, 0, g);
      box(stone, 0.6, 0.6, 0.6, 0, 2.5, 0, g);
      const arm = box(stone, 0.25, 1.3, 0.25, 0.55, 1.9, 0.2, g);
      arm.rotation.x = -0.6;
      box(toon('#cfd6dc'), 0.08, 1.9, 0.12, 0.55, 2.6, 0.8, g);
      break;
    }
    case 'anvil': {
      const iron = toon('#4a4a52');
      box(toon('#5a3a2a'), 1.2, 0.5, 0.8, 0, 0.25, 0, g);
      box(iron, 0.5, 0.4, 0.4, 0, 0.7, 0, g);
      box(iron, 1.5, 0.3, 0.55, 0, 1.05, 0, g);
      box(toon('#ff8a3a', { emissive: '#ff5a10' }), 0.5, 0.1, 0.2, 0.2, 1.25, 0, g);
      break;
    }
    case 'crate': {
      const wood = toon('#9a6a3e');
      const dark = toon('#6a4426');
      box(wood, 1.1, 1.1, 1.1, 0, 0.55, 0, g);
      box(dark, 1.14, 0.12, 1.14, 0, 0.1, 0, g);
      box(dark, 1.14, 0.12, 1.14, 0, 1.0, 0, g);
      break;
    }
    case 'fence': {
      const wood = toon('#8a6040');
      box(wood, 0.14, 1.1, 0.14, 0, 0.55, -1, g);
      box(wood, 0.1, 0.12, 2.0, 0, 0.8, 0, g);
      box(wood, 0.1, 0.12, 2.0, 0, 0.45, 0, g);
      break;
    }
    case 'bush': {
      const greens = ['#3f7d3a', '#4b8f44', '#356b31'].map((c) => toon(c));
      for (let i = 0; i < 3; i++) blob(greens[i], 0.45 + rand() * 0.25, (rand() - 0.5) * 0.8, 0.35, (rand() - 0.5) * 0.8, g);
      break;
    }
    case 'bridgePost': {
      const wood = toon('#5c3b2e');
      box(wood, 0.25, 1.0, 0.25, 0, 0.5, 0, g);
      box(toon('#c8352b'), 0.3, 0.12, 0.3, 0, 1.0, 0, g);
      break;
    }
    case 'well': {
      const stone = toon('#8d8a82', { map: stoneBlockTexture(), key: 'stoneblock' });
      cyl(stone, 1.0, 1.05, 0.9, 10, 0, 0.45, 0, g);
      cyl(toon('#2a4a6a', { emissive: '#0a1a2a' }), 0.8, 0.8, 0.05, 10, 0, 0.85, 0, g);
      const wood = toon('#6a4a32');
      box(wood, 0.12, 2.0, 0.12, -0.9, 1.0, 0, g);
      box(wood, 0.12, 2.0, 0.12, 0.9, 1.0, 0, g);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.7, 4), toon('#7a3a2a'));
      roof.position.y = 2.3;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      g.add(roof);
      break;
    }
    case 'rankBoard': {
      const wood = toon('#6a4a32');
      box(wood, 0.18, 3.2, 0.18, -1.5, 1.6, 0, g);
      box(wood, 0.18, 3.2, 0.18, 1.5, 1.6, 0, g);
      box(wood, 3.4, 0.2, 0.3, 0, 3.15, 0, g);
      // the face (canvas texture) is attached by the map view
      break;
    }
  }
  return g;
}
