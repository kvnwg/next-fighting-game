/** Computer-run fighters pass as players: names from the list, never "AI" or "Bot". */
import { describe, expect, it } from 'vitest';
import { Game, sanitizeName } from '../src/server/game';
import { Store } from '../src/server/store';
import { PLAYER_NAMES } from '../src/shared/names';
import { PROTOCOL_VERSION, ServerMsg } from '../src/shared/protocol';

describe('player names', () => {
  it('has 500 distinct names, each one a valid player name', () => {
    expect(PLAYER_NAMES.length).toBe(500);
    expect(new Set(PLAYER_NAMES.map((n) => n.toLowerCase())).size).toBe(500);
    for (const n of PLAYER_NAMES) expect(sanitizeName(n)).toBe(n);
  });

  it('gives the wanderers and opponents names like players, and a wanderer takes a challenge', () => {
    let t = 1000;
    const game = new Game(new Store(null), () => t, { roamers: 4, selectTime: 200 });
    const inbox: ServerMsg[] = [];
    const on: Record<string, (d?: unknown) => void> = {};
    const ws = { readyState: 1, send: (d: string) => inbox.push(JSON.parse(d)), close() {}, on: (ev: string, cb: (d?: unknown) => void) => (on[ev] = cb) };
    game.handleConnection(ws as never);
    on.message!(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name: 'Me', char: 'ronin' }));
    const roamers = [...game.lobby.fighters.values()].filter((f) => f.id.startsWith('roamer-'));
    expect(roamers.length).toBe(4);
    for (const r of roamers) {
      expect(PLAYER_NAMES).toContain(r.name);
      expect(r.name).not.toMatch(/\bAI\b|\bBot\b/);
      // a rank on their plate like anyone's
      expect(r.roster().mmr).toBeGreaterThan(0);
    }
    // challenge one: a moment later, a match against it under its own name (or a polite no)
    const target = roamers[0];
    for (let tries = 0; tries < 20 && !inbox.some((m) => m.t === 'select'); tries++) {
      on.message!(JSON.stringify({ t: 'challenge', target: target.id }));
      for (let i = 0; i < 300; i++) {
        t += 1000 / 60;
        game.tick();
      }
    }
    const sel = inbox.find((m): m is Extract<ServerMsg, { t: 'select' }> => m.t === 'select')!;
    expect(sel.sides[1].name).toBe(target.name);
    expect(sel.sides[1].char).toBe(target.char.id);
    // and in the match they're the same player: the same rank on their plate as in the lobby
    for (let i = 0; i < 30; i++) {
      t += 1000 / 60;
      game.tick();
    }
    const enter = inbox.find((m): m is Extract<ServerMsg, { t: 'enter' }> => m.t === 'enter' && m.kind === 'arena')!;
    const them = enter.roster.find((r) => r.name === target.name)!;
    expect(them.mmr).toBe(target.rating);
  });
});
