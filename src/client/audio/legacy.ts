/**
 * The named one-shot sounds: menus, the countdown, ring entrances and the title screen, plus
 * generic versions of the combat sounds (played as the Ronin) for anything that still asks by name.
 */
import { MAT } from './materials';
import { PROFILES } from './profiles';
import * as R from './recipes';
import { Out, debris, filtered, modal, noise, osc, rand } from './synth';

export type Sfx =
  | 'swing'
  | 'heavySwing'
  | 'deflect'
  | 'block'
  | 'hit'
  | 'hitHeavy'
  | 'deflectRing'
  | 'shatter'
  | 'guardBreak'
  | 'deathblow'
  | 'perilous'
  | 'dodge'
  | 'jump'
  | 'mikiri'
  | 'feint'
  | 'step'
  | 'click'
  | 'matchFound'
  | 'countdown'
  | 'fight'
  | 'victory'
  | 'defeat'
  | 'burn'
  | 'blink'
  | 'buff'
  | 'death'
  // ring entrances
  | 'wind'
  | 'taiko'
  | 'tink'
  | 'draw'
  | 'rumble'
  | 'stomp'
  | 'whoosh'
  | 'gong'
  | 'pluck'
  | 'shing'
  | 'chime'
  | 'thunder'
  | 'zap'
  | 'whisper'
  | 'scrape'
  | 'bell'
  | 'breath'
  | 'thump'
  | 'fanfare'
  | 'clang';

/** the old engine's oscillator blip: a fast attack and an exponential fall over dur */
function tone(o: Out, type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0): void {
  osc(o, { type, f: f0, f1, dur, gain, a: 0.005, delay });
}

function burst(o: Out, dur: number, gain: number, type: BiquadFilterType, f0: number, f1: number, q = 1, delay = 0): void {
  noise(o, { type, f: f0, f1, q, dur, gain, a: 0.01, delay });
}

/** A short metallic ring: four inharmonic partials, the higher ones dying sooner. */
function ring(o: Out, base: number, dur: number, gain: number, delay = 0): void {
  modal(o, { base: base * rand(0.985, 1.015), modes: [[1, 1, dur * 1.12], [2.76, 0.6, dur * 0.98], [5.4, 0.4, dur * 0.77], [8.93, 0.25, dur * 0.49]], gain, delay, beat: 1.5 });
}

const RONIN = PROFILES.ronin;

/** Mix level for each named sound (applied on top of the caller's volume). */
export const LEGACY_LEVEL: Partial<Record<Sfx, number>> = {
  click: 0.8,
  step: 0.6,
};

export function legacy(o: Out, name: Sfx): void {
  switch (name) {
    case 'swing':
      return R.swing(o, RONIN, {});
    case 'heavySwing':
      return R.swing(o, RONIN, { heavy: true });
    case 'deflect':
    case 'deflectRing':
      return R.deflect(o, RONIN, RONIN, {});
    case 'block':
      return R.block(o, RONIN, RONIN, {});
    case 'hit':
      return R.hit(o, RONIN, RONIN, {});
    case 'hitHeavy':
      return R.hit(o, RONIN, RONIN, { heavy: true });
    case 'shatter':
      return R.postureBreak(o, null);
    case 'guardBreak':
      return R.guardBreak(o, RONIN, RONIN, {});
    case 'deathblow':
      // the title screen's cut: a heavy blow with a deep drop
      tone(o, 'sawtooth', 120, 30, 0.6, 0.3);
      osc(o, { f: 70, f1: 28, dur: 0.9, gain: 0.7 });
      burst(o, 0.5, 0.6, 'lowpass', 5000, 150);
      return R.hit(o, RONIN, RONIN, { heavy: true });
    case 'perilous':
      return R.perilous(o, RONIN);
    case 'dodge':
      return R.dodge(o, RONIN);
    case 'jump':
      return R.jump(o, RONIN);
    case 'mikiri':
      return R.mikiri(o, RONIN, RONIN);
    case 'feint':
      return R.feint(o, RONIN);
    case 'step':
      return R.footstep(o, RONIN, { speed: 3, floor: 'stone' });
    case 'buff':
      return R.buff(o);
    case 'death':
      return R.death(o, RONIN);
    case 'click':
      tone(o, 'square', 900, 1200, 0.04, 0.06);
      noise(o, { type: 'highpass', f: 4000, dur: 0.008, gain: 0.05 });
      return;
    case 'matchFound':
      [523, 659, 784, 1046].forEach((f, i) => {
        tone(o, 'square', f, f, 0.14, 0.1, i * 0.09);
        ring(o, f * 2, 0.4, 0.03, i * 0.09);
      });
      return;
    case 'countdown':
      tone(o, 'square', 660, 660, 0.12, 0.1);
      R.cue(o, RONIN, 'stomp', 0.4);
      return;
    case 'fight':
      tone(o, 'square', 990, 990, 0.35, 0.12);
      ring(o, 495, 0.8, 0.2);
      modal(o, { base: MAT.gong.base * 1.3, modes: MAT.gong.modes, gain: 0.25, decay: 0.7 });
      osc(o, { f: 80, f1: 40, dur: 0.5, gain: 0.5 });
      return;
    case 'victory':
      [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(o, 'square', f, f, 0.18, 0.11, i * 0.12));
      return;
    case 'defeat':
      [392, 330, 262, 196].forEach((f, i) => tone(o, 'triangle', f, f * 0.98, 0.3, 0.16, i * 0.2));
      return;
    case 'burn':
      burst(o, 0.2, 0.15, 'bandpass', 1200, 600, 0.5);
      noise(o, { color: 'pink', type: 'lowpass', f: 400, dur: 0.3, gain: 0.15 });
      return;
    case 'blink':
      tone(o, 'sine', 1400, 300, 0.25, 0.15);
      burst(o, 0.2, 0.15, 'highpass', 3000, 1000);
      return R.dodge(o, PROFILES.shade, 'vanish');
    case 'wind':
      burst(o, 2.2, 0.12, 'bandpass', 500, 900, 2.5);
      burst(o, 1.6, 0.08, 'bandpass', 1400, 700, 4, 0.5);
      return;
    case 'taiko':
      osc(o, { f: 110, f1: 45, dur: 0.7, gain: 0.8, a: 0.002 });
      noise(o, { color: 'pink', type: 'lowpass', f: 900, f1: 120, dur: 0.15, gain: 0.4 });
      // the drum skin's slap
      noise(o, { type: 'bandpass', f: 600, q: 1.2, dur: 0.04, gain: 0.3 });
      return;
    case 'tink':
      modal(o, { base: MAT.knife.base * 0.9, modes: MAT.knife.modes, gain: 0.18, beat: 3 });
      return;
    case 'draw':
      burst(o, 0.35, 0.3, 'highpass', 2500, 7000, 0.8);
      modal(o, { base: MAT.katana.base * 1.5, modes: MAT.katana.modes, gain: 0.12, decay: 0.5, delay: 0.25, beat: 2 });
      return;
    case 'rumble':
      tone(o, 'sine', 42, 36, 2.0, 0.5);
      noise(o, { color: 'brown', type: 'lowpass', f: 220, f1: 90, q: 0.7, dur: 2.0, gain: 0.35, a: 0.05 });
      debris(o, 8, 1.5, 400, 1600, { gain: 0.2, delay: 0.3 });
      return;
    case 'stomp':
      R.cue(o, PROFILES.juggernaut, 'stomp', 1.3);
      return;
    case 'whoosh':
      burst(o, 0.5, 0.35, 'bandpass', 300, 2400, 1.1);
      return;
    case 'gong':
      modal(o, { base: MAT.gong.base, modes: MAT.gong.modes, gain: 0.5, beat: 0.6 });
      tone(o, 'sine', 48, 44, 2.4, 0.45);
      noise(o, { color: 'pink', type: 'lowpass', f: 400, dur: 0.1, gain: 0.3 });
      return;
    case 'pluck':
      [784, 988, 1175, 1568, 1319].forEach((f, i) => {
        tone(o, 'triangle', f, f, 0.16, 0.1, i * 0.11);
        modal(o, { base: f, modes: [[1, 1, 0.6], [2, 0.3, 0.4], [3, 0.12, 0.25]], gain: 0.06, delay: i * 0.11 });
      });
      return;
    case 'shing':
      burst(o, 0.28, 0.25, 'highpass', 4000, 9000, 0.7);
      modal(o, { base: MAT.katana.base * 1.8, modes: MAT.katana.modes, gain: 0.14, decay: 0.55, beat: 2.5 });
      return;
    case 'chime':
      ring(o, 1320, 1.6, 0.14);
      ring(o, 1980, 1.2, 0.05, 0.08);
      return;
    case 'thunder':
      R.cue(o, PROFILES.lancer, 'bolt', 1.6);
      return;
    case 'zap':
      tone(o, 'sawtooth', 1800, 300, 0.18, 0.12);
      burst(o, 0.16, 0.25, 'highpass', 3500, 1500);
      return;
    case 'whisper':
      burst(o, 1.4, 0.14, 'bandpass', 3000, 5200, 6);
      burst(o, 1.2, 0.1, 'bandpass', 4400, 2600, 6, 0.25);
      return;
    case 'scrape':
      burst(o, 1.1, 0.25, 'bandpass', 1800, 900, 3);
      osc(filtered(o, 'lowpass', 1500), { type: 'sawtooth', f: 220, f1: 180, dur: 1.0, gain: 0.05 });
      return;
    case 'bell':
      modal(o, { base: MAT.bell.base * 1.14, modes: MAT.bell.modes, gain: 0.35, beat: 0.7 });
      return;
    case 'breath':
      burst(o, 1.5, 0.16, 'lowpass', 1100, 300, 0.8);
      osc(filtered(o, 'lowpass', 600), { type: 'sawtooth', f: 73, f1: 70, dur: 1.6, gain: 0.06, a: 0.3 });
      return;
    case 'thump':
      tone(o, 'sine', 70, 28, 0.6, 1.0);
      noise(o, { color: 'pink', type: 'lowpass', f: 500, f1: 60, dur: 0.35, gain: 0.5 });
      return;
    case 'fanfare':
      [392, 523, 659, 784].forEach((f, i) => {
        tone(o, 'sawtooth', f, f, i === 3 ? 0.7 : 0.2, 0.06, i * 0.16);
        tone(o, 'square', f / 2, f / 2, i === 3 ? 0.7 : 0.2, 0.035, i * 0.16);
      });
      return;
    case 'clang':
      modal(o, { base: MAT.plate.base * 1.2, modes: MAT.plate.modes, gain: 0.35, decay: 2 });
      modal(o, { base: MAT.katana.base * 0.55, modes: MAT.katana.modes, gain: 0.18, decay: 0.6 });
      burst(o, 0.08, 0.5, 'highpass', 3000, 5000);
      return;
  }
}
