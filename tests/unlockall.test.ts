/** The test build (published on Claude): every fighter and arena unlocked, coins to spare. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/server/game';
import { Store } from '../src/server/store';
import { CHARACTER_IDS } from '../src/shared/characters';
import { ARENA_MAPS } from '../src/shared/maps';
import { PROTOCOL_VERSION, ServerMsg } from '../src/shared/protocol';

function welcome(unlockAll: boolean, char: string) {
  const game = new Game(new Store(null), () => 1000, { unlockAll });
  const inbox: ServerMsg[] = [];
  const on: Record<string, (d?: unknown) => void> = {};
  const ws = { readyState: 1, send: (d: string) => inbox.push(JSON.parse(d)), close() {}, on: (ev: string, cb: (d?: unknown) => void) => (on[ev] = cb) };
  game.handleConnection(ws as never);
  on.message!(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name: 'Tester', char }));
  const w = inbox.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
  return { profile: game.store.byTokenOrNull(w.token)!, player: game.players.get(w.id)! };
}

describe('unlock all', () => {
  it('gives a test build every fighter, every arena and coins', () => {
    const { profile, player } = welcome(true, 'juggernaut');
    expect([...profile.chars].sort()).toEqual([...CHARACTER_IDS].sort());
    expect([...profile.maps].sort()).toEqual(ARENA_MAPS.map((m) => m.id).sort());
    expect(profile.coins).toBeGreaterThanOrEqual(99_999);
    // a premium fighter can be picked straight away
    expect(player.charId).toBe('juggernaut');
  });

  it('leaves the real builds to earn them', () => {
    const { profile, player } = welcome(false, 'juggernaut');
    expect(profile.chars).toEqual(['ronin']);
    expect(player.charId).toBe('ronin');
  });
});
