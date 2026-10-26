/** The mix: each sound family's level, balanced from offline renders (peak/RMS per sound). */
export const LEVEL = {
  swing: 0.55,
  // blows landing (cuts, punches, hammers, blocks, parries) sit well over everything else
  hit: 1.5,
  block: 1.05,
  // the deflect rings out over everything (see recipes deflectRing)
  deflect: 1.55,
  guardBreak: 1.25,
  posture: 0.9,
  windup: 0.5,
  // an execution's lead-in and finishing blow: as loud as the deflect's clang, or louder
  finish: 1.6,
  step: 0.5,
  dodge: 0.55,
  cue: 0.75,
  death: 0.45,
  ui: 0.8,
  legacy: 0.7,
};

/** Reverb send per family: parries hang in the air, footsteps barely touch the room. */
export const WET = { swing: 0.12, hit: 0.18, block: 0.18, deflect: 0.55, big: 0.4, step: 0.05, finish: 0.55 };

/**
 * An execution's flourish strikes, on top of a hit's level: each fighter's brought up to the
 * deflect's clang (measured offline; the Warden's and the Monk's already land that hard).
 */
export const EXEC_BLOW: Record<string, number> = { ronin: 1.3, juggernaut: 1, duelist: 1.75, lancer: 1.3, shade: 1.75, reaper: 1.75, monk: 1, paladin: 1.15 };
