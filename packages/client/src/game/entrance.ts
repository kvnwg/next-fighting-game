import { startPosition, type Side } from '@nfg/shared';
import { camPose, type CamPose, type Shot } from '../render/camera.ts';
import type { FighterView } from '../render/poses.ts';

/** Per-frame overrides the app applies to a fighter while its entrance plays. */
export interface EntranceOverride {
  side: Side;
  dx: number;
  dy: number;
  dz: number;
  special: FighterView['special'];
  visible: boolean;
}

export interface EntranceHooks {
  /** Fighter hits the ground: thump, dust, a little shake. */
  landed(side: Side): void;
  showCard(side: Side): void;
  hideCard(): void;
}

const linear = (t: number) => t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * The reference's drop-in entrance: a worm's-eye leap off the roof, a hard cut to an
 * empty tilted frame, a fast drop and crouched landing, the name card, then a push-in.
 */
export class EntranceDirector {
  override: EntranceOverride | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private raf = 0;
  private cancelled = false;

  constructor(
    private readonly playShots: (shots: Shot[]) => Promise<void>,
    private readonly stopShots: () => void,
  ) {}

  /** Opponent's entrance, about 4.2 s. */
  async playOpponent(side: Side, hooks: EntranceHooks): Promise<void> {
    this.cancelled = false;
    const s = startPosition(side);
    const fx = Math.sin(s.facing);
    const fz = Math.cos(s.facing);
    // Side vector (the fighter's right).
    const rx = -fz;
    const rz = fx;
    const O = { x: s.x, z: s.z };
    const at = (f: number, r: number, y: number): [number, number, number] => [O.x + fx * f + rx * r, y, O.z + fz * f + rz * r];

    this.override = { side, dx: 0, dy: 9, dz: 0, special: 'landing', visible: true };
    // Leap: from the roof edge behind them, arcing down toward the camera, then out of frame.
    const leapStart = performance.now();
    const animateLeap = () => {
      if (this.cancelled || !this.override) return;
      const t = (performance.now() - leapStart) / 1000;
      if (t < 1.45) {
        const k = Math.min(1, Math.max(0, (t - 0.25) / 1.2));
        this.override.dx = -fx * (4.5 - 3 * k) - rx * 0.6;
        this.override.dz = -fz * (4.5 - 3 * k) - rz * 0.6;
        this.override.dy = 6.6 + Math.sin(k * Math.PI) * 1.2 - k * 2.5;
        this.override.special = 'kneel';
        this.raf = requestAnimationFrame(animateLeap);
      } else {
        // Hidden above the second shot until the drop.
        this.override.dx = this.override.dz = 0;
        this.override.dy = 9;
        this.override.special = 'landing';
      }
    };
    this.raf = requestAnimationFrame(animateLeap);

    this.later(1.95, () => this.drop(hooks, side));
    this.later(2.15, () => hooks.showCard(side));
    this.later(2.95, () => {
      if (this.override) this.override.special = 'victory';
    });

    await this.playShots([
      {
        duration: 1.45,
        from: camPose(at(2.6, 1.4, 0.35), at(-3.5, -0.4, 6.8), 64),
        to: camPose(at(2.6, 1.4, 0.4), at(-1.2, -0.2, 4.2), 64),
        ease: linear,
      },
      {
        duration: 1.1,
        from: camPose(at(3.2, -1.2, 0.35), at(0, 0, 0.9), 55, 0.35),
        to: camPose(at(3.1, -1.15, 0.36), at(0, 0, 0.9), 55, 0.35),
        ease: linear,
      },
      { duration: 0.18, from: camPose(at(3.1, -1.15, 0.36), at(0, 0, 0.9), 55, 0.35), to: camPose(at(1.7, -0.5, 1.45), at(0, 0, 1.45), 46, 0.22), ease: easeOut },
      { duration: 1.5, from: camPose(at(1.7, -0.5, 1.45), at(0, 0, 1.45), 46, 0.22), to: camPose(at(1.5, -0.42, 1.5), at(0, 0, 1.5), 44, 0.2), ease: linear },
    ]);
    this.finish(hooks);
  }

  /** Your own entrance, shorter (about 2.8 s), ending on `rest` so the lock-on camera takes over without a cut. */
  async playYou(side: Side, hooks: EntranceHooks, rest: CamPose): Promise<void> {
    this.cancelled = false;
    const s = startPosition(side);
    const fx = Math.sin(s.facing);
    const fz = Math.cos(s.facing);
    const rx = -fz;
    const rz = fx;
    const at = (f: number, r: number, y: number): [number, number, number] => [s.x + fx * f + rx * r, y, s.z + fz * f + rz * r];
    this.override = { side, dx: 0, dy: 9, dz: 0, special: 'landing', visible: true };
    this.later(0.45, () => this.drop(hooks, side));
    this.later(0.7, () => hooks.showCard(side));
    this.later(1.6, () => {
      if (this.override) this.override.special = null;
    });
    await this.playShots([
      { duration: 1.6, from: camPose(at(-2.4, 1.6, 0.5), at(0, 0, 1.0), 58, -0.18), to: camPose(at(-2.8, 1.2, 0.8), at(0, 0, 1.2), 60, -0.1), ease: linear },
      // Swing up behind the shoulder into the lock-on rig's resting pose.
      { duration: 1.2, from: camPose(at(-2.8, 1.2, 0.8), at(0, 0, 1.2), 60, -0.1), to: rest },
    ]);
    this.finish(hooks);
  }

  private drop(hooks: EntranceHooks, side: Side): void {
    if (this.cancelled || !this.override) return;
    const start = performance.now();
    const step = () => {
      if (this.cancelled || !this.override) return;
      const k = Math.min(1, (performance.now() - start) / 130);
      this.override.dx = this.override.dz = 0;
      this.override.dy = 6 * (1 - k * k);
      this.override.special = 'landing';
      if (k < 1) this.raf = requestAnimationFrame(step);
      else hooks.landed(side);
    };
    this.raf = requestAnimationFrame(step);
  }

  private later(seconds: number, fn: () => void): void {
    this.timers.push(setTimeout(() => !this.cancelled && fn(), seconds * 1000));
  }

  private finish(hooks: EntranceHooks): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    cancelAnimationFrame(this.raf);
    this.override = null;
    hooks.hideCard();
  }

  skip(hooks: EntranceHooks): void {
    this.cancelled = true;
    this.stopShots();
    this.finish(hooks);
  }
}
