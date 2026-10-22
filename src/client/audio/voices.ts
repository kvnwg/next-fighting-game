/**
 * Per-fighter voices: a fighter's own swing, hit and clash sounds, matched to their reference
 * recording. A voice takes over whichever of these it defines; anything it leaves out falls back to
 * the shared recipes in recipes.ts. Each fighter's voice lives in voices/<id>.ts.
 */
import type { CharacterId } from '../../shared/characters';
import type { Profile } from './profiles';
import type { GuardOpts, HitOpts, SwingOpts } from './recipes';
import type { Out } from './synth';
import duelist from './voices/duelist';
import lancer from './voices/lancer';
import reaper from './voices/reaper';
import ronin from './voices/ronin';
import shade from './voices/shade';

export interface Voice {
  /** this fighter's swing through the air (the engine cuts its tail if the blow lands) */
  swing?(o: Out, p: Profile, s: SwingOpts): void;
  /** this fighter's weapon landing on `d` */
  hit?(o: Out, a: Profile, d: Profile, s: HitOpts): void;
  /** `a`'s blow stopped on this fighter's held guard (`d` is this fighter) */
  block?(o: Out, a: Profile, d: Profile, s: GuardOpts): void;
  /** this fighter (`d`) deflecting `a`'s blow */
  deflect?(o: Out, a: Profile, d: Profile, s: GuardOpts): void;
}

export const VOICES: Partial<Record<CharacterId, Voice>> = { ronin, duelist, lancer, shade, reaper };
