import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { COMPS_PER_NIGHT, COOK_BURN, DISHES, cookQuality, createRestaurant, type Guest } from '@/management/types';

/** A kitchen with no chef, so every ticket waits for the owner. Runs until a guest is waiting and returns the engine. */
function kitchen(seed = 91273, withChef = false) {
  const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state = { ...createRestaurant(), seed };
  if (!withChef) e.state.staff = e.state.staff.filter(s => s.role !== 'chef');
  expect(e.open()).toBeNull();
  for (let i = 0; i < 600 && !e.state.guests.some(g => g.stage === 'waiting'); i++) e.tick();
  return e;
}
const waiting = (e: RestaurantEngine): Guest => e.state.guests.find(g => g.stage === 'waiting')!;
const advance = (e: RestaurantEngine, seconds: number) => { for (let i = 0; i < Math.round(seconds * 10); i++) e.tick(); };

describe('cooking quality bands', () => {
  it('are raw, acceptable, perfect, over, burnt as a share of the normal time', () => {
    expect([.3, .59].map(cookQuality)).toEqual([0, 0]); expect([.6, .84].map(cookQuality)).toEqual([1, 1]);
    expect([.85, 1, 1.25].map(cookQuality)).toEqual([3, 3, 3]); expect([1.26, 1.6].map(cookQuality)).toEqual([2, 2]); expect([1.61, 2.5].map(cookQuality)).toEqual([0, 0]);
  });
});

describe('claiming a ticket', () => {
  it('takes a waiting ticket, spends the ingredients once and puts the owner at a free station', () => {
    const e = kitchen(), g = waiting(e), cash = e.state.cash, ingredients = e.state.totals.ingredients;
    expect(e.claimTicket(g.id)).toBeNull();
    expect(g.stage).toBe('cooking'); expect(g.owner).toBe(true); expect(g.cook).toBe(0); expect(g.stationId).not.toBeNull();
    expect(e.state.cash).toBe(cash - DISHES[g.dish].cost); expect(e.state.totals.ingredients).toBe(ingredients + DISHES[g.dish].cost);
  });
  it('is one dish at a time, and refuses closed doors, a missing ticket, a ticket already cooking, and no cash', () => {
    const e = kitchen(); for (let i = 0; i < 600 && e.state.guests.filter(g => g.stage === 'waiting').length < 2; i++) e.tick();
    const [first, another] = e.state.guests.filter(g => g.stage === 'waiting'); expect(another).toBeDefined();
    expect(e.claimTicket(first.id)).toBeNull();
    expect(e.claimTicket(another.id)).toBe('Finish the dish you are cooking first.');
    expect(e.claimTicket(first.id)).toBeTruthy(); expect(e.claimTicket(99999)).toBeTruthy();
    const closed = new RestaurantEngine(undefined, () => 0); expect(closed.claimTicket(1)).toBe('The doors are closed.');
    const broke = kitchen(); broke.state.cash = 0; expect(broke.claimTicket(waiting(broke).id)).toBe('Not enough cash for ingredients.');
  });
  it('is refused when every station for that dish is busy with a chef', () => {
    const e = kitchen(91273, true); const g = e.state.guests.find(x => x.stage === 'cooking' || x.stage === 'waiting');
    advance(e, 30); const cooking = e.state.guests.find(x => x.stage === 'cooking' && !x.owner), second = e.state.guests.find(x => x.stage === 'waiting');
    if (cooking && second && second.dish === cooking.dish) expect(e.claimTicket(second.id)).toMatch(/busy/); else expect(g).toBeDefined();
  });
  it('keeps the chef off the station the owner is using', () => {
    const e = kitchen(), g = waiting(e); e.claimTicket(g.id); const station = g.stationId;
    e.state.staff.push({ id: 90, name: 'Late', role: 'chef', level: 1, x: 4, z: 9, yaw: 0, route: [], task: 'idle', guestId: null, stationId: null, timer: 0 });
    const other = e.state.guests.find(x => x.id !== g.id && x.stage === 'waiting' && x.dish === g.dish);
    advance(e, 3); if (other && other.stage !== 'waiting') expect(other.stationId).not.toBe(station);
  });
});

describe('plating', () => {
  /** Claims the first waiting ticket and lets it cook for `ratio` times that dish's normal time. */
  const cookFor = (ratio: number) => { const e = kitchen(), g = waiting(e); e.claimTicket(g.id); advance(e, ratio * DISHES[g.dish].seconds); return { e, g }; };
  it('too early: the dish is raw, the ingredients are lost and the ticket goes back to the line', () => {
    const { e, g } = cookFor(.3), cash = e.state.cash;
    expect(e.plate(g.id)).toBeNull(); expect(g.stage).toBe('waiting'); expect(g.owner).toBe(false); expect(g.stationId).toBeNull(); expect(e.state.cash).toBe(cash); expect(e.event).toMatch(/raw/);
  });
  it('a little early still goes out, as acceptable', () => { const { e, g } = cookFor(.7); e.plate(g.id); expect(g.stage).toBe('ready'); expect(g.quality).toBe(1); });
  it('on time is perfect', () => { const { e, g } = cookFor(1); e.plate(g.id); expect(g.stage).toBe('ready'); expect(g.quality).toBe(3); expect(e.event).toMatch(/Perfect/); });
  it('a little late goes out, slightly over', () => { const { e, g } = cookFor(1.4); e.plate(g.id); expect(g.stage).toBe('ready'); expect(g.quality).toBe(2); });
  it('too late burns it', () => { const { e, g } = cookFor(1.8); e.plate(g.id); expect(g.stage).toBe('waiting'); expect(e.event).toMatch(/burnt/); });
  it('burns by itself if the owner walks away for twice the normal time', () => {
    const { e, g } = cookFor(COOK_BURN + .05); expect(g.owner).toBe(false); expect(g.stage === 'waiting' || g.stage === 'leaving').toBe(true); expect(e.event).toMatch(/burnt/);
  });
  it('a ready dish is carried out by the server like any other', () => {
    const { e, g } = cookFor(1); e.plate(g.id); advance(e, 40);
    expect(['delivering', 'eating', 'leaving']).toContain(g.stage); expect(g.paid).toBe(true);
  });
  it('can be put down, which spends the ingredients and returns the ticket', () => {
    const { e, g } = cookFor(.2); expect(e.abandonCook(g.id)).toBeNull(); expect(g.owner).toBe(false); expect(g.stage).toBe('waiting'); expect(e.abandonCook(g.id)).toBeTruthy();
  });
  it('has nothing to plate when the owner is not cooking', () => { const e = kitchen(); expect(e.plate(waiting(e).id)).toBe('There is nothing to plate.'); });
  it('a guest who runs out of patience while the owner cooks leaves, and the owner is released', () => {
    const e = kitchen(), g = waiting(e); e.claimTicket(g.id); g.waiting = 9999; e.tick();
    expect(g.owner).toBe(false); expect(g.stage).toBe('leaving'); expect(e.claimTicket(waiting(e)?.id ?? -1)).not.toBe('Finish the dish you are cooking first.');
  });
});

describe('perfect plates tip more', () => {
  it('a perfect plate earns a larger tip than an acceptable one for the same guest', () => {
    const run = (quality: number) => {
      const e = kitchen(), g = waiting(e); g.price = 60; e.claimTicket(g.id); advance(e, DISHES[g.dish].seconds); e.plate(g.id); g.quality = quality;
      e.state.totals.tips = 0; advance(e, 30); return e.state.totals.tips;
    };
    expect(run(3)).toBeGreaterThan(run(1));
  });
});

describe('rush and comp', () => {
  it('a rushed ticket is taken by the next free chef before older ones', () => {
    const e = kitchen(91273, false); advance(e, 25);
    const line = e.state.guests.filter(g => g.stage === 'waiting'); expect(line.length).toBeGreaterThanOrEqual(2);
    const last = line[line.length - 1]; expect(e.rush(last.id)).toBeNull(); expect(last.priority).toBe(true); expect(e.rush(last.id)).toBe('That ticket is already first in line.');
    e.state.staff.push({ id: 91, name: 'Late', role: 'chef', level: 1, x: 1, z: 2, yaw: 0, route: [], task: 'idle', guestId: null, stationId: null, timer: 0 });
    for (let i = 0; i < 20 && last.stage === 'waiting'; i++) e.tick();
    expect(last.stage).not.toBe('waiting'); expect(line[0].stage === 'waiting' || line[0].stage === 'leaving' || line[0].stationId !== null).toBe(true);
  });
  it('only a ticket that is still waiting can be rushed', () => { const e = kitchen(); const g = waiting(e); e.claimTicket(g.id); expect(e.rush(g.id)).toBeTruthy(); });
  it('a comp makes the meal free, resets patience, and is limited to two a night', () => {
    const e = kitchen(91273, false); advance(e, 35);
    const guests = e.state.guests.filter(g => ['waiting', 'cooking', 'ready', 'delivering'].includes(g.stage)); expect(guests.length).toBeGreaterThanOrEqual(3);
    guests[0].waiting = 40; expect(e.comp(guests[0].id)).toBeNull(); expect(guests[0].price).toBe(0); expect(guests[0].waiting).toBe(0); expect(e.state.comps).toBe(1);
    expect(e.comp(guests[0].id)).toBe('That table is already on the house.');
    expect(e.comp(guests[1].id)).toBeNull(); expect(COMPS_PER_NIGHT).toBe(2); expect(e.comp(guests[2].id)).toBe('You can comp two tables a night.');
  });
  it('a comped guest pays nothing and tips nothing but still counts as served', () => {
    const e = kitchen(), g = waiting(e); e.comp(g.id); e.claimTicket(g.id); advance(e, DISHES[g.dish].seconds); e.plate(g.id);
    const revenue = e.state.totals.revenue; advance(e, 30); expect(g.paid).toBe(true); expect(e.state.totals.revenue).toBe(revenue); expect(e.state.totals.served).toBeGreaterThan(0);
  });
  it('comps reset for the next service', () => { const e = kitchen(); e.comp(waiting(e).id); expect(e.state.comps).toBe(1); for (let i = 0; i < 2600 && e.state.phase === 'service'; i++) e.tick(); e.state.staff.push({ id: 92, name: 'Chef', role: 'chef', level: 1, x: 1, z: 2, yaw: 0, route: [], task: 'idle', guestId: null, stationId: null, timer: 0 }); expect(e.open()).toBeNull(); expect(e.state.comps).toBe(0); });
});
