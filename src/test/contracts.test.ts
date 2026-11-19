import { describe, expect, it } from 'vitest';
import { GOALS, RestaurantEngine } from '@/management/engine';
import { createDailyHeadline } from '@/management/daily-headline';
import { runService } from '@/management/replay';
import { createRestaurant, restaurantSchema, type RestaurantState, type Report } from '@/management/types';

const goal = (id: string) => GOALS.find(g => g.id === id)!;
const report = (over: Partial<Report> = {}): Report => ({ revenue: 100, ingredients: 20, served: 6, missed: 0, tips: 10, headline: null, challenges: [], day: 1, wages: 60, rent: 30, debtPayment: 0, research: 0, profit: 0, rating: 3, ...over });
const headline = createDailyHeadline('2026-12-09');
/** Play `nights` services in a row from a state, the way the server does, and hand back the state after each. */
function play(state: RestaurantState, nights: number): RestaurantState[] {
  const states: RestaurantState[] = [];
  for (let i = 0; i < nights; i++) { const r = runService(state, [], headline); if ('error' in r) throw new Error(r.error); state = r.state; states.push(structuredClone(state)); }
  return states;
}

describe('the contracts', () => {
  it('start after the four first goals and read only saved state', () => {
    expect(GOALS.slice(0, 4).map(g => g.id)).toEqual(['first-service', 'atmosphere', 'more-tables', 'three-days']);
    expect(GOALS.slice(4).map(g => g.id)).toEqual(['pay-the-roof', 'three-good-nights', 'nailed-down', 'honest-prices', 'regulars-table', 'full-room']);
    for (const g of GOALS) { expect(g.value(createRestaurant()), g.id).toBeLessThan(g.target); expect(g.reward, g.id).toBeGreaterThan(0); }
  });
  it('Pay the roof: counts profit banked, or finishes when the recovery loan is cleared', () => {
    const s = createRestaurant(); s.history = [report({ profit: 150 }), report({ profit: -40 }), report({ profit: 200 })];
    expect(goal('pay-the-roof').value(s)).toBe(310);
    s.history = [report({ profit: -500 })]; expect(goal('pay-the-roof').value(s)).toBe(0);
    s.streaks.loanCleared = 1; expect(goal('pay-the-roof').value(s)).toBe(400);
  });
  it('Three good nights: counts services rated 4 or better', () => {
    const s = createRestaurant(); s.history = [report({ rating: 4 }), report({ rating: 3.9 }), report({ rating: 5 })];
    expect(goal('three-good-nights').value(s)).toBe(2);
  });
  it('A full room: needs eight seats before a big night counts', () => {
    const s = createRestaurant(); s.history = [report({ served: 11 })];
    expect(goal('full-room').value(s)).toBe(0); // six seats
    s.furniture.push({ id: 90, kind: 'table', x: 9, z: 4, rotation: 0 }); expect(goal('full-room').value(s)).toBe(11);
  });
  it('is collected through the same claim as the first four, and only once', () => {
    const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; const log: string[] = []; e.onAction = a => log.push(a.kind);
    e.state.history = [report({ rating: 4 }), report({ rating: 4 }), report({ rating: 5 })]; const cash = e.state.cash;
    expect(e.claim('three-good-nights')).toBeNull(); expect(e.state.cash).toBe(cash + goal('three-good-nights').reward);
    expect(e.claim('three-good-nights')).toBeTruthy(); expect(e.claim('honest-prices')).toBeTruthy(); expect(log).toEqual(['claim']);
  });
});

describe('the counters behind them', () => {
  it('Nailed down grows with every service and resets the moment furniture is sold', () => {
    const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false;
    const [one, two] = play(e.state, 2); expect(one.streaks.nailed).toBe(1); expect(two.streaks.nailed).toBe(2);
    e.state = two; const lamp = e.state.furniture.find(f => f.kind === 'lamp')!; expect(e.sell(lamp.id)).toBeNull(); expect(e.state.streaks.nailed).toBe(0);
  });
  it('Honest prices grows only at fair prices with a profit, and a greedy menu breaks it', () => {
    const fair = play(createRestaurant(), 2); expect(fair.map(s => s.streaks.honest)).toEqual([1, 2]);
    const greedy = createRestaurant(); greedy.menu.burger.price = 60;
    expect(play(greedy, 1)[0].streaks.honest).toBe(0);
  });
  it('the loan counts as cleared when the last payment goes through', () => {
    const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state.cash = 100; expect(e.loan()).toBeNull(); e.state.debt = 20;
    expect(play(e.state, 1)[0].streaks.loanCleared).toBe(1);
  });
  it('are filled in for saves that never had them', () => {
    const old = JSON.parse(JSON.stringify(createRestaurant())); delete old.streaks;
    expect(restaurantSchema.parse(old).streaks).toEqual({ nailed: 0, honest: 0, loanCleared: 0, losses: 0 });
  });
});
