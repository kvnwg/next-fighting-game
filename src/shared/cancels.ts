/**
 * The cancel table: what each kind of attack can be cut short into, and when. One place decides
 * it for the client's prediction, the server's authority and the bots alike.
 *
 * The hierarchy follows fighting-game convention: light < heavy < special. A move cancels into the
 * same tier or above in its recovery (lights chain into lights, lights into a heavy, heavies into
 * the next heavy), and the special only on contact (the attack hit or was blocked), so it has to
 * be hit-confirmed. Dodging and guarding out of an attack come later in its recovery the bigger
 * the attack is; finishers, air attacks and specials commit you.
 */
import { AttackKey, CharacterDef } from './characters';

export type CancelInto = 'light' | 'heavy' | 'special' | 'dodge' | 'guard' | 'jump';
export type MoveClass = 'light' | 'lightEnd' | 'heavy' | 'heavyEnd' | 'dash' | 'back' | 'air' | 'special' | 'ability';
export type Phase = 'windup' | 'active' | 'recovery';

export interface CancelWindow {
  phase: Phase;
  /** how far into the phase the window opens (0..1) */
  from?: number;
  /** only if this attack made contact (hit, armour, block or guard break) */
  onContact?: boolean;
}

const REC = (from = 0, onContact = false): CancelWindow => ({ phase: 'recovery', from, onContact });

export const CANCELS: Record<MoveClass, Partial<Record<CancelInto, CancelWindow>>> = {
  // the first lights: chain into the next light (not before half its recovery, so strings have a
  // rhythm rather than a blur), or a heavy, or (on contact) the special; dodge or jump out at once
  light: { light: REC(0.45), heavy: REC(0.3), special: REC(0, true), dodge: REC(), jump: REC(0.3), guard: REC(0.4) },
  // the last light ends the string: a heavy or the special can still follow
  lightEnd: { heavy: REC(), special: REC(0, true), dodge: REC(0.25), guard: REC(0.5) },
  // heavies chain into the next heavy; the special on contact; dodge from mid-recovery. A feintable
  // heavy can also be cancelled into guard in its windup (the feint, see Fighter.canFeint)
  heavy: { heavy: REC(0.45), special: REC(0, true), dodge: REC(0.4), guard: REC(0.55) },
  // the heavy finisher commits: only the special on contact, or a late dodge
  heavyEnd: { special: REC(0, true), dodge: REC(0.6), guard: REC(0.7) },
  // out of a dash: the light string carries on from its second hit, or a heavy
  dash: { light: REC(0.4), heavy: REC(0.3), special: REC(0, true), dodge: REC(0.4), guard: REC(0.5) },
  // retreating attacks: get further away, or turn it round into a heavy
  back: { heavy: REC(0.3), dodge: REC(), jump: REC(0.3), guard: REC(0.4) },
  // in the air a light can follow into the heavy plunge if it connected; nothing else until landing
  air: { heavy: { phase: 'recovery', onContact: true } },
  // the special and abilities commit you nearly to the end
  special: { dodge: REC(0.7), guard: REC(0.8) },
  ability: { dodge: REC(0.5), guard: REC(0.6) },
};

export function moveClass(key: AttackKey, char: CharacterDef): MoveClass {
  switch (key) {
    case 'h':
    case 'h1':
      return 'heavy';
    case 'h2':
      return 'heavyEnd';
    case 'dl':
    case 'dh':
      return 'dash';
    case 'bl':
    case 'bh':
      return 'back';
    case 'jl':
    case 'jh':
      return 'air';
    case 'sp':
      return 'special';
    case 'ab':
    case 'ia':
    case 'ct':
      return 'ability';
    default: {
      // l0, l1, l2...: the last of the string is its finisher
      const i = Number(key.slice(1));
      return i >= char.lights.length - 1 ? 'lightEnd' : 'light';
    }
  }
}

/** For the help screen: the cancel table in words. */
export const CANCEL_NAMES: Record<MoveClass, string> = {
  light: 'Lights',
  lightEnd: 'Last light',
  heavy: 'Heavies',
  heavyEnd: 'Heavy finisher',
  dash: 'Dash attacks',
  back: 'Backstep attacks',
  air: 'Air attacks',
  special: 'Special',
  ability: 'Abilities',
};
