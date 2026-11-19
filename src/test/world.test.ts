import { beforeEach, describe, expect, it } from 'vitest';
import { CROPS, DISH_INGREDIENTS, LEVEL_XP, WATER_CUT, WILT_AFTER, levelFor, ordersFor, plotsFor, serviceXp, wiltedYield } from '@/management/crops';
import { RestaurantEngine } from '@/management/engine';
import { createDailyHeadline } from '@/management/daily-headline';
import { createRestaurant } from '@/management/types';
import { getToday, loadPark, openService, type Deps, type Player } from '@/server/core/game';
import { awardXp, claimParty, collectCraft, startCraft, deliver, getWorld, harvest, leaveInFridge, plant, rush, takeFromFridge, upgrade, water } from '@/server/core/world';
import { PARTY_TIERS, addPartyStars, weekOf } from '@/server/core/block';
import { lockService } from '@/server/core/game';
import { worldKey, loadWorld, fastForward } from '@/server/core/worldstore';
import { saveLayout, useLayout } from '@/server/core/world';
import { savePark } from '@/server/core/game';
import { RECIPES, PREPPED_SPEED, goodFor, UPGRADE_STEPS, buildersFor, rushCost, STATION_SPEED, STATION_TIP } from '@/management/crops';
import { CATALOG, stationLevel } from '@/management/types';
import { FakeStore } from './fake-store';

const alice: Player = { id: 't2_alice', name: 'alice' };
let store: FakeStore, deps: Deps;
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 9); deps = { store, now: () => store.now }; });
const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };
const rev = async (): Promise<number> => { const p = await loadPark(deps, alice); if ('status' in p) throw new Error(p.error); return p.rev; };
const advance = (seconds: number): void => { store.now += seconds * 1000; };

describe('the numbers', () => {
  it('levels climb with experience, plots with levels, and every dish names ingredients that exist', () => {
    expect([0, 29, 30, 80, 1500].map(levelFor)).toEqual([1, 1, 2, 3, 10]); expect([1, 3, 5].map(plotsFor)).toEqual([2, 3, 4]); expect(LEVEL_XP[0]).toBe(0);
    for (const ingredients of Object.values(DISH_INGREDIENTS)) for (const crop of ingredients) expect(CROPS[crop]).toBeDefined();
  });
  it('the order board is the same for the same date and level, and only asks for crops that are unlocked', () => {
    expect(ordersFor('2026-12-09', 1)).toEqual(ordersFor('2026-12-09', 1)); expect(ordersFor('2026-12-09', 1)).not.toEqual(ordersFor('2026-12-10', 1));
    for (const o of ordersFor('2026-12-09', 1)) for (const w of o.wants) expect(CROPS[w.crop].level).toBe(1);
    expect(ordersFor('2026-12-09', 1)).toHaveLength(3);
  });
  it('a service is worth experience for stars, guests and a chain', () => { expect(serviceXp(3, 20, 30)).toBe(45 + 10 + 10); expect(serviceXp(0, 0, 0)).toBe(0); });
});

describe('the garden runs on the server clock', () => {
  it('starts with two empty plots and nothing in the pantry', async () => {
    const w = good(await getWorld(deps, alice)); expect(w.slots).toBe(2); expect(w.plots.map(p => p.crop)).toEqual([null, null]); expect(w.level).toBe(1); expect(w.pantry).toEqual({});
  });
  it('plants for the price of the seed, and refuses a taken plot, a locked crop, a plot you do not have and too little cash', async () => {
    const cash = good(await getWorld(deps, alice)).cash, w = good(await plant(deps, alice, await rev(), 0, 'tomato'));
    expect(w.cash).toBe(cash - CROPS.tomato.seed); expect(w.plots[0].crop).toBe('tomato');
    expect(await plant(deps, alice, w.rev, 0, 'basil')).toMatchObject({ ok: false, error: expect.stringMatching(/already growing/) });
    expect(await plant(deps, alice, w.rev, 1, 'mushroom')).toMatchObject({ ok: false, error: expect.stringMatching(/unlock at level 5/) });
    expect(await plant(deps, alice, w.rev, 2, 'tomato')).toMatchObject({ ok: false, error: expect.stringMatching(/not yours yet/) });
  });
  it('is not ready early, is ready on time, and gives the yield and experience', async () => {
    let w = good(await plant(deps, alice, await rev(), 0, 'tomato'));
    expect(await harvest(deps, alice, w.rev, 0)).toMatchObject({ ok: false, error: 'Not ready yet.' });
    advance(CROPS.tomato.seconds - 1); expect(await harvest(deps, alice, w.rev, 0)).toMatchObject({ ok: false });
    advance(2); w = good(await harvest(deps, alice, w.rev, 0));
    expect(w.pantry).toEqual({ tomato: CROPS.tomato.yield }); expect(w.xp).toBe(CROPS.tomato.xp); expect(w.plots[0].crop).toBeNull(); expect(w.park.pantry.tomato).toBe(CROPS.tomato.yield);
  });
  it('watering once takes a quarter off what is left, and only once', async () => {
    let w = good(await plant(deps, alice, await rev(), 0, 'basil')); advance(600);
    const before = (w.plots[0] as { readyAt: number }).readyAt - store.now; w = good(await water(deps, alice, w.rev, 0));
    const after = (w.plots[0] as { readyAt: number }).readyAt - store.now; expect(after).toBe(before - Math.floor(before * WATER_CUT)); expect((w.plots[0] as { watered: boolean }).watered).toBe(true);
    expect(await water(deps, alice, w.rev, 0)).toMatchObject({ ok: false, error: 'Already watered.' });
  });
  it('a crop picked hours after it is ready still gives the full yield', async () => {
    const w = good(await plant(deps, alice, await rev(), 0, 'tomato')); advance(CROPS.tomato.seconds + 6 * 3600);
    expect(good(await getWorld(deps, alice)).plots[0]).toMatchObject({ ready: true, wilted: false, yield: CROPS.tomato.yield });
    expect(good(await harvest(deps, alice, w.rev, 0)).pantry.tomato).toBe(CROPS.tomato.yield);
  });
  it('a crop left a day after it is ready gives half, and the plot is never lost', async () => {
    let w = good(await plant(deps, alice, await rev(), 0, 'tomato')); advance(CROPS.tomato.seconds + WILT_AFTER + 5);
    expect(good(await getWorld(deps, alice)).plots[0]).toMatchObject({ ready: true, wilted: true, yield: wiltedYield('tomato') });
    w = good(await harvest(deps, alice, w.rev, 0)); expect(w.pantry.tomato).toBe(wiltedYield('tomato'));
    w = good(await plant(deps, alice, w.rev, 0, 'tomato')); expect(w.plots[0].crop).toBe('tomato');
  });
  it('changing the phone\'s clock changes nothing: only the store\'s clock counts', async () => {
    const real = Date.now; Date.now = () => real() + 10 * 86400000; try { const w = good(await plant(deps, alice, await rev(), 0, 'tomato')); expect(await harvest(deps, alice, w.rev, 0)).toMatchObject({ ok: false, error: 'Not ready yet.' }); } finally { Date.now = real; }
  });
  it('refuses a stale revision, and refuses while a service is open', async () => {
    const r = await rev(); good(await plant(deps, alice, r, 0, 'tomato'));
    expect(await plant(deps, alice, r, 1, 'tomato')).toMatchObject({ ok: false, status: 409 });
    const t = good(await getToday(deps, alice)); good(await openService(deps, alice, t.rev, []));
    expect(await plant(deps, alice, t.rev + 1, 1, 'tomato')).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/Finish tonight/) });
  });
});

describe('the order board', () => {
  it('pays cash and experience for produce from the pantry, once per order per day', async () => {
    const order = ordersFor('2026-12-09', 1)[0];
    // Stock the pantry through the real harvest route so the numbers are the garden's own.
    let w = good(await getWorld(deps, alice)); const park = good({ ok: true as const, value: await loadPark(deps, alice) as { rev: number } });
    void park;
    const stock = async (crop: 'tomato' | 'basil', rounds: number): Promise<void> => { for (let i = 0; i < rounds; i++) { const r = good(await plant(deps, alice, await rev(), 0, crop)); advance(CROPS[crop].seconds + 1); w = good(await harvest(deps, alice, r.rev, 0)); } };
    await stock('tomato', 2); await stock('basil', 2);
    expect(w.pantry.tomato).toBeGreaterThanOrEqual(5);
    const filled = w.orders.find(o => o.canFill && !o.done); if (!filled) throw new Error('no order could be filled'); const cash = w.cash, xp = w.xp;
    const after = good(await deliver(deps, alice, await rev(), filled.index));
    expect(after.cash).toBe(cash + filled.reward); expect(after.xp).toBe(xp + filled.xp); expect(after.orders[filled.index].done).toBe(true);
    expect(await deliver(deps, alice, after.rev, filled.index)).toMatchObject({ ok: false, error: 'You already filled that one.' });
    void order;
  });
  it('refuses an order the pantry cannot cover', async () => {
    expect(await deliver(deps, alice, await rev(), 0)).toMatchObject({ ok: false, error: 'Not enough in the pantry yet.' });
  });
});

describe('experience from a service', () => {
  it('is added to the world and reports a level up', async () => {
    const first = await awardXp(deps, alice.id, 10); expect(first).toMatchObject({ gained: 10, level: 1, leveledUp: false });
    const second = await awardXp(deps, alice.id, 25); expect(second).toMatchObject({ level: 2, leveledUp: true }); expect(await store.get(worldKey(alice.id))).toContain('"xp":35');
  });
});

describe('the pantry in a night', () => {
  const night = (pantry: Record<string, number>): RestaurantEngine => { const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state = createRestaurant(); e.state.pantry = pantry; e.state.menu.burger.enabled = false; expect(e.open(createDailyHeadline('2026-12-09'))).toBeNull(); return e; };
  it('a salad that finds lettuce and tomato in stock costs nothing for ingredients, spends them and tips more', () => {
    const e = night({ lettuce: 2, tomato: 2 }); for (let i = 0; i < 1200 && !e.state.guests.some(g => g.grown); i++) e.tick();
    const g = e.state.guests.find(x => x.grown)!; expect(g).toBeDefined(); expect(e.state.pantry.lettuce ?? 0).toBeLessThan(2); expect(e.state.totals.ingredients).toBe(0);
  });
  it('an empty pantry changes nothing: ingredients are paid in cash as ever', () => {
    const e = night({}); for (let i = 0; i < 1200 && !e.state.guests.some(g => g.stage === 'cooking'); i++) e.tick();
    expect(e.state.totals.ingredients).toBeGreaterThan(0); expect(e.state.guests.some(g => g.grown)).toBe(false);
  });
});

describe('the builder', () => {
  const grill = 2, prep = 1; // the starter's own pieces
  it('is one builder at the start, a second at level 4; stations carry a level and the price of the next one', async () => {
    const w = good(await getWorld(deps, alice)); expect(w.builders.count).toBe(1); expect(buildersFor(4)).toBe(2);
    const g = w.stations.find(x => x.id === grill)!; expect(g).toMatchObject({ level: 1, kind: 'grill' }); expect(g.next).toMatchObject({ toLevel: 2, cost: Math.floor(CATALOG.grill.price * UPGRADE_STEPS[2].price), levelNeeded: 2 });
  });
  it('needs the restaurant level, takes the cost now and real time to finish, and one builder does one job at a time', async () => {
    expect(await upgrade(deps, alice, await rev(), grill)).toMatchObject({ ok: false, error: expect.stringMatching(/needs level 2/) });
    await awardXp(deps, alice.id, 40);
    const cash = good(await getWorld(deps, alice)).cash, w = good(await upgrade(deps, alice, await rev(), grill));
    expect(w.cash).toBe(cash - Math.floor(CATALOG.grill.price * UPGRADE_STEPS[2].price)); expect(w.builders.jobs).toHaveLength(1);
    expect(await upgrade(deps, alice, w.rev, prep)).toMatchObject({ ok: false, error: expect.stringMatching(/builder is busy/) });
    expect(await upgrade(deps, alice, w.rev, grill)).toMatchObject({ ok: false });
  });
  it('finishes on the server clock: the piece gains its level in the saved restaurant, without a new revision', async () => {
    await awardXp(deps, alice.id, 40); const w = good(await upgrade(deps, alice, await rev(), grill)), before = await rev();
    advance(UPGRADE_STEPS[2].seconds - 5); expect(stationLevel((await loadPark(deps, alice) as unknown as { state: { levels: Record<string, number> } }).state, grill)).toBe(1);
    advance(10); const after = good(await getWorld(deps, alice));
    expect(after.stations.find(x => x.id === grill)!.level).toBe(2); expect(after.builders.jobs).toEqual([]); expect(await rev()).toBe(before); void w;
    expect((await loadWorld(store, alice.id)).jobs).toEqual([]);
  });
  it('overtime finishes a job at once for two dollars a minute, once a day', async () => {
    await awardXp(deps, alice.id, 40); good(await upgrade(deps, alice, await rev(), grill)); const cash = good(await getWorld(deps, alice)).cash;
    const done = good(await rush(deps, alice, await rev(), grill)); expect(done.cash).toBe(cash - rushCost(UPGRADE_STEPS[2].seconds * 1000)); expect(done.stations.find(x => x.id === grill)!.level).toBe(2);
    expect(await rush(deps, alice, done.rev, grill)).toMatchObject({ ok: false, error: expect.stringMatching(/no job|already paid/) });
  });
  it('a job that finishes while a service is open waits, so the close cannot overwrite it', async () => {
    await awardXp(deps, alice.id, 40); good(await upgrade(deps, alice, await rev(), grill));
    const t = good(await getToday(deps, alice)); good(await openService(deps, alice, t.rev, []));
    advance(UPGRADE_STEPS[2].seconds + 60); good(await getToday(deps, alice)); // settling is refused while the doors are open
    expect((await loadWorld(store, alice.id)).jobs).toHaveLength(1);
  });
});

describe('what a station level does in a night', () => {
  const run = (levels: Record<string, number>) => {
    const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state = createRestaurant(); e.state.levels = levels; e.state.menu.burger.enabled = false;
    expect(e.open(createDailyHeadline('2026-12-09'))).toBeNull(); return e;
  };
  it('a level 3 prep counter makes the team faster and tips more; level 1 is unchanged', () => {
    const slow = run({}), fast = run({ '1': 3 });
    for (const e of [slow, fast]) for (let i = 0; i < 1500; i++) e.tick();
    expect(fast.state.totals.served).toBeGreaterThanOrEqual(slow.state.totals.served); expect(fast.state.totals.tips).toBeGreaterThan(slow.state.totals.tips);
    expect(STATION_SPEED).toBeGreaterThan(0); expect(STATION_TIP).toBeGreaterThan(0);
  });
});

describe('the block', () => {
  const bob: Player = { id: 't2_bob', name: 'bob' };
  const stock = async (user: Player, crop: 'tomato'): Promise<void> => {
    const loaded = await loadPark(deps, user) as unknown as { rev: number }, r = good(await plant(deps, user, loaded.rev, 0, crop)); advance(CROPS[crop].seconds + 1); good(await harvest(deps, user, r.rev, 0));
  };
  const pkRev = async (user: Player): Promise<number> => ((await loadPark(deps, user)) as unknown as { rev: number }).rev;
  it('the week starts on Monday', () => { expect(weekOf('2026-12-09')).toBe('2026-12-07'); expect(weekOf('2026-12-07')).toBe('2026-12-07'); expect(weekOf('2026-12-13')).toBe('2026-12-07'); expect(weekOf('2026-12-14')).toBe('2026-12-14'); });
  it('counts the stars of verified results, once each, and never goes down', async () => {
    const t = good(await getToday(deps, alice)); good(await openService(deps, alice, t.rev, [])); const locked = good(await lockService(deps, alice, t.date, []));
    expect(good(await getWorld(deps, alice)).block.party.stars).toBe(locked.stars.stars); expect(good(await getWorld(deps, alice)).block.party.mine).toBe(locked.stars.stars);
    await addPartyStars(store, '2026-12-09', alice.id, -5); await addPartyStars(store, '2026-12-09', alice.id, 0); expect(good(await getWorld(deps, alice)).block.party.stars).toBe(locked.stars.stars);
  });
  it('a gift is paid once, only when the block reached the tier, and only to someone who earned a star', async () => {
    expect(await claimParty(deps, alice, await pkRev(alice), 0)).toMatchObject({ ok: false, error: expect.stringMatching(/not reached/) });
    await addPartyStars(store, '2026-12-09', bob.id, PARTY_TIERS[0].at);
    expect(await claimParty(deps, alice, await pkRev(alice), 0)).toMatchObject({ ok: false, error: expect.stringMatching(/Earn a star/) });
    const cash = good(await getWorld(deps, bob)).cash, w = good(await claimParty(deps, bob, await pkRev(bob), 0));
    expect(w.cash).toBe(cash + PARTY_TIERS[0].reward); expect(w.block.party.tiers[0].claimed).toBe(true);
    expect(await claimParty(deps, bob, w.rev, 0)).toMatchObject({ ok: false, error: expect.stringMatching(/already collected/) });
  });
  it('the fridge: leave one a day, take one a day, never below zero, and a refused change puts things back', async () => {
    await stock(alice, 'tomato'); await stock(bob, 'tomato');
    expect(await takeFromFridge(deps, bob, await pkRev(bob), 'tomato')).toMatchObject({ ok: false, error: expect.stringMatching(/none of that/) });
    const left = good(await leaveInFridge(deps, alice, await pkRev(alice), 'tomato')); expect(left.block.fridge.items.tomato).toBe(1); expect(left.pantry.tomato).toBe(CROPS.tomato.yield - 1); expect(left.block.fridge.left).toBe(true);
    expect(await leaveInFridge(deps, alice, left.rev, 'tomato')).toMatchObject({ ok: false, error: expect.stringMatching(/already left/) });
    const took = good(await takeFromFridge(deps, bob, await pkRev(bob), 'tomato')); expect(took.pantry.tomato).toBe(CROPS.tomato.yield + 1); expect(took.block.fridge.items.tomato).toBeUndefined();
    expect(await takeFromFridge(deps, bob, took.rev, 'tomato')).toMatchObject({ ok: false, error: expect.stringMatching(/already took/) });
    // a stale revision refuses the whole change and the fridge is not left a crop short
    advance(86400); const mine = await pkRev(alice); expect(await leaveInFridge(deps, alice, mine - 1, 'tomato')).toMatchObject({ ok: false, status: 409 });
    expect(good(await getWorld(deps, alice)).block.fridge.left).toBe(false); expect((good(await getWorld(deps, alice)).block.fridge.items.tomato ?? 0)).toBe(0);
  });
});

describe('the workshop', () => {
  const stockUp = async (n: number): Promise<void> => { for (let i = 0; i < n; i++) { const r = good(await plant(deps, alice, await rev(), 0, 'tomato')); advance(CROPS.tomato.seconds + 1); good(await harvest(deps, alice, r.rev, 0)); const b = good(await plant(deps, alice, await rev(), 0, 'basil')); advance(CROPS.basil.seconds + 1); good(await harvest(deps, alice, b.rev, 0)); } };
  it('opens at a level, needs the produce, takes it now and gives the goods on real time, once', async () => {
    await stockUp(1); expect(await startCraft(deps, alice, await rev(), 'stock')).toMatchObject({ ok: false, error: expect.stringMatching(/opens at level 2/) });
    await awardXp(deps, alice.id, 40);
    const before = good(await getWorld(deps, alice)), w = good(await startCraft(deps, alice, await rev(), 'stock'));
    expect(w.pantry.tomato).toBe((before.pantry.tomato ?? 0) - 2); expect(w.pantry.basil).toBe((before.pantry.basil ?? 0) - 1); expect(w.workshop.find(x => x.good === 'stock')!.readyAt).not.toBeNull();
    expect(await startCraft(deps, alice, w.rev, 'stock')).toMatchObject({ ok: false, error: expect.stringMatching(/already cooking/) });
    expect(await collectCraft(deps, alice, w.rev, 'stock')).toMatchObject({ ok: false, error: 'Not ready yet.' });
    advance(RECIPES.stock.seconds + 1); const done = good(await collectCraft(deps, alice, w.rev, 'stock'));
    expect((done.pantry as Record<string, number>).stock).toBe(RECIPES.stock.yield); expect(done.xp).toBeGreaterThan(w.xp); expect(done.workshop.find(x => x.good === 'stock')!.readyAt).toBeNull();
    expect(await collectCraft(deps, alice, done.rev, 'stock')).toMatchObject({ ok: false });
  });
  it('a dish that finds the good it uses takes one, cooks faster for the team and tips more', () => {
    const run = (pantry: Record<string, number>) => { const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state = createRestaurant(); e.state.pantry = pantry; e.state.menu.burger.enabled = false; e.state.menu.soup.enabled = true; e.state.furniture.push({ id: 60, kind: 'pot', x: 8, z: 4, rotation: 0 }); expect(e.open(createDailyHeadline('2026-12-09'))).toBeNull(); for (let i = 0; i < 1500; i++) e.tick(); return e; };
    expect(goodFor({ stock: 1 } as never, 'soup')).toBe('stock'); expect(goodFor({ stock: 1 } as never, 'salad')).toBeNull(); expect(PREPPED_SPEED).toBeGreaterThan(0);
    const plain = run({}), prepped = run({ stock: 3 });
    expect(prepped.state.pantry.stock ?? 0).toBeLessThan(3); expect(prepped.state.totals.tips).toBeGreaterThanOrEqual(plain.state.totals.tips);
  });
});

describe('saved layouts', () => {
  const where = async (id: number): Promise<{ x: number; z: number } | undefined> => { const p = await loadPark(deps, alice) as unknown as { state: { furniture: { id: number; x: number; z: number }[] } }; return p.state.furniture.find(f => f.id === id); };
  it('remembers where every piece stands and puts the room back, for free', async () => {
    const start = await where(3), saved = good(await saveLayout(deps, alice, await rev(), 0)); expect(saved.layouts[0]).toMatchObject({ fits: true }); expect(saved.layouts[1]).toBeNull();
    good(await savePark(deps, alice, await rev(), [{ tick: 0, kind: 'place', item: { id: 3, kind: 'table', x: 1, z: 6, rotation: 0 } }]));
    expect((await where(3))!.z).toBe(6); const cash = good(await getWorld(deps, alice)).cash;
    const back = good(await useLayout(deps, alice, await rev(), 0)); expect(back.cash).toBe(cash); expect(await where(3)).toMatchObject({ x: start!.x, z: start!.z });
  });
  it('is out of date once something is bought or sold, and an empty slot cannot be used', async () => {
    expect(await useLayout(deps, alice, await rev(), 1)).toMatchObject({ ok: false, error: 'That slot is empty.' });
    const saved = good(await saveLayout(deps, alice, await rev(), 2));
    good(await savePark(deps, alice, saved.rev, [{ tick: 0, kind: 'sell', id: 6 }]));
    const w = good(await getWorld(deps, alice)); expect(w.layouts[2]).toMatchObject({ fits: false });
    expect(await useLayout(deps, alice, await rev(), 2)).toMatchObject({ ok: false, error: expect.stringMatching(/Save it again/) });
  });
});

describe('the playtest aid', () => {
  it('moves only the own timers of whoever asks, and a crop then harvests', async () => {
    const bob: Player = { id: 't2_bob', name: 'bob' };
    const w = good(await plant(deps, alice, await rev(), 0, 'tomato')); await loadPark(deps, bob); const b = good(await plant(deps, bob, ((await loadPark(deps, bob)) as unknown as { rev: number }).rev, 0, 'tomato'));
    expect(await harvest(deps, alice, w.rev, 0)).toMatchObject({ ok: false });
    expect(await fastForward(store, alice.id, 6 * 3600, store.now)).toBe(1);
    expect(good(await harvest(deps, alice, w.rev, 0)).pantry.tomato).toBe(CROPS.tomato.yield);
    expect(await harvest(deps, bob, b.rev, 0)).toMatchObject({ ok: false, error: 'Not ready yet.' });
    expect(await fastForward(store, 't2_nobody', 3600, store.now)).toBe(0);
  });
});
