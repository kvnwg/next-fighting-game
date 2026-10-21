# next-fighting-game
Repository for my next fighting game project

## Voxel characters

Each character lives in `characters/<name>/`:

- `model.js` — the voxel model, authored in code on a bone rig (T-pose rest), plus named poses
- `sheet.html` — character sheet (T-pose, A-pose, side, back)
- `viewer.html` — orbit viewer; serve the repo root (`npx http-server .`) and open it
- `renders/` — PNG output of the sheet
- `export/` — MagicaVoxel `.vox` of the T-pose and a `_rig.json` (bones, pivots, per-bone voxels)

Shared tooling is in `tools/voxel/`. To regenerate:

```sh
npm install
npm run render:ronin   # behind a proxy: NODE_USE_ENV_PROXY=1 npm run render:ronin
npm run export:ronin
```
