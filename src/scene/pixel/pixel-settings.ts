/**
 * How the scene is presented as pixels. `k` is how many CSS pixels one scene pixel covers (a whole number, so every pixel is the
 * same size); null means "pick from the screen width". `?pixel=0` turns the look off and `?k=2` forces a size.
 */
export type PixelSettings = { enabled: boolean; k: number | null };
export function pixelSettings(search: string = typeof location === 'undefined' ? '' : location.search): PixelSettings {
  const params = new URLSearchParams(search), k = Math.round(Number(params.get('k')));
  return { enabled: params.get('pixel') !== '0', k: Number.isFinite(k) && k >= 1 && k <= 6 ? k : null };
}
/**
 * Pixel size from the width of the canvas in CSS pixels. The whole city must stay readable: a phone about 360 px wide gets 1
 * (roughly 360 scene pixels across, so animals are still several pixels tall), a tablet 2, a desktop window 3. At a fixed 3 a phone
 * showed only 120 pixels across and the animals became blobs.
 */
export function autoPixelSize(cssWidth: number): number { return Math.max(1, Math.min(3, Math.round(cssWidth / 420))); }
export const WEATHERS = ['sunset', 'sun', 'rain'] as const;
export type PixelWeather = (typeof WEATHERS)[number];
/** Blend weights for the three palettes from the scene's sun and rain blend (0 to 1 each). They always sum to 1. */
export function paletteWeights(sun: number, rain: number): [number, number, number] {
  const s = Math.min(1, Math.max(0, sun)), r = Math.min(1 - s, Math.max(0, rain));
  return [Math.max(0, 1 - s - r), s, r];
}
