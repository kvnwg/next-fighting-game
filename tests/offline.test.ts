/** Single-player mode: the server runs in the browser with AI-filled lobby and rated AI matches. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/server/game';
import { Player } from '../src/server/entities';
import { Store } from '../src/server/store';
import { ServerMsg } from '../src/shared/protocol';
import { PLACEMENT_MATCHES } from '../src/shared/ranks';
import { MATCH } from '../src/shared/config';

describe('offline mode', () => {
  it('fills the lobby with roaming AI and matches ranked against a rated AI', () => {
    let t = 1000;
    const game = new Game(new Store(null), () => t, { offline: true, roamers: 3 });
    const inbox: ServerMsg[] = [];
    const ws = { readyState: 1, send: (d: string) => inbox.push(JSON.parse(d)), close() {}, on() {} };
    const p = new Player(ws as never, game.store.create('Solo'), 'ronin');
    // a second arena and the Monk bought, so there's a choice to vote on
    p.profile.maps.push('bamboo');
    p.profile.chars.push('monk');
    game.lobby.addPlayer(p, game.lobby.spawnPoint());
    const roamers = [...game.lobby.fighters.values()].filter((f) => f.id.startsWith('roamer-'));
    expect(roamers).toHaveLength(3);
    const start = roamers.map((f) => ({ x: f.x, z: f.z }));

    const step = (ms: number) => {
      const end = t + ms;
      while (t < end) {
        t += 1000 / 60;
        game.tick();
      }
    };
    step(4000);
    expect(roamers.some((f, i) => Math.hypot(f.x - start[i].x, f.z - start[i].z) > 1)).toBe(true);

    // queue ranked: an AI opponent with a rating near ours shows up, after the map and fighter select
    (game as unknown as { enqueue(p: Player, m: 'ranked'): void }).enqueue(p, 'ranked');
    step(4500);
    const select = inbox.find((m) => m.t === 'select') as Extract<ServerMsg, { t: 'select' }>;
    expect(select).toBeTruthy();
    expect(select.maps.length).toBeGreaterThan(1);
    expect(select.sides[1].bot).toBe(true);
    // pick a fighter and an arena; the match uses them
    (game as unknown as { handle(p: Player, m: unknown): void }).handle(p, { t: 'vote', char: 'monk', map: select.maps[0] });
    step(MATCH.selectTime + 500);
    const enter = inbox.find((m) => m.t === 'enter' && m.kind === 'arena') as Extract<ServerMsg, { t: 'enter' }>;
    expect(enter).toBeTruthy();
    // differing votes are a coin flip between the two picks, like the reference
    const last = inbox.filter((m) => m.t === 'select').pop() as Extract<ServerMsg, { t: 'select' }>;
    expect(last.votes.map[0]).toBe(select.maps[0]);
    expect([select.maps[0], last.votes.map[1]]).toContain(enter.map);
    expect(enter.roster.find((r) => !r.bot)!.char).toBe('monk');
    const ai = enter.roster.find((r) => r.bot)!;
    expect(ai.mmr).toBeGreaterThan(0);
    expect(ai.placements).toBe(PLACEMENT_MATCHES);

    // forfeiting a rated AI match still moves your rating
    const arena = [...game.arenas][0];
    arena.forfeit(p);
    const result = inbox.find((m) => m.t === 'result') as Extract<ServerMsg, { t: 'result' }>;
    expect(result.delta).toBeLessThan(0);
    expect(p.profile.placements).toBe(1);
  });
});
