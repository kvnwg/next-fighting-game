/**
 * Map definitions shared by the server (spawns, collision, hazards, ring-outs) and the client
 * (which builds the visuals from the same data). All floors are flat at y = 0.
 */
import { seededRandom } from './math';

export type Shape =
  | { type: 'circle'; x: number; z: number; r: number }
  | { type: 'rect'; x: number; z: number; hw: number; hd: number };

export type PropKind =
  | 'sakura'
  | 'pine'
  | 'deadTree'
  | 'bamboo'
  | 'rock'
  | 'pillar'
  | 'brokenPillar'
  | 'lantern'
  | 'torii'
  | 'shrine'
  | 'brazier'
  | 'banner'
  | 'crystal'
  | 'ruinWall'
  | 'statue'
  | 'anvil'
  | 'crate'
  | 'fence'
  | 'bush'
  | 'bridgePost'
  | 'well'
  | 'rankBoard';

export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  rot?: number;
  s?: number;
  /** Blocks movement. Collider size is derived from kind and scale. */
  solid?: boolean;
}

export interface Hazard {
  type: 'lava';
  shape: Shape;
  /**
   * Damage each time it catches you. A touch burns once and throws you back out onto the stone:
   * it takes being knocked in again and again to die in it.
   */
  burn: number;
}

/** How far below the floor a lava pool's surface lies (fighters wade in that deep). */
export const LAVA_SURFACE = -0.34;

export type Weather = 'petals' | 'snow' | 'embers' | 'rain' | 'fireflies' | 'leaves' | 'pollen';
export type GroundTex = 'grass' | 'stone' | 'snow' | 'obsidian' | 'planks' | 'moss' | 'tiles' | 'sand' | 'path';

export interface Decal {
  shape: Shape;
  tex: GroundTex;
}

export interface MapTheme {
  skyTop: string;
  /** Band of colour just above the horizon (defaults to a blend of top and bottom). */
  skyMid?: string;
  skyBottom: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  ground: GroundTex;
  /** Colour of walls (wall maps) or cliff sides (void maps). */
  edge: string;
  sun: string;
  sunIntensity: number;
  sunDir: [number, number, number];
  ambient: string;
  ambientIntensity: number;
  weather: Weather | null;
  /** Show a moon instead of a sun disc. */
  night?: boolean;
  /** Low evening light: lanterns are lit. */
  dusk?: boolean;
  /** Where the sun/moon disc sits in the sky, if not along sunDir (e.g. low behind a gate). */
  sunDisc?: [number, number, number];
  /** Colour of the nearest mountains before haze; farther ranges fade toward the fog colour. */
  scenery?: string;
  /** Void maps: what is far below. */
  below?: 'clouds' | 'abyss';
}

export interface DummySpawn {
  x: number;
  z: number;
  yaw: number;
  kind: 'passive' | 'sparring';
}

export interface MapDef {
  id: string;
  name: string;
  /** kanji name for the match intro */
  jp: string;
  description: string;
  kind: 'lobby' | 'arena';
  /** Walkable floor (union of shapes). */
  floor: Shape[];
  /** 'wall': invisible walls keep you on the floor. 'void': walk off the edge and you fall. */
  edge: 'wall' | 'void';
  spawns: { x: number; z: number; yaw: number }[];
  props: Prop[];
  decals: Decal[];
  hazards: Hazard[];
  theme: MapTheme;
  safeZone?: { x: number; z: number; r: number };
  dummies?: DummySpawn[];
  /** dueling rings (lobby): sealed while two players fight in one */
  rings?: { x: number; z: number; r: number }[];
}

const PI = Math.PI;

function ring(kind: PropKind, count: number, r: number, offset = 0, extra: Partial<Prop> = {}): Prop[] {
  const out: Prop[] = [];
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * PI * 2;
    out.push({ kind, x: Math.sin(a) * r, z: Math.cos(a) * r, rot: a + PI, ...extra });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------------------------

const LOBBY_HALF = 70;
const SAFE_R = 15;
const YARD = { x: 30, z: 0, hw: 7, hd: 7 };
/** The lobby's dueling rings: challenge someone while you're both inside one to fight there. */
export const DUEL_RINGS = [
  { x: -32, z: 18, r: 7 },
  { x: -26, z: -30, r: 7 },
  { x: 18, z: 36, r: 7 },
  { x: 22, z: -36, r: 6 },
  { x: 46, z: 20, r: 6 },
  { x: -46, z: -12, r: 6 },
];

function inYard(x: number, z: number, pad: number): boolean {
  return Math.abs(x - YARD.x) < YARD.hw + pad && Math.abs(z - YARD.z) < YARD.hd + pad;
}

function nearPath(x: number, z: number, pad: number): boolean {
  return Math.abs(x) < 2.5 + pad || Math.abs(z) < 2.5 + pad;
}

function buildLobby(): MapDef {
  const rand = seededRandom(1337);
  const props: Prop[] = [];

  // Plaza (safe zone)
  props.push({ kind: 'statue', x: 0, z: 0, s: 1.2, solid: true });
  props.push({ kind: 'shrine', x: 0, z: -11.5, s: 1, rot: 0, solid: true });
  props.push({ kind: 'rankBoard', x: -7.5, z: -9, rot: PI * 0.2, solid: true });
  props.push(...ring('lantern', 8, 12.5, PI / 8, { solid: true }));
  props.push({ kind: 'sakura', x: 9, z: 9, s: 1.3, solid: true });
  props.push({ kind: 'sakura', x: -9, z: 9, s: 1.2, solid: true });
  props.push({ kind: 'sakura', x: 10, z: -8, s: 1.1, solid: true });
  props.push({ kind: 'well', x: -10, z: 2, s: 1, solid: true });
  props.push({ kind: 'banner', x: 4, z: 14.6, rot: PI });
  props.push({ kind: 'banner', x: -4, z: 14.6, rot: PI });
  for (const a of [0, PI / 2, PI, -PI / 2]) {
    props.push({ kind: 'torii', x: Math.sin(a) * 16.5, z: Math.cos(a) * 16.5, rot: a, s: 1.1, solid: true });
  }

  // Training yard
  for (let i = -3; i <= 3; i++) {
    props.push({ kind: 'fence', x: YARD.x + i * 2, z: YARD.z - YARD.hd, rot: PI / 2 });
    props.push({ kind: 'fence', x: YARD.x + i * 2, z: YARD.z + YARD.hd, rot: PI / 2 });
    if (Math.abs(i) > 1) props.push({ kind: 'fence', x: YARD.x + YARD.hw, z: YARD.z + i * 2, rot: 0 });
  }
  props.push({ kind: 'crate', x: YARD.x + 5, z: YARD.z - 5, s: 1, solid: true });
  props.push({ kind: 'crate', x: YARD.x + 5.9, z: YARD.z - 4.2, s: 0.8, rot: 0.4, solid: true });
  props.push({ kind: 'banner', x: YARD.x - 6.6, z: YARD.z - 6.6, rot: PI / 2 });

  // Dueling rings: lanterns around each
  for (const r of DUEL_RINGS) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4;
      props.push({ kind: 'lantern', x: r.x + Math.sin(a) * (r.r + 0.8), z: r.z + Math.cos(a) * (r.r + 0.8), solid: true });
    }
  }

  const clear = (x: number, z: number, pad: number) => {
    if (Math.hypot(x, z) < SAFE_R + 4 + pad) return false;
    if (inYard(x, z, 2 + pad)) return false;
    if (nearPath(x, z, pad)) return false;
    for (const r of DUEL_RINGS) if (Math.hypot(x - r.x, z - r.z) < r.r + 2 + pad) return false;
    for (const p of props) if (p.solid && Math.hypot(x - p.x, z - p.z) < 3 + pad) return false;
    return true;
  };

  // Scattered forest
  let tries = 0;
  for (let placed = 0; placed < 70 && tries < 2000; tries++) {
    const x = (rand() * 2 - 1) * (LOBBY_HALF - 3);
    const z = (rand() * 2 - 1) * (LOBBY_HALF - 3);
    if (!clear(x, z, 0)) continue;
    const edgeBias = Math.max(Math.abs(x), Math.abs(z)) / LOBBY_HALF;
    if (rand() > 0.35 + edgeBias) continue;
    const kind: PropKind = rand() < 0.15 ? 'sakura' : 'pine';
    props.push({ kind, x, z, s: 0.85 + rand() * 0.6, rot: rand() * PI * 2, solid: true });
    placed++;
  }
  tries = 0;
  for (let placed = 0; placed < 26 && tries < 1000; tries++) {
    const x = (rand() * 2 - 1) * (LOBBY_HALF - 3);
    const z = (rand() * 2 - 1) * (LOBBY_HALF - 3);
    if (!clear(x, z, -1)) continue;
    props.push({ kind: 'rock', x, z, s: 0.6 + rand() * 1.1, rot: rand() * PI * 2, solid: true });
    placed++;
  }
  tries = 0;
  for (let placed = 0; placed < 40 && tries < 1000; tries++) {
    const x = (rand() * 2 - 1) * (LOBBY_HALF - 2);
    const z = (rand() * 2 - 1) * (LOBBY_HALF - 2);
    if (!clear(x, z, -2)) continue;
    props.push({ kind: 'bush', x, z, s: 0.7 + rand() * 0.6, rot: rand() * PI * 2 });
    placed++;
  }

  const decals: Decal[] = [
    { shape: { type: 'circle', x: 0, z: 0, r: SAFE_R }, tex: 'tiles' },
    { shape: { type: 'rect', x: 0, z: (SAFE_R + LOBBY_HALF) / 2, hw: 2, hd: (LOBBY_HALF - SAFE_R) / 2 }, tex: 'path' },
    { shape: { type: 'rect', x: 0, z: -(SAFE_R + LOBBY_HALF) / 2, hw: 2, hd: (LOBBY_HALF - SAFE_R) / 2 }, tex: 'path' },
    { shape: { type: 'rect', x: (SAFE_R + LOBBY_HALF) / 2, z: 0, hw: (LOBBY_HALF - SAFE_R) / 2, hd: 2 }, tex: 'path' },
    { shape: { type: 'rect', x: -(SAFE_R + LOBBY_HALF) / 2, z: 0, hw: (LOBBY_HALF - SAFE_R) / 2, hd: 2 }, tex: 'path' },
    { shape: { type: 'rect', x: YARD.x, z: YARD.z, hw: YARD.hw, hd: YARD.hd }, tex: 'sand' },
    ...DUEL_RINGS.map((r) => ({ shape: { type: 'circle' as const, x: r.x, z: r.z, r: r.r }, tex: 'sand' as const })),
  ];

  const spawns = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2;
    spawns.push({ x: Math.sin(a) * 6.5, z: Math.cos(a) * 6.5, yaw: a });
  }

  return {
    id: 'lobby',
    name: 'Proving Grounds',
    jp: '修練場',
    description: 'Wander, spar and settle scores. The shrine plaza is a safe zone.',
    kind: 'lobby',
    floor: [{ type: 'rect', x: 0, z: 0, hw: LOBBY_HALF, hd: LOBBY_HALF }],
    edge: 'wall',
    spawns,
    props,
    decals,
    hazards: [],
    safeZone: { x: 0, z: 0, r: SAFE_R },
    rings: DUEL_RINGS,
    dummies: [
      { x: YARD.x - 1, z: YARD.z - 3, yaw: -PI / 2, kind: 'passive' },
      { x: YARD.x - 1, z: YARD.z + 3, yaw: -PI / 2, kind: 'sparring' },
    ],
    theme: {
      skyTop: '#5d9be8',
      skyBottom: '#cfe8ff',
      fog: '#bfdcf5',
      fogNear: 40,
      fogFar: 120,
      ground: 'grass',
      edge: '#6d7a6a',
      sun: '#fff1d6',
      sunIntensity: 2.4,
      sunDir: [0.5, 1, 0.35],
      ambient: '#b4c8e8',
      ambientIntensity: 1.1,
      weather: 'pollen',
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Arenas
// ---------------------------------------------------------------------------------------------

const sakura: MapDef = {
  id: 'sakura',
  name: 'Sakura Courtyard',
  jp: '桜庭',
  description: 'A temple courtyard in full bloom. Lanterns break up the sightlines.',
  kind: 'arena',
  floor: [{ type: 'circle', x: 0, z: 0, r: 16 }],
  edge: 'wall',
  spawns: [
    { x: 0, z: -8, yaw: 0 },
    { x: 0, z: 8, yaw: PI },
  ],
  props: [
    ...ring('sakura', 4, 12.8, PI / 4, { solid: true, s: 1.35 }),
    ...ring('lantern', 4, 9.5, PI / 2, { solid: true }),
    { kind: 'torii', x: 0, z: -19, rot: 0, s: 1.4 },
    { kind: 'shrine', x: 0, z: -25, rot: 0, s: 1.4 },
    { kind: 'sakura', x: 16, z: -18, s: 1.6 },
    { kind: 'sakura', x: -18, z: -14, s: 1.5 },
    { kind: 'sakura', x: -15, z: 19, s: 1.7 },
    { kind: 'sakura', x: 19, z: 14, s: 1.5 },
  ],
  decals: [
    { shape: { type: 'circle', x: 0, z: 0, r: 6 }, tex: 'sand' },
    { shape: { type: 'rect', x: 0, z: -11, hw: 1.8, hd: 5 }, tex: 'stone' },
  ],
  hazards: [],
  theme: {
    skyTop: '#f7a6b8',
    skyBottom: '#ffe3cf',
    fog: '#ffd9d9',
    fogNear: 25,
    fogFar: 70,
    ground: 'tiles',
    edge: '#9a8f86',
    sun: '#ffe6cc',
    sunIntensity: 2.3,
    sunDir: [-0.6, 1, 0.4],
    ambient: '#ffd0dc',
    ambientIntensity: 1.1,
    weather: 'petals',
  },
};

const bamboo: MapDef = {
  id: 'bamboo',
  name: 'Moonlit Grove',
  jp: '月下竹林',
  description: 'A moonlit clearing walled in by dense bamboo. Nothing stands between you.',
  kind: 'arena',
  floor: [{ type: 'rect', x: 0, z: 0, hw: 17, hd: 17 }],
  edge: 'wall',
  spawns: [
    { x: 0, z: -10, yaw: 0 },
    { x: 0, z: 10, yaw: PI },
  ],
  // the floor is a clear clearing (stalks in the ring kept stealing the camera); the forest stands
  // beyond the wall, and only lanterns and two boulders mark the edge
  props: [
    { kind: 'lantern', x: 15.5, z: 0, solid: true },
    { kind: 'lantern', x: -15.5, z: 0, solid: true },
    { kind: 'rock', x: 15, z: 15, s: 1.4, solid: true },
    { kind: 'rock', x: -15, z: -14.5, s: 1.2, solid: true },
  ],
  decals: [{ shape: { type: 'rect', x: 0, z: 0, hw: 1.6, hd: 17 }, tex: 'stone' }],
  hazards: [],
  theme: {
    skyTop: '#121a46',
    skyBottom: '#34407a',
    fog: '#25305a',
    fogNear: 16,
    fogFar: 55,
    ground: 'moss',
    edge: '#2f5a33',
    sun: '#b4c6ff',
    sunIntensity: 2.0,
    sunDir: [0.4, 1, -0.6],
    ambient: '#7a8ac8',
    ambientIntensity: 1.5,
    weather: 'fireflies',
    night: true,
  },
};

const summit: MapDef = {
  id: 'summit',
  name: 'Frozen Summit',
  jp: '氷峰',
  description: 'A wind-scoured peak above the clouds. One wrong step and it is a long way down.',
  kind: 'arena',
  floor: [{ type: 'circle', x: 0, z: 0, r: 15 }],
  edge: 'void',
  spawns: [
    { x: 0, z: -7.5, yaw: 0 },
    { x: 0, z: 7.5, yaw: PI },
  ],
  props: [
    { kind: 'crystal', x: 7, z: 2.5, s: 1.2, solid: true },
    { kind: 'crystal', x: -6.5, z: -3, s: 1.0, solid: true },
    { kind: 'crystal', x: -2, z: 10.5, s: 0.8, solid: true },
    { kind: 'deadTree', x: 10.5, z: -8, s: 1.1, solid: true },
    { kind: 'deadTree', x: -11, z: 7, s: 1.0, solid: true },
    { kind: 'rock', x: 4, z: -11.5, s: 1.0, solid: true },
    { kind: 'rock', x: -12, z: -4, s: 0.8, solid: true },
  ],
  decals: [{ shape: { type: 'circle', x: 0, z: 0, r: 5 }, tex: 'stone' }],
  hazards: [],
  theme: {
    skyTop: '#7fa8d6',
    skyBottom: '#e6f0fa',
    fog: '#dfe9f5',
    fogNear: 22,
    fogFar: 80,
    ground: 'snow',
    edge: '#8592a3',
    sun: '#ffffff',
    sunIntensity: 2.2,
    sunDir: [0.3, 1, 0.6],
    ambient: '#c4d6f0',
    ambientIntensity: 1.2,
    weather: 'snow',
    below: 'clouds',
  },
};

const forge: MapDef = {
  id: 'forge',
  name: 'Molten Forge',
  jp: '鍛冶場',
  description: 'A dwarven foundry. Lava pools burn anyone who strays into the corners.',
  kind: 'arena',
  floor: [{ type: 'rect', x: 0, z: 0, hw: 15, hd: 15 }],
  edge: 'wall',
  spawns: [
    { x: 0, z: -9, yaw: 0 },
    { x: 0, z: 9, yaw: PI },
  ],
  props: [
    { kind: 'pillar', x: 6, z: 0, s: 1.1, solid: true },
    { kind: 'pillar', x: -6, z: 0, s: 1.1, solid: true },
    { kind: 'anvil', x: 0, z: 0, rot: PI / 2, solid: true },
    { kind: 'brazier', x: 13.5, z: 5, solid: true },
    { kind: 'brazier', x: -13.5, z: 5, solid: true },
    { kind: 'brazier', x: 13.5, z: -5, solid: true },
    { kind: 'brazier', x: -13.5, z: -5, solid: true },
    { kind: 'crate', x: 4, z: 13.3, s: 1, solid: true },
    { kind: 'crate', x: -4.5, z: -13.4, s: 1, rot: 0.3, solid: true },
  ],
  decals: [{ shape: { type: 'rect', x: 0, z: 0, hw: 3, hd: 15 }, tex: 'stone' }],
  hazards: [
    { type: 'lava', shape: { type: 'circle', x: 10.5, z: 10.5, r: 3.4 }, burn: 16 },
    { type: 'lava', shape: { type: 'circle', x: -10.5, z: 10.5, r: 3.4 }, burn: 16 },
    { type: 'lava', shape: { type: 'circle', x: 10.5, z: -10.5, r: 3.4 }, burn: 16 },
    { type: 'lava', shape: { type: 'circle', x: -10.5, z: -10.5, r: 3.4 }, burn: 16 },
  ],
  theme: {
    skyTop: '#1a0a08',
    skyBottom: '#4a1a0e',
    fog: '#2a0f0a',
    fogNear: 18,
    fogFar: 55,
    ground: 'obsidian',
    edge: '#3a2c2a',
    sun: '#ffb27a',
    sunIntensity: 1.4,
    sunDir: [0.2, 1, 0.3],
    ambient: '#b0604a',
    ambientIntensity: 1.35,
    weather: 'embers',
    night: true,
  },
};

const bridge: MapDef = {
  id: 'bridge',
  name: 'Sky Bridge',
  jp: '天橋',
  description: 'A narrow span between two peaks at dusk. Fight on the platform or risk the edge.',
  kind: 'arena',
  floor: [
    { type: 'rect', x: 0, z: 0, hw: 3.2, hd: 22 },
    { type: 'circle', x: 0, z: 0, r: 7 },
  ],
  edge: 'void',
  spawns: [
    { x: 0, z: -11, yaw: 0 },
    { x: 0, z: 11, yaw: PI },
  ],
  props: [
    ...[-20, -16, -12, 12, 16, 20].flatMap((z) => [
      { kind: 'bridgePost' as const, x: 3.05, z },
      { kind: 'bridgePost' as const, x: -3.05, z },
    ]),
    ...ring('lantern', 4, 6.4, PI / 4, { solid: true }),
    { kind: 'torii', x: 0, z: -21.3, rot: 0, s: 1.25, solid: true },
    { kind: 'torii', x: 0, z: 21.3, rot: PI, s: 1.25, solid: true },
  ],
  decals: [{ shape: { type: 'circle', x: 0, z: 0, r: 3 }, tex: 'stone' }],
  hazards: [],
  theme: {
    skyTop: '#2e2c58',
    skyMid: '#c8607a',
    skyBottom: '#f7a35c',
    fog: '#eb9e74',
    fogNear: 45,
    fogFar: 170,
    ground: 'planks',
    edge: '#5c3b2e',
    sun: '#ffb070',
    sunIntensity: 2.0,
    sunDir: [-0.2, 0.45, 1],
    // low behind the far torii so the gate reads as a silhouette against the glow
    sunDisc: [0, 0.035, 1],
    ambient: '#a88ac4',
    ambientIntensity: 1.5,
    weather: 'petals',
    below: 'clouds',
    dusk: true,
    scenery: '#3a2848',
  },
};

const ruins: MapDef = {
  id: 'ruins',
  name: 'Sunken Ruins',
  jp: '水没寺',
  description: 'A drowned temple in the rain. Broken pillars and walls make for tight corners.',
  kind: 'arena',
  floor: [{ type: 'circle', x: 0, z: 0, r: 17 }],
  edge: 'wall',
  spawns: [
    { x: 0, z: -8, yaw: 0 },
    { x: 0, z: 8, yaw: PI },
  ],
  props: [
    ...ring('brokenPillar', 6, 11, 0, { solid: true, s: 1.1 }).map((p, i) => (i % 2 ? { ...p, kind: 'pillar' as const } : p)),
    { kind: 'ruinWall', x: 5.5, z: -4.5, rot: 0.6, s: 0.8, solid: true },
    { kind: 'ruinWall', x: -5.5, z: 4.5, rot: 0.6, s: 0.8, solid: true },
    { kind: 'statue', x: 0, z: 15.2, s: 1.3, rot: PI, solid: true },
    { kind: 'statue', x: 0, z: -15.2, s: 1.3, rot: 0, solid: true },
  ],
  decals: [
    { shape: { type: 'circle', x: 7, z: 7, r: 3.5 }, tex: 'moss' },
    { shape: { type: 'circle', x: -8, z: -6, r: 3 }, tex: 'moss' },
    { shape: { type: 'circle', x: 0, z: 0, r: 4 }, tex: 'tiles' },
  ],
  hazards: [],
  theme: {
    skyTop: '#3d4a52',
    skyBottom: '#8a9aa3',
    fog: '#6f7f88',
    fogNear: 16,
    fogFar: 55,
    ground: 'stone',
    edge: '#59625e',
    sun: '#cfe0ea',
    sunIntensity: 1.3,
    sunDir: [0.5, 1, -0.3],
    ambient: '#8aa0ad',
    ambientIntensity: 1.1,
    weather: 'rain',
  },
};

export const LOBBY_MAP: MapDef = buildLobby();

export const ARENA_MAPS: MapDef[] = [sakura, bamboo, summit, forge, bridge, ruins];

export const MAPS: Record<string, MapDef> = Object.fromEntries(
  [LOBBY_MAP, ...ARENA_MAPS].map((m) => [m.id, m]),
);

export function shapeContains(s: Shape, x: number, z: number, pad = 0): boolean {
  if (s.type === 'circle') return Math.hypot(x - s.x, z - s.z) <= s.r + pad;
  return Math.abs(x - s.x) <= s.hw + pad && Math.abs(z - s.z) <= s.hd + pad;
}

export function onFloor(map: MapDef, x: number, z: number, pad = 0): boolean {
  return map.floor.some((s) => shapeContains(s, x, z, pad));
}

export function inSafeZone(map: MapDef, x: number, z: number): boolean {
  const s = map.safeZone;
  return !!s && Math.hypot(x - s.x, z - s.z) <= s.r;
}

export function hazardAt(map: MapDef, x: number, z: number): Hazard | null {
  for (const h of map.hazards) if (shapeContains(h.shape, x, z)) return h;
  return null;
}
