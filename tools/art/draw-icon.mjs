// Authoring-time only: draws the app icon as pixel art on a 64 by 64 grid, shape by shape (no photo reduction), then scales it x16.
// Usage: node tools/art/draw-icon.mjs   -> public/icon-pixel.png (1024x1024)
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { PNG } = createRequire(import.meta.url)('pngjs');

const N = 64, S = 16;
const C = { bg: '#224F4A', bg2: '#1c423e', ink: '#163a36', white: '#ffffff', cream: '#FFF2D7', shade: '#e6d3ac', deep: '#c9b085', gold: '#F2B743', lite: '#f9d77a', orange: '#e8892f', tomato: '#DC533C', dark: '#9e362b' };
const grid = Array.from({ length: N }, () => Array.from({ length: N }, () => C.bg));
const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) grid[y][x] = c; };
const get = (x, y) => (x >= 0 && y >= 0 && x < N && y < N ? grid[y][x] : null);

// A soft vignette of the second background colour in the corners, in hard steps.
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = Math.hypot(x - 31.5, y - 31.5); if (d > 44) put(x, y, C.bg2); }

// The hat: two side puffs behind, a tall middle puff in front, and a band. Lit from the upper left, so only the lower right edges are shaded.
const lobes = [{ cx: 16, cy: 28, r: 11 }, { cx: 48, cy: 28, r: 11 }, { cx: 32, cy: 20, r: 15 }];
const hat = new Set();
const inLobe = (o, x, y) => Math.hypot(x - o.cx, y - o.cy) <= o.r;
for (const o of lobes) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inLobe(o, x, y)) { hat.add(`${x},${y}`); const dx = (x - o.cx) / o.r, dy = (y - o.cy) / o.r, edge = dx * .6 + dy * .8, d = Math.hypot(dx, dy); put(x, y, d < .3 && dx + dy < -.2 ? C.white : edge > .86 ? C.deep : edge > .6 ? C.shade : C.cream); }
// The body between the puffs and the band, so the hat is one shape.
for (let y = 28; y <= 40; y++) for (let x = 14; x <= 49; x++) if (!hat.has(`${x},${y}`) || y > 36) { hat.add(`${x},${y}`); put(x, y, x > 40 ? C.shade : C.cream); }
// Where the middle puff overlaps the others, a fold line along its edge.
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const o = lobes[2]; if (Math.abs(Math.hypot(x - o.cx, y - o.cy) - o.r) < .6 && y > 24 && y < 40 && (x < 26 || x > 38)) put(x, y, C.deep); }
// The band: lit top, shaded right, a seam above it.
for (let y = 38; y <= 48; y++) for (let x = 17; x <= 46; x++) { hat.add(`${x},${y}`); put(x, y, y === 38 ? C.deep : x > 41 ? C.shade : x > 44 ? C.deep : C.cream); }
for (let y = 39; y <= 48; y++) { put(44, y, C.shade); put(45, y, C.shade); put(46, y, C.deep); }
for (let x = 17; x <= 46; x++) put(x, 48, C.deep);
for (let x = 20; x <= 30; x++) put(x, 40, C.white);
// A one-pixel ink outline around the whole hat.
const outline = [];
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!hat.has(`${x},${y}`) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => hat.has(`${x + dx},${y + dy}`))) outline.push([x, y]);
for (const [x, y] of outline) put(x, y, C.ink);

// The flame under the band, drawn row by row: r orange, g gold, l light gold, t tomato. A tall tongue with a small one at its side.
const FLAME = [
  '......r......',
  '.....rr......',
  '.....rrg.....',
  '....rrgg..r..',
  '....rgggr.rr.',
  '...rrgglgrrr.',
  '...rgglllgrr.',
  '..rrglllllgr.',
  '..rgglllllggr',
  '..rgglllllggr',
  '..rrggllllgrr',
  '...rrgglggrr.',
  '....trrgrrt..',
  '.....tttt....',
];
const COLORS = { r: C.orange, g: C.gold, l: C.lite, t: C.tomato };
const flame = new Set();
FLAME.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') { put(26 + i, 49 + j, COLORS[ch]); flame.add(`${26 + i},${49 + j}`); } }));
for (const key of [...flame]) { const [x, y] = key.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!flame.has(`${x + dx},${y + dy}`) && (get(x + dx, y + dy) === C.bg || get(x + dx, y + dy) === C.bg2)) put(x + dx, y + dy, C.ink); }

const out = new PNG({ width: N * S, height: N * S });
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) { const [r, g, b] = rgb(grid[gy][gx]); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (((gy * S + y) * out.width) + gx * S + x) * 4; out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = 255; } }
const buf = PNG.sync.write(out, { colorType: 2 });
writeFileSync('public/icon-pixel.png', buf);
console.log(`wrote public/icon-pixel.png (${Math.round(buf.length / 1024)} KB)`);
