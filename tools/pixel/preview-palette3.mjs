// Recommended direction: one 16-colour palette per weather, derived from the real scene. Shows the dither choice. Usage: node tools/pixel/preview-palette3.mjs
import { writeFileSync } from 'node:fs';
import { P, meanError, swatches } from './palette.mjs';
const K = 3, out = 'tools/pixel/out', weathers = ['sunset', 'sun', 'rain'];
const small = (s, w) => { const src = P.load(`${out}/still-${s}-${w}.png`); return P.resize(src, Math.round(src.w / K)); };
const union = bufs => { const n = bufs.reduce((a, b) => a + b.px.length, 0), u = new P.Buf(n, 1); let o = 0; for (const b of bufs) { u.px.set(b.px, o); o += b.px.length; } return u; };
const palettes = {};
for (const w of weathers) palettes[w] = P.quantize(union([small('phone', w), small('desktop', w)]), 16).palette;
const hexOf = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
writeFileSync(`${out}/scene-palettes.json`, JSON.stringify(Object.fromEntries(weathers.map(w => [w, palettes[w].map(hexOf)])), null, 1));
for (const [s, w] of [['phone', 'sunset'], ['phone', 'rain'], ['desktop', 'sun']]) {
  const buf = small(s, w), pal = palettes[w], q = d => P.quantize(buf, 16, { palette: pal, dither: d }).buf.scaled(K);
  console.log(`${s}/${w}: error ${meanError(buf, pal).toFixed(1)}`);
  P.save(P.sheet([
    { buf: P.load(`${out}/still-${s}-${w}.png`), label: 'original' }, { buf: buf.scaled(K), label: 'pixelated, no palette' },
    { buf: q(false), label: `${w} palette, no dither` }, { buf: q(1 / 6), label: `${w} palette, light dither` }, { buf: q(true), label: `${w} palette, full dither` },
  ], { cols: s === 'phone' ? 3 : 2, scale: 1, gap: 8 }), `${out}/preview-palette3-${s}-${w}.png`);
}
P.save(P.sheet(weathers.map(w => ({ buf: swatches(palettes[w], 28), label: `${w} palette`, scale: 1 })), { cols: 1, gap: 8 }), `${out}/preview-palette3-swatches.png`);
