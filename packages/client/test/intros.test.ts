import { ENTRANCE_MS, WEAPON_IDS } from '@nfg/shared';
import { describe, expect, it } from 'vitest';
import { entranceSeconds } from '../src/game/entrance.ts';
import { INTRO_SCRIPTS, checkIntroScripts } from '../src/game/intros.ts';

const at = (f: number, r: number, y: number): [number, number, number] => [r, y, f];

describe('ring entrances', () => {
  it('every fighter has a script whose shots fill its running time', () => {
    for (const id of WEAPON_IDS) expect(INTRO_SCRIPTS[id], id).toBeDefined();
    expect(checkIntroScripts(at)).toEqual([]);
  });

  it('every cue lands inside its script', () => {
    for (const [id, s] of Object.entries(INTRO_SCRIPTS)) {
      for (const [t] of s.cues) expect(t, id).toBeLessThanOrEqual(s.duration);
      expect(s.card, id).toBeLessThan(s.duration);
    }
  });

  it("both entrances finish inside the server's entrance window, whoever meets whom", () => {
    const window = (ENTRANCE_MS * 2) / 1000;
    for (const a of WEAPON_IDS) for (const b of WEAPON_IDS) expect(entranceSeconds(a, b), `${a} vs ${b}`).toBeLessThan(window - 0.5);
  });
});
