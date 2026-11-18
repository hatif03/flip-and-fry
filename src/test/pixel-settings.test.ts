import { describe, expect, it } from 'vitest';
import { autoPixelSize, paletteWeights, pixelSettings } from '@/scene/pixel/pixel-settings';

describe('pixel settings', () => {
  it('is on by default and picks its size from the screen', () => { expect(pixelSettings('')).toEqual({ enabled: true, k: null }); });
  it('can be turned off for debugging or forced to a size from 1 to 6', () => {
    expect(pixelSettings('?pixel=0').enabled).toBe(false); expect(pixelSettings('?k=2').k).toBe(2); expect(pixelSettings('?k=1').k).toBe(1);
    for (const bad of ['?k=0', '?k=9', '?k=abc', '?k=-3', '?k=']) expect(pixelSettings(bad).k, bad).toBeNull();
  });
});

describe('automatic pixel size', () => {
  it('keeps phones fine enough to read, and lets big screens be chunkier', () => {
    expect(autoPixelSize(360)).toBe(1); expect(autoPixelSize(412)).toBe(1); expect(autoPixelSize(768)).toBe(2); expect(autoPixelSize(1280)).toBe(3); expect(autoPixelSize(2560)).toBe(3);
  });
  it('always gives a whole number from 1 to 3 and never shrinks the picture below about 300 pixels across', () => {
    for (let w = 200; w <= 3000; w += 17) { const k = autoPixelSize(w); expect(Number.isInteger(k)).toBe(true); expect(k).toBeGreaterThanOrEqual(1); expect(k).toBeLessThanOrEqual(3); if (w >= 300) expect(w / k).toBeGreaterThanOrEqual(300 / 1.0 * .7); }
  });
});

describe('palette weights', () => {
  it('always sum to one and are never negative', () => {
    for (let sun = -.2; sun <= 1.2; sun += .1) for (let rain = -.2; rain <= 1.2; rain += .1) {
      const w = paletteWeights(sun, rain); expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1); expect(Math.min(...w)).toBeGreaterThanOrEqual(0);
    }
  });
  it('picks one palette at rest and blends two while the weather changes', () => {
    expect(paletteWeights(0, 0)).toEqual([1, 0, 0]); expect(paletteWeights(1, 0)).toEqual([0, 1, 0]); expect(paletteWeights(0, 1)).toEqual([0, 0, 1]);
    expect(paletteWeights(.25, 0)[0]).toBeCloseTo(.75); expect(paletteWeights(0, .5)).toEqual([.5, 0, .5]);
  });
});
