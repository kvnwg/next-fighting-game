/** Tiny kinematic character physics shared by the client (local player) and server (bots). */
import { FALL_DEATH_Y, GRAVITY, PLAYER_RADIUS } from './config';
import { MapDef, Prop, Shape, onFloor } from './maps';

export type Collider =
  | { type: 'circle'; x: number; z: number; r: number }
  | { type: 'box'; x: number; z: number; hw: number; hd: number; rot: number };

function rotLocal(dx: number, dz: number, rot: number): [number, number] {
  // inverse of three.js Y rotation
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [dx * c - dz * s, dx * s + dz * c];
}

function rotWorld(lx: number, lz: number, rot: number): [number, number] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [lx * c + lz * s, -lx * s + lz * c];
}

export function propColliders(p: Prop): Collider[] {
  const s = p.s ?? 1;
  const rot = p.rot ?? 0;
  const circle = (r: number): Collider[] => [{ type: 'circle', x: p.x, z: p.z, r: r * s }];
  const box = (hw: number, hd: number): Collider[] => [{ type: 'box', x: p.x, z: p.z, hw: hw * s, hd: hd * s, rot }];
  switch (p.kind) {
    case 'sakura':
      return circle(0.5);
    case 'pine':
      return circle(0.45);
    case 'deadTree':
      return circle(0.35);
    case 'bamboo':
      return circle(0.9);
    case 'rock':
      return circle(0.95);
    case 'pillar':
    case 'brokenPillar':
      return circle(0.8);
    case 'lantern':
      return circle(0.35);
    case 'brazier':
      return circle(0.45);
    case 'crystal':
      return circle(0.7);
    case 'statue':
      return circle(1.0);
    case 'well':
      return circle(1.0);
    case 'banner':
      return circle(0.12);
    case 'bridgePost':
      return circle(0.15);
    case 'torii': {
      const out: Collider[] = [];
      for (const side of [-1, 1]) {
        const [wx, wz] = rotWorld(side * 2.0 * s, 0, rot);
        out.push({ type: 'circle', x: p.x + wx, z: p.z + wz, r: 0.3 * s });
      }
      return out;
    }
    case 'shrine':
      return box(2.2, 1.8);
    case 'ruinWall':
      return box(2.5, 0.45);
    case 'anvil':
      return box(0.9, 0.45);
    case 'crate':
      return box(0.55, 0.55);
    case 'rankBoard':
      return box(1.6, 0.25);
    case 'fence':
      return box(0.08, 1.0);
    case 'bush':
      return [];
  }
}

const colliderCache = new WeakMap<MapDef, Collider[]>();

export function getColliders(map: MapDef): Collider[] {
  let c = colliderCache.get(map);
  if (!c) {
    c = map.props.filter((p) => p.solid).flatMap(propColliders);
    colliderCache.set(map, c);
  }
  return c;
}

/** Push a circle of `radius` at pos out of every collider. */
export function pushOut(pos: { x: number; z: number }, radius: number, colliders: readonly Collider[]): void {
  for (const c of colliders) {
    if (c.type === 'circle') {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-5) {
        pos.x = c.x + min;
        continue;
      }
      pos.x = c.x + (dx / d) * min;
      pos.z = c.z + (dz / d) * min;
    } else {
      const [lx, lz] = rotLocal(pos.x - c.x, pos.z - c.z, c.rot);
      const cx = Math.max(-c.hw, Math.min(c.hw, lx));
      const cz = Math.max(-c.hd, Math.min(c.hd, lz));
      let nx = lx;
      let nz = lz;
      if (cx === lx && cz === lz) {
        // centre inside the box: push out through the nearest face
        const px = c.hw - Math.abs(lx);
        const pz = c.hd - Math.abs(lz);
        if (px < pz) nx = Math.sign(lx || 1) * (c.hw + radius);
        else nz = Math.sign(lz || 1) * (c.hd + radius);
      } else {
        const dx = lx - cx;
        const dz = lz - cz;
        const d = Math.hypot(dx, dz);
        if (d >= radius) continue;
        nx = cx + (dx / d) * radius;
        nz = cz + (dz / d) * radius;
      }
      const [wx, wz] = rotWorld(nx, nz, c.rot);
      pos.x = c.x + wx;
      pos.z = c.z + wz;
    }
  }
}

function clampToShape(s: Shape, x: number, z: number, inset: number): [number, number] {
  if (s.type === 'circle') {
    const dx = x - s.x;
    const dz = z - s.z;
    const d = Math.hypot(dx, dz);
    const max = Math.max(0, s.r - inset);
    if (d <= max) return [x, z];
    return [s.x + (dx / d) * max, s.z + (dz / d) * max];
  }
  return [
    Math.max(s.x - s.hw + inset, Math.min(s.x + s.hw - inset, x)),
    Math.max(s.z - s.hd + inset, Math.min(s.z + s.hd - inset, z)),
  ];
}

/** Keep a point inside the union of floor shapes (used for walled maps). */
export function clampToFloor(map: MapDef, pos: { x: number; z: number }, inset = PLAYER_RADIUS): void {
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const s of map.floor) {
    const p = clampToShape(s, pos.x, pos.z, inset);
    const d = (p[0] - pos.x) ** 2 + (p[1] - pos.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
    if (d === 0) break;
  }
  if (best) {
    pos.x = best[0];
    pos.z = best[1];
  }
}

export interface Body {
  x: number;
  y: number;
  z: number;
  vy: number;
  onGround: boolean;
}

export interface StepResult {
  fell: boolean;
  landed: boolean;
}

/**
 * Advance a body by a horizontal velocity for dt seconds, resolving collisions against the map,
 * other fighters (`others`, circles of PLAYER_RADIUS) and gravity.
 */
export function stepBody(
  b: Body,
  vx: number,
  vz: number,
  dt: number,
  map: MapDef,
  others: readonly { x: number; z: number }[] = [],
): StepResult {
  b.x += vx * dt;
  b.z += vz * dt;

  if (b.y > -1) {
    pushOut(b, PLAYER_RADIUS, getColliders(map));
    for (const o of others) {
      const dx = b.x - o.x;
      const dz = b.z - o.z;
      const min = PLAYER_RADIUS * 2;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        b.x = o.x + (dx / d) * min;
        b.z = o.z + (dz / d) * min;
      }
    }
    if (map.edge === 'wall') clampToFloor(map, b);
  }

  const wasGround = b.onGround;
  b.vy -= GRAVITY * dt;
  b.y += b.vy * dt;
  const supported = map.edge === 'wall' || onFloor(map, b.x, b.z, -0.05);
  let landed = false;
  if (supported && b.y <= 0 && b.y > -0.75) {
    b.y = 0;
    b.vy = 0;
    b.onGround = true;
    landed = !wasGround;
  } else {
    b.onGround = false;
  }
  return { fell: b.y < FALL_DEATH_Y, landed };
}
