// Authoring-time only: writes a contact sheet of the four portraits (scaled x12) to tools/pixel/out/portraits.png for a look.
// Usage: npx vite-node tools/art/portraits-sheet.ts
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { portraitCells } from '../../src/management/portraits';
const { PNG } = createRequire(import.meta.url)('pngjs');
const species = ['mouse', 'rabbit', 'bear', 'crocodile'] as const, S = 12, pad = 8, W = species.length * (16 * S + pad) + pad, H = 16 * S + pad * 2;
const png = new PNG({ width: W, height: H });
for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 0xff; png.data[i + 1] = 0xf2; png.data[i + 2] = 0xd7; png.data[i + 3] = 255; }
species.forEach((sp, n) => portraitCells(sp).forEach((row, y) => row.forEach((c, x) => {
  if (!c) return; const [r, g, b] = [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16));
  for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) { const i = (((pad + y * S + yy) * W) + pad + n * (16 * S + pad) + x * S + xx) * 4; png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255; }
})));
writeFileSync('tools/pixel/out/portraits.png', PNG.sync.write(png)); console.log('wrote tools/pixel/out/portraits.png');
