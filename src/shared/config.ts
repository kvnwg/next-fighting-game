/** Global tuning shared by the client and the server. Times are milliseconds, distances meters. */

export const GAME_TITLE = 'DEFLECT';
export const GAME_SUBTITLE = 'a pixel dueling arena';

// ---- Networking ---------------------------------------------------------------
export const SERVER_TICK_HZ = 60;
export const SNAPSHOT_HZ = 20;
export const CLIENT_SEND_HZ = 30;
/** Remote positions are rendered this far in the past so they can be interpolated smoothly. */
export const INTERP_DELAY_MS = 100;
/** Upper bound on how far back the server will honour a defensive input (parry/dodge/jump). */
export const MAX_LAG_COMP_MS = 220;
/** Extra slack added on top of a player's measured one-way latency before a hit is finalised. */
export const HIT_CONFIRM_SLACK_MS = 35;

// ---- Movement ------------------------------------------------------------------
export const PLAYER_RADIUS = 0.45;
export const GRAVITY = 30;
export const JUMP_VELOCITY = 9.2;
export const SPRINT_MULT = 1.45;
export const FALL_DEATH_Y = -9;

// ---- Combat --------------------------------------------------------------------
export const COMBAT = {
  /** Base deflect (parry) window after pressing block. */
  parryWindow: 200,
  /** Presses landing slightly after the hit still count (absorbs clock jitter). */
  parryLateTolerance: 30,
  /** A press within this long of a previous *whiffed* press counts as spamming. */
  parrySpamWindow: 500,
  /** Each consecutive spammed press multiplies the deflect window by this. */
  parrySpamFactor: 0.5,
  /** Half-angle (degrees) in front of a fighter that their guard covers. */
  guardArc: 80,
  /** Defender's own posture gain when deflecting, as a fraction of the attack's block posture. */
  deflectSelfPosture: 0.15,
  /** Attacker posture gain when deflected, as a fraction of the attack's posture value. */
  deflectAttackerPosture: 1.0,
  perilousDeflectMult: 1.4,
  mikiriPosture: 45,

  staggerTime: 380,
  /** While staggered you may start guarding (and deflect) after this long. */
  staggerDefendAfter: 140,
  blockstunTime: 200,
  deflectedTime: 600,
  /** A deflected attacker can raise their guard again after this long. */
  deflectedDefendAfter: 450,
  mikiriStunTime: 900,
  brokenTime: 1800,
  knockdownTime: 1100,
  deathblowDamage: 40,
  /** Posture is reset to this fraction of max if a posture break ends without a deathblow. */
  brokenRecoverPosture: 0.55,

  /** Attack recovery can be cancelled into guard once this fraction of it has elapsed. */
  recoveryGuardCancel: 0.4,
  feintCooldown: 1600,
  inputBuffer: 180,

  dodgeTime: 380,
  dodgeIframes: 240,
  dodgeDistance: 4.2,
  dodgeCooldown: 850,
  /** Window after a jump press during which sweeps and grabs pass under you. */
  jumpEvadeStart: 50,
  jumpEvadeEnd: 620,

  postureRegenDelay: 1100,
  postureRegenRate: 14,
  guardRegenMult: 1.6,

  hitKnockback: 0.55,
  blockKnockback: 0.3,
  deflectKnockback: 0.45,

  respawnTime: 3500,
  spawnProtection: 2500,
  lobbyRegenDelay: 6000,
  lobbyRegenRate: 10,
} as const;

// ---- Matches -------------------------------------------------------------------
export const MATCH = {
  roundsToWin: 2,
  introTime: 3500,
  countdownTime: 3000,
  roundTime: 90_000,
  roundEndTime: 3500,
  matchEndTime: 7000,
  challengeTimeout: 15_000,
} as const;
