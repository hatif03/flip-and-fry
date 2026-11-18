// Builds one 16-colour scene palette per weather from the real captures: 14 clustered colours plus 2 reserved leaf greens
// (clustering alone drops the scene's few saturated greens and the trees go grey). Usage: node tools/pixel/make-palettes.mjs
import { writeFileSync } from 'node:fs';
import { P, meanError, swatches } from './palette.mjs';
const K = 3, out = 'tools/pixel/out', weathers = ['sunset', 'sun', 'rain'];
const SIZE = Number((process.argv.find(a => a.startsWith('--colors=')) ?? '--colors=16').slice(9));
const small = (s, w) => { const src = P.load(`${out}/still-${s}-${w}.png`); return P.resize(src, Math.round(src.w / K)); };
const pixels = bufs => { const n = bufs.reduce((a, b) => a + b.px.length, 0), u = new P.Buf(n, 1); let o = 0; for (const b of bufs) { u.px.set(b.px, o); o += b.px.length; } return u; };
const isLeaf = c => { const [h, s, l] = P.toHsl(c); return h >= 70 && h <= 165 && s > .2 && l > .12 && l < .75; };
const hexOf = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const result = {};
for (const w of weathers) {
  const all = pixels([small('phone', w), small('desktop', w)]);
  const leaf = new P.Buf(all.px.length, 1), rest = new P.Buf(all.px.length, 1); let nl = 0, nr = 0;
  for (const c of all.px) if (c >>> 24) { if (isLeaf(c)) leaf.px[nl++] = c; else rest.px[nr++] = c; }
  const greens = nl > 20 ? P.quantize(Object.assign(new P.Buf(nl, 1), { px: leaf.px.slice(0, nl) }), 2).palette : [];
  const base = P.quantize(Object.assign(new P.Buf(nr, 1), { px: rest.px.slice(0, nr) }), SIZE - greens.length).palette;
  result[w] = [...base, ...greens];
  console.log(`${w}: ${nl} leaf pixels -> ${greens.length} greens; palette ${result[w].length}`);
}
writeFileSync(`${out}/scene-palettes.json`, JSON.stringify(Object.fromEntries(weathers.map(w => [w, result[w].map(hexOf)])), null, 1));
for (const [s, w] of [['phone', 'sunset'], ['phone', 'rain'], ['desktop', 'sun']]) {
  const buf = small(s, w), pal = result[w];
  console.log(`${s}/${w}: mean error ${meanError(buf, pal).toFixed(1)}`);
  P.save(P.sheet([
    { buf: P.load(`${out}/still-${s}-${w}.png`), label: 'original' },
    { buf: P.quantize(buf, 16, { palette: pal, dither: false }).buf.scaled(K), label: `${w} palette, flat` },
    { buf: P.quantize(buf, 16, { palette: pal, dither: 1 / 6 }).buf.scaled(K), label: `${w} palette, light dither` },
  ], { cols: s === 'phone' ? 3 : 1, scale: 1, gap: 8 }), `${out}/preview-final-${s}-${w}.png`);
}
P.save(P.sheet(weathers.map(w => ({ buf: swatches(result[w], 28), label: `${w} palette (last 2 are the reserved greens)`, scale: 1 })), { cols: 1, gap: 8 }), `${out}/preview-final-swatches.png`);
