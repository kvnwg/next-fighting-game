import { BTN } from '@nfg/shared';
import type { InputManager } from './input.ts';

interface ButtonDef {
  btn: number;
  label: string;
  cls: string;
}

const BUTTONS: ButtonDef[] = [
  { btn: BTN.LIGHT, label: 'LIGHT', cls: 'light' },
  { btn: BTN.HEAVY, label: 'HEAVY', cls: 'heavy' },
  { btn: BTN.PARRY, label: 'PARRY', cls: 'parry' },
  { btn: BTN.DODGE, label: 'DODGE', cls: 'dodge' },
  { btn: BTN.JUMP, label: 'JUMP', cls: 'jump' },
];

const STICK_RADIUS = 52;
// Holding LIGHT re-presses it so a held thumb keeps the chain going.
const AUTO_REPEAT_DELAY = 0.18;
const AUTO_REPEAT_EVERY = 0.12;

/** On-screen thumb stick and buttons, laid out like the reference's right-thumb cluster. */
export class TouchControls {
  private root: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookX = 0;
  private lightHeldFor = -1;
  private repeatTimer = 0;

  constructor(
    container: HTMLElement,
    private readonly input: InputManager,
  ) {
    this.root = container;
    this.root.classList.add('touch-root');
    this.root.innerHTML = `
      <div class="touch-stick-zone"></div>
      <div class="touch-stick-base"><div class="touch-stick-knob"></div></div>
      <div class="touch-buttons">
        ${BUTTONS.map((b) => `<button class="tbtn tbtn-${b.cls}" data-btn="${b.btn}">${b.label}</button>`).join('')}
      </div>`;
    this.base = this.root.querySelector('.touch-stick-base')!;
    this.knob = this.root.querySelector('.touch-stick-knob')!;

    const zone = this.root.querySelector<HTMLElement>('.touch-stick-zone')!;
    zone.addEventListener('pointerdown', this.onZoneDown);
    zone.addEventListener('pointermove', this.onZoneMove);
    zone.addEventListener('pointerup', this.onZoneUp);
    zone.addEventListener('pointercancel', this.onZoneUp);

    for (const el of this.root.querySelectorAll<HTMLElement>('.tbtn')) {
      const btn = Number(el.dataset.btn);
      const down = (e: PointerEvent) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('down');
        this.input.touchButton(btn, true);
        if (btn === BTN.LIGHT) this.lightHeldFor = 0;
      };
      const up = () => {
        el.classList.remove('down');
        this.input.touchButton(btn, false);
        if (btn === BTN.LIGHT) this.lightHeldFor = -1;
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    }
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('visible', visible);
    if (!visible) this.resetStick();
  }

  setLefty(lefty: boolean): void {
    this.root.classList.toggle('lefty', lefty);
  }

  /** Called every frame for the hold-to-chain behavior. */
  update(dt: number): void {
    if (this.lightHeldFor < 0) return;
    this.lightHeldFor += dt;
    if (this.lightHeldFor < AUTO_REPEAT_DELAY) return;
    this.repeatTimer -= dt;
    if (this.repeatTimer <= 0) {
      this.repeatTimer = AUTO_REPEAT_EVERY;
      this.input.touchButton(BTN.LIGHT, true);
    }
  }

  private onZoneDown = (e: PointerEvent): void => {
    const lefty = this.root.classList.contains('lefty');
    const stickSide = lefty ? e.clientX > window.innerWidth * 0.55 : e.clientX < window.innerWidth * 0.45;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (stickSide && this.stickId === null) {
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.base.classList.add('active');
      this.knob.style.transform = 'translate(0px, 0px)';
    } else if (!stickSide && this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookX = e.clientX;
    }
  };

  private onZoneMove = (e: PointerEvent): void => {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickOrigin.x;
      let dy = e.clientY - this.stickOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS;
        dy = (dy / len) * STICK_RADIUS;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.touchStick(dx / STICK_RADIUS, -dy / STICK_RADIUS);
    } else if (e.pointerId === this.lookId) {
      this.input.look += (e.clientX - this.lookX) / window.innerWidth;
      this.lookX = e.clientX;
    }
  };

  private onZoneUp = (e: PointerEvent): void => {
    if (e.pointerId === this.stickId) this.resetStick();
    if (e.pointerId === this.lookId) this.lookId = null;
  };

  private resetStick(): void {
    // Only an active stick needs releasing; touching the input otherwise would flag the
    // device as touch (hiding the controls on desktop would turn them right back on).
    if (this.stickId !== null) this.input.touchStick(0, 0);
    this.stickId = null;
    this.base.classList.remove('active');
  }
}
