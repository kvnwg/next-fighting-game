/** Camera occlusion against map props: keeps the view from ending up inside trees and walls. */
import * as THREE from 'three';
import { MapDef, PropKind } from '../shared/maps';
import { Collider, clampToFloor, propColliders } from '../shared/physics';

/** Rough visual heights of solid props (meters, before prop scale). */
const HEIGHT: Partial<Record<PropKind, number>> = {
  sakura: 4.5,
  pine: 5,
  deadTree: 3,
  bamboo: 9,
  rock: 1.1,
  pillar: 5,
  brokenPillar: 2.6,
  lantern: 1.9,
  brazier: 1.5,
  crystal: 3,
  statue: 3,
  well: 2.6,
  torii: 4.5,
  shrine: 4.2,
  ruinWall: 2.6,
  anvil: 1.3,
  crate: 1.1,
  rankBoard: 3.3,
};

interface Blocker {
  c: Collider;
  h: number;
}

export function buildBlockers(map: MapDef): Blocker[] {
  const out: Blocker[] = [];
  for (const p of map.props) {
    if (!p.solid) continue;
    const h = (HEIGHT[p.kind] ?? 0) * (p.s ?? 1);
    if (h < 1) continue;
    for (const c of propColliders(p)) out.push({ c, h });
  }
  return out;
}

/** Fraction along from->to (XZ) where the segment first enters the collider, or null. */
function hitT(c: Collider, fx: number, fz: number, tx: number, tz: number): number | null {
  if (c.type === 'circle') {
    const dx = tx - fx;
    const dz = tz - fz;
    const ox = fx - c.x;
    const oz = fz - c.z;
    const a = dx * dx + dz * dz;
    const b = 2 * (ox * dx + oz * dz);
    const cc = ox * ox + oz * oz - c.r * c.r;
    if (cc < 0 || a < 1e-6) return null;
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
  }
  // box: slab test in the box's local frame
  const cos = Math.cos(c.rot);
  const sin = Math.sin(c.rot);
  const lf = [(fx - c.x) * cos - (fz - c.z) * sin, (fx - c.x) * sin + (fz - c.z) * cos];
  const lt = [(tx - c.x) * cos - (tz - c.z) * sin, (tx - c.x) * sin + (tz - c.z) * cos];
  const half = [c.hw, c.hd];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 2; i++) {
    const d = lt[i] - lf[i];
    if (Math.abs(d) < 1e-6) {
      if (Math.abs(lf[i]) > half[i]) return null;
      continue;
    }
    let a = (-half[i] - lf[i]) / d;
    let b = (half[i] - lf[i]) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0 > 0 ? t0 : null;
}

export function constrainCamera(map: MapDef, blockers: Blocker[], from: THREE.Vector3, to: THREE.Vector3): void {
  if (map.edge === 'wall') {
    const p = { x: to.x, z: to.z };
    clampToFloor(map, p, 0.6);
    to.x = p.x;
    to.z = p.z;
  }
  let best = 1;
  for (const b of blockers) {
    const t = hitT(b.c, from.x, from.z, to.x, to.z);
    if (t === null || t >= best) continue;
    const y = from.y + (to.y - from.y) * t;
    if (y < b.h) best = t;
  }
  if (best < 1) {
    // never pull in closer than ~2m: better to see through a prop than from inside your own head
    const len = from.distanceTo(to);
    const minT = len > 0 ? Math.min(1, 2.2 / len) : 1;
    to.lerpVectors(from, to, Math.max(minT, best - 0.06));
  }
}
