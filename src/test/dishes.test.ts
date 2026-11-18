import { describe, expect, it } from 'vitest';
import type { Action } from '@/management/actions';
import { advanceDailyChallenges, challengeObjective, challengeTitles } from '@/management/daily-challenges';
import { createDailyHeadline } from '@/management/daily-headline';
import { applyPlanning, openError, runService } from '@/management/replay';
import { houseStyle } from '@/management/social';
import { CATALOG, DISHES, DISH_IDS, PRICE_MAX, PRICE_MIN, createRestaurant, restaurantSchema, type Dish } from '@/management/types';

const date = '2026-12-09', headline = createDailyHeadline(date);
/** A kitchen that has already studied the stock pot, so the pot can be bought. */
const studied = () => { const s = createRestaurant(); s.research.points = 100; return s; };
const noodleNight: Action[] = [
  { tick: 0, kind: 'place', item: { id: -1, kind: 'pot', x: 5, z: 1, rotation: 0 } },
  { tick: 0, kind: 'dish', dish: 'ramen', enabled: true, price: 36 }, { tick: 0, kind: 'dish', dish: 'salad', enabled: false, price: 24 }, { tick: 0, kind: 'dish', dish: 'burger', enabled: false, price: 38 },
];

describe('the dish table', () => {
  it('lists every dish once, with a margin, a real station and a price the menu accepts', () => {
    expect(DISH_IDS).toHaveLength(12); expect(Object.keys(DISHES).sort()).toEqual([...DISH_IDS].sort());
    for (const id of DISH_IDS) {
      const d = DISHES[id];
      expect(CATALOG[d.station].category, id).toBe('Kitchen');
      expect(d.fair, id).toBeGreaterThanOrEqual(d.cost * 2); expect(d.fair, id).toBeGreaterThanOrEqual(PRICE_MIN); expect(d.fair * 1.5, id).toBeLessThanOrEqual(PRICE_MAX + 4);
      expect(d.seconds, id).toBeGreaterThan(3); expect(d.name.length, id).toBeGreaterThan(3);
    }
  });
  it('gives each style four dishes', () => { for (const style of ['garden', 'grill', 'noodle'] as const) expect(DISH_IDS.filter(d => DISHES[d].style === style), style).toHaveLength(4); });
  it('keeps every appliance useful: each has at least one dish', () => { for (const kind of ['prep', 'grill', 'pot', 'wok', 'oven'] as const) expect(DISH_IDS.some(d => DISHES[d].station === kind), kind).toBe(true); });
});

describe('saves from before the larger menu', () => {
  it('still load: a menu with only the first two dishes gets the rest switched off at their fair price', () => {
    const old = JSON.parse(JSON.stringify(createRestaurant())); old.menu = { salad: { enabled: true, price: 26 }, burger: { enabled: true, price: 40 } };
    const parsed = restaurantSchema.parse(old);
    expect(parsed.menu.salad).toEqual({ enabled: true, price: 26 });
    for (const id of DISH_IDS.filter(d => d !== 'salad' && d !== 'burger')) expect(parsed.menu[id], id).toEqual({ enabled: false, price: DISHES[id].fair });
  });
  it('starts a new restaurant with the same two dishes on', () => { const on = DISH_IDS.filter(d => createRestaurant().menu[d].enabled); expect(on).toEqual(['salad', 'burger']); });
});

describe('cooking the new dishes', () => {
  it('will not open the doors for a dish whose appliance is not on the floor, and names it', () => {
    const state = createRestaurant(); state.menu.ramen.enabled = true;
    expect(openError(state)).toBe('Add a stock pot for sunset ramen, or remove it from the menu.');
  });
  it('serves a noodle menu from a stock pot, and replays to the same receipt every time', () => {
    const a = runService(studied(), noodleNight, headline), b = runService(studied(), noodleNight, headline);
    if (!a.ok || !b.ok) throw new Error('service failed');
    expect(a.report.served).toBeGreaterThan(5); expect(a.hash).toBe(b.hash); expect(a.report.revenue).toBeGreaterThan(0);
    for (const guest of a.state.guests) expect(guest.dish).toBe('ramen');
  });
  it('charges the right ingredients for the dish, not the first dish', () => {
    const r = runService(studied(), noodleNight, headline); if ('error' in r) throw new Error(r.error);
    expect(r.report.ingredients).toBeGreaterThanOrEqual(r.report.served * DISHES.ramen.cost);
  });
  it('refuses a price above the new cap', () => { const r = applyPlanning(createRestaurant(), [{ tick: 0, kind: 'dish', dish: 'steak', enabled: true, price: PRICE_MAX + 2 }]); expect('error' in r).toBe(true); });
  it('keeps the old menu\'s receipt untouched by the new dishes (the calibration still holds)', () => {
    const r = runService(createRestaurant(), [], headline); if ('error' in r) throw new Error(r.error);
    const dishes = new Set(r.state.guests.map(g => g.dish)); for (const d of dishes) expect(['salad', 'burger']).toContain(d);
  });
});

describe('challenges for the larger menu', () => {
  const guest = (dish: Dish) => ({ dish, special: false, waiting: 5, price: 30 });
  it('count sales of the dish they name', () => {
    const c = { day: 1, kind: 'ramen' as const, target: 2, progress: 0, reward: 50, rewarded: false };
    advanceDailyChallenges([c], guest('salad'), 0); expect(c.progress).toBe(0);
    advanceDailyChallenges([c], guest('ramen'), 0); advanceDailyChallenges([c], guest('ramen'), 0); expect(c.rewarded).toBe(true);
  });
  it('read in plain words for every dish', () => {
    for (const id of DISH_IDS) { const c = { day: 1, kind: id, target: 4, progress: 0, reward: 50, rewarded: false }; expect(challengeObjective(c), id).toMatch(/^Sell 4 /); expect(challengeTitles[id], id).toBe(DISHES[id].favorite); }
    expect(challengeObjective({ day: 1, kind: 'salad', target: 5, progress: 0, reward: 50, rewarded: false })).toBe('Sell 5 garden salads');
    expect(challengeObjective({ day: 1, kind: 'burger', target: 5, progress: 0, reward: 50, rewarded: false })).toBe('Sell 5 sunset burgers');
  });
});

describe('the house style on a comment', () => {
  it('names each style on the menu once, in order', () => {
    const state = createRestaurant(); expect(houseStyle(state)).toBe('Garden & Grill');
    state.menu.ramen.enabled = true; expect(houseStyle(state)).toBe('Garden, Grill & Noodle');
    state.menu.salad.enabled = false; state.menu.burger.enabled = false; expect(houseStyle(state)).toBe('Noodle');
  });
});
