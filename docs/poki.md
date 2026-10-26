# Putting Deflect on Poki

This picks up where [crazygames.md](crazygames.md) leaves off. The Fly.io server, the music licences and the
gameplay video are the same as for CrazyGames and aren't repeated here. This page covers only what Poki asks
for differently.

Poki's own guide: <https://developers.poki.com/guide/requirements-quality> (the rules) and
<https://developers.poki.com/guide/how-testing-works> (what happens after you upload).

## What the Poki build already does

`npm run build:poki` (`scripts/build-poki.mjs`, `VITE_PLATFORM=poki`) differs from the CrazyGames build in these ways:

| Poki rule | In the Poki build |
| --- | --- |
| Poki's SDK, its events in the right order | `src/client/platform.ts`: `gameLoadingFinished` once the title is up; `gameplayStart` when you enter the grounds (your first input), never on load; `gameplayStop` for menus, the fighter select and the result card, and `gameplayStart` again after them. Repeats are dropped, and no events are sent while an ad plays. |
| `commercialBreak` only on the way back into play | After every match, as the result card goes, and when a menu closes. Only in the lobby's safe zone, and not while queued for ranked, so nobody gets hit or misses a match during an ad. Poki decides whether an ad plays: the game has no timers of its own for these. |
| Rewarded videos: opt-in, 🎬 icon, not green, Continue beside them | Shop: "Watch an ad, +30 coins" (red, with a clapperboard). After a win, about one match in three: **Continue** and **🎬 +50 coins** side by side, the same size, Continue first. Letting the card go counts as Continue. No reward without a finished video, and none when an adblocker stops the SDK. |
| Audio muted, input off during ads | Muted only while an ad really plays. The cursor is freed and keys let go. |
| No outside requests | The fonts ship in the build (`src/client/assets/fonts`, made by `scripts/subset-fonts.py`). The build fails if anything else loads from outside. The game server is the one exception, and needs approval (step 4 below). |
| No chat | Text chat is off: no chat box, no Enter-to-chat, no chat button on touch, and other players' messages aren't shown. Poki players share lobbies with CrazyGames players, who still chat among themselves. |
| No visible body fluids | Blood is replaced by pale sparks, and there are no splats on the ground. |
| Links out go through `PokiSDK.openExternalLink` | Every `http(s)` link in the game (music credits, privacy policy). |
| No page scrolling | Arrow keys, space and the mouse wheel never scroll Poki's page. Text boxes and scrolling menus keep working. |
| Privacy policy linked in the game | Help page → "privacy policy", served by the game server at `/privacy` (`src/server/privacy.html`). |
| Easy start | A first-time player finds a name already typed in, so it's one key or tap and then Enter. |
| No dev tools | The `?viewer` model viewer is left out. |
| Invites | Private-lobby invite links are Poki links (`shareableURL`, read back with `getURLParam`). |

Other rules the game already met: one currency (coins), no in-app purchases, other ad systems or logins,
playable in incognito, mobile and tablet controls, landscape on phones (it turns itself when held upright).

## 1. Give the privacy policy an address to write to

The server's privacy page needs a contact address. It reads it from a Fly secret, so it stays out of the repo:

```
fly secrets set PRIVACY_CONTACT=you@example.com
```

## 2. Deploy the server

The server changed: it now serves `/privacy`.

```
fly deploy --ha=false
```

Check <https://deflect-duels.fly.dev/privacy> (your app's name in place of deflect-duels). It should show your address at the
bottom. `fly logs` warns at startup if `PRIVACY_CONTACT` is missing.

## 3. Build and test

```
npm ci
npm run build:poki
```

This writes `dist/poki` and `dist/poki.zip` (about 17 MB, 1.5 MB of it before the title shows; sounds and
music load after). Open <https://inspector.poki.dev>, drop the `dist/poki` folder on it, and work through its
checklist:

- the Event Log shows `gameLoadingFinished` at the title, `gameplayStart` only after Enter, and
  `gameplayStop` → `commercialBreak` → `gameplayStart` when you open and close Help in the plaza;
- Mobile mode → scan the QR code: touch controls, the game turns to landscape, and the Poki pill (the
  little button at the top centre) doesn't cover anything you need. In a match it sits near the round timer;
  if that's a problem, `PokiSDK.movePill` can move it;
- the shop's ad button and the after-win offer play a test video and pay coins;
- an adblocker on: the game still plays, and the ad buttons just don't pay.

Until Poki approves the server (next step), the game can't connect from Poki: expect "Could not reach the
game server" on the title, and an External Resources warning in the Inspector.

To check the whole game first, build against a local server: `DEFLECT_SERVER=ws://localhost:3000/ws npm run build:poki`
with `npm run dev:server` running, and serve `dist/poki` over http.

## 4. Poki for Developers

At <https://developers.poki.com>:

1. **Add the game** and **upload** `dist/poki.zip` as a version. Or upload from the terminal:
   ```
   npx @poki/cli init --game <the game id from the address bar> --build-dir dist/poki
   npx @poki/cli upload --name "$(git rev-parse --short HEAD)" --notes "$(git log -1 --pretty=%B)"
   ```
   (`init` writes `poki.json`; commit it. The first upload opens a browser to sign in.)
2. **Settings → CSP**: ask for the game server. Paste this:

   > **Resource:** `wss://deflect-duels.fly.dev` (WebSocket, path `/ws`)
   >
   > **Why:** Deflect is an online 1v1 dueling game. This is its game server: the shared lobby, ranked
   > matchmaking, the matches themselves and players' progress (rating, coins, unlocked fighters). The game
   > can't be played without it. It's our own server on Fly.io, with no third-party services, no analytics
   > and no personal data beyond the fighter name a player picks. Text chat is turned off in the Poki build.
   >
   > **Privacy policy:** https://deflect-duels.fly.dev/privacy (linked in the game from the Help page)

   Once it's approved, **upload the build again**: Poki only lets the requests through on a fresh upload.
3. **Settings**: title, categories (up to four) and description. Paste-ready text is below.
4. **Thumbnails**: upload `docs/poki/thumbnail.jpg` (1080×1080, no text). `docs/poki/thumbnail-alt.jpg` is a second option.
5. Wait for the content check on the new version, then **request a playtest**: desktop and mobile, with the
   fighting or multiplayer audience. 10 recordings come back, usually within hours.
6. Watch all 10. That unlocks the **player fit test** (500 players, about 5 hours). Poki calls it healthy at
   3+ minutes average playtime with 25%+ of plays over 3 minutes.
7. Then the **web fit test** (about a week): aim for 65%+ of players starting to play, and 5+ minutes average
   playtime.

### Settings text

**Title:** Deflect

**Categories** (pick four from Poki's list), e.g.: Fighting · Sword · Multiplayer · 3D

**Description:**

> Read the swing, then strike back. Deflect is a 3D pixel-art sword duel: press guard the instant a blow
> lands to deflect it, crack your opponent's posture, and finish them with a deathblow. Choose from eight
> fighters, each with their own weapon, from the Ronin's katana to the Warden's warhammer, and duel players
> from around the world in ranked matches, or practise against the computer first. Win coins to unlock new
> fighters and arenas, and climb the ladder from Unranked to the top.

**Controls:**

> Desktop: WASD to move, mouse to look, left click for a light attack, F for a heavy attack, right click to
> guard (tap it just before a hit to deflect), Space to jump, Shift to dodge, E for your special, R for your
> ability. M opens the play menu.
> Mobile: a thumbstick on the left moves, drag anywhere else to look, and the buttons on the right attack,
> parry, dodge and jump.

## Later: the animated thumbnail

Poki asks for it once the game reaches Soft Release, before the global release. It's a muted square video
that plays when players hover over the thumbnail:
1080×1080 or larger, 50 fps or more, 4–6 seconds, `.mp4`, under 100 MB. Use 2–3 shots of 1–2 seconds,
starting from the still thumbnail's look, with no interface and no cursor. The trailer mode
(`npm run dev:client`, then `/?offline&demo=ronin-reaper-sakura`) plays duels by itself. Record it with
OBS at 60 fps and crop it to a square around the fighters.

## Open questions Poki may raise

- **The match intro can't be skipped.** Poki wants every intro and cutscene skippable. The fighters'
  entrances and the countdown take 12.5 s, timed by the server for both players at once. Skipping it would
  need both players to agree, or a shorter intro on Poki. This is the most likely review comment.
- **Portrait.** Poki strongly advises a game that plays held upright (more players start, and the game can
  get the bar ads). Deflect turns itself to landscape instead.
- **Pause.** Poki expects Esc or Space to pause keyboard games. An online duel can't pause: Esc frees the
  cursor and closes menus.
- **Profanity list.** Poki asks multiplayer games with names to use their bad-word list and add to it.
  Names are filtered with the list CrazyGames provides (`src/server/blocklist.txt`). If Poki sends theirs,
  add its words to that file.
- **Fullscreen** is Poki's call, made during release. Online multiplayer games often get it.
