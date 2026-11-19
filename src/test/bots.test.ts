import { describe, expect, it } from 'vitest';
import { bareBot, cozyBot, datesFrom, greedyBot, runBot, type Bot } from '@/management/bots';
import { evaluateStars } from '@/management/stars';
import type { HeadlineId } from '@/management/daily-headline';

/**
 * Calibration gates (plan section 5 and gate G3). The bots run the real engine from the starter park. If a gate fails
 * after a balance change, adjust a headline weight or its star line in daily-headline.ts / stars.ts, not arrive().
 */
const NEXT_21 = datesFrom('2026-11-19', 21);
/** The judging window, Wed 9 Dec to Wed 16 Dec: a judge can open the post on any of these days. */
const JUDGING = datesFrom('2026-12-09', 8);

type Night = { date: string; id: HeadlineId; stars: number; profit: number; goal: boolean; challenges: number };
function nights(bot: Bot, dates: string[]): Night[] {
  return dates.map(date => {
    const run = runBot(bot, date);
    if ('error' in run.result) throw new Error(`${bot.name} ${date}: ${run.result.error}`);
    const { report, state } = run.result, s = evaluateStars(report, state.headline!, null);
    return { date, id: run.headline.id, stars: s.stars, profit: report.profit, goal: s.goal, challenges: s.challenges };
  });
}
const of = (list: Night[], id: HeadlineId) => list.filter(n => n.id === id);

describe('daily calibration: the next 21 dates', () => {
  const cozy = nights(cozyBot, NEXT_21), bare = nights(bareBot, NEXT_21), greedy = nights(greedyBot, NEXT_21);
  it('covers three of every headline', () => { for (const id of ['quiet', 'rush', 'rain', 'supplier', 'critic', 'payday', 'inspection'] as const) expect(of(cozy, id)).toHaveLength(3); });
  it('a decorated room with a second server earns 1★ on at least 18 of 21 dates', () => { expect(cozy.filter(n => n.goal).length).toBeGreaterThanOrEqual(18); });
  it('and usually reaches 2★ too, so the challenges are worth playing for', () => { expect(cozy.filter(n => n.stars >= 2).length).toBeGreaterThanOrEqual(14); });
  it('the plain room clears the quiet and payday goals', () => {
    for (const id of ['quiet', 'payday'] as const) expect(of(bare, id).every(n => n.goal), id).toBe(true);
  });
  it('the plain room misses inspection and critic nights often enough to be a real choice', () => {
    for (const id of ['inspection', 'critic'] as const) expect(of(bare, id).filter(n => !n.goal).length, id).toBeGreaterThanOrEqual(2);
  });
  it('a bold menu beats the fair one on every payday', () => {
    for (const n of of(greedy, 'payday')) expect(n.profit, n.date).toBeGreaterThan(of(cozy, 'payday').find(c => c.date === n.date)!.profit);
  });
  it('and loses to it on other nights: in total, and on at least 80% of single nights (one lucky seed is not a broken price roll)', () => {
    const other = greedy.filter(g => g.id !== 'payday'), fair = (n: Night) => cozy.find(c => c.date === n.date)!.profit;
    expect(other.reduce((s, n) => s + n.profit, 0)).toBeLessThan(other.reduce((s, n) => s + fair(n), 0));
    expect(other.filter(n => n.profit < fair(n)).length / other.length).toBeGreaterThanOrEqual(.8);
  });
  it('the bold menu rarely earns stars on the hard nights', () => {
    const hard = greedy.filter(n => n.id !== 'quiet' && n.id !== 'payday');
    expect(hard.filter(n => n.goal).length / hard.length).toBeLessThanOrEqual(.2);
  });
});

describe('judging week (9 to 16 December)', () => {
  const cozy = nights(cozyBot, JUDGING), bare = nights(bareBot, JUDGING);
  it('a judge who builds a little earns 1★ on every day of the window', () => { expect(cozy.filter(n => !n.goal).map(n => n.date)).toEqual([]); });
  it('the first day a judge sees (Wed 9 Dec, rain) is playable even with no changes', () => {
    const wed = nights(bareBot, ['2026-12-09'])[0]; expect(wed.id).toBe('rain'); expect(wed.profit).toBeGreaterThan(0);
  });
  it('the starter park never loses money on any judging day', () => { expect(bare.every(n => n.profit > 0)).toBe(true); });
});

describe('the first week: a new owner who only taps Open', () => {
  // The coach bot changes nothing: the starter restaurant, as it comes. It must see a star on each of its first three nights, on every date.
  const coach: Bot = { name: 'coach', actions: [] };
  const ran = (date: string, night: number) => { const run = runBot(coach, date); if ('error' in run.result) throw new Error(run.result.error); return evaluateStars(run.result.report, run.result.state.headline!, null, night); };
  it('earns 1★ on nights 1, 2 and 3 for every one of the next 21 dates', () => {
    for (const date of NEXT_21) for (const night of [1, 2, 3]) expect(ran(date, night).stars, `${date} night ${night}`).toBeGreaterThanOrEqual(1);
  });
  it('and for every day of the judging week', () => { for (const date of JUDGING) expect(ran(date, 1).stars, date).toBeGreaterThanOrEqual(1); });
  it('from the fourth night the headline decides, so doing nothing is no longer enough on the hard nights', () => {
    expect(NEXT_21.filter(date => ran(date, 4).goal).length).toBeLessThan(NEXT_21.length / 2);
  });
  it('the welcome goal text names what to do, and is the one shown only on the first three nights', async () => {
    const { goalText, FIRST_NIGHTS } = await import('@/management/stars');
    expect(FIRST_NIGHTS).toBe(3); expect(goalText('critic', 1)).toBe('Serve 8 guests and finish in profit'); expect(goalText('critic', 3)).toBe(goalText('rush', 2)); expect(goalText('critic', 4)).toBe('Every star guest leaves happy and at most 3 guests are missed');
  });
});
