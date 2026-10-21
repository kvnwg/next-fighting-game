# next-fighting-game
Repository for my next fighting game project

## Voxel characters

Each character lives in `characters/<name>/`:

- `model.js` — the voxel model, authored in code on a bone rig (T-pose rest), plus named poses
- `sheet.html` — character sheet (T-pose, A-pose, side, back)
- `viewer.html` — orbit viewer; serve the repo root (`npx http-server .`) and open it
- `renders/` — PNG output of the sheet
- `export/` — MagicaVoxel `.vox` of each model's T-pose and a `_rig.json` (bones, pivots, per-bone voxels)

Characters: `ronin`, `warden`, `wraith`, `lancer`, `assassin`, `duelist`, `monk`, `knight`.

Ring entrance cinematics (shot lists with camera, sound and visual effects) live in `characters/intros.js`, with a readable copy in `docs/ring-intros.md`.

Shared tooling is in `tools/voxel/`. To regenerate:

```sh
npm install
npm run render -- characters/ronin   # behind a proxy: NODE_USE_ENV_PROXY=1 npm run render -- characters/ronin
npm run export -- characters/ronin
```
