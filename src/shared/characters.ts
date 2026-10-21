/**
 * The roster. Every character is a weapon archetype with its own move list, stats, passive quirk,
 * perilous special (E) and unique ability (R). Names and palettes are placeholders: swap them out
 * when the real character designs are ready — gameplay only depends on the numbers below.
 */

export type CharacterId =
  | 'ronin'
  | 'juggernaut'
  | 'duelist'
  | 'lancer'
  | 'shade'
  | 'reaper'
  | 'monk'
  | 'paladin';

export type WeaponKind =
  | 'katana'
  | 'greathammer'
  | 'rapier'
  | 'spear'
  | 'daggers'
  | 'scythe'
  | 'gauntlets'
  | 'swordShield';

/** Visual swing used by the client animation system. */
export type AttackAnim =
  | 'slashR'
  | 'slashL'
  | 'overhead'
  | 'thrust'
  | 'sweep'
  | 'spin'
  | 'uppercut'
  | 'grab'
  | 'punchR'
  | 'punchL'
  | 'bash'
  | 'dualSlash'
  | 'slam'
  | 'charge'
  | 'hook'
  | 'draw';

/**
 * Perilous attacks cannot be blocked:
 *  - thrust: deflect it, or dodge *into* it for a Mikiri counter
 *  - sweep:  jump over it
 *  - grab:   dodge or jump away
 */
export type Perilous = 'thrust' | 'sweep' | 'grab';

/** l0..l4 = light chain, h = heavy, sp = special, ab = ability attack, ia = stance attack, ct = counter strike */
export type AttackKey = 'l0' | 'l1' | 'l2' | 'l3' | 'l4' | 'h' | 'sp' | 'ab' | 'ia' | 'ct';

export interface AttackDef {
  name: string;
  anim: AttackAnim;
  windup: number;
  active: number;
  recovery: number;
  damage: number;
  /** Posture dealt on a clean hit. Also the base for posture dealt to the attacker when deflected. */
  posture: number;
  /** Posture dealt to a defender who blocks it. */
  blockPosture: number;
  range: number;
  /** Half-angle of the hit cone in degrees. */
  arc: number;
  /** Distance the attacker travels forward during the late windup and active frames. */
  lunge?: number;
  perilous?: Perilous;
  /** Can be blocked but never deflected. */
  unparryable?: boolean;
  hyperArmor?: boolean;
  feintable?: boolean;
  /** Number of separate hits spread evenly over the active frames. */
  hits?: number;
  /** Extra knockback applied to the defender on hit or block. */
  knockback?: number;
  /** Pulls the defender to this distance in front of the attacker on hit. */
  pull?: number;
  /** Purely cosmetic attack (e.g. the counter strike, which is applied directly). */
  noHitbox?: boolean;
}

export type AbilityDef =
  | { kind: 'stance'; name: string; description: string; cooldown: number; duration: number; attack: AttackDef }
  | { kind: 'counter'; name: string; description: string; cooldown: number; duration: number; attack: AttackDef }
  | { kind: 'buff'; name: string; description: string; cooldown: number; duration: number; damageMult: number; hyperArmor: boolean }
  | { kind: 'attack'; name: string; description: string; cooldown: number; attack: AttackDef }
  | { kind: 'leap'; name: string; description: string; cooldown: number; distance: number; duration: number; iframes: number }
  | { kind: 'teleport'; name: string; description: string; cooldown: number; range: number };

export interface PassiveMods {
  parryWindowBonus?: number;
  heavyHyperArmor?: boolean;
  lightFeint?: boolean;
  /** After a successful deflect your next attack's windup is multiplied by this. */
  riposteWindupMult?: number;
  /** Bonus damage/posture for hits in the outer 30% of an attack's range. */
  tipperBonus?: number;
  dodgeCharges?: number;
  /** Bonus damage for hits landed from behind. */
  backstabBonus?: number;
  lifesteal?: number;
  postureDamageMult?: number;
  /** Multiplier on posture taken while blocking. */
  blockPostureMult?: number;
  /** Extra degrees added to the guard arc. */
  guardArcBonus?: number;
}

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  skin: string;
  hair: string;
  metal: string;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  /** kanji name shown in menus (flavour text; change it along with the design) */
  jp: string;
  weapon: string;
  weaponKind: WeaponKind;
  role: string;
  description: string;
  stats: {
    hp: number;
    posture: number;
    /** Walk speed in m/s. */
    speed: number;
    postureRegen: number;
  };
  /** Ratings shown on the select screen, 1-5. */
  ratings: { power: number; speed: number; reach: number; defense: number; difficulty: number };
  lights: AttackDef[];
  heavy: AttackDef;
  special: AttackDef & { cooldown: number };
  ability: AbilityDef;
  passive: { name: string; description: string; mods: PassiveMods };
  palette: Palette;
}

const ronin: CharacterDef = {
  id: 'ronin',
  name: 'Ronin',
  jp: '浪人',
  weapon: 'Katana',
  weaponKind: 'katana',
  role: 'All-rounder',
  description: 'A wandering swordsman. Honest timings, a generous deflect window and a lightning-fast draw cut.',
  stats: { hp: 100, posture: 100, speed: 6.2, postureRegen: 1 },
  ratings: { power: 3, speed: 3, reach: 3, defense: 4, difficulty: 2 },
  lights: [
    { name: 'Swallow Cut', anim: 'slashR', windup: 300, active: 90, recovery: 320, damage: 9, posture: 10, blockPosture: 14, range: 2.7, arc: 65, lunge: 0.6 },
    { name: 'Falling Petal', anim: 'slashL', windup: 270, active: 90, recovery: 320, damage: 9, posture: 10, blockPosture: 14, range: 2.7, arc: 65, lunge: 0.5 },
    // tsubame-gaeshi: two cuts, there and back, a blink apart
    { name: 'Twin Swallow', anim: 'slashR', windup: 340, active: 150, recovery: 470, damage: 7, posture: 9, blockPosture: 11, range: 2.8, arc: 60, lunge: 0.8, hits: 2 },
  ],
  heavy: { name: 'Heaven Splitter', anim: 'overhead', windup: 620, active: 120, recovery: 520, damage: 18, posture: 26, blockPosture: 34, range: 2.9, arc: 55, lunge: 1.2, feintable: true },
  special: { name: 'Flash Piercer', anim: 'thrust', windup: 720, active: 160, recovery: 650, damage: 22, posture: 30, blockPosture: 30, range: 4.0, arc: 25, lunge: 3.0, perilous: 'thrust', cooldown: 7000 },
  ability: {
    kind: 'stance',
    name: 'Iai Stance',
    description: 'Sheathe your blade. Attack within 1.5s to unleash Iai Flash, a near-instant draw cut that wrecks posture.',
    cooldown: 8000,
    duration: 1500,
    attack: { name: 'Iai Flash', anim: 'draw', windup: 130, active: 90, recovery: 450, damage: 16, posture: 32, blockPosture: 38, range: 3.3, arc: 70, lunge: 2.0 },
  },
  passive: { name: 'Clear Mind', description: 'Deflect window is 40ms longer.', mods: { parryWindowBonus: 40 } },
  palette: { primary: '#34448a', secondary: '#e6e2d6', accent: '#e43b44', skin: '#e8b796', hair: '#1c1a22', metal: '#d9e2ec' },
};

const juggernaut: CharacterDef = {
  id: 'juggernaut',
  name: 'Juggernaut',
  jp: '巨漢',
  weapon: 'Greathammer',
  weaponKind: 'greathammer',
  role: 'Heavy bruiser',
  description: 'Slow, huge and unstoppable. Every swing crushes guards, and heavies shrug off interruptions.',
  stats: { hp: 130, posture: 130, speed: 5.2, postureRegen: 0.9 },
  ratings: { power: 5, speed: 1, reach: 3, defense: 3, difficulty: 2 },
  lights: [
    { name: 'Skullcrusher', anim: 'slashR', windup: 440, active: 120, recovery: 420, damage: 14, posture: 16, blockPosture: 22, range: 3.0, arc: 75, lunge: 0.5 },
    // a full turn with the hammer dragged behind: slower to come out, but it sweeps a wide arc
    { name: 'Cyclone', anim: 'spin', windup: 640, active: 130, recovery: 560, damage: 18, posture: 20, blockPosture: 28, range: 3.1, arc: 100, lunge: 0.6 },
  ],
  heavy: { name: 'Meteor', anim: 'slam', windup: 780, active: 140, recovery: 650, damage: 26, posture: 34, blockPosture: 46, range: 3.2, arc: 50, lunge: 1.0, feintable: true, knockback: 1.2 },
  special: { name: 'Earthshaker', anim: 'sweep', windup: 800, active: 180, recovery: 700, damage: 24, posture: 30, blockPosture: 30, range: 3.8, arc: 110, perilous: 'sweep', cooldown: 7500 },
  ability: {
    kind: 'buff',
    name: 'War Cry',
    description: 'Roar for 5s: every attack gains hyper armor and deals 20% more damage.',
    cooldown: 15000,
    duration: 5000,
    damageMult: 1.2,
    hyperArmor: true,
  },
  passive: { name: 'Unstoppable', description: 'Heavy attacks have hyper armor: getting hit will not interrupt them.', mods: { heavyHyperArmor: true } },
  palette: { primary: '#1e6f75', secondary: '#c0cbdc', accent: '#feae34', skin: '#c28569', hair: '#733e39', metal: '#9aa3ad' },
};

const duelist: CharacterDef = {
  id: 'duelist',
  name: 'Duelist',
  jp: '剣客',
  weapon: 'Rapier',
  weaponKind: 'rapier',
  role: 'Fencer / mind games',
  description: 'Quick thrusts with long reach. Feints everything and punishes deflects with blistering ripostes.',
  stats: { hp: 90, posture: 90, speed: 6.6, postureRegen: 1.05 },
  ratings: { power: 2, speed: 4, reach: 4, defense: 2, difficulty: 4 },
  lights: [
    { name: 'Lunge', anim: 'thrust', windup: 240, active: 70, recovery: 280, damage: 7, posture: 9, blockPosture: 10, range: 3.1, arc: 30, lunge: 0.8, feintable: true },
    { name: 'Prick', anim: 'thrust', windup: 220, active: 70, recovery: 280, damage: 7, posture: 9, blockPosture: 10, range: 3.1, arc: 30, lunge: 0.5, feintable: true },
    { name: 'Flurry', anim: 'thrust', windup: 220, active: 70, recovery: 300, damage: 7, posture: 9, blockPosture: 10, range: 3.1, arc: 30, lunge: 0.5, feintable: true },
    { name: 'Pierce', anim: 'thrust', windup: 300, active: 80, recovery: 420, damage: 10, posture: 12, blockPosture: 14, range: 3.3, arc: 30, lunge: 0.9, feintable: true },
  ],
  heavy: { name: 'Skewer', anim: 'thrust', windup: 560, active: 100, recovery: 480, damage: 15, posture: 22, blockPosture: 28, range: 3.4, arc: 30, lunge: 1.5, feintable: true },
  special: { name: 'Coup de Grace', anim: 'thrust', windup: 620, active: 140, recovery: 600, damage: 20, posture: 30, blockPosture: 30, range: 4.4, arc: 20, lunge: 3.5, perilous: 'thrust', cooldown: 6500 },
  ability: {
    kind: 'attack',
    name: 'Fleche',
    description: 'Explode forward in a 6m running thrust.',
    cooldown: 7000,
    attack: { name: 'Fleche', anim: 'thrust', windup: 280, active: 200, recovery: 500, damage: 12, posture: 18, blockPosture: 24, range: 2.6, arc: 40, lunge: 6.5 },
  },
  passive: {
    name: 'Riposte',
    description: 'After a deflect your next attack winds up 40% faster. Light attacks can be feinted.',
    mods: { riposteWindupMult: 0.6, lightFeint: true },
  },
  palette: { primary: '#ecebe6', secondary: '#262b44', accent: '#ff0044', skin: '#e8b796', hair: '#feae34', metal: '#e6eef5' },
};

const lancer: CharacterDef = {
  id: 'lancer',
  name: 'Lancer',
  jp: '槍兵',
  weapon: 'Spear',
  weaponKind: 'spear',
  role: 'Zoner',
  description: 'Controls space with the longest reach in the game. Tip hits hurt more; vaults out when crowded.',
  stats: { hp: 100, posture: 100, speed: 6.0, postureRegen: 1 },
  ratings: { power: 3, speed: 3, reach: 5, defense: 2, difficulty: 3 },
  lights: [
    { name: 'Jab', anim: 'thrust', windup: 300, active: 80, recovery: 320, damage: 8, posture: 10, blockPosture: 12, range: 3.7, arc: 25, lunge: 0.4 },
    { name: 'Twin Jab', anim: 'thrust', windup: 280, active: 80, recovery: 320, damage: 8, posture: 10, blockPosture: 12, range: 3.7, arc: 25, lunge: 0.4 },
    { name: 'Crescent', anim: 'slashR', windup: 380, active: 110, recovery: 460, damage: 12, posture: 14, blockPosture: 18, range: 3.5, arc: 80 },
  ],
  heavy: { name: 'Dragon Fang', anim: 'thrust', windup: 640, active: 110, recovery: 520, damage: 18, posture: 24, blockPosture: 30, range: 4.1, arc: 25, lunge: 1.4, feintable: true },
  special: { name: 'Whirlwind', anim: 'spin', windup: 760, active: 220, recovery: 650, damage: 20, posture: 26, blockPosture: 26, range: 3.8, arc: 180, perilous: 'sweep', cooldown: 7000 },
  ability: {
    kind: 'leap',
    name: 'Pole Vault',
    description: 'Vault 6m backwards, invulnerable for most of the jump.',
    cooldown: 6000,
    distance: 6,
    duration: 460,
    iframes: 320,
  },
  passive: { name: 'Reach', description: 'Hits with the outer 30% of a swing deal 25% more damage and posture.', mods: { tipperBonus: 0.25 } },
  palette: { primary: '#124e89', secondary: '#e0e4ec', accent: '#2ce8f5', skin: '#e4a672', hair: '#3e2731', metal: '#cfd8df' },
};

const shade: CharacterDef = {
  id: 'shade',
  name: 'Shade',
  jp: '影',
  weapon: 'Twin Daggers',
  weaponKind: 'daggers',
  role: 'Assassin',
  description: 'Fragile and relentless. Two dodge charges, backstabs and a blink that puts you right behind them.',
  stats: { hp: 90, posture: 90, speed: 6.9, postureRegen: 1.1 },
  ratings: { power: 2, speed: 5, reach: 1, defense: 1, difficulty: 5 },
  lights: [
    { name: 'Slit', anim: 'dualSlash', windup: 210, active: 60, recovery: 240, damage: 6, posture: 7, blockPosture: 9, range: 2.35, arc: 70, lunge: 0.7 },
    { name: 'Slash', anim: 'slashL', windup: 190, active: 60, recovery: 240, damage: 6, posture: 7, blockPosture: 9, range: 2.35, arc: 70, lunge: 0.5 },
    { name: 'Rend', anim: 'slashR', windup: 190, active: 60, recovery: 260, damage: 6, posture: 7, blockPosture: 9, range: 2.35, arc: 70, lunge: 0.5 },
    { name: 'Eviscerate', anim: 'dualSlash', windup: 270, active: 100, recovery: 420, damage: 5, posture: 6, blockPosture: 7, range: 2.4, arc: 70, lunge: 0.8, hits: 2 },
  ],
  heavy: { name: 'Viper Fang', anim: 'thrust', windup: 520, active: 100, recovery: 460, damage: 14, posture: 18, blockPosture: 22, range: 2.4, arc: 40, lunge: 2.0, feintable: true },
  special: { name: 'Throat Grab', anim: 'grab', windup: 650, active: 150, recovery: 650, damage: 22, posture: 25, blockPosture: 25, range: 2.4, arc: 40, lunge: 2.0, perilous: 'grab', cooldown: 7500 },
  ability: {
    kind: 'teleport',
    name: 'Shadow Step',
    description: 'Blink behind an enemy within 9m.',
    cooldown: 9000,
    range: 9,
  },
  passive: { name: 'Ghost', description: 'Two dodge charges. Hits from behind deal 40% more damage.', mods: { dodgeCharges: 2, backstabBonus: 0.4 } },
  palette: { primary: '#3a4466', secondary: '#262b44', accent: '#b55088', skin: '#e8b796', hair: '#e8e8f0', metal: '#b8c0d8' },
};

const reaper: CharacterDef = {
  id: 'reaper',
  name: 'Reaper',
  jp: '死神',
  weapon: 'Scythe',
  weaponKind: 'scythe',
  role: 'Sustain / control',
  description: 'Wide sweeping arcs that are hard to step around. Heals from every hit and hooks fleeing prey back in.',
  stats: { hp: 105, posture: 100, speed: 5.8, postureRegen: 0.95 },
  ratings: { power: 3, speed: 2, reach: 4, defense: 3, difficulty: 3 },
  lights: [
    { name: 'Harvest', anim: 'slashR', windup: 340, active: 110, recovery: 360, damage: 10, posture: 11, blockPosture: 15, range: 3.2, arc: 100, lunge: 0.4 },
    { name: 'Thresh', anim: 'slashL', windup: 320, active: 110, recovery: 360, damage: 10, posture: 11, blockPosture: 15, range: 3.2, arc: 100, lunge: 0.4 },
    { name: 'Gyre', anim: 'spin', windup: 420, active: 160, recovery: 500, damage: 12, posture: 14, blockPosture: 18, range: 3.2, arc: 180 },
  ],
  heavy: { name: 'Execution', anim: 'overhead', windup: 680, active: 120, recovery: 560, damage: 20, posture: 26, blockPosture: 34, range: 3.3, arc: 45, lunge: 0.8, feintable: true },
  special: { name: 'Reaping Arc', anim: 'sweep', windup: 780, active: 200, recovery: 680, damage: 22, posture: 28, blockPosture: 28, range: 3.9, arc: 140, perilous: 'sweep', cooldown: 7000 },
  ability: {
    kind: 'attack',
    name: 'Soul Hook',
    description: 'Fling the scythe chain up to 11m and drag the target right in front of you.',
    cooldown: 9000,
    attack: { name: 'Soul Hook', anim: 'hook', windup: 450, active: 120, recovery: 550, damage: 6, posture: 10, blockPosture: 14, range: 11, arc: 12, pull: 2.0 },
  },
  passive: { name: 'Soul Siphon', description: 'Heal for 20% of all damage you deal.', mods: { lifesteal: 0.2 } },
  palette: { primary: '#193c3e', secondary: '#1e6f75', accent: '#63c74d', skin: '#b9c4bd', hair: '#0f1412', metal: '#a7b5ae' },
};

const monk: CharacterDef = {
  id: 'monk',
  name: 'Monk',
  jp: '武僧',
  weapon: 'Gauntlets',
  weaponKind: 'gauntlets',
  role: 'Posture breaker',
  description: 'Short range, rapid strikes that shred posture, plus a counter stance that turns their offense against them.',
  stats: { hp: 100, posture: 110, speed: 6.4, postureRegen: 1.3 },
  ratings: { power: 3, speed: 5, reach: 1, defense: 4, difficulty: 4 },
  lights: [
    { name: 'Jab', anim: 'punchR', windup: 240, active: 60, recovery: 260, damage: 5, posture: 8, blockPosture: 10, range: 1.9, arc: 60, lunge: 0.6 },
    { name: 'Cross', anim: 'punchL', windup: 220, active: 60, recovery: 260, damage: 5, posture: 8, blockPosture: 10, range: 1.9, arc: 60, lunge: 0.5 },
    { name: 'Hook', anim: 'punchR', windup: 230, active: 60, recovery: 280, damage: 6, posture: 9, blockPosture: 11, range: 1.9, arc: 70, lunge: 0.5 },
    { name: 'Palm Strike', anim: 'uppercut', windup: 300, active: 80, recovery: 420, damage: 8, posture: 14, blockPosture: 18, range: 2.0, arc: 60, lunge: 0.8 },
  ],
  heavy: { name: 'Mountain Breaker', anim: 'punchR', windup: 560, active: 100, recovery: 480, damage: 14, posture: 28, blockPosture: 34, range: 2.1, arc: 50, lunge: 1.5, feintable: true, knockback: 1.0 },
  special: { name: 'Iron Grapple', anim: 'grab', windup: 620, active: 150, recovery: 650, damage: 20, posture: 35, blockPosture: 35, range: 2.3, arc: 45, lunge: 1.5, perilous: 'grab', cooldown: 7500 },
  ability: {
    kind: 'counter',
    name: 'Still Water',
    description: 'Hold a counter stance for 0.75s. If struck by a normal or thrust attack, negate it and strike back.',
    cooldown: 9000,
    duration: 750,
    attack: { name: 'Counter Strike', anim: 'uppercut', windup: 60, active: 80, recovery: 360, damage: 12, posture: 35, blockPosture: 35, range: 2.5, arc: 90, noHitbox: true },
  },
  passive: { name: 'Inner Focus', description: 'Deal 15% more posture damage. Posture recovers 30% faster.', mods: { postureDamageMult: 1.15 } },
  palette: { primary: '#ecebe6', secondary: '#3a4466', accent: '#f77622', skin: '#c28569', hair: '#2a1b10', metal: '#8c6f4a' },
};

const paladin: CharacterDef = {
  id: 'paladin',
  name: 'Paladin',
  jp: '聖騎士',
  weapon: 'Sword & Shield',
  weaponKind: 'swordShield',
  role: 'Defender',
  description: 'A walking wall. Blocking barely dents your posture, and a shield charge punishes anyone who turtles.',
  stats: { hp: 110, posture: 120, speed: 5.6, postureRegen: 1 },
  ratings: { power: 3, speed: 2, reach: 2, defense: 5, difficulty: 1 },
  lights: [
    { name: 'Strike', anim: 'slashR', windup: 310, active: 90, recovery: 330, damage: 9, posture: 10, blockPosture: 13, range: 2.5, arc: 65, lunge: 0.5 },
    { name: 'Backhand', anim: 'slashL', windup: 290, active: 90, recovery: 330, damage: 9, posture: 10, blockPosture: 13, range: 2.5, arc: 65, lunge: 0.4 },
    { name: 'Shield Bash', anim: 'bash', windup: 340, active: 90, recovery: 460, damage: 7, posture: 18, blockPosture: 24, range: 2.0, arc: 60, lunge: 0.7 },
  ],
  heavy: { name: 'Judgement', anim: 'overhead', windup: 640, active: 120, recovery: 540, damage: 18, posture: 26, blockPosture: 34, range: 2.7, arc: 55, lunge: 1.0, feintable: true },
  special: { name: 'Holy Lance', anim: 'thrust', windup: 740, active: 160, recovery: 650, damage: 22, posture: 30, blockPosture: 30, range: 3.8, arc: 25, lunge: 3.0, perilous: 'thrust', cooldown: 7000 },
  ability: {
    kind: 'attack',
    name: 'Shield Charge',
    description: 'Charge 5m behind your shield. Cannot be deflected: block it or get out of the way.',
    cooldown: 8000,
    attack: { name: 'Shield Charge', anim: 'charge', windup: 260, active: 260, recovery: 500, damage: 8, posture: 30, blockPosture: 38, range: 2.0, arc: 60, lunge: 5.0, unparryable: true, knockback: 2.0 },
  },
  passive: { name: 'Bulwark', description: 'Blocking takes 30% less posture damage and covers a wider angle.', mods: { blockPostureMult: 0.7, guardArcBonus: 35 } },
  palette: { primary: '#d4d8de', secondary: '#124e89', accent: '#feae34', skin: '#e8b796', hair: '#733e39', metal: '#e8edf2' },
};

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  ronin,
  juggernaut,
  duelist,
  lancer,
  shade,
  reaper,
  monk,
  paladin,
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

export function isCharacterId(v: unknown): v is CharacterId {
  // own-property check: `in` would also accept inherited keys like "__proto__"
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CHARACTERS, v);
}

export function getAttack(char: CharacterDef, key: AttackKey): AttackDef | null {
  switch (key) {
    case 'h':
      return char.heavy;
    case 'sp':
      return char.special;
    case 'ab':
      return char.ability.kind === 'attack' ? char.ability.attack : null;
    case 'ia':
      return char.ability.kind === 'stance' ? char.ability.attack : null;
    case 'ct':
      return char.ability.kind === 'counter' ? char.ability.attack : null;
    default: {
      const i = Number(key.slice(1));
      return char.lights[i] ?? null;
    }
  }
}

export function lightKey(i: number): AttackKey {
  return `l${i}` as AttackKey;
}
