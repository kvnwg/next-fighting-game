// Sound effect recipes. Each one schedules its layers into a Sink at `p.at`;
// targets come from the design doc's analysis of the reference game.
import type { SfxName } from './engine.ts';
import { INTRO_RECIPES, INTRO_SFX } from './intro-sfx.ts';
import { gong, noise, partials, rand, taiko, tone, type Sink } from './synth.ts';

export interface RecipeParams {
  at: number;
  /** Pitch factor, already randomized around 1. */
  pitch: number;
  /** Linear gain factor (variation, intensity). */
  gain: number;
  /** 0..3, picked so the same variation never plays twice in a row. */
  variant: number;
  weaponClass: 'blade' | 'blunt';
  kind: 'light' | 'heavy' | 'critical' | 'plunge';
  mobile: boolean;
}

export type Recipe = (s: Sink, p: RecipeParams) => void;

export type SfxCategory = 'impact' | 'motion' | 'cue' | 'ui' | 'intro';

export const CATEGORY: Record<SfxName, SfxCategory> = {
  hit: 'impact',
  block: 'impact',
  parry: 'impact',
  guardbreak: 'impact',
  knockdown: 'impact',
  ko: 'impact',
  thump: 'impact',
  swing: 'motion',
  dodge: 'motion',
  jump: 'motion',
  land: 'motion',
  parryWhiff: 'motion',
  whoosh: 'motion',
  telegraph: 'cue',
  tick: 'ui',
  tickFinal: 'ui',
  select: 'ui',
  confirm: 'ui',
  roundStart: 'ui',
  fight: 'ui',
  ...(Object.fromEntries(INTRO_SFX.map((n) => [n, 'intro'])) as Record<(typeof INTRO_SFX)[number], 'intro'>),
};

/** Simultaneous voices allowed per category: [desktop, mobile]. */
export const VOICE_CAPS: Record<SfxCategory, [number, number]> = {
  impact: [4, 2],
  motion: [6, 3],
  cue: [2, 2],
  ui: [4, 3],
  // Entrance cinematics layer several long sounds at once, and nothing else is playing.
  intro: [8, 5],
};

const isHeavy = (p: RecipeParams) => p.kind !== 'light';

function bladeHit(s: Sink, p: RecipeParams): void {
  const { at, pitch: k, gain: g, variant: v } = p;
  const big = isHeavy(p) ? 1.3 : 1;
  const len = isHeavy(p) ? 1.6 : 1;
  // Transient, then a bright slice; together they center the sound in the 2-3 kHz band.
  noise(s, {
    at,
    gain: 0.45 * g * big,
    attack: 0.0005,
    decay: 0.012,
    filter: { type: 'bandpass', freq: 2600 * k, q: 0.7 },
    lp: 8000,
  });
  noise(s, {
    at,
    gain: 0.6 * g * big,
    attack: 0.001,
    decay: 0.09 * len,
    filter: { type: 'bandpass', freq: (2000 + 150 * v) * k, q: 1.1 },
  });
  // Dense, sparkly tail (~0.2 s).
  const sparks = p.mobile ? 4 : 6;
  for (let i = 0; i < sparks; i++) {
    tone(s, {
      at: at + rand(0, 0.03),
      freq: rand(1500, 3800) * k,
      gain: rand(0.04, 0.08) * g * big,
      attack: 0.001,
      decay: rand(0.12, 0.3) * len,
    });
  }
  noise(s, {
    at: at + 0.004,
    gain: 0.1 * g * big,
    attack: 0.003,
    decay: 0.22 * len,
    filter: { type: 'bandpass', freq: (2600 + 200 * v) * k, q: 0.9 },
  });
  // A little weight underneath.
  tone(s, { at, freq: 240 * k, freqEnd: 120 * k, gain: 0.22 * g * big, attack: 0.002, decay: 0.06 * len });
}

function bluntHit(s: Sink, p: RecipeParams): void {
  const { at, pitch: k, gain: g, variant: v } = p;
  const big = isHeavy(p) ? 1.3 : 1;
  const len = isHeavy(p) ? 1.5 : 1;
  // Sine thump with a pitch drop carries most of the energy below 200 Hz.
  tone(s, {
    at,
    freq: (150 + 12 * v) * k,
    freqEnd: 46 * k,
    glide: 0.13 * len,
    gain: 0.75 * g * big,
    attack: 0.002,
    decay: 0.22 * len,
  });
  noise(s, { at, gain: 0.3 * g * big, attack: 0.001, decay: 0.11 * len, lp: (520 + 60 * v) * k });
  noise(s, {
    at,
    gain: 0.07 * g,
    attack: 0.0005,
    decay: 0.012,
    filter: { type: 'bandpass', freq: 1200 * k, q: 1.3 },
  });
  if (isHeavy(p)) tone(s, { at, freq: 64 * k, freqEnd: 38 * k, gain: 0.45 * g, attack: 0.004, decay: 0.32 });
}

export const RECIPES: Record<SfxName, Recipe> = {
  hit: (s, p) => (p.weaponClass === 'blunt' ? bluntHit(s, p) : bladeHit(s, p)),

  block: (s, p) => {
    const { at, pitch: k, gain: g, variant: v } = p;
    noise(s, { at, gain: 0.35 * g, attack: 0.0005, decay: 0.016, hp: 1200 * k });
    // Short metallic clang: inharmonic partials, no long ring.
    partials(s, at, (740 + 55 * v) * k, [1, 1.53, 2.37, 3.11], [0.2 * g, 0.15 * g, 0.09 * g, 0.06 * g], [0.16, 0.12, 0.09, 0.07]);
    tone(s, { at, freq: 190 * k, freqEnd: 120 * k, gain: 0.22 * g, attack: 0.002, decay: 0.05 });
  },

  parry: (s, p) => {
    const { at, pitch: k, gain: g, variant: v } = p;
    // Clang...
    noise(s, { at, gain: 0.45 * g, attack: 0.0005, decay: 0.02, hp: 1500 * k });
    partials(s, at, (960 + 45 * v) * k, [1, 1.47, 2.09, 2.83], [0.12 * g, 0.09 * g, 0.06 * g, 0.04 * g], [0.09, 0.07, 0.06, 0.05]);
    // ...then the one clearly pitched sound in combat: a bell-like ring near 1.75 kHz, +-7% per play.
    const ring = 1750 * rand(0.93, 1.07);
    tone(s, { at: at + 0.004, freq: ring, gain: 0.34 * g, attack: 0.003, decay: 1.1 });
    tone(s, { at: at + 0.004, freq: ring * 1.0022, gain: 0.1 * g, attack: 0.003, decay: 0.95 });
    tone(s, { at: at + 0.004, freq: ring * 2, gain: 0.025 * g, attack: 0.003, decay: 0.3 });
  },

  guardbreak: (s, p) => {
    const { at, pitch: k, gain: g } = p;
    // Hard crack with energy up to ~12 kHz.
    noise(s, { at, gain: 1.0 * g, attack: 0.0005, decay: 0.03, hp: 2000 });
    noise(s, { at, gain: 0.6 * g, attack: 0.001, decay: 0.05, filter: { type: 'bandpass', freq: 9500, q: 0.6 } });
    // About half a second of glassy tail: scattered high tinks over a noisy wash.
    const tinks = p.mobile ? 10 : 18;
    for (let i = 0; i < tinks; i++) {
      const dt = 0.02 + Math.pow(Math.random(), 1.6) * 0.5;
      tone(s, {
        at: at + dt,
        freq: rand(3200, 9500),
        gain: rand(0.03, 0.085) * g * (1 - dt / 0.6),
        attack: 0.0008,
        decay: rand(0.02, 0.07),
      });
    }
    noise(s, { at: at + 0.01, gain: 0.16 * g, attack: 0.005, decay: 0.5, filter: { type: 'bandpass', freq: 5500, q: 1.2 } });
    // Low boom, a hair after the crack so the crack reads first.
    tone(s, { at: at + 0.008, freq: 78 * k, freqEnd: 36 * k, glide: 0.45, gain: 0.6 * g, attack: 0.003, decay: 0.5 });
    noise(s, { at: at + 0.008, gain: 0.25 * g, attack: 0.002, decay: 0.3, lp: 300 });
  },

  knockdown: (s, p) => {
    const { at, pitch: k, gain: g, variant: v } = p;
    tone(s, { at, freq: (112 + 6 * v) * k, freqEnd: 40 * k, glide: 0.25, gain: 1.0 * g, attack: 0.002, decay: 0.4 });
    noise(s, { at, gain: 0.42 * g, attack: 0.001, decay: 0.14, lp: 900 * k });
    // Smooth whoosh tail (~0.6 s), mostly below 6 kHz.
    noise(s, {
      at: at + 0.01,
      gain: 0.28 * g,
      attack: 0.06,
      hold: 0.15,
      decay: 0.5,
      filter: { type: 'bandpass', freq: 1800 * k, freqEnd: 320 * k, sweep: 0.6, q: 0.8 },
      lp: 5000,
    });
  },

  telegraph: (s, p) => {
    const { at, pitch: k, gain: g, variant: v } = p;
    // A rising "shing": everything glides upward, unlike the static parry ring.
    noise(s, {
      at,
      gain: 0.45 * g,
      attack: 0.08,
      decay: 0.16,
      filter: { type: 'bandpass', freq: 1300 * k, freqEnd: (6800 + 300 * v) * k, sweep: 0.22, q: 3.5 },
    });
    tone(s, { at, freq: 2500 * k, freqEnd: 3700 * k, glide: 0.22, gain: 0.14 * g, attack: 0.06, decay: 0.2 });
    tone(s, { at: at + 0.02, freq: 3800 * k, freqEnd: 5600 * k, glide: 0.2, gain: 0.09 * g, attack: 0.05, decay: 0.18 });
  },

  swing: (s, p) => {
    const { at, pitch: k, gain: g, variant: v } = p;
    const shift = 1 + v * 0.06;
    if (p.kind === 'plunge') {
      noise(s, { at, gain: 0.35 * g, attack: 0.05, decay: 0.22, filter: { type: 'bandpass', freq: 2200 * k, freqEnd: 400 * k, sweep: 0.25, q: 1.2 } });
      return;
    }
    if (p.kind === 'light') {
      noise(s, { at, gain: 0.34 * g, attack: 0.035, decay: 0.12, filter: { type: 'bandpass', freq: 520 * k * shift, freqEnd: 2300 * k * shift, sweep: 0.15, q: 1.3 } });
      return;
    }
    noise(s, { at, gain: 0.45 * g, attack: 0.08, decay: 0.22, filter: { type: 'bandpass', freq: 320 * k * shift, freqEnd: 1500 * k * shift, sweep: 0.28, q: 1.2 } });
    tone(s, { at, freq: 95 * k, freqEnd: 70 * k, gain: 0.12 * g, attack: 0.05, decay: 0.2 });
    if (p.kind === 'critical') {
      noise(s, { at: at + 0.03, gain: 0.12 * g, attack: 0.06, decay: 0.2, filter: { type: 'bandpass', freq: 4000 * k, freqEnd: 8000 * k, sweep: 0.25, q: 2 } });
    }
  },

  dodge: (s, p) => {
    const { at, pitch: k, gain: g, variant: v } = p;
    noise(s, { at, gain: 0.18 * g, attack: 0.02, decay: 0.12, filter: { type: 'bandpass', freq: (900 + 60 * v) * k, freqEnd: 1700 * k, sweep: 0.12, q: 1.5 } });
  },

  jump: (s, p) => {
    const { at, pitch: k, gain: g } = p;
    tone(s, { at, freq: 170 * k, freqEnd: 95 * k, gain: 0.25 * g, attack: 0.002, decay: 0.06 });
    noise(s, { at, gain: 0.12 * g, attack: 0.002, decay: 0.05, lp: 1500 });
  },

  land: (s, p) => {
    const { at, pitch: k, gain: g } = p;
    tone(s, { at, freq: 120 * k, freqEnd: 55 * k, gain: 0.35 * g, attack: 0.002, decay: 0.09 });
    noise(s, { at, gain: 0.2 * g, attack: 0.001, decay: 0.07, lp: 700 });
  },

  parryWhiff: (s, p) => {
    const { at, pitch: k, gain: g } = p;
    // Dull, off-balance swish: low-passed and sweeping down.
    noise(s, { at, gain: 0.22 * g, attack: 0.03, decay: 0.25, filter: { type: 'lowpass', freq: 1100 * k, freqEnd: 280 * k, sweep: 0.25, q: 0.9 } });
    tone(s, { at, type: 'triangle', freq: 300 * k, freqEnd: 180 * k, gain: 0.05 * g, attack: 0.01, decay: 0.15 });
  },

  whoosh: (s, p) => {
    const { at, pitch: k, gain: g } = p;
    noise(s, { at, gain: 0.3 * g, attack: 0.25, decay: 0.3, filter: { type: 'bandpass', freq: 220 * k, freqEnd: 3200 * k, sweep: 0.5, q: 1 } });
  },

  thump: (s, p) => {
    const { at, pitch: k, gain: g } = p;
    tone(s, { at, freq: 105 * k, freqEnd: 44 * k, glide: 0.2, gain: 0.95 * g, attack: 0.002, decay: 0.26 });
    noise(s, { at, gain: 0.42 * g, attack: 0.001, decay: 0.12, lp: 800 });
    noise(s, { at, gain: 0.12 * g, attack: 0.0005, decay: 0.02, filter: { type: 'bandpass', freq: 1500, q: 1.2 } });
  },

  ko: (s, p) => {
    const { at, pitch: k, gain: g } = p;
    tone(s, { at, freq: 64 * k, freqEnd: 28 * k, glide: 0.9, gain: 0.8 * g, attack: 0.003, decay: 1.0 });
    noise(s, { at, gain: 0.6 * g, attack: 0.0005, decay: 0.04, hp: 1500 });
    noise(s, { at, gain: 0.25 * g, attack: 0.02, decay: 1.6, lp: 600 });
    gong(s, at + 0.02, 72 * k, 0.35 * g, 2.5);
  },

  tick: (s, p) => {
    const { at, gain: g, variant: v } = p;
    noise(s, { at, gain: 0.25 * g, attack: 0.0005, decay: 0.006, filter: { type: 'bandpass', freq: 3000, q: 2 } });
    tone(s, { at, freq: 1250 + 20 * v, gain: 0.12 * g, attack: 0.001, decay: 0.03 });
  },

  tickFinal: (s, p) => {
    const { at, gain: g } = p;
    noise(s, { at, gain: 0.3 * g, attack: 0.0005, decay: 0.008, filter: { type: 'bandpass', freq: 4200, q: 2 } });
    tone(s, { at, freq: 1900, gain: 0.22 * g, attack: 0.001, decay: 0.06 });
    tone(s, { at, freq: 950, gain: 0.08 * g, attack: 0.001, decay: 0.05 });
  },

  select: (s, p) => {
    const { at, pitch: k, gain: g } = p;
    tone(s, { at, type: 'triangle', freq: 880 * k, freqEnd: 1320 * k, glide: 0.05, gain: 0.12 * g, attack: 0.002, decay: 0.07 });
  },

  confirm: (s, p) => {
    const { at, pitch: k, gain: g } = p;
    tone(s, { at, type: 'triangle', freq: 660 * k, gain: 0.13 * g, attack: 0.002, decay: 0.08 });
    tone(s, { at: at + 0.07, type: 'triangle', freq: 990 * k, gain: 0.13 * g, attack: 0.002, decay: 0.12 });
  },

  roundStart: (s, p) => taiko(s, p.at, 0.9 * p.gain, p.pitch),

  fight: (s, p) => {
    gong(s, p.at, 98 * p.pitch, 0.7 * p.gain, 2.2);
    taiko(s, p.at, 0.6 * p.gain, p.pitch * 0.9, 0.6);
  },
  ...INTRO_RECIPES,
};
