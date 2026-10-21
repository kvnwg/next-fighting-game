/** Constants shared by the Warden's two move files (greathammer.ts and greathammer-b.ts). */
import { B } from '../author';
import type { V3 } from '../author';

export const G2 = -0.33; // the left hand rides down by the pommel
// the guard: planted and waiting. The head rests face-down on the ground ahead of him and a little
// to his right; the haft angles up into both hands, low on his right, the left one on the pommel.
// (The rig scales torso space 1.6x for the Warden but not the hammer: 1.23 m to the head's far
// end, which the renderer keeps 0.22 m off the floor so the face just touches it.)
export const GUARD_AT: V3 = [-0.14, 0.14, 0.34];
export const GUARD_DIR: V3 = [-0.1, -0.6, 0.79];
/** the head's striking face down on the floor */
export const GUARD_EDGE: V3 = [0.075, -0.8, -0.59];
export const GUARD_G2 = -0.3;
export const body = B({ front: 'L', step: 0.26, back: 0.26, width: 0.17, crouch: -0.11, lean: 0.1, twist: -0.22 });
