// Renders the fighter-select portraits into packages/client/public/fighters/.
// usage: node tools/voxel/render-portraits.mjs

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('.');
const outDir = join(root, 'packages/client/public/fighters');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
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
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[page error]', e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@*/**', (route) => {
  const path = new URL(route.request().url()).pathname.replace(/^\/npm\/three@[^/]+\//, '');
  route.fulfill({ path: join(root, 'node_modules/three', path), contentType: 'text/javascript' });
});
await page.goto(`http://127.0.0.1:${server.address().port}/tools/voxel/portraits.html`);
await page.waitForFunction(() => window.__portraits, null, { timeout: 120000 });
const portraits = await page.evaluate(() => window.__portraits);
await mkdir(outDir, { recursive: true });
for (const [id, url] of Object.entries(portraits)) await writeFile(join(outDir, `${id}.png`), Buffer.from(url.split(',')[1], 'base64'));
console.log(`wrote ${Object.keys(portraits).length} portraits to ${outDir}`);
await browser.close();
server.close();
