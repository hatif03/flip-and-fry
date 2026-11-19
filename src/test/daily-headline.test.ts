import { describe, expect, it } from 'vitest';
import { NEUTRAL, WEEK, createDailyHeadline, dayOfYear, daysInYear, headlineEffects, shiftDate, weekday, type HeadlineId } from '@/management/daily-headline';

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

describe('date arithmetic', () => {
  it('shifts across month, year and leap boundaries', () => {
    expect(shiftDate('2026-11-30', 1)).toBe('2026-12-01'); expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2027-01-01', -1)).toBe('2026-12-31'); expect(shiftDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftDate('2100-02-28', 1)).toBe('2100-03-01'); expect(shiftDate('2026-12-09', 7)).toBe('2026-12-16');
    expect(shiftDate('2026-12-09', 0)).toBe('2026-12-09'); expect(shiftDate('1970-01-01', -1)).toBe('1969-12-31');
  });
  it('round-trips over several years', () => {
    let d = '2024-01-01'; for (let i = 0; i < 1500; i++) d = shiftDate(d, 1);
    expect(d).toBe('2028-02-09'); // 2024 has 366 days, so +1461 is 2028-01-01 and +39 more is Feb 9 for (let i = 0; i < 1500; i++) d = shiftDate(d, -1); expect(d).toBe('2024-01-01');
  });
  it('numbers days from 0 within a year, and knows leap years', () => {
    expect(dayOfYear('2026-01-01')).toEqual({ year: 2026, index: 0 }); expect(dayOfYear('2026-12-31')).toEqual({ year: 2026, index: 364 });
    expect(dayOfYear('2024-12-31')).toEqual({ year: 2024, index: 365 }); expect(dayOfYear('2026-12-09').index).toBe(342);
    expect(daysInYear(2024)).toBe(366); expect(daysInYear(2026)).toBe(365); expect(daysInYear(2100)).toBe(365); expect(daysInYear(2000)).toBe(366);
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

describe('three tellings of each headline', () => {
  it('give 21 distinct titles over 21 days, repeating only every third week, with the same kind of night underneath', () => {
    const titles = new Set<string>(); let date = '2026-12-09';
    for (let i = 0; i < 21; i++) { titles.add(createDailyHeadline(date).title); date = shiftDate(date, 1); }
    expect(titles.size).toBe(21);
    expect(createDailyHeadline('2026-12-09').title).toBe('Rain on the roof'); expect(createDailyHeadline(shiftDate('2026-12-09', 21)).title).toBe('Rain on the roof');
    expect(createDailyHeadline(shiftDate('2026-12-09', 7)).id).toBe(createDailyHeadline('2026-12-09').id);
    expect(createDailyHeadline(shiftDate('2026-12-09', 7)).title).not.toBe('Rain on the roof');
  });
  it('are the same on every device: the telling depends only on the date', () => {
    expect(createDailyHeadline('2026-12-15')).toEqual(createDailyHeadline('2026-12-15'));
  });
});

describe('the three tellings lean the same night a little differently', () => {
  it('the judging week keeps the original numbers; the other weeks move one weight a few percent', async () => {
    const { headlineEffects, tellingOf, createDailyHeadline, NEUTRAL } = await import('@/management/daily-headline');
    expect(tellingOf('2026-12-09')).toBe(0);
    const rush = (date: string) => headlineEffects(createDailyHeadline(date)).gapDelta;
    expect(rush('2026-11-24')).not.toBe(rush('2026-12-01')); // two different tellings of the same weekday
    expect(headlineEffects({ id: 'rush', seed: 1 }).gapDelta).toBe(-1); // no date: the original
    expect(headlineEffects(null)).toBe(NEUTRAL);
  });
});
