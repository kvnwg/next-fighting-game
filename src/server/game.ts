/** Top-level server state: connections, the lobby, running arenas, matchmaking and challenges. */
import { performance } from 'node:perf_hooks';
import type { WebSocket } from 'ws';
import { CharacterId, isCharacterId } from '../shared/characters';
import { MATCH, SERVER_TICK_HZ } from '../shared/config';
import { ARENA_MAPS, MapDef } from '../shared/maps';
import { BotDifficulty, ClientMsg, MatchMode, PROTOCOL_VERSION, ServerMsg } from '../shared/protocol';
import { eloDelta } from '../shared/ranks';
import { Arena } from './arena';
import { Player } from './entities';
import { Lobby } from './lobby';
import { Store, profileView } from './store';

const MAX_MSGS_PER_SEC = 160;
const DIFFICULTIES: BotDifficulty[] = ['easy', 'normal', 'hard'];

export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16) : '';
  return s.length >= 2 ? s : `Wanderer${Math.floor(1000 + Math.random() * 9000)}`;
}

function sanitizeChat(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 140);
}

export class Game {
  readonly players = new Map<string, Player>();
  readonly lobby: Lobby;
  readonly arenas = new Set<Arena>();
  private queue: Player[] = [];
  /** pending challenges keyed by the challenged player's id */
  private challenges = new Map<string, { from: string; expires: number }>();
  private timer: NodeJS.Timeout | null = null;
  private lastMatchmake = 0;
  private lastQueueBroadcast = 0;
  private readonly t0 = performance.now();
  /** Server clock in ms (monotonic). Clients sync to this. Injectable for simulations. */
  readonly now: () => number;

  constructor(
    readonly store: Store,
    clock?: () => number,
  ) {
    this.now = clock ?? (() => performance.now() - this.t0 + 1000);
    this.lobby = new Lobby(this);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000 / SERVER_TICK_HZ);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.store.flush();
  }

  tick(): void {
    const now = this.now();
    // one broken instance must never take the whole server down
    for (const inst of [this.lobby, ...this.arenas]) {
      try {
        inst.tick(now);
      } catch (err) {
        console.error(`[game] ${inst.kind} tick failed`, err);
        if (inst instanceof Arena) this.closeArena(inst);
      }
    }
    if (now - this.lastMatchmake > 1000) {
      this.lastMatchmake = now;
      this.matchmake(now);
      for (const [target, c] of this.challenges) if (now > c.expires) this.challenges.delete(target);
    }
  }

  broadcastAll(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) p.sendRaw(data);
  }

  // ------------------------------------------------------------------ connections

  handleConnection(ws: WebSocket): void {
    let player: Player | null = null;
    ws.on('message', (data) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
      if (!player) {
        if (msg.t === 'hello') player = this.join(ws, msg);
        return;
      }
      if (!this.rateLimit(player)) {
        ws.close(4008, 'too many messages');
        return;
      }
      try {
        this.handle(player, msg);
      } catch (err) {
        console.error('[game] message error', err);
      }
    });
    ws.on('close', () => {
      if (player) this.leave(player);
    });
    ws.on('error', () => ws.close());
  }

  private rateLimit(p: Player): boolean {
    const now = this.now();
    if (now - p.msgWindowStart > 1000) {
      p.msgWindowStart = now;
      p.msgCount = 0;
    }
    return ++p.msgCount <= MAX_MSGS_PER_SEC;
  }

  private join(ws: WebSocket, msg: Extract<ClientMsg, { t: 'hello' }>): Player | null {
    if (msg.v !== PROTOCOL_VERSION) {
      ws.send(JSON.stringify({ t: 'notice', text: 'Your client is out of date. Refresh the page.', kind: 'warn' }));
      ws.close(4001, 'version');
      return null;
    }
    const name = sanitizeName(msg.name);
    let profile = this.store.byTokenOrNull(msg.token);
    if (profile) {
      const existing = this.players.get(profile.id);
      if (existing) {
        existing.send({ t: 'notice', text: 'You logged in from somewhere else.', kind: 'warn' });
        existing.ws.close(4002, 'replaced');
        this.leave(existing);
      }
      profile.name = name;
    } else {
      profile = this.store.create(name);
    }
    profile.lastSeen = Date.now();
    this.store.markDirty();
    const char: CharacterId = isCharacterId(msg.char) ? msg.char : 'ronin';
    const p = new Player(ws, profile, char);
    this.players.set(p.id, p);
    p.send({ t: 'welcome', id: p.id, token: profile.token, profile: profileView(profile), online: this.players.size, serverTime: this.now() });
    this.lobby.addPlayer(p, this.lobby.spawnPoint());
    this.broadcastAll({ t: 'online', n: this.players.size });
    this.broadcastAll({ t: 'chat', name: '', text: `${p.name} entered the grounds.`, sys: true });
    return p;
  }

  leave(p: Player): void {
    if (p.closed) return;
    p.closed = true;
    this.unqueue(p);
    this.challenges.delete(p.id);
    const inst = p.instance;
    if (inst instanceof Arena) inst.forfeit(p);
    inst?.removePlayer(p);
    this.players.delete(p.id);
    this.broadcastAll({ t: 'online', n: this.players.size });
  }

  // ------------------------------------------------------------------ messages

  private handle(p: Player, msg: ClientMsg): void {
    const now = this.now();
    switch (msg.t) {
      case 'ping':
        if (Number.isFinite(msg.rtt)) p.rtt = p.rtt * 0.7 + Math.max(0, Math.min(1000, msg.rtt as number)) * 0.3;
        p.send({ t: 'pong', c: msg.c, s: now });
        break;
      case 'move':
        p.instance?.handleMove(p, msg);
        break;
      case 'act':
        p.instance?.handleAction(p, msg);
        break;
      case 'char':
        if (!isCharacterId(msg.id)) return;
        if (p.instance === this.lobby) this.lobby.changeCharacter(p, msg.id);
        else p.send({ t: 'notice', text: 'Finish your match before switching characters.', kind: 'warn' });
        break;
      case 'queue':
        this.enqueue(p, msg.mode, DIFFICULTIES.includes(msg.diff as BotDifficulty) ? msg.diff : 'normal');
        break;
      case 'unqueue':
        this.unqueue(p);
        break;
      case 'challenge':
        this.challenge(p, msg.target);
        break;
      case 'challengeReply':
        this.challengeReply(p, msg.from, !!msg.accept);
        break;
      case 'chat': {
        const text = sanitizeChat(msg.text);
        if (!text || now - p.lastChatAt < 600) return;
        p.lastChatAt = now;
        this.broadcastAll({ t: 'chat', name: p.name, text });
        break;
      }
      case 'forfeit':
        if (p.instance instanceof Arena) p.instance.forfeit(p);
        break;
      case 'leaderboard':
        p.send({ t: 'leaderboard', entries: this.store.leaderboard(25), you: this.store.position(p.profile), total: this.store.placedCount() });
        break;
      case 'fell': {
        const f = p.fighter;
        if (f && p.instance && f.y < -3) p.instance.killByEnvironment(f, 'fall', now);
        break;
      }
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ queue & matchmaking

  private enqueue(p: Player, mode: 'ranked' | 'practice', diff: BotDifficulty = 'normal'): void {
    if (p.instance !== this.lobby) {
      p.send({ t: 'notice', text: 'You are already in a match.', kind: 'warn' });
      return;
    }
    if (mode === 'practice') {
      this.unqueue(p);
      this.startMatch('practice', p, null, diff);
      return;
    }
    if (mode !== 'ranked' || p.queue) return;
    p.queue = { mode, since: this.now() };
    this.queue.push(p);
    this.sendQueueStatus();
  }

  unqueue(p: Player): void {
    if (!p.queue) return;
    p.queue = null;
    this.queue = this.queue.filter((q) => q !== p);
    p.send({ t: 'queue', mode: null, since: 0, searching: this.queue.length });
    this.sendQueueStatus();
  }

  private sendQueueStatus(): void {
    for (const q of this.queue) q.send({ t: 'queue', mode: 'ranked', since: q.queue!.since, searching: this.queue.length });
  }

  /** Pair queued players with the closest rating; the acceptable gap widens the longer you wait. */
  matchmake(now: number): void {
    if (this.queue.length >= 2) {
      const pool = [...this.queue].sort((a, b) => a.profile.mmr - b.profile.mmr);
      const used = new Set<Player>();
      for (let i = 0; i < pool.length; i++) {
        const a = pool[i];
        if (used.has(a)) continue;
        let best: Player | null = null;
        let bestGap = Infinity;
        for (let j = i + 1; j < pool.length; j++) {
          const b = pool[j];
          if (used.has(b)) continue;
          const gap = Math.abs(a.profile.mmr - b.profile.mmr);
          const waited = Math.min(now - a.queue!.since, now - b.queue!.since) / 1000;
          const allowed = 150 + waited * 30;
          if (gap <= allowed && gap < bestGap) {
            best = b;
            bestGap = gap;
          }
        }
        if (best) {
          used.add(a);
          used.add(best);
        }
        if (best) this.startMatch('ranked', a, best);
      }
    }
    if (now - this.lastQueueBroadcast > 3000) {
      this.lastQueueBroadcast = now;
      this.sendQueueStatus();
    }
  }

  private pickMap(): MapDef {
    return ARENA_MAPS[Math.floor(Math.random() * ARENA_MAPS.length)];
  }

  startMatch(mode: MatchMode, a: Player, b: Player | null, diff?: BotDifficulty, map: MapDef = this.pickMap()): Arena {
    for (const p of [a, b]) {
      if (!p) continue;
      this.unqueue(p);
      this.challenges.delete(p.id);
      p.instance?.removePlayer(p);
    }
    const arena = new Arena(this, map, mode, a, b, diff);
    this.arenas.add(arena);
    return arena;
  }

  /** Match over: send everyone back to the lobby. */
  closeArena(arena: Arena): void {
    if (!this.arenas.delete(arena)) return;
    const humans = [...arena.players];
    arena.destroy();
    for (const p of humans) {
      if (p.closed) continue;
      this.lobby.addPlayer(p, this.lobby.spawnPoint());
      p.send({ t: 'profile', profile: profileView(p.profile) });
    }
  }

  reportResult(arena: Arena, winner: 0 | 1, reason: 'ko' | 'forfeit' | 'timeout'): void {
    const [pa, pb] = arena.humans;
    const ranked = arena.mode === 'ranked' && pa && pb;
    const before = [pa, pb].map((p) => (p ? { mmr: p.profile.mmr, placements: p.profile.placements } : null));
    const deltas: [number, number] = [0, 0];
    if (ranked) {
      const ra = pa.profile.mmr;
      const rb = pb.profile.mmr;
      deltas[0] = eloDelta(ra, rb, winner === 0 ? 1 : 0, pa.profile.placements);
      deltas[1] = eloDelta(rb, ra, winner === 1 ? 1 : 0, pb.profile.placements);
      for (const [i, p] of [pa, pb].entries()) {
        const prof = p.profile;
        const won = winner === i;
        prof.mmr = Math.max(0, prof.mmr + deltas[i]);
        prof.peak = Math.max(prof.peak, prof.mmr);
        prof.placements++;
        if (won) {
          prof.wins++;
          prof.streak = prof.streak >= 0 ? prof.streak + 1 : 1;
        } else {
          prof.losses++;
          prof.streak = prof.streak <= 0 ? prof.streak - 1 : -1;
        }
      }
      this.store.markDirty();
    }
    for (const [i, p] of [pa, pb].entries()) {
      if (!p) continue;
      p.send({
        t: 'result',
        mode: arena.mode,
        won: winner === i,
        reason,
        scores: arena.scores,
        ...(ranked
          ? { before: before[i]!, after: { mmr: p.profile.mmr, placements: p.profile.placements }, delta: deltas[i] }
          : {}),
      });
      if (ranked) p.send({ t: 'profile', profile: profileView(p.profile) });
    }
    if (ranked) {
      const w = winner === 0 ? pa : pb;
      const l = winner === 0 ? pb : pa;
      this.broadcastAll({ t: 'chat', name: '', text: `${w.name} defeated ${l.name} in a ranked duel.`, sys: true });
    }
  }

  // ------------------------------------------------------------------ challenges

  private challenge(p: Player, targetId: unknown): void {
    if (typeof targetId !== 'string') return;
    const target = this.players.get(targetId);
    if (!target || target === p) return;
    if (p.instance !== this.lobby || target.instance !== this.lobby) {
      p.send({ t: 'notice', text: `${target.name} is busy right now.`, kind: 'warn' });
      return;
    }
    const existing = this.challenges.get(target.id);
    if (existing && existing.from === p.id && this.now() < existing.expires) return;
    const expires = this.now() + MATCH.challengeTimeout;
    this.challenges.set(target.id, { from: p.id, expires });
    target.send({ t: 'challenge', from: p.id, name: p.name, char: p.charId, expires });
    p.send({ t: 'notice', text: `Challenge sent to ${target.name}.`, kind: 'info' });
  }

  private challengeReply(p: Player, from: unknown, accept: boolean): void {
    const c = this.challenges.get(p.id);
    if (!c || c.from !== from || this.now() > c.expires) return;
    this.challenges.delete(p.id);
    const challenger = this.players.get(c.from);
    if (!challenger) return;
    if (!accept) {
      challenger.send({ t: 'notice', text: `${p.name} declined your challenge.`, kind: 'info' });
      return;
    }
    if (challenger.instance !== this.lobby || p.instance !== this.lobby) {
      p.send({ t: 'notice', text: 'That challenge is no longer available.', kind: 'warn' });
      return;
    }
    this.startMatch('casual', challenger, p);
  }
}
