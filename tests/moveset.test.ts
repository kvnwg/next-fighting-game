import { describe, expect, it } from 'vitest';
import { AttackKey, CHARACTERS, CHARACTER_IDS, CharacterId, EXTRA_KEYS, getAttack } from '../src/shared/characters';
import { COMBAT } from '../src/shared/config';
import { Fighter } from '../src/shared/fighter';

/** A fighter at the origin facing +z. */
function fighter(id: CharacterId = 'ronin'): Fighter {
  const f = new Fighter('a', id);
  f.yaw = 0;
  return f;
}

/** Press `action` in the recovery of the current attack and let the chain take it. */
function chain(f: Fighter, action: 'light' | 'heavy', t: number): number {
  const a = f.attack!;
  // the next hit of a string waits for half the recovery
  const at = t + f.atkWindup + a.active + a.recovery * 0.5;
  f.input(action, at);
  f.update(at);
  return at;
}

describe('movesets', () => {
  it('every fighter has a three-hit light chain and all eight extended moves, each one its own', () => {
    for (const id of CHARACTER_IDS) {
      const c = CHARACTERS[id];
      expect(c.lights.length, id).toBe(3);
      const keys: AttackKey[] = ['l0', 'l1', 'l2', 'h', ...EXTRA_KEYS];
      const names = keys.map((k) => getAttack(c, k)?.name);
      expect(names.every(Boolean), id).toBe(true);
      expect(new Set(names).size, id).toBe(keys.length);
    }
  });

  it('heavies chain three deep, pressed in succession', () => {
    for (const id of CHARACTER_IDS) {
      const f = fighter(id);
      expect(f.input('heavy', 1000)).toBe(true);
      expect(f.attackKey).toBe('h');
      let t = chain(f, 'heavy', 1000);
      expect(f.attackKey, id).toBe('h1');
      t = chain(f, 'heavy', t);
      expect(f.attackKey, id).toBe('h2');
      // the chain ends there: the next press waits for neutral and opens a fresh chain
      chain(f, 'heavy', t);
      expect(f.attackKey, id).toBe('h2');
    }
  });

  it('a forward dodge turns light and heavy into dash attacks, during its second half and just after', () => {
    for (const [action, key] of [['light', 'dl'], ['heavy', 'dh']] as const) {
      const f = fighter();
      expect(f.input('dodge', 1000, { dx: 0, dz: 1 })).toBe(true);
      expect(f.input(action, 1000 + COMBAT.dodgeTime * 0.6)).toBe(true);
      expect(f.attackKey).toBe(key);

      const g = fighter();
      g.input('dodge', 1000, { dx: 0, dz: 1 });
      g.update(1000 + COMBAT.dodgeTime + 5);
      expect(g.state).toBe('idle');
      expect(g.input(action, 1000 + COMBAT.dodgeTime + 100)).toBe(true);
      expect(g.attackKey).toBe(key);
    }
  });

  it('a backward or sideways dodge does not', () => {
    for (const dir of [{ dx: 0, dz: -1 }, { dx: 1, dz: 0 }]) {
      const f = fighter();
      f.input('dodge', 1000, dir);
      f.update(1000 + COMBAT.dodgeTime + 5);
      f.input('light', 1000 + COMBAT.dodgeTime + 50);
      expect(f.attackKey).toBe('l0');
    }
  });

  it('walking away turns light and heavy into backstep attacks that give ground', () => {
    for (const [action, key] of [['light', 'bl'], ['heavy', 'bh']] as const) {
      const f = fighter();
      expect(f.input(action, 1000, { dx: 0, dz: -1 })).toBe(true);
      expect(f.attackKey).toBe(key);
      const atk = f.attack!;
      expect(f.lungeSpeed(1000 + f.atkWindup)).toBeLessThan(0);
      expect(atk.lunge).toBeLessThan(0);
    }
    // walking toward the opponent is still the plain chain
    const f = fighter();
    f.input('light', 1000, { dx: 0, dz: 1 });
    expect(f.attackKey).toBe('l0');
  });

  it('in the air, light and heavy become jump attacks', () => {
    for (const [action, key] of [['light', 'jl'], ['heavy', 'jh']] as const) {
      const f = fighter();
      expect(f.input('jump', 1000)).toBe(true);
      expect(f.onGround).toBe(false);
      expect(f.input(action, 1100)).toBe(true);
      expect(f.attackKey).toBe(key);
    }
  });

  it("the Warden's heavies all keep their hyper armor", () => {
    for (const key of ['h', 'h1', 'h2', 'dh', 'bh', 'jh'] as AttackKey[]) {
      const f = fighter('juggernaut');
      f.startAttack(key, 1000);
      expect(f.hasHyperArmor(1000 + 50), key).toBe(true);
    }
  });
});
