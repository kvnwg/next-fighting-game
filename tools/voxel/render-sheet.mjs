// Renders <character>/sheet.html headlessly and writes the full sheet plus one
// PNG per view into <character>/renders/.
// usage: node tools/voxel/render-sheet.mjs characters/ronin

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve, basename } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('.');
const charDir = process.argv[2] || 'characters/ronin';
const outDir = join(charDir, 'renders');
const name = basename(charDir);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const file = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root)) throw new Error('outside root');
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 2560, height: 1400 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
const page = await context.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.error('[page error]', e.message));

// Serve three.js from node_modules so renders don't depend on the CDN.
await page.route('https://cdn.jsdelivr.net/npm/three@*/**', (route) => {
  const path = new URL(route.request().url()).pathname.replace(/^\/npm\/three@[^/]+\//, '');
  route.fulfill({ path: join(root, 'node_modules/three', path), contentType: 'text/javascript' });
});

// Fetch web fonts from Node (honours NODE_USE_ENV_PROXY behind a proxy).
await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
  try {
    const res = await fetch(route.request().url(), { headers: { 'user-agent': await page.evaluate(() => navigator.userAgent) } });
    route.fulfill({ status: res.status, contentType: res.headers.get('content-type') ?? undefined, body: Buffer.from(await res.arrayBuffer()) });
  } catch {
    route.abort();
  }
});

await page.goto(`${base}/${charDir}/sheet.html`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await mkdir(outDir, { recursive: true });

await page.locator('#sheet').screenshot({ path: join(outDir, `${name}_sheet.png`) });
for (const id of await page.$$eval('canvas[id^="view-"]', (els) => els.map((e) => e.id.slice(5)))) {
  await page.locator(`#panel-${id}`).screenshot({ path: join(outDir, `${name}_${id}.png`) });
}
console.log(`wrote renders to ${outDir}`);
await browser.close();
server.close();
