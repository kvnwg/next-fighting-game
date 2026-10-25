import zlib from 'node:zlib';
// Builds the single-player game into one self-contained HTML page (dist/artifact/deflect.html):
// the game server runs in the page, three.js loads from jsDelivr, everything else is inlined.
// Usage: node scripts/build-artifact.mjs
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const THREE_VERSION = JSON.parse(fs.readFileSync('node_modules/three/package.json', 'utf8')).version;
const outDir = path.resolve('dist/artifact');

process.env.VITE_OFFLINE = '1';
await build({
  configFile: false,
  root: process.cwd(),
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 1e9,
    rollupOptions: {
      external: ['three'],
      output: { inlineDynamicImports: true, format: 'es' },
    },
  },
});

const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const asset = (re) => {
  const m = html.match(re);
  if (!m) throw new Error(`asset not found: ${re}`);
  return fs.readFileSync(path.join(outDir, m[1].replace(/^\//, '')), 'utf8');
};
const js = asset(/<script type="module" crossorigin src="([^"]+)"/);
const css = asset(/<link rel="stylesheet" crossorigin href="([^"]+)"/);
const fonts = html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/)[0];

// the page skeleton (doctype, head, body) is added by the host at publish time
const page = `<title>Deflect</title>
<meta name="description" content="A 3D cel-shaded 1v1 samurai dueling game with deflect-and-posture combat.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>
${css}
</style>
<div id="app"></div>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js"}}</script>
<script type="module">
// the game ships gzipped (a third of the size: the publish size limit is under 800 KB); unpack it
// and run it as an ordinary inline module, so the import map still applies
const b = Uint8Array.from(atob('${zlib.gzipSync(js, { level: 9 }).toString('base64')}'), (c) => c.charCodeAt(0));
const code = await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
const s = document.createElement('script');
s.type = 'module';
s.textContent = code;
document.body.appendChild(s);
</script>
`;
const out = path.join(outDir, 'deflect.html');
fs.writeFileSync(out, page);
// a full document for local testing (the host adds the skeleton for the real artifact)
fs.writeFileSync(
  path.join(outDir, 'preview.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n${page}</body></html>`,
);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, three@${THREE_VERSION} from jsDelivr)`);
// pages of about 770 KB and up have been refused at publish (with a misleading "review page" error)
const BUDGET = 740_000;
if (fs.statSync(out).size > BUDGET) console.warn(`warning: ${fs.statSync(out).size} bytes is over the ${BUDGET}-byte publish budget`);
