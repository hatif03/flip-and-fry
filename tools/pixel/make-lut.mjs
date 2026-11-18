// Turns the per-weather scene palettes into the files the game ships: public/pixel/palettes.json and one 1024x32 lookup table
// per weather. A table maps every 5-bit RGB colour to its nearest palette colour, so the shader snaps with ONE texture fetch.
// Layout: x = blue*32 + red, y = green. Usage: node tools/pixel/make-lut.mjs   (run after make-palettes.mjs)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { P } from './palette.mjs';
const weathers = ['sunset', 'sun', 'rain'], palettes = JSON.parse(readFileSync('tools/pixel/out/scene-palettes.json', 'utf8'));
mkdirSync('public/pixel', { recursive: true });
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
for (const w of weathers) {
  const pal = palettes[w].map(rgb), lut = new P.Buf(1024, 32);
  for (let b = 0; b < 32; b++) for (let g = 0; g < 32; g++) for (let r = 0; r < 32; r++) {
    const c = [r, g, b].map(v => Math.round(v * 255 / 31));
    lut.px[g * 1024 + b * 32 + r] = P.col(pal[P.nearest(pal, c)]);
  }
  P.save(lut, `public/pixel/lut-${w}.png`);
}
writeFileSync('public/pixel/palettes.json', JSON.stringify({ k: 3, weathers: palettes }, null, 1) + '\n');
console.log('wrote public/pixel/palettes.json and', weathers.length, 'lookup tables');
