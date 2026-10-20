/**
 * A simulated world (the lobby or one arena). Runs the authoritative combat loop: inputs ->
 * state machines -> hit detection -> lag-compensated hit resolution -> broadcast.
 */
import { AttackDef, AttackKey } from '../shared/characters';
import { COMBAT, MAX_LAG_COMP_MS, PLAYER_RADIUS, SNAPSHOT_HZ, FALL_DEATH_Y } from '../shared/config';
import { HitResult, applyHit, decideOutcome, defenseAt, inAttackCone, pruneDefenseLog, pushDefense } from '../shared/combat';
import { INPUT_ACTIONS, InputAction } from '../shared/fighter';
import { MapDef, hazardAt, inSafeZone, onFloor } from '../shared/maps';
import { clamp, forward, turnToward, yawTo } from '../shared/math';
import { clampToFloor, getColliders, pushOut, stepBody } from '../shared/physics';
import { ClientMsg, CombatEvent, FighterSnap, ServerMsg, fighterSnap } from '../shared/protocol';
import { Player, ServerFighter } from './entities';
import type { Game } from './game';

interface PendingHit {
  attacker: ServerFighter;
  defender: ServerFighter;
  atk: AttackDef;
  key: AttackKey;
  tHit: number;
  resolveAt: number;
  distance: number;
}

let instanceCounter = 0;

export abstract class Instance {
  readonly id = `inst-${++instanceCounter}`;
  abstract readonly kind: 'lobby' | 'arena';
  readonly fighters = new Map<string, ServerFighter>();
  readonly players = new Set<Player>();
  protected pending: PendingHit[] = [];
  protected fx: CombatEvent[] = [];
  protected lastTick: number;
  private lastSnap = 0;

  constructor(
    readonly game: Game,
    readonly map: MapDef,
  ) {
    this.lastTick = game.now();
  }

  // ------------------------------------------------------------------ rules (overridden)

  /** May `a` damage `d` right now? */
  abstract canDamage(a: ServerFighter, d: ServerFighter): boolean;
  /** Called when a fighter dies. */
  protected abstract onKill(victim: ServerFighter, killer: ServerFighter | null, how: string, now: number): void;
  /** Per-tick rules (respawns, round flow...). */
  protected abstract rules(now: number, dt: number): void;
  /** True while inputs and movement are locked (round countdown). */
  isFrozen(): boolean {
    return false;
  }
  protected onHit(_res: HitResult, _now: number): void {}

  // ------------------------------------------------------------------ membership

  broadcast(msg: ServerMsg, except?: Player): void {
    const data = JSON.stringify(msg);
    for (const p of this.players) if (p !== except) p.sendRaw(data);
  }

  flags(f: ServerFighter, now: number): number {
    let flags = 0;
    if (f.buffActive(now)) flags |= 1;
    if (inSafeZone(this.map, f.x, f.z)) flags |= 2;
    if (f.spawnProtectedUntil > now) flags |= 4;
    return flags;
  }

  snapshots(now: number): FighterSnap[] {
    return [...this.fighters.values()].map((f) => fighterSnap(f, this.flags(f, now)));
  }

  addFighter(f: ServerFighter): void {
    this.fighters.set(f.id, f);
    this.broadcast({ t: 'roster', add: [f.roster()] }, f.owner ?? undefined);
  }

  /** Put a player in this instance at a spawn point. */
  addPlayer(p: Player, spawn: { x: number; z: number; yaw: number }): ServerFighter {
    const now = this.game.now();
    const f = new ServerFighter(p.id, p.name, p.charId);
    f.owner = p;
    f.x = spawn.x;
    f.z = spawn.z;
    f.yaw = spawn.yaw;
    f.stateStart = now;
    f.lastMoveAt = now;
    f.epoch = (p.fighter?.epoch ?? 0) + 1;
    p.fighter = f;
    p.instance = this;
    this.players.add(p);
    this.addFighter(f);
    p.send({
      t: 'enter',
      kind: this.kind,
      map: this.map.id,
      x: f.x,
      z: f.z,
      yaw: f.yaw,
      epoch: f.epoch,
      roster: [...this.fighters.values()].map((o) => o.roster()),
      snap: this.snapshots(now),
    });
    return f;
  }

  removePlayer(p: Player): void {
    if (p.instance !== this) return;
    this.players.delete(p);
    if (p.fighter) this.removeFighter(p.fighter.id);
    p.instance = null;
  }

  removeFighter(id: string): void {
    if (!this.fighters.delete(id)) return;
    this.pending = this.pending.filter((h) => h.attacker.id !== id && h.defender.id !== id);
    this.broadcast({ t: 'roster', remove: [id] });
  }

  /** Authoritatively move a fighter (round reset, shadow step...). */
  teleport(f: ServerFighter, x: number, z: number, yaw: number | undefined, reason?: string): void {
    f.x = x;
    f.z = z;
    f.y = 0;
    f.vy = 0;
    if (yaw !== undefined) f.yaw = yaw;
    f.epoch++;
    f.moveAllowance = 0;
    f.owner?.send({ t: 'tp', x, z, yaw, epoch: f.epoch, reason });
  }

  /** Knock a fighter along a vector. Humans move themselves, so they are told to. */
  shove(f: ServerFighter, dx: number, dz: number): void {
    if (!f.isAlive()) return;
    const p = { x: f.x + dx, z: f.z + dz };
    pushOut(p, PLAYER_RADIUS, getColliders(this.map));
    if (this.map.edge === 'wall') clampToFloor(this.map, p);
    const rdx = p.x - f.x;
    const rdz = p.z - f.z;
    f.x = p.x;
    f.z = p.z;
    if (f.owner) {
      f.moveAllowance += Math.hypot(rdx, rdz) + 1;
      f.owner.send({ t: 'push', dx: rdx, dz: rdz });
    }
  }

  // ------------------------------------------------------------------ client messages

  handleMove(p: Player, m: Extract<ClientMsg, { t: 'move' }>): void {
    const f = p.fighter;
    if (!f || m.e !== f.epoch) return;
    if (![m.x, m.y, m.z, m.r].every(Number.isFinite)) return;
    if (this.isFrozen() || !f.isAlive()) return;
    const now = this.game.now();
    const dt = clamp((now - f.lastMoveAt) / 1000, 0.016, 1);
    f.lastMoveAt = now;
    const dist = Math.hypot(m.x - f.x, m.z - f.z);
    const allowed = 24 * dt + 1.5 + f.moveAllowance;
    f.moveAllowance = Math.max(0, f.moveAllowance - dist);
    if (dist > allowed) {
      // too fast to be legit: snap them back
      this.teleport(f, f.x, f.z, f.yaw, 'correction');
      return;
    }
    const pos = { x: m.x, z: m.z };
    if (this.map.edge === 'wall') clampToFloor(this.map, pos, PLAYER_RADIUS * 0.5);
    f.x = pos.x;
    f.z = pos.z;
    f.y = clamp(m.y, FALL_DEATH_Y - 5, 6);
    f.yaw = m.r;
    f.onGround = m.g === 1;
  }

  handleAction(p: Player, m: Extract<ClientMsg, { t: 'act' }>): void {
    const f = p.fighter;
    if (!f || !INPUT_ACTIONS.includes(m.a)) return;
    if (!f.isAlive()) return;
    const now = this.game.now();
    if (this.isFrozen()) {
      if (m.a === 'blockDown') f.blockHeld = true;
      else if (m.a === 'blockUp') f.blockHeld = false;
      else p.send({ t: 'reject', a: m.a });
      return;
    }
    if (Number.isFinite(m.r)) f.yaw = m.r as number;

    // Lag compensation: honour the client's view time, within limits.
    const maxBack = Math.min(MAX_LAG_COMP_MS, p.oneWay() + 60);
    let pressTime = Number.isFinite(m.vt) ? clamp(m.vt, now - maxBack, now) : now;
    const last = f.log[f.log.length - 1];
    if (last && pressTime < last.t) pressTime = Math.min(now, last.t);

    const opts = {
      pressTime,
      dx: Number.isFinite(m.dx) ? (m.dx as number) : 0,
      dz: Number.isFinite(m.dz) ? (m.dz as number) : 0,
    };
    this.applyInput(f, m.a, now, opts);
  }

  /** Shared by human and bot inputs. */
  applyInput(f: ServerFighter, a: InputAction, now: number, opts: { pressTime?: number; dx?: number; dz?: number } = {}): boolean {
    if (a === 'ability' && f.char.ability.kind === 'teleport') {
      const target = this.teleportTarget(f, now);
      if (!target || now < f.abilityReadyAt || (f.state !== 'idle' && f.state !== 'block')) {
        f.owner?.send({ t: 'reject', a });
        return false;
      }
      const ok = f.input(a, now, opts);
      if (ok) this.shadowStep(f, target);
      this.processEvents(f);
      return ok;
    }
    if (a === 'jump' && f.owner) f.onGround = true; // the client already validated ground contact
    const ok = f.input(a, now, opts);
    this.processEvents(f);
    return ok;
  }

  protected processEvents(f: ServerFighter): void {
    for (const e of f.drainEvents()) {
      switch (e.type) {
        case 'guardOn':
        case 'guardOff':
        case 'dodge':
        case 'jump':
          pushDefense(f.log, e);
          break;
        case 'feint':
          this.fx.push({ k: 'feint', d: f.id, x: f.x, y: f.y, z: f.z });
          break;
        default:
          break;
      }
    }
  }

  teleportTarget(f: ServerFighter, now: number): ServerFighter | null {
    const ab = f.char.ability;
    if (ab.kind !== 'teleport') return null;
    let best: ServerFighter | null = null;
    let bestScore = Infinity;
    for (const o of this.fighters.values()) {
      if (o === f || !o.isAlive() || !this.canDamage(f, o)) continue;
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      if (d > ab.range) continue;
      const facing = Math.abs(Math.atan2(Math.sin(yawTo(f.x, f.z, o.x, o.z) - f.yaw), Math.cos(yawTo(f.x, f.z, o.x, o.z) - f.yaw)));
      const score = d + facing * 3;
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    void now;
    return best;
  }

  private shadowStep(f: ServerFighter, target: ServerFighter): void {
    const back = forward(target.yaw);
    const candidates = [1.5, 1.2, -1.5];
    for (const dist of candidates) {
      const p = { x: target.x - back.x * dist, z: target.z - back.z * dist };
      pushOut(p, PLAYER_RADIUS, getColliders(this.map));
      if (this.map.edge === 'wall') clampToFloor(this.map, p);
      if (this.map.edge === 'void' && !onFloor(this.map, p.x, p.z, -0.5)) continue;
      if (f.owner) f.moveAllowance += Math.hypot(p.x - f.x, p.z - f.z) + 2;
      this.teleport(f, p.x, p.z, yawTo(p.x, p.z, target.x, target.z), 'shadowstep');
      this.fx.push({ k: 'evade', d: f.id, x: f.x, y: f.y, z: f.z, tags: ['blink'] });
      return;
    }
  }

  // ------------------------------------------------------------------ simulation

  tick(now: number): void {
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    const others = [...this.fighters.values()];

    for (const f of others) {
      if (f.brain && !this.isFrozen()) f.brain.think(now, this);
      f.update(now);
      if (f.bufferExpired) {
        f.owner?.send({ t: 'reject', a: f.bufferExpired });
        f.bufferExpired = null;
      }
      this.processEvents(f);
      if (!f.owner) this.moveBot(f, now, dt, others);
      pruneDefenseLog(f.log, now - 2000);
    }

    this.detectHits(now);
    this.resolveHits(now);
    this.environment(now, dt);
    this.rules(now, dt);
    this.lastTick = now;
    this.flush(now);
  }

  private moveBot(f: ServerFighter, now: number, dt: number, all: ServerFighter[]): void {
    if (!f.isAlive() || this.isFrozen()) return;
    const speed = f.char.stats.speed * f.moveSpeedMult(now);
    let vx = f.moveX * speed;
    let vz = f.moveZ * speed;
    const lunge = f.lungeSpeed(now);
    if (lunge > 0) {
      const fw = forward(f.yaw);
      // stop lunging into someone
      const blocked = all.some((o) => o !== f && o.isAlive() && Math.hypot(o.x - f.x, o.z - f.z) < 1.1);
      if (!blocked) {
        vx += fw.x * lunge;
        vz += fw.z * lunge;
      }
    }
    const dv = f.dodgeVelocity(now);
    vx += dv.x;
    vz += dv.z;
    const obstacles = all.filter((o) => o !== f && o.isAlive()).map((o) => ({ x: o.x, z: o.z }));
    if (f.dummy) {
      vx = 0;
      vz = 0;
    }
    stepBody(f, vx, vz, dt, this.map, obstacles);
    if (f.wantYaw !== null) f.yaw = turnToward(f.yaw, f.wantYaw, f.turnRate(now) * dt);
  }

  private detectHits(now: number): void {
    for (const a of this.fighters.values()) {
      if (a.state !== 'attack' || !a.attack || !a.attackKey || a.attack.noHitbox) continue;
      const atk = a.attack;
      const start = a.stateStart + a.atkWindup;
      const end = start + atk.active;
      if (end <= this.lastTick || start > now) continue;
      if (a.hitSerial !== a.attackSerial) {
        a.hitRecord.clear();
        a.hitSerial = a.attackSerial;
      }
      const hits = atk.hits ?? 1;
      const segLen = atk.active / hits;
      const seg = Math.min(hits - 1, Math.floor((Math.min(now, end - 1) - start) / segLen));
      if (seg < 0) continue;
      for (const d of this.fighters.values()) {
        if (d === a || !d.isAlive() || !this.canDamage(a, d)) continue;
        const done = a.hitRecord.get(d.id) ?? 0;
        if (done > seg) continue;
        const dist = inAttackCone(a, d, atk, PLAYER_RADIUS);
        if (dist === null) continue;
        a.hitRecord.set(d.id, seg + 1);
        const tHit = Math.max(start + seg * segLen, this.lastTick);
        this.pending.push({ attacker: a, defender: d, atk, key: a.attackKey, tHit, resolveAt: tHit + d.hitGrace(), distance: dist });
      }
    }
  }

  private resolveHits(now: number): void {
    if (this.pending.length === 0) return;
    const due = this.pending.filter((h) => h.resolveAt <= now).sort((x, y) => x.tHit - y.tHit);
    if (due.length === 0) return;
    this.pending = this.pending.filter((h) => h.resolveAt > now);
    for (const h of due) {
      const { attacker: a, defender: d } = h;
      if (!this.fighters.has(a.id) || !this.fighters.has(d.id)) continue;
      if (!d.isAlive() || !this.canDamage(a, d)) continue;
      // A posture break can't be cashed in by the very next frames of the attack that caused it.
      if (d.state === 'broken' && h.tHit - d.stateStart < 120) continue;
      const def = defenseAt(d.log, h.tHit);
      const outcome = decideOutcome(a, d, h.atk, h.tHit, def);
      if (outcome === 'miss') continue;
      const res = applyHit(a, d, h.atk, h.key, outcome, now, { distance: h.distance });
      this.processEvents(a);
      this.processEvents(d);
      d.lastAttackerId = a.id;

      // knockback / pulls along the attacker -> defender line
      const dir = Math.hypot(d.x - a.x, d.z - a.z) > 0.01 ? forward(yawTo(a.x, a.z, d.x, d.z)) : forward(a.yaw);
      if (res.pull !== null) {
        const fw = forward(a.yaw);
        const tx = a.x + fw.x * res.pull;
        const tz = a.z + fw.z * res.pull;
        this.shove(d, tx - d.x, tz - d.z);
      } else if (res.pushDefender > 0) {
        this.shove(d, dir.x * res.pushDefender, dir.z * res.pushDefender);
      }
      if (res.pushAttacker > 0) this.shove(a, -dir.x * res.pushAttacker, -dir.z * res.pushAttacker);

      const tags: string[] = [];
      if (res.backstab) tags.push('backstab');
      if (res.tipper) tags.push('tipper');
      if (res.defenderBroken) tags.push('broken');
      if (res.attackerBroken) tags.push('abroken');
      if (res.killed) tags.push('kill');
      const ev: CombatEvent = {
        k: outcome,
        a: a.id,
        d: d.id,
        key: h.key,
        x: Math.round(((a.x + d.x) / 2) * 100) / 100,
        y: Math.round((d.y + 1.2) * 100) / 100,
        z: Math.round(((a.z + d.z) / 2) * 100) / 100,
      };
      if (res.damage) ev.dmg = res.damage;
      if (res.healed) ev.heal = Math.round(res.healed);
      if (tags.length) ev.tags = tags;
      this.fx.push(ev);
      this.onHit(res, now);
      if (res.killed) {
        const victim = res.killed as ServerFighter;
        const killer = victim === d ? a : d;
        this.onKill(victim, killer, outcome === 'deathblow' ? 'deathblow' : 'slain', now);
      }
    }
  }

  protected environment(now: number, dt: number): void {
    for (const f of this.fighters.values()) {
      if (!f.isAlive()) continue;
      if (f.y < FALL_DEATH_Y) {
        this.killByEnvironment(f, 'fall', now);
        continue;
      }
      if (f.y < 0.2 && this.map.hazards.length) {
        const h = hazardAt(this.map, f.x, f.z);
        if (h && this.environmentHurts(f)) {
          f.hp -= h.dps * dt;
          f.lastDamageAt = now;
          if (now - f.lastHazardFx > 400) {
            f.lastHazardFx = now;
            this.fx.push({ k: 'lava', d: f.id, x: f.x, y: f.y + 0.3, z: f.z, dmg: Math.round(h.dps * 0.4) });
          }
          if (f.hp <= 0) this.killByEnvironment(f, 'lava', now);
        }
      }
    }
  }

  /** Whether hazards and falls should currently hurt (arenas: only while fighting). */
  protected environmentHurts(_f: ServerFighter): boolean {
    return true;
  }

  killByEnvironment(f: ServerFighter, how: 'fall' | 'lava', now: number): void {
    if (!f.isAlive() || !this.environmentHurts(f)) {
      if (how === 'fall') this.rescue(f);
      return;
    }
    f.hp = 0;
    f.force('dead', now);
    this.processEvents(f);
    this.fx.push({ k: how, d: f.id, x: f.x, y: Math.max(f.y, 0), z: f.z, tags: ['kill'] });
    const killer = f.lastAttackerId ? this.fighters.get(f.lastAttackerId) ?? null : null;
    this.onKill(f, killer, how === 'fall' ? 'ring out' : 'burned', now);
  }

  /** Put a fallen fighter back on solid ground (when falls shouldn't kill). */
  protected rescue(f: ServerFighter): void {
    const s = this.map.spawns[0];
    this.teleport(f, s.x, s.z, s.yaw, 'rescue');
  }

  private flush(now: number): void {
    // immediate state-change broadcast
    const changed: FighterSnap[] = [];
    for (const f of this.fighters.values()) {
      const sig = `${f.state}|${f.stateStart}|${f.attackSerial}|${f.blockHeld}|${Math.round(f.hp)}|${f.buffUntil > now}`;
      if (sig !== f.lastSig) {
        f.lastSig = sig;
        changed.push(fighterSnap(f, this.flags(f, now)));
      }
    }
    if (changed.length) this.broadcast({ t: 'st', s: now, f: changed });
    if (this.fx.length) {
      this.broadcast({ t: 'fx', e: this.fx });
      this.fx = [];
    }
    if (now - this.lastSnap >= 1000 / SNAPSHOT_HZ) {
      this.lastSnap = now;
      this.broadcast({ t: 'snap', s: now, f: this.snapshots(now) });
    }
  }

  /** Respawn helper: full vitals, idle, protected for a moment. */
  revive(f: ServerFighter, x: number, z: number, yaw: number, now: number, protect: number = COMBAT.spawnProtection): void {
    f.resetVitals();
    f.stateStart = now;
    f.log.length = 0;
    f.guardActive = false;
    f.lastAttackerId = null;
    f.spawnProtectedUntil = now + protect;
    f.invulnUntil = 0;
    this.teleport(f, x, z, yaw, 'respawn');
  }

  destroy(): void {
    for (const p of [...this.players]) this.removePlayer(p);
    this.fighters.clear();
    this.pending = [];
  }
}
