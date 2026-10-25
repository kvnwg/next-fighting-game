/**
 * Keyboard + mouse, plus the on-screen touch controls (which feed the same binds). Combat binds fire
 * callbacks immediately (with exact timestamps) for tight parry timing.
 */

export type Bind =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'dodge'
  | 'light'
  | 'heavy'
  | 'block'
  | 'special'
  | 'ability'
  | 'lock'
  | 'chat'
  | 'chars'
  | 'shop'
  | 'leaderboard'
  | 'help'
  | 'challenge'
  | 'accept'
  | 'decline'
  | 'ranked'
  | 'practice'
  | 'play'
  | 'escape';

export const KEYS: Record<Bind, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  dodge: ['ShiftLeft', 'ShiftRight'],
  light: [],
  heavy: ['KeyF'],
  block: [],
  special: ['KeyE'],
  ability: ['KeyR'],
  lock: ['Tab', 'KeyQ'],
  chat: ['Enter'],
  chars: ['KeyC'],
  shop: ['KeyB'],
  leaderboard: ['KeyL'],
  help: ['KeyH'],
  challenge: ['KeyG'],
  accept: ['KeyY'],
  decline: ['KeyN'],
  ranked: ['KeyK'],
  practice: ['KeyP'],
  // the Play menu, with the cursor freed to click it
  play: ['KeyM'],
  escape: ['Escape'],
};

// left click attacks, right click guards (tap: deflect, hold: block)
const MOUSE: Record<number, Bind> = { 0: 'light', 2: 'block', 1: 'lock', 3: 'heavy', 4: 'dodge' };

export class Input {
  private down = new Set<Bind>();
  private codeToBind = new Map<string, Bind>();
  mouseDX = 0;
  mouseDY = 0;
  locked = false;
  /** Pointer lock was refused (e.g. inside a sandboxed frame): fall back to free-cursor mouse look. */
  lockFailed = false;
  private lastLockAttempt = -Infinity;
  /** when true (chat/menus focused) gameplay keys are ignored */
  suspended = false;
  /** analog thumbstick from the touch controls: (right, forward) in -1..1 */
  stick = { x: 0, y: 0 };
  /** playing with touch controls: no pointer lock, and taps never count as mouse clicks */
  touchMode = false;
  onBind: ((b: Bind, pressed: boolean, time: number) => void) | null = null;
  onWheel: ((dy: number) => void) | null = null;

  constructor(private readonly canvas: HTMLElement) {
    for (const [bind, codes] of Object.entries(KEYS) as [Bind, string[]][]) for (const c of codes) this.codeToBind.set(c, bind);

    window.addEventListener('keydown', (e) => {
      const b = this.codeToBind.get(e.code);
      if (!b) return;
      if (this.isTyping(e) && b !== 'escape' && b !== 'chat') return;
      if (b === 'lock' || b === 'jump' || (b === 'chat' && !this.suspended)) e.preventDefault();
      if (e.repeat) return;
      this.press(b, e.timeStamp);
    });
    window.addEventListener('keyup', (e) => {
      const b = this.codeToBind.get(e.code);
      if (b) this.release(b, e.timeStamp);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.touchMode) return;
      // take the keyboard back. The preventDefault below stops a click from doing what a click
      // normally does to focus: taking it off a text box (a chat or name field left focused would
      // swallow every key as typing, while the mouse still fights) and into this page (after a
      // click outside the frame it's embedded in)
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
      window.focus();
      if (!this.locked) {
        if (!this.suspended) this.requestLock();
        if (!this.lockFailed) return;
      }
      const b = MOUSE[e.button];
      if (b) {
        e.preventDefault();
        this.press(b, e.timeStamp);
      }
    });
    window.addEventListener('mouseup', (e) => {
      const b = MOUSE[e.button];
      if (b) this.release(b, e.timeStamp);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked && !(this.lockFailed && e.target === this.canvas && !this.suspended)) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    canvas.addEventListener('wheel', (e) => this.onWheel?.(e.deltaY), { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.lockFailed = false;
      else this.releaseAll();
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
    });
    window.addEventListener('blur', () => this.releaseAll());
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  }

  requestLock(): void {
    if (this.touchMode) return;
    // once refused, only retry occasionally (a sandboxed frame refuses every time)
    if (this.lockFailed && performance.now() - this.lastLockAttempt < 8000) return;
    this.lastLockAttempt = performance.now();
    const el = this.canvas as HTMLElement & { requestPointerLock?: () => Promise<void> | void };
    if (!el.requestPointerLock) {
      this.lockFailed = true;
      return;
    }
    try {
      const r = el.requestPointerLock();
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => (this.lockFailed = true));
    } catch {
      // pointer lock unavailable (e.g. a sandboxed frame without permission)
      this.lockFailed = true;
    }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** An on-screen button went down or up. */
  virtual(b: Bind, pressed: boolean, time: number): void {
    if (pressed) this.press(b, time);
    else this.release(b, time);
  }

  private press(b: Bind, time: number): void {
    const gameplay = !['chat', 'escape', 'accept', 'decline', 'chars', 'leaderboard', 'help', 'ranked', 'practice'].includes(b);
    if (this.suspended && gameplay) return;
    this.down.add(b);
    this.onBind?.(b, true, time);
  }

  private release(b: Bind, time: number): void {
    if (!this.down.has(b)) return;
    this.down.delete(b);
    this.onBind?.(b, false, time);
  }

  releaseAll(): void {
    const t = performance.now();
    for (const b of [...this.down]) this.release(b, t);
  }

  isDown(b: Bind): boolean {
    return this.down.has(b);
  }

  /** WASD (or the thumbstick) as a (right, forward) vector in -1..1 */
  moveAxes(): { x: number; y: number } {
    if (this.suspended) return { x: 0, y: 0 };
    const x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    const y = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);
    if (x === 0 && y === 0) return { x: this.stick.x, y: this.stick.y };
    return { x, y };
  }

  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }
}
