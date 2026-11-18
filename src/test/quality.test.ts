import { beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS, SLOW_FRAME_MS, TIERS, detectTier, getTier, resetQuality, setTier, shouldStepDown, startQuality, stepDown } from '@/scene/quality';

describe('choosing a quality tier', () => {
  it('gives a capable phone or computer the high tier', () => { expect(detectTier({ cores: 8, memoryGb: 8, renderer: 'Adreno (TM) 650' })).toBe('high'); expect(detectTier({})).toBe('high'); });
  it('starts a modest device at medium, and a very small one or a software renderer at low', () => {
    expect(detectTier({ cores: 4, memoryGb: 4 })).toBe('medium'); expect(detectTier({ cores: 8, memoryGb: 4 })).toBe('medium'); expect(detectTier({ cores: 4, memoryGb: 8 })).toBe('medium');
    expect(detectTier({ cores: 2, memoryGb: 8 })).toBe('low'); expect(detectTier({ cores: 8, memoryGb: 2 })).toBe('low');
    for (const r of ['Google SwiftShader', 'llvmpipe (LLVM 15)', 'Microsoft Basic Render Driver']) expect(detectTier({ cores: 16, memoryGb: 16, renderer: r }), r).toBe('low');
  });
  it('can be forced with ?q= for testing, and ignores anything else', () => {
    expect(detectTier({ cores: 2, search: '?q=high' })).toBe('high'); expect(detectTier({ cores: 16, search: '?q=low' })).toBe('low'); expect(detectTier({ cores: 4, search: '?q=ultra' })).toBe('medium');
  });
});

describe('what each tier changes', () => {
  it('lowers shadows and rain step by step, and turns both off at the bottom', () => {
    expect(TIERS).toEqual(['high', 'medium', 'low']);
    expect(SETTINGS.high.shadowMap).toBeGreaterThan(SETTINGS.medium.shadowMap); expect(SETTINGS.medium.shadowMap).toBeGreaterThan(SETTINGS.low.shadowMap);
    expect(SETTINGS.high.rainShare).toBe(1); expect(SETTINGS.medium.rainShare).toBeLessThan(1); expect(SETTINGS.low).toMatchObject({ shadows: false, rainShare: 0, shadowMap: 0 });
  });
});

describe('stepping down at run time', () => {
  it('goes one tier down, and stays on the lowest', () => { expect(stepDown('high')).toBe('medium'); expect(stepDown('medium')).toBe('low'); expect(stepDown('low')).toBe('low'); });
  it('needs enough frames, a slow average and a tier left to give up', () => {
    expect(shouldStepDown(SLOW_FRAME_MS + 10, 30, 'high')).toBe(false); expect(shouldStepDown(SLOW_FRAME_MS + 10, 90, 'high')).toBe(true);
    expect(shouldStepDown(16, 90, 'high')).toBe(false); expect(shouldStepDown(SLOW_FRAME_MS, 90, 'high')).toBe(false); expect(shouldStepDown(80, 90, 'low')).toBe(false);
  });
});

describe('the shared choice', () => {
  beforeEach(() => resetQuality());
  it('is made once at start and then only changes when told to', () => {
    expect(startQuality({ cores: 4, memoryGb: 4 })).toBe('medium'); expect(startQuality({ cores: 16, memoryGb: 16 })).toBe('medium'); expect(getTier()).toBe('medium');
    setTier('low'); expect(getTier()).toBe('low');
  });
});
