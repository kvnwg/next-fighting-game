/**
 * The roster. Every character is a weapon archetype with its own move list, stats, passive quirk,
 * perilous special (E) and unique ability (R). Each wears a voxel model from characters/<name>/
 * (mapped in client/render/voxel/fighters.ts); the ids are the original archetype names, kept so
 * saved picks and the ladder carry over, and gameplay only depends on the numbers below.
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
 *  - area:   get out of the ground it marks (or dodge through it as it lands): no jumping it,
 *            and no counter stance takes it
 */
export type Perilous = 'thrust' | 'sweep' | 'grab' | 'area';

/**
 * Where an attack can hit, instead of the cone in front of the attacker:
 *  - line: a strip straight ahead out to `range`, `width` either side of the attacker's line
 *  - ring: all round the attacker, between `inner` and `range` (inner 0: a disc)
 *  - zone: a disc of `radius` round a spot chosen as the attack starts (the nearest foe in front,
 *          out to `range`): see Fighter.aim
 */
export type AttackShape = { kind: 'line'; width: number } | { kind: 'ring'; inner: number } | { kind: 'zone'; radius: number };

/**
 * l0..l2 = light chain, h/h1/h2 = heavy chain, dl/dh = dash light/heavy (out of a forward dodge),
 * bl/bh = backstep light/heavy (walking away), jl/jh = jump light/heavy (in the air),
 * sp = special, ab = ability attack, ia = stance attack, ct = counter strike
 */
export type AttackKey = 'l0' | 'l1' | 'l2' | 'l3' | 'l4' | 'h' | 'sp' | 'ab' | 'ia' | 'ct' | ExtraKey;

/** The moves beyond the light chain, the first heavy, the special and the ability. */
export type ExtraKey = 'h1' | 'h2' | 'dl' | 'dh' | 'bl' | 'bh' | 'jl' | 'jh';
export const EXTRA_KEYS: readonly ExtraKey[] = ['h1', 'h2', 'dl', 'dh', 'bl', 'bh', 'jl', 'jh'];

/** Heavy attacks of every kind (they share hyper armor, heavy trails and sounds). */
export function isHeavyKey(key: string | null | undefined): boolean {
  return key === 'h' || key === 'h1' || key === 'h2' || key === 'dh' || key === 'bh' || key === 'jh';
}

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
  /** Where it hits, if not the cone in front (see AttackShape). */
  shape?: AttackShape;
  /**
   * A vault: the lunge carries the attacker through the air over anyone in the way, untouchable,
   * landing as the windup ends; the hit comes on landing.
   */
  vault?: boolean;
  /**
   * Thrown (a line attack): the weapon leaves the hand as the windup ends, flies out to the end of
   * the line over the first half of the active frames and comes back to the hand over the second.
   * Each hit lands only where the weapon has got to (see thrownSpan); the thrower can't turn while
   * it's out.
   */
  thrown?: boolean;
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
  /** The light chain: three presses in succession. */
  lights: AttackDef[];
  /** The first heavy; `extra.h1` and `extra.h2` follow it in the heavy chain. */
  heavy: AttackDef;
  extra: Record<ExtraKey, AttackDef>;
  special: AttackDef & { cooldown: number };
  ability: AbilityDef;
  passive: { name: string; description: string; mods: PassiveMods };
  palette: Palette;
}

type Named = { name: string; anim: AttackAnim } & Partial<AttackDef>;

/**
 * The extended moveset, derived from a character's opening light and first heavy so it keeps their
 * speed and weight: two more heavies to chain, a dash attack of each weight out of a forward dodge,
 * a retreating attack of each weight, and an air attack of each weight. `n` names each move and
 * picks its swing; anything else it sets overrides the derived numbers.
 */
/** The widest an attack's hit cone gets, each side of straight ahead (degrees). */
export const ARC_MAX = 55;

/** Every fighter's opening light comes out in the same time, whatever they swing. */
export const FIRST_LIGHT_WINDUP = 260;

function kit(light: AttackDef, heavy: AttackDef, n: Record<ExtraKey, Named>): Record<ExtraKey, AttackDef> {
  const r = (v: number) => Math.round(v);
  const scaled = (b: AttackDef, k: { w: number; a?: number; rc: number; d: number; p: number; bp?: number; rg?: number; ar?: number }): AttackDef => ({
    name: '',
    anim: b.anim,
    windup: r(b.windup * k.w),
    active: r(b.active * (k.a ?? 1)),
    recovery: r(b.recovery * k.rc),
    damage: r(b.damage * k.d),
    posture: r(b.posture * k.p),
    blockPosture: r(b.blockPosture * (k.bp ?? k.p)),
    range: +(b.range + (k.rg ?? 0)).toFixed(2),
    // attacks hit in front of the fighter, never around them
    arc: r(Math.min(ARC_MAX, b.arc * (k.ar ?? 1))),
  });
  const base: Record<ExtraKey, AttackDef> = {
    // the heavy chain: a second heavy a touch quicker, then a big finisher that knocks back
    h1: { ...scaled(heavy, { w: 1.05, rc: 0.95, d: 1, p: 1, ar: 1.15 }), lunge: (heavy.lunge ?? 0.8) * 0.9 },
    h2: { ...scaled(heavy, { w: 1.25, rc: 1.12, d: 1.25, p: 1.2, bp: 1.15, ar: 1.3 }), lunge: (heavy.lunge ?? 0.8) * 0.8, knockback: 1 },
    // out of a forward dodge: quick, covering ground
    dl: { ...scaled(light, { w: 0.8, rc: 1.05, d: 1.15, p: 1.1, rg: 0.2, ar: 0.7 }), lunge: 1.6 },
    dh: { ...scaled(heavy, { w: 0.8, rc: 1, d: 1.05, p: 1, rg: 0.2, ar: 0.8 }), lunge: 2.6 },
    // walking away: the attack gives ground as it lands
    bl: { ...scaled(light, { w: 1, rc: 1, d: 0.9, p: 0.9, ar: 1.1 }), lunge: -0.9 },
    bh: { ...scaled(heavy, { w: 0.9, rc: 1, d: 0.9, p: 0.9 }), lunge: -1.2 },
    // in the air: the jump commits you, so the blow carries your whole weight: more damage and
    // much more posture than the same attack on the ground
    jl: { ...scaled(light, { w: 0.75, rc: 1.1, d: 1.4, p: 1.6, bp: 1.5, ar: 1.2 }), lunge: 1.4 },
    jh: { ...scaled(heavy, { w: 0.6, rc: 1.05, d: 1.35, p: 1.6, bp: 1.5 }), lunge: 1.8, knockback: 0.8 },
  };
  const out = {} as Record<ExtraKey, AttackDef>;
  for (const k of EXTRA_KEYS) {
    const m = { ...base[k], ...n[k] };
    if (m.lunge !== undefined) m.lunge = Math.round(m.lunge * 100) / 100;
    out[k] = m;
  }
  return out;
}

const ronin: BaseDef = {
  id: 'ronin',
  name: 'Ronin',
  jp: '浪人',
  weapon: 'Katana',
  weaponKind: 'katana',
  role: 'All-rounder',
  description: 'A wandering swordsman in a straw kasa. Honest timings, a generous deflect window and a lightning-fast draw cut.',
  stats: { hp: 200, posture: 200, speed: 2.5, postureRegen: 1 },
  ratings: { power: 3, speed: 3, reach: 3, defense: 4, difficulty: 2 },
  lights: [
    { name: 'Swallow Cut', anim: 'slashR', windup: FIRST_LIGHT_WINDUP, active: 90, recovery: 320, damage: 9, posture: 10, blockPosture: 14, range: 3, arc: 36, lunge: 0.6 },
    { name: 'Rising Petal', anim: 'slashL', windup: 200, active: 90, recovery: 320, damage: 9, posture: 10, blockPosture: 14, range: 3, arc: 36, lunge: 0.5 },
    // tsubame-gaeshi: two cuts, there and back, a blink apart
    { name: 'Twin Swallow', anim: 'slashR', windup: 250, active: 150, recovery: 470, damage: 7, posture: 9, blockPosture: 11, range: 3.1, arc: 33, lunge: 0.8, hits: 2 },
  ],
  heavy: { name: 'Heaven Splitter', anim: 'overhead', windup: 560, active: 120, recovery: 450, damage: 18, posture: 26, blockPosture: 34, range: 3.2, arc: 30, lunge: 1.2, feintable: true },
  special: { name: 'Gatotsu', anim: 'thrust', windup: 720, active: 160, recovery: 650, damage: 22, posture: 30, blockPosture: 30, range: 4.3, arc: 15, lunge: 3.0, perilous: 'thrust', cooldown: 7000 },
  ability: {
    kind: 'stance',
    name: 'Iai Stance',
    description: 'Sheathe your blade. Attack within 1.5s to unleash Iai Flash, a near-instant draw cut that wrecks posture.',
    cooldown: 8000,
    duration: 1500,
    attack: { name: 'Iai Flash', anim: 'draw', windup: 130, active: 90, recovery: 450, damage: 16, posture: 32, blockPosture: 38, range: 3.6, arc: 38, lunge: 2.0 },
  },
  passive: { name: 'Clear Mind', description: 'Deflect window is 40ms longer.', mods: { parryWindowBonus: 40 } },
  palette: { primary: '#2a2b34', secondary: '#e6dcc4', accent: '#c8323c', skin: '#e8d9c4', hair: '#141418', metal: '#d9e2ec' },
};

const juggernaut: BaseDef = {
  id: 'juggernaut',
  name: 'Warden',
  jp: '石衛',
  weapon: 'Warhammer',
  weaponKind: 'greathammer',
  role: 'Heavy bruiser',
  description: 'A living fortress of stone and gold. Slow, huge and unstoppable: every swing crushes guards, and heavies shrug off interruptions.',
  stats: { hp: 260, posture: 260, speed: 1.7, postureRegen: 0.9 },
  ratings: { power: 5, speed: 1, reach: 3, defense: 3, difficulty: 2 },
  lights: [
    // dragged back along the floor and whipped round at shin height, the body dropping almost flat
    { name: 'Drag Sweep', anim: 'sweep', windup: FIRST_LIGHT_WINDUP, active: 120, recovery: 420, damage: 14, posture: 16, blockPosture: 22, range: 3.6, arc: 41, lunge: 0.5 },
    // one flat helicopter whirl overhead: slower to come out, but it sweeps a wide arc
    { name: 'Backhand', anim: 'spin', windup: 640, active: 130, recovery: 560, damage: 18, posture: 20, blockPosture: 28, range: 3.7, arc: 55, lunge: 0.6 },
    // up from the ground through them until the hammer stands straight up at full stretch
    { name: 'Shoulder Chop', anim: 'uppercut', windup: 520, active: 120, recovery: 520, damage: 16, posture: 20, blockPosture: 26, range: 3.6, arc: 38, lunge: 0.7 },
  ],
  heavy: { name: 'Windmill Slam', anim: 'slam', windup: 780, active: 140, recovery: 650, damage: 26, posture: 34, blockPosture: 46, range: 3.8, arc: 28, lunge: 1.0, feintable: true, knockback: 1.2 },
  // the hammer brought down so hard the ground splits in a straight line out ahead of him: jump the
  // fissure as it opens under you, or be off its line
  special: { name: 'Fault Line', anim: 'slam', windup: 820, active: 160, recovery: 760, damage: 24, posture: 30, blockPosture: 30, range: 9, arc: 8, shape: { kind: 'line', width: 0.9 }, perilous: 'sweep', cooldown: 7500 },
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
  palette: { primary: '#6e6c66', secondary: '#3a3834', accent: '#d8b25a', skin: '#8a857a', hair: '#3a3834', metal: '#9aa3ad' },
};

const duelist: BaseDef = {
  id: 'duelist',
  name: 'Duelist',
  jp: '細剣士',
  weapon: 'Rapier',
  weaponKind: 'rapier',
  role: 'Fencer / mind games',
  description: 'A dashing fencer in a green cape. Quick thrusts with long reach; feints everything and punishes deflects with blistering ripostes.',
  stats: { hp: 180, posture: 180, speed: 2.7, postureRegen: 1.05 },
  ratings: { power: 2, speed: 4, reach: 4, defense: 2, difficulty: 4 },
  lights: [
    { name: 'Lunge', anim: 'thrust', windup: FIRST_LIGHT_WINDUP, active: 70, recovery: 280, damage: 7, posture: 9, blockPosture: 10, range: 3.4, arc: 16, lunge: 0.8, feintable: true },
    { name: 'Rising Cut', anim: 'thrust', windup: 220, active: 70, recovery: 280, damage: 7, posture: 9, blockPosture: 10, range: 3.4, arc: 16, lunge: 0.5, feintable: true },
    // a cut, not a thrust: it covers a wider angle
    { name: 'Coupé', anim: 'slashL', windup: 220, active: 70, recovery: 300, damage: 7, posture: 9, blockPosture: 10, range: 3.3, arc: 25, lunge: 0.5, feintable: true },
  ],
  heavy: { name: 'Moulinet', anim: 'thrust', windup: 560, active: 100, recovery: 480, damage: 15, posture: 22, blockPosture: 28, range: 3.7, arc: 16, lunge: 1.5, feintable: true },
  special: { name: 'Coup de Grace', anim: 'thrust', windup: 620, active: 140, recovery: 600, damage: 20, posture: 30, blockPosture: 30, range: 4.7, arc: 15, lunge: 3.5, perilous: 'thrust', cooldown: 6500 },
  // the parry that answers: struck in it, he takes the blade aside and runs them through before
  // they can guard (the riposte lands on the instant, like the Monk's counter)
  ability: {
    kind: 'counter',
    name: 'Prise de Fer',
    description: 'Salute and hold a parry for 0.8s. If struck by a normal or thrust attack, take the blade aside and riposte: Coup Droit, a thrust that cannot be blocked.',
    cooldown: 8000,
    duration: 800,
    attack: { name: 'Coup Droit', anim: 'thrust', windup: 80, active: 80, recovery: 420, damage: 14, posture: 32, blockPosture: 32, range: 3.4, arc: 30, noHitbox: true },
  },
  passive: {
    name: 'Riposte',
    description: 'After a deflect your next attack winds up 40% faster. Light attacks can be feinted.',
    mods: { riposteWindupMult: 0.6, lightFeint: true },
  },
  palette: { primary: '#4f7a3a', secondary: '#ecebe6', accent: '#8fd46a', skin: '#e8b796', hair: '#e0c060', metal: '#e6eef5' },
};

const lancer: BaseDef = {
  id: 'lancer',
  name: 'Lancer',
  jp: '槍騎士',
  weapon: 'Golden Spear',
  weaponKind: 'spear',
  role: 'Zoner',
  description: 'A horned knight with a lightning spear. Controls space with the longest reach in the game; tip hits hurt more, he hurls the spear the length of the field and it flies back to his hand, and he vaults clean over you to strike your back.',
  stats: { hp: 200, posture: 200, speed: 2.5, postureRegen: 1 },
  ratings: { power: 3, speed: 3, reach: 5, defense: 2, difficulty: 3 },
  lights: [
    { name: 'Piercing Step', anim: 'thrust', windup: FIRST_LIGHT_WINDUP, active: 80, recovery: 320, damage: 8, posture: 10, blockPosture: 12, range: 4.3, arc: 15, lunge: 0.4 },
    // two jabs, in and in again: two hits to read and deflect
    { name: 'Rising Fang', anim: 'thrust', windup: 260, active: 160, recovery: 320, damage: 5, posture: 6, blockPosture: 7, range: 4.3, arc: 15, lunge: 0.5, hits: 2 },
    { name: 'Flat Sweep', anim: 'slashR', windup: 380, active: 110, recovery: 460, damage: 12, posture: 14, blockPosture: 18, range: 4.1, arc: 44 },
  ],
  heavy: { name: 'Lunging Cut', anim: 'thrust', windup: 640, active: 110, recovery: 520, damage: 18, posture: 24, blockPosture: 30, range: 4.7, arc: 15, lunge: 1.4, feintable: true },
  // Thunderreach raised to the sky until the lightning pours down it, then thrown the length of the
  // field along the line marked on the ground; it flies back to his hand, through anyone still on
  // the line: get off it before it goes, and stay off it until it's home
  special: { name: 'Light the Way', anim: 'thrust', windup: 900, active: 720, recovery: 420, damage: 13, posture: 18, blockPosture: 18, range: 13, arc: 6, hits: 2, shape: { kind: 'line', width: 0.75 }, thrown: true, perilous: 'area', cooldown: 8000 },
  // planted and vaulted over you, untouchable in the air, and driven down behind him as he lands,
  // lightning bursting all round: it takes you in the back unless you turn to meet it
  ability: {
    kind: 'attack',
    name: 'Vault Strike',
    description: 'Vault 5m forward on the spear, untouchable in the air, and drive it down behind you as you land: lightning bursts all round, taking them in the back unless they turn to face you.',
    cooldown: 7000,
    attack: { name: 'Vault Strike', anim: 'thrust', windup: 520, active: 120, recovery: 520, damage: 14, posture: 22, blockPosture: 26, range: 2.4, arc: 180, lunge: 5, vault: true, shape: { kind: 'ring', inner: 0 } },
  },
  passive: { name: 'Reach', description: 'Hits with the outer 30% of a swing deal 25% more damage and posture.', mods: { tipperBonus: 0.25 } },
  palette: { primary: '#26242a', secondary: '#d9d4c8', accent: '#f2c14e', skin: '#e4a672', hair: '#3e2731', metal: '#f2d27a' },
};

const shade: BaseDef = {
  id: 'shade',
  name: 'Assassin',
  jp: '影刃',
  weapon: 'Twin Daggers',
  weaponKind: 'daggers',
  role: 'Assassin',
  description: 'A hooded killer with two knives. Fragile and relentless: two dodge charges, backstabs and a blink that puts you right behind them.',
  stats: { hp: 180, posture: 180, speed: 2.9, postureRegen: 1.1 },
  ratings: { power: 2, speed: 5, reach: 1, defense: 1, difficulty: 5 },
  lights: [
    { name: 'Scissor Cut', anim: 'dualSlash', windup: FIRST_LIGHT_WINDUP, active: 60, recovery: 240, damage: 6, posture: 7, blockPosture: 9, range: 2.65, arc: 38, lunge: 0.7 },
    // a full turn with both blades out: a touch slower to start
    { name: 'Cross Open', anim: 'dualSlash', windup: 230, active: 60, recovery: 260, damage: 6, posture: 7, blockPosture: 9, range: 2.65, arc: 44, lunge: 0.5 },
    // three quick stabs: three hits to read
    { name: 'Whirl', anim: 'spin', windup: 190, active: 120, recovery: 260, damage: 2, posture: 3, blockPosture: 3, range: 2.65, arc: 33, lunge: 0.5, hits: 3 },
    // a front flip that lands both blades
  ],
  heavy: { name: 'Falling Fang', anim: 'overhead', windup: 520, active: 100, recovery: 460, damage: 14, posture: 18, blockPosture: 22, range: 2.7, arc: 22, lunge: 2.0, feintable: true },
  special: { name: 'Swallow Dive', anim: 'grab', windup: 650, active: 150, recovery: 650, damage: 22, posture: 25, blockPosture: 25, range: 2.7, arc: 22, lunge: 2.0, perilous: 'grab', cooldown: 7500 },
  ability: {
    kind: 'teleport',
    name: 'Shadow Step',
    description: 'Blink behind an enemy within 9m.',
    cooldown: 9000,
    range: 9,
  },
  passive: { name: 'Ghost', description: 'Two dodge charges. Hits from behind deal 40% more damage.', mods: { dodgeCharges: 2, backstabBonus: 0.4 } },
  palette: { primary: '#173a3a', secondary: '#262b30', accent: '#38bea8', skin: '#e8b796', hair: '#1a2a2a', metal: '#b8c0d8' },
};

const reaper: BaseDef = {
  id: 'reaper',
  name: 'Wraith',
  jp: '鎌鬼',
  weapon: 'Chain Sickle',
  weaponKind: 'scythe',
  role: 'Sustain / control',
  description: 'A faceless spirit that drifts on mist. Wide sweeping arcs that are hard to step around; heals from every hit and hooks fleeing prey back in.',
  stats: { hp: 210, posture: 200, speed: 2.3, postureRegen: 0.95 },
  ratings: { power: 3, speed: 2, reach: 4, defense: 3, difficulty: 3 },
  lights: [
    { name: 'Overhand Cast', anim: 'slashR', windup: FIRST_LIGHT_WINDUP, active: 110, recovery: 360, damage: 10, posture: 11, blockPosture: 15, range: 3.8, arc: 55, lunge: 0.4 },
    { name: 'Dart Cast', anim: 'slashL', windup: 320, active: 110, recovery: 360, damage: 10, posture: 11, blockPosture: 15, range: 3.8, arc: 55, lunge: 0.4 },
    { name: 'Gyre', anim: 'spin', windup: 420, active: 160, recovery: 500, damage: 12, posture: 14, blockPosture: 18, range: 3.8, arc: 55 },
  ],
  heavy: { name: 'Execution', anim: 'overhead', windup: 680, active: 120, recovery: 560, damage: 20, posture: 26, blockPosture: 34, range: 3.9, arc: 25, lunge: 0.8, feintable: true },
  // the sickle planted and a ring of soulfire bursting up out of the ground round him, from 2m out to
  // 6m: hug him inside it, or be beyond it
  special: { name: 'Requiem', anim: 'overhead', windup: 820, active: 160, recovery: 700, damage: 22, posture: 28, blockPosture: 28, range: 6, arc: 180, shape: { kind: 'ring', inner: 2 }, perilous: 'area', cooldown: 7500 },
  ability: {
    kind: 'attack',
    name: 'Soul Hook',
    description: 'Fling the scythe chain up to 11m and drag the target right in front of you.',
    cooldown: 9000,
    attack: { name: 'Soul Hook', anim: 'hook', windup: 450, active: 120, recovery: 550, damage: 6, posture: 10, blockPosture: 14, range: 11, arc: 12, pull: 2.0 },
  },
  passive: { name: 'Soul Siphon', description: 'Heal for 20% of all damage you deal.', mods: { lifesteal: 0.2 } },
  palette: { primary: '#d8d6d0', secondary: '#2a2a30', accent: '#c4161c', skin: '#e6e4de', hair: '#101012', metal: '#a7b5ae' },
};

const monk: BaseDef = {
  id: 'monk',
  name: 'Monk',
  jp: '老師',
  weapon: 'Fists',
  weaponKind: 'gauntlets',
  role: 'Posture breaker',
  description: 'An old master who has outlived braver men. Short range, rapid strikes that shred posture, plus a counter stance that turns their offense against them.',
  stats: { hp: 200, posture: 220, speed: 2.6, postureRegen: 1.3 },
  ratings: { power: 3, speed: 5, reach: 1, defense: 4, difficulty: 4 },
  lights: [
    { name: 'Jab', anim: 'punchR', windup: FIRST_LIGHT_WINDUP, active: 60, recovery: 260, damage: 5, posture: 8, blockPosture: 10, range: 2.2, arc: 33, lunge: 0.6 },
    { name: 'Cross', anim: 'punchL', windup: 220, active: 60, recovery: 260, damage: 5, posture: 8, blockPosture: 10, range: 2.2, arc: 33, lunge: 0.5 },
    // a spinning hook kick: a beat slower than the hands, but the leg reaches further
    { name: 'Whirlwind Kick', anim: 'spin', windup: 280, active: 60, recovery: 300, damage: 6, posture: 9, blockPosture: 11, range: 2.5, arc: 38, lunge: 0.4 },
  ],
  heavy: { name: 'Mountain Breaker', anim: 'punchR', windup: 560, active: 100, recovery: 480, damage: 14, posture: 28, blockPosture: 34, range: 2.4, arc: 28, lunge: 1.5, feintable: true, knockback: 1.0 },
  special: { name: 'Iron Grapple', anim: 'grab', windup: 620, active: 150, recovery: 650, damage: 20, posture: 35, blockPosture: 35, range: 2.6, arc: 25, lunge: 1.5, perilous: 'grab', cooldown: 7500 },
  ability: {
    kind: 'counter',
    name: 'Still Water',
    description: 'Hold a counter stance for 0.75s. If struck by a normal or thrust attack, negate it and strike back.',
    cooldown: 9000,
    duration: 750,
    attack: { name: 'Counter Strike', anim: 'uppercut', windup: 60, active: 80, recovery: 360, damage: 12, posture: 35, blockPosture: 35, range: 2.8, arc: 50, noHitbox: true },
  },
  passive: { name: 'Inner Focus', description: 'Deal 15% more posture damage. Posture recovers 30% faster.', mods: { postureDamageMult: 1.15 } },
  palette: { primary: '#b0432a', secondary: '#e8e0d0', accent: '#f2c14e', skin: '#c28569', hair: '#e8e4dc', metal: '#8c6f4a' },
};

const paladin: BaseDef = {
  id: 'paladin',
  name: 'Knight',
  jp: '騎士',
  weapon: 'Greatsword & Shield',
  weaponKind: 'swordShield',
  role: 'Defender',
  description: 'A bronze-armoured knight behind a swirl shield. A walking wall: blocking barely dents your posture, and a shield charge punishes anyone who turtles.',
  stats: { hp: 220, posture: 240, speed: 2.2, postureRegen: 1 },
  ratings: { power: 3, speed: 2, reach: 2, defense: 5, difficulty: 1 },
  lights: [
    { name: 'Strike', anim: 'slashR', windup: FIRST_LIGHT_WINDUP, active: 90, recovery: 330, damage: 9, posture: 10, blockPosture: 13, range: 2.8, arc: 36, lunge: 0.5 },
    { name: 'Backhand', anim: 'slashL', windup: 290, active: 90, recovery: 330, damage: 9, posture: 10, blockPosture: 13, range: 2.8, arc: 36, lunge: 0.4 },
    { name: 'Shield Bash', anim: 'bash', windup: 340, active: 90, recovery: 460, damage: 7, posture: 18, blockPosture: 24, range: 2.3, arc: 33, lunge: 0.7 },
  ],
  heavy: { name: 'Judgement', anim: 'overhead', windup: 640, active: 120, recovery: 540, damage: 18, posture: 26, blockPosture: 34, range: 3, arc: 30, lunge: 1.0, feintable: true },
  special: { name: 'Holy Lance', anim: 'thrust', windup: 740, active: 160, recovery: 650, damage: 22, posture: 30, blockPosture: 30, range: 4.1, arc: 15, lunge: 3.0, perilous: 'thrust', cooldown: 7000 },
  ability: {
    kind: 'attack',
    name: 'Shield Charge',
    description: 'Charge 5m behind your shield. Cannot be deflected: block it or get out of the way.',
    cooldown: 8000,
    attack: { name: 'Shield Charge', anim: 'charge', windup: 260, active: 260, recovery: 500, damage: 8, posture: 30, blockPosture: 38, range: 2.3, arc: 33, lunge: 5.0, unparryable: true, knockback: 2.0 },
  },
  passive: { name: 'Bulwark', description: 'Blocking takes 30% less posture damage and covers a wider angle.', mods: { blockPostureMult: 0.7, guardArcBonus: 35 } },
  palette: { primary: '#5a4a2e', secondary: '#1e2a4a', accent: '#c98f45', skin: '#e8b796', hair: '#733e39', metal: '#d9b47a' },
};

type BaseDef = Omit<CharacterDef, 'extra'>;

/** What each character calls its extended moves and how each one swings (see `kit`). */
const EXTRA: Record<CharacterId, Record<ExtraKey, Named>> = {
  ronin: {
    h1: { name: 'Ground Wheel', anim: 'slashL' },
    h2: { name: 'Crescent Moon', anim: 'spin' },
    dl: { name: 'Gale Step', anim: 'thrust' },
    dh: { name: 'Thunder Draw', anim: 'slashR' },
    bl: { name: 'Fading Cut', anim: 'slashL' },
    bh: { name: 'Mountain Wall', anim: 'overhead' },
    jl: { name: 'Swallow Dive', anim: 'slashR' },
    jh: { name: 'Falling Star', anim: 'overhead' },
  },
  juggernaut: {
    h1: { name: 'Rising Cleave', anim: 'uppercut' },
    h2: { name: 'Earthbreaker', anim: 'spin', knockback: 1.4 },
    dl: { name: 'Charging Uppercut', anim: 'thrust', lunge: 1.2 },
    dh: { name: 'Diving Smash', anim: 'slam', lunge: 2.2 },
    bl: { name: 'Ram', anim: 'thrust' },
    bh: { name: 'Retreating Sweep', anim: 'uppercut' },
    jl: { name: 'Air Whirl', anim: 'overhead' },
    jh: { name: 'Meteor', anim: 'slam', knockback: 1.2 },
  },
  duelist: {
    h1: { name: 'Tranchant', anim: 'thrust' },
    h2: { name: 'Grand Coupé', anim: 'slashR' },
    // the hop and deep lunge, now what a forward dodge flows into
    dl: { name: 'Balestra', anim: 'thrust', windup: 300, active: 80, recovery: 420, damage: 10, posture: 12, blockPosture: 14, range: 3.6, arc: 16, lunge: 1.4, feintable: true },
    dh: { name: 'Flèche Dive', anim: 'thrust' },
    bl: { name: 'Retreating Cut', anim: 'slashL' },
    bh: { name: 'Cartwheel Cut', anim: 'spin' },
    jl: { name: 'Aerial Sweep', anim: 'thrust' },
    jh: { name: 'Somersault Plunge', anim: 'thrust' },
  },
  lancer: {
    h1: { name: 'Cross Cleave', anim: 'sweep' },
    h2: { name: 'Thunderclap', anim: 'spin' },
    dl: { name: 'Serpent Lunge', anim: 'thrust' },
    dh: { name: 'Ascending Dragon', anim: 'thrust' },
    bl: { name: 'Parting Sweep', anim: 'thrust' },
    bh: { name: 'Wheel Retreat', anim: 'slashR' },
    jl: { name: 'Skywheel', anim: 'thrust' },
    jh: { name: 'Skyfall Plunge', anim: 'slam' },
  },
  shade: {
    h1: { name: 'Long Thorn', anim: 'thrust' },
    h2: { name: 'Sky Lotus', anim: 'spin', hits: 2 },
    // two cuts on the way through, out of a forward dodge
    dl: { name: 'Dart', anim: 'dualSlash', windup: 300, active: 100, recovery: 420, damage: 5, posture: 6, blockPosture: 7, range: 2.7, arc: 38, lunge: 2.2, hits: 2 },
    dh: { name: 'Corkscrew', anim: 'thrust' },
    bl: { name: 'Fan Retreat', anim: 'slashL' },
    bh: { name: 'Low Viper', anim: 'thrust' },
    jl: { name: 'Cartwheel', anim: 'spin' },
    jh: { name: 'Nail Down', anim: 'thrust' },
  },
  reaper: {
    h1: { name: 'Severance', anim: 'slashL' },
    h2: { name: 'Requiem', anim: 'spin' },
    dl: { name: 'Drift Reap', anim: 'slashR' },
    dh: { name: 'Soul Rend', anim: 'sweep' },
    bl: { name: 'Mournful Step', anim: 'slashL' },
    bh: { name: 'Grave Wind', anim: 'spin' },
    jl: { name: 'Ghost Wheel', anim: 'slashR' },
    jh: { name: 'Last Rites', anim: 'overhead' },
  },
  monk: {
    h1: { name: 'Tiger Palm', anim: 'punchL' },
    h2: { name: 'Heaven Shaker', anim: 'uppercut' },
    // the uppercut that used to close the light chain, now thrown out of a forward dodge
    dl: { name: 'Rising Dragon', anim: 'uppercut', windup: 300, active: 80, recovery: 420, damage: 8, posture: 14, blockPosture: 18, range: 2.3, arc: 33, lunge: 1.4 },
    dh: { name: 'Charging Ox', anim: 'punchR' },
    bl: { name: 'Crane Step', anim: 'punchL' },
    bh: { name: 'Turning Mountain', anim: 'spin' },
    jl: { name: 'Falling Leaf Kick', anim: 'spin' },
    jh: { name: 'Thunder Heel', anim: 'slam' },
  },
  paladin: {
    h1: { name: 'Oathkeeper', anim: 'slashL' },
    h2: { name: 'Bronze Verdict', anim: 'overhead' },
    dl: { name: 'Lunging Edge', anim: 'thrust' },
    dh: { name: 'Rampart Charge', anim: 'bash' },
    bl: { name: 'Guarded Cut', anim: 'slashR' },
    bh: { name: 'Shield Wall', anim: 'bash' },
    jl: { name: 'Leaping Strike', anim: 'slashR' },
    jh: { name: 'Crashing Oath', anim: 'overhead' },
  },
};

/** The follow-up hits of a string wind up this much slower than they're listed: hits come in succession, not in a flurry. */
const CHAIN_SLOW = 1.2;
const slowChain = (c: BaseDef): BaseDef => ({ ...c, lights: c.lights.map((l, i) => (i === 0 ? l : { ...l, windup: Math.round(l.windup * CHAIN_SLOW) })) });
const withExtra = (b: BaseDef): CharacterDef => {
  const c = slowChain(b);
  return { ...c, extra: kit(c.lights[0], c.heavy, EXTRA[c.id]) };
};

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  ronin: withExtra(ronin),
  juggernaut: withExtra(juggernaut),
  duelist: withExtra(duelist),
  lancer: withExtra(lancer),
  shade: withExtra(shade),
  reaper: withExtra(reaper),
  monk: withExtra(monk),
  paladin: withExtra(paladin),
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

export function isCharacterId(v: unknown): v is CharacterId {
  // own-property check: `in` would also accept inherited keys like "__proto__"
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CHARACTERS, v);
}

/** Each fighter's body size relative to the reference body (the renderer's model scale), for spacing paired animations. */
export const BODY_SCALE: Record<CharacterId, number> = { ronin: 0.94, juggernaut: 1.19, duelist: 0.84, lancer: 1.0, shade: 0.88, reaper: 1.12, monk: 0.84, paladin: 1.02 };

/**
 * How far apart an execution stands the pair (m): one executeDistance per unit of the bigger body,
 * except for fighters whose finisher is hand to hand. The Monk's palms reach about a metre, so he
 * stands in close, a little further back from a bigger victim.
 */
export function executeSpacing(executioner: CharacterId, victim: CharacterId, base: number): number {
  if (executioner === 'monk') return 1.05 + 0.35 * BODY_SCALE[victim];
  return base * Math.max(BODY_SCALE[executioner] ?? 1, BODY_SCALE[victim] ?? 1);
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
    case 'h1':
    case 'h2':
    case 'dl':
    case 'dh':
    case 'bl':
    case 'bh':
    case 'jl':
    case 'jh':
      return char.extra[key];
    default: {
      const i = Number(key.slice(1));
      return char.lights[i] ?? null;
    }
  }
}

export function lightKey(i: number): AttackKey {
  return `l${i}` as AttackKey;
}
