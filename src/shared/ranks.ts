/** Ranked ladder: Elo-based MMR mapped onto tiers with three divisions each. */

export const START_MMR = 900;
export const PLACEMENT_MATCHES = 5;

export interface Tier {
  id: string;
  name: string;
  min: number;
  color: string;
}

export const TIERS: Tier[] = [
  { id: 'bronze', name: 'Bronze', min: 0, color: '#c07a3e' },
  { id: 'silver', name: 'Silver', min: 850, color: '#b9c6d0' },
  { id: 'gold', name: 'Gold', min: 1000, color: '#f2c34a' },
  { id: 'platinum', name: 'Platinum', min: 1150, color: '#4fd8c4' },
  { id: 'diamond', name: 'Diamond', min: 1300, color: '#6aaeff' },
  { id: 'master', name: 'Master', min: 1450, color: '#c47aff' },
  { id: 'grandmaster', name: 'Grandmaster', min: 1600, color: '#ff5d5d' },
];

const DIVISIONS = ['III', 'II', 'I'];

export interface RankInfo {
  placed: boolean;
  tier: Tier;
  /** '', 'III', 'II' or 'I' */
  division: string;
  label: string;
  /** 0..1 progress through the current division (or placement progress while unplaced). */
  progress: number;
  color: string;
}

export function rankOf(mmr: number, placements: number): RankInfo {
  if (placements < PLACEMENT_MATCHES) {
    return {
      placed: false,
      tier: TIERS[0],
      division: '',
      label: `Unranked (${placements}/${PLACEMENT_MATCHES})`,
      progress: placements / PLACEMENT_MATCHES,
      color: '#8b93a1',
    };
  }
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) if (mmr >= TIERS[i].min) idx = i;
  const tier = TIERS[idx];
  const next = TIERS[idx + 1];
  if (!next) {
    return { placed: true, tier, division: '', label: tier.name, progress: Math.min(1, (mmr - tier.min) / 300), color: tier.color };
  }
  const lo = idx === 0 ? 700 : tier.min;
  const span = (next.min - lo) / 3;
  const raw = (mmr - lo) / span;
  const div = Math.max(0, Math.min(2, Math.floor(raw)));
  const progress = Math.max(0, Math.min(1, raw - div));
  return { placed: true, tier, division: DIVISIONS[div], label: `${tier.name} ${DIVISIONS[div]}`, progress, color: tier.color };
}

export function kFactor(mmr: number, placements: number): number {
  if (placements < PLACEMENT_MATCHES) return 64;
  if (mmr >= 1600) return 24;
  return 32;
}

/** Rating change for player A after a match against B. scoreA: 1 win, 0 loss. */
export function eloDelta(ratingA: number, ratingB: number, scoreA: number, placementsA: number): number {
  const expected = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const delta = Math.round(kFactor(ratingA, placementsA) * (scoreA - expected));
  // Never let a win give 0 or a loss give 0: every ranked game moves you.
  if (scoreA === 1) return Math.max(1, delta);
  if (scoreA === 0) return Math.min(-1, delta);
  return delta;
}
