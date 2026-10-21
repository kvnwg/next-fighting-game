/**
 * The moveset registry: one Style per weapon (each character fights with their own weapon), each
 * with a move authored for every attack key. The vocabulary lives in ./author.ts and each
 * character's moves in ./moves/.
 */
import { AttackAnim, WeaponKind } from '../../../shared/characters';
import { MoveDef, Style } from './author';
import { gauntlets } from './moves/gauntlets';
import { greathammer } from './moves/greathammer';
import { katana } from './moves/katana';
import { LEGACY } from './moves/legacy';
import { rapier } from './moves/rapier';
import { swordShield } from './moves/swordShield';

export { KATANA_SHEATH, KATANA_SHEATH_MOUTH } from './moves/katana';
export type { BodyPose, Motion, MoveDef, Pose, Style, WeaponXf } from './author';
export { bodyToTorso } from './author';

export const STYLES: Record<WeaponKind, Style> = {
  katana,
  greathammer,
  rapier,
  spear: LEGACY.spear,
  daggers: LEGACY.daggers,
  scythe: LEGACY.scythe,
  gauntlets,
  swordShield,
};

/** The move for an attack key (every style authors one per key; the first light is the fallback). */
export function moveFor(style: Style, _anim: AttackAnim, key: string): MoveDef {
  return style.moves[key] ?? style.moves.l0 ?? Object.values(style.moves)[0]!;
}
