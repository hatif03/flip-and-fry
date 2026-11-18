import { describe, expect, it } from 'vitest';
import { GOALS } from '@/management/engine';
import { createDailyHeadline } from '@/management/daily-headline';
import { runService } from '@/management/replay';
import { guestThought } from '@/management/satisfaction';
import { MAX_REGULARS, REGULAR_NAMES, createRestaurant, restaurantSchema, type RestaurantState } from '@/management/types';

const headline = createDailyHeadline('2026-12-09');
function serve(state: RestaurantState, nights: number): RestaurantState {
  for (let i = 0; i < nights; i++) { const r = runService(state, [], headline); if ('error' in r) throw new Error(r.error); state = r.state; }
  return state;
}
describe('recruiting regulars', () => {
  it('starts with none, and the first asks to come back after the third service', () => {
    expect(createRestaurant().regulars).toEqual([]);
    expect(serve(createRestaurant(), 2).regulars).toHaveLength(0);
    const three = serve(createRestaurant(), 3);
    expect(three.regulars).toHaveLength(1);
    const [r] = three.regulars; expect(REGULAR_NAMES).toContain(r.name); expect(three.menu[r.dish].enabled).toBe(true); expect([r.visits, r.streak]).toEqual([0, 0]);
  });
  it('adds one more every two services, up to four, never repeating a name', () => {
    expect([5, 7, 9].map(n => serve(createRestaurant(), n).regulars.length)).toEqual([2, 3, 4]);
    const many = serve(createRestaurant(), 12).regulars; expect(many).toHaveLength(MAX_REGULARS); expect(new Set(many.map(r => r.name)).size).toBe(MAX_REGULARS);
  });
  it('is the same every time it is replayed', () => {
    expect(serve(createRestaurant(), 5).regulars).toEqual(serve(createRestaurant(), 5).regulars);
  });
});

describe('a regular\'s visit', () => {
  it('happens once a night, and counts as a visit', () => {
    const before = serve(createRestaurant(), 3), after = serve(before, 1);
    expect(after.regulars[0].visits).toBe(1);
  });
  it('builds a streak when they get their usual quickly, and breaks it when the usual is off the menu', () => {
    let state = serve(createRestaurant(), 3); const usual = state.regulars[0].dish;
    state = serve(state, 2); expect(state.regulars[0].streak).toBeGreaterThanOrEqual(1);
    const other = (['salad', 'burger'] as const).find(d => d !== usual)!;
    state.menu[usual].enabled = false; state.menu[other].enabled = true;
    const sulking = serve(state, 1); expect(sulking.regulars[0].streak).toBe(0);
  });
  it('reads from saved state, so a save from before regulars loads with none', () => {
    const old = JSON.parse(JSON.stringify(createRestaurant())); delete old.regulars; expect(restaurantSchema.parse(old).regulars).toEqual([]);
  });
});

describe('the regulars\' table contract', () => {
  const goal = GOALS.find(g => g.id === 'regulars-table')!;
  it('reads the best streak among regulars', () => {
    const s = createRestaurant(); expect(goal.value(s)).toBe(0);
    s.regulars = [{ name: 'Maple', species: 'bear', dish: 'salad', visits: 4, streak: 2 }, { name: 'Pepper', species: 'mouse', dish: 'burger', visits: 5, streak: 3 }];
    expect(goal.value(s)).toBe(3); expect(goal.target).toBe(3);
  });
});

describe('their thought bubbles', () => {
  const base = { stage: 'waiting' as const, waiting: 5, happy: false, dish: 'salad' as const, price: 24, quality: 0, paid: false };
  it('name the regular while they wait, and keep any complaint', () => {
    expect(guestThought({ ...base, regular: 'Maple' }, 50)).toEqual({ text: 'Maple, a regular', tone: 'good' });
    expect(guestThought({ ...base, waiting: 40, regular: 'Maple' }, 50)).toEqual({ text: 'Maple: long wait', tone: 'bad' });
    expect(guestThought({ ...base, stage: 'eating', regular: 'Maple' }, 50)?.text).toBe('Maple: lovely');
  });
  it('leave other guests alone', () => { expect(guestThought({ ...base, regular: null }, 50)).toBeNull(); });
});
