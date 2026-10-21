// All combat timing is in 60 Hz ticks ("frames"); distances are in meters.

export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
export const DT = 1 / TICK_RATE;

export const ARENA_RADIUS = 7.5;
export const FIGHTER_RADIUS = 0.45;
export const MIN_SEPARATION = 0.9;
export const START_DISTANCE = 5;

export const WALK_SPEED = 3.4;
export const BACK_SPEED = 2.6;
export const STRAFE_SPEED = 3.0;
export const BLOCK_SPEED_SCALE = 0.45;
export const AIR_CONTROL = 0.6;
export const GRAVITY = 24;
export const JUMP_VELOCITY = 7.6;
// Light attacks pass under a target this high off the ground.
export const LIGHT_HEIGHT_LIMIT = 0.9;

export const MAX_HP = 100;
export const MAX_POSTURE = 100;
// Posture comes back slowly, and only once you stop: none while attacking, dodging or reeling,
// and not until this long after the last posture damage or the last attack or dodge.
export const POSTURE_REGEN_DELAY = 150;
export const POSTURE_CALM_DELAY = 50;
export const POSTURE_REGEN = 0.16;
export const POSTURE_REGEN_IDLE_SCALE = 1.5;
// Clean hits wear posture down too, and enough of them break the guard.
export const HIT_POSTURE_SCALE = 0.5;

export const INPUT_BUFFER = 9;
export const PARRY_WINDOW = 8;
export const PARRY_WHIFF_RECOVERY = 20;
export const BLOCK_RELEASE_RECOVERY = 4;
export const PARRY_STAGGER = 20;
export const PARRY_POSTURE_DAMAGE = 22;
export const GUARD_BREAK_STAGGER = 45;
export const GUARD_BREAK_BONUS = 1.5;
// The guard comes back whole once a break's stagger ends.
export const GUARD_BREAK_POSTURE_RESET = 0;

export const KNOCKDOWN_FRAMES = 60;
export const GETUP_FRAMES = 22;
export const WAKE_INVULN = 10;
export const GETUP_ROLL_DISTANCE = 1.6;

export const DODGE_FRAMES = 21;
export const DODGE_MOVE_FRAMES = 14;
export const DODGE_IFRAME_START = 4;
export const DODGE_IFRAME_END = 14;
export const DODGE_DISTANCE = 3.4;
export const DODGE_CHARGES = 2;
export const DODGE_RECHARGE = 120;

export const COMBO_SCALING_STEP = 0.1;
export const COMBO_SCALING_FLOOR = 0.5;

// A forward dodge turns LIGHT/HEAVY into dash attacks from this dodge frame on,
// and for this many ticks after the dodge ends.
export const DASH_CANCEL_FROM = 7;
export const DASH_ATTACK_WINDOW = 8;
// Walking away at least this hard turns LIGHT/HEAVY into retreating attacks.
export const BACK_ATTACK_THRESHOLD = 0.5;
// A guard counter deflects the incoming attack and staggers its owner this long.
export const COUNTER_STAGGER = 16;

// Holding HEAVY this long turns it into a critical (white glow) attack.
export const CRIT_HOLD_FRAMES = 10;
export const CRIT_COOLDOWN = 240;

export const ROUNDS_TO_WIN = 2;
export const ROUND_TIME = 60 * TICK_RATE;
export const ROUND_INTRO_FRAMES = 150;
export const ROUND_END_FRAMES = 150;

export const HITSTOP = {
  light: 4,
  heavy: 8,
  block: 3,
  parry: 10,
  guardBreak: 14,
  knockdown: 10,
} as const;
