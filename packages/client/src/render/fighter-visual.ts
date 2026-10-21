import { CanvasTexture, CircleGeometry, Mesh, MeshBasicMaterial, Vector3, type Scene } from 'three';
import { WEAPONS, type FighterState, type MoveId, type WeaponId } from '@nfg/shared';
import { makeGhostMaterial } from './rig.ts';
import { VoxelRig } from './voxel/rig.ts';
import { POSE_SIZE, computePose, smoothPose, type FighterView, type Pose } from './poses.ts';
import { WeaponTrail } from './vfx.ts';

/** Everything the renderer needs about one fighter for one frame. */
export interface FighterRenderState {
  x: number;
  y: number;
  z: number;
  facing: number;
  weapon: WeaponId;
  state: FighterState;
  /** Fractional frame within the state (interpolated between sim ticks). */
  frame: number;
  move: MoveId | null;
  moveX: number;
  moveY: number;
  dodgeX: number;
  dodgeZ: number;
  rollDir: number;
  glowing: boolean;
  invulnerable: boolean;
  parryWindow: boolean;
}

interface Ghost {
  rig: VoxelRig;
  material: MeshBasicMaterial;
  t: number;
  active: boolean;
}

const GHOST_LIFE = 0.26;
const STRIDE = 1.05;

let shadowTex: CanvasTexture | null = null;
function shadowTexture(): CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  shadowTex = new CanvasTexture(c);
  return shadowTex;
}

export class FighterVisual {
  readonly rig: VoxelRig;
  private readonly current: Pose = new Float32Array(POSE_SIZE);
  private readonly target: Pose = new Float32Array(POSE_SIZE);
  private readonly shadow: Mesh;
  private readonly trail: WeaponTrail;
  private readonly ghosts: Ghost[] = [];
  private walkPhase = 0;
  private lastX = 0;
  private lastZ = 0;
  private time = 0;
  private ghostTimer = 0;
  private tint = 0;
  private tintDecay = 6;
  private tintColor: [number, number, number] = [1, 0.15, 0.1];
  private initialized = false;
  special: FighterView['special'] = null;
  /** Keeps charged weapon effects lit regardless of state, for cinematics. */
  charged = false;
  readonly bladeTip = new Vector3();
  private readonly bladeBase = new Vector3();

  constructor(
    private readonly scene: Scene,
    weapon: WeaponId,
    lookIndex: number,
    ghostCount: number,
  ) {
    this.rig = new VoxelRig(weapon);
    scene.add(this.rig.root);
    this.shadow = new Mesh(new CircleGeometry(0.75, 20), new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);
    this.trail = new WeaponTrail(scene);
    for (let i = 0; i < ghostCount; i++) {
      const material = makeGhostMaterial(lookIndex === 0 ? 0xfff2b0 : 0xf3d2ff);
      const rig = new VoxelRig(weapon, { ghost: material });
      rig.root.visible = false;
      scene.add(rig.root);
      this.ghosts.push({ rig, material, t: 0, active: false });
    }
  }

  /** Fighters stay hidden until their entrance, since they arrive by leaping in. */
  setVisible(visible: boolean): void {
    this.rig.root.visible = visible;
    this.shadow.visible = visible;
  }

  /** Short color flash over the whole body (red hit, orange parried, etc.). */
  flashTint(r: number, g: number, b: number, strength = 1, seconds = 0.15): void {
    this.tintColor = [r, g, b];
    this.tint = Math.max(this.tint, strength);
    this.tintDecay = strength / Math.max(0.05, seconds);
  }

  update(s: FighterRenderState, dt: number, frozen: boolean): void {
    this.time += dt;
    const root = this.rig.root;
    root.position.set(s.x, s.y, s.z);
    root.rotation.y = s.facing;

    if (!this.initialized) {
      this.lastX = s.x;
      this.lastZ = s.z;
    }
    const moved = Math.hypot(s.x - this.lastX, s.z - this.lastZ);
    this.lastX = s.x;
    this.lastZ = s.z;
    this.walkPhase += (moved / STRIDE) * Math.PI * 2;

    const fx = Math.sin(s.facing);
    const fz = Math.cos(s.facing);
    const view: FighterView = {
      weapon: s.weapon,
      state: s.state,
      frame: s.frame,
      move: s.move,
      moveX: s.moveX,
      moveY: s.moveY,
      dodgeX: s.dodgeX * -fz + s.dodgeZ * fx,
      dodgeY: s.dodgeX * fx + s.dodgeZ * fz,
      rollDir: s.rollDir,
      y: s.y,
      time: this.time,
      walkPhase: this.walkPhase,
      special: this.special,
    };
    computePose(view, this.target);

    if (!this.initialized) {
      this.current.set(this.target);
      this.initialized = true;
    } else if (!frozen) {
      smoothPose(this.current, this.target, this.blendRate(s, dt));
    }
    this.rig.applyPose(this.current);

    // Lightning and similar effects crackle along the weapon during heavy and critical swings.
    const swing = s.state === 'attack' && s.move ? WEAPONS[s.weapon].moves[s.move] : null;
    this.rig.setCharged(this.charged || (!!swing && swing.kind !== 'light'), this.time);

    // Rim light: white glow on criticals, a ghostly rim during i-frames, a faint gold edge in a parry window.
    if (s.glowing) this.rig.setRim(0.85 + Math.sin(this.time * 40) * 0.15, 1, 1, 1);
    else if (s.invulnerable && s.state === 'dodge') this.rig.setRim(0.55, 0.85, 0.92, 1);
    else if (s.parryWindow) this.rig.setRim(0.3, 1, 0.82, 0.35);
    else this.rig.setRim(0);

    if (!frozen) this.tint = Math.max(0, this.tint - this.tintDecay * dt);
    this.rig.setTint(Math.min(1, this.tint), ...this.tintColor);

    this.shadow.position.set(s.x, 0.02, s.z);
    this.shadow.scale.setScalar(Math.max(0.5, 1 - s.y * 0.2));

    this.rig.root.updateMatrixWorld(true);
    this.rig.bladeBase.getWorldPosition(this.bladeBase);
    this.rig.bladeTip.getWorldPosition(this.bladeTip);
    this.trail.sample(this.bladeBase, this.bladeTip, this.trailOn(s), dt);

    this.updateGhosts(s, dt);
  }

  private blendRate(s: FighterRenderState, dt: number): number {
    if (s.state === 'attack' && s.move) {
      const m = WEAPONS[s.weapon].moves[s.move];
      // Snap through the active frames so swings read as a sudden release.
      if (s.frame >= m.startup - 1 && s.frame <= m.startup + m.active + 1) return 0.85;
      return 1 - Math.exp(-dt * 30);
    }
    if (s.state === 'hitstun' || s.state === 'guardbreak' || s.state === 'stagger' || s.state === 'parry') return 1 - Math.exp(-dt * 30);
    return 1 - Math.exp(-dt * 15);
  }

  private trailOn(s: FighterRenderState): boolean {
    if (s.state !== 'attack' || !s.move) return false;
    const m = WEAPONS[s.weapon].moves[s.move];
    return s.frame >= m.startup - 1 && s.frame <= m.startup + m.active + 2;
  }

  private updateGhosts(s: FighterRenderState, dt: number): void {
    const wantGhost =
      (s.state === 'dodge' && s.frame < 15) || (s.state === 'attack' && !!s.move && WEAPONS[s.weapon].moves[s.move].lands) || (s.state === 'getup' && s.rollDir !== 0 && s.frame < 14);
    this.ghostTimer -= dt;
    if (wantGhost && this.ghostTimer <= 0 && this.ghosts.length > 0) {
      this.ghostTimer = 0.045;
      const g = this.ghosts.find((x) => !x.active) ?? this.ghosts[0]!;
      g.active = true;
      g.t = 0;
      g.rig.root.visible = true;
      g.rig.root.position.copy(this.rig.root.position);
      g.rig.root.rotation.y = this.rig.root.rotation.y;
      g.rig.applyPose(this.current);
    }
    for (const g of this.ghosts) {
      if (!g.active) continue;
      g.t += dt;
      g.material.opacity = Math.max(0, 0.38 * (1 - g.t / GHOST_LIFE));
      if (g.t >= GHOST_LIFE) {
        g.active = false;
        g.rig.root.visible = false;
      }
    }
  }

  dispose(): void {
    this.scene.remove(this.rig.root, this.shadow, this.trail.mesh);
    for (const g of this.ghosts) this.scene.remove(g.rig.root);
  }
}
