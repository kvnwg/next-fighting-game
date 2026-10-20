# DEFLECT — a samurai dueling arena

A browser-based 1v1 sword-fighting game with deflect-and-posture combat. You walk around a shared lobby with other players, spar or brawl outside the safe zone, and click into **ranked** duels (best of 3 rounds) on one of six arenas. Instead of picking weapons, you pick a **character**, and each character's weapon, quirks and moves are part of who they are.

> All names, models and colours are **placeholders**: blocky stand-ins so the gameplay can be built and tuned now. Character designs are meant to be swapped in later (see [Designing characters](#designing-characters)). The working title "DEFLECT" lives in `src/shared/config.ts`.

![stack](https://img.shields.io/badge/three.js-r186-black) ![stack](https://img.shields.io/badge/node-%E2%89%A520-green) ![stack](https://img.shields.io/badge/TypeScript-5-blue)

## Quick start

```bash
npm install
npm run dev          # game server on :3000 + Vite client on :5173
```

Open <http://localhost:5173>, enter a name, and click **Enter the Grounds**. Open a second browser window (or an incognito one, so it gets a separate identity) to test ranked matchmaking against yourself.

Production:

```bash
npm run build        # typecheck + build the client into dist/client
npm start            # one server on $PORT (default 3000) serving the client and the WebSocket
```

### Single player (no server)

The whole game server also runs inside the browser. Open <http://localhost:5173/?offline> in dev, or build a single self-contained page with `npm run build:artifact` (writes `dist/artifact/deflect.html`, which is what the claude.ai artifact is built from). Offline you get:

- the lobby, with roaming AI fighters that pick fights outside the safe zone
- the training dummies and practice matches
- **Ranked vs AI**: opponents matched to your rating, with Elo saved in browser storage

Multiplayer and the shared ladder need the server.

Other scripts: `npm test` (combat rules, server integration and bot-vs-bot match simulations), `npm run typecheck`.

`tests/sim.ts` can simulate complete matches between server-side bots on a fake clock. It's handy for balance passes: run every matchup and compare win rates and how often each outcome (deflect, deathblow and so on) happens. The current numbers are a first pass tuned that way.

Ranked profiles are stored in `data/profiles.json` (`DATA_DIR` overrides the folder). Identity is a random token kept in the browser's localStorage. There are no accounts or passwords yet.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move. **Shift**: tap to dodge, hold to sprint |
| Mouse | Look / aim (click the game to capture the mouse, **Esc** to free it) |
| LMB | Light attack: chain 2-4 hits depending on character |
| RMB | Heavy attack: press **F** during the windup to **feint** |
| F | Guard. Tap it just before a hit lands to **deflect** |
| Space | Jump (evades perilous sweeps) |
| E | Perilous special (unblockable, see below) |
| R | Character ability |
| Tab / Q / MMB | Lock on |
| K / P | Queue ranked / practice vs a bot |
| G | Challenge the player you're looking at to a casual duel (Y/N to answer) |
| C / L / H | Characters / Ranked ladder / Help and settings |
| Enter | Chat |

**Phones and tablets** get on-screen controls automatically (or add `?touch` to the URL to force them on, `?touch=0` to force them off). Play in landscape.
- **Move:** put your left thumb anywhere on the left side; the stick appears under it.
- **Look:** drag anywhere else.
- **Buttons** (right side, from `src/client/touch.ts`): **Parry** (tap to deflect, hold to block), **Heavy**, **Dodge** (hold to sprint), **Light** and **Jump**.
  - Smaller buttons handle the character ability and lock-on.
  - **Special** pops up above Heavy once the special meter is full.
- **Menu and chat:** use the two buttons at the top left.
- **Challenge:** tap the on-screen prompt to challenge the player in front of you.

## Art style

The game renders in one of two looks, picked under **Help → Settings → Art style**:

- **Clean** (default): full resolution with smooth texture filtering and cel shading. Fighters get a soft ink outline and a rim light from the sun's side. Distant mountains fade into the haze, there's a wide bloom on lanterns and the sun, and a colour grade with cool shadows and warm highlights. FXAA smooths the edges. On high-density phone screens the render resolution is capped so it stays smooth.
- **Pixel**: the original chunky 3D pixel look, snapped to a fixed palette, with a pixel-size slider.

Both share `src/client/render/renderer.ts`; the clean path is the `CLEAN` define in its composite shader. In the dev viewer, add `&style=pixel` to compare.

## Combat

- **Health and posture.** Blocking a hit costs posture. When posture fills you're **posture broken**: helpless for ~1.8s, and the next hit is a **Deathblow** (40 damage). Posture regenerates when you stop taking posture damage: faster while guarding, slower when your health is low.
- **Deflect.** Pressing guard within ~200ms before a hit lands deflects it. Deflecting costs you almost nothing and hammers the attacker's posture. It also makes them recoil, and heavier swings recoil longer: deflecting a heavy or perilous attack gives you a free counter, while deflecting a quick poke only gives you the initiative. Mashing guard shrinks your deflect window (only whiffed presses count as spam).
- **Special meter.** The thin bar under each fighter's health fills as their special recharges. It starts empty each round and fills over the special's cooldown (about 7s), and when it's full the special is ready.
- **Perilous attacks (危).** Every character's special (**E**) is unblockable and flashes a red glyph:
  - **Thrust**: deflect it, or dodge *into* it for a counter that wrecks their posture.
  - **Sweep**: jump over it.
  - **Grab**: dodge or jump away.
- **Feints.** Heavies (and all of the Duelist's attacks) can be cancelled into guard during the windup.
- **Hit stun.** After being hit you can guard again after 140ms, so a deflect can always interrupt a combo.
- **Dodge.** Short dash with invulnerability frames and a cooldown. The Shade has two charges.
- **Hyper armor.** Some attacks (Juggernaut heavies, War Cry) take damage without being interrupted.

### Netcode

The server is authoritative for combat. Each client predicts its own actions with the same state machine (`src/shared/fighter.ts`), so attacks start instantly. Defensive inputs (guard, dodge, jump) are **lag-compensated**: the client sends the server time it was seeing when the key was pressed, and the server waits up to `ping/2 + 35ms` before finalising a hit, so your deflect counts if you pressed it in time on your own screen (capped at 220ms). Remote players are interpolated 100ms behind, but their attack animations are timed off the server clock, so the windup you react to lines up with the hit.

## Characters

| | Weapon | Role | Passive | Perilous (E) | Ability (R) |
|---|---|---|---|---|---|
| **Ronin** | Katana | All-rounder | +40ms deflect window | Piercing Thrust (thrust) | **Iai Stance**: next attack is a near-instant draw cut |
| **Juggernaut** | Greathammer | Heavy bruiser | Heavies have hyper armor | Earthshaker (sweep) | **War Cry**: 5s of hyper armor and +20% damage |
| **Duelist** | Rapier | Fencer / mind games | Faster attack after a deflect; lights can feint | Coup de Grace (thrust) | **Fleche**: 6m running thrust |
| **Lancer** | Spear | Zoner | Tip hits deal +25% | Whirlwind (sweep) | **Pole Vault**: invulnerable 6m backflip |
| **Shade** | Twin Daggers | Assassin | 2 dodge charges, +40% backstab damage | Throat Grab (grab) | **Shadow Step**: blink behind a target |
| **Reaper** | Scythe | Sustain / control | Heals 20% of damage dealt | Reaping Arc (sweep) | **Soul Hook**: drag a target from 11m |
| **Monk** | Gauntlets | Posture breaker | +15% posture damage, faster posture regen | Iron Grapple (grab) | **Still Water**: counter stance |
| **Paladin** | Sword & Shield | Defender | Blocking costs 30% less posture, wider guard | Holy Lance (thrust) | **Shield Charge**: undeflectable 5m charge |

You can switch characters in the lobby safe zone (press **C**).

## Lobby, ranked and maps

- **Lobby (Proving Grounds).** You spawn in the shrine plaza, which is a **safe zone** where nobody can be damaged. Outside it, anyone can fight anyone, and you respawn in the plaza after dying. The **training yard** to the east has a passive dummy and a **sparring dummy** that swings at you, so you can practise deflects and perilous counters. The wooden board in the plaza shows the top of the ladder.
- **Ranked.** Press **K** or click **Ranked** to queue. Matchmaking pairs the closest ratings, and the allowed gap widens the longer you wait. Matches are best of 3 rounds with a 90s round timer (on time-out, the higher health % wins the round) on a random arena. Ratings are Elo: K=64 for your first 5 placement matches, 32 afterwards, 24 at Grandmaster. Leaving a ranked match counts as a loss.
- **Tiers:** Bronze, Silver (850), Gold (1000), Platinum (1150), Diamond (1300), Master (1450), Grandmaster (1600). Each tier below Grandmaster has three divisions (III, II, I). Everyone starts at 900 MMR.
- **Practice** puts you in the same match flow against an Easy, Normal or Hard bot, unranked. **Challenges** (G) start a casual duel with another player.

**Arenas:**

1. **Sakura Courtyard**: walled temple courtyard; lanterns and trees break sightlines.
2. **Moonlit Grove**: night-time bamboo forest full of cover.
3. **Frozen Summit**: mountaintop with no walls; fall off and you lose the round.
4. **Molten Forge**: lava pools in the corners burn you.
5. **Sky Bridge**: a narrow bridge over the clouds with a central platform; ring-outs are deadly.
6. **Sunken Ruins**: rainy ruins with pillars and broken walls.

## Project layout

```
src/shared/      code used by both client and server
  config.ts        all tuning constants (timings, windows, match rules)
  characters.ts    the roster: stats, move lists, passives, abilities, palettes
  fighter.ts       combat state machine (attacks, guard, deflect windows, dodge, feints)
  combat.ts        hit resolution: deflect/block/hit/deathblow/perilous rules
  maps.ts          lobby + 6 arenas (floors, props, hazards, spawns, themes)
  physics.ts       character movement and collision
  ranks.ts         tiers, divisions, Elo
  protocol.ts      WebSocket message types
src/server/      Node WebSocket server
  game.ts          connections, queue/matchmaking, challenges, results
  instance.ts      authoritative simulation + lag-compensated hit resolution
  lobby.ts         safe zone, respawns, dummies     arena.ts   best-of-3 match flow
  bot.ts           AI opponents                     store.ts   profile persistence
src/client/      three.js client
  render/          renderer (clean cel-shaded or 3D pixel), character rig + animation, weapons, maps, effects
  app.ts           main loop + networking glue      local.ts   local player prediction
  ui.ts            HUD, menus, character select, ladder, results
tests/           vitest: combat rules + server integration
scripts/         headless-browser screenshot helpers used during development
```

### Look and feel

The UI is styled after ink-and-lacquer Japanese design: black lacquer panels with gold trim, vermilion seals, washi-paper scrolls for menus and kanji accents (始め on FIGHT, 勝利 on a win, 死 on death).
- **Fonts:** all from Google Fonts.
  - **Yuji Mai** (brush calligraphy) for kanji and big callouts.
  - **Zen Antique** for headings and names.
  - **Shippori Mincho B1** for text.
  - **DotGothic16** (a Japanese pixel font) for small numbers and key hints.
- **Brushwork:** generated in code by `src/client/ink.ts` and exposed as CSS variables. This covers the enso circles on the touch buttons, the brush strokes behind banners, the paper grain and the seigaiha waves on the title screen.
- **Where to restyle:** colors and type live at the top of `src/client/styles.css`. Each character and map has a `jp` kanji name in `characters.ts` / `maps.ts`.

### Designing characters

Gameplay lives entirely in `src/shared/characters.ts`: names, stats, frame data, passives and abilities. Change a number there and both the server and the client pick it up.

The look is built in code, so you can replace it piece by piece:

- `src/client/render/character.ts`: the body rig, plus `headgear()` (hats, hoods and helmets per character). Palettes come from `palette` in `characters.ts`.
- `src/client/render/weapons.ts`: one builder per `weaponKind`. The grip sits at the origin and the weapon points along +Z.
- Animations are procedural and authored weapon-first in `src/client/render/anim/styles.ts`. Each weapon has a guard, a block and a moveset. A swing is the path the weapon travels (an arc of blade directions around a pivot, or a line for thrusts and punches) plus how the body coils and uncoils. The arms and legs follow with two-handed IK: hands stay on the grip, feet stay planted.
- `anim/animator.ts` times every move off the attack's windup, active and recovery frames:
  - the weapon chambers, coils, then accelerates through the hit, and the hit lands at the same moment the server resolves it;
  - it overshoots, settles and flows back to guard;
  - each state blends from the current pose, so combos chain from where the last cut ended.
  - Deflects, blocks, hits and war cries add short reactions on top, and impacts freeze both fighters for a few frames (hit-stop).
- Weapon trails are interpolated between frames, so fast swings leave a smooth arc.

Dev viewer:
- `/?viewer` shows all characters cycling through their animations, and `/?viewer&char=ronin` shows just one.
- `/?viewer&anim=sp&t=0.4` freezes a pose.
- `/?viewer&char=ronin&anim=l0&strip=8` lays one move out as 8 frozen moments, side by side. `&chain=l0,l1,l2` (or `stance,ia`, or states like `block,stagger`) plays a sequence, and `&walk=6` adds running.
- `/?viewer&map=forge` previews a map.

### Tuning

All combat timings live in `COMBAT` and `MATCH` in `src/shared/config.ts` (deflect window, stun lengths, deathblow damage, dodge, posture regen, round length and so on). Bot difficulty profiles are in `src/server/bot.ts`.

## Known limitations / next steps

- No real accounts: identity is a browser token. Hook up auth before running a public ranked ladder.
- Movement is client-reported. The server caps speed by state (no walking away while staggered or broken), limits height to real jumps, and measures latency itself. That stops the obvious cheats, but it isn't a fully server-simulated movement model.
- One server process holds everyone. Scaling out would need sharded lobbies and a shared store such as SQLite or Postgres.
- No gamepad support yet (keyboard + mouse, or touch).
