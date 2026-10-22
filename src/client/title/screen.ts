/**
 * The title screen's DOM half and the order things happen in:
 *
 *   boot     the world resolves out of big pixels and darkness, close on the Ronin's back
 *   press    the camera pulls back over the valley; the logo lands; "tap to continue"
 *   name     a gust, the camera swings out over the drop to his side; he asks your name
 *   forge    connecting, and making the account
 *   welcome  he turns to look at you; your name is stamped; he rises and grips his sword
 *   (slash)  a cut across the screen splits the last frame in two, and the game is behind it
 *
 * App drives the connection; this only presents and tells App when the player has named themself.
 */
import { GAME_SUBTITLE, GAME_TITLE } from '../../shared/config';
import { ProfileView } from '../../shared/protocol';
import { rankOf } from '../../shared/ranks';
import { audio } from '../audio';
import { GameRenderer } from '../render/renderer';
import { esc } from '../ui';
import { TitleScene } from './scene';

type State = 'boot' | 'press' | 'name' | 'forge' | 'welcome' | 'gone';

const h = (html: string): HTMLElement => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface TitleScreenOptions {
  touch: boolean;
  offline: boolean;
  /** the name to start with (remembered, or the platform's) */
  name: string;
  renderer: GameRenderer;
  scene: () => TitleScene | null;
  onSubmit(name: string): void;
}

export class TitleScreen {
  readonly el: HTMLElement;
  private state: State = 'boot';
  private input: HTMLInputElement;
  private typing = 0;
  private timers: number[] = [];
  private bootT = 0;
  private bootDur = 0;
  /** a pixel pulse on the 3D frame: blocks at its peak, and how long it lasts */
  private pulse = { t: 1, dur: 1, peak: 1 };
  private windTimer = 0;
  private returning: boolean;
  /** bumped whenever the welcome is interrupted, so a half-played welcome stops */
  private epoch = 0;

  constructor(
    parent: HTMLElement,
    private readonly o: TitleScreenOptions,
  ) {
    this.returning = !!o.name;
    const letters = [...GAME_TITLE].map((c, i) => `<span style="--i:${i}">${esc(c)}</span>`).join('');
    this.el = h(`
      <div class="ts" data-state="boot">
        <div class="ts-bars" aria-hidden="true"><i></i><i></i></div>
        <div class="ts-brand">
          <div class="ts-logo-row"><h1 class="ts-logo" aria-label="${esc(GAME_TITLE)}">${letters}</h1><div class="ts-hanko" aria-hidden="true">弾</div></div>
          <div class="ts-sub"><span class="jp">一騎打ち</span><span>${esc(GAME_SUBTITLE)}</span></div>
        </div>
        <div class="ts-press" role="button" tabindex="0">${o.touch ? 'Tap to continue' : 'Press any key'}</div>
        <form class="ts-panel" autocomplete="off">
          <div class="ts-panel-head"><span class="jp">名乗れ</span><i></i></div>
          <div class="ts-q" aria-live="polite"></div>
          <label class="ts-field">
            <input class="ts-input" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" aria-label="Your name" />
            <span class="ts-mirror" aria-hidden="true"><span class="ts-typed"></span><i class="ts-caret"></i></span>
          </label>
          <div class="ts-row"><span class="ts-count">0/16</span><button class="ts-go" type="submit"><span class="bk">参る</span>${o.offline ? 'Begin' : 'Enter the grounds'}</button></div>
          <div class="ts-status" aria-live="polite"></div>
        </form>
        <div class="ts-forge" aria-live="polite"><div class="ts-forge-text">Forging your legend</div><div class="ts-forge-bar">${'<i></i>'.repeat(12)}</div></div>
        <div class="ts-welcome">
          <div class="ts-seal" aria-hidden="true"><span></span></div>
          <div class="ts-welcome-text"><div class="ts-welcome-kicker"></div><div class="ts-welcome-name"></div><div class="ts-welcome-meta"></div></div>
        </div>
        <div class="ts-hint">${
          o.touch
            ? 'Left thumb moves · drag right side to look · tap PARRY just before a hit lands'
            : 'WASD move · Mouse aim · LMB attack · F heavy · RMB guard / deflect · Shift dodge · Space jump'
        }</div>
        <div class="ts-skip">${o.touch ? 'Tap to skip' : 'Click to skip'}</div>
      </div>`);
    parent.appendChild(this.el);
    this.input = this.el.querySelector<HTMLInputElement>('.ts-input')!;
    this.input.value = o.name.slice(0, 16);
    this.syncField();
    if (o.offline) this.setStatus('Single player: roam the grounds, spar, practise, and climb ranked against AI. Progress saves in this browser.');

    this.input.addEventListener('input', () => {
      this.syncField();
      this.spark();
      audio.play('click', 0.12);
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      this.submit();
    });
    this.input.addEventListener('focus', () => this.el.classList.add('focus'));
    this.input.addEventListener('blur', () => this.el.classList.remove('focus'));
    this.el.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    // any tap, click or key moves the opening along
    this.el.addEventListener('pointerdown', (e) => {
      if (this.state === 'boot' || this.state === 'press') {
        e.preventDefault();
        this.advance();
      }
    });
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.state !== 'boot' && this.state !== 'press') return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Tab') return;
    e.preventDefault();
    this.advance();
  };

  private set(state: State): void {
    this.state = state;
    this.el.dataset.state = state;
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    clearInterval(this.typing);
  }

  // ------------------------------------------------------------------ the opening

  /** Start from the top: darkness, then the cliff. */
  boot(): void {
    this.set('boot');
    const sc = this.o.scene();
    sc?.cut('boot');
    this.bootT = 0;
    this.bootDur = 3.2;
    this.o.renderer.fade = 1;
    this.o.renderer.pixelate = 40;
    // the camera pulls back from his shoulder to the whole vista, then the logo lands
    this.later(900, () => sc?.go('vista', 5.2));
    this.later(4200, () => this.toPress());
  }

  /** Straight back to the name, after a disconnect. */
  resume(error: string): void {
    this.clearTimers();
    this.el.classList.remove('hidden');
    const sc = this.o.scene();
    sc?.cut('name');
    this.o.renderer.fade = 1;
    this.o.renderer.pixelate = 24;
    this.bootT = 0;
    this.bootDur = 1.2;
    this.toName(true);
    this.setStatus(error, true);
  }

  private toPress(): void {
    if (this.state !== 'boot') return;
    this.bootT = Math.max(this.bootT, this.bootDur);
    this.set('press');
    this.later(1050, () => {
      // the hanko stamps down after the letters
      audio.play('taiko', 0.7);
      this.o.scene()?.kick(0.7);
    });
  }

  private advance(): void {
    audio.unlock();
    if (this.state === 'boot') {
      // skip the slow reveal, straight to the logo
      this.clearTimers();
      this.o.scene()?.go('vista', 1.2);
      this.toPress();
      return;
    }
    if (this.state !== 'press') return;
    audio.play('whoosh', 0.9);
    audio.play('wind', 0.8);
    this.later(120, () => audio.play('chime', 0.45));
    this.pixelPulse(10, 0.55);
    const sc = this.o.scene();
    sc?.gust(1.2);
    sc?.go('name', 2.6);
    this.toName(false);
  }

  private toName(instant: boolean): void {
    this.set('name');
    this.el.classList.toggle('instant', instant);
    const q = this.returning ? `Welcome back, wanderer. Is this still your name?` : 'Wanderer. Before you walk the grounds, tell me your name.';
    const el = this.el.querySelector<HTMLElement>('.ts-q')!;
    el.textContent = '';
    clearInterval(this.typing);
    let i = 0;
    const start = () => {
      this.typing = window.setInterval(() => {
        i++;
        el.textContent = q.slice(0, i);
        if (i % 2 === 0 && q[i - 1] !== ' ') audio.play('click', 0.07);
        if (i >= q.length) clearInterval(this.typing);
      }, 28);
    };
    this.later(instant ? 150 : 1700, () => {
      start();
      // focusing pops the keyboard up on phones: only do it there once they've seen the scene
      if (!this.o.touch || this.returning) this.input.focus({ preventScroll: true });
    });
    this.startAmbience();
  }

  /** Wind across the cliff now and then, once the player has tapped (audio is unlocked by then). */
  private startAmbience(): void {
    if (this.windTimer) return;
    const blow = () => {
      if (this.state === 'gone') return;
      audio.play('wind', 0.25);
      this.o.scene()?.gust(0.35);
      this.windTimer = window.setTimeout(blow, 5200 + Math.random() * 4000);
    };
    this.windTimer = window.setTimeout(blow, 3500);
  }

  // ------------------------------------------------------------------ the name

  private syncField(): void {
    const v = this.input.value;
    this.el.querySelector<HTMLElement>('.ts-typed')!.textContent = v;
    this.el.querySelector<HTMLElement>('.ts-count')!.textContent = `${v.length}/16`;
    this.el.classList.toggle('named', v.trim().length >= 2);
  }

  /** A little burst of pixels off the end of what's typed. */
  private spark(): void {
    const field = this.el.querySelector<HTMLElement>('.ts-field')!;
    const caret = this.el.querySelector<HTMLElement>('.ts-caret')!;
    const fx = caret.offsetLeft;
    for (let i = 0; i < 5; i++) {
      const p = document.createElement('i');
      p.className = 'ts-spark';
      const a = Math.random() * Math.PI * 2;
      const d = 14 + Math.random() * 22;
      p.style.left = `${fx}px`;
      p.style.setProperty('--dx', `${Math.round(Math.cos(a) * d)}px`);
      p.style.setProperty('--dy', `${Math.round(Math.sin(a) * d - 10)}px`);
      field.appendChild(p);
      setTimeout(() => p.remove(), 520);
    }
  }

  setName(name: string): void {
    if (this.input.value) return;
    this.input.value = name.slice(0, 16);
    this.syncField();
  }

  setStatus(text: string, error = false): void {
    const el = this.el.querySelector<HTMLElement>('.ts-status')!;
    el.textContent = text;
    el.classList.toggle('error', error);
    if (error) {
      this.el.querySelector('.ts-panel')!.classList.remove('shake');
      void (this.el.querySelector('.ts-panel') as HTMLElement).offsetWidth;
      this.el.querySelector('.ts-panel')!.classList.add('shake');
    }
  }

  private submit(): void {
    if (this.state !== 'name') return;
    audio.unlock();
    this.o.onSubmit(this.input.value.trim());
  }

  /** The name was accepted: show the account being made while App connects. */
  forging(): void {
    this.set('forge');
    this.input.blur();
    audio.play('draw', 0.5);
    this.pixelPulse(6, 0.4);
    const bar = [...this.el.querySelectorAll<HTMLElement>('.ts-forge-bar i')];
    bar.forEach((b) => b.classList.remove('on'));
    bar.forEach((b, i) => this.later(120 + i * 70, () => b.classList.add('on')));
  }

  /** Connecting failed: back to the name with the reason. */
  failed(text: string): void {
    this.clearTimers();
    this.epoch++;
    const sc = this.o.scene();
    if (sc) {
      sc.ronin.look = 0;
      sc.ronin.stand = 0;
      sc.ronin.grip = 0;
      sc.go('name', 1.2);
    }
    this.el.classList.remove('stamped');
    this.toName(true);
    this.setStatus(text, true);
  }

  // ------------------------------------------------------------------ welcome, and into the game

  /**
   * He turns to look at you, your name is stamped, and he rises with his hand on his sword. Resolves
   * at the moment of the cut, with false if it was interrupted (the connection dropped).
   */
  async welcome(p: ProfileView, isNew: boolean): Promise<boolean> {
    this.clearTimers();
    const ep = ++this.epoch;
    const live = () => ep === this.epoch && this.state !== 'gone';
    const sc = this.o.scene();
    // the bar finishes filling
    this.el.querySelectorAll('.ts-forge-bar i').forEach((b) => b.classList.add('on'));
    await wait(350);
    if (!live()) return false;
    this.set('welcome');
    const r = rankOf(p.mmr, p.placements);
    this.el.querySelector<HTMLElement>('.ts-welcome-kicker')!.textContent = isNew ? 'A new legend begins' : 'Welcome back';
    this.el.querySelector<HTMLElement>('.ts-welcome-name')!.textContent = p.name;
    this.el.querySelector<HTMLElement>('.ts-welcome-meta')!.textContent = isNew ? `${r.label} · ${p.mmr} MMR` : `${r.label} · ${p.mmr} MMR · ${p.wins}W ${p.losses}L`;
    this.el.querySelector<HTMLElement>('.ts-seal span')!.textContent = [...p.name][0]?.toUpperCase() ?? '名';
    sc?.go('greet', 1.4);
    const look = { t: 0 };
    const turn = (to: number, ms: number) =>
      new Promise<void>((res) => {
        const from = sc?.ronin.look ?? 0;
        const t0 = performance.now();
        const step = () => {
          look.t = Math.min(1, (performance.now() - t0) / ms);
          if (sc && live()) sc.ronin.look = from + (to - from) * look.t;
          if (look.t < 1 && live()) requestAnimationFrame(step);
          else res();
        };
        step();
      });
    void turn(1, 1100);
    this.later(650, () => {
      audio.play('taiko', 0.9);
      sc?.kick(0.6);
      this.el.classList.add('stamped');
    });
    await wait(1900);
    if (!live()) return false;
    // he rises and sets his hand on the hilt
    sc?.go('rise', 1.5);
    audio.play('breath', 0.5);
    const rise = (key: 'stand' | 'grip', ms: number) =>
      new Promise<void>((res) => {
        const t0 = performance.now();
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / ms);
          if (sc && live()) sc.ronin[key] = k;
          if (k < 1 && live()) requestAnimationFrame(step);
          else res();
        };
        step();
      });
    void turn(0.55, 1200);
    await rise('stand', 1300);
    if (!live()) return false;
    audio.play('tink', 0.6);
    sc?.gust(1);
    await rise('grip', 520);
    await wait(260);
    if (!live()) return false;
    audio.play('shing', 0.9);
    return true;
  }

  /**
   * The cut: a blade of light across the frame, which falls apart along it to reveal what's behind.
   * `frame` is the title's last rendered frame.
   */
  slash(frame: HTMLCanvasElement): void {
    this.set('gone');
    this.clearTimers();
    clearTimeout(this.windTimer);
    window.removeEventListener('keydown', this.onKey);
    const w = this.el.clientWidth;
    const hh = this.el.clientHeight;
    const cut = h(`<div class="ts-cut"></div>`);
    // the cut runs from lower left to upper right; each half keeps its side of the line
    const halves: HTMLCanvasElement[] = [];
    for (const side of ['a', 'b']) {
      const c = document.createElement('canvas');
      c.width = frame.width;
      c.height = frame.height;
      c.getContext('2d')!.drawImage(frame, 0, 0);
      c.className = `ts-half ts-half-${side}`;
      cut.appendChild(c);
      halves.push(c);
    }
    // the DOM overlay goes along with the frame (logo and all are gone by now; just the bars)
    const line = h(`<div class="ts-line"></div>`);
    line.style.setProperty('--len', `${Math.hypot(w, hh) + 40}px`);
    line.style.setProperty('--ang', `${(-Math.atan2(hh, w) * 180) / Math.PI}deg`);
    cut.appendChild(line);
    cut.appendChild(h(`<div class="ts-flash"></div>`));
    this.el.appendChild(cut);
    void cut.offsetWidth;
    cut.classList.add('go');
    audio.play('deathblow', 0.6);
    this.o.renderer.pixelate = 1;
    this.o.renderer.fade = 0;
    setTimeout(() => this.el.remove(), 1700);
  }

  /** Fallback for when there's no frame to cut: a quick dithered dissolve. */
  dissolve(): void {
    this.set('gone');
    this.clearTimers();
    clearTimeout(this.windTimer);
    window.removeEventListener('keydown', this.onKey);
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), 700);
  }

  get active(): boolean {
    return this.state !== 'gone';
  }

  // ------------------------------------------------------------------ per frame

  private pixelPulse(peak: number, seconds: number): void {
    this.pulse = { t: 0, dur: seconds, peak };
  }

  update(dt: number): void {
    const r = this.o.renderer;
    if (this.state === 'gone') return;
    // the opening: dither in from black while big pixels resolve into the scene
    let pix = 1;
    let fade = 0;
    if (this.bootT < this.bootDur) {
      this.bootT += dt;
      const k = Math.min(1, this.bootT / this.bootDur);
      fade = 1 - Math.min(1, k * 1.6);
      // stepped, like a low-res image loading in
      pix = Math.max(1, Math.round(Math.pow(1 - k, 2.2) * 40));
      if (pix > 1) pix = Math.pow(2, Math.round(Math.log2(pix)));
    }
    if (this.pulse.t < this.pulse.dur) {
      this.pulse.t += dt;
      const k = this.pulse.t / this.pulse.dur;
      pix = Math.max(pix, Math.round(1 + (this.pulse.peak - 1) * Math.sin(Math.min(1, k) * Math.PI)));
    }
    r.pixelate = pix;
    r.fade = fade;
  }
}
