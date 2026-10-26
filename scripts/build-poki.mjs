// Builds the game for Poki (dist/poki, zipped to dist/poki.zip). Like the CrazyGames build it plays
// online, against the game server deployed to Fly.io (DEFLECT_SERVER, or else the app in fly.toml),
// with relative paths, and the platform's SDK (Poki's) loaded in the head before the game code.
// What's different for Poki: the fonts ship in the build (Poki blocks every outside request but its
// own and the game server, once approved), there's no chat between players and no blood, and the
// game talks to Poki's SDK (src/client/platform.ts, VITE_PLATFORM=poki). See docs/poki.md.
// Usage: node scripts/build-poki.mjs            (online)
//        node scripts/build-poki.mjs --offline  (single player: the server runs in the page)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const outDir = path.resolve('dist/poki');
const SDK = '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>';
const FONTS = '<link rel="stylesheet" href="/src/client/assets/fonts/fonts.css" />';

process.env.VITE_PLATFORM = 'poki';
let server = null;
if (process.argv.includes('--offline')) {
  process.env.VITE_OFFLINE = '1';
  console.log('single player: the game server runs in the page');
} else {
  server = process.env.DEFLECT_SERVER;
  if (!server && fs.existsSync('fly.toml')) {
    const app = /^app\s*=\s*['"]([^'"]+)['"]/m.exec(fs.readFileSync('fly.toml', 'utf8'))?.[1];
    if (app) server = `wss://${app}.fly.dev/ws`;
  }
  // (ws:// only to try a local server: a page on https, as on Poki, can't open one)
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
      name: 'poki',
      // before Vite reads the page, so the fonts' stylesheet is bundled like any other
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          const fonts = /\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com" \/>\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>\s*<link href="https:\/\/fonts\.googleapis\.com[^>]+>/;
          if (!fonts.test(html)) throw new Error('index.html: the Google Fonts links have changed, update scripts/build-poki.mjs');
          return html.replace(fonts, `\n    ${FONTS}`).replace('<head>', `<head>\n    ${SDK}`);
        },
      },
    },
  ],
});

// Poki runs ads, so songs whose licence is non-commercial don't ship at all (the game already
// skips them there; see TRACKS in src/client/audio/music.ts)
const tracks = fs.readFileSync('src/client/audio/music.ts', 'utf8');
for (const [, file] of tracks.matchAll(/file: '([^']+)'[^}]*commercial: false/g)) {
  fs.rmSync(path.join(outDir, 'music', file), { force: true });
  console.log(`left out music/${file} (non-commercial licence)`);
}

// the fonts ship in the build, so their licence goes with them
fs.copyFileSync('src/client/assets/fonts/OFL.txt', path.join(outDir, 'fonts-OFL.txt'));

// nothing may load from anywhere but Poki's SDK (and the game server, by CSP approval)
const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const outside = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('https://game-cdn.poki.com/'));
const files = fs.readdirSync(outDir, { recursive: true }).filter((f) => fs.statSync(path.join(outDir, f)).isFile());
for (const f of files.filter((f) => f.endsWith('.css') || f.endsWith('.js'))) {
  const text = fs.readFileSync(path.join(outDir, f), 'utf8');
  if (/fonts\.(googleapis|gstatic)\.com/.test(text)) outside.push(`Google Fonts (in ${f})`);
  for (const [, u] of text.matchAll(/url\(\s*['"]?(https?:\/\/[^'")]+)/g)) outside.push(`${u} (in ${f})`);
}
if (outside.length) {
  console.error(`The build loads from outside, which Poki blocks:\n  ${outside.join('\n  ')}`);
  process.exit(1);
}

const bytes = files.reduce((n, f) => n + fs.statSync(path.join(outDir, f)).size, 0);
console.log(`wrote ${outDir} (${files.length} files, ${(bytes / 1024).toFixed(0)} KB)`);
try {
  const zip = path.resolve('dist/poki.zip');
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', zip, '.'], { cwd: outDir });
  console.log(`zipped to ${zip} (${(fs.statSync(zip).size / 1024).toFixed(0)} KB)`);
} catch {
  console.log('(no zip tool found: zip the folder yourself to upload it)');
}
console.log('Test it: drop the dist/poki folder on https://inspector.poki.dev');
if (server) {
  console.log(`On Poki the game server is blocked until approved: Settings → CSP in Poki for Developers, ask for ${server.replace(/\/ws$/, '')} (see docs/poki.md)`);
  console.log(`Its privacy policy (asked for with that): ${server.replace(/^ws/, 'http').replace(/\/ws$/, '/privacy')}`);
}
