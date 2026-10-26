/**
 * Recording the trailer (dev only: /?offline&demo, see scripts/record-trailer.cjs). The page plays
 * itself: the in-page server's director stages a string of matches between two computer-run
 * fighters, and the client follows the first of them the way it follows you. Nothing here ships.
 *
 * Each scene is one match: `a` is the fighter the camera follows. `breakFirst` starts the opponent
 * with their posture all but gone, so a blow or two in, `a` executes them; the fighters also throw
 * the odd jump attack, which the computer-run ones don't by themselves.
 */
import { CharacterId } from '../shared/characters';
import { ARENA_MAPS } from '../shared/maps';
import { playerName } from '../shared/names';
import type { Arena } from '../server/arena';
import { BOT_PROFILES, BotBrain } from '../server/bot';
import type { Player, ServerFighter } from '../server/entities';
import type { Director, Game } from '../server/game';

export interface DemoScene {
  a: CharacterId;
  b: CharacterId;
  map: string;
  breakFirst?: boolean;
}

/** The default reel: the Lancer's execution first, then a duel on each arena. */
export const DEMO_SCENES: DemoScene[] = [
  { a: 'lancer', b: 'juggernaut', map: 'summit', breakFirst: true },
  { a: 'ronin', b: 'reaper', map: 'sakura' },
  { a: 'duelist', b: 'shade', map: 'bamboo' },
  { a: 'monk', b: 'paladin', map: 'forge' },
  { a: 'juggernaut', b: 'lancer', map: 'bridge' },
  { a: 'shade', b: 'ronin', map: 'ruins' },
];

/** `?demo=lancer-juggernaut-summit,ronin-reaper-sakura!` picks the scenes (`!`: break the posture first). */
export function parseScenes(spec: string | null): DemoScene[] {
  if (!spec) return DEMO_SCENES;
  const out: DemoScene[] = [];
  for (const part of spec.split(',')) {
    const breakFirst = part.endsWith('!');
    const [a, b, map] = part.replace(/!$/, '').split('-');
    if (a && b && map) out.push({ a: a as CharacterId, b: b as CharacterId, map, breakFirst });
  }
  return out.length ? out : DEMO_SCENES;
}

/** What happened when (page clock, ms), for cutting the reel: each fighter's state and move as it changes. */
export interface DemoEvent {
  t: number;
  scene: number;
  who: 'a' | 'b';
  char: CharacterId;
  state: string;
  key: string | null;
}
const log: DemoEvent[] = [];
(globalThis as unknown as { __demo: DemoEvent[] }).__demo = log;

/** `fightMs`: how long each match is fought before the next scene (the whole match if unset) */
export function demoDirector(getGame: () => Game, scenes: DemoScene[], fightMs = Infinity): Director {
  let next = 0;
  let fightFrom = 0;
  let placed = false;
  let arena: Arena | null = null;
  let broken = false;
  const jumpAt = new Map<ServerFighter, number>();
  const pending: { at: number; f: ServerFighter; heavy: boolean }[] = [];
  const seen = new Map<ServerFighter, string>();

  const stage = (p: Player): boolean => {
    const s = scenes[next++ % scenes.length];
    const game = getGame();
    const map = ARENA_MAPS.find((m) => m.id === s.map) ?? ARENA_MAPS[0];
    p.charId = s.a;
    arena = game.startMatch('casual', p, null, 'hard', map, undefined, { char: s.b, name: playerName() });
    // the camera's fighter plays itself: the server moves it like any computer-run one
    const fa = arena.slots[0];
    fa.owner = null;
    fa.brain = new BotBrain(fa, 'duel', BOT_PROFILES.hard);
    broken = !s.breakFirst;
    fightFrom = 0;
    placed = false;
    jumpAt.clear();
    return true;
  };

  return {
    join: stage,
    matchOver: stage,
    tick(now) {
      const a = arena;
      if (!a) return;
      const [fa, fb] = a.slots;
      for (const [f, who] of [
        [fa, 'a'],
        [fb, 'b'],
      ] as const) {
        const k = `${f.state}:${f.attackKey}`;
        if (seen.get(f) === k) continue;
        seen.set(f, k);
        log.push({ t: performance.now(), scene: next - 1, who, char: f.char.id, state: f.state, key: f.attackKey });
      }
      // the recorder films the fights and skips the rest (see __demoRender in app.ts)
      (globalThis as unknown as { __demoPhase: string }).__demoPhase = `${next - 1}:${a.phase}`;
      if (a.phase === 'countdown' && !placed) {
        placed = true;
        // straight into it: a few steps apart, face to face, at the middle of the arena
        const [s0, s1] = a.map.spawns;
        const mx = (s0.x + s1.x) / 2;
        const mz = (s0.z + s1.z) / 2;
        const len = Math.hypot(s1.x - s0.x, s1.z - s0.z) || 1;
        const ux = (s1.x - s0.x) / len;
        const uz = (s1.z - s0.z) / len;
        a.teleport(fa, mx - ux * 1.8, mz - uz * 1.8, Math.atan2(ux, uz));
        a.teleport(fb, mx + ux * 1.8, mz + uz * 1.8, Math.atan2(-ux, -uz));
      }
      if (a.phase !== 'fight') return;
      fightFrom ||= now;
      if (now - fightFrom > fightMs) {
        arena = null;
        getGame().closeArena(a);
        return;
      }
      if (!broken) {
        broken = true;
        fb.posture = fb.maxPosture * 0.97;
      }
      // the odd jump attack, from a step or two away
      for (const [f, o] of [
        [fa, fb],
        [fb, fa],
      ] as const) {
        const d = Math.hypot(o.x - f.x, o.z - f.z);
        const due = jumpAt.get(f) ?? now + 700 + Math.random() * 1800;
        jumpAt.set(f, due);
        if (now < due || d > 4.2 || d < 1.6 || f.state !== 'idle' || !f.onGround) continue;
        jumpAt.set(f, now + 2500 + Math.random() * 3000);
        if (a.applyInput(f, 'jump', now)) pending.push({ at: now + 170, f, heavy: Math.random() < 0.5 });
      }
      for (const j of pending.filter((x) => now >= x.at)) {
        pending.splice(pending.indexOf(j), 1);
        a.applyInput(j.f, j.heavy ? 'heavy' : 'light', now);
      }
    },
  };
}
