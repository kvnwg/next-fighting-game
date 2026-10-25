/**
 * Ambient auras: particles a fighter gives off all the time, part of who they are. The Ronin's
 * blade steams like steel still hot from the forge on a cold morning: soft white and grey wisps
 * rising off it all along its length, streaming back as he moves, and boiling off as it cuts.
 */
import type { CharacterId } from '../shared/characters';

export interface Aura {
  colors: string[];
  /** puffs per second off the blade standing, extra moving at full walk, and extra mid-swing */
  rate: number;
  moveRate: number;
  swingRate: number;
  /** how fast a puff rises (m/s), how big it starts (m), how much it billows out, how long it lasts (s) */
  rise: number;
  size: number;
  grow: number;
  life: number;
}

export const AURAS: Partial<Record<CharacterId, Aura>> = {
  ronin: {
    colors: ['#f4f4f6', '#e2e3e8', '#c9cbd2', '#aeb1ba'],
    rate: 26,
    moveRate: 32,
    swingRate: 120,
    rise: 0.55,
    size: 0.06,
    grow: 3.6,
    life: 1.7,
  },
};
