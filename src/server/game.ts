/** Top-level server state: connections, the lobbies, running arenas, matchmaking and challenges. */
import { CHARACTER_IDS, CharacterId, isCharacterId } from '../shared/characters';
import { MATCH, SERVER_TICK_HZ } from '../shared/config';
import { ARENA_MAPS, MapDef } from '../shared/maps';
import { AD_MIN_GAP_MS, AD_REWARD, FREE_PICK_GAMES, MATCH_AD_EVERY, MATCH_AD_REWARD, MATCH_AD_WINDOW_MS, MATCH_REWARD, TUTORIAL_REWARD, UnlockRefusal, canUnlockChar, canUnlockMap, freePickReady, sharedMaps } from '../shared/progress';
import { BotDifficulty, ClientMsg, MatchMode, PROTOCOL_VERSION, SelectView, ServerMsg } from '../shared/protocol';
import { eloDelta } from '../shared/ranks';
import { normalizeRoomCode, randomRoomCode } from '../shared/rooms';
import { Arena, botName } from './arena';
import type { Censor } from './censor';
import { Player, SocketLike } from './entities';
import { Lobby } from './lobby';
import { Store, profileView } from './store';

const MAX_MSGS_PER_SEC = 160;

/** Why an unlock was refused, as the player is told. */
const REFUSED: Record<UnlockRefusal, string> = {
  owned: 'You already have that.',
  gold: 'Reach Gold rank to unlock this fighter.',
  coins: 'Not enough coins.',
  free: 'Your free fighter isn\'t ready yet.',
  unknown: 'Nothing to unlock there.',
};
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
  /** the AI opponent's own picks, made at voteAt (and the rating it showed, if it was met in the lobby) */
  bot: { char: CharacterId; name: string; voteAt: number; rating?: number } | null;
  endsAt: number;
  maps: string[];
  votes: SelectView['votes'];
}

export interface GameOptions {
  /** Single-player mode (runs in the browser): ranked queues are matched against rated AI opponents. */
  offline?: boolean;
  /** Wandering computer-run fighters in each public lobby. */
  roamers?: number;
  /**
   * How long a ranked search waits for another player before it's matched against a rated
   * computer opponent instead (ms). Offline that's all there is, so it's a moment; online, a while.
   */
  rankedFallback?: number;
  /** Always use this arena (dev/testing). */
  arena?: string;
  /** How long the map and fighter select stays open before a match (ms). */
  selectTime?: number;
  /** How long the match intro (the ring entrances) runs (ms). */
  introTime?: number;
  /** A test build: everyone owns every fighter and arena, with coins to spare. */
  unlockAll?: boolean;
  /**
   * Drop a connection that has sent nothing for this long (ms; clients ping every second). A phone
   * that lost its network can leave its socket open for minutes, its fighter standing there.
   */
  silentTimeout?: number;
  /** Runs the matches instead of the lobby (recording the trailer: see src/client/demo.ts). */
  director?: Director;
  /** Moderation for names and chat (the server's; single player has nobody to protect). */
  censor?: Censor;
}

/** Puts players in matches of its choosing, instead of the lobby. */
export interface Director {
  /** a player is in: true if the director has placed them */
  join(p: Player): boolean;
  /** their match is over: true if the director has placed them again */
  matchOver(p: Player): boolean;
  tick(now: number): void;
}

/** Coins a test build tops everyone up to. */
const TEST_COINS = 99_999;
/** how long an online ranked search waits for a player before a computer opponent (see rankedFallback) */
const RANKED_FALLBACK_MS = 15_000;

export class Game {
  readonly players = new Map<string, Player>();
  /** The lobbies, LOBBY_CAP players each; the first one always stays open. Private ones have a code. */
  readonly lobbies: Lobby[] = [];
  /** the lobby each player was last in, to go back to after a match */
  private home = new WeakMap<Player, Lobby>();
  readonly arenas = new Set<Arena>();
  private queue: Player[] = [];
  /** challenges to the lobby's wanderers, waiting on their answer */
  private answers: { p: Player; name: string; char: CharacterId; rating?: number; at: number; accept: boolean }[] = [];
  /** pending challenges keyed by the challenged player's id (ring: fought in that lobby ring) */
  private challenges = new Map<string, { from: string; expires: number; ring: number }>();
  /** Matches waiting on the map and fighter select, by player. */
  private selecting = new Map<Player, PendingMatch>();
  /** when an ad last paid out, by account: a fresh connection mustn't start the gap over */
  private lastAdAt = new Map<string, number>();
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
    this.lobbies.push(new Lobby(this, options.roamers ?? 0, 1));
  }

  /** Who's online, as players see it: everyone connected, and the wanderers that pass as players. */
  get online(): number {
    let n = this.players.size;
    for (const l of this.lobbies) n += l.wanderers;
    return n;
  }

  /** The first lobby (the only one until it fills up). */
  get lobby(): Lobby {
    return this.lobbies[0];
  }

  /**
   * Where a player goes: back to `prefer` if there's room, else the busiest public lobby with room
   * (so lobbies stay lively rather than spreading everyone thin), else a new one.
   */
  private lobbyFor(prefer?: Lobby): Lobby {
    if (prefer && !prefer.full && this.lobbies.includes(prefer)) return prefer;
    let best: Lobby | null = null;
    for (const l of this.lobbies) if (!l.code && !l.full && (!best || l.players.size > best.players.size)) best = l;
    if (best) return best;
    // the lowest free number, so lobbies that emptied out get reused
    let n = 1;
    while (this.lobbies.some((l) => !l.code && l.n === n)) n++;
    const l = new Lobby(this, this.options.roamers ?? 0, n);
    this.lobbies.push(l);
    if (l.wanderers) this.broadcastAll({ t: 'online', n: this.online });
    return l;
  }

  /** Close lobbies that emptied out, private ones too (players away in a match still count: they come back). */
  private closeEmptyLobbies(): void {
    if (this.lobbies.length < 2) return;
    const homes = new Set<Lobby>();
    for (const p of this.players.values()) {
      const h = this.home.get(p);
      if (h) homes.add(h);
    }
    for (let i = this.lobbies.length - 1; i > 0; i--) {
      const l = this.lobbies[i];
      if (l.players.size > 0 || homes.has(l)) continue;
      l.destroy();
      this.lobbies.splice(i, 1);
      if (l.wanderers) this.broadcastAll({ t: 'online', n: this.online });
    }
  }

  /** Put a player in a lobby (their own one if it has room). */
  enterLobby(p: Player): void {
    const l = this.lobbyFor(this.home.get(p));
    this.home.set(p, l);
    l.addPlayer(p, l.spawnPoint());
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      // a throw out of a timer would take the whole server (everyone's match) down with it
      try {
        this.tick();
      } catch (err) {
        console.error('[game] tick failed', err);
      }
    }, 1000 / SERVER_TICK_HZ);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.store.flush();
  }

  tick(): void {
    const now = this.now();
    if (this.answers.length) this.answerChallenges(now);
    this.options.director?.tick(now);
    // one broken instance must never take the whole server down
    for (const inst of [...this.lobbies, ...this.arenas]) {
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
      const silent = this.options.silentTimeout;
      for (const p of [...this.players.values()]) {
        if (silent && now - p.lastHeardAt > silent) {
          p.ws.close(4003, 'connection timed out');
          this.leave(p);
          continue;
        }
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
      if (now >= pm.endsAt) {
        try {
          this.finishSelect(pm);
        } catch (err) {
          // the match couldn't start: nobody is left on the select, or out of every lobby
          console.error('[game] match start failed', err);
          for (const p of pm.players) {
            if (!p || p.closed) continue;
            if (!p.instance) this.enterLobby(p);
            p.send({ t: 'selectCancel', reason: 'The match could not start.' });
          }
        }
      }
    }

    if (now - this.lastMatchmake > 1000) {
      this.lastMatchmake = now;
      this.matchmake(now);
      for (const [target, c] of this.challenges) if (now > c.expires) this.challenges.delete(target);
      for (const [id, at] of this.lastAdAt) if (now - at >= AD_MIN_GAP_MS) this.lastAdAt.delete(id);
      this.closeEmptyLobbies();
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
      // (a throw out of a socket's handler would take the whole server down)
      try {
        if (!player) {
          if (msg.t === 'hello') player = this.join(ws, msg);
          return;
        }
        player.lastHeardAt = this.now();
        if (!this.rateLimit(player)) {
          ws.close(4008, 'too many messages');
          return;
        }
        this.handle(player, msg);
      } catch (err) {
        console.error('[game] message error', err);
      }
    });
    ws.on('close', () => {
      try {
        if (player) this.leave(player);
      } catch (err) {
        console.error('[game] leave failed', err);
      }
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
      // (the reason is what the player reads: the notice above is held back behind the title screen)
      ws.close(4001, 'the game has been updated, reload the page');
      return null;
    }
    let name = sanitizeName(msg.name);
    const renamed = !!this.options.censor && !this.options.censor.allowed(name);
    if (renamed) name = sanitizeName('');
    let profile = this.store.byTokenOrNull(msg.token);
    if (profile) {
      const existing = this.players.get(profile.id);
      if (existing) {
        existing.send({ t: 'notice', text: 'You logged in from somewhere else.', kind: 'warn' });
        existing.ws.close(4002, 'you logged in from somewhere else');
        this.leave(existing);
      }
      profile.name = name;
    } else {
      profile = this.store.create(name);
    }
    profile.lastSeen = Date.now();
    if (this.options.unlockAll) {
      profile.chars = [...CHARACTER_IDS];
      profile.maps = ARENA_MAPS.map((m) => m.id);
      profile.coins = Math.max(profile.coins, TEST_COINS);
    }
    this.store.markDirty();
    // you play a fighter you own (a locked one falls back to the Ronin)
    const char: CharacterId = isCharacterId(msg.char) && profile.chars.includes(msg.char) ? msg.char : 'ronin';
    const p = new Player(ws, profile, char);
    p.lastHeardAt = this.now();
    this.players.set(p.id, p);
    p.send({ t: 'welcome', id: p.id, token: profile.token, profile: profileView(profile), online: this.online, serverTime: this.now() });
    if (renamed) p.send({ t: 'notice', text: `That name isn't allowed here, so you're ${name} for now.`, kind: 'warn' });
    if (!this.options.director?.join(p)) this.enterLobby(p);
    this.broadcastAll({ t: 'online', n: this.online });
    // (to the public grounds' chat: a private lobby's stays among its own people)
    this.chatFrom(p, { t: 'chat', name: '', text: `${p.name} entered the grounds.`, sys: true });
    return p;
  }

  /** a name as others see it: one from before the filter that it wouldn't let through is hidden */
  private shownName(name: string): string {
    return !this.options.censor || this.options.censor.allowed(name) ? name : '*'.repeat(name.length);
  }

  leave(p: Player): void {
    if (p.closed) return;
    p.closed = true;
    this.cancelSelect(p, `${p.name} left.`);
    this.unqueue(p);
    // challenges to them, and the ones they sent (which would otherwise still stand if they came back)
    for (const [target, c] of this.challenges) if (target === p.id || c.from === p.id) this.challenges.delete(target);
    const inst = p.instance;
    if (inst instanceof Arena) inst.forfeit(p);
    inst?.removePlayer(p);
    this.players.delete(p.id);
    this.broadcastAll({ t: 'online', n: this.online });
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
        if (!p.profile.chars.includes(msg.id)) p.send({ t: 'notice', text: 'Unlock that fighter first.', kind: 'warn' });
        else if (p.instance instanceof Lobby) p.instance.changeCharacter(p, msg.id);
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
        const text = this.options.censor?.clean(sanitizeChat(msg.text)) ?? sanitizeChat(msg.text);
        if (!text || now - p.lastChatAt < 600) return;
        p.lastChatAt = now;
        this.chatFrom(p, { t: 'chat', name: p.name, text });
        break;
      }
      case 'forfeit':
        if (p.instance instanceof Arena) p.instance.forfeit(p, true);
        break;
      case 'leaderboard':
        p.send({ t: 'leaderboard', entries: this.store.leaderboard(25).map((e) => ({ ...e, name: this.shownName(e.name) })), you: this.store.position(p.profile), total: this.store.placedCount() });
        break;
      case 'unlock':
        this.unlock(p, msg.kind, msg.id, !!msg.free);
        break;
      case 'ad':
        this.adReward(p, msg.kind);
        break;
      case 'room':
        this.room(p, msg.a, msg.a === 'join' ? msg.code : undefined);
        break;
      case 'tutorial':
        if (msg.a === 'start') this.startTutorial(p);
        else if (msg.a === 'skip') {
          if (p.instance instanceof Arena && p.instance.coach) p.instance.forfeit(p, true);
          else this.endTutorial(p, false);
        }
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
    if (!(p.instance instanceof Lobby)) {
      p.send({ t: 'notice', text: 'You are already in a match.', kind: 'warn' });
      return;
    }
    if (p.instance.inDuel(p)) {
      p.send({ t: 'notice', text: 'Finish your ring duel first.', kind: 'warn' });
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

  /**
   * Pair queued players with the closest rating; the acceptable gap widens the longer you wait. Nobody
   * found in time (offline there's nobody to find): a computer opponent rated close to you.
   */
  matchmake(now: number): void {
    if (!this.options.offline && this.queue.length >= 2) {
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
    const fallback = this.options.rankedFallback ?? (this.options.offline ? 2500 : RANKED_FALLBACK_MS);
    for (const p of [...this.queue]) {
      if (now - p.queue!.since < fallback) continue;
      const rating = Math.max(600, Math.round(p.profile.mmr + (Math.random() - 0.45) * 120));
      this.beginSelect('ranked', p, null, undefined, rating);
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

  startMatch(mode: MatchMode, a: Player, b: Player | null, diff?: BotDifficulty, map: MapDef = this.pickMap(), botRating?: number, bot?: { char: CharacterId; name: string; rating?: number }): Arena {
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
      if (p.closed || this.options.director?.matchOver(p)) continue;
      this.enterLobby(p);
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
    // coins for everyone who saw it through (giving up or leaving earns nothing and doesn't count
    // towards the free fighter)
    const earned: [number, number] = [0, 0];
    const table = arena.mode === 'tutorial' ? null : MATCH_REWARD[arena.mode];
    for (const i of [0, 1] as const) {
      const p = humans[i];
      if (!p || !table || (reason === 'forfeit' && winner !== i)) continue;
      const prof = p.profile;
      earned[i] = winner === i ? table.win : table.loss;
      prof.coins += earned[i];
      prof.games++;
      prof.sinceAd = (prof.sinceAd ?? 0) + 1;
      if (prof.games === FREE_PICK_GAMES && freePickReady(prof)) p.send({ t: 'notice', text: 'Your free fighter is ready! Open Fighters to pick one.', kind: 'good' });
      this.store.markDirty();
    }
    for (const i of [0, 1] as const) {
      const p = humans[i];
      if (!p) continue;
      const counted = rated && opponentRating(i) !== null;
      // an ad plays once the result card goes, paying when it's watched through: after a win, once a
      // few matches have been finished since the last one (never after a loss, nor the tutorial)
      const ad = earned[i] > 0 && winner === i && (p.profile.sinceAd ?? 0) >= MATCH_AD_EVERY;
      if (ad) {
        p.matchAdUntil = this.now() + MATCH_AD_WINDOW_MS;
        p.profile.sinceAd = 0;
      }
      p.send({
        t: 'result',
        mode: arena.mode,
        won: winner === i,
        reason,
        scores: arena.scores,
        ...(counted ? { before: before[i]!, after: { mmr: p.profile.mmr, placements: p.profile.placements }, delta: deltas[i] } : {}),
        ...(earned[i] > 0 ? { coins: earned[i] } : {}),
        ...(ad ? { ad: MATCH_AD_REWARD } : {}),
      });
      if (counted || earned[i] > 0) p.send({ t: 'profile', profile: profileView(p.profile) });
    }
    // (a rated computer opponent's duels too: it passes as a player, so its results go out like anyone's)
    if (rated) {
      const w = arena.slots[winner];
      const l = arena.slots[winner === 0 ? 1 : 0];
      this.broadcastAll({ t: 'chat', name: '', text: `${w.name} defeated ${l.name} in a ranked duel.`, sys: true });
    }
  }

  // ------------------------------------------------------------------ private lobbies

  /** Open a private lobby, join one by its code, or go back to the public grounds. */
  private room(p: Player, a: unknown, code: unknown): void {
    const here = p.instance;
    if (!(here instanceof Lobby) || here.inDuel(p) || this.selecting.has(p)) {
      p.send({ t: 'notice', text: 'Finish your match first.', kind: 'warn' });
      return;
    }
    if (a === 'create') {
      let c = randomRoomCode();
      while (this.lobbies.some((l) => l.code === c)) c = randomRoomCode();
      // no wanderers in there: it's for the friends you bring
      const l = new Lobby(this, 0, 0, c);
      this.lobbies.push(l);
      this.moveTo(p, l);
      p.send({ t: 'notice', text: `Private lobby ${c} is open. Send your friends the code.`, kind: 'good' });
    } else if (a === 'join') {
      const c = normalizeRoomCode(code);
      const l = c ? this.lobbies.find((x) => x.code === c) : undefined;
      if (!l) return p.send({ t: 'notice', text: c ? `No lobby with the code ${c}. Check it with your friend.` : 'That isn\'t a lobby code.', kind: 'warn' });
      if (l === here) return;
      if (l.full) return p.send({ t: 'notice', text: `Lobby ${l.code} is full.`, kind: 'warn' });
      this.moveTo(p, l);
      this.broadcastTo(l, { t: 'chat', name: '', text: `${p.name} joined the lobby.`, sys: true });
    } else if (a === 'leave') {
      if (!here.code) return;
      this.home.delete(p);
      this.moveTo(p, this.lobbyFor());
    }
  }

  /** From one lobby to another (it becomes the one to come back to after a match). */
  private moveTo(p: Player, l: Lobby): void {
    this.unqueue(p);
    this.challenges.delete(p.id);
    // a wanderer back there can't answer a challenge any more
    this.answers = this.answers.filter((a) => a.p !== p);
    p.instance?.removePlayer(p);
    this.home.set(p, l);
    l.addPlayer(p, l.spawnPoint());
    this.closeEmptyLobbies();
  }

  /** Chat stays among the people of a private lobby (wherever they are, a match included); the public grounds share theirs. */
  private chatFrom(p: Player, msg: ServerMsg): void {
    const h = this.home.get(p);
    const data = JSON.stringify(msg);
    for (const q of this.players.values()) {
      const qh = this.home.get(q);
      if (h?.code ? qh === h : !qh?.code) q.sendRaw(data);
    }
  }

  private broadcastTo(l: Lobby, msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const p of l.players) p.sendRaw(data);
  }

  // ------------------------------------------------------------------ coins, unlocks and the tutorial

  /** Buy a fighter or an arena, or take the free fighter. */
  private unlock(p: Player, kind: unknown, id: unknown, free: boolean): void {
    const prof = p.profile;
    let cost = 0;
    if (kind === 'char' && isCharacterId(id)) {
      const can = canUnlockChar(prof, id, free);
      if (!can.ok) return p.send({ t: 'notice', text: REFUSED[can.why], kind: 'warn' });
      cost = can.cost;
      prof.chars.push(id);
      if (free) prof.freePicked = true;
    } else if (kind === 'map' && typeof id === 'string') {
      const can = canUnlockMap(prof, id, ARENA_MAPS.map((m) => m.id));
      if (!can.ok) return p.send({ t: 'notice', text: REFUSED[can.why], kind: 'warn' });
      cost = can.cost;
      prof.maps.push(id);
    } else return;
    prof.coins -= cost;
    this.store.markDirty();
    p.send({ t: 'unlocked', kind, id, free: free && kind === 'char' });
    p.send({ t: 'profile', profile: profileView(prof) });
  }

  /**
   * An ad watched to the end: the one after a match (once, soon after it), or one from the shop.
   * Ads can't be verified from here, so they pay at most once per AD_MIN_GAP_MS (no ad is shorter).
   */
  private adReward(p: Player, kind: unknown): void {
    const now = this.now();
    if (now - (this.lastAdAt.get(p.id) ?? -Infinity) < AD_MIN_GAP_MS) return;
    let gained = 0;
    if (kind === 'match') {
      if (now > p.matchAdUntil) return;
      gained = MATCH_AD_REWARD;
      p.matchAdUntil = 0;
    } else if (kind === 'bonus') gained = AD_REWARD;
    else return;
    this.lastAdAt.set(p.id, now);
    p.profile.coins += gained;
    this.store.markDirty();
    p.send({ t: 'coins', gained, why: kind === 'match' ? 'matchAd' : 'ad' });
    p.send({ t: 'profile', profile: profileView(p.profile) });
  }

  /** The tutorial: a lesson against the sensei on Sakura (see tutorial.ts). */
  startTutorial(p: Player): void {
    if (!(p.instance instanceof Lobby) || p.instance.inDuel(p) || this.selecting.has(p)) return;
    const map = ARENA_MAPS.find((m) => m.id === 'sakura') ?? ARENA_MAPS[0];
    this.startMatch('tutorial', p, null, 'easy', map, undefined, { char: 'monk', name: 'Sensei' });
  }

  /** The tutorial is over: learned (the first time pays), or skipped. Either way it won't come up again. */
  endTutorial(p: Player, learned: boolean): void {
    const prof = p.profile;
    // already done (a replay from Help, or a skip sent again): nothing changes, nothing to save
    if (prof.tutorial) return;
    if (learned && !prof.tutorial) {
      prof.coins += TUTORIAL_REWARD;
      p.send({ t: 'coins', gained: TUTORIAL_REWARD, why: 'tutorial' });
    }
    prof.tutorial = true;
    this.store.markDirty();
    p.send({ t: 'profile', profile: profileView(prof) });
  }

  // ------------------------------------------------------------------ challenges

  private challenge(p: Player, targetId: unknown): void {
    if (typeof targetId !== 'string') return;
    const target = this.players.get(targetId);
    if (!target) return this.challengeWanderer(p, targetId);
    if (target === p) return;
    const lobby = p.instance;
    if (!(lobby instanceof Lobby) || target.instance !== lobby || lobby.inDuel(p) || lobby.inDuel(target) || this.selecting.has(p) || this.selecting.has(target)) {
      p.send({ t: 'notice', text: `${target.name} is busy right now.`, kind: 'warn' });
      return;
    }
    const existing = this.challenges.get(target.id);
    if (existing && existing.from === p.id && this.now() < existing.expires) return;
    const expires = this.now() + MATCH.challengeTimeout;
    // both standing in the same open ring: the duel is fought right there
    const ring = lobby.sharedRing(p, target);
    this.challenges.set(target.id, { from: p.id, expires, ring });
    target.send({ t: 'challenge', from: p.id, name: p.name, char: p.charId, expires, ...(ring >= 0 ? { ring } : {}) });
    p.send({ t: 'notice', text: ring >= 0 ? `Challenge sent to ${target.name}: a duel here in the ring.` : `Challenge sent to ${target.name}.`, kind: 'info' });
  }

  /**
   * A challenge to one of the lobby's wanderers. It answers the way a player would: after a
   * moment's thought, usually yes (a match against it, under its name and with its fighter).
   */
  private challengeWanderer(p: Player, id: string): void {
    const lobby = p.instance;
    if (!(lobby instanceof Lobby) || lobby.inDuel(p) || this.selecting.has(p)) return;
    const f = lobby.fighters.get(id);
    if (!f || f.owner || f.dummy || !f.isAlive() || this.answers.some((a) => a.p === p)) return;
    this.answers.push({ p, name: f.name, char: f.char.id, rating: f.rating, at: this.now() + 1500 + Math.random() * 2500, accept: Math.random() < 0.8 });
    p.send({ t: 'notice', text: `Challenge sent to ${f.name}.`, kind: 'info' });
  }

  /** The wanderers' answers, once they've thought it over. */
  private answerChallenges(now: number): void {
    for (const a of this.answers.filter((x) => now >= x.at)) {
      this.answers.splice(this.answers.indexOf(a), 1);
      const p = a.p;
      if (p.closed || !(p.instance instanceof Lobby) || p.instance.inDuel(p) || this.selecting.has(p)) continue;
      if (!a.accept) {
        p.send({ t: 'notice', text: `${a.name} declined your challenge.`, kind: 'info' });
        continue;
      }
      this.beginSelect('casual', p, null, 'normal', undefined, { name: a.name, char: a.char, rating: a.rating });
    }
  }

  private challengeReply(p: Player, from: unknown, accept: boolean): void {
    const c = this.challenges.get(p.id);
    const gone = () => {
      if (accept) p.send({ t: 'notice', text: 'That challenge is no longer available.', kind: 'warn' });
    };
    // (it ran out, or the challenger left)
    if (!c || c.from !== from || this.now() > c.expires) return gone();
    this.challenges.delete(p.id);
    const challenger = this.players.get(c.from);
    if (!challenger) return gone();
    if (!accept) {
      challenger.send({ t: 'notice', text: `${p.name} declined your challenge.`, kind: 'info' });
      return;
    }
    const lobby = p.instance;
    if (!(lobby instanceof Lobby) || challenger.instance !== lobby || lobby.inDuel(p) || lobby.inDuel(challenger) || this.selecting.has(challenger) || this.selecting.has(p)) {
      p.send({ t: 'notice', text: 'That challenge is no longer available.', kind: 'warn' });
      return;
    }
    if (c.ring >= 0) {
      this.unqueue(p);
      this.unqueue(challenger);
      if (!lobby.startDuel(c.ring, challenger, p)) {
        const text = 'The ring duel is off: you both need to be standing in a free ring.';
        p.send({ t: 'notice', text, kind: 'warn' });
        challenger.send({ t: 'notice', text, kind: 'warn' });
      }
      return;
    }
    this.beginSelect('casual', challenger, p);
  }

  // ------------------------------------------------------------------ map and fighter select

  /** Open the map and fighter select for a match; it starts when the vote closes. */
  /** `as`: the computer-run opponent's name and fighter, when it's someone already met (a lobby wanderer). */
  beginSelect(mode: MatchMode, a: Player, b: Player | null, diff?: BotDifficulty, botRating?: number, as?: { name: string; char: CharacterId; rating?: number }): void {
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
      bot: b ? null : { char: as?.char ?? CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)], name: as?.name ?? botName(), rating: as?.rating, voteAt: now + 1200 + Math.random() * 2200 },
      endsAt: now + (this.options.selectTime ?? MATCH.selectTime),
      // an arena either of you owns can be fought in
      maps: fixed ? [fixed.id] : sharedMaps(ARENA_MAPS.map((m) => m.id), a.profile, b?.profile),
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
    if (isCharacterId(char) && p.profile.chars.includes(char)) pm.votes.char[i] = char;
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
    const bot = pm.bot ? { char: pm.votes.char[1] ?? pm.bot.char, name: pm.bot.name, rating: pm.bot.rating } : undefined;
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
