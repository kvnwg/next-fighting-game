// Types for the plain-JS voxel models, so the TypeScript game client can import them.

export type Vec3 = [number, number, number];

export interface VoxelBone {
  name: string;
  parent: string | null;
  /** Rest-pose pivot in voxel units (Y up, facing +Z, +X is the character's left). */
  pivot: Vec3;
  opacity?: number;
  emissive?: boolean;
}

export interface Voxel {
  x: number;
  y: number;
  z: number;
  color: string;
  bone: string;
}

export interface VoxelModel {
  palette: Record<string, string>;
  bones: VoxelBone[];
  voxels: Voxel[];
  bounds: { min: Vec3; max: Vec3 };
}

export type VoxelPoses = Record<string, Record<string, Vec3>>;
