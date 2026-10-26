# Deploying Deflect and putting it on CrazyGames

Two parts: the game server on Fly.io, then the game itself on CrazyGames. The server is the shared
grounds every player connects to; it also keeps everyone's progress (ratings, coins, unlocks).

## 1. The game server on Fly.io

Do this once, from a copy of the repo on your computer (Node 20 or newer).

1. Make an account at <https://fly.io> and add a payment card (the server costs a few dollars a month).
2. Install the Fly command-line tool: <https://fly.io/docs/flyctl/install/>, then sign in:
   ```
   fly auth login
   ```
3. Pick the server's name. It's also its address (`https://<name>.fly.dev`), and names are first come,
   first served. Open `fly.toml` and change `app = 'deflect-duels'` if you want another name, or if
   that one is taken. `primary_region` is where it runs: `iad` is the US east coast; `ams` (Amsterdam)
   or `fra` (Frankfurt) suit Europe better (`fly platform regions` lists them all).
4. Create the app and the volume that holds everyone's progress (same region as in `fly.toml`):
   ```
   fly apps create deflect-duels
   fly volumes create deflect_data --region iad --size 1
   ```
5. Deploy it:
   ```
   fly deploy --ha=false
   ```
   `--ha=false` matters: the game runs on exactly one machine (two would split players and their
   progress between them). If you ever see two, `fly scale count 1`.
6. Check it: open `https://deflect-duels.fly.dev` (your app's name in place of deflect-duels) in a browser. The game itself is
   served there too, so you and a friend can already play it, online, from that address.

Updating the server later: pull the latest code and `fly deploy --ha=false` again. Progress is kept on
the volume. `fly logs` shows what the server is doing.

## 2. The CrazyGames build

1. Build it (it connects to the server named in `fly.toml`):
   ```
   npm ci
   npm run build:crazygames
   ```
   The build prints `online: the game connects to wss://deflect-duels.fly.dev/ws` and writes
   `dist/crazygames.zip`.
2. Upload the zip on the [developer portal](https://developer.crazygames.com) and test it in their
   Preview tool. Things to try there:
   - you get in, and see the lobby with other fighters about;
   - Play → Ranked finds a duel (within 15 seconds);
   - Play → Friends → Open a private lobby, then join it from a second browser (a private window) by
     its code;
   - the after-match ad and the shop's ad button (ads only run once CrazyGames turns them on).
3. Fill in the listing and submit (see the step-by-step guide this came with: covers, video, controls,
   tags, landscape only, mobile on, the music credits).

Every time the game changes: `npm run build:crazygames` and upload the new zip as a new version.
If the server changed too (anything under `src/server` or `src/shared`), `fly deploy --ha=false` first.

## Good to know

- **If the server is down, the game can't be played** on CrazyGames (players see "Could not reach the
  game server"). `fly status` and `fly logs` show what's wrong; `fly machine restart` restarts it.
- **One server, one region.** Players far from it get more lag. If most of your players end up
  being from one part of the world, move it there (change `primary_region`, create a volume there,
  deploy; progress on the old volume stays behind unless you copy it over).
- **Size.** One small machine (shared CPU, 512 MB) handles a few dozen players at once. If it
  struggles (`fly logs`, the Fly dashboard's metrics), `fly scale vm shared-cpu-2x` or more memory
  with `fly scale memory 1024`.
- **Fake players.** Each public lobby has 4 wandering fighters (`ROAMERS` in `fly.toml`). Private
  lobbies have none.
