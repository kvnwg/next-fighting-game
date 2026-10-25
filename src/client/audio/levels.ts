/** The mix: each sound family's level, balanced from offline renders (peak/RMS per sound). */
export const LEVEL = {
  swing: 0.55,
  hit: 0.9,
  block: 0.75,
  deflect: 0.95,
  guardBreak: 0.9,
  posture: 0.7,
  windup: 0.5,
  finish: 1.0,
  step: 0.5,
  dodge: 0.55,
  cue: 0.75,
  death: 0.45,
  ui: 0.8,
  legacy: 0.7,
};

/** Reverb send per family: parries hang in the air, footsteps barely touch the room. */
export const WET = { swing: 0.12, hit: 0.18, block: 0.18, deflect: 0.45, big: 0.4, step: 0.05, finish: 0.55 };
