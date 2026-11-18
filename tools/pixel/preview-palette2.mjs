// Second round: shared palettes across weathers, brand colours pinned, and a 24-colour version. Usage: node tools/pixel/preview-palette2.mjs
import { P, BRAND, hex, meanError, swatches } from './palette.mjs';
const K = 3, out = 'tools/pixel/out';
const names = [['phone', 'sunset'], ['phone', 'sun'], ['phone', 'rain'], ['desktop', 'sunset'], ['desktop', 'sun'], ['desktop', 'rain']];
const small = Object.fromEntries(names.map(([s, w]) => { const src = P.load(`${out}/still-${s}-${w}.png`); return [`${s}-${w}`, P.resize(src, Math.round(src.w / K))]; }));
/** All pixels of several buffers as one buffer, so quantize sees the whole set. */
const union = bufs => { const n = bufs.reduce((a, b) => a + b.px.length, 0), u = new P.Buf(n, 1); let o = 0; for (const b of bufs) { u.px.set(b.px, o); o += b.px.length; } return u; };
const all = union(Object.values(small));
const rgbOf = c => P.unpack(c);
const brand = Object.values(BRAND).map(h => P.col([1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))));

const shared16 = P.quantize(all, 16).palette;
const pinned = [...P.quantize(all, 11).palette, ...brand.map(rgbOf)];
const shared24 = P.quantize(all, 24).palette;
const candidates = { 'shared 16': shared16, 'brand 5 + scene 11': pinned, 'shared 24': shared24 };

console.log('mean colour error per still (lower is better)');
console.log('still'.padEnd(16), ...['per-still 16', ...Object.keys(candidates)].map(s => s.padStart(19)));
for (const [key, buf] of Object.entries(small)) {
  const own = P.quantize(buf, 16).palette;
  console.log(key.padEnd(16), ...[meanError(buf, own), ...Object.values(candidates).map(p => meanError(buf, p))].map(v => v.toFixed(1).padStart(19)));
}
for (const [name, pal] of Object.entries(candidates)) console.log(name.padEnd(20), pal.map(c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')).join(' '));

for (const key of ['phone-rain', 'desktop-sun']) {
  const buf = small[key], items = [{ buf: P.load(`${out}/still-${key.replace('-', '-')}.png`), label: 'original' }];
  for (const [name, pal] of Object.entries(candidates)) items.push({ buf: P.quantize(buf, pal.length, { palette: pal, dither: true }).buf.scaled(K), label: `${name} (err ${meanError(buf, pal).toFixed(1)})` });
  P.save(P.sheet(items, { cols: key.startsWith('phone') ? 4 : 2, scale: 1, gap: 8 }), `${out}/preview-palette2-${key}.png`);
}
P.save(P.sheet(Object.entries(candidates).map(([name, pal]) => ({ buf: swatches(pal, 20), label: name, scale: 1 })), { cols: 1, gap: 8 }), `${out}/preview-palette2-swatches.png`);
