/**
 * The first fight, drawn over it (the fight itself runs on the server: server/tutorial.ts). Each
 * step is shown, not explained. The verb is stamped across the screen, its key sits under it with
 * a pip for every success, and a bouncing arrow points at what matters: his health as you strike,
 * his posture as you deflect, the execution mark when his guard is broken. For deflects a ring
 * closes on the sensei and meets its target exactly when his blow lands, the screen dimming round
 * it as it comes: press then. Too early, too late and good flash up as you try. Skip is there
 * through the lessons. The last step is a real duel with him: the overlay steps aside for it.
 *
 * What the first fight leaves out (blocking, perilous attacks) is taught the first time it comes
 * up in any fight after it: a tip, once each (Tips).
 */
import type { TutorialNote, TutorialStep } from '../shared/protocol';
import { TUTORIAL_STEPS } from '../shared/protocol';
import type { Perilous } from '../shared/characters';
import { icon } from './pixelicons';
import { saveSettings, settings } from './settings';

type Lessoned = Exclude<TutorialStep, 'duel'>;

interface Lesson {
  word: string;
  jp: string;
  key: string;
  touchKey: string;
  /** a few words on how (hold, tap as it lands...) */
  how: string;
  /** what the arrow points at: his health, his posture bar, or the execution mark on him */
  target: 'hp' | 'foe' | 'mark';
  label: string;
  /** the timing ring on his blows */
  ring: boolean;
}

const LESSONS: Record<Lessoned, Lesson> = {
  strike: { word: 'Strike', jp: '打', key: 'LMB', touchKey: 'Light', how: 'hit him', target: 'hp', label: 'His health', ring: false },
  deflect: { word: 'Deflect', jp: '弾', key: 'RMB', touchKey: 'Parry', how: 'tap as it lands', target: 'foe', label: 'His posture', ring: true },
  execute: { word: 'Deathblow', jp: '斬', key: 'LMB', touchKey: 'Light', how: 'his guard is broken', target: 'mark', label: 'Finish him', ring: false },
};

const NOTES: Record<TutorialNote, { text: string; tone: string }> = {
  good: { text: 'Good', tone: 'good' },
  early: { text: 'Too early', tone: 'warn' },
  late: { text: 'Too late', tone: 'bad' },
  again: { text: 'Hold it', tone: 'warn' },
  broken: { text: 'Guard broken', tone: 'bad' },
};

/** What the overlay needs from the fight each frame. */
export interface TutorialFrame {
  /** the sensei's body on screen (null when off it) */
  foe: { x: number; y: number } | null;
  /** his attack under way: ms until it lands, of a windup this long */
  blow: { left: number; windup: number } | null;
}

export class TutorialOverlay {
  private readonly el: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly ring: HTMLElement;
  private step: TutorialStep | null = null;
  private noteTimer = 0;
  private stampTimer = 0;

  constructor(
    private readonly hud: HTMLElement,
    private readonly touch: boolean,
    onSkip: () => void,
  ) {
    const pips = TUTORIAL_STEPS.filter((s) => s !== 'duel')
      .map((s) => `<i data-step="${s}"></i>`)
      .join('');
    this.el = document.createElement('div');
    this.el.className = 'tut';
    this.el.innerHTML = `
      <div class="tut-focus" aria-hidden="true"></div>
      <div class="tut-head hidden">
        <div class="tut-pips">${pips}</div>
        <div class="tut-word"><span class="tut-jp"></span><b></b></div>
        <div class="tut-key"><kbd></kbd><span class="tut-how"></span></div>
        <div class="tut-count"></div>
      </div>
      <div class="tut-stamp hidden"><span class="tut-jp"></span><b></b></div>
      <div class="tut-note hidden"></div>
      <button class="tut-skip">${icon('close')}Skip tutorial</button>`;
    hud.appendChild(this.el);
    this.el.querySelector('.tut-skip')!.addEventListener('click', onSkip);
    this.arrow = document.createElement('div');
    this.arrow.className = 'tut-arrow hidden';
    this.arrow.innerHTML = '<b></b><span class="tut-arrow-ico"></span>';
    this.ring = document.createElement('div');
    this.ring.className = 'tut-ring hidden';
    this.ring.innerHTML = '<i class="tut-ring-out"></i><i class="tut-ring-in"></i><b>Now</b>';
    hud.querySelector('.plates')!.after(this.ring);
  }

  /** Where the lesson is, from the server. */
  show(step: TutorialStep, n: number, need: number, note?: TutorialNote): void {
    const head = this.el.querySelector<HTMLElement>('.tut-head')!;
    if (step !== this.step) {
      this.step = step;
      if (step === 'duel') {
        // the lessons are over: now beat him
        head.classList.add('hidden');
        this.el.querySelector('.tut-skip')!.classList.add('hidden');
        this.stamp('Now beat him', '決闘');
        this.setArrow(null, '');
        this.ring.classList.add('hidden');
        this.el.classList.remove('focus');
        return;
      }
      const l = LESSONS[step as Lessoned];
      // (a lesson this client doesn't know, from a server older or newer than it: nothing to show)
      if (!l) {
        head.classList.add('hidden');
        return;
      }
      head.classList.remove('hidden');
      head.querySelector('.tut-word b')!.textContent = l.word;
      head.querySelector('.tut-word .tut-jp')!.textContent = l.jp;
      head.querySelector('.tut-key kbd')!.textContent = this.touch ? l.touchKey : l.key;
      head.querySelector('.tut-how')!.textContent = l.how;
      // the pips across the top: done, this one, still to come
      const order = TUTORIAL_STEPS.indexOf(step);
      for (const p of head.querySelectorAll<HTMLElement>('.tut-pips i')) {
        const i = TUTORIAL_STEPS.indexOf(p.dataset.step as TutorialStep);
        p.className = i < order ? 'done' : i === order ? 'on' : '';
      }
      head.classList.remove('in');
      void head.offsetWidth;
      head.classList.add('in');
      this.stamp(l.word, l.jp);
    }
    if (step === 'duel' || !LESSONS[step as Lessoned]) return;
    // a pip for each one done
    this.el.querySelector('.tut-count')!.innerHTML = Array.from({ length: need }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    if (note) this.flash(note);
  }

  /** Each frame: the arrow onto its bar, and the ring closing on his blow. */
  update(f: TutorialFrame): void {
    const step = this.step;
    if (!step || step === 'duel') return;
    const l = LESSONS[step as Lessoned];
    if (!l) return;
    const target =
      l.target === 'hp'
        ? this.hud.querySelector<HTMLElement>('.fcard.opp .fc-hp')
        : l.target === 'mark'
          ? this.hud.querySelector<HTMLElement>('.broken-mark:not(.hidden)') ?? this.hud.querySelector<HTMLElement>('.posture-main.foe:not(.hidden)')
          : this.hud.querySelector<HTMLElement>('.posture-main.foe:not(.hidden)') ?? this.hud.querySelector<HTMLElement>('.fcard.opp .fc-po');
    this.setArrow(target, l.label);
    // the ring: big when his windup starts, meeting the target circle as the blow lands
    const b = l.ring ? f.blow : null;
    const on = !!b && !!f.foe && b.left > -160;
    this.ring.classList.toggle('hidden', !on);
    // the world dims round him as his blow comes in, as if time slowed for it
    this.el.classList.toggle('focus', on && b!.left > -60);
    if (!on) return;
    const k = Math.max(0, Math.min(1, b!.left / Math.max(1, b!.windup)));
    this.ring.style.transform = `translate(${f.foe!.x}px, ${f.foe!.y}px)`;
    this.ring.style.setProperty('--k', String(1 + k * 2.4));
    this.ring.classList.toggle('now', b!.left <= 90);
  }

  destroy(): void {
    clearTimeout(this.noteTimer);
    clearTimeout(this.stampTimer);
    this.el.remove();
    this.arrow.remove();
    this.ring.remove();
  }

  private setArrow(target: HTMLElement | null, label: string): void {
    if (!target) {
      this.arrow.classList.add('hidden');
      return;
    }
    if (this.arrow.parentElement !== target) target.appendChild(this.arrow);
    this.arrow.classList.remove('hidden');
    const b = this.arrow.querySelector('b')!;
    if (b.textContent !== label) b.textContent = label;
  }

  /** The verb stamped big across the middle for a moment. */
  private stamp(word: string, jp: string): void {
    const s = this.el.querySelector<HTMLElement>('.tut-stamp')!;
    s.querySelector('b')!.textContent = word;
    s.querySelector('.tut-jp')!.textContent = jp;
    s.classList.remove('hidden', 'go');
    void s.offsetWidth;
    s.classList.add('go');
    clearTimeout(this.stampTimer);
    this.stampTimer = window.setTimeout(() => s.classList.add('hidden'), 1500);
  }

  private flash(note: TutorialNote): void {
    const n = NOTES[note];
    const el = this.el.querySelector<HTMLElement>('.tut-note')!;
    el.textContent = n.text;
    el.dataset.tone = n.tone;
    el.classList.remove('hidden', 'go');
    void el.offsetWidth;
    el.classList.add('go');
    clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => el.classList.add('hidden'), note === 'broken' ? 1800 : 900);
  }
}

// ------------------------------------------------------------------ tips

export type TipId = `perilous-${Perilous}` | 'guardBroken';

interface Tip {
  word: string;
  jp: string;
  line: (touch: boolean) => string;
}

const PERILOUS_LINE: Record<Perilous, string> = {
  thrust: 'Can’t be blocked: deflect it, or dodge into it',
  sweep: 'Can’t be blocked: jump over it',
  grab: 'Can’t be blocked: dodge away from it',
  area: 'Can’t be blocked: get off the marked ground',
};

const TIPS: Record<TipId, Tip> = {
  'perilous-thrust': { word: 'Perilous', jp: '危', line: () => PERILOUS_LINE.thrust },
  'perilous-sweep': { word: 'Perilous', jp: '危', line: () => PERILOUS_LINE.sweep },
  'perilous-grab': { word: 'Perilous', jp: '危', line: () => PERILOUS_LINE.grab },
  'perilous-area': { word: 'Perilous', jp: '危', line: () => PERILOUS_LINE.area },
  guardBroken: { word: 'Guard broken', jp: '崩', line: (touch) => `Blocking fills your posture. Deflect instead: tap ${touch ? 'Parry' : 'RMB'} just as the hit lands` },
};

/**
 * What the first fight leaves out, taught the first time it comes up in a fight: a perilous attack
 * coming at you (one tip for each kind), your own guard breaking. Each shows once, ever.
 */
export class Tips {
  private readonly el: HTMLElement;
  private timer = 0;

  constructor(
    hud: HTMLElement,
    private readonly touch: boolean,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'tip hidden';
    this.el.innerHTML = '<span class="tip-jp"></span><b></b><span class="tip-line"></span>';
    hud.appendChild(this.el);
  }

  /** Show a tip, unless it has been seen before. */
  show(id: TipId): void {
    const seen = settings.tips ?? [];
    if (seen.includes(id) || !TIPS[id]) return;
    settings.tips = [...seen, id];
    saveSettings();
    const t = TIPS[id];
    this.el.querySelector('.tip-jp')!.textContent = t.jp;
    this.el.querySelector('b')!.textContent = t.word;
    this.el.querySelector('.tip-line')!.textContent = t.line(this.touch);
    this.el.classList.remove('hidden', 'go');
    void this.el.offsetWidth;
    this.el.classList.add('go');
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.add('hidden'), 3600);
  }
}

