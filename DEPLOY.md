# Launching multiplayer

Everything online runs in **one server process**: it serves the game's own site and the WebSocket
every player connects to, runs every lobby and match in memory, and keeps the profiles (ranked
ratings) in a SQLite file on a volume. The CrazyGames build is hosted by CrazyGames and connects to
that same server.

```
 players on your site ──┐
                        ├──  wss://your-server/ws  ──  one server process  ──  /data/deflect.db
 players on CrazyGames ─┘     (the CrazyGames build      (Fly.io machine,        (volume)
                               has the address baked in)  or any Docker host)
```

## 1. Put the server online (Fly.io)

[`fly.toml`](fly.toml) is ready: one machine that never sleeps, a volume for the profiles, the
`/healthz` check, and the proxy's connection limit raised for WebSockets.

```bash
# once: install flyctl (https://fly.io/docs/flyctl/install/) and sign in
fly auth login

# pick a name (it becomes https://<name>.fly.dev) and a region close to your players
fly launch --copy-config --no-deploy

# the profiles' volume, in the same region as primary_region in fly.toml
fly volumes create deflect_data --size 1 --region iad

fly deploy
```

Check it: `https://<name>.fly.dev/healthz` answers `{"ok":true,"players":0,...}`, and
`https://<name>.fly.dev` is the game. Open it in two browsers (one incognito) and you'll meet in
the lobby.

**Keep it to one machine.** Lobbies and matches live in the process's memory, so two machines would
be two separate worlds with two ladders. `fly scale count 1` if it ever drifts.

**Deploys from GitHub:** `.github/workflows/deploy.yml` deploys every push to `main` once the
repository has a `FLY_API_TOKEN` secret (`fly tokens create deploy`, then *Settings → Secrets and
variables → Actions*). `ci.yml` typechecks, tests and builds every push and pull request.

### Anywhere else

Any host that runs a Docker image and passes WebSockets through works:

```bash
docker build -t deflect .
docker run -p 8080:8080 -v deflect-data:/data deflect
```

It needs exactly one instance, a persistent volume at `/data`, and HTTPS in front (browsers on an
`https://` page can only open `wss://`). Set `TRUST_PROXY=1` behind a proxy, so the per-address
limits see players rather than the proxy. Without Docker: `npm ci && npm run build && npm start`.

## 2. Configuration

All optional; `fly.toml` sets the ones a Fly deploy needs.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` (`8080` in the image) | HTTP and WebSocket port |
| `DATA_DIR` | `data` (`/data` in the image) | where `deflect.db` (the profiles) lives |
| `MAX_PLAYERS` | `500` | players connected at once; the rest are told it's full |
| `MAX_PER_IP` | `32` | connections from one address (generous: a school shares one) |
| `CONNECTS_PER_MINUTE` | `60` | new connections from one address per minute |
| `TRUST_PROXY` | off | `1`: take the player's address from `Fly-Client-IP` / `X-Forwarded-For` |
| `ALLOWED_ORIGINS` | any | comma-separated pages allowed to connect: `https://deflect.example.com,*.crazygames.com` |

A `profiles.json` from before is imported into `deflect.db` the first time the server starts.

## 3. Launch on CrazyGames

```bash
SERVER_URL=wss://<name>.fly.dev npm run build:crazygames
```

That writes `dist/crazygames.zip`, ready to upload on the
[developer portal](https://developer.crazygames.com). Without `SERVER_URL` the same command builds
the single-player version, as before.

What the build does for CrazyGames' [multiplayer requirements](https://docs.crazygames.com/requirements/multiplayer/):

- **Rooms:** each lobby (24 players) is a room. The game reports the player's lobby with
  `updateRoom` (joinable while it has room) and `leftRoom` on disconnect, so CrazyGames' Join and
  Invite buttons work.
- **Invites:** a player opened from an invite lands in their friend's lobby, skipping the name
  prompt. Picking a friend's room in CrazyGames' UI mid-game moves them there (or right after their
  match). The Invite button in the lobby bar copies CrazyGames' invite link.
- **Instant multiplayer:** started from CrazyGames' multiplayer button, the game goes straight in,
  joinable from the first second (lobbies hold 24, so public play is allowed).
- **Usernames:** a signed-in player plays under their CrazyGames name.
- **Chat:** every message and name goes through CrazyGames' word list on the server
  (`src/server/blocklist.txt`, whole words only), and the platform's *disable chat* setting hides
  chat in the game.
- **Round-based play:** after a duel both players go back to their own lobby, with the same people.
- **Server down:** the game offers single player instead, and a way back online.

When you upload: the **lobby size is 24**. If you set `ALLOWED_ORIGINS`, include
`*.crazygames.com` (and check the browser console on CrazyGames' preview for the exact origin the
game is served from).

**Keep the uploaded build in step with the server.** A deploy that changes `PROTOCOL_VERSION`
(`src/shared/protocol.ts`) turns away every older client with "Your client is out of date", and
CrazyGames serves the build you uploaded, so rebuild and upload it with the same deploy. Changes
that only add optional fields don't need a bump.

## 4. Capacity and cost

Load-tested with simulated players walking, pinging and swinging at the real client's rates, all
packed into lobbies (the heaviest case):

| Players | Lobbies | Tick (average / slowest), of 16.7ms | p99 round trip | Memory |
| --- | --- | --- | --- | --- |
| 240 | 10 | 1.9 / 10ms | under 20ms | ~145MB |
| 480 | 20 | 3.8 / 14ms | under 30ms | ~140MB |
| 720 | 30 | 6.0 / 22ms | 100–220ms | — |

- **CPU:** about 500 players on one dedicated core, which is what `fly.toml` asks for
  (`performance-1x`, `MAX_PLAYERS=500`). Shared CPUs only guarantee a fraction of a core, so on
  `shared-cpu-2x` keep `MAX_PLAYERS` under about 80.
- **Bandwidth is the main running cost:** about 55 KB/s per player in a crowded lobby (less when
  they're spread out, and far less in a 1v1 match with two fighters), so at most about 0.2 GB per
  player-hour. WebSocket compression
  would cut it tenfold but was measured and left off: at 20 snapshots a second it cost several times
  the CPU and seconds of lag past a few dozen players. A more compact snapshot encoding is the way
  to bring it down.
- `/healthz` reports the tick time: an average creeping toward 16.7ms means the server is full.

## 5. Running it

- **Logs:** `fly logs`. Dropped dead connections and failed ticks are logged.
- **Deploys and restarts:** players are told the server is restarting, and their game knocks every
  3s and walks back in once it's up (for up to two minutes; a deploy takes well under that). A match still on ends
  without a result, so nobody loses rating to a deploy.
- **Backups:** Fly snapshots volumes daily (kept 5 days); `fly volumes snapshots list`. The whole
  ladder is the one file `/data/deflect.db`.
- **Moderation:** `src/server/blocklist.txt` is CrazyGames' list, one entry per line. The game's
  own words it would catch (thrust, dummy, click) are let through in `src/server/censor.ts`.

## 6. Before you announce it

- [ ] `fly deploy` done, `/healthz` answers, two browsers meet in the lobby
- [ ] a ranked match between two browsers finishes and both ratings move
- [ ] `SERVER_URL=wss://... npm run build:crazygames` uploaded, with lobby size 24
- [ ] on CrazyGames' preview: the game connects, Invite gives a link that brings a second browser into the same lobby
- [ ] `FLY_API_TOKEN` added if you want pushes to `main` to deploy

## Known limits

- **One machine.** Past ~500 players at once it needs lobbies spread over several processes and a
  shared database; until then, raise the machine size.
- **No accounts.** A player is a random token in their browser (CrazyGames' cloud data on
  CrazyGames). Someone can make new profiles to start their rating over, or play two of their own
  in ranked. Verifying CrazyGames' signed user token on the server is the natural next step.
- **Disconnecting forfeits.** A dropped connection loses the ranked match; there's no rejoining a
  match in progress.
