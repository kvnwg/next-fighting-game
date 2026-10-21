import { ACESFilmicToneMapping, SRGBColorSpace, Scene, Vector3, WebGLRenderer } from 'three';
import type { MapId, Side, WeaponId } from '@nfg/shared';
import { ResolutionGovernor, type Quality } from '../platform/device.ts';
import { buildArena, type Arena } from '../render/arena.ts';
import { LockOnCamera } from '../render/camera.ts';
import { FighterVisual } from '../render/fighter-visual.ts';
import { Vfx } from '../render/vfx.ts';

const tmp = new Vector3();

/** Owns the renderer, scene, arena, fighters and effects. */
export class World {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly cam: LockOnCamera;
  readonly vfx: Vfx;
  visuals: [FighterVisual, FighterVisual] | null = null;
  mapId: MapId | null = null;
  private arena: Arena | null = null;
  private readonly governor = new ResolutionGovernor();
  private resScale = 1;

  constructor(
    canvas: HTMLCanvasElement,
    readonly quality: Quality,
    readonly mobile: boolean,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.cam = new LockOnCamera(window.innerWidth / window.innerHeight);
    this.cam.mobile = mobile;
    this.cam.baseFov = mobile ? 77 : 72;
    this.vfx = new Vfx(this.scene, quality.particles);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.dprCap) * this.resScale);
    this.renderer.setSize(w, h, false);
    this.cam.setAspect(w / h);
    this.vfx.setViewport(h);
  }

  setMap(id: MapId): void {
    if (this.mapId === id && this.arena) return;
    this.arena?.dispose();
    this.arena = buildArena(this.scene, id, this.quality);
    this.cam.pillars = this.arena.pillars;
    this.mapId = id;
  }

  /** Rebuilds both fighters. The local player always wears the first look. */
  setFighters(weapons: [WeaponId, WeaponId], you: Side): void {
    this.visuals?.forEach((v) => v.dispose());
    const ghosts = this.quality.afterimages ? (this.mobile ? 3 : 6) : 0;
    this.visuals = [
      new FighterVisual(this.scene, weapons[0], you === 0 ? 0 : 1, ghosts),
      new FighterVisual(this.scene, weapons[1], you === 1 ? 0 : 1, ghosts),
    ];
    const them = you === 0 ? 1 : 0;
    this.cam.sizes = [this.visuals[you].rig.size, this.visuals[them].rig.size];
  }

  /** Screen position (CSS pixels) of a world point, or null if it is behind the camera. */
  project(x: number, y: number, z: number): { x: number; y: number } | null {
    tmp.set(x, y, z).project(this.cam.camera);
    if (tmp.z > 1) return null;
    return { x: ((tmp.x + 1) / 2) * window.innerWidth, y: ((1 - tmp.y) / 2) * window.innerHeight };
  }

  /** Stereo position (-1..1) of a world point relative to the camera. */
  pan(x: number, y: number, z: number): number {
    tmp.set(x, y, z).applyMatrix4(this.cam.camera.matrixWorldInverse);
    return Math.max(-1, Math.min(1, (tmp.x / (Math.abs(tmp.z) + 1.5)) * 0.9));
  }

  render(dt: number): void {
    this.arena?.update(dt);
    this.vfx.update(dt);
    const scale = this.governor.update(dt);
    if (Math.abs(scale - this.resScale) > 0.01) {
      this.resScale = scale;
      this.resize();
    }
    this.renderer.render(this.scene, this.cam.camera);
  }
}
