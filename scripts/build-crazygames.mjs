// Builds the game for CrazyGames (dist/crazygames, zipped to dist/crazygames.zip). Everything is
// bundled with relative paths (CrazyGames serves the game from its own CDN inside an iframe), and
// the CrazyGames SDK v3 is loaded in the head, before the game code, as their docs ask. Off
// CrazyGames the SDK stays inert.
//
//   SERVER_URL=wss://your-server.example npm run build:crazygames   online: players meet on your server
//   npm run build:crazygames                                        single player: the server runs in the page
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const outDir = path.resolve('dist/crazygames');
const SDK = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>';

const server = process.env.SERVER_URL?.trim();
if (server) {
  // if the server can't be reached, the online game offers single player instead
  if (!/^(wss?|https?):\/\//.test(server)) throw new Error(`SERVER_URL should start with wss:// (or https://): ${server}`);
  process.env.VITE_SERVER_URL = server;
  console.log(`online build: players connect to ${server}`);
} else {
  process.env.VITE_OFFLINE = '1';
  console.log('single-player build (set SERVER_URL to build the online game)');
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
