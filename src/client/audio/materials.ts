/**
 * What things are made of, as sets of ringing partials: each mode is [frequency ratio to the base,
 * amplitude, -60 dB decay in seconds]. The ratios are inharmonic on purpose (free bars, curved
 * plates, hoops, bells), which is what makes struck metal sound like metal and not like a note.
 */
import type { Mode } from './synth';

export interface Material {
  base: number;
  modes: readonly Mode[];
  /** Hz of detune between paired partials: the slow shimmer in a long ring */
  beat?: number;
}

export const MAT = {
  /** a long, slightly curved blade: free-bar partials plus a few torsional ones */
  katana: {
    base: 1180,
    modes: [[1, 1, 1.3], [1.58, 0.3, 0.9], [2.76, 0.75, 1.0], [3.9, 0.3, 0.7], [5.4, 0.5, 0.75], [8.93, 0.32, 0.5], [13.3, 0.18, 0.32]],
    beat: 2.5,
  },
  /** the Knight's greatsword: wider and heavier, lower and longer */
  greatsword: {
    base: 760,
    modes: [[1, 1, 1.7], [1.62, 0.35, 1.1], [2.76, 0.7, 1.25], [4.05, 0.3, 0.8], [5.4, 0.5, 0.9], [8.93, 0.3, 0.55], [13.3, 0.16, 0.35], [17.2, 0.08, 0.22]],
    beat: 1.8,
  },
  /** a needle of a blade: high, pure and long */
  rapier: {
    base: 2050,
    modes: [[1, 1, 1.5], [1.33, 0.2, 0.8], [2.76, 0.7, 1.05], [5.4, 0.45, 0.7], [8.93, 0.22, 0.45]],
    beat: 3,
  },
  /** short knives: bright pings that die fast */
  knife: {
    base: 2900,
    modes: [[1, 1, 0.45], [1.47, 0.25, 0.3], [2.76, 0.55, 0.32], [5.4, 0.35, 0.22]],
    beat: 4,
  },
  /** the kusarigama's sickle: a curved blade, its partials pulled out of line */
  sickle: {
    base: 1650,
    modes: [[1, 1, 0.9], [1.41, 0.3, 0.6], [2.31, 0.6, 0.7], [3.97, 0.45, 0.55], [6.1, 0.3, 0.4], [8.7, 0.2, 0.3]],
    beat: 3,
  },
  /** the glaive's broad head */
  glaive: {
    base: 1420,
    modes: [[1, 1, 0.9], [1.5, 0.25, 0.6], [2.6, 0.6, 0.7], [4.9, 0.4, 0.5], [7.8, 0.25, 0.35]],
    beat: 2.5,
  },
  /** a sledgehammer's iron head: a dense, low block that dongs */
  hammer: {
    base: 300,
    modes: [[1, 1, 0.9], [1.52, 0.7, 0.7], [2.16, 0.6, 0.6], [2.9, 0.45, 0.5], [3.7, 0.35, 0.36], [4.6, 0.25, 0.3], [6.3, 0.18, 0.2], [8.4, 0.1, 0.14]],
    beat: 0.8,
  },
  /** the Monk's bracer plates: bronze, bell-like ratios */
  bronze: {
    base: 1250,
    modes: [[1, 1, 0.6], [1.5, 0.35, 0.5], [2.0, 0.5, 0.45], [2.74, 0.3, 0.35], [3.4, 0.2, 0.25], [4.6, 0.1, 0.18]],
    beat: 2,
  },
  /** curved armour plate over padding: dense modes, damped quickly */
  plate: {
    base: 520,
    modes: [[1, 1, 0.36], [1.37, 0.8, 0.3], [1.79, 0.7, 0.28], [2.41, 0.6, 0.22], [3.06, 0.5, 0.18], [3.71, 0.4, 0.15], [4.5, 0.3, 0.12], [5.8, 0.2, 0.1], [7.3, 0.14, 0.08]],
  },
  /** the shield's steel rim: hoop modes, bright */
  rim: {
    base: 980,
    modes: [[1, 1, 1], [1.18, 0.25, 0.7], [2.32, 0.6, 0.8], [4.25, 0.45, 0.6], [6.63, 0.3, 0.45], [9.4, 0.2, 0.3]],
    beat: 2.2,
  },
  /** the shield's boss and banding, damped by the wood behind it */
  boss: {
    base: 690,
    modes: [[1, 1, 0.4], [1.63, 0.5, 0.32], [2.8, 0.4, 0.25], [4.1, 0.2, 0.18]],
  },
  /** the shield's face: planks under leather */
  wood: {
    base: 230,
    modes: [[1, 1, 0.09], [1.92, 0.6, 0.07], [2.95, 0.42, 0.055], [4.13, 0.26, 0.04], [5.6, 0.12, 0.03]],
  },
  /** an ash shaft: a hollow knock */
  haft: {
    base: 430,
    modes: [[1, 1, 0.07], [2.71, 0.5, 0.05], [5.1, 0.25, 0.035], [7.9, 0.1, 0.025]],
  },
  /** leather over muscle */
  leather: {
    base: 260,
    modes: [[1, 1, 0.05], [2.3, 0.5, 0.04], [3.7, 0.2, 0.03]],
  },
  /** a temple bell: hum, prime, tierce, quint, nominal */
  bell: {
    base: 290,
    modes: [[0.5, 0.6, 3.4], [1, 1, 2.8], [1.19, 0.6, 2.2], [1.5, 0.45, 1.8], [2.0, 0.5, 1.5], [2.5, 0.25, 1.1], [2.98, 0.2, 0.9], [4.0, 0.1, 0.6]],
    beat: 0.7,
  },
  /** a gong: low, crowded partials */
  gong: {
    base: 96,
    modes: [[1, 1, 2.6], [1.48, 0.6, 2.2], [1.97, 0.5, 2.0], [2.53, 0.45, 1.6], [3.1, 0.35, 1.3], [3.9, 0.25, 1.0], [5.2, 0.15, 0.8]],
    beat: 0.6,
  },
  /** glass-like shards: the guard shattering */
  shard: {
    base: 2400,
    modes: [[1, 1, 0.4], [2.32, 0.5, 0.3], [3.8, 0.3, 0.2]],
  },
} satisfies Record<string, Material>;

export type MaterialId = keyof typeof MAT;
