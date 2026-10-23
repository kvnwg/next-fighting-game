/** Lava burns once and throws you back out: touching it isn't a death sentence. */
import { describe, expect, it } from 'vitest';
import { Player } from '../src/server/entities';
import { Game } from '../src/server/game';
import { Store } from '../src/server/store';
import { MAPS } from '../src/shared/maps';

describe('lava', () => {
  it('burns once and throws you out of the pool', () => {
    let t = 1000;
    const game = new Game(new Store(null), () => t);
    const ws = { readyState: 1, send() {}, close() {}, on() {} };
    const p = new Player(ws as never, game.store.create('A'), 'ronin');
    const arena = game.startMatch('practice', p, null, 'easy', MAPS.forge);
    const [me, bot] = arena.slots;
    bot.brain = null;
    while (arena.phase !== 'fight' && t < 60_000) {
      t += 1000 / 60;
      game.tick();
    }
    expect(arena.phase).toBe('fight');
    const pool = MAPS.forge.hazards[0].shape as { x: number; z: number; r: number };
    const hp = me.hp;
    // step right into the middle of it
    me.x = pool.x + 0.5;
    me.z = pool.z;
    for (let i = 0; i < 30; i++) {
      t += 1000 / 60;
      game.tick();
    }
    expect(hp - me.hp).toBe(MAPS.forge.hazards[0].burn);
    expect(me.isAlive()).toBe(true);
    expect(Math.hypot(me.x - pool.x, me.z - pool.z)).toBeGreaterThan(pool.r);
  });
});
