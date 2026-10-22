/**
 * Ambient auras: particles a fighter gives off all the time, part of who they are. The Ronin
 * steams like a body still hot from the last fight on a cold morning: soft white and grey puffs
 * rising off the shoulders and head, streaming back as he moves, and boiling off the blade as it
 * cuts.
 */
import type { CharacterId } from '../shared/characters';

export interface Aura {
  colors: string[];
  /** puffs per second standing, extra per second when moving at full walk, and off the blade mid-swing */
  rate: number;
  moveRate: number;
  swingRate: number;
  /** how fast a puff rises (m/s), how big it starts (m), how much it billows out, how long it lasts (s) */
  rise: number;
  size: number;
  grow: number;
  life: number;
  /** where on the body it comes off: height range (x body scale) and spread across the shoulders */
  from: [number, number];
  spread: number;
}

export const AURAS: Partial<Record<CharacterId, Aura>> = {
  ronin: {
    colors: ['#f4f4f6', '#e2e3e8', '#c9cbd2', '#aeb1ba'],
    rate: 9,
    moveRate: 14,
    swingRate: 55,
    rise: 0.55,
    size: 0.07,
    grow: 3.2,
    life: 1.7,
    from: [1.25, 1.95],
    spread: 0.24,
  },
};
