# Shrine Duel

A 1v1 weapon duelling game for the web, built for [CrazyGames](https://www.crazygames.com) on desktop and mobile. It implements the design in *Combat Overhaul: Implementation Plan*: telegraphed attacks, light strings, posture and guard breaks, parries, unblockable criticals, a lock-on camera with punch-ins and shakes, a map and weapon vote, and drop-in ring entrances.

Everything is procedural (low-poly fighters, arenas, effects, and audio synthesized with Web Audio), so the whole game is about 170 KB gzipped.

## Quick start

```bash
npm install
npm run dev          # game client on http://localhost:5173
npm run dev:server   # match server on ws://localhost:2567 (needed for Quick Match and invites)
```

Practice and Play vs Bot work without the server. Online play looks for the server on the page's host at port 2567. Override that with `?server=wss://host:port` on the URL, or with `VITE_SERVER_URL` at build time.

```bash
npm test             # simulation, bot and server tests (vitest)
npm run typecheck    # all three packages
npm run build        # production client in packages/client/dist
npm run start:server # production server (PORT env var, default 2567)
```

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | WASD / arrow keys | Left thumb stick (appears where you touch) |
| Light string (up to 4 hits) | Left click / J | LIGHT (hold to keep chaining) |
| Heavy, hold for an unblockable critical | Right click / K | HEAVY |
| Parry (tap) or block (hold) | F / L | PARRY |
| Dodge (i-frames, 2 charges) | Shift | DODGE |
| Jump, then attack for a plunge | Space | JUMP |
| Menu | P or the pause button | Pause button |

Drag on the right half of a touch screen to look around. The settings menu has volume sliders, graphics quality and a reduce shake and flashes option, plus a left-handed layout on touch devices.

## How a match flows

New players land straight in a practice arena with a training dummy. The dummy blocks after a few hits so you can see posture break, and it throws a slow critical every few seconds so you can practise parrying the white glow. From there:

1. **Quick Match** queues for an online opponent. **Play vs Bot** starts right away, and the bot's difficulty follows your win count. **Invite a Friend** opens a private room and copies an invite link.
2. **Vote** (10 s): one shared map vote and a personal weapon pick (naginata, bo staff or katana), with picks shown live.
3. **Loading**: an establishing shot with the map name and each player's load progress.
4. **Entrances**: the opponent leaps off the pagoda roof, then you, each with a name card. After your first match, any key or tap skips them (online, once both players press).
5. **Rounds**: first to two. The HUD slides in on "Fight".
6. **Results**: rematch or back to practice. This is the only place a midgame ad can play.

## Project layout

```
packages/shared   Deterministic 60 Hz combat sim, frame data, bot AI and network protocol (no DOM, no Three.js)
packages/client   Three.js renderer, camera, effects, HUD and screens, input (keyboard, mouse, touch), audio, CrazyGames SDK wrapper
packages/server   Node WebSocket server: matchmaking, private rooms, and the authoritative match loop
```

The same `Match` class runs the bot match in the browser and the online match on the server. The server simulates every tick from both players' inputs and streams snapshots and events at 30 Hz. Clients only draw what they are told. Inputs are sent as held buttons plus cumulative press counts, so a press is never lost or repeated, even when the server merges or skips input messages.

Combat tuning lives in `packages/shared/src/constants.ts` (stun, posture, parry window, dodge, hitstop) and `packages/shared/src/weapons.ts` (per-move frame data and cancel windows). The tests in `packages/shared/test` pin down the important rules: true strings on hit, a parry gap on block, guard breaks, criticals breaking guard, and bots that lose to mashing on easy but punish it on hard.

## CrazyGames notes

- The SDK (v3) is loaded in `index.html`. `packages/client/src/platform/crazygames.ts` wraps it and falls back cleanly when it is missing or disabled.
- `loadingStart`/`loadingStop` cover boot. `gameplayStart`/`gameplayStop` follow real play (practice and fights), and pause for menus, votes and results.
- Midgame ads only play on the results screen. Audio is muted and the UI is blocked while one plays.
- Multiplayer uses the room API (`updateRoom`, `leftRoom`), invite links and instant multiplayer.
- The SDK's muteAudio setting is respected. Profile and settings are stored with the SDK's Data module, or localStorage outside CrazyGames.
- The build uses relative paths and text selection is disabled. Players land in the practice arena as soon as the page loads, with no splash or menu first. The SDK's device type is only trusted on CrazyGames itself, because its local mode always reports a desktop.

To ship, upload the contents of `packages/client/dist` to CrazyGames. Then deploy the server anywhere that can serve WSS, and build the client with `VITE_SERVER_URL=wss://your-server`.

## Known limits and next steps

- **Online input delay.** Online play has no client-side prediction yet, so your own actions show after one round trip (plus up to one 33 ms snapshot). That is fine on a nearby server. Because the sim is deterministic, local prediction or rollback is the natural next step.
- **Single server, no persistence.** Wins and titles are stored on the client, and rankings and accounts would need a backend.
- **Placeholder art.** Characters and arenas are procedural, and authored models and animations can replace the rig and pose tables without touching the sim.
