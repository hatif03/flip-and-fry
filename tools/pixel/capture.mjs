// Authoring-time only: captures stills of the REAL 3D scene (no UI) for the pixel pipeline. Not part of the game or the upload.
// Usage: node tools/pixel/capture.mjs            -> tools/pixel/out/still-{phone|desktop}-{sunset|sun|rain}.png  (pixel look OFF: the palette source)
//        node tools/pixel/capture.mjs --pixel    -> tools/pixel/out/shot-...png  (what the game shows with the pixel look ON)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const PORT = 5199, out = 'tools/pixel/out', pixel = process.argv.includes('--pixel'), prefix = pixel ? 'shot' : 'still', query = pixel ? '' : '?pixel=0';
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 250)); }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const dpr = Number((process.argv.find(a => a.startsWith('--dpr=')) ?? '--dpr=1').slice(6)), only = (process.argv.find(a => a.startsWith('--only=')) ?? '').slice(7);
  // The phone matches a real Android phone in the Reddit app: 360 CSS px wide at 2x density.
  const sizes = Object.fromEntries(Object.entries({ phone: { width: 360, height: 760 }, desktop: { width: 1280, height: 800 } }).filter(([k]) => !only || k === only));
  const weathers = Object.fromEntries(Object.entries({ sunset: 'Golden hour', sun: 'Bright sun', rain: 'Light rain' }).filter(([k]) => !process.argv.includes('--weather=' + k) ? !process.argv.some(a => a.startsWith('--weather=')) : true));
  for (const [name, viewport] of Object.entries(sizes)) {
    const page = await browser.newPage({ viewport, hasTouch: name === 'phone', reducedMotion: 'no-preference', deviceScaleFactor: name === 'phone' ? dpr : 1 });
    page.setDefaultTimeout(30000);
    await page.goto(`http://127.0.0.1:${PORT}/${query}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Open restaurant/ }).waitFor();
    // A live service, so the room has guests, staff and dishes in it.
    await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.reset(); restaurant.welcome(); restaurant.open(); restaurant.setSpeed(3); });
    await page.waitForTimeout(9000);
    for (const [key, label] of Object.entries(weathers)) {
      await page.getByRole('button', { name: 'Restaurant settings' }).click();
      await page.getByRole('radio', { name: label, exact: true }).check();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(7000); // the weather blend takes 5 s and only advances while time runs
      // Hide everything that is not the canvas, so the still is the scene and nothing else.
      await page.evaluate(() => {
        const canvas = document.querySelector('canvas'); if (!canvas) throw new Error('no canvas');
        document.querySelectorAll('body *').forEach(el => { if (el !== canvas && !el.contains(canvas) && !canvas.contains(el)) { el.dataset.was = el.style.visibility; el.style.visibility = 'hidden'; } });
      });
      await writeFile(`${out}/${prefix}-${name}-${key}.png`, await page.locator('canvas').first().screenshot({ type: 'png' }));
      await page.evaluate(() => document.querySelectorAll('[data-was]').forEach(el => { el.style.visibility = el.dataset.was; delete el.dataset.was; }));
    }
    await page.close();
  }
  console.log('captured', Object.keys(sizes).length * Object.keys(weathers).length, 'stills in', out);
} finally { await browser?.close(); server.kill(); }
