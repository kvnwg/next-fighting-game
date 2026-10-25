/**
 * A lobby: everyone spawns in the shrine plaza (a safe zone). Step outside it and anyone can fight
 * anyone. There's a training yard with a passive dummy and a sparring dummy that swings back, and
 * dueling rings: challenge someone while you both stand in one and the ring seals around the two of
 * you, so nobody else can get in or land a blow until it's settled. The server runs as many lobbies
 * as it needs, LOBBY_CAP players each.
 */
import { CHARACTER_IDS, CharacterId } from '../shared/characters';
import { COMBAT, INTEREST, LOBBY_CAP, PLAYER_RADIUS, RING_DUEL } from '../shared/config';
import { LOBBY_MAP, inSafeZone } from '../shared/maps';
import { yawTo } from '../shared/math';
import { RingView } from '../shared/protocol';
import { BOT_PROFILES, BotBrain } from './bot';
import { Player, ServerFighter } from './entities';
import type { Game } from './game';
import { Instance } from './instance';

const RINGS = LOBBY_MAP.rings ?? [];

/** Two players settling it in one of the rings. */
interface RingDuel {
  a: ServerFighter;
  b: ServerFighter;
  state: 'countdown' | 'fight' | 'over';
  until: number;
  /** set when it's over: the winner, or null for a draw */
  winner?: ServerFighter | null;
}

/** Placeholder names for wandering AI fighters. */
const ROAMER_NAMES = ['Ash', 'Brannoc', 'Cinder', 'Dace', 'Elka', 'Fen', 'Garrow', 'Hollis'];

export class Lobby extends Instance {
  readonly kind = 'lobby' as const;
  /** a duel per ring, while one is on */
  private duels: (RingDuel | null)[] = RINGS.map(() => null);
  /** ring duel losers, waiting to get back up where they fell */
  private downedInRing = new Set<ServerFighter>();
  /** unique to this lobby for as long as it's open (numbers get reused): what invites carry */
  readonly id = Math.random().toString(36).slice(2, 10);

  /** `n`: this lobby's number, from 1 */
  constructor(
    game: Game,
    roamers = 0,
    readonly n = 1,
  ) {
    super(game, LOBBY_MAP);
    this.interest = INTEREST.near;
    for (let i = 0; i < roamers; i++) {
      const char = CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)];
      const f = new ServerFighter(`roamer-${i}`, `${ROAMER_NAMES[i % ROAMER_NAMES.length]} (AI)`, char);
      const s = this.roamerSpawn();
      f.x = s.x;
      f.z = s.z;
      f.yaw = Math.random() * Math.PI * 2;
      f.brain = new BotBrain(f, 'roam', BOT_PROFILES.normal);
      this.fighters.set(f.id, f);
    }
    for (const [i, d] of (LOBBY_MAP.dummies ?? []).entries()) {
      const f = new ServerFighter(`dummy-${i}`, d.kind === 'sparring' ? 'Sparring Dummy' : 'Training Dummy', 'ronin');
      f.dummy = d.kind;
      f.x = d.x;
      f.z = d.z;
      f.yaw = d.yaw;
      f.brain = new BotBrain(f, d.kind === 'sparring' ? 'sparring' : 'passive');
      this.fighters.set(f.id, f);
    }
  }

  /** Somewhere in the fields, away from the plaza and the training yard. */
  private roamerSpawn(): { x: number; z: number } {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 26 + Math.random() * 34;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (Math.abs(x - 30) < 10 && Math.abs(z) < 10) continue;
      return { x, z };
    }
    return { x: -40, z: 40 };
  }

  spawnPoint(): { x: number; z: number; yaw: number } {
    const s = this.map.spawns[Math.floor(Math.random() * this.map.spawns.length)];
    return { x: s.x + (Math.random() - 0.5), z: s.z + (Math.random() - 0.5), yaw: s.yaw };
  }

  canDamage(a: ServerFighter, d: ServerFighter): boolean {
    if (!a.isAlive() || !d.isAlive()) return false;
    // a ring duel is between the two of them alone, only once it's begun, and it ends when it's over
    const da = this.duelOf(a, true);
    const dd = this.duelOf(d, true);
    if (da || dd) return da === dd && da!.state === 'fight';
    if (a.dummy && d.dummy) return false;
    if (inSafeZone(this.map, a.x, a.z) || inSafeZone(this.map, d.x, d.z)) return false;
    if (d.spawnProtectedUntil > this.game.now()) return false;
    return true;
  }

  protected onKill(victim: ServerFighter, killer: ServerFighter | null, how: string, now: number): void {
    const duel = this.duelOf(victim);
    if (duel && duel.state === 'fight') {
      // downed in the ring: they get back up there once it's over, not in the plaza
      victim.respawnAt = now + RING_DUEL.after;
      this.downedInRing.add(victim);
      this.broadcast({ t: 'feed', killer: killer?.name ?? '', victim: victim.name, how });
      this.endDuel(duel, duel.a === victim ? duel.b : duel.a, now);
      return;
    }
    if (victim.dummy) {
      victim.respawnAt = now + 2500;
      return;
    }
    victim.respawnAt = now + COMBAT.respawnTime;
    const killerName = killer && killer !== victim ? killer.name : '';
    this.broadcast({ t: 'feed', killer: killerName, victim: victim.name, how });
    if (killer?.owner && killer !== victim) {
      killer.owner.profile.kills++;
      this.game.store.markDirty(killer.owner.profile);
    }
  }

  protected rules(now: number, dt: number): void {
    this.ringRules(now);
    for (const f of this.fighters.values()) {
      if (!f.isAlive()) {
        if (f.respawnAt && now >= f.respawnAt) {
          f.respawnAt = 0;
          if (this.downedInRing.delete(f)) {
            // the loser of a ring duel gets back up where they fell, not in the plaza
            this.revive(f, f.x, f.z, f.yaw, now);
          } else if (f.dummy) {
            const d = LOBBY_MAP.dummies!.find((_, i) => `dummy-${i}` === f.id)!;
            this.revive(f, d.x, d.z, d.yaw, now, 0);
          } else if (!f.owner) {
            const s = this.roamerSpawn();
            this.revive(f, s.x, s.z, Math.random() * Math.PI * 2, now, 0);
          } else {
            const s = this.spawnPoint();
            this.revive(f, s.x, s.z, s.yaw, now);
          }
        }
        continue;
      }
      // attacking drops spawn protection
      if (f.spawnProtectedUntil > now && f.state === 'attack') f.spawnProtectedUntil = 0;

      if (f.dummy) {
        if (now - f.lastDamageAt > 3000 && (f.hp < f.maxHp || f.posture > 0)) {
          f.hp = f.maxHp;
          f.posture = 0;
        }
        continue;
      }
      // out-of-combat health regen (not mid ring duel: that's a fight, however slow)
      if (f.hp < f.maxHp && now - f.lastDamageAt > COMBAT.lobbyRegenDelay && !this.duelOf(f)) f.heal(COMBAT.lobbyRegenRate * dt);
    }
  }

  // ------------------------------------------------------------------ membership

  get full(): boolean {
    return this.players.size >= LOBBY_CAP;
  }

  addPlayer(p: Player, spawn: { x: number; z: number; yaw: number }): ServerFighter {
    const f = super.addPlayer(p, spawn);
    p.send({ t: 'rings', r: this.ringViews() });
    this.sendInfo();
    return f;
  }

  removePlayer(p: Player): void {
    if (p.instance !== this) return;
    const f = p.fighter;
    super.removePlayer(p);
    // walking out on a ring duel (leaving, or disconnecting) loses it
    if (f) {
      this.downedInRing.delete(f);
      const duel = this.duelOf(f);
      if (duel) this.endDuel(duel, duel.a === f ? duel.b : duel.a, this.game.now(), true);
    }
    this.sendInfo();
  }

  private sendInfo(): void {
    this.broadcast({ t: 'lobby', n: this.n, id: this.id, count: this.players.size, cap: LOBBY_CAP });
  }

  // ------------------------------------------------------------------ dueling rings

  /** Index of the ring (x, z) is inside, or -1. */
  ringAt(x: number, z: number, pad = 0): number {
    return RINGS.findIndex((r) => Math.hypot(x - r.x, z - r.z) < r.r + pad);
  }

  /** The ring duel `f` is fighting (or about to), or also one just over with `over`. */
  private duelOf(f: ServerFighter, over = false): RingDuel | null {
    return this.duels.find((d) => d && (over || d.state !== 'over') && (d.a === f || d.b === f)) ?? null;
  }

  /** In a ring duel (or waiting on its countdown)? */
  inDuel(p: Player): boolean {
    return !!p.fighter && !!this.duelOf(p.fighter);
  }

  /** The open ring two players are both standing in, or -1. */
  sharedRing(a: Player, b: Player): number {
    const fa = a.fighter;
    const fb = b.fighter;
    if (!fa || !fb || !fa.isAlive() || !fb.isAlive() || a.instance !== this || b.instance !== this) return -1;
    const i = this.ringAt(fa.x, fa.z);
    if (i < 0 || this.duels[i] || this.ringAt(fb.x, fb.z) !== i) return -1;
    return i;
  }

  /** Seal ring `i` around the two of them: both made whole, set apart facing each other, and a countdown. */
  startDuel(i: number, a: Player, b: Player): boolean {
    if (this.sharedRing(a, b) !== i) return false;
    const now = this.game.now();
    const fa = a.fighter!;
    const fb = b.fighter!;
    const r = RINGS[i];
    let yaw = yawTo(fa.x, fa.z, fb.x, fb.z);
    if (Math.hypot(fb.x - fa.x, fb.z - fa.z) < 0.1) yaw = 0;
    const off = r.r * 0.5;
    const sx = Math.sin(yaw) * off;
    const sz = Math.cos(yaw) * off;
    this.revive(fa, r.x - sx, r.z - sz, yaw, now, 0);
    this.revive(fb, r.x + sx, r.z + sz, yaw + Math.PI, now, 0);
    this.duels[i] = { a: fa, b: fb, state: 'countdown', until: now + RING_DUEL.countdown };
    this.fenceRings();
    this.sendRings();
    return true;
  }

  private endDuel(duel: RingDuel, winner: ServerFighter | null, now: number, forfeit = false): void {
    if (duel.state === 'over') return;
    duel.state = 'over';
    duel.winner = winner;
    duel.until = now + RING_DUEL.after;
    for (const f of [duel.a, duel.b]) {
      if (!f.isAlive()) continue;
      f.hp = f.maxHp;
      f.posture = 0;
    }
    const loser = winner ? (winner === duel.a ? duel.b : duel.a) : null;
    const text = !winner
      ? `${duel.a.name} and ${duel.b.name} fought to a draw in the ring.`
      : forfeit
        ? `${winner.name} wins the ring duel: ${loser!.name} walked away.`
        : `${winner.name} defeated ${loser!.name} in the ring.`;
    this.broadcast({ t: 'chat', name: '', text, sys: true });
    this.sendRings();
  }

  private ringRules(now: number): void {
    let changed = false;
    for (const [i, duel] of this.duels.entries()) {
      if (!duel) continue;
      if (duel.state === 'countdown' && now >= duel.until) {
        duel.state = 'fight';
        duel.until = now + RING_DUEL.time;
        changed = true;
      } else if (duel.state === 'fight' && now >= duel.until) {
        // time: the healthier of the two takes it
        const fa = duel.a.hp / duel.a.maxHp;
        const fb = duel.b.hp / duel.b.maxHp;
        this.endDuel(duel, Math.abs(fa - fb) < 0.005 ? null : fa > fb ? duel.a : duel.b, now);
      } else if (duel.state === 'over' && now >= duel.until) {
        this.duels[i] = null;
        changed = true;
      }
    }
    if (changed) this.sendRings();
    this.fenceRings();
  }

  /** Keep the duelists in their sealed ring and everyone else out of it. */
  private fenceRings(): void {
    for (const [i, duel] of this.duels.entries()) {
      if (!duel || duel.state === 'over') continue;
      const r = RINGS[i];
      for (const f of this.fighters.values()) {
        if (!f.isAlive()) continue;
        const dx = f.x - r.x;
        const dz = f.z - r.z;
        const d = Math.hypot(dx, dz) || 1e-3;
        const inside = f === duel.a || f === duel.b;
        const limit = inside ? r.r - PLAYER_RADIUS : r.r + PLAYER_RADIUS;
        // a little slack: clients fence themselves, this only catches what gets past that
        if (inside ? d <= limit + 0.15 : d >= limit - 0.15) continue;
        const k = limit / d;
        const tx = r.x + dx * k;
        const tz = r.z + dz * k;
        if (f.owner) this.shove(f, tx - f.x, tz - f.z);
        else {
          f.x = tx;
          f.z = tz;
        }
      }
    }
  }

  private ringViews(): RingView[] {
    return this.duels.map((d, i) => {
      if (!d) return { i, state: 'open' };
      const v: RingView = { i, state: d.state, a: d.a.id, b: d.b.id, an: d.a.name, bn: d.b.name, until: d.until };
      if (d.state === 'over') v.w = d.winner?.id ?? '';
      return v;
    });
  }

  private sendRings(): void {
    this.broadcast({ t: 'rings', r: this.ringViews() });
  }

  changeCharacter(p: Player, id: CharacterId): boolean {
    const f = p.fighter;
    if (!f) return false;
    if (!f.isAlive() || !inSafeZone(this.map, f.x, f.z)) {
      p.send({ t: 'notice', text: 'You can only change character inside the safe zone.', kind: 'warn' });
      return false;
    }
    if (id === f.char.id) return false;
    if (f.state !== 'idle' && f.state !== 'block') {
      p.send({ t: 'notice', text: 'Finish what you are doing before switching characters.', kind: 'warn' });
      return false;
    }
    // swapping must not double as a free heal or cooldown reset
    const hpFrac = f.hp / f.maxHp;
    const ready = { special: f.specialReadyAt, ability: f.abilityReadyAt };
    p.charId = id;
    f.setCharacter(id);
    f.hp = Math.max(1, Math.round(f.maxHp * hpFrac));
    f.specialReadyAt = ready.special;
    f.abilityReadyAt = ready.ability;
    f.stateStart = this.game.now();
    this.broadcast({ t: 'roster', add: [f.roster()] });
    return true;
  }
}
