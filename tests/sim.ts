/** Headless bot-vs-bot match simulation on a fake clock (used by tests and for balance checks). */
import { CharacterId } from '../src/shared/characters';
import { BotDifficulty, ServerMsg } from '../src/shared/protocol';
import { Arena } from '../src/server/arena';
import { BOT_PROFILES, BotBrain } from '../src/server/bot';
import { Player } from '../src/server/entities';
import { Game } from '../src/server/game';
import { Store } from '../src/server/store';
import { ARENA_MAPS } from '../src/shared/maps';

export interface SimResult {
  winner: 0 | 1;
  scores: [number, number];
  seconds: number;
  outcomes: Record<string, number>;
}

function fakePlayer(game: Game, name: string, char: CharacterId, inbox: ServerMsg[]): Player {
  const ws = { readyState: 1, send: (d: string) => inbox.push(JSON.parse(d)), close() {}, on() {} };
  const p = new Player(ws as never, game.store.create(name), char);
  return p;
}

export function simulateMatch(a: CharacterId, b: CharacterId, diff: BotDifficulty = 'hard', mapIndex = 0, maxSeconds = 600): SimResult {
  let t = 1000;
  const game = new Game(new Store(null), () => t);
  const inbox: ServerMsg[] = [];
  const pa = fakePlayer(game, 'A', a, inbox);
  const pb = fakePlayer(game, 'B', b, []);
  const arena: Arena = game.startMatch('practice', pa, pb, diff, ARENA_MAPS[mapIndex]);
  // turn both "humans" into bots so the server simulates their movement too
  for (const f of arena.slots) {
    f.owner = null;
    f.brain = new BotBrain(f, 'duel', BOT_PROFILES[diff]);
  }
  const outcomes: Record<string, number> = {};
  let result: Extract<ServerMsg, { t: 'result' }> | null = null;
  while (t < 1000 + maxSeconds * 1000 && !result) {
    t += 1000 / 60;
    game.tick();
    for (const m of inbox.splice(0)) {
      if (m.t === 'fx') for (const e of m.e) outcomes[e.k] = (outcomes[e.k] ?? 0) + 1;
      if (m.t === 'result') result = m;
    }
  }
  if (!result) throw new Error('match did not finish');
  return { winner: result.won ? 0 : 1, scores: result.scores, seconds: (t - 1000) / 1000, outcomes };
}
