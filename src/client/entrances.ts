/**
 * Ring entrances (see docs/ring-intros.md): before round one the camera films each fighter's
 * entrance in turn, the opponent first, then you, then swings round behind your shoulder. Each
 * entrance is ENTRANCE_MS long and has three beats that the camera cuts on: arrival (s 0–0.35),
 * signature (0.35–0.7) and challenge (0.7–1), then the camera holds on them a moment
 * (ENTRANCE_HOLD) under their name card. The body's choreography is the weapon style's
 * `entrance` move; this file holds the camera, the sound cues and the name card.
 */
import * as THREE from 'three';
import type { CharacterId } from '../shared/characters';
import { MATCH } from '../shared/config';
import { forward } from '../shared/math';
import type { Sfx } from './audio';
import type { CamPose, Shot, ShotSubject } from './camera';
import { ENTRANCE_MS } from './render/anim/animator';

/** A point around a fighter: `fwd` in front of them, `left` to their left, `up` above the ground. */
type Rel = [fwd: number, left: number, up: number];

interface EntranceShot {
  from: Rel;
  to: Rel;
  /** where the camera looks at the start and the end of the shot */
  look: [Rel, Rel];
  fov: [number, number];
  /** bend the path toward this point (orbits) */
  via?: Rel;
}

export interface Entrance {
  /** one shot per beat */
  shots: [EntranceShot, EntranceShot, EntranceShot];
  sfx: { s: number; sound: Sfx; vol?: number }[];
  /** the line they say as the name card comes up */
  line: string;
  /** a short epithet under the name */
  title: string;
  /** stretches of s where the weapon leaves a trail */
  trails: [number, number][];
}

/** Where the three beats start, along the entrance. */
export const BEATS = [0, 0.35, 0.7];
/** The name card comes up early in the last beat. */
export const CARD_AT = 0.6;
/** After each entrance the camera holds on the fighter a while longer, under their name card (ms). */
export const ENTRANCE_HOLD = 1100;

export const ENTRANCES: Record<CharacterId, Entrance> = {
  ronin: {
    title: 'The Nameless Blade',
    trails: [[0.36, 0.64]],
    line: 'Your name won’t be remembered. Neither will mine.',
    shots: [
      // ground level beside the sandals as he walks in, a slow dolly
      { from: [1.3, 1.7, 0.28], to: [0.8, 1.3, 0.32], look: [[0, 0.2, 0.35], [0.1, 0.1, 0.45]], fov: [40, 38] },
      // wide at his side for the kata, drifting round to the front
      { from: [0.6, 3.4, 1.3], via: [2.2, 3.0, 1.3], to: [2.6, 2.0, 1.3], look: [[0.6, 0, 1.0], [0.4, 0, 1.1]], fov: [44, 42] },
      // front medium, pushing in to the eyes under the brim
      { from: [3.2, 0.3, 1.5], to: [2.2, 0.2, 1.55], look: [[0, 0, 1.35], [0, 0, 1.5]], fov: [40, 34] },
    ],
    sfx: [
      { s: 0, sound: 'wind', vol: 0.8 },
      { s: 0.34, sound: 'tink' },
      { s: 0.37, sound: 'draw' },
      { s: 0.38, sound: 'taiko' },
      { s: 0.48, sound: 'whoosh' },
      { s: 0.57, sound: 'whoosh', vol: 0.8 },
    ],
  },
  juggernaut: {
    title: 'The Unmoving Wall',
    trails: [[0.7, 0.8]],
    line: 'Move me.',
    shots: [
      // lens almost on the floor as the sabatons come down
      { from: [2.3, 1.5, 0.15], to: [2.0, 1.2, 0.18], look: [[0, 0.2, 0.5], [0, 0.1, 0.9]], fov: [48, 46] },
      // wide and rising with him as he vaults over the planted hammer
      { from: [3.8, -2.2, 1.3], to: [3.3, -1.7, 1.9], look: [[0, 0, 1.3], [0, 0, 1.9]], fov: [50, 50] },
      // low hero shot, a little off centre, wide enough for the whirl overhead
      { from: [4.6, 1.1, 0.5], to: [4.0, 0.9, 0.6], look: [[0, 0, 1.6], [0, 0, 1.5]], fov: [50, 48] },
    ],
    sfx: [
      { s: 0, sound: 'rumble' },
      { s: 0.1, sound: 'stomp' },
      { s: 0.24, sound: 'stomp' },
      { s: 0.45, sound: 'whoosh' },
      { s: 0.7, sound: 'whoosh' },
      { s: 0.78, sound: 'gong' },
    ],
  },
  duelist: {
    title: 'The Green Flourish',
    trails: [[0.22, 0.36], [0.56, 0.66], [0.76, 0.82]],
    line: 'Shall we dance?',
    shots: [
      // beside him as he swaggers, cape flick
      { from: [1.2, 2.6, 1.4], to: [2.0, 2.2, 1.45], look: [[0, 0, 1.3], [0, 0, 1.35]], fov: [40, 38] },
      // a slow orbit round the salute and the thrusts
      { from: [2.0, -1.2, 1.5], via: [2.8, 0, 1.65], to: [2.0, 1.2, 1.5], look: [[0, 0, 1.4], [0.3, 0, 1.45]], fov: [40, 38] },
      // eye level from the front: the point comes down the lens
      { from: [2.8, -0.2, 1.65], to: [2.3, -0.1, 1.65], look: [[0, 0, 1.55], [0, 0, 1.6]], fov: [40, 38] },
    ],
    sfx: [
      { s: 0, sound: 'pluck' },
      { s: 0.23, sound: 'whoosh', vol: 0.6 },
      { s: 0.3, sound: 'whoosh', vol: 0.6 },
      { s: 0.42, sound: 'shing' },
      { s: 0.57, sound: 'whoosh', vol: 0.8 },
      { s: 0.62, sound: 'whoosh', vol: 0.8 },
      { s: 0.7, sound: 'whoosh', vol: 0.5 },
      { s: 0.82, sound: 'chime' },
    ],
  },
  lancer: {
    title: 'Storm of the North',
    trails: [[0.46, 0.66]],
    line: 'Stand, or be struck.',
    shots: [
      // wide under the storm as the bolt lands
      { from: [6.0, -2.0, 2.6], to: [4.8, -1.5, 2.0], look: [[0, 0, 1.0], [0, 0, 1.1]], fov: [52, 48] },
      // swinging round the front while the spear twirls
      { from: [1.8, -2.6, 1.5], via: [3.6, 0, 1.7], to: [1.8, 2.6, 1.5], look: [[0, 0, 1.4], [0, 0, 1.5]], fov: [42, 42] },
      // low hero shot for the slam
      { from: [3.1, 0.3, 0.35], to: [2.6, 0.25, 0.4], look: [[0, 0, 1.5], [0, 0, 1.55]], fov: [46, 44] },
    ],
    sfx: [
      { s: 0.02, sound: 'thunder' },
      { s: 0.4, sound: 'zap' },
      { s: 0.55, sound: 'zap' },
      { s: 0.8, sound: 'thunder', vol: 0.8 },
    ],
  },
  shade: {
    title: 'The Unseen',
    trails: [[0.4, 0.62]],
    line: 'You never heard me.',
    shots: [
      // straight down on the spot he drops onto
      { from: [1.0, 0, 6.0], to: [0.9, 0, 4.6], look: [[0, 0, 0], [0, 0, 0.3]], fov: [50, 48] },
      // low and wide as he springs up spinning and cuts the X, sliding round his front
      { from: [2.4, -1.4, 0.7], via: [2.8, 0, 0.9], to: [2.2, 1.0, 1.1], look: [[0, 0, 0.8], [0, 0, 1.2]], fov: [44, 40] },
      // tight on the hood, a slow push
      { from: [2.0, 0.15, 1.6], to: [1.5, 0.1, 1.6], look: [[0, 0, 1.5], [0, 0, 1.55]], fov: [38, 34] },
    ],
    sfx: [
      { s: 0, sound: 'whisper' },
      { s: 0.28, sound: 'stomp', vol: 0.5 },
      // a metal grind as he springs up, swelling out as the knives come out
      { s: 0.36, sound: 'scrape' },
      { s: 0.42, sound: 'shing' },
      { s: 0.46, sound: 'shing' },
      { s: 0.53, sound: 'whoosh' },
      { s: 0.81, sound: 'shing', vol: 0.7 },
    ],
  },
  reaper: {
    title: 'Hollow Harvest',
    trails: [[0.36, 0.58], [0.68, 0.75]],
    line: 'Shhh…',
    shots: [
      // a crane coming down over the fog
      { from: [4.0, 2.0, 4.6], to: [3.0, 1.5, 2.2], look: [[0, 0, 0.6], [0, 0, 0.9]], fov: [48, 46] },
      // wide across the front for the whirl
      { from: [3.4, 2.2, 1.4], via: [3.8, 0.4, 1.3], to: [3.0, -1.2, 1.2], look: [[0, 0, 1.0], [0, 0, 1.1]], fov: [48, 46] },
      // low from the front as the sickle goes in, pushing in on the tilting head
      { from: [2.8, -0.5, 0.6], to: [2.1, -0.3, 0.8], look: [[0, 0, 0.9], [0, 0, 1.0]], fov: [46, 42] },
    ],
    sfx: [
      { s: 0, sound: 'whisper' },
      { s: 0.1, sound: 'chime', vol: 0.5 },
      { s: 0.24, sound: 'scrape' },
      { s: 0.37, sound: 'whoosh' },
      { s: 0.48, sound: 'whoosh', vol: 0.8 },
      { s: 0.745, sound: 'stomp' },
    ],
  },
  monk: {
    title: 'The Last Teacher',
    trails: [[0.77, 0.83]],
    line: 'I have outlived braver men. Come.',
    shots: [
      // low on the slow steps
      { from: [1.6, -1.6, 0.25], to: [1.8, -0.8, 0.3], look: [[0, 0, 0.3], [0, 0, 0.45]], fov: [40, 38] },
      // a slow orbit ending close on the eyes
      { from: [1.8, 1.4, 1.2], via: [1.9, 0.5, 1.4], to: [1.2, 0, 1.5], look: [[0, 0, 1.1], [0, 0, 1.45]], fov: [34, 28] },
      // wide, low, centred for the palm
      { from: [4.2, 0, 0.5], to: [3.6, 0, 0.5], look: [[0, 0, 1.1], [0, 0, 1.15]], fov: [48, 46] },
    ],
    sfx: [
      { s: 0, sound: 'bell' },
      { s: 0.12, sound: 'chime', vol: 0.4 },
      { s: 0.26, sound: 'chime', vol: 0.4 },
      { s: 0.45, sound: 'breath' },
      { s: 0.8, sound: 'thump' },
      { s: 0.84, sound: 'bell', vol: 0.6 },
    ],
  },
  paladin: {
    title: 'Oath of Bronze',
    trails: [[0.45, 0.5], [0.63, 0.84]],
    line: 'By oath, I stand.',
    shots: [
      // low beside the marching boots
      { from: [0.8, 1.8, 0.3], to: [1.6, 1.6, 0.35], look: [[0, 0, 0.4], [0, 0, 0.55]], fov: [42, 40] },
      // low and wide in front: the sword raised to the light, driven down, the oath
      { from: [3.2, -0.9, 0.6], to: [2.6, -0.6, 0.8], look: [[0, 0, 1.5], [0, 0, 1.0]], fov: [46, 42] },
      // wide hero shot, low, for the clash on the shield
      { from: [4.0, -0.6, 0.4], to: [3.4, -0.5, 0.45], look: [[0, 0, 1.3], [0, 0, 1.35]], fov: [46, 44] },
    ],
    sfx: [
      { s: 0, sound: 'fanfare' },
      { s: 0.1, sound: 'stomp', vol: 0.6 },
      { s: 0.22, sound: 'stomp', vol: 0.6 },
      { s: 0.42, sound: 'chime' },
      { s: 0.5, sound: 'stomp' },
      { s: 0.5, sound: 'thump' },
      { s: 0.66, sound: 'whoosh', vol: 0.7 },
      { s: 0.77, sound: 'clang' },
      { s: 0.83, sound: 'clang' },
    ],
  },
};

/** A point around the fighter in world space; distances grow with the fighter's size. */
function place(f: ShotSubject, r: Rel): THREE.Vector3 {
  const fw = forward(f.yaw);
  const k = Math.max(1, f.scale);
  // their left, looking along their facing
  const lx = Math.cos(f.yaw);
  const lz = -Math.sin(f.yaw);
  return new THREE.Vector3(f.pos.x + (fw.x * r[0] + lx * r[1]) * k, f.pos.y + r[2] * f.scale, f.pos.z + (fw.z * r[0] + lz * r[1]) * k);
}

/** The three shots of one fighter's entrance. */
export function entranceShots(id: CharacterId, f: ShotSubject): Shot[] {
  const e = ENTRANCES[id];
  const chest = place(f, [0, 0, 1.2]);
  const shots: Shot[] = e.shots.map((s, i) => {
    const len = ((i < 2 ? BEATS[i + 1] : 1) - BEATS[i]) * ENTRANCE_MS;
    const pose = (at: Rel, look: Rel, fov: number): CamPose => ({ pos: place(f, at), look: place(f, look), fov, subject: chest });
    return {
      duration: len / 1000,
      from: pose(s.from, s.look[0], s.fov[0]),
      to: pose(s.to, s.look[1], s.fov[1]),
      via: s.via ? place(f, s.via) : undefined,
    };
  });
  // and the hold: easing on in a little closer while the name card is up
  const last = shots[shots.length - 1].to;
  const closer = last.pos.clone().lerp(last.look, 0.1);
  shots.push({ duration: ENTRANCE_HOLD / 1000, from: { ...last }, to: { ...last, pos: closer, fov: last.fov - 2 } });
  return shots;
}

/** How the intro is laid out in time (ms from its start). */
export const INTRO = {
  /** a wide establishing shot of the arena under the versus card */
  establish: 1400,
  /** the swing from your entrance to behind your shoulder: the rest of the intro */
  get swing(): number {
    return Math.max(600, MATCH.introTime - this.establish - 2 * (ENTRANCE_MS + ENTRANCE_HOLD));
  },
};

/** When the opponent's and your entrances start, in ms from the start of the intro. */
export function entranceStarts(): { op: number; me: number } {
  return { op: INTRO.establish, me: INTRO.establish + ENTRANCE_MS + ENTRANCE_HOLD };
}

/**
 * The whole intro: a wide crane over the arena, the opponent's entrance, yours, then a swing round
 * your left that settles on `end`, the follow camera's resting pose.
 */
export function introSequence(me: ShotSubject & { char: CharacterId }, op: ShotSubject & { char: CharacterId }, end: CamPose): Shot[] {
  const mid = new THREE.Vector3().addVectors(me.pos, op.pos).multiplyScalar(0.5);
  const dx = op.pos.x - me.pos.x;
  const dz = op.pos.z - me.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  // from behind and above your spawn, down the length of the ring (a crane to the side would be
  // pulled inside the arena walls and lose them both)
  const behind = (back: number, side: number, h: number) =>
    new THREE.Vector3(me.pos.x - (dx / len) * back - (dz / len) * side, me.pos.y + h, me.pos.z - (dz / len) * back + (dx / len) * side);
  const establish: Shot = {
    duration: INTRO.establish / 1000,
    from: { pos: behind(4.5, 2.5, 7), look: mid.clone().setY(mid.y + 0.3), fov: 50, subject: mid },
    to: { pos: behind(2.5, 1.5, 4.5), look: mid.clone().setY(mid.y + 0.8), fov: 48, subject: mid },
  };
  const mine = entranceShots(me.char, me);
  const last = mine[mine.length - 1].to;
  const swing: Shot = { duration: INTRO.swing / 1000, from: { ...last }, via: place(me, [-1.0, 4.0, 2.0]), lookVia: place(me, [0, 0, 1.3]), to: end };
  return [establish, ...entranceShots(op.char, op), ...mine, swing];
}
