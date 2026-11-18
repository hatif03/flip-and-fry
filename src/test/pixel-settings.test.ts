import { describe, expect, it } from 'vitest';
import { paletteWeights, pixelSettings } from '@/scene/pixel/pixel-settings';

describe('pixel settings', () => {
  it('is on at 3x by default', () => { expect(pixelSettings('')).toEqual({ enabled: true, k: 3 }); });
  it('can be turned off for debugging, and the pixel size is clamped to whole numbers from 2 to 6', () => {
    expect(pixelSettings('?pixel=0').enabled).toBe(false);
    expect(pixelSettings('?k=4').k).toBe(4); expect(pixelSettings('?k=2.6').k).toBe(3);
    for (const bad of ['?k=1', '?k=9', '?k=abc', '?k=-3', '?k=']) expect(pixelSettings(bad).k, bad).toBe(3);
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
