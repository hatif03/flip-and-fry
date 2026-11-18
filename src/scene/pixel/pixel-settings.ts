/**
 * How the scene is presented as pixels. `k` is how many screen pixels one scene pixel covers (an integer, so every pixel is the
 * same size). `?pixel=0` turns the look off and `?k=4` changes the size, for debugging and for the quality tiers later.
 */
export type PixelSettings = { enabled: boolean; k: number };
export function pixelSettings(search: string = typeof location === 'undefined' ? '' : location.search): PixelSettings {
  const params = new URLSearchParams(search), k = Math.round(Number(params.get('k')));
  return { enabled: params.get('pixel') !== '0', k: Number.isFinite(k) && k >= 2 && k <= 6 ? k : 3 };
}
export const WEATHERS = ['sunset', 'sun', 'rain'] as const;
export type PixelWeather = (typeof WEATHERS)[number];
/** Blend weights for the three palettes from the scene's sun and rain blend (0 to 1 each). They always sum to 1. */
export function paletteWeights(sun: number, rain: number): [number, number, number] {
  const s = Math.min(1, Math.max(0, sun)), r = Math.min(1 - s, Math.max(0, rain));
  return [Math.max(0, 1 - s - r), s, r];
}
