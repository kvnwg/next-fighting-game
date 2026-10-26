// Builds the game for CrazyGames (dist/crazygames, zipped to dist/crazygames.zip). It plays online,
// against the game server deployed to Fly.io (see fly.toml and docs/crazygames.md): the server's
// address comes from DEFLECT_SERVER (wss://…/ws) or else the app named in fly.toml. Everything is
// bundled with relative paths (CrazyGames serves the game from its own CDN inside an iframe), and
// the CrazyGames SDK v3 is loaded in the head, before the game code, as their docs ask. Off
// CrazyGames the SDK stays inert.
// Usage: node scripts/build-crazygames.mjs            (online)
//        node scripts/build-crazygames.mjs --offline  (single player: the server runs in the page)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const outDir = path.resolve('dist/crazygames');
const SDK = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>';

if (process.argv.includes('--offline')) {
  process.env.VITE_OFFLINE = '1';
  console.log('single player: the game server runs in the page');
} else {
  let server = process.env.DEFLECT_SERVER;
  if (!server && fs.existsSync('fly.toml')) {
    const app = /^app\s*=\s*['"]([^'"]+)['"]/m.exec(fs.readFileSync('fly.toml', 'utf8'))?.[1];
    if (app) server = `wss://${app}.fly.dev/ws`;
  }
  // (ws:// only to try a local server: a page on https, as on CrazyGames, can't open one)
  if (!server || !/^wss?:\/\//.test(server)) {
    console.error('No game server: set DEFLECT_SERVER=wss://<your-app>.fly.dev/ws (or the app name in fly.toml), or build with --offline.');
    process.exit(1);
  }
  process.env.VITE_SERVER_URL = server;
  console.log(`online: the game connects to ${server}`);
}
await build({
  configFile: false,
  root: process.cwd(),
  base: './',
  logLevel: 'warn',
  build: { outDir, emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  plugins: [
    {
      name: 'crazygames-sdk',
      transformIndexHtml(html) {
        return html.replace('<head>', `<head>\n    ${SDK}`);
      },
    },
  ],
});

// CrazyGames runs ads, so songs whose licence is non-commercial don't ship at all (the game already
// skips them there; see TRACKS in src/client/audio/music.ts)
const tracks = fs.readFileSync('src/client/audio/music.ts', 'utf8');
for (const [, file] of tracks.matchAll(/file: '([^']+)'[^}]*commercial: false/g)) {
  fs.rmSync(path.join(outDir, 'music', file), { force: true });
  console.log(`left out music/${file} (non-commercial licence)`);
}

const files = fs.readdirSync(outDir, { recursive: true }).filter((f) => fs.statSync(path.join(outDir, f)).isFile());
const bytes = files.reduce((n, f) => n + fs.statSync(path.join(outDir, f)).size, 0);
console.log(`wrote ${outDir} (${files.length} files, ${(bytes / 1024).toFixed(0)} KB)`);
try {
  const zip = path.resolve('dist/crazygames.zip');
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', zip, '.'], { cwd: outDir });
  console.log(`zipped to ${zip} (${(fs.statSync(zip).size / 1024).toFixed(0)} KB): upload this on the CrazyGames developer portal`);
} catch {
  console.log('(no zip tool found: zip the folder yourself to upload it)');
}
