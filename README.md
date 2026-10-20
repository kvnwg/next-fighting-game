# DEFLECT — a 3D pixel dueling arena

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

Other scripts: `npm test` (combat rules plus server integration tests), `npm run typecheck`.

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

## Combat

- **Health and posture.** Blocking a hit costs posture. When posture fills you're **posture broken**: helpless for ~1.8s, and the next hit is a **Deathblow** (40 damage). Posture regenerates when you stop taking posture damage: faster while guarding, slower when your health is low.
- **Deflect.** Pressing guard within ~200ms before a hit lands deflects it. Deflecting costs you almost nothing and hammers the attacker's posture, recoiling them long enough for a guaranteed counter. Mashing guard shrinks your deflect window (only whiffed presses count as spam).
- **Perilous attacks (危).** Every character's **E** move is unblockable and flashes a red glyph:
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
| **Reaper** | Scythe | Sustain / control | Heals 25% of damage dealt | Reaping Arc (sweep) | **Soul Hook**: drag a target from 11m |
| **Monk** | Gauntlets | Posture breaker | +25% posture damage, faster posture regen | Iron Grapple (grab) | **Still Water**: counter stance |
| **Paladin** | Sword & Shield | Defender | Blocking costs 40% less posture, wider guard | Holy Lance (thrust) | **Shield Charge**: undeflectable 5m charge |

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
  render/          pixel renderer, character rig + animation, weapons, maps, effects
  app.ts           main loop + networking glue      local.ts   local player prediction
  ui.ts            HUD, menus, character select, ladder, results
tests/           vitest: combat rules + server integration
scripts/         headless-browser screenshot helpers used during development
```

### Designing characters

Gameplay lives entirely in `src/shared/characters.ts`: names, stats, frame data, passives and abilities. Change a number there and both the server and the client pick it up.

The look is built in code, so you can replace it piece by piece:

- `src/client/render/character.ts`: the body rig, plus `headgear()` (hats, hoods and helmets per character). Palettes come from `palette` in `characters.ts`.
- `src/client/render/weapons.ts`: one builder per `weaponKind`. The grip sits at the origin and the weapon points along +Z.
- Animations are procedural poses (guard, block and keyframes per `AttackAnim`) in `character.ts`, timed by each attack's windup, active and recovery frames. Every move animates in sync with its gameplay timing automatically.

Dev viewer: open `/?viewer` to watch all characters cycle through their animations. `/?viewer&anim=sp&t=0.4` freezes a pose, and `/?viewer&map=forge` previews a map.

### Tuning

All combat timings live in `COMBAT` and `MATCH` in `src/shared/config.ts` (deflect window, stun lengths, deathblow damage, dodge, posture regen, round length and so on). Bot difficulty profiles are in `src/server/bot.ts`.

## Known limitations / next steps

- No real accounts: identity is a browser token. Hook up auth before running a public ranked ladder.
- Movement is client-reported (with speed sanity checks on the server), which is fine for friends but not cheat-proof.
- One server process holds everyone. Scaling out would need sharded lobbies and a shared store such as SQLite or Postgres.
- Keyboard and mouse only; no gamepad or touch controls yet.
