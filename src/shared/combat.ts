/**
 * Hit resolution. Given an attack that connected at time `t`, work out what the defender was doing
 * at that moment (from their lag-compensated defense timeline) and apply the result.
 */
import { AttackDef, AttackKey } from './characters';
import { COMBAT } from './config';
import { DefenseEvent, Fighter } from './fighter';
import { DEG, Vec2, angleDiff, forward, yawTo } from './math';

export type Outcome =
  | 'miss'
  | 'evade'
  | 'mikiri'
  | 'deflect'
  | 'block'
  | 'guardBreak'
  | 'hit'
  | 'armor'
  | 'deathblow'
  | 'counter';

export interface DefenseInfo {
  guarding: boolean;
  parrying: boolean;
  iframes: boolean;
  dodgeDir: Vec2 | null;
  airborne: boolean;
}

export const NO_DEFENSE: DefenseInfo = { guarding: false, parrying: false, iframes: false, dodgeDir: null, airborne: false };

/** Reconstruct a fighter's defensive state at time t from their defense timeline (sorted by t). */
export function defenseAt(log: readonly DefenseEvent[], t: number): DefenseInfo {
  const tol = COMBAT.parryLateTolerance;
  const info: DefenseInfo = { guarding: false, parrying: false, iframes: false, dodgeDir: null, airborne: false };
  let lastGuard: DefenseEvent | null = null;
  for (const e of log) {
    if (e.type === 'guardOn' || e.type === 'guardOff') {
      if (e.t <= t) lastGuard = e;
      else if (e.type === 'guardOn' && e.t <= t + tol) {
        // pressed a hair late: still counts as a deflect
        info.guarding = true;
        info.parrying = true;
      }
    } else if (e.type === 'dodge') {
      if (e.t <= t + tol && t <= e.t + e.iframes) {
        info.iframes = true;
        info.dodgeDir = { x: e.dx, z: e.dz };
      }
    } else if (e.type === 'jump') {
      if (t >= e.t + COMBAT.jumpEvadeStart && t <= e.t + COMBAT.jumpEvadeEnd) info.airborne = true;
    }
  }
  if (lastGuard && lastGuard.type === 'guardOn') {
    info.guarding = true;
    if (t <= lastGuard.parryUntil) info.parrying = true;
  }
  return info;
}

export function pruneDefenseLog(log: DefenseEvent[], before: number): void {
  // keep the most recent guard entry even if old: it defines the current guard state
  let lastGuardIdx = -1;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].type === 'guardOn' || log[i].type === 'guardOff') {
      lastGuardIdx = i;
      break;
    }
  }
  let w = 0;
  for (let i = 0; i < log.length; i++) {
    if (log[i].t >= before || i === lastGuardIdx) log[w++] = log[i];
  }
  log.length = w;
}

/** Insert keeping the log sorted by time. */
export function pushDefense(log: DefenseEvent[], e: DefenseEvent): void {
  let i = log.length;
  while (i > 0 && log[i - 1].t > e.t) i--;
  log.splice(i, 0, e);
}

/** Is `target` inside the attack cone of `attacker`? Returns the distance if so. */
export function inAttackCone(attacker: Fighter, target: Fighter, atk: AttackDef, radius: number): number | null {
  const dx = target.x - attacker.x;
  const dz = target.z - attacker.z;
  const d = Math.hypot(dx, dz);
  if (d - radius > atk.range) return null;
  if (Math.abs(target.y - attacker.y) > 2.2) return null;
  if (d < 0.3) return d;
  const ang = Math.abs(angleDiff(attacker.yaw, Math.atan2(dx, dz)));
  // a wider effective arc up close so point-blank hits don't whiff
  const slack = Math.atan2(radius, d);
  if (ang > atk.arc * DEG + slack) return null;
  return d;
}

export function decideOutcome(attacker: Fighter, defender: Fighter, atk: AttackDef, t: number, def: DefenseInfo): Outcome {
  if (!defender.isAlive() || defender.state === 'knockdown' || defender.invulnUntil > t) return 'miss';
  if (defender.state === 'broken') return 'deathblow';

  const toAttacker = yawTo(defender.x, defender.z, attacker.x, attacker.z);

  if (def.iframes) {
    if (atk.perilous === 'thrust' && def.dodgeDir) {
      const f = forward(toAttacker);
      if (def.dodgeDir.x * f.x + def.dodgeDir.z * f.z > 0.5) return 'mikiri';
    }
    return 'evade';
  }
  if ((atk.perilous === 'sweep' || atk.perilous === 'grab') && def.airborne) return 'evade';

  if (
    defender.state === 'stance' &&
    defender.char.ability.kind === 'counter' &&
    atk.perilous !== 'grab' &&
    atk.perilous !== 'sweep'
  ) {
    return 'counter';
  }

  const guardArc = (COMBAT.guardArc + (defender.mods.guardArcBonus ?? 0)) * DEG;
  const facing = Math.abs(angleDiff(defender.yaw, toAttacker)) <= guardArc;
  const canDeflect = !atk.unparryable && atk.perilous !== 'sweep' && atk.perilous !== 'grab';
  const canBlock = !atk.perilous;

  if (facing && def.parrying && canDeflect) return 'deflect';
  if (facing && def.guarding && canBlock) {
    const incoming = blockPostureDamage(attacker, defender, atk);
    return defender.posture + incoming >= defender.maxPosture ? 'guardBreak' : 'block';
  }
  return defender.hasHyperArmor(t) ? 'armor' : 'hit';
}

function postureMult(f: Fighter): number {
  return f.mods.postureDamageMult ?? 1;
}

function blockPostureDamage(attacker: Fighter, defender: Fighter, atk: AttackDef): number {
  return atk.blockPosture * postureMult(attacker) * (defender.mods.blockPostureMult ?? 1);
}

export interface HitResult {
  outcome: Outcome;
  attackerId: string;
  defenderId: string;
  key: AttackKey;
  damage: number;
  /** Health restored to the attacker (lifesteal). */
  healed: number;
  defenderBroken: boolean;
  attackerBroken: boolean;
  killed: Fighter | null;
  /** Knockback distances (meters) along the attacker -> defender line. */
  pushDefender: number;
  pushAttacker: number;
  /** If set, the defender is dragged to this distance in front of the attacker. */
  pull: number | null;
  backstab: boolean;
  tipper: boolean;
}

export interface HitGeometry {
  distance: number;
}

/** Apply a resolved hit, mutating both fighters. `now` is when the result takes effect. */
export function applyHit(
  attacker: Fighter,
  defender: Fighter,
  atk: AttackDef,
  key: AttackKey,
  outcome: Outcome,
  now: number,
  geo: HitGeometry,
): HitResult {
  const r: HitResult = {
    outcome,
    attackerId: attacker.id,
    defenderId: defender.id,
    key,
    damage: 0,
    healed: 0,
    defenderBroken: false,
    attackerBroken: false,
    killed: null,
    pushDefender: 0,
    pushAttacker: 0,
    pull: null,
    backstab: false,
    tipper: false,
  };

  const tipper = !!attacker.mods.tipperBonus && geo.distance >= atk.range * 0.7;
  r.tipper = tipper && (outcome === 'hit' || outcome === 'armor');
  const tipMult = tipper ? 1 + (attacker.mods.tipperBonus ?? 0) : 1;
  const aPost = postureMult(attacker) * tipMult;
  let dmgMult = attacker.damageMult(now) * tipMult;

  const dealDamage = (amount: number) => {
    const dealt = Math.min(defender.hp, Math.round(amount));
    defender.hp -= dealt;
    defender.lastDamageAt = now;
    r.damage = dealt;
    const ls = attacker.mods.lifesteal ?? 0;
    if (ls > 0 && dealt > 0) {
      const before = attacker.hp;
      attacker.heal(dealt * ls);
      r.healed = attacker.hp - before;
    }
    if (defender.hp <= 0) {
      defender.hp = 0;
      defender.force('dead', now);
      r.killed = defender;
      return true;
    }
    return false;
  };

  switch (outcome) {
    case 'miss':
    case 'evade':
      break;

    case 'mikiri': {
      const broke = attacker.addPosture(COMBAT.mikiriPosture * postureMult(defender), now);
      r.attackerBroken = broke;
      attacker.force(broke ? 'broken' : 'deflected', now, broke ? COMBAT.brokenTime : COMBAT.mikiriStunTime);
      break;
    }

    case 'deflect': {
      const mult = atk.perilous ? COMBAT.perilousDeflectMult : 1;
      const broke = attacker.addPosture(atk.posture * COMBAT.deflectAttackerPosture * mult * postureMult(defender), now);
      r.attackerBroken = broke;
      attacker.force(broke ? 'broken' : 'deflected', now, broke ? COMBAT.brokenTime : COMBAT.deflectedTime);
      // deflecting costs a sliver of your own posture, but can never break you
      const self = atk.blockPosture * COMBAT.deflectSelfPosture * (defender.mods.blockPostureMult ?? 1);
      defender.posture = Math.min(defender.maxPosture - 1, defender.posture + self);
      defender.lastPostureDamageAt = now;
      defender.lastPressDeflected = true;
      if (defender.mods.riposteWindupMult) defender.riposteUntil = now + 1200;
      r.pushAttacker = COMBAT.deflectKnockback;
      break;
    }

    case 'block': {
      defender.addPosture(blockPostureDamage(attacker, defender, atk), now);
      defender.force('blockstun', now, COMBAT.blockstunTime);
      r.pushDefender = COMBAT.blockKnockback + (atk.knockback ?? 0) * 0.5;
      break;
    }

    case 'guardBreak': {
      defender.posture = defender.maxPosture;
      defender.lastPostureDamageAt = now;
      defender.force('broken', now, COMBAT.brokenTime);
      r.defenderBroken = true;
      r.pushDefender = COMBAT.blockKnockback + (atk.knockback ?? 0) * 0.5;
      break;
    }

    case 'hit':
    case 'armor': {
      const toAttacker = yawTo(defender.x, defender.z, attacker.x, attacker.z);
      const back = Math.abs(angleDiff(defender.yaw, toAttacker)) > 115 * DEG;
      if (back && attacker.mods.backstabBonus) {
        dmgMult *= 1 + attacker.mods.backstabBonus;
        r.backstab = true;
      }
      if (dealDamage(atk.damage * dmgMult)) break;
      const postureAmt = atk.posture * aPost * (outcome === 'armor' ? 0.5 : 1);
      const broke = defender.addPosture(postureAmt, now);
      if (broke) {
        defender.force('broken', now, COMBAT.brokenTime);
        r.defenderBroken = true;
      } else if (outcome === 'hit') {
        defender.force('stagger', now, COMBAT.staggerTime);
      }
      if (outcome === 'hit') {
        r.pushDefender = COMBAT.hitKnockback + (atk.knockback ?? 0);
        if (atk.pull != null) r.pull = atk.pull;
      }
      break;
    }

    case 'deathblow': {
      defender.posture = 0;
      if (dealDamage(COMBAT.deathblowDamage * attacker.damageMult(now))) break;
      defender.force('knockdown', now, COMBAT.knockdownTime);
      defender.invulnUntil = now + COMBAT.knockdownTime;
      r.pushDefender = 1.2;
      break;
    }

    case 'counter': {
      const ab = defender.char.ability;
      if (ab.kind !== 'counter') break;
      const ct = ab.attack;
      defender.startAttack('ct', now);
      const dealt = Math.min(attacker.hp, Math.round(ct.damage));
      attacker.hp -= dealt;
      attacker.lastDamageAt = now;
      r.damage = dealt;
      if (attacker.hp <= 0) {
        attacker.hp = 0;
        attacker.force('dead', now);
        r.killed = attacker;
        break;
      }
      const broke = attacker.addPosture(ct.posture * postureMult(defender), now);
      r.attackerBroken = broke;
      attacker.force(broke ? 'broken' : 'stagger', now, broke ? COMBAT.brokenTime : COMBAT.staggerTime + 200);
      r.pushAttacker = 1.0;
      break;
    }
  }
  return r;
}
