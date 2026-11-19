import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { createDailyHeadline } from '@/management/daily-headline';
import { MAX_SERVICE_ACTIONS, runService, stateHash, type Action } from '@/management/replay';
import { DISHES, createRestaurant, idealPrep, plateQuality, prepQuality, restaurantSchema, type RestaurantState } from '@/management/types';

const headline = createDailyHeadline('2026-12-09');
/** A kitchen with no chef, so every ticket is the owner's. */
const noChef = (): RestaurantState => { const s = createRestaurant(); s.staff = s.staff.map(m => ({ ...m, role: 'server' as const })); s.cash = 5000; return s; };
function live() {
  const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state = noChef(); const log: Action[] = []; e.onAction = a => log.push(a);
  expect(e.open(headline)).toBeNull(); for (let i = 0; i < 2000 && !e.state.guests.some(g => g.stage === 'waiting'); i++) e.tick();
  return { e, log, ticket: () => e.state.guests.find(g => g.stage === 'waiting')! };
}
const run = (e: RestaurantEngine, seconds: number) => { for (let i = 0; i < Math.round(seconds * 10); i++) e.tick(); };

describe('the numbers', () => {
  it('judges a hold against the ideal: within a fifth is clean, within half is decent, otherwise rough', () => {
    const ideal = idealPrep('salad'); expect(ideal).toBeCloseTo(2.4, 5);
    expect([prepQuality(ideal, 'salad'), prepQuality(ideal * 1.19, 'salad'), prepQuality(ideal * .81, 'salad')]).toEqual([3, 3, 3]);
    expect([prepQuality(ideal * 1.4, 'salad'), prepQuality(ideal * .6, 'salad')]).toEqual([2, 2]); expect([prepQuality(ideal * 2, 'salad'), prepQuality(.1, 'salad')]).toEqual([1, 1]);
    expect(idealPrep('burger')).toBeCloseTo(DISHES.burger.seconds * .4, 5); expect(idealPrep('bruschetta')).toBe(2); // never under two seconds
  });
  it('combines prep and cooking: no prep changes nothing, a clean prep forgives a late plate, a rough one costs perfection', () => {
    for (const c of [0, 1, 2, 3] as const) expect(plateQuality(c, 0)).toBe(c);
    expect(plateQuality(2, 3)).toBe(3); expect(plateQuality(3, 1)).toBe(2); expect(plateQuality(3, 3)).toBe(3); expect(plateQuality(3, 2)).toBe(3); expect(plateQuality(1, 3)).toBe(1); expect(plateQuality(0, 3)).toBe(0); expect(plateQuality(2, 1)).toBe(2);
  });
});

describe('prepping by hand', () => {
  it('counts only while the button is held, and a clean hold followed by a good plate is a perfect dish', () => {
    const { e, ticket } = live(), g = ticket(); expect(e.claimTicket(g.id)).toBeNull(); const dish = DISHES[g.dish], ideal = idealPrep(g.dish);
    expect(e.holdPrep(g.id)).toBeNull(); run(e, ideal); expect(e.releasePrep(g.id)).toBeNull(); expect(e.state.hands[0]).toMatchObject({ guestId: g.id, holding: false, quality: 3 });
    const prep = e.state.hands[0].prep; run(e, 1); expect(e.state.hands[0].prep).toBe(prep); // time passing without a hold adds nothing
    run(e, dish.seconds - ideal - 1 + .1); expect(e.plate(g.id)).toBeNull(); expect(e.state.guests.find(x => x.id === g.id)!.quality).toBe(3); expect(e.state.hands).toEqual([]);
  });
  it('a messy prep costs the perfect plate, and a clean one saves a slightly late plate', () => {
    const a = live(), ga = a.ticket(); a.e.claimTicket(ga.id); a.e.holdPrep(ga.id); run(a.e, 0.5); a.e.releasePrep(ga.id); run(a.e, DISHES[ga.dish].seconds - .5 + .1);
    expect(a.e.plate(ga.id)).toBeNull(); expect(a.e.state.guests.find(x => x.id === ga.id)!.quality).toBe(2);
    const b = live(), gb = b.ticket(); b.e.claimTicket(gb.id); b.e.holdPrep(gb.id); run(b.e, idealPrep(gb.dish)); b.e.releasePrep(gb.id); run(b.e, DISHES[gb.dish].seconds * 1.4 - idealPrep(gb.dish));
    expect(b.e.plate(gb.id)).toBeNull(); expect(b.e.state.guests.find(x => x.id === gb.id)!.quality).toBe(3);
  });
  it('plating lets go of a button still held, and counts it', () => {
    const { e, ticket } = live(), g = ticket(); e.claimTicket(g.id); e.holdPrep(g.id); run(e, DISHES[g.dish].seconds + .1); expect(e.plate(g.id)).toBeNull();
    expect(e.state.guests.find(x => x.id === g.id)!.quality).toBeGreaterThan(0); expect(e.state.hands).toEqual([]);
  });
  it('refuses prep with nothing in your hands, a second hold, a release without a hold, and another dish', () => {
    const { e, ticket } = live(), g = ticket(); expect(e.holdPrep(g.id)).toBe('There is nothing in your hands to prepare.'); expect(e.releasePrep(g.id)).toBe('You are not preparing anything.');
    e.claimTicket(g.id); expect(e.releasePrep(g.id)).toBe('You are not preparing anything.'); e.holdPrep(g.id); expect(e.holdPrep(g.id)).toBe('You are already preparing it.'); expect(e.holdPrep(g.id + 99)).toBe('There is nothing in your hands to prepare.');
  });
  it('clears the hands when a dish is put down or burns, and when the next night opens', () => {
    const { e, ticket } = live(), g = ticket(); e.claimTicket(g.id); e.holdPrep(g.id); e.abandonCook(g.id); expect(e.state.hands).toEqual([]);
    e.claimTicket(g.id); e.holdPrep(g.id); run(e, DISHES[g.dish].seconds * 2.2); expect(e.state.hands).toEqual([]);
  });
  it('stays valid in a save, and a save from before prep loads with empty hands', () => {
    const { e, ticket } = live(), g = ticket(); e.claimTicket(g.id); e.holdPrep(g.id); run(e, 1); expect(restaurantSchema.safeParse(JSON.parse(JSON.stringify(e.state))).success).toBe(true);
    const old = JSON.parse(JSON.stringify(createRestaurant())); delete old.hands; expect(restaurantSchema.parse(old).hands).toEqual([]);
  });
});

describe('the server replays it', () => {
  it('lands on the same night as the live engine, with the same stars, because only the ticks are sent', () => {
    const { e, log, ticket } = live(), g = ticket(); e.claimTicket(g.id); e.holdPrep(g.id); run(e, idealPrep(g.dish)); e.releasePrep(g.id); run(e, DISHES[g.dish].seconds - idealPrep(g.dish)); e.plate(g.id);
    while (e.state.phase === 'service') e.tick();
    const replay = runService(noChef(), log, headline); if ('error' in replay) throw new Error(replay.error);
    expect(replay.rejected).toBe(0); expect(replay.hash).toBe(stateHash(e.state)); expect(log.map(a => a.kind)).toEqual(['claimTicket', 'hold', 'release', 'cook']);
  });
  it('quietly ignores a forged hold or release, which changes nothing about the night', () => {
    const clean = runService(noChef(), [], headline), forged = runService(noChef(), [{ tick: 20, kind: 'hold', guestId: 1 }, { tick: 40, kind: 'release', guestId: 1 }, { tick: 60, kind: 'release', guestId: 7 }], headline);
    if ('error' in clean || 'error' in forged) throw new Error('failed'); expect(forged.rejected).toBe(3); expect(forged.hash).toBe(clean.hash);
  });
  it('has room for a busy night of prepping: two extra actions a dish', () => { expect(MAX_SERVICE_ACTIONS).toBeGreaterThanOrEqual(120); });
});
