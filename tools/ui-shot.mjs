// Authoring-time only: screenshots of the real UI on a phone, for looking at the pixel UI kit. Not part of the game or the upload.
// Usage: node tools/ui-shot.mjs [--ui=0] [tag]   -> tools/pixel/out/ui-{tag}-{planning|menu|ledger|service}.png
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const PORT = 5198, out = 'tools/pixel/out', args = process.argv.slice(2), tag = args.find(a => !a.startsWith('--')) ?? 'shot', query = args.includes('--ui=0') ? '?ui=0' : '';
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 250)); }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 360, height: 760 }, hasTouch: true, deviceScaleFactor: 2 });
  page.setDefaultTimeout(30000);
  await page.goto(`http://127.0.0.1:${PORT}/${query}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Open restaurant/ }).waitFor();
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.reset(); restaurant.welcome(); restaurant.state.cash = 4000; restaurant.state.research.points = 400; restaurant.state.regulars = [{ name: 'Maple', species: 'bear', dish: 'salad', visits: 3, streak: 2 }]; restaurant.notify(); });
  await page.waitForTimeout(2500);
  const shot = async name => writeFile(`${out}/ui-${tag}-${name}.png`, await page.screenshot({ type: 'png' }));
  await shot('planning');
  await page.getByRole('button', { name: 'Menu', exact: true }).click(); await page.waitForTimeout(800); await shot('menu');
  await page.getByRole('button', { name: 'Ledger', exact: true }).click(); await page.waitForTimeout(800); await shot('ledger');
  await page.getByRole('button', { name: 'Ledger', exact: true }).click(); await page.waitForTimeout(400);
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.open(); restaurant.setSpeed(3); });
  await page.waitForTimeout(9000); await shot('service');
  console.log('saved', tag);
} finally { await browser?.close(); server.kill(); }
