// Regression guard for size (plan section 20.7). Run after `npm run build:devvit`:  node scripts/perf-check.mjs
// It only reads dist/client. Budgets are the numbers recorded in docs/perf-log.md plus a little room; lower them as the game gets smaller.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const root = 'dist/client';
const walk = dir => readdirSync(dir).flatMap(name => { const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(root).filter(f => !f.endsWith('.map'));
const gz = f => gzipSync(readFileSync(f)).length;
const kb = n => Math.round(n / 1024);

const pick = re => files.filter(f => re.test(f.replace(/\\/g, '/')));
const sum = (list, size) => list.reduce((n, f) => n + size(f), 0);
const size = f => statSync(f).size;

// The splash is what shows in the feed: it must stay tiny. Its own script plus shared chunks it imports.
const splashFiles = [...pick(/\/splash\.(html|css)$/), ...pick(/\/splash\.js$/), ...pick(/pixelify-sans-latin-700-normal\.woff2$/), ...pick(/\/icon-pixel\.png$/)];
const initialJs = pick(/\/(game|main|diner-model|daily-headline|default|use-reduced-motion|rolldown-runtime|emit-effect)\.js$/);
const lazyJs = pick(/\/(TestKitchen|RestaurantScene)\.js$/);
const models = pick(/\/assets\/models\/.*\.glb$/), audio = pick(/\/assets\/audio\/.*\.mp3$/);
const biggestModel = Math.max(0, ...models.map(size));

const checks = [
  ['splash (html, css, script, font, icon)', sum(splashFiles, size), 150 * 1024],
  ['initial JavaScript, gzipped', sum(initialJs, gz), 650 * 1024],
  ['lazy chunks (Test Kitchen, scene), gzipped', sum(lazyJs, gz), 120 * 1024],
  ['3D models in the build', sum(models, size), 900 * 1024],
  ['largest single model', biggestModel, 150 * 1024],
  ['audio in the build', sum(audio, size), 450 * 1024],
  ['font files a browser loads (woff2)', sum(pick(/\.woff2$/), size), 140 * 1024],
];
let failed = 0;
for (const [name, value, budget] of checks) {
  const ok = value <= budget; if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(44)} ${String(kb(value)).padStart(6)} KB  (budget ${kb(budget)} KB)`);
}
if (!files.length) { console.error('No build found: run `npm run build:devvit` first.'); process.exit(2); }
process.exit(failed ? 1 : 0);
