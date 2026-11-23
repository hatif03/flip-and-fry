import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { createDailyHeadline, type HeadlineId } from '@/management/daily-headline';
import { applyPlanning } from '@/management/replay';
import { cozyBot, datesFrom, floorPolicy } from '@/management/bots';
import { evaluateStars, previewStars } from '@/management/stars';
import { headlineTip } from '@/management/headline-tips';
import { createRestaurant } from '@/management/types';

/** Plays a night with the scripted floor owner and returns the preview at the last service tick and the stars of the real receipt. */
function night(date: string, nights: number) {
  const planned = applyPlanning(createRestaurant(), cozyBot.actions); if ('error' in planned) throw new Error(planned.error);
  const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state = structuredClone(planned.state);
  e.state.history = Array.from({ length: nights }, () => ({ ...e.state.totals, day: 1, headline: null, challenges: [], wages: 0, rent: 0, debtPayment: 0, research: 0, profit: 150, rating: 4 }));
  expect(e.open(createDailyHeadline(date))).toBeNull();
  let last = previewStars(e.state);
  for (let i = 0; i < 4000 && e.state.phase === 'service'; i++) { last = previewStars(e.state); floorPolicy(e); e.tick(); }
  const report = e.state.history[e.state.history.length - 1];
  return { last, final: evaluateStars(report, e.state.headline!, nights ? 150 : null, nights + 1) };
}

describe('the live star tracker', () => {
  it('ends the night agreeing with the receipt on the goal, the challenges and beating the last night', () => {
    let goalAgrees = 0, total = 0;
    for (const date of datesFrom('2026-12-07', 14)) {
      const { last, final } = night(date, 5); total++;
      expect(last.challenges).toBe(final.challenges);
      if (last.goal === final.goal) goalAgrees++;
    }
    // Goals settled at closing (a rating with the last dirty seats, guests still at the table counted missed) may flip at the very end.
    expect(goalAgrees / total).toBeGreaterThanOrEqual(.85);
  });
  it('has a tip for every headline', () => {
    for (const id of ['quiet', 'rush', 'rain', 'supplier', 'critic', 'payday', 'inspection'] as HeadlineId[]) expect(headlineTip(id, createRestaurant()).text.length).toBeGreaterThan(20);
    expect(headlineTip('rush', createRestaurant()).panel).toBe('build');
    expect(headlineTip('supplier', createRestaurant()).panel).toBe('menu');
  });
});

describe('try next, on the result card', () => {
  const night = (id: 'steady' | 'confusing' | 'untidy', value = 80) => ({ award: { id, title: '', text: '' }, card: { welcome: 70, speed: 70, value } });
  const ok = { goal: true, challenges: 2 }, hands = { seats: 6, lunch: false };
  it('picks the first matching row, in order', async () => {
    const { tryNext } = await import('@/management/awards');
    expect(tryNext({ missed: 5, profit: 100 }, night('steady'), ok, hands)?.panel).toBe('build');
    expect(tryNext({ missed: 5, profit: 100 }, night('steady'), ok, { ...hands, seats: 10 })).toBeNull();
    expect(tryNext({ missed: 0, profit: 100 }, night('confusing'), ok, hands)?.panel).toBe('build');
    expect(tryNext({ missed: 0, profit: 100 }, night('steady', 30), ok, hands)?.panel).toBe('menu');
    expect(tryNext({ missed: 0, profit: 100 }, night('untidy'), ok, hands)?.text).toMatch(/Clear/);
    expect(tryNext({ missed: 0, profit: 100 }, night('steady'), { goal: true, challenges: 1 }, hands)?.text).toMatch(/second star/);
    expect(tryNext({ missed: 0, profit: 100 }, night('steady'), { goal: true, challenges: 1 }, { ...hands, lunch: true })).toBeNull();
    expect(tryNext({ missed: 0, profit: -20 }, night('steady'), ok, hands)?.panel).toBe('team');
    expect(tryNext({ missed: 0, profit: 100 }, night('steady'), ok, hands)).toBeNull();
  });
});
