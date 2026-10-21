import { BTN, BUTTON_COUNT, clampMove, type InputFrame } from '@nfg/shared';

export type UiAction = 'menu' | 'confirm' | 'any';
export type InputDevice = 'keyboard' | 'touch';

// Bound by physical key position (KeyboardEvent.code), so AZERTY and other layouts work unchanged.
const KEY_BUTTONS: Record<string, number> = {
  KeyJ: BTN.LIGHT,
  KeyK: BTN.HEAVY,
  KeyF: BTN.PARRY,
  KeyL: BTN.PARRY,
  ShiftLeft: BTN.DODGE,
  ShiftRight: BTN.DODGE,
  Space: BTN.JUMP,
  KeyE: BTN.SPECIAL,
  KeyR: BTN.ABILITY,
};

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const MOUSE_BUTTONS: Record<number, number> = { 0: BTN.LIGHT, 2: BTN.HEAVY };

function bitIndex(btn: number): number {
  return Math.round(Math.log2(btn));
}

export class InputManager {
  /** Cumulative presses per button, sent to the server so no tap is lost between ticks. */
  readonly counts = new Array<number>(BUTTON_COUNT).fill(0);
  lastDevice: InputDevice = 'keyboard';
  /** Horizontal camera drag accumulated since the last read (touch "look around"). */
  look = 0;
  private keys = new Set<string>();
  private mouseHeld = 0;
  private touchHeld = 0;
  private touchMove: [number, number] = [0, 0];
  private pending = 0;
  private uiListeners: ((action: UiAction, code: string) => void)[] = [];
  private deviceListeners: ((d: InputDevice) => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
    canvas.addEventListener('pointerdown', this.onPointerDown);
    // Any tap or click anywhere (UI, touch layer or canvas) counts for "press anything" prompts.
    window.addEventListener('pointerdown', this.onAnyPointer, { capture: true });
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onUi(listener: (action: UiAction, code: string) => void): void {
    this.uiListeners.push(listener);
  }

  onDeviceChange(listener: (d: InputDevice) => void): void {
    this.deviceListeners.push(listener);
  }

  private setDevice(d: InputDevice): void {
    if (this.lastDevice === d) return;
    this.lastDevice = d;
    for (const l of this.deviceListeners) l(d);
  }

  private emitUi(action: UiAction, code: string): void {
    for (const l of this.uiListeners) l(action, code);
  }

  private press(btn: number): void {
    this.pending |= btn;
    this.counts[bitIndex(btn)]!++;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.setDevice('keyboard');
    // Keep the page from scrolling or the browser from acting on game keys.
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    this.keys.add(e.code);
    const btn = KEY_BUTTONS[e.code];
    if (btn) this.press(btn);
    // P opens the menu; Escape is left alone because it exits fullscreen on CrazyGames.
    if (e.code === 'KeyP') this.emitUi('menu', e.code);
    else if (e.code === 'Enter' || e.code === 'Space') this.emitUi('confirm', e.code);
    this.emitUi('any', e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onAnyPointer = (e: PointerEvent): void => {
    this.setDevice(e.pointerType === 'mouse' ? 'keyboard' : 'touch');
    this.emitUi('any', e.pointerType === 'mouse' ? `Mouse${e.button}` : 'Touch');
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    const btn = MOUSE_BUTTONS[e.button];
    if (btn) {
      this.mouseHeld |= btn;
      this.press(btn);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    const btn = MOUSE_BUTTONS[e.button];
    if (btn) this.mouseHeld &= ~btn;
  };

  private releaseAll = (): void => {
    this.keys.clear();
    this.mouseHeld = 0;
    this.touchHeld = 0;
    this.touchMove = [0, 0];
  };

  /** Called by the touch layer. */
  touchButton(btn: number, down: boolean): void {
    this.setDevice('touch');
    if (down) {
      this.touchHeld |= btn;
      this.press(btn);
    } else {
      this.touchHeld &= ~btn;
    }
  }

  touchStick(x: number, y: number): void {
    this.setDevice('touch');
    this.touchMove = [x, y];
  }


  /** One 60 Hz gameplay sample: held buttons, presses since the last sample, and movement. */
  sample(): InputFrame {
    let held = this.mouseHeld | this.touchHeld;
    let mx = 0;
    let my = 0;
    for (const code of this.keys) {
      const btn = KEY_BUTTONS[code];
      if (btn) held |= btn;
      const dir = MOVE_KEYS[code];
      if (dir) {
        mx += dir[0];
        my += dir[1];
      }
    }
    if (mx === 0 && my === 0) [mx, my] = this.touchMove;
    [mx, my] = clampMove(mx, my);
    const pressed = this.pending;
    this.pending = 0;
    return { moveX: mx, moveY: my, held: held | pressed, pressed };
  }

  /** Drops presses that happened while gameplay input was ignored (menus, cutscenes). */
  flush(): void {
    this.pending = 0;
  }

  takeLook(): number {
    const v = this.look;
    this.look = 0;
    return v;
  }
}
