import { describe, expect, it, vi } from 'vitest';
import { Arena } from '../src/server/arena';
import { MATCH } from '../src/shared/config';
import { Game } from '../src/server/game';
import { Store } from '../src/server/store';
import { TUTORIAL_NEED } from '../src/server/tutorial';
import { AD_MIN_GAP_MS, AD_REWARD, CHAR_PRICE, MATCH_AD_REWARD, FREE_PICK_GAMES, MAP_PRICE, MATCH_REWARD, TUTORIAL_REWARD, canUnlockChar, withProgress } from '../src/shared/progress';
import { CombatEvent, PROTOCOL_VERSION, ServerMsg } from '../src/shared/protocol';

function world() {
  let t = 1000;
  const game = new Game(new Store(null), () => t, { selectTime: 200, introTime: 200 });
  const step = (ms: number) => {
    const end = t + ms;
    while (t < end) {
      t += 1000 / 60;
      game.tick();
    }
  };
  const join = (name: string, char = 'ronin', token?: string) => {
    const inbox: ServerMsg[] = [];
    let onMsg: (d: unknown) => void = () => {};
    const ws = {
      readyState: 1,
      send: (d: string) => inbox.push(JSON.parse(d)),
      close() {},
      on(ev: string, cb: (d: unknown) => void) {
        if (ev === 'message') onMsg = cb;
      },
    };
    game.handleConnection(ws as never);
    const send = (m: object) => onMsg(JSON.stringify(m));
    send({ t: 'hello', v: PROTOCOL_VERSION, name, char, token });
    const player = [...game.players.values()].find((p) => p.name === name)!;
    const last = <T extends ServerMsg['t']>(k: T) => [...inbox].reverse().find((m) => m.t === k) as Extract<ServerMsg, { t: T }> | undefined;
    return { inbox, send, player, prof: player.profile, last };
  };
  /** play a practice match against a bot and end it: won by KO, or given up */
  const playMatch = (c: ReturnType<typeof join>, won: boolean, gaveUp = false) => {
    c.send({ t: 'queue', mode: 'practice', diff: 'easy' });
    step(400);
    const arena = [...game.arenas].find((a) => a.humans[0] === c.player)!;
    if (gaveUp) c.send({ t: 'forfeit' });
    else game.reportResult(arena, won ? 0 : 1, 'ko');
    game.closeArena(arena);
    return arena;
  };
  return { game, step, join, playMatch, now: () => t };
}

describe('coins and unlocks', () => {
  it('a new player owns the Ronin and Sakura only, and a locked fighter falls back to the Ronin', () => {
    const { join } = world();
    const c = join('New', 'lancer');
    expect(c.prof.chars).toEqual(['ronin']);
    expect(c.prof.maps).toEqual(['sakura']);
    expect(c.prof.coins).toBe(0);
    expect(c.prof.tutorial).toBe(false);
    expect(c.player.charId).toBe('ronin');
    // and the lobby won't let you switch to one either
    c.send({ t: 'char', id: 'shade' });
    expect(c.player.charId).toBe('ronin');
    expect(c.last('notice')?.text).toMatch(/Unlock/);
  });

  it('profiles saved before coins existed load with the starter set', () => {
    const old = withProgress({ id: 'x', name: 'Old', mmr: 1100 });
    expect(old.chars).toEqual(['ronin']);
    expect(old.maps).toEqual(['sakura']);
    expect(old.coins).toBe(0);
  });

  it('a finished match pays, giving up pays nothing, and every third match a win ends with an ad', () => {
    const { join, playMatch, step } = world();
    const c = join('Earner');
    const { win, loss } = MATCH_REWARD.practice;
    // the first two matches: coins, and no ad
    playMatch(c, true);
    expect(c.prof.coins).toBe(win);
    expect(c.prof.games).toBe(1);
    expect(c.last('result')).toMatchObject({ coins: win });
    expect(c.last('result')).not.toHaveProperty('ad');
    expect(c.last('result')).not.toHaveProperty('double');
    playMatch(c, true);
    expect(c.last('result')).not.toHaveProperty('ad');
    // an ad claimed without one being due pays nothing
    c.send({ t: 'ad', kind: 'match' });
    expect(c.prof.coins).toBe(2 * win);
    // the third is a loss: never an ad after a loss, so it waits for the next win
    playMatch(c, false);
    expect(c.prof.coins).toBe(2 * win + loss);
    expect(c.last('result')).not.toHaveProperty('ad');
    // giving up pays nothing and doesn't count
    playMatch(c, false, true);
    expect(c.prof.coins).toBe(2 * win + loss);
    expect(c.prof.games).toBe(3);
    // the next win: the card says an ad plays next and what it pays
    playMatch(c, true);
    expect(c.last('result')).toMatchObject({ coins: win, ad: MATCH_AD_REWARD });
    step(AD_MIN_GAP_MS + 100);
    c.send({ t: 'ad', kind: 'match' });
    expect(c.prof.coins).toBe(3 * win + loss + MATCH_AD_REWARD);
    expect(c.last('coins')).toMatchObject({ gained: MATCH_AD_REWARD, why: 'matchAd' });
    // once per ad
    step(AD_MIN_GAP_MS + 100);
    c.send({ t: 'ad', kind: 'match' });
    expect(c.prof.coins).toBe(3 * win + loss + MATCH_AD_REWARD);
    // and the count starts again: the next win has none
    playMatch(c, true);
    expect(c.last('result')).not.toHaveProperty('ad');
  });

  it('ads from the shop pay every time, but no faster than an ad can play', () => {
    const { join, step } = world();
    const c = join('Watcher');
    c.send({ t: 'ad', kind: 'bonus' });
    c.send({ t: 'ad', kind: 'bonus' });
    expect(c.prof.coins).toBe(AD_REWARD);
    for (let i = 0; i < 5; i++) {
      step(AD_MIN_GAP_MS + 50);
      c.send({ t: 'ad', kind: 'bonus' });
    }
    expect(c.prof.coins).toBe(AD_REWARD * 6);
  });

  it('reconnecting does not start the gap between paid ads over', () => {
    const { join, step } = world();
    let c = join('Rejoiner');
    const token = c.prof.token;
    for (let i = 0; i < 5; i++) {
      c.send({ t: 'ad', kind: 'bonus' });
      c = join('Rejoiner', 'ronin', token);
      step(50);
    }
    expect(c.prof.coins).toBe(AD_REWARD);
    step(AD_MIN_GAP_MS);
    c.send({ t: 'ad', kind: 'bonus' });
    expect(c.prof.coins).toBe(AD_REWARD * 2);
  });

  it('fighters and arenas cost coins; the Lancer and the Warden cost double and need Gold', () => {
    const { join } = world();
    const c = join('Buyer');
    c.send({ t: 'unlock', kind: 'char', id: 'shade' });
    expect(c.prof.chars).not.toContain('shade');
    expect(c.last('notice')?.text).toMatch(/coins/);
    c.prof.coins = CHAR_PRICE * 3 + MAP_PRICE;
    c.send({ t: 'unlock', kind: 'char', id: 'shade' });
    expect(c.prof.chars).toContain('shade');
    expect(c.prof.coins).toBe(CHAR_PRICE * 2 + MAP_PRICE);
    expect(c.last('unlocked')).toMatchObject({ kind: 'char', id: 'shade', free: false });
    // enough coins for the Lancer, but not Gold yet
    c.send({ t: 'unlock', kind: 'char', id: 'lancer' });
    expect(c.prof.chars).not.toContain('lancer');
    expect(c.last('notice')?.text).toMatch(/Gold/);
    c.prof.placements = 5;
    c.prof.peak = 1010;
    c.prof.mmr = 940; // dropped back since: Gold once is enough
    c.send({ t: 'unlock', kind: 'char', id: 'lancer' });
    expect(c.prof.chars).toContain('lancer');
    expect(c.prof.coins).toBe(MAP_PRICE);
    c.send({ t: 'unlock', kind: 'map', id: 'forge' });
    expect(c.prof.maps).toEqual(['sakura', 'forge']);
    expect(c.prof.coins).toBe(0);
    // and the shiny new fighter can be played
    c.send({ t: 'char', id: 'shade' });
    expect(c.player.charId).toBe('shade');
  });

  it('a free fighter after three finished matches, once, and never a Gold one early', () => {
    const { join, playMatch } = world();
    const c = join('Patient');
    c.send({ t: 'unlock', kind: 'char', id: 'monk', free: true });
    expect(c.prof.chars).not.toContain('monk');
    for (let i = 0; i < FREE_PICK_GAMES; i++) playMatch(c, i % 2 === 0);
    expect(c.inbox.some((m) => m.t === 'notice' && /free fighter is ready/.test(m.text))).toBe(true);
    expect(canUnlockChar(c.prof, 'juggernaut', true)).toEqual({ ok: false, why: 'gold' });
    const coins = c.prof.coins;
    c.send({ t: 'unlock', kind: 'char', id: 'monk', free: true });
    expect(c.prof.chars).toContain('monk');
    expect(c.prof.freePicked).toBe(true);
    expect(c.prof.coins).toBe(coins);
    c.send({ t: 'unlock', kind: 'char', id: 'duelist', free: true });
    expect(c.prof.chars).not.toContain('duelist');
  });

  it('a match offers every arena either player owns, and only those', () => {
    const { join, step, game } = world();
    const a = join('Host');
    const b = join('Guest');
    a.prof.maps.push('bamboo');
    b.prof.maps.push('forge');
    a.send({ t: 'challenge', target: b.player.id });
    b.send({ t: 'challengeReply', from: a.player.id, accept: true });
    const sel = a.last('select')!;
    expect(sel.maps).toEqual(['sakura', 'bamboo', 'forge']);
    // a vote for an arena neither owns, or a fighter you don't own, doesn't count
    a.send({ t: 'vote', map: 'summit', char: 'paladin' });
    expect(a.last('select')!.votes).toEqual({ map: [null, null], char: [null, null] });
    b.send({ t: 'vote', map: 'bamboo' });
    a.send({ t: 'vote', map: 'bamboo' });
    step(400);
    const arena = [...game.arenas][0];
    expect(arena.map.id).toBe('bamboo');
  });

  it('practice against a bot offers only your own arenas', () => {
    const { join } = world();
    const c = join('Solo');
    c.send({ t: 'queue', mode: 'practice', diff: 'easy' });
    expect(c.last('select')!.maps).toEqual(['sakura']);
  });
});

describe('tutorial', () => {
  const ev = (k: CombatEvent['k'], a: string, d: string, key?: string): CombatEvent => ({ k, a, d, x: 0, y: 0, z: 0, ...(key ? { key: key as never } : {}) });

  it('runs every lesson in order, pays once, ends in a real duel and goes back to the lobby', () => {
    const { join, step, game, now } = world();
    const c = join('Student');
    c.send({ t: 'tutorial', a: 'start' });
    const arena = [...game.arenas][0] as Arena;
    expect(arena.mode).toBe('tutorial');
    expect(arena.phase).toBe('fight');
    const coach = arena.coach!;
    const [me, sensei] = arena.slots;
    expect(sensei.char.id).toBe('monk');
    const steps = () => c.inbox.filter((m): m is Extract<ServerMsg, { t: 'tutorial' }> => m.t === 'tutorial');
    expect(steps()[0]).toMatchObject({ step: 'strike', n: 0, need: TUTORIAL_NEED.strike });

    // strike into his guard: his posture climbs with each blow
    for (let i = 0; i < TUTORIAL_NEED.strike; i++) coach.observe([ev('block', me.id, sensei.id)], now());
    expect(coach.step).toBe('block');

    // block his blows; then your guard breaks and he executes you (for real: the sim runs it)
    for (let i = 0; i < TUTORIAL_NEED.block; i++) coach.observe([ev('block', sensei.id, me.id)], now());
    coach.observe([ev('block', sensei.id, me.id)], now());
    expect(steps().some((m) => m.note === 'broken')).toBe(true);
    step(9000);
    expect(coach.step).toBe('deflect');

    // a block is too early, a hit too late; deflects fill his posture and the last breaks it
    coach.observe([ev('block', sensei.id, me.id)], now());
    expect(steps().at(-1)!.note).toBe('early');
    coach.observe([ev('hit', sensei.id, me.id)], now());
    expect(steps().at(-1)!.note).toBe('late');
    for (let i = 0; i < TUTORIAL_NEED.deflect; i++) coach.observe([ev('deflect', sensei.id, me.id)], now());
    expect(coach.step).toBe('execute');
    expect(sensei.state).toBe('broken');

    // the deathblow, played out, then his perilous attack to dodge
    arena.applyInput(me, 'light', now());
    for (let i = 0; i < 20 && coach.step === 'execute'; i++) {
      step(500);
      if (me.state === 'idle' && sensei.state === 'broken') arena.applyInput(me, 'light', now());
      // walk into reach of him
      me.x = sensei.x;
      me.z = sensei.z - 1.6;
    }
    expect(coach.step).toBe('perilous');
    // he throws his perilous grab: dodge through it as it comes
    me.x = sensei.x;
    me.z = sensei.z - 1.8;
    for (let i = 0; i < 400 && !(sensei.state === 'attack' && sensei.attackKey === 'sp'); i++) step(20);
    expect(sensei.attackKey).toBe('sp');
    while (now() < sensei.stateStart + sensei.atkWindup - 120) step(20);
    expect(arena.applyInput(me, 'dodge', now(), { dx: 1, dz: 0 })).toBe(true);
    step(3000);
    // the lessons are learned and paid for: now he fights for real
    expect(coach.step).toBe('duel');
    expect(c.prof.tutorial).toBe(true);
    expect(c.prof.coins).toBe(TUTORIAL_REWARD);
    expect(arena.coach).toBeNull();
    expect(arena.phase).toBe('fight');
    expect(sensei.brain).not.toBe(coach);
    // he goes down (and stays down): one round takes the match, with its result screen
    arena.killByEnvironment(sensei, 'fall', now());
    const result = c.inbox.find((m): m is Extract<ServerMsg, { t: 'result' }> => m.t === 'result');
    expect(result).toMatchObject({ mode: 'tutorial', won: true });
    expect(c.prof.coins).toBe(TUTORIAL_REWARD);
    expect(arena.phase).toBe('matchEnd');
    step(MATCH.matchEndTime + 500);
    expect(game.arenas.size).toBe(0);
    expect(c.player.instance?.kind).toBe('lobby');
  });

  it('can be skipped, and pays nothing then', () => {
    const { join, game } = world();
    const c = join('Busy');
    c.send({ t: 'tutorial', a: 'start' });
    expect(game.arenas.size).toBe(1);
    c.send({ t: 'tutorial', a: 'skip' });
    expect(game.arenas.size).toBe(0);
    expect(c.prof.tutorial).toBe(true);
    expect(c.prof.coins).toBe(0);
    // skipping it again changes nothing (and so has nothing to save, or to sort the ladder over)
    const dirty = vi.spyOn(game.store, 'markDirty');
    for (let i = 0; i < 10; i++) c.send({ t: 'tutorial', a: 'skip' });
    expect(dirty).not.toHaveBeenCalled();
  });
});
