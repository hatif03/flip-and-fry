import { describe, expect, it } from 'vitest';
import { bareBot, cozyBot, datesFrom, floorPolicy, greedyBot, playWithHelper, runBot, type Bot } from '@/management/bots';
import { evaluateStars, FIRST_NIGHTS, goalText, LUNCH_STARS } from '@/management/stars';
import type { HeadlineId } from '@/management/daily-headline';
import type { Action } from '@/management/replay';

/**
 * Calibration gates (plan section 5 and gate G3, redone for engine v2). The bots run the real engine from the starter park. There are two
 * kinds of player: the team alone (`auto`, the bot's planning actions and nothing at the pass) and a hands-on owner (`floor`, a scripted
 * owner who seats, takes orders, flips, plates, carries and clears, one second after each job appears). If a gate fails after a balance
 * change, adjust a headline weight, a star line or a delay, not arrive().
 */
const NEXT_21 = datesFrom('2026-11-19', 21);
/** The judging window, Wed 9 Dec to Wed 16 Dec: a judge can open the post on any of these days. */
const JUDGING = datesFrom('2026-12-09', 8);

type Mode = 'auto' | 'floor';
type Night = { date: string; id: HeadlineId; stars: number; profit: number; goal: boolean; challenges: number; chain: number };
function nights(bot: Bot, dates: string[], mode: Mode): Night[] {
  return dates.map(date => {
    const auto = mode === 'auto' ? runBot(bot, date) : null, played = mode === 'floor' ? playWithHelper(bot, date, undefined, floorPolicy) : null;
    const result = auto ? auto.result : played!.replay;
    if ('error' in result) throw new Error(`${bot.name} ${date}: ${result.error}`);
    const { report, state } = result, s = evaluateStars(report, state.headline!, null, 9, 'dinner', state.hustle.best);
    return { date, id: state.headline!.id, stars: s.stars, profit: report.profit, goal: s.goal, challenges: s.challenges, chain: state.hustle.best };
  });
}
const of = (list: Night[], id: HeadlineId) => list.filter(n => n.id === id);

describe('daily calibration: the next 21 dates', () => {
  const cozy = nights(cozyBot, NEXT_21, 'floor'), cozyAuto = nights(cozyBot, NEXT_21, 'auto'), bare = nights(bareBot, NEXT_21, 'floor'), bareAuto = nights(bareBot, NEXT_21, 'auto');
  const greedy = nights(greedyBot, NEXT_21, 'floor');
  it('covers three of every headline', () => { for (const id of ['quiet', 'rush', 'rain', 'supplier', 'critic', 'payday', 'inspection'] as const) expect(of(cozy, id)).toHaveLength(3); });
  it('a decorated room with a second server and hands on the floor earns 1★ on at least 20 of 21 dates', () => { expect(cozy.filter(n => n.goal).length).toBeGreaterThanOrEqual(20); });
  it('and usually reaches 2★ too, so the challenges are worth playing for', () => { expect(cozy.filter(n => n.stars >= 2).length).toBeGreaterThanOrEqual(14); });
  it('the same room left to the team alone earns the goal on only about half the dates: hands are what makes the stars', () => {
    const alone = cozyAuto.filter(n => n.goal).length; expect(alone).toBeGreaterThanOrEqual(8); expect(alone).toBeLessThanOrEqual(15);
  });
  it('a hands-on night beats the team alone in profit on at least 90% of dates, for both rooms', () => {
    for (const [hands, alone] of [[cozy, cozyAuto], [bare, bareAuto]] as const) expect(hands.filter((n, i) => n.profit > alone[i].profit).length / hands.length).toBeGreaterThanOrEqual(.9);
  });
  it('the plain room with hands on the floor clears the quiet and payday goals', () => {
    for (const id of ['quiet', 'payday'] as const) expect(of(bare, id).every(n => n.goal), id).toBe(true);
  });
  it('the plain room left alone misses inspection and critic nights often enough to be a real choice', () => {
    for (const id of ['inspection', 'critic'] as const) expect(of(bareAuto, id).filter(n => !n.goal).length, id).toBeGreaterThanOrEqual(2);
  });
  it('a bold menu beats the fair one on every payday', () => {
    for (const n of of(greedy, 'payday')) expect(n.profit, n.date).toBeGreaterThan(of(cozy, 'payday').find(c => c.date === n.date)!.profit);
  });
  it('and loses to it on other nights: in total, and on at least 80% of single nights (one lucky seed is not a broken price roll)', () => {
    const other = greedy.filter(g => g.id !== 'payday'), fair = (n: Night) => cozy.find(c => c.date === n.date)!.profit;
    expect(other.reduce((s, n) => s + n.profit, 0)).toBeLessThan(other.reduce((s, n) => s + fair(n), 0));
    expect(other.filter(n => n.profit < fair(n)).length / other.length).toBeGreaterThanOrEqual(.8);
  });
  it('the bold menu rarely earns stars on the hard nights, even with hands on the floor', () => {
    const hard = greedy.filter(n => n.id !== 'quiet' && n.id !== 'payday');
    expect(hard.filter(n => n.goal).length / hard.length).toBeLessThanOrEqual(.2);
  });
});

describe('judging week (9 to 16 December)', () => {
  const cozy = nights(cozyBot, JUDGING, 'floor'), bare = nights(bareBot, JUDGING, 'auto');
  it('a judge who builds a little and plays the floor earns 1★ on every day of the window', () => { expect(cozy.filter(n => !n.goal).map(n => n.date)).toEqual([]); });
  it('the first dinner a judge sees (Wed 9 Dec, rain) is playable even with no changes', () => {
    const wed = nights(bareBot, ['2026-12-09'], 'auto')[0]; expect(wed.id).toBe('rain'); expect(wed.profit).toBeGreaterThan(0);
  });
  it('the starter park left alone never loses more than a few dollars on a judging day, and the hands-on one never loses', () => {
    expect(bare.every(n => n.profit > -50)).toBe(true); expect(nights(bareBot, JUDGING, 'floor').every(n => n.profit > 0)).toBe(true);
  });
});

describe('the first week: a new owner who only taps Open', () => {
  // The coach bot changes nothing: the starter restaurant, as it comes. Its first service is lunch; its second and third are dinners.
  const coach: Bot = { name: 'coach', actions: [] }, lunchBot: Bot = { name: 'coach-lunch', actions: [{ tick: 0, kind: 'shift', shift: 'lunch' } as Action] };
  const ran = (bot: Bot, date: string, night: number, shift: 'lunch' | 'dinner') => { const run = runBot(bot, date); if ('error' in run.result) throw new Error(run.result.error); return evaluateStars(run.result.report, run.result.state.headline!, null, night, shift); };
  it('earns 1★ on a lunch on every one of the next 21 dates and the judging week, with no hands at all', () => {
    for (const date of [...NEXT_21, ...JUDGING]) expect(ran(lunchBot, date, 1, 'lunch').stars, date).toBeGreaterThanOrEqual(1);
  });
  it('earns 1★ on nights 2 and 3 (dinners) on every date, so the first week always has a star', () => {
    for (const date of [...NEXT_21, ...JUDGING]) for (const night of [2, 3]) expect(ran(coach, date, night, 'dinner').stars, `${date} night ${night}`).toBeGreaterThanOrEqual(1);
  });
  it('from the fourth night the headline decides, so doing nothing is no longer enough on the hard nights', () => {
    expect(NEXT_21.filter(date => ran(coach, date, 4, 'dinner').goal).length).toBeLessThan(NEXT_21.length / 2);
  });
  it('the welcome goal text names what to do, and is the one shown only on the first three dinners', () => {
    expect(FIRST_NIGHTS).toBe(3); expect(goalText('critic', 1)).toBe('Serve 8 guests'); expect(goalText('critic', 3)).toBe(goalText('rush', 2)); expect(goalText('critic', 4)).toBe('Every star guest leaves happy and at most 3 guests are missed');
    expect(goalText('critic', 9, 'lunch')).toBe(LUNCH_STARS[0]);
  });
});

describe('a lunch', () => {
  const lunch: Bot = { name: 'lunch', actions: [{ tick: 0, kind: 'shift', shift: 'lunch' } as Action] };
  const alone = (date: string) => { const r = runBot(lunch, date).result; if ('error' in r) throw new Error(r.error); return evaluateStars(r.report, r.state.headline!, null, 9, 'lunch', r.state.hustle.best); };
  const hands = (date: string) => { const r = playWithHelper(lunch, date, undefined, floorPolicy).replay; if ('error' in r) throw new Error(r.error); return evaluateStars(r.report, r.state.headline!, null, 9, 'lunch', r.state.hustle.best); };
  it('is a sure star for the team alone and 3★ only for hands that keep a chain going', () => {
    for (const date of NEXT_21) { expect(alone(date).stars, date).toBeGreaterThanOrEqual(1); expect(alone(date).stars, date).toBeLessThan(3); expect(hands(date).stars, date).toBe(3); }
  });
});
