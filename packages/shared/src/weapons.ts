// Each fighter fights with their own weapon and moveset, so a fighter's id is
// also its weapon id. Move data comes from the moveset design in
// characters/movesets.js; stun values and cancel windows are derived here so
// every string keeps the same rules (true on hit, a parry gap on block).

export type WeaponId = 'ronin' | 'warden' | 'wraith' | 'lancer' | 'assassin' | 'duelist' | 'monk' | 'knight';
export type WeaponClass = 'blade' | 'blunt';
export type MoveId = 'L1' | 'L2' | 'L3' | 'H1' | 'H2' | 'H3' | 'DL' | 'DH' | 'BL' | 'BH' | 'JL' | 'JH' | 'C';
export type MoveKind = 'light' | 'heavy' | 'critical' | 'plunge';
export type MoveAnim =
  | 'slashR' | 'slashL' | 'thrust' | 'spin' | 'overhead' | 'rising' | 'plunge'
  | 'lungeSlash' | 'dashThrust' | 'counter' | 'airSlash' | 'airSpin' | 'slam' | 'sweep' | 'uppercut'
  | 'backflip' | 'flurry' | 'punch' | 'palm' | 'kick' | 'roundhouse' | 'shieldBash' | 'shieldGuard' | 'reap' | 'hook';

export interface CancelRule {
  into: MoveId | 'dodge';
  /** Move frames (0 = first startup frame), inclusive. */
  from: number;
  to: number;
  requires?: 'contact' | 'hit';
}

/** A [from, to] range of move frames, inclusive. */
export type FrameRange = readonly [number, number];

export interface MoveData {
  id: MoveId;
  name: string;
  kind: MoveKind;
  anim: MoveAnim;
  startup: number;
  active: number;
  recovery: number;
  /** Total damage; a multi-hit move splits it across its hits. */
  damage: number;
  posture: number;
  hitstun: number;
  blockstun: number;
  range: number;
  /** Width of the hit arc in degrees, centered on the facing direction. */
  arc: number;
  /** Root motion in meters: forward during the active frames, or backward (negative) through startup and active. */
  lunge: number;
  knockback: number;
  knockdown: boolean;
  unblockable: boolean;
  /** Frames of white glow before the first active frame (0 = none). */
  glow: number;
  hitstop: number;
  /** Hits spread evenly over the active frames. */
  hits: number;
  /** Frames where the attacker takes hits without flinching. Criticals break through. */
  armor: FrameRange | null;
  /** Frames that guard; an attack landing there is deflected and this move fires at once. */
  guard: FrameRange | null;
  /** Upward speed (m/s) given to the victim on hit. */
  launch: number;
  /** Knockback pulls the victim toward the attacker. */
  pull: boolean;
  /** Extra hitstun frames on hit. */
  stun: number;
  /** Posture damage on block is multiplied by 1.5. */
  crush: boolean;
  /** Can only be started in the air. */
  air: boolean;
  /** Drops straight down and hits on landing. */
  lands: boolean;
  cancels: CancelRule[];
}

export interface WeaponData {
  id: WeaponId;
  /** The fighter's name, shown on the pick screen and name cards. */
  name: string;
  weapon: string;
  weaponClass: WeaponClass;
  /** Short description for the pick screen. */
  blurb: string;
  moves: Record<MoveId, MoveData>;
}

export const LIGHT_CHAIN: readonly MoveId[] = ['L1', 'L2', 'L3'];
export const HEAVY_CHAIN: readonly MoveId[] = ['H1', 'H2', 'H3'];
export const MOVE_IDS: readonly MoveId[] = ['L1', 'L2', 'L3', 'H1', 'H2', 'H3', 'DL', 'DH', 'BL', 'BH', 'JL', 'JH', 'C'];

const KIND: Record<MoveId, MoveKind> = {
  L1: 'light', L2: 'light', L3: 'light', DL: 'light', BL: 'light', JL: 'light',
  H1: 'heavy', H2: 'heavy', H3: 'heavy', DH: 'heavy', BH: 'heavy',
  JH: 'plunge',
  C: 'critical',
};

/** Frames between the end of one chain hit and the next one's cancel window opening. */
const CHAIN_GAP: Record<'light' | 'heavy', [number, number]> = { light: [2, 10], heavy: [3, 14] };

interface Extra {
  hits?: number;
  armor?: FrameRange;
  guard?: FrameRange;
  launch?: number;
  pull?: boolean;
  stun?: number;
  knockdown?: boolean;
  crush?: boolean;
  air?: boolean;
  lands?: boolean;
}

type Row = [name: string, anim: MoveAnim, startup: number, active: number, recovery: number, damage: number, posture: number, range: number, arc: number, lunge: number, knockback: number, extra?: Extra];

interface Fighter {
  name: string;
  weapon: string;
  weaponClass: WeaponClass;
  blurb: string;
  moves: Record<MoveId, Row>;
}

const FIGHTERS: Record<WeaponId, Fighter> = {
  ronin: {
    name: 'Ronin', weapon: 'Katana', weaponClass: 'blade', blurb: 'Quick, clean cuts and a true counter',
    moves: {
      L1: ['Draw Cut', 'slashR', 7, 3, 11, 6, 7, 2.4, 110, 0.6, 0.3],
      L2: ['Return Cut', 'slashL', 7, 3, 11, 6, 7, 2.4, 110, 0.6, 0.3],
      L3: ['Piercing Thrust', 'thrust', 9, 3, 14, 8, 10, 2.8, 35, 1.0, 0.8],
      H1: ['Overhead Cleave', 'overhead', 18, 4, 22, 13, 20, 2.6, 80, 0.9, 1.0],
      H2: ['Rising Moon', 'rising', 17, 4, 22, 12, 18, 2.6, 90, 0.7, 0.4, { launch: 4 }],
      H3: ['Iai Flash', 'lungeSlash', 22, 3, 28, 18, 28, 3.4, 60, 3.2, 1.2, { knockdown: true }],
      DL: ['Flash Step', 'lungeSlash', 6, 3, 14, 7, 8, 2.6, 70, 2.2, 0.5],
      DH: ['Wind Cleaver', 'spin', 16, 5, 24, 14, 22, 2.8, 220, 1.8, 2.0, { knockdown: true }],
      BL: ['Retreating Cut', 'slashL', 8, 3, 12, 6, 8, 2.4, 100, -0.8, 0.4],
      BH: ['Sheathing Counter', 'counter', 14, 3, 20, 15, 24, 2.6, 120, 0.4, 1.4, { guard: [2, 13] }],
      JL: ['Falling Cut', 'airSlash', 7, 4, 10, 7, 8, 2.2, 120, 0.4, 0.4, { air: true }],
      JH: ['Heaven Drop', 'plunge', 12, 4, 22, 13, 20, 2.4, 360, 0, 0.8, { air: true, lands: true }],
      C: ['Kesagiri', 'rising', 27, 5, 28, 18, 30, 3.0, 120, 1.4, 1.6],
    },
  },
  warden: {
    name: 'Warden', weapon: 'Warhammer', weaponClass: 'blunt', blurb: 'Armored heavies that wreck guards',
    moves: {
      L1: ['Haft Jab', 'thrust', 11, 3, 15, 7, 12, 2.6, 40, 0.5, 0.6],
      L2: ['Backhand Swing', 'slashL', 12, 4, 16, 8, 14, 2.9, 130, 0.5, 0.8],
      L3: ['Stone Uppercut', 'uppercut', 14, 4, 20, 10, 18, 2.6, 70, 0.6, 0.6, { launch: 5 }],
      H1: ['Hammerfall', 'overhead', 24, 5, 28, 18, 32, 3.0, 70, 0.8, 1.4, { armor: [6, 24], crush: true }],
      H2: ['Wrecking Arc', 'spin', 26, 6, 30, 17, 30, 3.2, 240, 0.6, 2.4, { armor: [6, 26] }],
      H3: ['Earthsplitter', 'slam', 32, 6, 34, 24, 45, 3.4, 90, 1.0, 1.0, { armor: [6, 32], knockdown: true, crush: true }],
      DL: ['Shoulder Charge', 'shieldBash', 10, 4, 18, 8, 16, 1.8, 80, 2.4, 1.6, { armor: [2, 10] }],
      DH: ['Avalanche', 'slam', 24, 5, 30, 20, 36, 3.0, 120, 2.6, 2.0, { armor: [4, 24], knockdown: true }],
      BL: ['Pommel Shove', 'thrust', 10, 3, 14, 5, 14, 1.8, 60, -0.6, 2.2],
      BH: ['Bulwark Swing', 'slashR', 20, 5, 24, 14, 26, 3.0, 140, -1.0, 2.6, { armor: [4, 20] }],
      JL: ['Gauntlet Drop', 'airSlash', 10, 4, 14, 8, 12, 1.8, 120, 0.3, 0.8, { air: true }],
      JH: ['Meteor', 'plunge', 16, 6, 30, 20, 34, 3.2, 360, 0, 2.0, { air: true, lands: true, knockdown: true, crush: true }],
      C: ['Worldbreaker', 'slam', 36, 6, 36, 26, 50, 3.4, 100, 1.2, 1.8, { armor: [6, 36], knockdown: true }],
    },
  },
  wraith: {
    name: 'Wraith', weapon: 'Scythe', weaponClass: 'blade', blurb: 'Huge sweeping reach that pulls you in',
    moves: {
      L1: ['Reaping Sweep', 'reap', 9, 4, 13, 6, 7, 3.4, 140, 0.4, 0.4],
      L2: ['Backhand Reap', 'slashL', 9, 4, 13, 6, 7, 3.4, 140, 0.4, 0.4],
      L3: ['Harvest Hook', 'hook', 11, 4, 16, 7, 10, 3.6, 70, 0.2, 1.2, { pull: true }],
      H1: ['Crescent Fall', 'overhead', 20, 5, 24, 13, 20, 3.6, 60, 0.6, 1.0],
      H2: ['Wailing Circle', 'spin', 22, 6, 26, 12, 18, 3.4, 360, 0.2, 1.4, { hits: 2 }],
      H3: ['Red Harvest', 'reap', 26, 6, 30, 18, 28, 3.8, 160, 0.8, 1.6, { pull: true, knockdown: true }],
      DL: ['Phantom Glide', 'dashThrust', 8, 4, 16, 7, 8, 3.2, 40, 2.6, 0.5],
      DH: ['Soul Reaver', 'spin', 18, 6, 26, 15, 22, 3.4, 360, 2.0, 1.8, { hits: 2, pull: true }],
      BL: ['Fading Slash', 'slashR', 9, 4, 14, 6, 8, 3.2, 120, -1.2, 0.4],
      BH: ['Mist Veil Counter', 'counter', 15, 4, 22, 14, 22, 3.4, 140, 0.0, 1.6, { guard: [2, 14], pull: true }],
      JL: ['Shroud Cut', 'airSpin', 8, 5, 12, 6, 7, 2.8, 360, 0.2, 0.4, { air: true }],
      JH: ['Descending Moon', 'plunge', 14, 5, 26, 14, 22, 3.0, 360, 0, 1.0, { air: true, lands: true }],
      C: ['Last Rite', 'reap', 30, 6, 30, 20, 30, 4.0, 160, 1.0, 1.0, { pull: true }],
    },
  },
  lancer: {
    name: 'Lancer', weapon: 'Golden Spear', weaponClass: 'blade', blurb: 'Longest thrusts; lightning stuns',
    moves: {
      L1: ['Spear Jab', 'thrust', 8, 3, 12, 6, 7, 3.6, 30, 0.7, 0.4],
      L2: ['Second Jab', 'thrust', 8, 3, 12, 6, 7, 3.6, 30, 0.7, 0.4],
      L3: ['Shaft Sweep', 'sweep', 11, 4, 16, 8, 12, 3.2, 150, 0.4, 1.2],
      H1: ['Thunder Lance', 'dashThrust', 18, 4, 22, 13, 18, 4.0, 30, 1.6, 1.0, { stun: 6 }],
      H2: ['Storm Arc', 'slashR', 19, 5, 24, 13, 20, 3.4, 160, 0.6, 1.4, { stun: 6 }],
      H3: ['Skyfall Pike', 'rising', 23, 4, 28, 17, 26, 3.6, 50, 1.0, 0.6, { launch: 6, stun: 10 }],
      DL: ['Lightning Step', 'dashThrust', 7, 3, 15, 7, 8, 3.8, 30, 2.8, 0.6],
      DH: ['Charging Bolt', 'dashThrust', 16, 5, 24, 15, 22, 4.0, 40, 3.6, 2.2, { stun: 8, knockdown: true }],
      BL: ['Keep-Away Thrust', 'thrust', 8, 3, 13, 5, 7, 3.6, 30, -1.0, 1.0],
      BH: ['Grounding Rod', 'slam', 18, 5, 24, 12, 20, 3.0, 360, -0.4, 1.8, { stun: 12 }],
      JL: ['Diving Jab', 'airSlash', 8, 4, 11, 6, 7, 3.0, 40, 0.6, 0.4, { air: true }],
      JH: ['Thunderstrike', 'plunge', 13, 5, 24, 15, 22, 2.8, 360, 0, 1.4, { air: true, lands: true, stun: 10 }],
      C: ['Judgement Bolt', 'dashThrust', 28, 5, 30, 19, 30, 4.4, 40, 2.4, 1.6, { stun: 12 }],
    },
  },
  assassin: {
    name: 'Assassin', weapon: 'Twin Daggers', weaponClass: 'blade', blurb: 'Fastest hands, multi-hit flurries',
    moves: {
      L1: ['Quick Slice', 'slashR', 5, 2, 9, 4, 5, 1.9, 100, 0.6, 0.2],
      L2: ['Cross Slice', 'slashL', 5, 2, 9, 4, 5, 1.9, 100, 0.6, 0.2],
      L3: ['Twin Fangs', 'flurry', 7, 6, 13, 7, 10, 2.0, 80, 0.8, 0.6, { hits: 3 }],
      H1: ['Gutting Stab', 'thrust', 14, 3, 18, 10, 14, 2.1, 40, 1.2, 0.6],
      H2: ['Viper Coil', 'spin', 14, 6, 20, 10, 16, 2.0, 300, 0.4, 0.8, { hits: 3 }],
      H3: ['Shadow Execution', 'flurry', 18, 10, 26, 16, 24, 2.2, 90, 1.0, 1.6, { hits: 5, knockdown: true }],
      DL: ['Blink Strike', 'dashThrust', 4, 2, 12, 5, 6, 2.0, 60, 2.6, 0.3],
      DH: ['Passing Shadow', 'lungeSlash', 12, 4, 18, 11, 16, 2.2, 90, 3.6, 0.8, { hits: 2 }],
      BL: ['Backflip Kick', 'backflip', 7, 3, 12, 5, 8, 1.6, 80, -1.6, 1.2],
      BH: ['Smoke Counter', 'counter', 12, 3, 18, 12, 18, 2.0, 140, 1.0, 0.8, { guard: [2, 11] }],
      JL: ['Talon Spin', 'airSpin', 5, 6, 9, 5, 6, 1.8, 360, 0.2, 0.3, { air: true, hits: 2 }],
      JH: ['Death From Above', 'plunge', 10, 4, 20, 12, 16, 2.0, 360, 0, 0.8, { air: true, lands: true }],
      C: ['Thousand Cuts', 'flurry', 24, 12, 26, 18, 26, 2.2, 90, 1.2, 1.2, { hits: 6 }],
    },
  },
  duelist: {
    name: 'Duelist', weapon: 'Rapier', weaponClass: 'blade', blurb: 'Long, precise pokes and a deadly riposte',
    moves: {
      L1: ['Lunge', 'thrust', 6, 2, 10, 5, 5, 3.0, 25, 0.9, 0.3],
      L2: ['Remise', 'thrust', 6, 2, 10, 5, 5, 3.0, 25, 0.9, 0.3],
      L3: ['Cutover', 'slashR', 8, 3, 12, 7, 9, 2.6, 90, 0.6, 0.8],
      H1: ['Flèche', 'dashThrust', 15, 3, 20, 12, 15, 3.4, 25, 2.2, 0.8],
      H2: ['Moulinet', 'spin', 16, 5, 20, 11, 16, 2.6, 260, 0.4, 1.2, { hits: 2 }],
      H3: ['Coup de Grâce', 'thrust', 20, 3, 26, 17, 24, 3.6, 25, 1.6, 1.4, { knockdown: true }],
      DL: ['Balestra', 'dashThrust', 5, 2, 12, 6, 6, 3.2, 25, 2.4, 0.4],
      DH: ['Passata Sotto', 'lungeSlash', 14, 4, 20, 13, 18, 3.0, 70, 2.8, 1.0, { stun: 4 }],
      BL: ['Retreat Riposte', 'thrust', 7, 2, 11, 5, 6, 3.0, 25, -1.0, 0.4],
      BH: ['Parry Riposte', 'counter', 10, 2, 16, 16, 20, 3.0, 60, 0.8, 1.0, { guard: [1, 9] }],
      JL: ['Aerial Thrust', 'airSlash', 6, 3, 9, 5, 5, 2.6, 30, 0.6, 0.3, { air: true }],
      JH: ['Falcon Dive', 'plunge', 12, 4, 20, 12, 16, 2.4, 60, 1.2, 0.8, { air: true, lands: true }],
      C: ['Estocada', 'dashThrust', 24, 3, 26, 18, 26, 3.8, 25, 2.6, 1.2],
    },
  },
  monk: {
    name: 'Monk', weapon: 'Fists', weaponClass: 'blunt', blurb: 'Short reach, fastest guard-crushing palms',
    moves: {
      L1: ['Straight Punch', 'punch', 5, 2, 9, 4, 7, 1.5, 60, 0.6, 0.2],
      L2: ['Hook Punch', 'punch', 5, 2, 9, 4, 7, 1.5, 90, 0.6, 0.2],
      L3: ['Spinning Back Kick', 'roundhouse', 8, 3, 13, 7, 12, 1.9, 120, 0.6, 1.2],
      H1: ['Iron Palm', 'palm', 14, 3, 18, 11, 22, 1.6, 60, 0.8, 1.6, { crush: true }],
      H2: ['Crane Rising Knee', 'uppercut', 14, 3, 20, 10, 18, 1.5, 70, 0.6, 0.4, { launch: 6 }],
      H3: ['Thunder Palm', 'palm', 20, 3, 26, 16, 34, 1.8, 70, 1.2, 2.6, { crush: true, knockdown: true }],
      DL: ['Sliding Kick', 'kick', 6, 4, 14, 6, 9, 1.9, 60, 2.4, 0.6],
      DH: ['Flying Knee', 'uppercut', 14, 4, 20, 12, 20, 1.8, 60, 2.6, 1.0, { launch: 5 }],
      BL: ['Back-Step Jab', 'punch', 5, 2, 10, 4, 6, 1.5, 60, -1.0, 0.6],
      BH: ['Deflecting Palm', 'counter', 10, 3, 16, 13, 26, 1.8, 140, 0.6, 2.0, { guard: [1, 9] }],
      JL: ['Whirlwind Kick', 'airSpin', 6, 5, 10, 5, 8, 1.8, 360, 0.2, 0.6, { air: true, hits: 2 }],
      JH: ['Descending Heel', 'plunge', 12, 4, 20, 12, 22, 1.8, 360, 0, 1.2, { air: true, lands: true, crush: true }],
      C: ['Hundred Year Strike', 'palm', 26, 4, 28, 18, 45, 1.9, 70, 1.4, 3.0, { crush: true, knockdown: true }],
    },
  },
  knight: {
    name: 'Knight', weapon: 'Greatsword & Shield', weaponClass: 'blade', blurb: 'Shield bashes, guard counters, armored charges',
    moves: {
      L1: ['Measured Cut', 'slashR', 9, 3, 13, 7, 9, 2.8, 110, 0.6, 0.4],
      L2: ['Shield Bash', 'shieldBash', 8, 3, 13, 5, 12, 1.7, 80, 0.8, 1.0],
      L3: ['Backhand Cleave', 'slashL', 11, 4, 16, 9, 12, 3.0, 130, 0.6, 1.0],
      H1: ['Oathbreaker', 'overhead', 20, 4, 24, 15, 24, 3.0, 80, 0.8, 1.2],
      H2: ['Rampart Sweep', 'sweep', 21, 5, 24, 14, 22, 3.0, 200, 0.6, 1.6],
      H3: ['Judgement', 'slam', 26, 5, 30, 20, 32, 3.2, 90, 1.0, 1.4, { knockdown: true, crush: true }],
      DL: ['Shield Charge', 'shieldBash', 8, 4, 16, 6, 14, 1.8, 80, 2.4, 1.6, { armor: [1, 8] }],
      DH: ['Crusader Lunge', 'dashThrust', 18, 4, 24, 16, 24, 3.4, 40, 2.6, 1.4, { armor: [4, 18] }],
      BL: ['Guarded Retreat', 'slashL', 9, 3, 14, 6, 8, 2.6, 110, -0.8, 0.6],
      BH: ['Bulwark Riposte', 'shieldGuard', 12, 3, 20, 15, 26, 2.8, 140, 0.6, 1.6, { guard: [1, 11] }],
      JL: ['Leaping Cut', 'airSlash', 9, 4, 12, 7, 9, 2.4, 110, 0.4, 0.5, { air: true }],
      JH: ['Falling Bastion', 'plunge', 14, 5, 24, 15, 24, 2.6, 360, 0, 1.2, { air: true, lands: true, crush: true }],
      C: ['Oath of Ruin', 'overhead', 30, 5, 30, 20, 34, 3.2, 90, 1.4, 1.6, { armor: [6, 30] }],
    },
  },
};

const BASE_STUN: Record<MoveKind, [hitstun: number, blockstun: number]> = {
  light: [18, 10],
  heavy: [24, 16],
  critical: [28, 0],
  plunge: [22, 14],
};

function nextInChain(id: MoveId): MoveId | null {
  for (const chain of [LIGHT_CHAIN, HEAVY_CHAIN]) {
    const i = chain.indexOf(id);
    if (i >= 0 && i < chain.length - 1) return chain[i + 1]!;
  }
  return null;
}

function buildMove(id: MoveId, row: Row, rows: Record<MoveId, Row>): MoveData {
  const [name, anim, startup, active, recovery, damage, posture, range, arc, lunge, knockback, x = {}] = row;
  const kind = KIND[id];
  let [hitstun, blockstun] = BASE_STUN[kind];
  const next = nextInChain(id);
  if (next) {
    // Keep strings true on hit and leave a parry gap on block, whatever the next hit's startup:
    // the next hit lands `gap` frames after this one's first active frame at the earliest.
    const gap = active + CHAIN_GAP[kind === 'light' ? 'light' : 'heavy'][0] + rows[next][2];
    hitstun = Math.max(hitstun, gap + 5);
    blockstun = Math.max(6, gap - 4);
  }
  hitstun += x.stun ?? 0;
  const knockdown = x.knockdown ?? false;
  const hitstop = kind === 'light' ? 4 : knockdown ? 10 : kind === 'critical' ? 10 : 8;
  const move: MoveData = {
    id, name, kind, anim, startup, active, recovery, damage, posture, hitstun, blockstun, range, arc, lunge, knockback,
    knockdown,
    unblockable: kind === 'critical',
    glow: kind === 'critical' ? 16 : 0,
    hitstop,
    hits: x.hits ?? 1,
    armor: x.armor ?? null,
    guard: x.guard ?? null,
    launch: x.launch ?? 0,
    pull: x.pull ?? false,
    stun: x.stun ?? 0,
    crush: x.crush ?? false,
    air: x.air ?? false,
    lands: x.lands ?? false,
    cancels: [],
  };
  const endActive = startup + active;
  if (next) {
    const [from, to] = CHAIN_GAP[kind === 'light' ? 'light' : 'heavy'];
    // Presses in succession advance the chain, connected or not.
    move.cancels.push({ into: next, from: endActive + from, to: endActive + to });
  }
  if (id === 'L1' || id === 'L2') move.cancels.push({ into: 'H1', from: endActive, to: endActive + 6, requires: 'hit' });
  if (kind !== 'critical') {
    const dodgeFrom = move.lands ? endActive + 6 : endActive;
    move.cancels.push({ into: 'dodge', from: dodgeFrom, to: endActive + 12 });
  }
  return move;
}

function buildWeapon(id: WeaponId, f: Fighter): WeaponData {
  const moves = {} as Record<MoveId, MoveData>;
  for (const key of MOVE_IDS) moves[key] = buildMove(key, f.moves[key], f.moves);
  return { id, name: f.name, weapon: f.weapon, weaponClass: f.weaponClass, blurb: f.blurb, moves };
}

export const WEAPONS = Object.fromEntries(
  (Object.keys(FIGHTERS) as WeaponId[]).map((id) => [id, buildWeapon(id, FIGHTERS[id])]),
) as Record<WeaponId, WeaponData>;

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export function moveTotal(m: MoveData): number {
  return m.startup + m.active + m.recovery;
}

export type MovePhase = 'startup' | 'active' | 'recovery';

export function movePhase(m: MoveData, frame: number): MovePhase {
  if (frame < m.startup) return 'startup';
  if (frame < m.startup + m.active) return 'active';
  return 'recovery';
}

export const inRange = (r: FrameRange | null, frame: number): boolean => r !== null && frame >= r[0] && frame <= r[1];
