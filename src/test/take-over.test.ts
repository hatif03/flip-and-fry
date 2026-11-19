import { describe, expect, it } from 'vitest';
import { bareBot, cozyBot, datesFrom, helperPolicy, playWithHelper } from '@/management/bots';
import { RestaurantEngine } from '@/management/engine';
import { createDailyHeadline } from '@/management/daily-headline';
import { DISHES, createRestaurant } from '@/management/types';

const DATES = datesFrom('2026-12-09', 8);

/** Opens the starter park with its chef and ticks until a chef has just started a dish. */
function chefStarted() {
  const engine = new RestaurantEngine(undefined, () => 0); engine.autoRoll = false; engine.state = createRestaurant();
  expect(engine.open(createDailyHeadline('2026-12-09'))).toBeNull();
  for (let i = 0; i < 1500; i++) { engine.tick(); const g = engine.state.guests.find(x => x.stage === 'cooking' && !x.owner); if (g && engine.canTakeOver(g)) return { engine, guest: g }; }
  throw new Error('no chef started a dish');
}

describe('taking a dish out of a chef\'s hands', () => {
  it('frees the chef, keeps the ingredients paid once, and starts the dish over in your hands', () => {
    const { engine, guest } = chefStarted(), cash = engine.state.cash, ingredients = engine.state.totals.ingredients;
    expect(engine.claimTicket(guest.id)).toBeNull();
    expect(guest.owner).toBe(true); expect(guest.cook).toBe(0); expect(engine.state.hands.some(h => h.guestId === guest.id)).toBe(true);
    expect(engine.state.staff.filter(w => w.guestId === guest.id)).toHaveLength(0);
    expect(engine.state.cash).toBe(cash); expect(engine.state.totals.ingredients).toBe(ingredients);
  });
  it('refuses once the chef is well into the dish, and refuses a dish that is already yours', () => {
    const { engine, guest } = chefStarted(), chef = engine.state.staff.find(w => w.guestId === guest.id)!;
    chef.task = 'cooking'; chef.timer = 0.2;
    expect(engine.canTakeOver(guest)).toBe(false); expect(engine.claimTicket(guest.id)).toMatch(/almost done/);
    chef.timer = DISHES[guest.dish].seconds; expect(engine.claimTicket(guest.id)).toBeNull(); expect(engine.claimTicket(guest.id)).toMatch(/Finish the dish|already/);
  });
  it('plates at the perfect moment and the dish goes out', () => {
    const { engine, guest } = chefStarted();
    expect(engine.claimTicket(guest.id)).toBeNull();
    while (guest.cook < DISHES[guest.dish].seconds) engine.tick();
    expect(engine.plate(guest.id)).toBeNull(); expect(guest.stage).toBe('ready'); expect(guest.quality).toBe(3);
  });
  it('a night played with a helper that also takes over still replays to the identical state', () => {
    const takeOver = (e: RestaurantEngine): void => { const g = e.state.guests.find(x => e.canTakeOver(x)); if (g && !e.state.hands.length) e.claimTicket(g.id); else helperPolicy(e); };
    for (const date of DATES) for (const bot of [bareBot, cozyBot]) {
      const run = playWithHelper(bot, date, createRestaurant(), takeOver);
      expect('error' in run.replay, `${bot.name} ${date}`).toBe(false);
      if (!('error' in run.replay)) { expect(run.replay.hash, `${bot.name} ${date}`).toBe(run.liveHash); expect(run.replay.rejected).toBe(0); }
    }
  });
});

describe('what the card says about your hands', () => {
  it('counts plates and perfect plates from the engine, and says so when there were none', async () => {
    const { handsLine } = await import('@/management/RedditLayer');
    expect(handsLine(0, 0, 0)).toMatch(/did not cook tonight/); expect(handsLine(1, 1, 0)).toBe('You cooked 1 dish yourself, 1 perfect. Every plate was perfect.');
    expect(handsLine(4, 2, 1)).toBe('You cooked 4 dishes yourself, 2 perfect, 1 taken from a chef. Plate in the green for a perfect one.');
    const { engine, guest } = chefStarted();
    expect(engine.cooked).toEqual({ plated: 0, perfect: 0, tookOver: 0 });
    engine.claimTicket(guest.id); while (guest.cook < DISHES[guest.dish].seconds) engine.tick(); engine.plate(guest.id);
    expect(engine.cooked).toEqual({ plated: 1, perfect: 1, tookOver: 1 });
  });
});
