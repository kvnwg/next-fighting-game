export const BTN = {
  LIGHT: 1,
  HEAVY: 2,
  PARRY: 4,
  DODGE: 8,
  JUMP: 16,
  /** The character's perilous special. */
  SPECIAL: 32,
  /** The character's ability (stance, buff, dash, vault...). */
  ABILITY: 64,
} as const;

export const BUTTON_COUNT = 7;
export const BUTTON_MASK = (1 << BUTTON_COUNT) - 1;

export type ButtonName = keyof typeof BTN;

/**
 * One tick of input. Movement is relative to the fighter's facing, which always
 * points at the opponent: +moveY walks toward them, +moveX circles to the right.
 */
export interface InputFrame {
  moveX: number;
  moveY: number;
  /** Buttons held this tick. */
  held: number;
  /** Buttons that went down this tick. */
  pressed: number;
}

export const NO_INPUT: InputFrame = Object.freeze({ moveX: 0, moveY: 0, held: 0, pressed: 0 });

export function makeInput(partial: Partial<InputFrame> = {}): InputFrame {
  return { moveX: 0, moveY: 0, held: 0, pressed: 0, ...partial };
}

export function clampMove(x: number, y: number): [number, number] {
  const len = Math.hypot(x, y);
  if (len > 1) return [x / len, y / len];
  if (len < 0.15) return [0, 0];
  return [x, y];
}

/**
 * Turns cumulative press counters (sent over the network) into press edges, so a
 * tap that starts and ends between two server ticks is never lost.
 */
export class PressCounter {
  private last = new Array<number>(BUTTON_COUNT).fill(0);

  consume(counts: readonly number[]): number {
    let pressed = 0;
    for (let i = 0; i < BUTTON_COUNT; i++) {
      const c = counts[i] ?? 0;
      if (c !== this.last[i]) {
        pressed |= 1 << i;
        this.last[i] = c;
      }
    }
    return pressed;
  }

  reset(): void {
    this.last.fill(0);
  }
}
