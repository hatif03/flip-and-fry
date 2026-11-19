// Authoring-time only: the planning screen at desktop and phone sizes with different pixel sizes, to compare the look.
// Usage: node tools/look-shot.mjs   -> tools/pixel/out/look-{desktop|phone}-{k1|k2|k3|off}.png
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const PORT = 5199, out = 'tools/pixel/out';
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 250)); }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  for (const [size, viewport, dpr] of [['desktop', { width: 1600, height: 900 }, 1], ['phone', { width: 360, height: 760 }, 2]]) {
    for (const [tag, query] of [['k1', '?k=1'], ['k2', '?k=2'], ['k3', '?k=3'], ['off', '?pixel=0']]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: dpr, hasTouch: size === 'phone' });
      page.setDefaultTimeout(30000);
      await page.goto(`http://127.0.0.1:${PORT}/${query}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Open restaurant/ }).waitFor();
      await page.waitForTimeout(3500);
      await writeFile(`${out}/look-${size}-${tag}.png`, await page.screenshot({ type: 'png' }));
      await page.close();
    }
  }
  console.log('saved');
} finally { await browser?.close(); server.kill(); }
