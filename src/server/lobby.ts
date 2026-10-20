/**
 * The shared lobby: everyone spawns in the shrine plaza (a safe zone). Step outside it and anyone
 * can fight anyone. There's a training yard with a passive dummy and a sparring dummy that swings back.
 */
import { CharacterId } from '../shared/characters';
import { COMBAT } from '../shared/config';
import { LOBBY_MAP, inSafeZone } from '../shared/maps';
import { BotBrain } from './bot';
import { Player, ServerFighter } from './entities';
import type { Game } from './game';
import { Instance } from './instance';

export class Lobby extends Instance {
  readonly kind = 'lobby' as const;

  constructor(game: Game) {
    super(game, LOBBY_MAP);
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

  spawnPoint(): { x: number; z: number; yaw: number } {
    const s = this.map.spawns[Math.floor(Math.random() * this.map.spawns.length)];
    return { x: s.x + (Math.random() - 0.5), z: s.z + (Math.random() - 0.5), yaw: s.yaw };
  }

  canDamage(a: ServerFighter, d: ServerFighter): boolean {
    if (!a.isAlive() || !d.isAlive()) return false;
    if (a.dummy && d.dummy) return false;
    if (inSafeZone(this.map, a.x, a.z) || inSafeZone(this.map, d.x, d.z)) return false;
    if (d.spawnProtectedUntil > this.game.now()) return false;
    return true;
  }

  protected onKill(victim: ServerFighter, killer: ServerFighter | null, how: string, now: number): void {
    if (victim.dummy) {
      victim.respawnAt = now + 2500;
      return;
    }
    victim.respawnAt = now + COMBAT.respawnTime;
    const killerName = killer && killer !== victim ? killer.name : '';
    this.broadcast({ t: 'feed', killer: killerName, victim: victim.name, how });
    if (killer?.owner && killer !== victim) {
      killer.owner.profile.kills++;
      this.game.store.markDirty();
    }
  }

  protected rules(now: number, dt: number): void {
    for (const f of this.fighters.values()) {
      if (!f.isAlive()) {
        if (f.respawnAt && now >= f.respawnAt) {
          f.respawnAt = 0;
          if (f.dummy) {
            const d = LOBBY_MAP.dummies!.find((_, i) => `dummy-${i}` === f.id)!;
            this.revive(f, d.x, d.z, d.yaw, now, 0);
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
      // out-of-combat health regen
      if (f.hp < f.maxHp && now - f.lastDamageAt > COMBAT.lobbyRegenDelay) f.heal(COMBAT.lobbyRegenRate * dt);
    }
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
