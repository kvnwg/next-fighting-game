/** A 1v1 match: best of three rounds on one of the arena maps. */
import { CHARACTER_IDS, CharacterId } from '../shared/characters';
import { MATCH } from '../shared/config';
import { MapDef } from '../shared/maps';
import { BotDifficulty, MatchMode, MatchPhase, RosterEntry } from '../shared/protocol';
import { BOT_PROFILES, BotBrain, botProfileForRating } from './bot';
import { Player, ServerFighter } from './entities';
import type { Game } from './game';
import { Instance } from './instance';
import { TutorialCoach } from './tutorial';
import { playerName, playerRating } from '../shared/names';

let botCounter = 0;

/** What a computer-run opponent is called: like any other player (nothing says it isn't one). */
export function botName(): string {
  return playerName();
}

export class Arena extends Instance {
  readonly kind = 'arena' as const;
  phase: MatchPhase = 'intro';
  phaseEndsAt = 0;
  round = 1;
  scores: [number, number] = [0, 0];
  roundWinner: 0 | 1 | -1 | undefined;
  finished = false;
  winner: 0 | 1 = 0;
  readonly slots: [ServerFighter, ServerFighter];
  /** humans by slot (null for a bot) */
  readonly humans: [Player | null, Player | null];
  private readonly rosters: [RosterEntry, RosterEntry];
  /** the tutorial's sensei, when this match is the tutorial */
  /** the tutorial's sensei while he's teaching (gone once the closing duel starts) */
  coach: TutorialCoach | null = null;

  constructor(
    game: Game,
    map: MapDef,
    readonly mode: MatchMode,
    a: Player,
    b: Player | null,
    diff: BotDifficulty = 'normal',
    /** When set (offline ranked), the AI opponent has this rating and plays at a matching skill. */
    readonly botRating?: number,
    /** The bot's fighter and name, when the map and fighter select already settled them (and the rating a lobby wanderer showed). */
    bot?: { char: CharacterId; name: string; rating?: number },
  ) {
    super(game, map);
    const [s0, s1] = map.spawns;
    let fb: ServerFighter | null = null;
    if (!b) {
      // create the bot first so it is part of the human's initial roster
      const char = bot?.char ?? CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)];
      const name = bot?.name ?? botName();
      fb = new ServerFighter(`bot-${++botCounter}`, name, char);
      fb.x = s1.x;
      fb.z = s1.z;
      fb.yaw = s1.yaw;
      // a rating on its card like anyone's (the real one when the match is rated; the sensei has none)
      fb.rating = botRating ?? bot?.rating ?? (mode === 'tutorial' ? undefined : playerRating());
      fb.brain = new BotBrain(fb, 'duel', botRating !== undefined ? botProfileForRating(botRating) : BOT_PROFILES[diff]);
      this.addFighter(fb);
    }
    const fa = this.addPlayer(a, s0);
    if (b) fb = this.addPlayer(b, s1);
    if (!fb) throw new Error('arena needs two fighters');
    this.slots = [fa, fb];
    this.humans = [a, b];
    this.rosters = [fa.roster(), fb.roster()];
    if (mode === 'tutorial') {
      // straight into the lesson: no entrances, no countdown, no clock
      const now = game.now();
      this.coach = new TutorialCoach(fb, fa, a, (t) => this.tutorialDuel(t));
      fb.brain = this.coach;
      // face to face in the middle of the arena, a few steps apart
      const mx = (s0.x + s1.x) / 2;
      const mz = (s0.z + s1.z) / 2;
      const len = Math.hypot(s1.x - s0.x, s1.z - s0.z) || 1;
      const ux = (s1.x - s0.x) / len;
      const uz = (s1.z - s0.z) / len;
      this.revive(fa, mx - ux * 2, mz - uz * 2, s0.yaw, now, 0);
      this.revive(fb, mx + ux * 2, mz + uz * 2, s1.yaw, now, 0);
      this.setPhase('fight', now + 3_600_000);
      this.coach.start(now);
      return;
    }
    this.setPhase('intro', game.now() + (game.options.introTime ?? MATCH.introTime));
  }

  /**
   * The last lesson is learned (and paid for). Now the sensei fights for real: one round, to a
   * KO, ending like any match, with its result screen and then the lobby.
   */
  private tutorialDuel(now: number): void {
    if (this.finished) return;
    const p = this.humans[0];
    if (p) this.game.endTutorial(p, true);
    const sensei = this.slots[1];
    sensei.windupScale = 1;
    sensei.brain = new BotBrain(sensei, 'duel', BOT_PROFILES.easy);
    this.coach = null;
    for (const f of this.slots) f.specialReadyAt = now + f.char.special.cooldown;
    // no clock on it: it ends when one of you goes down
    this.setPhase('fight', now + 3_600_000);
  }

  /** Rounds to win the match: the tutorial's closing duel is a single round. */
  private get roundsToWin(): number {
    return this.mode === 'tutorial' ? 1 : MATCH.roundsToWin;
  }

  isFrozen(): boolean {
    return this.phase === 'intro' || this.phase === 'countdown';
  }

  canDamage(a: ServerFighter, d: ServerFighter): boolean {
    return this.phase === 'fight' && a !== d && a.isAlive() && d.isAlive();
  }

  protected environmentHurts(): boolean {
    return this.phase === 'fight';
  }

  slotOf(f: ServerFighter): 0 | 1 | -1 {
    return f === this.slots[0] ? 0 : f === this.slots[1] ? 1 : -1;
  }

  private setPhase(phase: MatchPhase, endsAt: number): void {
    this.phase = phase;
    this.phaseEndsAt = endsAt;
    this.sendMatch();
  }

  sendMatch(): void {
    for (const [i, p] of this.humans.entries()) {
      p?.send({
        t: 'match',
        mode: this.mode,
        phase: this.phase,
        round: this.round,
        scores: this.scores,
        endsAt: this.phaseEndsAt,
        map: this.map.id,
        you: i as 0 | 1,
        players: this.rosters,
        roundWinner: this.roundWinner,
      });
    }
  }

  private resetRound(now: number): void {
    for (const [i, f] of this.slots.entries()) {
      const s = this.map.spawns[i];
      this.revive(f, s.x, s.z, s.yaw, now, 0);
      // the special meter starts filling when the fight starts, not during the countdown
      f.specialReadyAt = now + MATCH.countdownTime + f.char.special.cooldown;
    }
    this.roundWinner = undefined;
  }

  protected onKill(victim: ServerFighter, _killer: ServerFighter | null, _how: string, now: number): void {
    if (this.coach) {
      // nobody dies in a lesson: up again where they fell
      this.revive(victim, victim.x, victim.z, victim.yaw, now, 0);
      return;
    }
    if (this.phase !== 'fight') return;
    const slot = this.slotOf(victim);
    if (slot < 0) return;
    this.endRound(slot === 0 ? 1 : 0, now);
  }

  private endRound(winner: 0 | 1 | -1, now: number): void {
    if (winner === 0 || winner === 1) this.scores[winner]++;
    this.roundWinner = winner;
    if (this.scores[0] >= this.roundsToWin || this.scores[1] >= this.roundsToWin) {
      this.finish(this.scores[0] > this.scores[1] ? 0 : 1, 'ko', now);
    } else if (this.round >= MATCH.maxRounds) {
      // too many draws: the leader wins, otherwise whoever ended the last round healthier
      const [a, b] = this.slots;
      const lead = this.scores[0] !== this.scores[1] ? (this.scores[0] > this.scores[1] ? 0 : 1) : a.hp / a.maxHp >= b.hp / b.maxHp ? 0 : 1;
      this.finish(lead, 'timeout', now);
    } else {
      this.setPhase('roundEnd', now + MATCH.roundEndTime);
    }
  }

  protected rules(now: number): void {
    if (this.coach) {
      this.coach.observe(this.fx, now);
      if (this.phase === 'matchEnd' && now >= this.phaseEndsAt) this.game.closeArena(this);
      return;
    }
    if (this.phase === 'fight') {
      // keep both fighters inside the match even if they somehow left
      if (now >= this.phaseEndsAt) {
        const [a, b] = this.slots;
        const pa = a.hp / a.maxHp;
        const pb = b.hp / b.maxHp;
        this.endRound(Math.abs(pa - pb) < 0.001 ? -1 : pa > pb ? 0 : 1, now);
      }
      return;
    }
    if (now < this.phaseEndsAt) return;
    switch (this.phase) {
      case 'intro':
        this.resetRound(now);
        this.setPhase('countdown', now + MATCH.countdownTime);
        break;
      case 'countdown':
        this.setPhase('fight', now + MATCH.roundTime);
        break;
      case 'roundEnd':
        this.round++;
        this.resetRound(now);
        this.setPhase('countdown', now + MATCH.countdownTime);
        break;
      case 'matchEnd':
        this.game.closeArena(this);
        break;
    }
  }

  /**
   * A player left (`chose` false) or gave up. Giving up is refused while they're finishing their
   * opponent off: the round is theirs, it only counts when the execution ends.
   */
  forfeit(p: Player, chose = false): void {
    if (this.coach) {
      // giving up the tutorial skips it; dropping out of it leaves it for next time
      if (this.finished) return;
      this.finished = true;
      if (chose) {
        this.game.endTutorial(p, false);
        this.game.closeArena(this);
      } else this.setPhase('matchEnd', this.game.now());
      return;
    }
    if (this.finished) return;
    const slot = this.humans[0] === p ? 0 : this.humans[1] === p ? 1 : -1;
    if (slot < 0) return;
    const [me, foe] = slot === 0 ? this.slots : [this.slots[1], this.slots[0]];
    if (chose && (me.state === 'execute' || foe.state === 'executed' || foe.state === 'dead')) return;
    this.finish(slot === 0 ? 1 : 0, 'forfeit', this.game.now());
  }

  private finish(winner: 0 | 1, reason: 'ko' | 'forfeit' | 'timeout', now: number): void {
    if (this.finished) return;
    this.finished = true;
    this.winner = winner;
    this.roundWinner = this.roundWinner ?? winner;
    this.setPhase('matchEnd', now + MATCH.matchEndTime);
    this.game.reportResult(this, winner, reason);
  }
}
