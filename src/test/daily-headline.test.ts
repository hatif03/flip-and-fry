import { describe, expect, it } from 'vitest';
import { NEUTRAL, WEEK, createDailyHeadline, headlineEffects, weekday, type HeadlineId } from '@/management/daily-headline';

/** Real calendar anchors, so a bug in the day arithmetic cannot hide behind a self-consistent table. */
const KNOWN: Array<[string, number]> = [['1970-01-01', 4], ['2000-02-29', 2], ['2024-02-29', 4], ['2026-11-18', 3], ['2026-12-08', 2], ['2026-12-09', 3], ['2026-12-13', 0], ['2026-12-16', 3], ['2100-03-01', 1]];

describe('weekday', () => {
  it('matches real calendar dates, including leap days and the judging week', () => {
    for (const [date, day] of KNOWN) expect(weekday(date), date).toBe(day);
  });
  it('rejects anything that is not a real date', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '26-11-18', '2026/11/18', '', '2026-11-1', '2100-02-29']) expect(() => weekday(bad), bad).toThrow();
  });
});

describe('createDailyHeadline', () => {
  it('picks the headline by weekday', () => {
    expect(createDailyHeadline('2026-12-13').id).toBe('inspection');
    expect(createDailyHeadline('2026-12-14').id).toBe('quiet');
    expect(createDailyHeadline('2026-12-15').id).toBe('rush');
    expect(createDailyHeadline('2026-12-09').id).toBe('rain');
    expect(createDailyHeadline('2026-12-10').id).toBe('supplier');
    expect(createDailyHeadline('2026-12-11').id).toBe('critic');
    expect(createDailyHeadline('2026-12-12').id).toBe('payday');
  });
  it('is pure and stable', () => { expect(createDailyHeadline('2026-12-09')).toEqual(createDailyHeadline('2026-12-09')); });
  it('gives seven distinct headlines in a week and different seeds on different dates', () => {
    const week = Array.from({ length: 7 }, (_, i) => createDailyHeadline(`2026-12-${String(7 + i).padStart(2, '0')}`));
    expect(new Set(week.map(h => h.id)).size).toBe(7);
    expect(new Set(week.map(h => h.seed)).size).toBe(7);
    expect(new Set(WEEK).size).toBe(7);
  });
  it('has copy for every headline and rain only on Wednesday', () => {
    for (let day = 1; day <= 28; day++) {
      const h = createDailyHeadline(`2026-12-${String(day).padStart(2, '0')}`);
      expect(h.title.split(' ').length).toBeGreaterThanOrEqual(3); expect(h.title.split(' ').length).toBeLessThanOrEqual(6); expect(h.blurb.length).toBeGreaterThan(10);
      expect(h.weather === 'rain').toBe(h.id === 'rain');
    }
  });
});

describe('headlineEffects', () => {
  it('is neutral with no headline', () => { expect(headlineEffects(null)).toEqual(NEUTRAL); expect(headlineEffects(undefined)).toEqual(NEUTRAL); });
  it('changes only what its headline says', () => {
    const fx = (id: HeadlineId, seed = 1) => headlineEffects({ id, seed });
    expect(fx('quiet').patience).toBeGreaterThan(1); expect(fx('quiet').gapDelta).toBeGreaterThan(0);
    expect(fx('rush').gapDelta).toBeLessThan(0);
    expect(fx('rain').walk).toBeLessThan(1); expect(fx('rain').tipComfort).toBe(1.5);
    expect(fx('critic').specialAlways && fx('critic').criticCap).toBe(true);
    expect(fx('payday').priceRoll).toBe(.5);
    expect(fx('inspection').dirtyPenalty).toBeGreaterThan(0);
    expect(fx('quiet').burgerCost).toBe(1);
  });
  it('jitters the supplier hike inside 1.4 to 1.6 from the date seed', () => {
    const costs = new Set<number>();
    for (let seed = 0; seed < 200; seed++) { const c = headlineEffects({ id: 'supplier', seed }).burgerCost; expect(c).toBeGreaterThanOrEqual(1.4); expect(c).toBeLessThanOrEqual(1.6); costs.add(c); }
    expect(costs.size).toBeGreaterThan(1);
  });
  it('bright sun shortens patience and nudges toward burgers, never on a rainy day', () => {
    let sun = 0;
    for (let seed = 0; seed < 50; seed++) { const fx = headlineEffects({ id: 'quiet', seed }); if (fx.burgerBias > 0) { sun++; expect(fx.patience).toBeCloseTo(1.15 * .95); } else expect(fx.patience).toBe(1.15); expect(headlineEffects({ id: 'rain', seed }).burgerBias).toBe(0); }
    expect(sun).toBeGreaterThan(10); expect(sun).toBeLessThan(40);
  });
});
