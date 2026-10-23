# DEFLECT — a samurai dueling arena

A browser-based 1v1 sword-fighting game with deflect-and-posture combat. You walk around a shared lobby with other players, spar or brawl outside the safe zone, and click into **ranked** duels (best of 3 rounds) on one of six arenas. Instead of picking weapons, you pick a **character**, and each character's weapon, quirks and moves are part of who they are.

> All names, models and colours are **placeholders**: blocky stand-ins so the gameplay can be built and tuned now. Character designs are meant to be swapped in later (see [Designing characters](#designing-characters)). The working title "DEFLECT" lives in `src/shared/config.ts`.

![stack](https://img.shields.io/badge/three.js-r186-black) ![stack](https://img.shields.io/badge/node-%E2%89%A520-green) ![stack](https://img.shields.io/badge/TypeScript-5-blue)

## Quick start

```bash
npm install
npm run dev          # game server on :3000 + Vite client on :5173
```

Open <http://localhost:5173>, tap (or press any key) on the title screen, enter a name, and press **Enter the Grounds**. Open a second browser window (or an incognito one, so it gets a separate identity) to test ranked matchmaking against yourself.

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

### CrazyGames

`npm run build:crazygames` builds the single-player game for [CrazyGames](https://developer.crazygames.com) into `dist/crazygames` (zipped to `dist/crazygames.zip`, ready to upload). It uses relative paths and loads the CrazyGames SDK v3 in the page head. `src/client/platform.ts` wraps the SDK, and every call does nothing off CrazyGames:
- loading and gameplay start/stop (menus, the title screen and results are breaks);
- a midgame ad after a match, never during one, with the game muted while it plays;
- `happytime` on a ranked promotion;
- the platform's mute setting;
- the signed-in player's name;
- settings and progress saved with CrazyGames' data module.

Touch controls switch on by themselves on phones and tablets.

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

## Graphics

Everything in the world is voxels, lit the way a Minecraft shader pack lights them:

- **Post pipeline** (`src/client/render/renderer.ts`): HDR rendering with MSAA, a soft bloom, screen-space god rays from the sun or moon, an ACES tone map and a per-map colour grade (lift, gain, saturation, vignette).
- **Voxel lighting** (`render/gfx/materials.ts`): baked corner ambient occlusion on every voxel, soft sun shadows, leaves that glow when the sun is behind them, a rim light on fighters, and exponential height fog that glows toward the sun.
- **Living world:**
  - Trees, grass and cloth sway in gusting wind.
  - Grass bends away from fighters walking through it.
  - Thousands of voxel petals, leaves, snowflakes, embers and fireflies are animated on the GPU.
  - Water is a planar mirror broken up by ripples, with sun glints and rain rings.
  - Blocky clouds drift overhead, catching the sun on their edges and darkening underneath.
- **Maps** (`render/maps/`): each map is a recipe with a lighting mood (sky, sun, fog, grade, wind) and a build step that places terrain, trees, props and effects from a shared kit.
  - The Sakura Courtyard has a second gate on the sunset side, with a jetty out to a lake and an old cherry tree on an island. `/?viewer&map=sakura&q=high&cam=-14.8,1,12.2&look=-27.4,4.5,12.7` frames it.
- **Quality:** **Help → Settings → Graphics** picks Low, Medium, High, Ultra or Auto. Auto picks a tier for the device and then adjusts the render resolution to hold the frame rate.
  - Each tier sets shadow size, reflections, god-ray samples, grass and particle density, and scenery detail (`render/gfx/quality.ts`).
  - Trees are instanced in chunks that the camera and the shadow pass can skip.

## Combat

- **Health and posture.** Blocking a hit costs posture. When posture fills you're **posture broken**: helpless for ~1.8s, and the next hit is a **Deathblow** (40 damage). Posture recovers slowly and only once you stop: never while attacking, dodging or reeling, and not until 4s after the last posture damage and 3s after you last attacked, dodged or reeled; then it refills quickly (faster while guarding). A break that ends without a Deathblow leaves the guard whole.
- **Deflect.** Pressing guard within ~200ms before a hit lands deflects it. Deflecting costs you almost nothing and hammers the attacker's posture. It also makes them recoil, and heavier swings recoil longer: deflecting a heavy or perilous attack gives you a free counter, while deflecting a quick poke only gives you the initiative. Mashing guard shrinks your deflect window (only whiffed presses count as spam).
- **Special meter.** The thin bar under each fighter's health fills as their special recharges. It starts empty each round and fills over the special's cooldown (about 7s), and when it's full the special is ready.
- **Perilous attacks (危).** Every character's special (**E**) is unblockable and flashes a red glyph:
  - **Thrust**: deflect it, or dodge *into* it for a counter that wrecks their posture.
  - **Sweep**: jump over it.
  - **Grab**: dodge or jump away.
- **Feints.** Heavies (and all of the Duelist's attacks) can be cancelled into guard during the windup.
- **Hit stun.** After being hit you can guard again after 140ms, so a deflect can always interrupt a combo.
- **Dodge.** Short dash with invulnerability frames and a cooldown. The Assassin has two charges.
- **Hyper armor.** Some attacks (Warden heavies, War Cry) take damage without being interrupted.

### Netcode

The server is authoritative for combat. Each client predicts its own actions with the same state machine (`src/shared/fighter.ts`), so attacks start instantly. Defensive inputs (guard, dodge, jump) are **lag-compensated**: the client sends the server time it was seeing when the key was pressed, and the server waits up to `ping/2 + 35ms` before finalising a hit, so your deflect counts if you pressed it in time on your own screen (capped at 220ms). Remote players are interpolated 100ms behind, but their attack animations are timed off the server clock, so the windup you react to lines up with the hit.

In a lobby, each player is sent what's near them (`INTEREST` in `src/shared/config.ts`): fighters within 40m on every snapshot (20 a second), everyone farther away on every fourth, and combat effects and state changes only from within 60m. Clients draw far-off fighters a little further behind so they still glide. A full lobby of 24 spread over the grounds costs each player about 30 KB/s; packed into one spot it's about 60 KB/s, what it was before (everyone is near everyone).

## Characters

| | Weapon | Role | Passive | Perilous (E) | Ability (R) |
|---|---|---|---|---|---|
| **Ronin** | Katana | All-rounder | +40ms deflect window | Piercing Thrust (thrust) | **Iai Stance**: next attack is a near-instant draw cut |
| **Warden** | Warhammer | Heavy bruiser | Heavies have hyper armor | Earthshaker (sweep) | **War Cry**: 5s of hyper armor and +20% damage |
| **Duelist** | Rapier | Fencer / mind games | Faster attack after a deflect; lights can feint | Coup de Grace (thrust) | **Fleche**: 6m running thrust |
| **Lancer** | Golden Spear | Zoner | Tip hits deal +25% | Whirlwind (sweep) | **Pole Vault**: invulnerable 6m backflip |
| **Assassin** | Twin Daggers | Assassin | 2 dodge charges, +40% backstab damage | Swallow Dive (a diving grab) | **Shadow Step**: blink behind a target |
| **Wraith** | Scythe | Sustain / control | Heals 20% of damage dealt | Reaping Arc (sweep) | **Soul Hook**: drag a target from 11m |
| **Monk** | Fists | Posture breaker | +15% posture damage, faster posture regen | Iron Grapple (grab) | **Still Water**: counter stance |
| **Knight** | Greatsword & Shield | Defender | Blocking costs 30% less posture, wider guard | Holy Lance (thrust) | **Shield Charge**: undeflectable 5m charge |

You can switch characters in the lobby safe zone (press **C**).

## Lobby, ranked and maps

- **Lobby (Proving Grounds).** You spawn in the shrine plaza, which is a **safe zone** where nobody can be damaged. Outside it, anyone can fight anyone, and you respawn in the plaza after dying. The **training yard** to the east has a passive dummy and a **sparring dummy** that swings at you, so you can practise deflects and perilous counters. The wooden board in the plaza shows the top of the ladder.
- **Lobbies of 24.** Each lobby holds up to 24 players (`LOBBY_CAP`); when they're all full another one opens. Newcomers join the busiest lobby with room, you go back to your own lobby after a match if there's space, and empty lobbies close. The HUD shows which one you're in ("Grounds 2 · 18/24") once there's more than one. Ranked matchmaking and chat span every lobby.
- **Dueling rings.** Six sand rings ringed with lanterns stand around the grounds. Challenge someone (G) while you both stand in the same free ring and the duel is fought right there:
  - the ring seals behind a wall of light, you're both made whole and set apart facing each other, and a 3s countdown starts;
  - only the two of you can land blows, nobody else can step in, and neither of you can step out;
  - a KO ends it, or after 90s the healthier fighter wins. Walking away (leaving, disconnecting) loses it, and the result goes out to the lobby;
  - the loser gets back up where they fell, and the ring opens again.

  Spectators see who's fighting and the clock over the ring. A challenge made anywhere else still goes to a private arena.
- **Ranked.** Press **K** or click **Ranked** to queue. Matchmaking pairs the closest ratings, and the allowed gap widens the longer you wait. Matches are best of 3 rounds with a 120s round timer (on time-out, the higher health % wins the round) on a random arena. Ratings are Elo: K=64 for your first 5 placement matches, 32 afterwards, 24 at Grandmaster. Leaving a ranked match counts as a loss.
- **Tiers:** Bronze, Silver (850), Gold (1000), Platinum (1150), Diamond (1300), Master (1450), Grandmaster (1600). Each tier below Grandmaster has three divisions (III, II, I). Everyone starts at 900 MMR.
- **Practice** puts you in the same match flow against an Easy, Normal or Hard bot, unranked. **Challenges** (G) start a casual duel with another player: in a private arena, or right there if you're both in a dueling ring.
- **Map and fighter select.** Every duel opens with a 10s vote: each side picks an arena (or Random) and a fighter, with portrait badges showing both picks. When the two map votes differ, a coin flip decides between them.
- **Ring entrances.** Before round one the camera films each fighter's entrance in turn: the opponent's, then yours, then a swing behind your shoulder. Each entrance is 3.6s in three shots, with its own choreography, sounds, effects (lightning, fog, embers…) and a name card revealed in the fighter's style, with their line.

**Arenas:**

1. **Sakura Courtyard**: walled temple courtyard; lanterns and trees break sightlines.
2. **Moonlit Grove**: a night-time clearing walled in by bamboo, open floor.
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
  render/          HDR renderer + post pipeline, character rig + animation, weapons, effects
    gfx/             voxel mesher, trees, props, sky + clouds, water, grass, GPU particles, shared shaders
    maps/            one recipe per map (lighting mood + build) on a shared kit
  app.ts           main loop + networking glue      local.ts   local player prediction
  ui.ts            HUD, menus, character select, ladder, results
  title/           the title screen: the Ronin on the cliff, the camera shots, the way into the game
tests/           vitest: combat rules + server integration
scripts/         headless-browser screenshot helpers used during development
```

### Title screen

`src/client/title/` plays the way in, over a 3D scene of its own (`render/maps/title.ts`): a promontory over a deep valley at sunset, with a forest of pines and cherries around a lake, a river winding toward a great snow-capped peak, and an old cherry shedding petals over the edge.

- **The Ronin** (`title/ronin.ts`) sits at the tip with his legs over the drop, built from his voxel model on a rig of his own: two-bone IK keeps his hands on his knees, his robe is re-draped for sitting (a morph target lets it fall straight again when he stands), and a long crimson scarf streams off his collar. The scarf, the hem and his hair move in a cloth shader that sends waves down them, on the world's wind, and gusts harder on cue.
- **The flow** (`title/screen.ts`):
  1. **Boot:** the frame dissolves in from black through an ordered dither while big pixels resolve into the scene, close on his back, and the camera pulls back over the valley.
  2. **Tap to continue:** the logo drops in letter by letter and the 弾 hanko stamps down with a taiko hit. Any tap, click or key moves on.
  3. **Name:** a gust whips his scarf, the camera swings out over the drop to his side, and a pixel-bordered panel opens and types out its question. Typing throws off pixel sparks.
  4. **Forging:** a block bar fills while the game connects and makes (or finds) your account.
  5. **Welcome:** he turns to look at you, your initial is stamped on a seal beside your name and rank, and he rises and sets his hand on his sword.
  6. **The cut:** a blade of light crosses the screen, the last frame splits along it and falls away, and the lobby is behind it. The game's messages are held back (`Net.hold`) until then.
- If the connection drops, you land back on the cliff at the name panel.
- **Post effects** (`render/renderer.ts`): the final composite can pixelate the frame (`pixelate`, in CSS pixels) and dissolve it through a 4x4 Bayer dither (`fade`). The title uses both for its reveals and transitions.

### Look and feel

The UI keeps out of the way of the world: frosted-glass panels with thin borders, pixel type, and a few kanji accents (始め on FIGHT, 勝利 on a win).
- **Fighter cards** have an angled gold health bar with a red damage trail that drains a beat after each hit.
- **Posture bars**: yours at the bottom centre, your opponent's floating above their head. White is the guard left; it drains from both ends toward the shield, which cracks as it gets low, and the bar disappears while the guard is broken. The round clock sits in a hexagon in the middle, with the round number under it.
- **Fonts** (Google Fonts): every word in the game is pixel type. **Pixelify Sans** for everything you read, **Silkscreen** for big display lines (the logo, your name on the title screen), and **DotGothic16** for the kanji. Text drawn into textures (the 危 glyph, the ladder board) uses the same fonts.
- **Where to restyle:** colours and type live at the top of `src/client/styles.css`. Each character and map has a `jp` kanji name in `characters.ts` / `maps.ts`.
- **Camera** (`src/client/camera.ts`):
  - A match opens on a close-up of your opponent, then of you, before the camera swings round behind your shoulder.
  - Deathblows, broken guards and mikiri counters punch it in; heavy hits knock it along the blow.
  - Shakes are smooth and add up. "Reduce camera shake" in the settings calms all of it.

### Designing characters

Gameplay lives entirely in `src/shared/characters.ts`: names, stats, frame data, passives and abilities. Change a number there and both the server and the client pick it up.

The look is built in code, so you can replace it piece by piece:

- `src/client/render/character.ts`: the body rig, plus `headgear()` (hats, hoods and helmets per character). Palettes come from `palette` in `characters.ts`.
- `src/client/render/weapons.ts`: one builder per `weaponKind`. The grip sits at the origin and the weapon points along +Z.
- Animations are procedural and authored weapon-first, one moveset per weapon in `src/client/render/anim/moves/` (registered in `anim/styles.ts`, vocabulary in `anim/author.ts`).
  - A move is choreography along one axis, s. The weapon travels a path: an arc of blade directions around a pivot, a straight line (thrusts, punches), a sequence of those, or a baked clip. Body keys along the same axis say how the body coils and uncoils, with whole-body spins, flips and hops.
  - Effect cues (dust, shockwaves, petals, holy light, roars...), afterimages, kicks and the trail's look sit on the same axis, so a move reads as one piece of choreography.
  - The arms and legs follow with IK: hands stay on the grip, feet stay planted.
- `anim/animator.ts` times every move off the attack's windup, active and recovery frames:
  - the weapon chambers, coils, then accelerates through each hit, landing at the same moment the server resolves it (multi-hit moves spread their strikes the way the server spreads hits);
  - every attack, however quick, is telegraphed: the chamber is pushed well past what's authored, and the whole body winds up on top of it (sinks, rears back, coils away from the strike, draws the weapon back and up) within the first third of the windup and holds there until it snaps through (`anticipate` in `animator.ts`);
  - spins can wind up continuously (`flow`), and baked clips keep their own rhythm (`linear`);
  - it overshoots, settles (or plays a flourish) and flows back to guard;
  - each state blends from the current pose, so combos chain from where the last cut ended.
  - Deflects, blocks, hits and war cries add short reactions on top.
- Hit feel: impacts freeze both fighters for a few frames (longer for heavies), sparks spray the way the weapon was travelling, fast swings leave smear frames, and knockback is a slide that eases to a stop.
- Weapon trails are interpolated between frames, so fast swings leave a smooth arc.
- Some of the Knight's moves are baked from Quaternius' [Universal Animation Library 2](https://quaternius.com) (CC0) with `scripts/bake-anim.ts`, which retargets a glTF clip's body and fists onto this rig.

Dev viewer:
- `/?viewer` shows all characters cycling through their animations, and `/?viewer&char=ronin` shows just one.
- `/?viewer&anim=sp&t=0.4` freezes a pose.
- `/?viewer&char=ronin&anim=l0&strip=8` lays one move out as 8 frozen moments, side by side.
  - `&chain=l0,l1,l2` (or `stance,ia`, `roar`, or states like `block,stagger`) plays a sequence, and `&walk=6` adds running.
  - `&target` marks where the opponent stands, `&at=300,340` freezes exact moments (ms), `&top` looks straight down, and `&ghosts` shows afterimages and smears.
- `/?viewer&fxtest` shows the impact effects side by side.
- `/?viewer&map=forge` previews a map, and `&shot=1.8` freezes the match intro 1.8s in (camera and ring entrances), with the fighters on the real spawns; `&chars=monk,lancer` picks you and the opponent.
- `/?viewer&char=lancer&anim=entrance&strip=8` lays out a ring entrance.
  - `&q=high` picks a quality tier, `&cam=x,y,z&look=x,y,z&fov=60` places the camera, and `&time=8&freeze` stops the wind and particles at a moment.

### Tuning

All combat timings live in `COMBAT` and `MATCH` in `src/shared/config.ts` (deflect window, stun lengths, deathblow damage, dodge, posture regen, round length and so on). Bot difficulty profiles are in `src/server/bot.ts`.

## Known limitations / next steps

- No real accounts: identity is a browser token. Hook up auth before running a public ranked ladder.
- Movement is client-reported. The server caps speed by state (no walking away while staggered or broken), limits height to real jumps, and measures latency itself. That stops the obvious cheats, but it isn't a fully server-simulated movement model.
- One server process holds every lobby and match. Scaling past one machine would need lobbies spread over several processes and a shared store such as SQLite or Postgres.
- No gamepad support yet (keyboard + mouse, or touch).

## Voxel characters

Eight voxel fighters designed from reference art, ready to bring into the game. Each lives in `characters/<name>/`:

- `model.js`: the voxel model, authored in code on a bone rig (T-pose rest), plus named poses and any held weapon as its own model
- `sheet.html`: character sheet (T-pose, A-pose, side, back)
- `viewer.html` (ronin only): orbit viewer; serve the repo root (`npx http-server .`) and open it
- `renders/`: PNG output of the sheet, plus `portrait.png` (head and shoulders)
- `export/`: MagicaVoxel `.vox` of each model's T-pose and a `_rig.json` (bones, pivots, per-bone voxels)

Characters: `ronin`, `warden`, `wraith`, `lancer`, `assassin`, `duelist`, `monk`, `knight`.

Ring entrance cinematics (shot lists with camera, sound and visual effects) live in `characters/intros.js`, with a readable copy in `docs/ring-intros.md`. The game plays a condensed 3.6s version of each: the choreography is the weapon style's `entrance` move, and the camera shots, sound cues and name cards are in `src/client/entrances.ts`.

Shared tooling is in `tools/voxel/`. To regenerate:

```sh
npm run render:voxel -- characters/ronin   # behind a proxy: NODE_USE_ENV_PROXY=1 npm run render:voxel -- characters/ronin
npm run export:voxel -- characters/ronin
npm run render:portraits
```
