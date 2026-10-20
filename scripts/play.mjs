// Drives the real client in headless Chromium. Usage:
//   node scripts/play.mjs <baseUrl> <outDir> <scenario>
// scenarios: lobby | practice | chars | help
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [base, outDir, scenario = 'lobby'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const shot = (name) => page.screenshot({ path: `${outDir}/${scenario}-${name}.png` });
await page.goto(base, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await shot('title');
await page.fill('#name-input', `Tester${Math.floor(Math.random() * 100)}`);
await page.click('#enter-btn');
await page.waitForTimeout(2500);
await shot('entered');
if (scenario === 'lobby') {
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyD');
  await shot('walked');
} else if (scenario === 'practice') {
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(1800);
  await shot('intro');
  await page.waitForTimeout(5200);
  await shot('countdown');
  await page.waitForTimeout(2200);
  // walk toward the bot and fight
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  for (let i = 0; i < 6; i++) {
    await page.mouse.click(640, 360);
    await page.waitForTimeout(160);
    if (i === 2) await shot('swing');
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(250);
  }
  await shot('fight');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  await shot('special');
  await page.waitForTimeout(3000);
  await shot('later');
} else if (scenario === 'chars') {
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(1500);
  await shot('select');
  await page.click('.char-card[data-id="reaper"]');
  await page.waitForTimeout(1200);
  await shot('reaper');
} else if (scenario === 'help') {
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(800);
  await shot('help');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(800);
  await shot('ladder');
}
console.log(logs.join('\n'));
await browser.close();
