import { startPosition, type FighterState, type MoveId, type Side, type WeaponId } from '@nfg/shared';
import type { Camera, Fog, Scene, WebGLRenderer } from 'three';
import type { SfxName } from '../audio/engine.ts';
import type { CamPose, ShakeKind, Shot } from '../render/camera.ts';
import type { FighterVisual } from '../render/fighter-visual.ts';
import type { FighterView, Pose } from '../render/poses.ts';
import type { Vfx } from '../render/vfx.ts';
import type { IntroScreen } from '../ui/intro-screen.ts';
import { INTRO_SCRIPTS } from './intros.ts';

/** Per-frame overrides the app applies to a fighter while its entrance plays. */
export interface EntranceOverride {
  side: Side;
  dx: number;
  dy: number;
  dz: number;
  /** Added to the fighter's starting facing. */
  yaw: number;
  special: FighterView['special'];
  /** A cinematic pose in place of the state's own. */
  pose: Pose | null;
  /** Plays a state's animation instead (a walk-in, a swing scrubbed by frame). */
  anim: { state: FighterState; move: MoveId | null; frame: number; moveY: number } | null;
  visible: boolean;
}

export interface EntranceHooks {
  showCard(side: Side): void;
  hideCard(): void;
}

/** What an intro script can drive besides its own fighter. */
export interface StageDeps {
  vfx: Vfx;
  camera: Camera;
  screen: IntroScreen;
  renderer: WebGLRenderer;
  scene: Scene;
  sfx(name: SfxName, x: number, y: number, z: number): void;
  /** Screen position of a world point in CSS pixels, or null behind the camera. */
  project(x: number, y: number, z: number): { x: number; y: number } | null;
  shake(kind: ShakeKind): void;
  duckMusic(db: number, seconds: number): void;
  visual(side: Side): FighterVisual | null;
  weapon(side: Side): WeaponId;
}

type Vec = [number, number, number];
/** A world point in a fighter's frame: `f` forward from their mark, `r` to their right, `y` up. */
export type At = (f: number, r: number, y: number) => Vec;

/** The fighter as an intro script places it each frame, in its own frame of reference. */
export interface Actor {
  f: number;
  r: number;
  y: number;
  yaw: number;
  visible: boolean;
  pose: Pose | null;
  special: FighterView['special'];
  /** Walk cycle intensity while the script moves the fighter (0 stands still). */
  walk: number;
  /** A move from the fighter's moveset, scrubbed to `frame`. */
  move: MoveId | null;
  frame: number;
}

export interface Stage {
  side: Side;
  at: At;
  pt(f: number, r: number, y: number): { x: number; y: number; z: number };
  sfx(name: SfxName, f?: number, r?: number, y?: number): void;
  project(f: number, r: number, y: number): { x: number; y: number } | null;
  vfx: Vfx;
  camera: Camera;
  screen: IntroScreen;
  shake(kind: ShakeKind): void;
  /** Eases the scene exposure (1 is normal) over `seconds`. */
  exposure(k: number, seconds: number): void;
  /** Eases the fog distance (1 is normal, below 1 pulls the fog in). */
  fog(k: number, seconds: number): void;
  visual: FighterVisual | null;
  /** Puts the name card up. */
  card(): void;
}

export interface IntroScript {
  duration: number;
  /** Start of the closing beat, a shot boundary: your own entrance plays from here to the end. */
  finale: number;
  /** When the name card goes up; at or after `finale`. */
  card: number;
  /** Fighters who start with the blade sheathed draw it at this time. */
  draw?: number;
  shots(at: At): Shot[];
  cues: [number, (s: Stage) => void][];
  /** Places the fighter for time `t`; also the place for continuous effects. */
  update(t: number, dt: number, a: Actor, s: Stage): void;
}

const BASE_EXPOSURE = 1.05;

/** How long the opponent's full intro and your shorter one take, for the server's entrance window. */
export function entranceSeconds(opponent: WeaponId, you: WeaponId, settle = SETTLE_SECONDS): number {
  const a = INTRO_SCRIPTS[opponent];
  const b = INTRO_SCRIPTS[you];
  return a.duration + (b.duration - b.finale) + settle;
}

/** Swing from your intro's last shot into the lock-on rest pose. */
const SETTLE_SECONDS = 1.2;

/**
 * Plays each fighter's ring entrance (characters/intros.js, scripted in intros.ts): the
 * opponent's in full, then the closing beat of yours, ending on the lock-on camera.
 */
export class EntranceDirector {
  override: EntranceOverride | null = null;
  private raf = 0;
  private cancelled = false;
  private run: { visual: FighterVisual | null; fog: Fog | null; fogBase: [number, number] } | null = null;

  constructor(
    private readonly playShots: (shots: Shot[]) => Promise<void>,
    private readonly stopShots: () => void,
    private readonly deps: StageDeps,
  ) {}

  /** Opponent's entrance, the whole script (about 10 s). */
  async playOpponent(side: Side, hooks: EntranceHooks): Promise<void> {
    const script = INTRO_SCRIPTS[this.deps.weapon(side)];
    this.deps.duckMusic(9, script.duration - 0.5);
    await this.play(side, hooks, script, 0, null);
  }

  /** Your own entrance: the closing beat of your script, ending on `rest` so the lock-on camera takes over without a cut. */
  async playYou(side: Side, hooks: EntranceHooks, rest: CamPose): Promise<void> {
    const script = INTRO_SCRIPTS[this.deps.weapon(side)];
    await this.play(side, hooks, script, script.finale, rest);
  }

  private async play(side: Side, hooks: EntranceHooks, script: IntroScript, from: number, rest: CamPose | null): Promise<void> {
    this.cancelled = false;
    const s0 = startPosition(side);
    const fx = Math.sin(s0.facing);
    const fz = Math.cos(s0.facing);
    // The fighter's right.
    const rx = -fz;
    const rz = fx;
    const at: At = (f, r, y) => [s0.x + fx * f + rx * r, y, s0.z + fz * f + rz * r];
    const deps = this.deps;
    const visual = deps.visual(side);
    const fog = deps.scene.fog && 'near' in deps.scene.fog ? (deps.scene.fog as Fog) : null;
    this.run = { visual, fog, fogBase: fog ? [fog.near, fog.far] : [0, 0] };
    deps.screen.mount();
    deps.screen.bars(true);

    // Eased environment values.
    const tweens = { exposure: { v: 1, from: 1, to: 1, t: 0, dur: 0 }, fog: { v: 1, from: 1, to: 1, t: 0, dur: 0 } };
    const ease = (tw: (typeof tweens)['fog'], k: number, seconds: number) => {
      Object.assign(tw, { from: tw.v, to: k, t: 0, dur: Math.max(0.001, seconds) });
    };
    let cardShown = false;
    const stage: Stage = {
      side,
      at,
      pt: (f, r, y) => {
        const [x, yy, z] = at(f, r, y);
        return { x, y: yy, z };
      },
      sfx: (name, f = 0, r = 0, y = 1) => deps.sfx(name, ...at(f, r, y)),
      project: (f, r, y) => deps.project(...at(f, r, y)),
      vfx: deps.vfx,
      camera: deps.camera,
      screen: deps.screen,
      shake: (k) => deps.shake(k),
      exposure: (k, seconds) => ease(tweens.exposure, k, seconds),
      fog: (k, seconds) => ease(tweens.fog, k, seconds),
      visual,
      card: () => {
        if (cardShown) return;
        cardShown = true;
        hooks.showCard(side);
      },
    };

    const actor: Actor = { f: 0, r: 0, y: 0, yaw: 0, visible: true, pose: null, special: null, walk: 0, move: null, frame: 0 };
    this.override = { side, dx: 0, dy: 0, dz: 0, yaw: 0, special: null, pose: null, anim: null, visible: true };
    const cues = script.cues.filter(([t]) => t >= from).sort((a, b) => a[0] - b[0]);
    let next = 0;
    const start = performance.now();
    let last = start;
    const step = () => {
      if (this.cancelled || !this.override) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = from + (now - start) / 1000;
      while (next < cues.length && cues[next]![0] <= t) cues[next++]![1](stage);
      if (t >= script.card) stage.card();

      for (const tw of [tweens.exposure, tweens.fog]) {
        tw.t += dt;
        const k = Math.min(1, tw.t / tw.dur);
        tw.v = tw.from + (tw.to - tw.from) * (k * k * (3 - 2 * k));
      }
      deps.renderer.toneMappingExposure = BASE_EXPOSURE * tweens.exposure.v;
      const run = this.run;
      if (run?.fog) {
        run.fog.near = run.fogBase[0] * tweens.fog.v;
        run.fog.far = Math.max(run.fog.near + 1, run.fogBase[1] * tweens.fog.v);
      }

      Object.assign(actor, { f: 0, r: 0, y: 0, yaw: 0, visible: true, pose: null, special: null, walk: 0, move: null, frame: 0 });
      script.update(Math.min(t, script.duration), dt, actor, stage);
      if (visual && script.draw !== undefined) visual.rig.setSheathed(t < script.draw);
      const o = this.override;
      const [x, , z] = at(actor.f, actor.r, 0);
      o.dx = x - s0.x;
      o.dz = z - s0.z;
      o.dy = actor.y;
      o.yaw = actor.yaw;
      o.visible = actor.visible;
      o.pose = actor.pose;
      o.special = actor.special;
      o.anim = actor.move
        ? { state: 'attack', move: actor.move, frame: actor.frame, moveY: 0 }
        : actor.walk
          ? { state: 'idle', move: null, frame: 0, moveY: actor.walk }
          : null;
      this.raf = requestAnimationFrame(step);
    };
    step();

    const shots = trimShots(script.shots(at), from);
    if (rest) shots.push({ duration: SETTLE_SECONDS, from: shots[shots.length - 1]!.to, to: rest });
    await this.playShots(shots);
    this.finish(hooks);
  }

  private finish(hooks: EntranceHooks): void {
    cancelAnimationFrame(this.raf);
    this.override = null;
    const run = this.run;
    if (run) {
      if (run.visual) {
        run.visual.charged = false;
        run.visual.pose = null;
        run.visual.rig.setSheathed(false);
      }
      if (run.fog) [run.fog.near, run.fog.far] = run.fogBase;
    }
    this.run = null;
    this.deps.renderer.toneMappingExposure = BASE_EXPOSURE;
    this.deps.screen.clear();
    hooks.hideCard();
  }

  skip(hooks: EntranceHooks): void {
    this.cancelled = true;
    this.stopShots();
    this.finish(hooks);
  }
}

/** The shots from `from` seconds on; `from` must fall on a shot boundary. */
function trimShots(shots: Shot[], from: number): Shot[] {
  let t = 0;
  const out: Shot[] = [];
  for (const s of shots) {
    if (t >= from - 1e-3) out.push(s);
    t += s.duration;
  }
  return out;
}
