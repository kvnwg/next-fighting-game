/**
 * The trials: ten duels in a row, each against a named fighter a little better than the last. The
 * first is the sensei (the first fight, see server/tutorial.ts); beating him gets you a fighter of
 * your choice. From there each result's Next goes straight into the next trial, one round each, on
 * the arenas in turn (the locked ones too: a look at what coins buy). Opponents play at the skill
 * of their rating (server/bot.ts botProfileForRating: 800 easy, 1150 normal, 1500 hard).
 */
import type { CharacterId } from './characters';

export interface TrialOpponent {
  char: CharacterId;
  name: string;
  map: string;
  rating: number;
}

/** The trials after the sensei's, in order: trial 2 is the first here. */
const LADDER: readonly TrialOpponent[] = [
  { char: 'duelist', name: 'Valentin', map: 'bamboo', rating: 800 },
  { char: 'paladin', name: 'Sir Aldric', map: 'ruins', rating: 880 },
  { char: 'shade', name: 'Kagero', map: 'sakura', rating: 960 },
  { char: 'lancer', name: 'Seraphine', map: 'summit', rating: 1040 },
  { char: 'juggernaut', name: 'Brakka', map: 'forge', rating: 1120 },
  { char: 'monk', name: 'Old Ishin', map: 'bamboo', rating: 1200 },
  { char: 'reaper', name: 'Morrow', map: 'bridge', rating: 1290 },
  { char: 'duelist', name: 'Isolde', map: 'ruins', rating: 1370 },
  { char: 'ronin', name: 'Akane', map: 'summit', rating: 1460 },
];

/** How many trials there are, the sensei's included. */
export const TRIALS = LADDER.length + 1;

/** Trial n's opponent (2 to TRIALS). */
export function trialOpponent(n: number): TrialOpponent {
  return LADDER[Math.min(Math.max(n, 2), TRIALS) - 2];
}

/** The trial to fight next, after winning up to `won` (1: the sensei); null once they're all won. */
export function nextTrial(won: number): number | null {
  return won >= TRIALS ? null : Math.max(1, won + 1);
}
