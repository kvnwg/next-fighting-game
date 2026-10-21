// Shared character-sheet renderer: lays out rows of orthographic views, each
// drawn over a deterministic ink-wash splatter, and flags window.__ready.

import * as THREE from 'three';
import { buildRig } from './mesher.js';

// Ink-wash splatter. Every mark (with its radius) stays inside the canvas so
// nothing gets clipped at the panel edge.
export function splatter(ctx, w, h, seed, ink = [18, 18, 20], scale = 1, density = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const dot = (x, y, r, a) => {
    if (x - r < 4 || x + r > w - 4 || y - r < 4 || y + r > h - 4) return;
    ctx.fillStyle = `rgba(${ink.join(',')},${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
  };
  const cx = w * (0.6 + rnd() * 0.08), cy = h * 0.6;
  // washes: clusters of overlapping translucent blots give soft, irregular edges
  for (let i = 0; i < Math.round(9 * density); i++) {
    const bx = cx + (rnd() - 0.4) * w * 0.55, by = cy + (rnd() - 0.5) * h * 0.45;
    const br = (30 + rnd() * 70) * scale;
    for (let j = 0; j < 40; j++) {
      const a = rnd() * 7, d = Math.sqrt(rnd()) * br;
      dot(bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.9, 4 + rnd() * br * 0.35, 0.012 + rnd() * 0.02);
    }
  }
  // spray: sharp droplets thrown outward from the washes
  for (let i = 0; i < Math.round(260 * density); i++) {
    const a = rnd() * 7, d = Math.pow(rnd(), 0.7) * w * 0.48;
    dot(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.95, (0.8 + Math.pow(rnd(), 3) * 9) * scale, 0.35 + rnd() * 0.5);
  }
}

// rows: [[view, ...], ...]; view = { id, title, sub, model, poses, pose, dir, x: [l, r], y?: [b, t], px? }
// `x` is measured along the camera's right axis.
// accent: optional second splatter colour (sparser), e.g. [200, 40, 58] for red ink.
export function renderSheet(container, { px, y = [-3, 91], rows, ink, accent, splatterScale = 1 }) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8780, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  scene.add(key, key.target, fill, fill.target);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);

  const rigs = new Map();
  const rigFor = (model) => {
    if (!rigs.has(model)) rigs.set(model, buildRig(model));
    return rigs.get(model);
  };

  let n = 0;
  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'panels';
    container.append(rowEl);
    for (const v of row) {
      const [y0, y1] = v.y ?? y;
      const vpx = v.px ?? px; // per-view zoom, e.g. for small props
      const w = Math.round((v.x[1] - v.x[0]) * vpx), h = Math.round((y1 - y0) * vpx);
      const fig = document.createElement('figure');
      fig.id = `panel-${v.id}`;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.id = `view-${v.id}`;
      fig.append(canvas);
      fig.insertAdjacentHTML('beforeend', `<figcaption>${v.title}<small>${v.sub ?? ''}</small></figcaption>`);
      rowEl.append(fig);

      const rig = rigFor(v.model);
      rig.setPose(v.poses?.[v.pose] ?? {});
      scene.add(rig.root);

      const cam = new THREE.OrthographicCamera(v.x[0], v.x[1], y1, y0, 1, 2000);
      const [dx, , dz] = v.dir;
      cam.position.set(dx * 500, 0, dz * 500);
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      key.position.set(dx * 60 - right.x * 45, 110, dz * 60 - right.z * 45);
      fill.position.set(dx * 40 + right.x * 60, 20, dz * 40 + right.z * 60);

      renderer.setSize(w, h, false);
      renderer.render(scene, cam);
      scene.remove(rig.root);

      const ctx = canvas.getContext('2d');
      splatter(ctx, w, h, 1234 + n * 97, ink, splatterScale);
      if (accent) splatter(ctx, w, h, 4321 + n * 31, accent, splatterScale * 0.8, 0.25);
      n++;
      // soft ground shadow
      const gy = y1 * vpx;
      const rx = Math.min(w * 0.45, 22 * vpx);
      ctx.save();
      ctx.scale(1, 0.18);
      const grad = ctx.createRadialGradient(w / 2, gy / 0.18, 2, w / 2, gy / 0.18, rx);
      grad.addColorStop(0, 'rgba(0,0,0,0.28)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(w / 2, gy / 0.18, rx, 0, 7);
      ctx.fill();
      ctx.restore();
      ctx.drawImage(renderer.domElement, 0, 0);
    }
  }
}

export function swatches(el, palette) {
  el.innerHTML = Object.entries(palette)
    .map(([k, c]) => `<div class="swatch" title="${k}" style="background:${c}"></div>`)
    .join('');
}
