// Authoring-time only: the real screens as they look on Reddit (a stand-in daily post is injected), at phone and desktop sizes.
// Usage: node tools/look-shot.mjs [tag] [outdir]   -> {outdir}/{tag}-{phone|desktop}-{planning|build|garden|service|card}.png
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
  const t = Date.now(), order = (index, name, species, wants, reward, xp, done, canFill) => ({ index, name, species, wants, reward, xp, done, canFill });
  const view = { type: 'world', now: t, xp: 52, level: 2, nextXp: 80, slots: 2, cash: 1840, pantry: { tomato: 2, lettuce: 3 }, builders: { count: 1, rushUsed: false, jobs: [{ furnitureId: 2, name: 'Charcoal grill', toLevel: 2, readyAt: t + 1200000, rushCost: 40 }] }, stations: [{ id: 1, kind: 'prep', name: 'Prep counter', level: 1, next: { toLevel: 2, cost: 120, seconds: 1800, levelNeeded: 2 } }, { id: 2, kind: 'grill', name: 'Charcoal grill', level: 1, next: { toLevel: 2, cost: 180, seconds: 1800, levelNeeded: 2 } }], plots: [
    { index: 0, crop: 'lettuce', plantedAt: t - 1500000, readyAt: t + 2100000, watered: true, ready: false, wilted: false, yield: 3 },
    { index: 1, crop: 'tomato', plantedAt: t - 1500000, readyAt: t - 300000, watered: false, ready: true, wilted: false, yield: 3 }],
    orders: [order(0, 'Mochi', 'rabbit', [{ crop: 'tomato', n: 2 }, { crop: 'lettuce', n: 1 }], 30, 16, false, true), order(1, 'Pickle', 'bear', [{ crop: 'basil', n: 2 }], 21, 14, false, false), order(2, 'Hazel', 'mouse', [{ crop: 'tomato', n: 3 }], 27, 12, true, false)] };
  restaurant.remote.world = { load: async () => view, act: async () => view };
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
    await page.getByRole('button', { name: 'Garden', exact: true }).click(); await page.waitForTimeout(900); await shot('garden');
    await page.getByRole('button', { name: 'Close panel' }).click(); await page.waitForTimeout(400);
    await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.open(); restaurant.setSpeed(3); });
    await page.waitForTimeout(9000); await shot('service');
    await page.evaluate(async () => {
      const { restaurant } = await import('/src/management/engine.ts');
      const park = restaurant.state, report = { revenue: 412, tips: 46, ingredients: 148, served: 17, missed: 2, headline: 'rain', challenges: [], day: 1, wages: 60, rent: 30, debtPayment: 0, research: 0, profit: 220, rating: 4.3 };
      restaurant.state.phase = 'planning'; restaurant.remote.board = async () => ({ type: 'board', date: '2026-12-09', total: 9, entries: [{ rank: 1, name: 'a neighbor', stars: 3, rating: 4.8, profit: 410, you: false }, { rank: 2, name: 'ho1505', stars: 2, rating: 4.3, profit: 220, you: true }, { rank: 3, name: 'maple_cook', stars: 2, rating: 4.1, profit: 180, you: false }], you: { rank: 2, stars: 2, profit: 220 } });
      restaurant.remote.postResult = async () => null; restaurant.remote.previewComment = async () => ({ text: 'x', reply: true }); restaurant.remote.wearFlair = async () => null; restaurant.remote.follow = async () => null; restaurant.remote.social = { posted: false, flair: null, followed: false };
      restaurant.remote.result = { type: 'lock', hash: 'h', official: true, replaced: false, streak: 5, freezes: 1, rev: 2, park, report, stars: { stars: 2, goal: true, challenges: 2, beatPrevious: false, goalText: 'Finish with a rating of 4.0 or better' }, night: { neighbors: [{ name: 'maple_cook', outcome: 'served', tip: 4, wait: 11, quality: 3 }], card: { welcome: 72, speed: 64, value: 88 }, award: { id: 'warm', title: 'Warmest room', text: 'A cozy room and almost nobody walked out.' }, companyValue: 2400, best: { value: 2400, day: 1 }, newBest: true, avgWait: 12, pathLength: 9 } };
      restaurant.notify();
    });
    await page.waitForTimeout(1500); await shot('card');
    await page.close();
  }
  console.log('saved', tag);
} finally { await browser?.close(); server.kill(); }
