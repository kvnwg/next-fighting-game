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
  WEAPON_IDS,
  applySnapshot,
  makeInput,
  snapshotMatch,
  type InputFrame,
  type MoveId,
  type SimEvent,
  type WeaponId,
} from '../src/index.ts';

type Script = (tick: number, m: Match) => [InputFrame, InputFrame];

function fightAt(distance: number, weapons: [WeaponId, WeaponId] = ['lancer', 'lancer']): Match {
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
  it('lands a three-hit string with damage scaling', () => {
    const m = fightAt(2);
    // Mash LIGHT every 4 ticks; the input buffer turns that into a clean chain.
    const ev = run(m, 100, (t) => [t % 4 === 0 && t < 60 ? tap(BTN.LIGHT) : NO_INPUT, NO_INPUT]);
    const hits = ev.filter((e) => e.type === 'hit');
    expect(hits.map((h) => h.type === 'hit' && h.move).slice(0, 3)).toEqual(['L1', 'L2', 'L3']);
    const dmg = hits.map((h) => (h.type === 'hit' ? h.damage : 0));
    const base = WEAPONS.lancer.moves;
    expect(dmg[0]).toBe(base.L1.damage);
    expect(dmg[1]).toBe(Math.round(base.L2.damage * 0.9));
    expect(dmg[2]).toBe(Math.round(base.L3.damage * 0.8));
  });

  it('is a true string on hit for every fighter', () => {
    for (const id of WEAPON_IDS) {
      const m = fightAt(Math.min(1.4, WEAPONS[id].moves.L1.range - 0.3), [id, 'lancer']);
      const ev = run(m, 100, (t) => [t % 3 === 0 && t < 70 ? tap(BTN.LIGHT) : NO_INPUT, NO_INPUT]);
      const moves = ev.filter((e) => e.type === 'hit').map((h) => h.type === 'hit' && h.move);
      expect(moves, id).toEqual(expect.arrayContaining(['L1', 'L2', 'L3']));
    }
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
    const startup = WEAPONS.lancer.moves.H1.startup;
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
    const m = fightAt(1.4, ['monk', 'lancer']);
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
    expect(hit && hit.type === 'hit' && hit.damage).toBe(Math.round(WEAPONS.monk.moves.L1.damage * GUARD_BREAK_BONUS));
  });

  it('holds posture while the fighter keeps attacking or dodging, and recovers slowly once they stop', () => {
    const m = fightAt(1.4, ['monk', 'lancer']);
    run(m, 40, (t) => [t === 0 ? tap(BTN.HEAVY) : NO_INPUT, hold(BTN.PARRY)]);
    const worn = m.fighters[1].posture;
    expect(worn).toBeGreaterThan(0);
    // The defender swings and dodges away for four seconds: nothing comes back.
    m.fighters[0].z = -4;
    run(m, 240, (t) => [NO_INPUT, t % 30 === 0 ? tap(t % 60 === 0 ? BTN.LIGHT : BTN.DODGE) : NO_INPUT]);
    expect(m.fighters[1].posture).toBe(worn);
    // Standing still, it waits a moment to start and takes several seconds to finish.
    run(m, 40, () => [NO_INPUT, NO_INPUT]);
    expect(m.fighters[1].posture).toBe(worn);
    run(m, 600, () => [NO_INPUT, NO_INPUT]);
    expect(m.fighters[1].posture).toBe(0);
  });

  it('breaks the guard of a fighter worn down by clean hits, and the guard comes back whole', () => {
    const m = fightAt(1.4, ['monk', 'lancer']);
    m.fighters[1].posture = MAX_POSTURE - 2;
    const ev = run(m, 40, (t) => [t === 0 ? tap(BTN.LIGHT) : NO_INPUT, NO_INPUT]);
    expect(ev.some((e) => e.type === 'guardbreak')).toBe(true);
    expect(m.fighters[1].state).toBe('guardbreak');
    run(m, 120, () => [NO_INPUT, NO_INPUT]);
    expect(m.fighters[1].state).not.toBe('guardbreak');
    expect(m.fighters[1].posture).toBe(0);
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
    const c = WEAPONS.lancer.moves.C;
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
    const m = new Match({ weapons: ['lancer', 'ronin'], practice: true });
    m.fighters[1].z = -0.5;
    const ev = run(m, 3000, (t) => [t % 4 === 0 ? tap(BTN.LIGHT) : NO_INPUT, NO_INPUT]);
    expect(ev.some((e) => e.type === 'ko')).toBe(false);
    expect(m.phase).toBe('fight');
  });

  it('bot matches finish with a winner and identical results for identical seeds', () => {
    const play = () => {
      const m = new Match({ weapons: ['lancer', 'monk'] });
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
        const m = new Match({ weapons: [WEAPON_IDS[i % WEAPON_IDS.length]!, WEAPON_IDS[(i * 3 + 1) % WEAPON_IDS.length]!] });
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
    const copy = new Match({ weapons: ['lancer', 'lancer'] });
    applySnapshot(copy, snapshotMatch(m));
    expect(snapshotMatch(copy)).toEqual(snapshotMatch(m));
    // Both copies keep simulating identically.
    const a = m.step([NO_INPUT, NO_INPUT]);
    const b = copy.step([NO_INPUT, NO_INPUT]);
    expect(b).toEqual(a);
  });
});

const hitMoves = (ev: SimEvent[]): MoveId[] => ev.flatMap((e) => (e.type === 'hit' ? [e.move] : []));

describe('movesets', () => {
  it('walk the heavy chain with presses in succession', () => {
    const m = fightAt(2, ['ronin', 'lancer']);
    const ev = run(m, 200, (t) => [t % 6 === 0 && t < 150 ? tap(BTN.HEAVY) : NO_INPUT, NO_INPUT]);
    expect(hitMoves(ev).slice(0, 3)).toEqual(['H1', 'H2', 'H3']);
  });

  it('turn a light or heavy into a dash attack after a forward dodge', () => {
    for (const [btn, id] of [[BTN.LIGHT, 'DL'], [BTN.HEAVY, 'DH']] as const) {
      const m = fightAt(4.5, ['ronin', 'lancer']);
      const ev = run(m, 80, (t) => [
        t === 0 ? makeInput({ pressed: BTN.DODGE, held: BTN.DODGE, moveY: 1 }) : t === 9 ? tap(btn) : NO_INPUT,
        NO_INPUT,
      ]);
      expect(ev.some((e) => e.type === 'swing' && e.move === id), id).toBe(true);
    }
  });

  it('use retreating attacks while walking away', () => {
    for (const [btn, id] of [[BTN.LIGHT, 'BL'], [BTN.HEAVY, 'BH']] as const) {
      const m = fightAt(2, ['knight', 'lancer']);
      const startZ = m.fighters[0].z;
      const ev = run(m, 60, (t) => [makeInput({ moveY: -1, pressed: t === 2 ? btn : 0, held: t === 2 ? btn : 0 }), NO_INPUT]);
      expect(ev.some((e) => e.type === 'swing' && e.move === id), id).toBe(true);
      expect(m.fighters[0].z).toBeLessThan(startZ);
    }
  });

  it('use air attacks while jumping, and the jump heavy lands as a plunge', () => {
    for (const [btn, id] of [[BTN.LIGHT, 'JL'], [BTN.HEAVY, 'JH']] as const) {
      const m = fightAt(1.6, ['monk', 'lancer']);
      const ev = run(m, 90, (t) => [t === 0 ? tap(BTN.JUMP) : t === 10 ? tap(btn) : NO_INPUT, NO_INPUT]);
      expect(ev.some((e) => e.type === 'swing' && e.move === id), id).toBe(true);
      expect(hitMoves(ev), id).toContain(id);
      expect(m.fighters[0].y).toBe(0);
    }
  });

  it('land every hit of a multi-hit move', () => {
    const m = fightAt(1.4, ['assassin', 'lancer']);
    // Walk the light chain to Twin Fangs (three hits).
    const ev = run(m, 90, (t) => [t % 3 === 0 && t < 40 ? tap(BTN.LIGHT) : NO_INPUT, NO_INPUT]);
    expect(hitMoves(ev).filter((id) => id === 'L3')).toHaveLength(WEAPONS.assassin.moves.L3.hits);
  });

  it('let armored heavies take a hit without flinching', () => {
    const m = fightAt(1.6, ['warden', 'assassin']);
    const h1 = WEAPONS.warden.moves.H1;
    const ev = run(m, 70, (t) => [t === 0 ? tap(BTN.HEAVY) : NO_INPUT, t === 8 ? tap(BTN.LIGHT) : NO_INPUT]);
    // The assassin's jab lands during the armor, and Hammerfall still connects.
    expect(ev.some((e) => e.type === 'hit' && e.attacker === 1)).toBe(true);
    expect(hitMoves(ev.filter((e) => e.type === 'hit' && e.attacker === 0))).toContain('H1');
    expect(h1.armor).not.toBeNull();
  });

  it('fire a guard counter when struck during the guard frames', () => {
    const m = fightAt(2, ['ronin', 'lancer']);
    // Lancer jabs into the ronin's Sheathing Counter.
    const ev = run(m, 70, (t) => [makeInput({ moveY: t === 0 ? -1 : 0, pressed: t === 0 ? BTN.HEAVY : 0 }), t === 0 ? tap(BTN.LIGHT) : NO_INPUT]);
    expect(ev.some((e) => e.type === 'parry' && e.victim === 0)).toBe(true);
    expect(hitMoves(ev.filter((e) => e.type === 'hit' && e.attacker === 0))).toContain('BH');
    expect(ev.some((e) => e.type === 'hit' && e.attacker === 1)).toBe(false);
  });

  it('launch on hit and hold the victim in hitstun until they land', () => {
    const m = fightAt(1.6, ['monk', 'lancer']);
    let peak = 0;
    for (let t = 0; t < 90; t++) {
      // Iron Palm, then Crane Rising Knee.
      m.step([t === 0 || t === 30 ? tap(BTN.HEAVY) : NO_INPUT, NO_INPUT]);
      peak = Math.max(peak, m.fighters[1].y);
      if (m.fighters[1].y > 0.05) expect(m.fighters[1].state).toBe('hitstun');
    }
    expect(peak).toBeGreaterThan(0.3);
  });

  it('gives every fighter all thirteen moves', () => {
    for (const id of WEAPON_IDS) {
      const moves = WEAPONS[id].moves;
      expect(Object.keys(moves).sort(), id).toEqual(['BH', 'BL', 'C', 'DH', 'DL', 'H1', 'H2', 'H3', 'JH', 'JL', 'L1', 'L2', 'L3']);
      expect(new Set(Object.values(moves).map((mv) => mv.name)).size, id).toBe(13);
    }
  });
});
