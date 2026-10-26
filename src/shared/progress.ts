/**
 * What you own and how you earn it. Everyone starts with the Ronin and the Sakura arena; coins come
 * from finishing matches, from the ad that plays after each one, and from watching ads any time, and
 * buy the other fighters and arenas. The Lancer and the Warden cost twice as much and only open up
 * once you've reached Gold. After your first few matches you get one fighter free.
 *
 * The server holds the truth (shared so the client can show prices and locks the same way).
 */
import { CharacterId } from './characters';
import { PLACEMENT_MATCHES, TIERS } from './ranks';

/** What a new player owns. */
export const STARTER_CHARS: readonly CharacterId[] = ['ronin'];
export const STARTER_MAPS: readonly string[] = ['sakura'];

/** A fighter's price in coins (premium fighters: twice this). */
export const CHAR_PRICE = 500;
/** The fighters that cost double and need Gold first. */
export const PREMIUM_CHARS: readonly CharacterId[] = ['lancer', 'juggernaut'];
/** An arena's price in coins. */
export const MAP_PRICE = 300;

/** Matches to finish before the free fighter is yours to pick. */
export const FREE_PICK_GAMES = 3;

/** Coins for a finished match (giving up earns nothing): a little; the ad after it pays the most. */
export const MATCH_REWARD: Record<'ranked' | 'casual' | 'practice', { win: number; loss: number }> = {
  ranked: { win: 10, loss: 5 },
  casual: { win: 10, loss: 5 },
  practice: { win: 10, loss: 5 },
};
/** Coins for watching an ad from the shop, between matches (less than the one after a match). */
export const AD_REWARD = 30;
/** Coins for finishing the tutorial the first time. */
export const TUTORIAL_REWARD = 100;
/** The server won't pay for ads closer together than this (no ad is shorter). */
export const AD_MIN_GAP_MS = 5000;
/** Coins for the ad that plays after every match, watched to the end. */
export const MATCH_AD_REWARD = 50;
/** How long after a match its ad can still pay (it plays as the result card goes). */
export const MATCH_AD_WINDOW_MS = 3 * 60_000;

export interface Progress {
  coins: number;
  chars: CharacterId[];
  maps: string[];
  /** matches finished (towards the free pick) */
  games: number;
  /** the free fighter has been claimed */
  freePicked: boolean;
  /** the tutorial has been finished or skipped */
  tutorial: boolean;
}

/** Defaults for a new player, or the missing parts of one saved before progress existed. */
export function withProgress<T extends object>(o: T): T & Progress {
  const p = o as T & Partial<Progress>;
  const chars = Array.isArray(p.chars) && p.chars.length ? p.chars : [...STARTER_CHARS];
  const maps = Array.isArray(p.maps) && p.maps.length ? p.maps : [...STARTER_MAPS];
  return Object.assign(p, {
    coins: Number.isFinite(p.coins) ? Math.max(0, Math.floor(p.coins!)) : 0,
    chars: [...new Set([...STARTER_CHARS, ...chars])],
    maps: [...new Set([...STARTER_MAPS, ...maps])],
    games: Number.isFinite(p.games) ? Math.max(0, Math.floor(p.games!)) : 0,
    freePicked: !!p.freePicked,
    tutorial: !!p.tutorial,
  });
}

export const isPremium = (id: CharacterId): boolean => PREMIUM_CHARS.includes(id);

export function charPrice(id: CharacterId): number {
  return isPremium(id) ? CHAR_PRICE * 2 : CHAR_PRICE;
}

/** Gold or better, ever (your peak counts: dropping back doesn't take it away). */
export function reachedGold(p: { peak: number; placements: number }): boolean {
  const gold = TIERS.find((t) => t.id === 'gold')!;
  return p.placements >= PLACEMENT_MATCHES && p.peak >= gold.min;
}

/** The free fighter is waiting to be picked. */
export function freePickReady(p: Progress): boolean {
  return !p.freePicked && p.games >= FREE_PICK_GAMES;
}

/** Matches left before the free pick (0 once it's ready or used). */
export function gamesToFreePick(p: Progress): number {
  return p.freePicked ? 0 : Math.max(0, FREE_PICK_GAMES - p.games);
}

export type UnlockRefusal = 'owned' | 'gold' | 'coins' | 'free' | 'unknown';

/**
 * Whether a fighter can be unlocked now, paying coins or (free) with the free pick. Premium
 * fighters need Gold either way.
 */
export function canUnlockChar(p: Progress & { peak: number; placements: number }, id: CharacterId, free: boolean): { ok: true; cost: number } | { ok: false; why: UnlockRefusal } {
  if (p.chars.includes(id)) return { ok: false, why: 'owned' };
  if (isPremium(id) && !reachedGold(p)) return { ok: false, why: 'gold' };
  if (free) return freePickReady(p) ? { ok: true, cost: 0 } : { ok: false, why: 'free' };
  const cost = charPrice(id);
  return p.coins >= cost ? { ok: true, cost } : { ok: false, why: 'coins' };
}

export function canUnlockMap(p: Progress, id: string, known: readonly string[]): { ok: true; cost: number } | { ok: false; why: UnlockRefusal } {
  if (!known.includes(id)) return { ok: false, why: 'unknown' };
  if (p.maps.includes(id)) return { ok: false, why: 'owned' };
  return p.coins >= MAP_PRICE ? { ok: true, cost: MAP_PRICE } : { ok: false, why: 'coins' };
}

/** The arenas a match can be fought in: any that either side owns, in menu order. */
export function sharedMaps(all: readonly string[], ...owners: (Progress | null | undefined)[]): string[] {
  const owned = new Set(owners.flatMap((o) => o?.maps ?? []));
  return all.filter((id) => owned.has(id));
}
