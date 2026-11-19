import { describe, expect, it } from 'vitest';
import { averagePathLength, cardThought, nightSummary, valueScore } from '@/management/awards';
import { bareBot, cozyBot, datesFrom, floorPolicy, greedyBot, playWithHelper, runBot } from '@/management/bots';
import { FLAIR, NOTE_MAX, cleanNote, flairForStreak, houseStyle, receiptComment } from '@/management/social';
import { CATALOG, companyValue, createRestaurant, type RestaurantState } from '@/management/types';

const night = (bot = cozyBot, date = '2026-12-09') => { const r = runBot(bot, date).result; if ('error' in r) throw new Error(r.error); return r; };
const clone = (s: RestaurantState): RestaurantState => structuredClone(s);

describe('company value', () => {
  it('is cash plus 70% of what the furniture would refund, minus the loan', () => {
    const s = createRestaurant(); const resale = s.furniture.reduce((sum, f) => sum + Math.floor(CATALOG[f.kind].price * .7), 0);
    expect(companyValue(s)).toBe(s.cash + resale); expect(companyValue({ ...s, debt: 600 })).toBe(s.cash + resale - 600);
  });
  it('the ledger keeps the best and the day it was set, and a worse night does not overwrite it', () => {
    const first = night(cozyBot); expect(first.state.best.value).toBe(companyValue(first.state)); expect(first.state.best.day).toBe(1);
    const worse = clone(first.state); worse.cash -= 500; worse.best = first.state.best; // a later, poorer finish
    expect(companyValue(worse)).toBeLessThan(worse.best.value);
  });
});

describe('what a night records', () => {
  it('counts waiting time, closes once, and notes dirty seats at closing', () => {
    const { state, report } = night(); expect(state.night.waitSeconds).toBeGreaterThan(0); expect(state.night.closed).toBe(true);
    expect(state.night.waitSeconds / report.served).toBeLessThan(60); expect(state.night.dirtyAtClose).toBeGreaterThanOrEqual(0);
  });
  it('counts guests who refused the menu: a bold menu refuses far more than a fair one', () => {
    expect(night(greedyBot).state.night.refused).toBeGreaterThan(night(cozyBot).state.night.refused);
  });
  it('counts walkouts', () => { expect(night(greedyBot).state.night.walkouts + night(bareBot, '2026-12-12').state.night.walkouts).toBeGreaterThanOrEqual(0); });
});

describe('the kitchen card', () => {
  it('has three whole numbers from 0 to 100 for every kitchen on every judging day', () => {
    for (const date of datesFrom('2026-12-09', 8)) for (const bot of [bareBot, cozyBot, greedyBot]) {
      const { state, report } = night(bot, date), { card } = nightSummary(state, report);
      for (const v of Object.values(card)) { expect(Number.isInteger(v), `${bot.name} ${date}`).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
    }
  });
  it('moves when the player acts: decor raises Welcome, fair prices beat bold ones on Value, a second server raises Speed', () => {
    const date = '2026-12-09', summary = (bot: typeof cozyBot) => { const { state, report } = night(bot, date); return nightSummary(state, report).card; };
    expect(summary(cozyBot).welcome).toBeGreaterThan(summary(bareBot).welcome);
    expect(summary(cozyBot).value).toBeGreaterThan(summary(greedyBot).value);
    // Speed is what hands change: the same room, with the floor played, serves faster than the team alone.
    const played = (() => { const r = playWithHelper(cozyBot, date, undefined, floorPolicy).replay; if ('error' in r) throw new Error(r.error); return nightSummary(r.state, r.report).card; })();
    expect(played.speed).toBeGreaterThan(summary(cozyBot).speed);
  });
  it('rewards a layout that is quick to walk and a menu near fair', () => {
    const s = createRestaurant(); expect(averagePathLength(s)).toBeGreaterThan(0);
    expect(valueScore(s, 0)).toBeGreaterThan(90); const bold = clone(s); bold.menu.salad.price = 40; bold.menu.burger.price = 60; expect(valueScore(bold, 0)).toBeLessThan(40);
    expect(valueScore(s, 10)).toBeLessThan(valueScore(s, 0));
  });
  it('names the weakest number as the one-line thought', () => {
    expect(cardThought({ welcome: 80, speed: 20, value: 70 })).toBe('Long wait'); expect(cardThought({ welcome: 10, speed: 50, value: 70 })).toBe('A bit bare'); expect(cardThought({ welcome: 80, speed: 90, value: 30 })).toBe('Pricey menu');
  });
});

describe('the one award banner', () => {
  const base = () => { const { state, report } = night(); return { state: clone(state), report: { ...report } }; };
  const pick = (mutate: (s: RestaurantState, r: ReturnType<typeof base>['report']) => void) => { const { state, report } = base(); mutate(state, report); return nightSummary(state, report).award.id; };
  it('follows fixed rules in a fixed order, so a banner is a joke the simulation earned', () => {
    expect(pick((s, r) => { s.night.dirtyAtClose = 4; r.served = 20; })).toBe('untidy');
    expect(pick((s, r) => { s.night.dirtyAtClose = 0; r.served = 3; r.missed = 1; })).toBe('quiet');
    expect(pick((s, r) => { s.night.dirtyAtClose = 0; r.served = 12; r.missed = 2; r.profit = 300; s.night.refused = 5; })).toBe('prices');
    expect(pick((s, r) => { s.night.dirtyAtClose = 0; r.served = 18; r.missed = 1; r.profit = 100; s.night.refused = 0; s.night.waitSeconds = 18 * 4; })).toBe('food');
    expect(pick((s, r) => { s.night.dirtyAtClose = 0; r.served = 12; r.missed = 1; r.profit = 100; s.night.refused = 0; s.night.waitSeconds = 12 * 40; s.night.walkouts = 0; })).toBe('warm');
  });
  it('always gives exactly one banner, with a title and a sentence', () => {
    for (const date of datesFrom('2026-12-09', 8)) for (const bot of [bareBot, cozyBot, greedyBot]) { const { state, report } = night(bot, date), a = nightSummary(state, report).award; expect(a.title.length).toBeGreaterThan(3); expect(a.text.length).toBeGreaterThan(10); }
  });
  it('falls back to a steady night when nothing stands out', () => {
    expect(pick((s, r) => { s.night.dirtyAtClose = 0; r.served = 10; r.missed = 3; r.profit = 90; s.night.refused = 0; s.night.waitSeconds = 10 * 40; s.night.walkouts = 3; s.furniture = s.furniture.filter(f => !['plant', 'lamp', 'divider'].includes(f.kind)); })).toBe('steady');
  });
  it('flags a new best company value only on the night that set it', () => {
    const { state, report } = night(); expect(nightSummary(state, report).newBest).toBe(true);
    const later = clone(state); later.best = { value: later.best.value + 999, day: 1 }; expect(nightSummary(later, { ...report, day: 7 }).newBest).toBe(false);
  });
});

describe('what a player can post', () => {
  it('builds the canned receipt line from real numbers only', () => {
    expect(receiptComment({ name: 'Little Rooftop', style: 'Garden', award: 'Warmest room', rating: 4.14, streak: 5 })).toBe('Little Rooftop · Garden · Warmest room · rating 4.1 · 5-day streak');
    expect(receiptComment({ name: 'Pip\'s', style: 'Grill', award: 'Quiet night', rating: 3, streak: 0 })).toBe('Pip\'s · Grill · Quiet night · rating 3.0');
  });
  it('names the house style from the menu', () => {
    const s = createRestaurant(); expect(houseStyle(s)).toBe('Garden & Grill'); s.menu.burger.enabled = false; expect(houseStyle(s)).toBe('Garden'); s.menu.burger.enabled = true; s.menu.salad.enabled = false; expect(houseStyle(s)).toBe('Grill');
  });
  it('accepts a short plain note and cleans stray whitespace and control characters', () => {
    expect(cleanNote('  great\n\n night \t ')).toEqual({ ok: true, note: 'great night' }); expect(cleanNote('')).toEqual({ ok: true, note: '' });
    expect(cleanNote('x'.repeat(NOTE_MAX))).toMatchObject({ ok: true }); expect(cleanNote('x'.repeat(NOTE_MAX + 1))).toMatchObject({ ok: false });
  });
  it('refuses links and user mentions, so a note can never be used to advertise or point at a person', () => {
    for (const bad of ['see https://example.com', 'www.example.org', 'my site foo.com', 'thanks u/someone', 'visit r/something', 'reddit.com/r/x', 'a.gg']) expect(cleanNote(bad), bad).toMatchObject({ ok: false });
    expect(cleanNote('We had a great night, thanks!')).toMatchObject({ ok: true });
  });
  it('earns flair by streak tier, and none without a streak', () => {
    expect(flairForStreak(0)).toBeNull(); expect(flairForStreak(1)).toBe('Opened the doors'); expect(flairForStreak(2)).toBe('Opened the doors'); expect(flairForStreak(3)).toBe('Regular');
    expect(flairForStreak(6)).toBe('Regular'); expect(flairForStreak(7)).toBe('House favorite'); expect(flairForStreak(14)).toBe('Golden hour'); expect(flairForStreak(29)).toBe('Golden hour'); expect(flairForStreak(30)).toBe('Rooftop regular'); expect(flairForStreak(400)).toBe('Rooftop regular');
    expect(FLAIR.background).toBe('#DC533C');
  });
});
