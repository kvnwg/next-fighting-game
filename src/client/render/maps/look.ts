/** A map's lighting mood and the context its scenery recipe builds into. */
import * as THREE from 'three';
import { MapDef, PropKind } from '../../../shared/maps';
import { Quality } from '../gfx/quality';
import { CloudOptions } from '../gfx/sky';
import { GrassOptions } from '../gfx/grass';
import { ParticleOptions } from '../gfx/particles';
import { TreePlacement } from '../gfx/trees';
import { PropStyle, SceneryKind } from '../gfx/voxprops';
import { WaterOptions } from '../gfx/water';

export interface Look {
  sky: {
    zenith: string;
    horizon: string;
    band?: string;
    bandAmount?: number;
    below?: string;
    night?: boolean;
    glow?: number;
    discSize?: number;
    /** no sky at all (caverns) */
    none?: boolean;
  };
  /** direction toward the light (sun or moon), its colour and strength */
  light: { dir: [number, number, number]; color: string; intensity: number };
  /** where the sun/moon disc is drawn, if not along the light */
  disc?: [number, number, number];
  hemi: { sky: string; ground: string; intensity: number };
  fog: { color: string; sun: string; density: number; falloff: number; base?: number; glow?: number };
  grade?: { exposure?: number; contrast?: number; saturation?: number; vignette?: number; bloom?: number; bloomThreshold?: number; rays?: number; lift?: string; gain?: string; rayColor?: string };
  wind?: { dir: [number, number]; strength: number; gust: number };
  rim?: { color: string; strength: number };
  clouds?: Omit<CloudOptions, 'seed'>[];
  /** lanterns and braziers cast light */
  lit?: boolean;
  /** half-size of the sun's shadow box */
  shadowExtent?: number;
}

export interface PropPlacement {
  kind: PropKind | SceneryKind;
  x: number;
  z: number;
  y?: number;
  rot?: number;
  s?: number;
  style?: PropStyle;
  variant?: number;
}

export interface BuildContext {
  map: MapDef;
  group: THREE.Group;
  quality: Quality;
  look: Look;
  /** voxel trees (instanced), into the map or a moving group (`into`) */
  trees(list: TreePlacement[], opts?: { shadows?: boolean; detail?: number; into?: THREE.Object3D }): void;
  /** voxel props (instanced) */
  props(list: PropPlacement[], into?: THREE.Object3D): void;
  grass(o: GrassOptions): void;
  /** ambient particles; falling kinds follow the camera unless `anchored` (e.g. petals under one tree) */
  particles(o: Omit<ParticleOptions, 'ambient'> & { anchored?: boolean }): void;
  water(o: Omit<WaterOptions, 'reflections' | 'skyHorizon' | 'skyZenith' | 'ambient'>): void;
  /** a point light, if the budget allows */
  light(x: number, y: number, z: number, color: string, intensity: number, distance: number): void;
  animate(fn: (t: number, dt: number) => void): void;
  /** spots already used by props and scenery, so scatter() avoids them */
  taken: { x: number; z: number; r: number }[];
}

export interface MapRecipe {
  look: Look;
  /** weathering on gameplay props: moss, snow, soot */
  propStyle: PropStyle;
  /** which tree the map's 'pine' props become (snowy on the summit) */
  pine?: 'pine' | 'snowPine';
  build(ctx: BuildContext): void;
}
