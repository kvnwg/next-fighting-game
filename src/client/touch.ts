/**
 * On-screen controls for phones and tablets: a floating thumbstick on the left, drag anywhere else
 * to look around, and the fight buttons in a cluster on the right. The special attack button only
 * appears once its meter has filled.
 */
import { Bind, Input } from './input';
import { icon } from './pixelicons';
import { frameWidth, toFrame } from './rotate';

/** Touch-first device (or forced with ?touch / ?touch=0). */
export function isTouchDevice(): boolean {
  const forced = new URLSearchParams(location.search).get('touch');
  if (forced !== null) return forced !== '0';
  return typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export interface TouchState {
  specialReady: boolean;
  abilityName: string;
  /** ms until each is usable again (0 = ready) */
  abilityLeft: number;
  dodgeLeft: number;
  locked: boolean;
}

/** how far (px) the knob travels from the stick's center */
const STICK_R = 50;
/** touch drag pixels -> mouse-equivalent pixels for the camera */
const LOOK_GAIN = 2.4;

const ICON_MENU = icon('menu');
const ICON_CHAT = icon('chat');

export class TouchControls {
  readonly root: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly btn: Record<string, HTMLElement> = {};
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private looks = new Map<number, { x: number; y: number }>();
  /** which pointer holds each fight button down */
  private held = new Map<Bind, number>();
  private shown = { special: false };

  constructor(
    parent: HTMLElement,
    private readonly input: Input,
    handlers: { onMenu: () => void; onChat: () => void },
  ) {
    const t = document.createElement('template');
    t.innerHTML = `
      <div class="touch-ui">
        <div class="tc-pad"></div>
        <div class="tc-stick idle"><div class="tc-knob"></div></div>
        <div class="tc-top">
          <button class="tc-round" data-act="menu" aria-label="Menu">${ICON_MENU}</button>
          <button class="tc-round" data-act="chat" aria-label="Chat">${ICON_CHAT}</button>
        </div>
        <button class="tc-btn tc-special hidden" data-bind="special"><i class="tc-jp">危</i>Special</button>
        <button class="tc-btn tc-parry" data-bind="block"><i class="tc-jp">弾</i>Parry</button>
        <button class="tc-btn tc-heavy" data-bind="heavy"><i class="tc-jp">重</i>Heavy</button>
        <button class="tc-btn tc-dodge" data-bind="dodge"><i class="tc-jp">避</i>Dodge<span class="tc-cd"></span></button>
        <button class="tc-btn tc-light" data-bind="light"><i class="tc-jp">斬</i>Light</button>
        <button class="tc-btn tc-jump" data-bind="jump"><i class="tc-jp">跳</i>Jump</button>
        <button class="tc-btn tc-ability" data-bind="ability"><span class="tc-name"></span><span class="tc-cd"></span></button>
        <button class="tc-btn tc-lock" data-bind="lock"><i class="tc-jp">狙</i>Lock</button>
      </div>`;
    this.root = t.content.firstElementChild as HTMLElement;
    parent.prepend(this.root); // under the rest of the HUD, so menus and popups stay tappable
    this.base = this.root.querySelector<HTMLElement>('.tc-stick')!;
    this.knob = this.root.querySelector<HTMLElement>('.tc-knob')!;

    // fight buttons: press on touch-down (exact timestamps matter for deflects), release on lift
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-bind]')) {
      const bind = el.dataset.bind as Bind;
      this.btn[bind] = el;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        // a fresh press always takes the button, even if the last lift never arrived
        if (this.held.has(bind)) this.releaseButton(bind, e.timeStamp);
        this.held.set(bind, e.pointerId);
        el.setPointerCapture(e.pointerId);
        el.classList.add('down');
        this.input.virtual(bind, true, e.timeStamp);
      });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-act]')) {
      el.addEventListener('click', () => (el.dataset.act === 'menu' ? handlers.onMenu() : handlers.onChat()));
    }

    // the pad: thumbstick on the left part of the screen, camera drag everywhere else
    const pad = this.root.querySelector<HTMLElement>('.tc-pad')!;
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      // a new touch on the left always takes the stick: if the last thumb's lift got lost (the
      // controls hidden under a cinematic, a system gesture), the stick would otherwise stay
      // pushed with no way to grab it back
      // (positions in the game's frame: the screen, or the screen turned, see rotate.ts)
      const p = toFrame(e.clientX, e.clientY);
      if (p.x < frameWidth() * 0.45) {
        if (this.stickId !== null) this.resetStick();
        this.stickId = e.pointerId;
        this.stickOrigin = { x: p.x, y: p.y };
        this.base.classList.remove('idle');
        this.base.style.left = `${p.x}px`;
        this.base.style.top = `${p.y}px`;
        this.moveStick(p.x, p.y);
      } else this.looks.set(e.pointerId, p);
    });
    // moves and lifts are watched on the window, not the pad: a pointer whose capture was lost
    // (the controls hidden mid-touch) still reports there
    window.addEventListener('pointermove', (e) => {
      const p = toFrame(e.clientX, e.clientY);
      if (e.pointerId === this.stickId) {
        this.moveStick(p.x, p.y);
        return;
      }
      const last = this.looks.get(e.pointerId);
      if (!last || this.input.suspended) return;
      this.input.mouseDX += (p.x - last.x) * LOOK_GAIN;
      this.input.mouseDY += (p.y - last.y) * LOOK_GAIN;
      last.x = p.x;
      last.y = p.y;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) this.resetStick();
      this.looks.delete(e.pointerId);
      for (const [bind, id] of this.held) if (id === e.pointerId) this.releaseButton(bind, e.timeStamp);
    };
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
    // the backstop: when no finger is on the glass at all, nothing can be held, whatever pointer
    // events went missing (iOS can drop the lift of a captured pointer)
    const none = (e: TouchEvent) => {
      if (e.touches.length === 0) this.cancel();
    };
    window.addEventListener('touchend', none, true);
    window.addEventListener('touchcancel', none, true);
    // leaving the page (app switch, notification shade) can swallow every lift
    window.addEventListener('blur', () => this.cancel());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancel();
    });
  }

  private releaseButton(bind: Bind, time: number): void {
    this.held.delete(bind);
    this.btn[bind]?.classList.remove('down');
    this.input.virtual(bind, false, time);
  }

  private moveStick(x: number, y: number): void {
    let dx = x - this.stickOrigin.x;
    let dy = y - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) {
      // drag the stick along when the thumb goes past the rim
      const over = len - STICK_R;
      this.stickOrigin.x += (dx / len) * over;
      this.stickOrigin.y += (dy / len) * over;
      this.base.style.left = `${this.stickOrigin.x}px`;
      this.base.style.top = `${this.stickOrigin.y}px`;
      dx = x - this.stickOrigin.x;
      dy = y - this.stickOrigin.y;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // dead zone, then a quick ramp to full speed (a small push walks)
    const m = Math.min(1, Math.hypot(dx, dy) / STICK_R);
    const mag = m < 0.18 ? 0 : m > 0.75 ? 1 : 0.35 + (0.65 * (m - 0.18)) / 0.57;
    const l = Math.hypot(dx, dy) || 1;
    this.input.stick.x = (dx / l) * mag;
    this.input.stick.y = (-dy / l) * mag;
  }

  private resetStick(): void {
    this.stickId = null;
    this.input.stick.x = 0;
    this.input.stick.y = 0;
    this.knob.style.transform = '';
    this.base.classList.add('idle');
    this.base.style.left = '';
    this.base.style.top = '';
  }

  /** Drop every touch (e.g. when a menu opens on top). */
  cancel(): void {
    this.resetStick();
    this.looks.clear();
    for (const bind of [...this.held.keys()]) this.releaseButton(bind, performance.now());
  }

  update(s: TouchState): void {
    if (s.specialReady !== this.shown.special) {
      this.shown.special = s.specialReady;
      this.btn.special.classList.toggle('hidden', !s.specialReady);
      // a fresh pop each time the meter fills
      if (s.specialReady) {
        this.btn.special.classList.remove('pop');
        void this.btn.special.offsetWidth;
        this.btn.special.classList.add('pop');
      }
    }
    const cooldown = (el: HTMLElement, left: number) => {
      el.classList.toggle('cooling', left > 0);
      const cd = el.querySelector<HTMLElement>('.tc-cd')!;
      const text = left > 0 ? `${Math.ceil(left / 1000)}` : '';
      if (cd.textContent !== text) cd.textContent = text;
    };
    cooldown(this.btn.ability, s.abilityLeft);
    cooldown(this.btn.dodge, s.dodgeLeft);
    const name = this.btn.ability.querySelector<HTMLElement>('.tc-name')!;
    if (name.textContent !== s.abilityName) name.textContent = s.abilityName;
    this.btn.lock.classList.toggle('on', s.locked);
  }
}
