const WEATHERS = ['sunset', 'sun', 'rain'] as const;
type Palettes = { size: number; weathers: Record<(typeof WEATHERS)[number], string[]> };
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

async function pixels(url: string): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const blob = await (await fetch(url)).blob(), bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0); return { width: bitmap.width, height: bitmap.height, ...{ data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data } };
}
/** The same weighted distance Codixel's P.nearest uses to build the tables: green counts most, then blue, then red. */
const dist2 = (a: number[], b: number[]) => 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2;
const nearest = (palette: number[][], c: number[]) => { let best = 0; palette.forEach((p, i) => { if (dist2(p, c) < dist2(palette[best], c)) best = i; }); return best; };

describe('the shipped palettes and lookup tables', () => {
  let palettes: Palettes;
  beforeAll(async () => { palettes = await (await fetch('/pixel/palettes.json')).json(); });

  it('have the same number of distinct colours for every weather, as valid hex', () => {
    expect(palettes.size).toBeGreaterThanOrEqual(16); expect(palettes.size).toBeLessThanOrEqual(32);
    for (const w of WEATHERS) { const list = palettes.weathers[w]; expect(list, w).toHaveLength(palettes.size); expect(new Set(list).size, w).toBe(palettes.size); for (const c of list) expect(c).toMatch(/^#[0-9a-f]{6}$/); }
  });
  it('keep the scene readable: each palette has a dark, a light, a warm and a green colour', () => {
    for (const w of WEATHERS) {
      const list = palettes.weathers[w].map(rgb), lum = (c: number[]) => .3 * c[0] + .59 * c[1] + .11 * c[2];
      expect(Math.min(...list.map(lum)), `${w} dark`).toBeLessThan(60); expect(Math.max(...list.map(lum)), `${w} light`).toBeGreaterThan(200);
      expect(list.some(c => c[0] > c[2] + 60), `${w} warm`).toBe(true); expect(list.some(c => c[1] > c[0] + 12 && c[1] > c[2] + 12), `${w} green`).toBe(true);
    }
  });
  it('are 1024x32 tables containing ONLY colours of their own palette (so a snapped frame can contain nothing else)', async () => {
    for (const w of WEATHERS) {
      const lut = await pixels(`/pixel/lut-${w}.png`), pal = new Set(palettes.weathers[w]);
      expect([lut.width, lut.height]).toEqual([1024, 32]);
      const seen = new Set<string>();
      for (let i = 0; i < lut.data.length; i += 4) { expect(lut.data[i + 3], 'opaque').toBe(255); seen.add('#' + [0, 1, 2].map(j => lut.data[i + j].toString(16).padStart(2, '0')).join('')); }
      for (const c of seen) expect(pal.has(c), `${w} ${c}`).toBe(true);
      expect(seen.size, `${w} uses most of its palette`).toBeGreaterThanOrEqual(Math.floor(palettes.size * .75));
    }
  });
  it('map every sampled colour to its nearest palette colour (the shader reads x = blue*32 + red, y = green)', async () => {
    for (const w of WEATHERS) {
      const lut = await pixels(`/pixel/lut-${w}.png`), pal = palettes.weathers[w].map(rgb);
      for (let n = 0; n < 1500; n++) {
        const r = (n * 7) % 32, g = (n * 13) % 32, b = (n * 5 + (n >> 5)) % 32, at = (g * 1024 + b * 32 + r) * 4;
        const want = pal[nearest(pal, [r, g, b].map(v => Math.round(v * 255 / 31)))];
        expect([lut.data[at], lut.data[at + 1], lut.data[at + 2]], `${w} r${r} g${g} b${b}`).toEqual(want);
      }
    }
  });
  it('are small enough to ship (a few KB each) and the weather palettes really differ', async () => {
    for (const w of WEATHERS) expect((await (await fetch(`/pixel/lut-${w}.png`)).arrayBuffer()).byteLength).toBeLessThan(20_000);
    expect(palettes.weathers.rain).not.toEqual(palettes.weathers.sunset); expect(palettes.weathers.sun).not.toEqual(palettes.weathers.sunset);
  });
});
