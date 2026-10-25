/**
 * Server-side AI. Bots read their opponent's attack timings (just like a human watching the
 * telegraph) and react after a human-like delay, with a chance to deflect, block, jump or dodge.
 */
import { AttackDef } from '../shared/characters';
import { InputAction } from '../shared/fighter';
import { inSafeZone, onFloor } from '../shared/maps';
import { angleDiff, clamp, dist2D, forward, lerp, yawTo } from '../shared/math';
import { BotDifficulty } from '../shared/protocol';
import type { ServerFighter } from './entities';
import type { Instance } from './instance';

export interface BotProfile {
  /** ms between seeing an attack and being able to respond */
  reaction: number;
  parryChance: number;
  holdBlockChance: number;
  /** chance to answer a perilous attack correctly */
  perilousRead: number;
  aggression: number;
  feintChance: number;
  comboChance: number;
  punishChance: number;
}

export const BOT_PROFILES: Record<BotDifficulty, BotProfile> = {
  easy: { reaction: 380, parryChance: 0.2, holdBlockChance: 0.35, perilousRead: 0.3, aggression: 0.45, feintChance: 0, comboChance: 0.4, punishChance: 0.3 },
  normal: { reaction: 260, parryChance: 0.5, holdBlockChance: 0.35, perilousRead: 0.6, aggression: 0.65, feintChance: 0.2, comboChance: 0.65, punishChance: 0.6 },
  hard: { reaction: 175, parryChance: 0.8, holdBlockChance: 0.15, perilousRead: 0.88, aggression: 0.8, feintChance: 0.35, comboChance: 0.8, punishChance: 0.9 },
};

interface Scheduled {
  at: number;
  action: InputAction;
  dx?: number;
  dz?: number;
  /** cancel if the opponent's attack serial changes (e.g. they feinted) */
  serial?: number;
}

/** Interpolate between the difficulty presets by rating (used for rated matches against AI). */
export function botProfileForRating(mmr: number): BotProfile {
  const t = clamp((mmr - 800) / 700, 0, 1);
  const a = t < 0.5 ? BOT_PROFILES.easy : BOT_PROFILES.normal;
  const b = t < 0.5 ? BOT_PROFILES.normal : BOT_PROFILES.hard;
  const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const out = {} as BotProfile;
  for (const key of Object.keys(a) as (keyof BotProfile)[]) out[key] = lerp(a[key], b[key], k);
  return out;
}

/**
 * duel: fight one opponent (arenas). sparring: stationary dummy that swings at nearby players.
 * passive: does nothing. roam: wanders the lobby and picks fights outside the safe zone.
 */
export type BotMode = 'duel' | 'sparring' | 'passive' | 'roam';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class BotBrain {
  private queue: Scheduled[] = [];
  private seenSerial = -1;
  private seenTargetId = '';
  private nextAttackAt = 0;
  private strafeDir = 1;
  private strafeUntil = 0;
  private sparIndex = 0;
  private stanceAttackAt = 0;
  private holdingBlock = false;
  // roaming
  private waypoint: { x: number; z: number; until: number } | null = null;
  private fightTarget: string | null = null;
  private fightUntil = 0;
  private calmUntil = 0;

  constructor(
    readonly f: ServerFighter,
    readonly mode: BotMode,
    readonly profile: BotProfile = BOT_PROFILES.normal,
  ) {}

  private act(inst: Instance, action: InputAction, now: number, dx = 0, dz = 0): boolean {
    return inst.applyInput(this.f, action, now, { dx, dz });
  }

  private target(inst: Instance): ServerFighter | null {
    let best: ServerFighter | null = null;
    let bestD = Infinity;
    const maxRange = this.mode === 'sparring' ? 3.4 : 60;
    for (const o of inst.fighters.values()) {
      if (o === this.f || !o.isAlive() || o.dummy) continue;
      if (this.mode === 'sparring' && !o.owner) continue;
      if (!inst.canDamage(this.f, o) && this.mode !== 'duel') continue;
      const d = dist2D(this.f.x, this.f.z, o.x, o.z);
      if (d < bestD && d <= maxRange) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  think(now: number, inst: Instance): void {
    const f = this.f;
    f.moveX = 0;
    f.moveZ = 0;
    if (!f.isAlive() || this.mode === 'passive') {
      f.wantYaw = null;
      return;
    }

    // run scheduled inputs
    if (this.queue.length) {
      const due = this.queue.filter((s) => s.at <= now);
      this.queue = this.queue.filter((s) => s.at > now);
      for (const s of due) this.act(inst, s.action, now, s.dx, s.dz);
    }

    if (this.mode === 'roam') {
      this.roam(inst, now);
      return;
    }

    const t = this.target(inst);
    if (!t) {
      if (this.holdingBlock) this.releaseBlock(inst, now);
      f.wantYaw = null;
      return;
    }
    const dist = dist2D(f.x, f.z, t.x, t.z);
    f.wantYaw = yawTo(f.x, f.z, t.x, t.z);

    if (this.mode === 'sparring') {
      this.spar(inst, t, dist, now);
      return;
    }

    this.defend(inst, t, dist, now);
    this.move(inst, t, dist, now);
    this.attack(inst, t, dist, now);
  }

  // ------------------------------------------------------------------ roaming lobby fighter

  private roam(inst: Instance, now: number): void {
    const f = this.f;
    let t = this.fightTarget ? inst.fighters.get(this.fightTarget) ?? null : null;
    if (t) {
      const d = dist2D(f.x, f.z, t.x, t.z);
      if (!t.isAlive() || !inst.canDamage(f, t) || d > 14 || now > this.fightUntil) {
        t = null;
        this.fightTarget = null;
        this.calmUntil = now + 8000;
        if (this.holdingBlock) this.releaseBlock(inst, now);
      }
    }
    // retaliate against whoever just hit us
    if (!t && f.lastAttackerId && now - f.lastDamageAt < 2500) {
      const a = inst.fighters.get(f.lastAttackerId);
      if (a && a.isAlive() && inst.canDamage(f, a)) t = a;
    }
    if (!t && now > this.calmUntil) {
      let bestD = Infinity;
      for (const o of inst.fighters.values()) {
        if (o === f || !o.isAlive() || o.dummy || !inst.canDamage(f, o)) continue;
        const d = dist2D(f.x, f.z, o.x, o.z);
        const reach = o.owner ? 9 : 6; // players draw more attention than other wanderers
        if (d < reach && d < bestD) {
          bestD = d;
          t = o;
        }
      }
    }
    if (t) {
      if (this.fightTarget !== t.id) {
        this.fightTarget = t.id;
        this.fightUntil = now + 30_000;
      }
      const dist = dist2D(f.x, f.z, t.x, t.z);
      f.wantYaw = yawTo(f.x, f.z, t.x, t.z);
      this.defend(inst, t, dist, now);
      this.move(inst, t, dist, now);
      this.attack(inst, t, dist, now);
      return;
    }

    // stroll between points outside the plaza
    const zone = inst.map.safeZone;
    const reached = this.waypoint && dist2D(f.x, f.z, this.waypoint.x, this.waypoint.z) < 1.5;
    if (!this.waypoint || reached || now > this.waypoint.until) {
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 22 + Math.random() * 40;
        const x = Math.sin(a) * r;
        const z = Math.cos(a) * r;
        if (zone && inSafeZone(inst.map, x, z)) continue;
        if (!onFloor(inst.map, x, z, -3)) continue;
        this.waypoint = { x, z, until: now + 14_000 };
        break;
      }
    }
    if (this.waypoint) {
      const dir = forward(yawTo(f.x, f.z, this.waypoint.x, this.waypoint.z));
      f.moveX = dir.x * 0.55;
      f.moveZ = dir.z * 0.55;
      f.wantYaw = yawTo(f.x, f.z, this.waypoint.x, this.waypoint.z);
    }
  }

  // ------------------------------------------------------------------ sparring dummy

  private spar(inst: Instance, t: ServerFighter, dist: number, now: number): void {
    const f = this.f;
    if (now < this.nextAttackAt || (f.state !== 'idle' && f.state !== 'block')) return;
    if (dist > 3.0) return;
    if (Math.abs(angleDiff(f.yaw, yawTo(f.x, f.z, t.x, t.z))) > 0.4) return;
    const pattern: InputAction[] = ['light', 'heavy', 'light', 'special'];
    const action = pattern[this.sparIndex++ % pattern.length];
    if (action === 'light' && Math.random() < 0.5) this.queue.push({ at: now + f.char.lights[0].windup + 150, action: 'light' });
    this.act(inst, action, now);
    this.nextAttackAt = now + 2200;
  }

  // ------------------------------------------------------------------ defense

  private releaseBlock(inst: Instance, now: number): void {
    this.holdingBlock = false;
    this.act(inst, 'blockUp', now);
  }

  private defend(inst: Instance, t: ServerFighter, dist: number, now: number): void {
    const p = this.profile;
    const f = this.f;
    const targetChanged = t.id !== this.seenTargetId;
    if (targetChanged) this.seenTargetId = t.id;

    // opponent cancelled the attack (feint / got hit): forget planned reactions to it
    if (t.state !== 'attack' && this.queue.some((s) => s.serial !== undefined)) {
      this.queue = this.queue.filter((s) => s.serial === undefined || s.action === 'blockUp');
    }

    if (t.state !== 'attack' || !t.attack || t.attack.noHitbox) {
      if (this.holdingBlock && now - t.stateStart > 250 && Math.random() < 0.05) this.releaseBlock(inst, now);
      return;
    }
    if (t.attackSerial === this.seenSerial && !targetChanged) return;
    this.seenSerial = t.attackSerial;

    const atk: AttackDef = t.attack;
    const hitTime = t.stateStart + t.atkWindup;
    const earliest = now + p.reaction;
    if (dist > atk.range + 3) return; // out of reach anyway
    const serial = t.attackSerial;
    const plan = (at: number, action: InputAction, dx = 0, dz = 0) => this.queue.push({ at, action, dx, dz, serial });
    const toward = forward(yawTo(f.x, f.z, t.x, t.z));

    if (atk.perilous) {
      if (Math.random() > p.perilousRead) return; // misread: eat it
      const at = Math.max(earliest, hitTime - rand(90, 160));
      if (at > hitTime + 10) return;
      if (atk.perilous === 'sweep') plan(at, 'jump');
      else if (atk.perilous === 'grab' || atk.perilous === 'area') plan(at, 'dodge', -toward.x, -toward.z);
      else if (Math.random() < 0.45) plan(Math.max(earliest, hitTime - rand(60, 140)), 'dodge', toward.x, toward.z);
      else this.planParry(hitTime, earliest, serial);
      return;
    }

    if (f.char.ability.kind === 'counter' && now >= f.abilityReadyAt && dist < 3 && Math.random() < 0.3) {
      const at = Math.max(earliest, hitTime - rand(250, 450));
      if (at < hitTime - 60) {
        plan(at, 'ability');
        return;
      }
    }

    const roll = Math.random();
    if (roll < p.parryChance) {
      this.planParry(hitTime, earliest, serial);
    } else if (roll < p.parryChance + p.holdBlockChance) {
      if (!this.holdingBlock) {
        const at = Math.max(earliest, now + 30);
        if (at < hitTime - 20) {
          plan(at, 'blockDown');
          this.holdingBlock = true;
          this.queue.push({ at: hitTime + atk.active + rand(150, 500), action: 'blockUp' });
        }
      }
    } else if (roll < p.parryChance + p.holdBlockChance + 0.12 && f.dodgeChargesReady(now) > 0) {
      const at = Math.max(earliest, hitTime - rand(100, 180));
      if (at < hitTime) {
        const side = forward(yawTo(f.x, f.z, t.x, t.z) + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2));
        plan(at, 'dodge', side.x - toward.x * 0.5, side.z - toward.z * 0.5);
      }
    }
  }

  private planParry(hitTime: number, earliest: number, serial: number): void {
    const window = 200 + (this.f.mods.parryWindowBonus ?? 0);
    const at = Math.max(earliest, hitTime - rand(25, window - 40));
    if (at > hitTime + 20) return; // too slow
    if (this.holdingBlock) {
      // re-press to open a deflect window
      this.queue.push({ at: at - 40, action: 'blockUp', serial });
      this.queue.push({ at, action: 'blockDown', serial });
    } else {
      this.queue.push({ at, action: 'blockDown', serial });
    }
    this.queue.push({ at: hitTime + rand(120, 260), action: 'blockUp' });
    this.holdingBlock = false;
  }

  // ------------------------------------------------------------------ movement

  private move(inst: Instance, t: ServerFighter, dist: number, now: number): void {
    const f = this.f;
    if (now > this.strafeUntil) {
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.strafeUntil = now + rand(900, 2600);
    }
    const reach = f.char.lights[0].range;
    const wantClose = now >= this.nextAttackAt - 400 || t.state === 'broken' || t.state === 'deflected';
    const ideal = wantClose ? reach * 0.75 : reach + 1.2;
    const toT = forward(yawTo(f.x, f.z, t.x, t.z));
    const side = { x: toT.z * this.strafeDir, z: -toT.x * this.strafeDir };
    let mx = 0;
    let mz = 0;
    if (dist > ideal + 0.4) {
      mx += toT.x;
      mz += toT.z;
    } else if (dist < ideal - 0.6) {
      mx -= toT.x * 0.7;
      mz -= toT.z * 0.7;
    }
    if (!wantClose) {
      mx += side.x * 0.6;
      mz += side.z * 0.6;
    }
    // stay away from ledges and lava
    const ahead = { x: f.x + mx * 2.2, z: f.z + mz * 2.2 };
    const unsafe =
      (inst.map.edge === 'void' && !onFloor(inst.map, ahead.x, ahead.z, -1.2)) ||
      inst.map.hazards.some((h) => h.shape.type === 'circle' && Math.hypot(ahead.x - h.shape.x, ahead.z - h.shape.z) < h.shape.r + 0.8);
    if (unsafe) {
      const c = forward(yawTo(f.x, f.z, 0, 0));
      mx = c.x;
      mz = c.z;
      this.strafeDir *= -1;
    }
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      f.moveX = mx / Math.max(1, len);
      f.moveZ = mz / Math.max(1, len);
    }
  }

  // ------------------------------------------------------------------ offense

  private attack(inst: Instance, t: ServerFighter, dist: number, now: number): void {
    const f = this.f;
    const p = this.profile;
    const ab = f.char.ability;

    // Iai stance follow-up
    if (f.state === 'stance' && ab.kind === 'stance' && now >= this.stanceAttackAt && dist < ab.attack.range) {
      this.act(inst, 'light', now);
      return;
    }

    if (f.state !== 'idle' && f.state !== 'block') return;
    const facing = Math.abs(angleDiff(f.yaw, yawTo(f.x, f.z, t.x, t.z))) < 0.5;
    const reach = f.char.lights[0].range;

    // free hits: posture broken or freshly deflected opponents
    if ((t.state === 'broken' || t.state === 'deflected' || t.state === 'stagger') && dist < reach && facing) {
      if (Math.random() < p.punishChance) {
        this.startCombo(inst, now, t.state === 'broken' ? 0 : 2);
        return;
      }
    }

    if (now < this.nextAttackAt || !facing) return;
    if (t.state === 'attack' && t.attackPhase(now) === 'windup') return; // respect their swing

    this.nextAttackAt = now + rand(500, 1500) / p.aggression;
    if (this.holdingBlock) this.releaseBlock(inst, now);

    if (now >= f.abilityReadyAt && Math.random() < 0.35 && this.useAbility(inst, t, dist, now)) return;
    if (now >= f.specialReadyAt && dist < f.char.special.range * 0.9 && Math.random() < 0.2) {
      this.act(inst, 'special', now);
      return;
    }
    if (dist > reach) return;
    if (Math.random() < 0.25) {
      this.act(inst, 'heavy', now);
      if (Math.random() < p.feintChance) {
        this.queue.push({ at: now + f.char.heavy.windup * rand(0.35, 0.7), action: 'blockDown' });
        this.queue.push({ at: now + f.char.heavy.windup + 200, action: 'blockUp' });
        this.queue.push({ at: now + f.char.heavy.windup * 0.8 + 60, action: 'light' });
      }
      return;
    }
    this.startCombo(inst, now, f.char.lights.length - 1);
  }

  private startCombo(inst: Instance, now: number, maxExtra: number): void {
    const f = this.f;
    this.act(inst, 'light', now);
    let at = now;
    for (let i = 0; i < Math.min(maxExtra, f.char.lights.length - 1); i++) {
      const l = f.char.lights[i];
      if (Math.random() > this.profile.comboChance) break;
      at += l.windup + l.active + rand(40, 140);
      this.queue.push({ at, action: 'light' });
    }
  }

  private useAbility(inst: Instance, _t: ServerFighter, dist: number, now: number): boolean {
    const f = this.f;
    const ab = f.char.ability;
    switch (ab.kind) {
      case 'stance':
        if (dist > 2.5 && dist < 5) {
          this.act(inst, 'ability', now);
          this.stanceAttackAt = now + rand(150, 700);
          return true;
        }
        return false;
      case 'buff':
        if (dist < 6) return this.act(inst, 'ability', now);
        return false;
      case 'attack': {
        const r = ab.attack.range + (ab.attack.lunge ?? 0);
        if (dist < r * 0.85 && dist > 2.5) return this.act(inst, 'ability', now);
        return false;
      }
      case 'leap':
        if (dist < 1.8) return this.act(inst, 'ability', now);
        return false;
      case 'teleport':
        if (dist > 3.5 && dist < ab.range) {
          const ok = this.act(inst, 'ability', now);
          if (ok) this.queue.push({ at: now + 320, action: 'light' });
          return ok;
        }
        return false;
      case 'counter':
        return false; // used defensively
    }
  }
}
