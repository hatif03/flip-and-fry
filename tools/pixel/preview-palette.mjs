// Preview sheet for approval. Nothing here writes to public/. Usage: node tools/pixel/preview-palette.mjs
import { P, PALETTE, RAMPS, hex, meanError, swatches } from './palette.mjs';
const K = 3, out = 'tools/pixel/out';
const stills = [['phone', 'sunset'], ['phone', 'rain'], ['desktop', 'sun']];
const rows = [];
for (const [size, weather] of stills) {
  const src = P.load(`${out}/still-${size}-${weather}.png`);
  const small = P.resize(src, Math.round(src.w / K));
  const plain = small.scaled(K);
  const snapA = P.quantize(small, 16, { palette: PALETTE, dither: true }), snapAflat = P.quantize(small, 16, { palette: PALETTE, dither: false });
  const snapB = P.quantize(small, 16, { dither: true });
  const errA = meanError(small, PALETTE), errB = meanError(small, snapB.palette);
  console.log(`${size}/${weather}: mean colour error  brand palette ${errA.toFixed(1)}  data-driven ${errB.toFixed(1)}  (internal ${small.w}x${small.h}, x${K})`);
  rows.push({ label: `${size} ${weather}`, items: [
    { buf: src, label: 'original' }, { buf: plain, label: `pixelated ${small.w}x${small.h} (no palette)` },
    { buf: snapA.buf.scaled(K), label: `A brand palette + dither (err ${errA.toFixed(1)})` }, { buf: snapAflat.buf.scaled(K), label: 'A flat, no dither' },
    { buf: snapB.buf.scaled(K), label: `B data-driven 16 + dither (err ${errB.toFixed(1)})` },
  ] });
}
for (const row of rows) P.save(P.sheet(row.items, { cols: row.items.length > 4 && row.label.startsWith('phone') ? 3 : 2, scale: 1, gap: 8 }), `${out}/preview-palette-${row.label.replace(' ', '-')}.png`);
P.save(P.sheet([{ buf: swatches(PALETTE), label: 'A: brand ramps (ink 4, cream 4, tomato 4, gold 2, leaf 2)', scale: 1 }], { cols: 1, gap: 8 }), `${out}/preview-palette-swatches.png`);
console.log('A palette:', PALETTE.map(hex).join(' '));
for (const [name, ramp] of Object.entries(RAMPS)) console.log(' ', name.padEnd(7), ramp.map(hex).join(' '));
