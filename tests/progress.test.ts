import { describe, expect, it, vi } from 'vitest';
import { Arena } from '../src/server/arena';
import { MATCH } from '../src/shared/config';
import { Game } from '../src/server/game';
import { Store } from '../src/server/store';
import { TUTORIAL_NEED } from '../src/server/tutorial';
import { AD_MIN_GAP_MS, AD_REWARD, CHAR_PRICE, MATCH_AD_REWARD, FREE_PICK_GAMES, MAP_PRICE, MATCH_REWARD, TRIAL_REWARD, TUTORIAL_REWARD, canUnlockChar, gamesToFreePick, withProgress } from '../src/shared/progress';
import { TRIALS, trialOpponent } from '../src/shared/trials';
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

describe('the first fight', () => {
  const ev = (k: CombatEvent['k'], a: string, d: string, key?: string): CombatEvent => ({ k, a, d, x: 0, y: 0, z: 0, ...(key ? { key: key as never } : {}) });

  it('strike, deflect, a deathblow, then a duel you can\'t lose; beating him pays, earns a fighter and goes on to trial 2', () => {
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
    expect(c.prof.first).toBe('strike');

    // strike him
    for (let i = 0; i < TUTORIAL_NEED.strike; i++) coach.observe([ev('hit', me.id, sensei.id)], now());
    expect(coach.step).toBe('deflect');
    expect(c.prof.first).toBe('deflect');

    // a block is too early, a hit too late; deflects fill his posture and the last breaks it
    coach.observe([ev('block', sensei.id, me.id)], now());
    expect(steps().at(-1)!.note).toBe('early');
    coach.observe([ev('hit', sensei.id, me.id)], now());
    expect(steps().at(-1)!.note).toBe('late');
    for (let i = 0; i < TUTORIAL_NEED.deflect; i++) coach.observe([ev('deflect', sensei.id, me.id)], now());
    expect(coach.step).toBe('execute');
    expect(sensei.state).toBe('broken');

    // the deathblow, played out (for real: the sim runs it), then the duel
    const before = sensei.hp;
    arena.applyInput(me, 'light', now());
    for (let i = 0; i < 20 && arena.coach; i++) {
      step(500);
      if (me.state === 'idle' && sensei.state === 'broken') arena.applyInput(me, 'light', now());
      // walk into reach of him
      me.x = sensei.x;
      me.z = sensei.z - 1.6;
    }
    expect(arena.coach).toBeNull();
    expect(c.prof.first).toBe('duel');
    expect(steps().at(-1)!.step).toBe('duel');
    // his wounds stay on him; you go into it whole
    expect(sensei.hp).toBeLessThan(before);
    expect(me.hp).toBe(me.maxHp);
    expect(arena.phase).toBe('fight');
    expect(sensei.brain).not.toBe(coach);
    // nothing's paid or marked done until he's beaten
    expect(c.prof.tutorial).toBe(false);
    expect(c.prof.coins).toBe(0);

    // you can't go down in it
    arena.killByEnvironment(me, 'fall', now());
    expect(me.isAlive()).toBe(true);
    expect(arena.phase).toBe('fight');
    expect(c.inbox.some((m) => m.t === 'result')).toBe(false);

    // he goes down: one round takes the match, and the fighter it earns is offered on the spot
    arena.killByEnvironment(sensei, 'fall', now());
    expect(c.last('result')).toMatchObject({ mode: 'tutorial', won: true, coins: TUTORIAL_REWARD, unlock: true, trial: { n: 1, next: 2 } });
    expect(c.prof).toMatchObject({ tutorial: true, trial: 1, coins: TUTORIAL_REWARD, first: 'won' });
    expect(gamesToFreePick(c.prof)).toBe(0);
    c.send({ t: 'unlock', kind: 'char', id: 'reaper', free: true });
    expect(c.prof.chars).toContain('reaper');
    expect(c.prof.freePicked).toBe(true);
    expect(c.prof.coins).toBe(TUTORIAL_REWARD);

    // Next, straight from the result: trial 2, with the new fighter
    c.send({ t: 'trial', char: 'reaper' });
    const t2 = [...game.arenas].find((a) => a !== arena)!;
    expect(t2.trial).toBe(2);
    expect(t2.slots[0].char.id).toBe('reaper');
    expect(t2.slots[1].name).toBe(trialOpponent(2).name);
    expect(t2.slots[1].char.id).toBe(trialOpponent(2).char);
    expect(t2.map.id).toBe(trialOpponent(2).map);
    expect(c.last('match')).toMatchObject({ trial: 2 });
    expect(c.prof.started).toBe(2);
    // the sensei's arena closes without pulling them back to the lobby
    step(MATCH.matchEndTime + 500);
    expect(game.arenas.has(arena)).toBe(false);
    expect(c.player.instance).toBe(t2);
  });

  it('can be skipped, and pays nothing then (the free fighter waits for a few matches)', () => {
    const { join, game } = world();
    const c = join('Busy');
    c.send({ t: 'tutorial', a: 'start' });
    expect(game.arenas.size).toBe(1);
    c.send({ t: 'tutorial', a: 'skip' });
    expect(game.arenas.size).toBe(0);
    expect(c.prof).toMatchObject({ tutorial: true, skipped: true, trial: 0, coins: 0, first: 'strike' });
    expect(gamesToFreePick(c.prof)).toBe(FREE_PICK_GAMES);
    // skipping it again changes nothing (and so has nothing to save, or to sort the ladder over)
    const dirty = vi.spyOn(game.store, 'markDirty');
    for (let i = 0; i < 10; i++) c.send({ t: 'tutorial', a: 'skip' });
    expect(dirty).not.toHaveBeenCalled();
  });
});

describe('trials', () => {
  /** the latest match a player is in */
  const latest = (game: { arenas: Set<Arena> }, p: unknown) => [...game.arenas].reverse().find((a) => a.humans[0] === p)!;

  it('one round each against the next opponent up: the next after a win, the same again after a loss', () => {
    const { join, game, step, now } = world();
    const c = join('Climber');
    // the sensei unbeaten (skipped or not), a trial is the first fight
    c.send({ t: 'trial' });
    expect(latest(game, c.player).mode).toBe('tutorial');
    c.send({ t: 'tutorial', a: 'skip' });
    c.send({ t: 'trial' });
    expect(latest(game, c.player).mode).toBe('tutorial');
    c.send({ t: 'tutorial', a: 'skip' });

    // beaten: trial 2, from the lobby (a fighter you don't own stays home)
    c.prof.trial = 1;
    c.send({ t: 'trial', char: 'shade' });
    let arena = latest(game, c.player);
    expect(arena.trial).toBe(2);
    expect(arena.slots[0].char.id).toBe('ronin');
    step(MATCH.countdownTime + 500);
    expect(arena.phase).toBe('fight');
    arena.killByEnvironment(arena.slots[1], 'fall', now());
    expect(arena.finished).toBe(true);
    expect(c.last('result')).toMatchObject({ won: true, trial: { n: 2, next: 3 }, coins: MATCH_REWARD.practice.win + TRIAL_REWARD });
    expect(c.prof.trial).toBe(2);

    // from its result straight into trial 3; lost, Next is trial 3 again, and nothing extra
    c.send({ t: 'trial' });
    arena = latest(game, c.player);
    expect(arena.trial).toBe(3);
    step(MATCH.countdownTime + 500);
    arena.killByEnvironment(arena.slots[0], 'fall', now());
    expect(c.last('result')).toMatchObject({ won: false, trial: { n: 3, next: 3 }, coins: MATCH_REWARD.practice.loss });
    expect(c.prof.trial).toBe(2);

    // all of them won: Next says so, and the Trials card replays the last
    step(MATCH.matchEndTime + 500);
    expect(c.player.instance?.kind).toBe('lobby');
    c.prof.trial = TRIALS;
    c.send({ t: 'trial' });
    arena = latest(game, c.player);
    expect(arena.trial).toBe(TRIALS);
    step(MATCH.countdownTime + 500);
    arena.killByEnvironment(arena.slots[1], 'fall', now());
    expect(c.last('result')).toMatchObject({ won: true, trial: { n: TRIALS, next: null } });
  });

  it('start only from the lobby or the result of a first fight or trial', () => {
    const { join, game, step, playMatch } = world();
    const c = join('Eager');
    c.prof.trial = 1;
    // picking a practice match: no
    c.send({ t: 'queue', mode: 'practice', diff: 'easy' });
    c.send({ t: 'trial' });
    expect(game.arenas.size).toBe(0);
    step(400);
    // in it: no
    const practice = latest(game, c.player);
    c.send({ t: 'trial' });
    expect(latest(game, c.player)).toBe(practice);
    // on its result: still no (only a trial's own result leads on)
    game.reportResult(practice, 0, 'ko');
    c.send({ t: 'trial' });
    expect(latest(game, c.player)).toBe(practice);
    game.closeArena(practice);
    void playMatch;
  });
});
