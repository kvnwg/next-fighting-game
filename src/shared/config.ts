/** Global tuning shared by the client and the server. Times are milliseconds, distances meters. */

export const GAME_TITLE = 'DEFLECT';
export const GAME_SUBTITLE = 'a samurai dueling arena';

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
// a high jump, as in Dueling Grounds: ~2.8 m at the top, ~0.87 s in the air
export const JUMP_VELOCITY = 13;
export const SPRINT_MULT = 1.45;
export const FALL_DEATH_Y = -9;

// ---- Combat --------------------------------------------------------------------
export const COMBAT = {
  /** Base deflect (parry) window after pressing block. */
  // a touch more forgiving than it was (200)
  parryWindow: 230,
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
  deflectAttackerPosture: 1.5,
  perilousDeflectMult: 1.4,
  mikiriPosture: 45,

  // a hit stuns about as long as Dueling Grounds' (~250 ms)
  staggerTime: 250,
  /** While staggered you may start guarding (and deflect) after this long. */
  staggerDefendAfter: 100,
  blockstunTime: 200,
  /**
   * Recoil after being deflected scales with how heavy the deflected attack was:
   * base + posture * perPosture, clamped. Pokes give a small opening, heavies a big one.
   */
  deflectRecoilBase: 250,
  deflectRecoilPerPosture: 12,
  deflectRecoilMin: 400,
  deflectRecoilMax: 720,
  /** A deflected attacker can raise their guard again after this fraction of the recoil. */
  deflectedDefendFrac: 0.75,
  mikiriStunTime: 900,
  brokenTime: 1800,
  knockdownTime: 1100,
  deathblowDamage: 40,
  /**
   * Damage comes mostly from executions. Ordinary hits take only this much of their listed damage
   * (they're for building posture), and posture damage from hits, blocks and deflects is raised.
   */
  hitDamageMult: 0.35,
  hitPostureMult: 1.4,
  /**
   * Striking a posture-broken fighter starts an execution: both are locked into a paired
   * animation for executeTime ms, the finishing blow lands at executeHitAt, and it takes
   * executeDamage of the victim's max health.
   */
  executeTime: 3000,
  executeHitAt: 2150,
  executeDamage: 0.45,
  /** how far apart the executioner and the victim stand, per unit of body scale */
  executeDistance: 1.55,
  /** Posture left after a posture break ends without a deathblow (0: the guard comes back whole). */
  brokenRecoverPosture: 0,

  /** Attack recovery can be cancelled into guard once this fraction of it has elapsed. */
  recoveryGuardCancel: 0.4,
  feintCooldown: 1600,
  // long enough that a press during a hit still chains once the next one is allowed
  inputBuffer: 260,

  // a quick roll, ~280 ms as in Dueling Grounds
  dodgeTime: 280,
  dodgeIframes: 250,
  /** a forward dash ducks under everything for almost its whole length */
  dashIframes: 270,
  // short: a dodge is a quick step out of the line, not a dash across the ring
  dodgeDistance: 2.4,
  dodgeCooldown: 850,
  /** Minimum time between jumps (longer than a jump's airtime, so evasion can't be chained). */
  jumpCooldown: 1100,
  /** A forward dodge (stick within ~45° of facing) turns light and heavy into dash attacks... */
  dashDot: 0.7,
  /** ...from this fraction of the dodge on, and for this long (ms) after it ends. */
  dashCancelFrom: 0.45,
  dashWindow: 260,
  /** Walking away (stick within ~50° of straight back) turns them into backstep attacks. */
  backstepDot: 0.65,
  /** Window after a jump press during which sweeps and grabs pass under you. */
  jumpEvadeStart: 50,
  jumpEvadeEnd: 760,
  /**
   * A jump is untouchable for a moment on the way up (this window after the press), and fully
   * open on the way down and as it lands.
   */
  jumpIframesStart: 40,
  /** An air attack hangs at the top through its windup, then from this fraction of it slams down (m/s at least). */
  airSlamFrom: 0.7,
  airSlamSpeed: 14,
  jumpIframesEnd: 380,

  /**
   * Posture recovers slowly, and only once you stop: not until this long (ms) after the last posture
   * damage, and never while attacking, dodging or reeling, nor until this long after the last of
   * those, so pressing an attack never lets the guard rebuild.
   */
  postureRegenDelay: 2500,
  postureCalmDelay: 800,
  postureRegenRate: 10,
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
  /** The map and fighter select before a match. */
  selectTime: 10_000,
  roundsToWin: 2,
  /** Drawn rounds don't count; after this many rounds the leader (or healthier fighter) wins. */
  maxRounds: 5,
  /** a wide shot, both ring entrances (see client/entrances.ts) and the swing behind you */
  introTime: 9800,
  countdownTime: 3000,
  // health doubled for longer, posture-driven fights: rounds have the time for it
  roundTime: 120_000,
  roundEndTime: 3500,
  matchEndTime: 7000,
  challengeTimeout: 15_000,
} as const;
