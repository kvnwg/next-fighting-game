import { describe, expect, it } from 'vitest';
import {
  BTN,
  Bot,
  CRIT_HOLD_FRAMES,
  GUARD_BREAK_BONUS,
  MAX_POSTURE,
  Match,
  NO_INPUT,
  PARRY_WINDOW,
  PARRY_WHIFF_RECOVERY,
  Rng,
  WEAPONS,
  applySnapshot,
  makeInput,
  snapshotMatch,
  type InputFrame,
  type SimEvent,
} from '../src/index.ts';

type Script = (tick: number, m: Match) => [InputFrame, InputFrame];

function fightAt(distance: number, weapons: [any, any] = ['naginata', 'naginata']): Match {
  const m = new Match({ weapons });
  m.phase = 'fight';
  m.fighters[0].z = -distance / 2;
  m.fighters[1].z = distance / 2;
  return m;
}

function run(m: Match, ticks: number, script: Script): SimEvent[] {
  const all: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) all.push(...m.step(script(t, m)));
  return all;
}

const tap = (btn: number) => makeInput({ pressed: btn, held: btn });
const hold = (btn: number) => makeInput({ held: btn });

describe('light chain', () => {
  it('lands a four-hit string that ends in a knockdown, with damage scaling', () => {
    const m = fightAt(2);
    // Mash LIGHT every 4 ticks; the input buffer turns that into a clean chain.
    const ev = run(m, 140, (t) => [t % 4 === 0 ? tap(BTN.LIGHT) : NO_INPUT, NO_INPUT]);
    const hits = ev.filter((e) => e.type === 'hit');
    expect(hits.map((h) => h.type === 'hit' && h.move)).toEqual(['L1', 'L2', 'L3', 'L4']);
    const dmg = hits.map((h) => (h.type === 'hit' ? h.damage : 0));
    const base = WEAPONS.naginata.moves;
    expect(dmg[0]).toBe(base.L1.damage);
    expect(dmg[1]).toBe(Math.round(base.L2.damage * 0.9));
    expect(dmg[3]).toBe(Math.round(base.L4.damage * 0.7));
    expect(hits[3]?.type === 'hit' && hits[3].knockdown).toBe(true);
  });

  it('cannot be escaped with a parry once the first hit lands', () => {
    const m = fightAt(2);
    let firstHit = -1;
    const ev: SimEvent[] = [];
    for (let t = 0; t < 120; t++) {
      // The defender mashes parry as soon as they're hit.
      const p1 = firstHit >= 0 && t % 2 === 0 ? tap(BTN.PARRY) : NO_INPUT;
      const out = m.step([t % 4 === 0 ? tap(BTN.LIGHT) : NO_INPUT, p1]);
      if (firstHit < 0 && out.some((e) => e.type === 'hit')) firstHit = t;
      ev.push(...out);
    }
    expect(ev.filter((e) => e.type === 'parry')).toHaveLength(0);
    expect(ev.filter((e) => e.type === 'hit').length).toBeGreaterThanOrEqual(4);
  });

  it('leaves a parry gap when the string is blocked', () => {
    const m = fightAt(2);
    let blocked = -1;
    let parried = false;
    for (let t = 0; t < 120 && !parried; t++) {
      let p1 = hold(BTN.PARRY);
      // After the first block, release for a tick and re-press to open a parry window.
      if (blocked >= 0 && t === blocked + 4) p1 = NO_INPUT;
      if (blocked >= 0 && t === blocked + 6) p1 = tap(BTN.PARRY);
      const out = m.step([t % 3 === 0 ? tap(BTN.LIGHT) : NO_INPUT, p1]);
      if (blocked < 0 && out.some((e) => e.type === 'block')) blocked = t;
      if (out.some((e) => e.type === 'parry')) parried = true;
    }
    expect(blocked).toBeGreaterThan(0);
    expect(parried).toBe(true);
  });
});

describe('parry', () => {
  it('staggers the attacker and costs them posture', () => {
    const m = fightAt(2);
    const startup = WEAPONS.naginata.moves.H.startup;
    const ev = run(m, 60, (t) => [t === 0 ? tap(BTN.HEAVY) : NO_INPUT, t === startup - 3 ? tap(BTN.PARRY) : NO_INPUT]);
    expect(ev.some((e) => e.type === 'parry')).toBe(true);
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
    expect(m.fighters[0].posture).toBeGreaterThan(0);
  });

  it('punishes a whiffed parry with recovery', () => {
    const m = fightAt(4);
    run(m, PARRY_WINDOW + 2, (t) => [NO_INPUT, t === 0 ? tap(BTN.PARRY) : NO_INPUT]);
    expect(m.fighters[1].state).toBe('parryWhiff');
    run(m, PARRY_WHIFF_RECOVERY, () => [NO_INPUT, NO_INPUT]);
    expect(m.fighters[1].state).toBe('idle');
  });
});

describe('posture and guard break', () => {
  it('breaks a guard that keeps blocking heavies, and the next hit deals bonus damage', () => {
    const m = fightAt(2, ['bo', 'naginata']);
    let broke = false;
    for (let t = 0; t < 600 && !broke; t++) {
      const out = m.step([t % 50 === 0 ? tap(BTN.HEAVY) : NO_INPUT, hold(BTN.PARRY)]);
      broke = out.some((e) => e.type === 'guardbreak');
    }
    expect(broke).toBe(true);
    expect(m.fighters[1].state).toBe('guardbreak');
    expect(m.fighters[1].posture).toBe(MAX_POSTURE);

    // Mash through the heavy's recovery and the hitstop, then punish.
    const ev = run(m, 80, (t) => [t % 3 === 0 ? tap(BTN.LIGHT) : NO_INPUT, NO_INPUT]);
    const hit = ev.find((e) => e.type === 'hit');
    expect(hit && hit.type === 'hit' && hit.bonus).toBe(true);
    expect(hit && hit.type === 'hit' && hit.damage).toBe(Math.round(WEAPONS.bo.moves.L1.damage * GUARD_BREAK_BONUS));
  });
});

describe('critical attacks', () => {
  it('charge from a held heavy, glow, and break through a block', () => {
    const m = fightAt(2);
    const ev = run(m, 80, (t) => [t <= CRIT_HOLD_FRAMES + 2 ? makeInput({ held: BTN.HEAVY, pressed: t === 0 ? BTN.HEAVY : 0 }) : NO_INPUT, hold(BTN.PARRY)]);
    expect(ev.some((e) => e.type === 'telegraph')).toBe(true);
    expect(ev.some((e) => e.type === 'guardbreak')).toBe(true);
    const hit = ev.find((e) => e.type === 'hit');
    expect(hit && hit.type === 'hit' && hit.move).toBe('C');
  });

  it('can be dodged through with i-frames', () => {
    const m = fightAt(2);
    const c = WEAPONS.naginata.moves.C;
    const ev = run(m, 90, (t) => [
      t <= CRIT_HOLD_FRAMES + 2 ? makeInput({ held: BTN.HEAVY, pressed: t === 0 ? BTN.HEAVY : 0 }) : NO_INPUT,
      t === c.startup - 6 ? makeInput({ pressed: BTN.DODGE, held: BTN.DODGE, moveX: 1 }) : NO_INPUT,
    ]);
    expect(ev.some((e) => e.type === 'dodge')).toBe(true);
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
  });
});

describe('rounds', () => {
  it('practice mode never knocks anyone out', () => {
    const m = new Match({ weapons: ['naginata', 'katana'], practice: true });
    m.fighters[1].z = -0.5;
    const ev = run(m, 3000, (t) => [t % 4 === 0 ? tap(BTN.LIGHT) : NO_INPUT, NO_INPUT]);
    expect(ev.some((e) => e.type === 'ko')).toBe(false);
    expect(m.phase).toBe('fight');
  });

  it('bot matches finish with a winner and identical results for identical seeds', () => {
    const play = () => {
      const m = new Match({ weapons: ['naginata', 'bo'] });
      const a = new Bot(0, 'hard', 1);
      const b = new Bot(1, 'normal', 2);
      for (let t = 0; t < 60 * 60 * 6 && m.phase !== 'matchEnd'; t++) m.step([a.think(m), b.think(m)]);
      return m;
    };
    const first = play();
    const second = play();
    expect(first.phase).toBe('matchEnd');
    expect(first.round).toBeGreaterThanOrEqual(2);
    expect(snapshotMatch(first)).toEqual(snapshotMatch(second));
  });

  it('easy bots lose to button mashing, hard bots punish it', () => {
    // A new player: walks in and mashes light (sometimes heavy), never defends.
    const masher = (m: Match, rng: Rng): InputFrame => {
      const [me, op] = m.fighters;
      const dist = Math.hypot(op.x - me.x, op.z - me.z);
      const btn = dist < 3 && rng.next() < 0.12 ? (rng.next() < 0.85 ? BTN.LIGHT : BTN.HEAVY) : 0;
      return makeInput({ moveY: dist > 2.2 ? 1 : 0, pressed: btn, held: btn });
    };
    const masherWins = (level: 'easy' | 'hard') => {
      let wins = 0;
      for (let i = 0; i < 12; i++) {
        const m = new Match({ weapons: ['naginata', i % 2 ? 'katana' : 'bo'] });
        const bot = new Bot(1, level, 1000 + i);
        const rng = new Rng(77 + i);
        for (let t = 0; t < 60 * 60 * 6 && m.phase !== 'matchEnd'; t++) m.step([masher(m, rng), bot.think(m)]);
        if (m.winner === 0) wins++;
      }
      return wins;
    };
    expect(masherWins('easy')).toBeGreaterThanOrEqual(9);
    expect(masherWins('hard')).toBeLessThanOrEqual(3);
  });
});

describe('snapshots', () => {
  it('round-trip a mid-fight state', () => {
    const m = fightAt(2);
    run(m, 30, (t) => [t % 4 === 0 ? tap(BTN.LIGHT) : NO_INPUT, NO_INPUT]);
    const copy = new Match({ weapons: ['naginata', 'naginata'] });
    applySnapshot(copy, snapshotMatch(m));
    expect(snapshotMatch(copy)).toEqual(snapshotMatch(m));
    // Both copies keep simulating identically.
    const a = m.step([NO_INPUT, NO_INPUT]);
    const b = copy.step([NO_INPUT, NO_INPUT]);
    expect(b).toEqual(a);
  });
});
