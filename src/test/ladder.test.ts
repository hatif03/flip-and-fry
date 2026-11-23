import { describe, expect, it } from 'vitest';
import { LADDER, ladderOn, nextIntro, unlocked } from '@/management/ladder';
import { badgesFor } from '@/management/badges';
import { createRestaurant } from '@/management/types';
import type { WorldView } from '@/shared/api';

const ctx = (seen: string[] = [], showAll = false) => ({ reddit: true, seen: new Set(seen), showAll });

describe('the unlock ladder', () => {
  it('opens one system at a time by nights played', () => {
    const at = (n: number) => (['build', 'goals', 'menu', 'garden', 'kitchen', 'team', 'street', 'rush'] as const).filter(f => unlocked(f, n, ctx()));
    expect(at(0)).toEqual([]);
    expect(at(1)).toEqual(['build', 'goals', 'rush']);
    expect(at(2)).toEqual(['build', 'goals', 'menu', 'garden', 'kitchen', 'rush']);
    expect(at(3)).toContain('team'); expect(at(4)).not.toContain('street'); expect(at(5)).toContain('street');
  });
  it('is off in the browser game, after a skipped tour, and with Show everything', () => {
    expect(ladderOn({ reddit: false, seen: new Set(), showAll: false })).toBe(false);
    expect(unlocked('team', 0, ctx(['skip']))).toBe(true);
    expect(unlocked('team', 0, ctx([], true))).toBe(true);
  });
  it('introduces each new system once, in ladder order, then the headline goal on the fourth night', () => {
    expect(nextIntro(0, ctx())).toBeNull();
    expect(nextIntro(1, ctx())?.id).toBe('intro-goals');
    expect(nextIntro(1, ctx(['intro-goals']))?.id).toBe('intro-dinner');
    expect(nextIntro(2, ctx(['intro-goals', 'intro-dinner']))?.id).toBe('intro-menu');
    const allBefore = LADDER.filter(r => r.intro && r.after <= 3).map(r => r.intro!);
    expect(nextIntro(3, ctx(allBefore))?.id).toBe('intro-goal');
    expect(nextIntro(4, ctx(allBefore))).toBeNull();
    expect(nextIntro(5, ctx(allBefore))?.id).toBe('intro-street');
    expect(nextIntro(2, ctx(['skip']))).toBeNull();
  });
});

describe('dots on the dock', () => {
  it('marks Goals for a milestone ready to collect, and the Garden for a ripe crop', () => {
    const s = createRestaurant();
    expect(badgesFor(s, null, 0)).toEqual({ goals: false, garden: false });
    expect(badgesFor({ ...s, lifetimeServed: 9 }, null, 0).goals).toBe(true);
    const view = { plots: [{ index: 0, crop: 'tomato', readyAt: 100 }], workshop: [], builders: { jobs: [] } } as unknown as WorldView;
    expect(badgesFor(s, view, 50).garden).toBe(false); expect(badgesFor(s, view, 150).garden).toBe(true);
  });
});
