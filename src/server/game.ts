/** Top-level server state: connections, the lobby, running arenas, matchmaking and challenges. */
import { CHARACTER_IDS, CharacterId, isCharacterId } from '../shared/characters';
import { MATCH, SERVER_TICK_HZ } from '../shared/config';
import { ARENA_MAPS, MapDef } from '../shared/maps';
import { BotDifficulty, ClientMsg, MatchMode, PROTOCOL_VERSION, SelectView, ServerMsg } from '../shared/protocol';
import { eloDelta } from '../shared/ranks';
import { Arena, botName } from './arena';
import { Player, SocketLike } from './entities';
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

/** A match waiting on the map and fighter select. */
interface PendingMatch {
  mode: MatchMode;
  players: [Player, Player | null];
  diff?: BotDifficulty;
  botRating?: number;
  /** the AI opponent's own picks, made at voteAt */
  bot: { char: CharacterId; name: string; voteAt: number } | null;
  endsAt: number;
  maps: string[];
  votes: SelectView['votes'];
}

export interface GameOptions {
  /** Single-player mode (runs in the browser): ranked queues are matched against rated AI opponents. */
  offline?: boolean;
  /** Wandering AI fighters in the lobby. */
  roamers?: number;
  /** Always use this arena (dev/testing). */
  arena?: string;
  /** How long the map and fighter select stays open before a match (ms). */
  selectTime?: number;
}

export class Game {
  readonly players = new Map<string, Player>();
  readonly lobby: Lobby;
  readonly arenas = new Set<Arena>();
  private queue: Player[] = [];
  /** pending challenges keyed by the challenged player's id */
  private challenges = new Map<string, { from: string; expires: number }>();
  /** Matches waiting on the map and fighter select, by player. */
  private selecting = new Map<Player, PendingMatch>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastMatchmake = 0;
  private lastQueueBroadcast = 0;
  private lastServerPing = 0;
  private readonly t0 = performance.now();
  /** Server clock in ms (monotonic). Clients sync to this. Injectable for simulations. */
  readonly now: () => number;

  constructor(
    readonly store: Store,
    clock?: () => number,
    readonly options: GameOptions = {},
  ) {
    this.now = clock ?? (() => performance.now() - this.t0 + 1000);
    this.lobby = new Lobby(this, options.roamers ?? 0);
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
    if (now - this.lastServerPing > 2000) {
      // latency is measured by the server, so a client can't claim extra lag compensation
      this.lastServerPing = now;
      for (const p of this.players.values()) {
        p.lastPingS = Math.round(now);
        p.send({ t: 'sping', s: p.lastPingS });
      }
    }
    for (const pm of new Set(this.selecting.values())) {
      if (pm.bot && now >= pm.bot.voteAt && !pm.votes.char[1]) {
        // the AI makes its picks a moment in, like a person would
        pm.votes.char[1] = pm.bot.char;
        pm.votes.map[1] = Math.random() < 0.5 && pm.votes.map[0] ? pm.votes.map[0] : pm.maps[Math.floor(Math.random() * pm.maps.length)];
        this.sendSelect(pm);
      }
      if (now >= pm.endsAt) this.finishSelect(pm);
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

  handleConnection(ws: SocketLike): void {
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

  private join(ws: SocketLike, msg: Extract<ClientMsg, { t: 'hello' }>): Player | null {
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
    this.cancelSelect(p, `${p.name} left.`);
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
        p.send({ t: 'pong', c: Number.isFinite(msg.c) ? msg.c : 0, s: now });
        break;
      case 'spong':
        if (msg.s !== p.lastPingS || p.lastPingS === 0) return;
        p.lastPingS = 0;
        p.rtt = p.rtt * 0.6 + Math.max(0, Math.min(1000, now - msg.s)) * 0.4;
        break;
      case 'move':
        p.instance?.handleMove(p, msg);
        break;
      case 'act':
        p.instance?.handleAction(p, msg);
        break;
      case 'vote':
        this.vote(p, msg.map, msg.char);
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
    if (this.selecting.has(p)) return;
    if (mode === 'practice') {
      this.unqueue(p);
      this.beginSelect('practice', p, null, diff);
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
    if (this.options.offline) {
      // nobody else is here: after a short "search", face an AI rated close to you
      for (const p of [...this.queue]) {
        if (now - p.queue!.since < 2500) continue;
        const rating = Math.max(600, Math.round(p.profile.mmr + (Math.random() - 0.45) * 120));
        this.beginSelect('ranked', p, null, undefined, rating);
      }
      return;
    }
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
        if (best) this.beginSelect('ranked', a, best);
      }
    }
    if (now - this.lastQueueBroadcast > 3000) {
      this.lastQueueBroadcast = now;
      this.sendQueueStatus();
    }
  }

  private pickMap(): MapDef {
    const fixed = ARENA_MAPS.find((m) => m.id === this.options.arena);
    if (fixed) return fixed;
    return ARENA_MAPS[Math.floor(Math.random() * ARENA_MAPS.length)];
  }

  startMatch(mode: MatchMode, a: Player, b: Player | null, diff?: BotDifficulty, map: MapDef = this.pickMap(), botRating?: number, bot?: { char: CharacterId; name: string }): Arena {
    for (const p of [a, b]) {
      if (!p) continue;
      this.unqueue(p);
      this.challenges.delete(p.id);
      p.instance?.removePlayer(p);
    }
    const arena = new Arena(this, map, mode, a, b, diff, botRating, bot);
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
    const humans = arena.humans;
    // ranked between two players, or (offline) against a rated AI opponent
    const opponentRating = (i: 0 | 1): number | null => {
      const other = humans[i === 0 ? 1 : 0];
      if (other) return other.profile.mmr;
      return arena.botRating ?? null;
    };
    const rated = arena.mode === 'ranked';
    const before = humans.map((p) => (p ? { mmr: p.profile.mmr, placements: p.profile.placements } : null));
    const deltas: [number, number] = [0, 0];
    if (rated) {
      const ratings = [opponentRating(0), opponentRating(1)];
      for (const i of [0, 1] as const) {
        const p = humans[i];
        const opp = ratings[i];
        if (!p || opp === null) continue;
        deltas[i] = eloDelta(p.profile.mmr, opp, winner === i ? 1 : 0, p.profile.placements);
      }
      for (const i of [0, 1] as const) {
        const p = humans[i];
        if (!p || ratings[i] === null) continue;
        const prof = p.profile;
        prof.mmr = Math.max(0, prof.mmr + deltas[i]);
        prof.peak = Math.max(prof.peak, prof.mmr);
        prof.placements++;
        if (winner === i) {
          prof.wins++;
          prof.streak = prof.streak >= 0 ? prof.streak + 1 : 1;
        } else {
          prof.losses++;
          prof.streak = prof.streak <= 0 ? prof.streak - 1 : -1;
        }
      }
      this.store.markDirty();
    }
    for (const i of [0, 1] as const) {
      const p = humans[i];
      if (!p) continue;
      const counted = rated && opponentRating(i) !== null;
      p.send({
        t: 'result',
        mode: arena.mode,
        won: winner === i,
        reason,
        scores: arena.scores,
        ...(counted ? { before: before[i]!, after: { mmr: p.profile.mmr, placements: p.profile.placements }, delta: deltas[i] } : {}),
      });
      if (counted) p.send({ t: 'profile', profile: profileView(p.profile) });
    }
    const [pa, pb] = humans;
    if (rated && pa && pb) {
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
    if (p.instance !== this.lobby || target.instance !== this.lobby || this.selecting.has(p) || this.selecting.has(target)) {
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
    if (challenger.instance !== this.lobby || p.instance !== this.lobby || this.selecting.has(challenger) || this.selecting.has(p)) {
      p.send({ t: 'notice', text: 'That challenge is no longer available.', kind: 'warn' });
      return;
    }
    this.beginSelect('casual', challenger, p);
  }

  // ------------------------------------------------------------------ map and fighter select

  /** Open the map and fighter select for a match; it starts when the vote closes. */
  beginSelect(mode: MatchMode, a: Player, b: Player | null, diff?: BotDifficulty, botRating?: number): void {
    for (const p of [a, b]) {
      if (!p) continue;
      this.unqueue(p);
      this.challenges.delete(p.id);
    }
    const now = this.now();
    const fixed = ARENA_MAPS.find((m) => m.id === this.options.arena);
    const pm: PendingMatch = {
      mode,
      players: [a, b],
      diff,
      botRating,
      bot: b ? null : { char: CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)], name: botName(diff ?? 'normal', botRating), voteAt: now + 1200 + Math.random() * 2200 },
      endsAt: now + (this.options.selectTime ?? MATCH.selectTime),
      maps: fixed ? [fixed.id] : ARENA_MAPS.map((m) => m.id),
      votes: { map: [null, null], char: [null, null] },
    };
    for (const p of pm.players) if (p) this.selecting.set(p, pm);
    this.sendSelect(pm);
  }

  private sendSelect(pm: PendingMatch): void {
    const [a, b] = pm.players;
    const side = (p: Player | null, i: 0 | 1) => (p ? { name: p.name, bot: false, char: p.charId } : { name: pm.bot!.name, bot: true, char: pm.votes.char[i] ?? pm.bot!.char });
    const base: Omit<SelectView, 'you'> = { mode: pm.mode, endsAt: pm.endsAt, sides: [side(a, 0), side(b, 1)], maps: pm.maps, votes: pm.votes };
    a.send({ t: 'select', ...base, you: 0 });
    b?.send({ t: 'select', ...base, you: 1 });
  }

  private vote(p: Player, map: unknown, char: unknown): void {
    const pm = this.selecting.get(p);
    if (!pm) return;
    const i = pm.players[0] === p ? 0 : 1;
    if (typeof map === 'string' && (map === 'random' || pm.maps.includes(map))) pm.votes.map[i] = map;
    if (isCharacterId(char)) pm.votes.char[i] = char;
    this.sendSelect(pm);
  }

  /** The vote closes: settle the arena and the fighters, and start the match. */
  private finishSelect(pm: PendingMatch): void {
    const [a, b] = pm.players;
    for (const p of pm.players) if (p) this.selecting.delete(p);
    if (a.closed || (b && b.closed)) return;
    // one of the picked arenas (a "random" pick leaves it to chance), or any arena if nobody picked
    const picked = pm.votes.map.filter((m): m is string => !!m).map((m) => (m === 'random' ? pm.maps[Math.floor(Math.random() * pm.maps.length)] : m));
    const id = picked.length ? picked[Math.floor(Math.random() * picked.length)] : pm.maps[Math.floor(Math.random() * pm.maps.length)];
    const map = ARENA_MAPS.find((m) => m.id === id) ?? this.pickMap();
    for (const [i, p] of [a, b].entries()) {
      const c = pm.votes.char[i];
      if (p && c) p.charId = c;
    }
    const bot = pm.bot ? { char: pm.votes.char[1] ?? pm.bot.char, name: pm.bot.name } : undefined;
    this.startMatch(pm.mode, a, b, pm.diff, map, pm.botRating, bot);
  }

  /** Someone left during the select: call it off and tell the other side. */
  private cancelSelect(p: Player, reason: string): void {
    const pm = this.selecting.get(p);
    if (!pm) return;
    for (const q of pm.players) {
      if (!q) continue;
      this.selecting.delete(q);
      if (q !== p) q.send({ t: 'selectCancel', reason });
    }
  }
}
