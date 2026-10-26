/**
 * Every fighter's sound: what their weapon is made of and how it moves through the air, what it
 * does when it lands, what they block with, what they wear, how they walk and how they finish an
 * execution. The recipes (recipes.ts) combine an attacker's profile with a defender's, so a katana
 * on the Warden's plate sounds different from the same katana on the Monk or on the Knight's shield.
 */
import type { CharacterId } from '../../shared/characters';
import { MAT, Material } from './materials';

/** How a weapon meets a body. A thrusting move turns any edge into a point. */
export type Edge = 'blade' | 'point' | 'blunt' | 'fist';
/** What a fighter puts in the way when they block or deflect. */
export type Guard = 'blade' | 'hammer' | 'haft' | 'knives' | 'chain' | 'bracer' | 'shield';
export type Body = 'plate' | 'leather' | 'cloth' | 'robe' | 'bare';
export type Feet = 'heavyPlate' | 'plate' | 'boots' | 'sandals' | 'soft' | 'robe' | 'bare';
export type Finisher = 'iai' | 'crush' | 'pierce' | 'thunder' | 'flurry' | 'reap' | 'palm' | 'rites';

export interface SwingProfile {
  /** centre of the whoosh's band (Hz) */
  f: number;
  /** how far the band climbs as the weapon peaks in speed (multiplier) */
  sweep: number;
  /** length of a light swing (s) */
  len: number;
  q: number;
  /** the edge singing through the air: a narrow band over the whoosh */
  whistle: number;
  /** the weight moving: a low whoom under it */
  body: number;
  /** two weapons: a second whoosh a beat behind */
  pair?: boolean;
  /** a chain spun round: the whoosh comes and goes at this rate (Hz) */
  whirl?: number;
  /** a sleeve cracking at the end of a punch */
  snap?: number;
  /** loudness trim, balanced from renders (a rapier's fwip carries far less air than a hammer) */
  gain: number;
}

export interface Profile {
  id: CharacterId;
  /** the metal that rings when this weapon strikes or is struck */
  metal: Material;
  /** weapon pitch scale (a bigger weapon rings lower) */
  pitch: number;
  edge: Edge;
  /** 0..1: knife to sledgehammer; scales the thump under every blow */
  mass: number;
  swing: SwingProfile;
  guard: Guard;
  body: Body;
  /** base pitch of their armour plate, if they wear it */
  plate: number;
  feet: Feet;
  /** body weight: footfalls, falls */
  weight: number;
  chain?: boolean;
  lightning?: boolean;
  finisher: Finisher;
}

export const PROFILES: Record<CharacterId, Profile> = {
  // a katana: a bright, singing whoosh; a clean slice; a long silvery ring on the parry
  ronin: {
    id: 'ronin',
    metal: MAT.katana,
    pitch: 1,
    edge: 'blade',
    mass: 0.45,
    swing: { f: 1250, sweep: 2.2, len: 0.2, q: 2.4, whistle: 0.55, body: 0.12, gain: 1.25 },
    guard: 'blade',
    body: 'cloth',
    plate: 0,
    feet: 'sandals',
    weight: 1,
    finisher: 'iai',
  },
  // the Warden: a huge sledgehammer and full plate. Everything he does is low and heavy.
  juggernaut: {
    id: 'juggernaut',
    metal: MAT.hammer,
    pitch: 1,
    edge: 'blunt',
    mass: 1,
    swing: { f: 360, sweep: 1.8, len: 0.42, q: 1.0, whistle: 0, body: 1.0, gain: 0.65 },
    guard: 'hammer',
    body: 'plate',
    plate: 380,
    feet: 'heavyPlate',
    weight: 1.6,
    finisher: 'crush',
  },
  // the Duelist: a rapier, a thin "fwip", a needle-bright ting
  duelist: {
    id: 'duelist',
    metal: MAT.rapier,
    pitch: 1,
    edge: 'point',
    mass: 0.3,
    swing: { f: 2300, sweep: 2.0, len: 0.13, q: 3.2, whistle: 0.8, body: 0, gain: 4 },
    guard: 'blade',
    body: 'leather',
    plate: 0,
    feet: 'boots',
    weight: 0.9,
    finisher: 'pierce',
  },
  // the Lancer: a long glaive on an ash shaft, plate armour, and a spear that crackles with lightning
  lancer: {
    id: 'lancer',
    metal: MAT.glaive,
    pitch: 1,
    edge: 'blade',
    mass: 0.7,
    swing: { f: 850, sweep: 2.0, len: 0.28, q: 1.7, whistle: 0.3, body: 0.45, gain: 0.9 },
    guard: 'haft',
    body: 'plate',
    plate: 470,
    feet: 'plate',
    weight: 1.15,
    lightning: true,
    finisher: 'thunder',
  },
  // the Assassin: two knives, two quick hisses, soft leather
  shade: {
    id: 'shade',
    metal: MAT.knife,
    pitch: 1,
    edge: 'blade',
    mass: 0.25,
    swing: { f: 2700, sweep: 1.9, len: 0.09, q: 2.2, whistle: 0.35, body: 0, pair: true, gain: 3.2 },
    guard: 'knives',
    body: 'leather',
    plate: 0,
    feet: 'soft',
    weight: 0.85,
    finisher: 'flurry',
  },
  // the Wraith: a chain sickle. The whoosh whirls, the chain rattles on everything, the robes swish.
  reaper: {
    id: 'reaper',
    metal: MAT.sickle,
    pitch: 1,
    edge: 'blade',
    mass: 0.5,
    swing: { f: 1050, sweep: 2.1, len: 0.3, q: 2.0, whistle: 0.25, body: 0.2, whirl: 14, gain: 1.7 },
    guard: 'chain',
    body: 'robe',
    plate: 0,
    feet: 'robe',
    weight: 0.95,
    chain: true,
    finisher: 'reap',
  },
  // the Monk: fists and bronze-plated bracers; punches thud and slap, his sleeves crack
  monk: {
    id: 'monk',
    metal: MAT.bronze,
    pitch: 1,
    edge: 'fist',
    mass: 0.55,
    swing: { f: 700, sweep: 1.7, len: 0.11, q: 1.0, whistle: 0, body: 0.5, snap: 0.6, gain: 1 },
    guard: 'bracer',
    body: 'bare',
    plate: 0,
    feet: 'bare',
    weight: 1,
    finisher: 'palm',
  },
  // the Knight: a greatsword and a shield of planks, leather and steel rim, in plate
  paladin: {
    id: 'paladin',
    metal: MAT.greatsword,
    pitch: 1,
    edge: 'blade',
    mass: 0.75,
    swing: { f: 950, sweep: 2.0, len: 0.25, q: 1.8, whistle: 0.3, body: 0.5, gain: 0.75 },
    guard: 'shield',
    body: 'plate',
    plate: 560,
    feet: 'plate',
    weight: 1.25,
    finisher: 'rites',
  },
};

export function profile(id: CharacterId | undefined | null): Profile {
  return (id && PROFILES[id]) || PROFILES.ronin;
}
