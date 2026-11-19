// Authoring-time only: the real screens as they look on Reddit (a stand-in daily post is injected), at phone and desktop sizes.
// Usage: node tools/look-shot.mjs [tag] [outdir]   -> {outdir}/{tag}-{phone|desktop}-{planning|build|service|card}.png
// The same command makes the screenshots used in the README and docs (outdir docs/img).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const PORT = 5199, tag = process.argv[2] ?? 'look', out = process.argv[3] ?? 'tools/pixel/out';
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const standIn = async () => {
  const { restaurant } = await import('/src/management/engine.ts');
  const { createDailyHeadline } = await import('/src/management/daily-headline.ts');
  const headline = createDailyHeadline('2026-12-09');
  restaurant.reset(); restaurant.welcome(); restaurant.state.cash = 1840;
  restaurant.remote = { open: async () => restaurant.open(), today: { type: 'today', date: '2026-12-09', headline, rev: 1, park: restaurant.state, open: null, run: null, streak: 4, community: { opens: 5, locks: 2 }, neighborhood: 'Maple Street' }, result: null, dismissResult() {} };
  restaurant.notify();
};
let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 250)); }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  for (const [size, viewport, dpr] of [['phone', { width: 360, height: 760 }, 2], ['desktop', { width: 1440, height: 810 }, 1]]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: dpr, hasTouch: size === 'phone' });
    page.setDefaultTimeout(30000);
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Open restaurant/ }).waitFor();
    await page.evaluate(standIn);
    await page.waitForTimeout(3000);
    const shot = async name => writeFile(`${out}/${tag}-${size}-${name}.png`, await page.screenshot({ type: 'png' }));
    await shot('planning');
    await page.getByRole('button', { name: 'Build', exact: true }).click(); await page.waitForTimeout(900); await shot('build');
    await page.getByRole('button', { name: 'Close panel' }).click(); await page.waitForTimeout(400);
    await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.open(); restaurant.setSpeed(3); });
    await page.waitForTimeout(9000); await shot('service');
    await page.close();
  }
  console.log('saved', tag);
} finally { await browser?.close(); server.kill(); }
