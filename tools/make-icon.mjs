// Authoring-time only: turns the original 1024 px chef-hat icon (tools/source/icon-original.png, not shipped) into a pixel-art version in the game's colours, for the app listing.
// Usage: node tools/make-icon.mjs   -> public/icon-pixel.png (1024x1024, well under the 500 KB limit)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { PNG } = createRequire(import.meta.url)('pngjs');

const GRID = 64, SCALE = 16;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// The brand colours plus the few shades the hat and flame need. Nothing else can appear in the result.
const PALETTE = ['#163a36', '#1b4a45', '#224F4A', '#2d6a62', '#8a6a4a', '#c9b085', '#e6d3ac', '#f6e7ca', '#FFF2D7', '#ffffff', '#F2B743', '#f7cf6a', '#e8892f', '#DC533C', '#9e362b'].map(hex);
const nearest = c => { let best = 0, bd = Infinity; PALETTE.forEach((p, i) => { const d = (p[0] - c[0]) ** 2 * 2 + (p[1] - c[1]) ** 2 * 4 + (p[2] - c[2]) ** 2 * 3; if (d < bd) { bd = d; best = i; } }); return PALETTE[best]; };

const src = PNG.sync.read(readFileSync('tools/source/icon-original.png')), cell = src.width / GRID;
const out = new PNG({ width: GRID * SCALE, height: GRID * SCALE });
for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
  // Average the whole cell of the source, so the result is a faithful reduction and not a sample of one pixel.
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.floor(gy * cell); y < Math.floor((gy + 1) * cell); y++) for (let x = Math.floor(gx * cell); x < Math.floor((gx + 1) * cell); x++) { const i = (y * src.width + x) * 4; r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; n++; }
  const c = nearest([r / n, g / n, b / n]);
  for (let y = 0; y < SCALE; y++) for (let x = 0; x < SCALE; x++) { const i = (((gy * SCALE + y) * out.width) + gx * SCALE + x) * 4; out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255; }
}
const buffer = PNG.sync.write(out, { colorType: 2 });
writeFileSync('public/icon-pixel.png', buffer);
console.log(`wrote public/icon-pixel.png (${Math.round(buffer.length / 1024)} KB)`);
