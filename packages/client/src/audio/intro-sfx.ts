// Sounds for the fighters' ring entrances (characters/intros.js). Like every
// other effect they are synthesized, so they cost nothing to ship.
import type { Recipe } from './sfx.ts';
import { flute, gong, noise, partials, pluck, rand, taiko, tone, woodblock } from './synth.ts';

export const INTRO_SFX = [
  'brush', 'wind', 'tink', 'taikoHit', 'rumble', 'slam', 'scrape', 'ember', 'stoneGong', 'chime', 'whisper',
  'koto', 'heartbeat', 'thunder', 'crackle', 'clunk', 'clothFlap', 'shing', 'pizzicato', 'stab', 'bell',
  'drop', 'airThump', 'fanfare', 'clang', 'shakuhachi', 'throat', 'choir', 'birds', 'breath', 'electricHum',
] as const;

export type IntroSfx = (typeof INTRO_SFX)[number];

export const INTRO_RECIPES: Record<IntroSfx, Recipe> = {
  // A loaded brush dragged across paper.
  brush: (s, { at, gain: g }) => {
    noise(s, { at, gain: 0.35 * g, attack: 0.04, decay: 0.32, filter: { type: 'bandpass', freq: 700, freqEnd: 3200, sweep: 0.3, q: 1.2 } });
  },
  wind: (s, { at, gain: g }) => {
    noise(s, { at, gain: 0.18 * g, attack: 0.5, hold: 1.2, decay: 0.9, filter: { type: 'bandpass', freq: 420, freqEnd: 900, sweep: 1.6, q: 0.8 } });
    noise(s, { at: at + 0.4, gain: 0.08 * g, attack: 0.4, hold: 0.6, decay: 0.6, filter: { type: 'bandpass', freq: 1600, freqEnd: 1100, sweep: 1.2, q: 3 } });
  },
  // A blade nudged a finger's width out of its scabbard.
  tink: (s, { at, gain: g }) => {
    partials(s, at, 3100, [1, 1.41, 2.13, 2.9], [0.12 * g, 0.07 * g, 0.05 * g, 0.03 * g], [0.35, 0.28, 0.2, 0.15]);
    noise(s, { at, gain: 0.12 * g, attack: 0.0005, decay: 0.01, hp: 4000 });
  },
  taikoHit: (s, { at, gain: g }) => taiko(s, at, 0.95 * g, 0.9, 0.7),
  rumble: (s, { at, gain: g }) => {
    tone(s, { at, freq: 42, freqEnd: 36, gain: 0.5 * g, attack: 0.25, hold: 0.8, decay: 0.8 });
    noise(s, { at, gain: 0.35 * g, attack: 0.3, hold: 0.7, decay: 0.9, lp: 220 });
  },
  slam: (s, { at, gain: g }) => {
    tone(s, { at, freq: 160, freqEnd: 34, glide: 0.25, gain: 0.95 * g, attack: 0.002, decay: 0.5 });
    noise(s, { at, gain: 0.5 * g, attack: 0.001, decay: 0.25, lp: 700 });
    noise(s, { at: at + 0.02, gain: 0.18 * g, attack: 0.01, decay: 0.9, filter: { type: 'bandpass', freq: 380, q: 0.6 } });
  },
  scrape: (s, { at, gain: g }) => {
    for (let i = 0; i < 8; i++) {
      noise(s, { at: at + i * 0.22 + rand(0, 0.05), gain: rand(0.08, 0.16) * g, attack: 0.03, decay: 0.24, filter: { type: 'bandpass', freq: rand(1300, 2200), q: 2.5 } });
    }
    tone(s, { at, freq: 70, gain: 0.12 * g, attack: 0.1, hold: 1.4, decay: 0.3, type: 'triangle' });
  },
  ember: (s, { at, gain: g }) => {
    tone(s, { at, type: 'triangle', freq: 74, gain: 0.3 * g, attack: 0.4, hold: 0.8, decay: 0.6, vibrato: { rate: 3.5, depth: 25 } });
    noise(s, { at, gain: 0.06 * g, attack: 0.4, hold: 0.8, decay: 0.5, lp: 300 });
  },
  stoneGong: (s, { at, gain: g }) => {
    gong(s, at, 58, 0.9 * g, 2.6);
    tone(s, { at, freq: 50, freqEnd: 30, gain: 0.6 * g, attack: 0.003, decay: 0.9 });
  },
  chime: (s, { at, gain: g }) => {
    partials(s, at, 1320, [1, 2.76, 5.4], [0.08 * g, 0.04 * g, 0.02 * g], [2.2, 1.4, 0.9]);
  },
  whisper: (s, { at, gain: g }) => {
    for (const [dt, f] of [[0, 3000], [0.06, 4200], [0.11, 2400]] as const) {
      noise(s, { at: at + dt, gain: 0.12 * g, attack: 0.15, hold: 0.6, decay: 0.5, filter: { type: 'bandpass', freq: f, q: 3 } });
    }
  },
  // A koto string bent down a tone.
  koto: (s, { at, gain: g }) => {
    pluck(s, at, 392, 0.3 * g, 1.6);
    tone(s, { at: at + 0.05, type: 'triangle', freq: 392, freqEnd: 349, glide: 0.5, gain: 0.12 * g, attack: 0.01, decay: 1.4 });
  },
  heartbeat: (s, { at, gain: g }) => {
    for (const dt of [0, 0.22]) tone(s, { at: at + dt, freq: 60, freqEnd: 40, gain: (dt ? 0.4 : 0.55) * g, attack: 0.004, decay: 0.16 });
  },
  thunder: (s, { at, gain: g }) => {
    noise(s, { at, gain: 0.9 * g, attack: 0.001, decay: 0.12, filter: { type: 'bandpass', freq: 1800, q: 0.5 } });
    noise(s, { at: at + 0.03, gain: 0.7 * g, attack: 0.02, decay: 1.8, lp: 600 });
    tone(s, { at, freq: 55, freqEnd: 30, gain: 0.7 * g, attack: 0.005, decay: 1.6 });
  },
  crackle: (s, { at, gain: g }) => {
    for (let i = 0; i < 18; i++) {
      noise(s, { at: at + rand(0, 1.1), gain: rand(0.08, 0.22) * g, attack: 0.0005, decay: rand(0.004, 0.02), hp: rand(2500, 6000) });
    }
    tone(s, { at, type: 'sawtooth', freq: 120, gain: 0.05 * g, attack: 0.05, hold: 0.9, decay: 0.2, filter: { type: 'lowpass', freq: 900 } });
  },
  // A breaker throwing a bank of arena lights.
  clunk: (s, { at, gain: g }) => {
    woodblock(s, at, 0.5 * g, 0.45);
    tone(s, { at, freq: 120, freqEnd: 70, gain: 0.35 * g, attack: 0.002, decay: 0.12 });
  },
  clothFlap: (s, { at, gain: g }) => {
    for (const dt of [0, 0.09]) noise(s, { at: at + dt, gain: 0.3 * g, attack: 0.005, decay: 0.07, filter: { type: 'bandpass', freq: 900, q: 0.9 } });
  },
  shing: (s, { at, gain: g }) => {
    tone(s, { at, freq: 2300, freqEnd: 3900, glide: 0.18, gain: 0.12 * g, attack: 0.003, decay: 0.5 });
    partials(s, at + 0.04, 2900, [1, 1.52, 2.27], [0.07 * g, 0.05 * g, 0.03 * g], [0.6, 0.45, 0.3]);
    noise(s, { at, gain: 0.15 * g, attack: 0.005, decay: 0.14, hp: 5000 });
  },
  pizzicato: (s, { at, gain: g }) => {
    [587, 740, 880, 1175].forEach((f, i) => pluck(s, at + i * 0.13, f, 0.2 * g, 0.35));
  },
  stab: (s, { at, gain: g }) => {
    for (const f of [294, 370, 440, 587]) tone(s, { at, type: 'sawtooth', freq: f, gain: 0.07 * g, attack: 0.005, decay: 0.45, filter: { type: 'lowpass', freq: 2400, freqEnd: 700, sweep: 0.4 } });
  },
  bell: (s, { at, gain: g }) => {
    partials(s, at, 220, [1, 2.0, 2.4, 3.0, 4.2], [0.25 * g, 0.12 * g, 0.1 * g, 0.06 * g, 0.04 * g], [3.5, 2.6, 2.2, 1.6, 1.0]);
  },
  drop: (s, { at, gain: g }) => {
    tone(s, { at, freq: 1500, freqEnd: 520, glide: 0.08, gain: 0.16 * g, attack: 0.002, decay: 0.12 });
  },
  airThump: (s, { at, gain: g }) => {
    tone(s, { at, freq: 90, freqEnd: 36, glide: 0.2, gain: 0.8 * g, attack: 0.002, decay: 0.35 });
    noise(s, { at, gain: 0.4 * g, attack: 0.005, decay: 0.3, lp: 400 });
  },
  fanfare: (s, { at, gain: g }) => {
    const notes: [number, number][] = [[0, 392], [0.18, 523], [0.36, 659], [0.6, 784]];
    for (const [dt, f] of notes) {
      for (const d of [-6, 6]) tone(s, { at: at + dt, type: 'sawtooth', freq: f, detune: d, gain: 0.05 * g, attack: 0.03, hold: dt > 0.5 ? 0.6 : 0.1, decay: 0.3, filter: { type: 'lowpass', freq: 1800 } });
    }
  },
  clang: (s, { at, gain: g }) => {
    partials(s, at, 610, [1, 1.38, 2.71, 3.9, 5.1], [0.25 * g, 0.18 * g, 0.12 * g, 0.08 * g, 0.05 * g], [0.9, 0.7, 0.5, 0.35, 0.25]);
    noise(s, { at, gain: 0.4 * g, attack: 0.0005, decay: 0.04, filter: { type: 'bandpass', freq: 3000, q: 0.8 } });
  },
  shakuhachi: (s, { at, gain: g }) => flute(s, at, 440, 0.16 * g, 1.8, 392),
  throat: (s, { at, gain: g }) => {
    tone(s, { at, type: 'sawtooth', freq: 98, gain: 0.12 * g, attack: 0.6, hold: 1.6, decay: 0.8, vibrato: { rate: 4.6, depth: 6 }, filter: { type: 'bandpass', freq: 620, q: 6 } });
    tone(s, { at, freq: 98, gain: 0.16 * g, attack: 0.6, hold: 1.6, decay: 0.8 });
  },
  choir: (s, { at, gain: g }) => {
    for (const [f, d] of [[220, -8], [277, 5], [330, -4], [440, 7]] as const) {
      tone(s, { at, type: 'triangle', freq: f, detune: d, gain: 0.05 * g, attack: 0.7, hold: 1.0, decay: 1.2, vibrato: { rate: 5, depth: 8 } });
    }
  },
  birds: (s, { at, gain: g }) => {
    for (let i = 0; i < 5; i++) {
      const t = at + i * 0.18 + rand(0, 0.08);
      tone(s, { at: t, freq: rand(2800, 3400), freqEnd: rand(3800, 4600), glide: 0.06, gain: 0.05 * g, attack: 0.004, decay: 0.07 });
    }
  },
  breath: (s, { at, gain: g }) => {
    noise(s, { at, gain: 0.2 * g, attack: 0.4, hold: 0.4, decay: 0.9, filter: { type: 'bandpass', freq: 650, freqEnd: 420, sweep: 1.4, q: 1.3 } });
  },
  electricHum: (s, { at, gain: g }) => {
    tone(s, { at, type: 'sawtooth', freq: 110, gain: 0.08 * g, attack: 0.2, hold: 1.2, decay: 0.4, filter: { type: 'lowpass', freq: 1400 } });
    tone(s, { at, type: 'square', freq: 220, detune: 9, gain: 0.03 * g, attack: 0.2, hold: 1.2, decay: 0.4, filter: { type: 'lowpass', freq: 1800 } });
  },
};
