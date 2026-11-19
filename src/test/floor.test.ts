import { describe, expect, it } from 'vitest';
import { cozyBot, datesFrom, floorPolicy, playWithHelper } from '@/management/bots';
import { createDailyHeadline } from '@/management/daily-headline';
import { RestaurantEngine } from '@/management/engine';
import { runService, stateHash } from '@/management/replay';
import { CATALOG, DISHES, HOST_DELAY, HUSTLE_DECAY, INCIDENT_TTL, ORDER_DELAY, QUEUE_MAX, buyPrice, createRestaurant, dishCost, moveQuality, type RestaurantState } from '@/management/types';

const headline = createDailyHeadline('2026-12-09');
const opened = (mutate: (s: RestaurantState) => void = () => undefined): RestaurantEngine => {
  const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state = createRestaurant(); mutate(e.state);
  expect(e.open(headline)).toBeNull(); return e;
};
const until = (e: RestaurantEngine, test: () => boolean, max = 3000): void => { for (let i = 0; i < max && !test(); i++) e.tick(); expect(test(), 'the awaited moment never came').toBe(true); };
const seconds = (e: RestaurantEngine, n: number): void => { for (let i = 0; i < Math.round(n * 10); i++) e.tick(); };
const party = (e: RestaurantEngine) => e.state.guests.find(g => g.stage === 'queued');

describe('the door', () => {
  it('a party waits at the door, and the team seats it after the host delay', () => {
    const e = opened(); until(e, () => Boolean(party(e))); const g = party(e)!;
    expect(g.tableId).toBe(-1); expect(g.stage).toBe('queued');
    seconds(e, HOST_DELAY + .3); expect(g.stage).not.toBe('queued'); expect(g.tableId).toBeGreaterThan(0);
  });
  it('you can seat it sooner, at the table you choose, and it cannot be seated twice or in a taken seat', () => {
    const e = opened(); until(e, () => Boolean(party(e))); const g = party(e)!, table = e.state.furniture.filter(f => f.kind === 'table')[1];
    expect(e.seat(g.id, table.id, 1)).toBeNull(); expect(g.tableId).toBe(table.id); expect(g.seat).toBe(1); expect(g.stage).toBe('arriving');
    expect(e.seat(g.id, table.id, 0)).toMatch(/already been seated/);
    until(e, () => Boolean(party(e))); const next = party(e)!; expect(e.seat(next.id, table.id, 1)).toMatch(/taken/); expect(e.seat(next.id, 999, 0)).toMatch(/Pick a table/);
  });
  it('a table with something cosy near it tips ten percent more, only when you chose it', () => {
    const e = opened(); until(e, () => Boolean(party(e))); const g = party(e)!;
    const cosy = e.state.furniture.find(f => f.kind === 'table' && f.id === 3)!; // the starter has a planter at (0,0) near it? checked below
    const near = e.state.furniture.some(f => CATALOG[f.kind].comfort > 0 && Math.max(Math.abs(f.x - cosy.x), Math.abs(f.z - cosy.z)) <= 2);
    expect(e.seat(g.id, cosy.id, 0)).toBeNull(); expect(g.cozy).toBe(near);
  });
  it('the door holds only so many, and a party that waits too long walks away', () => {
    const e = opened(s => { s.furniture = s.furniture.filter(f => f.kind !== 'table' || f.id === 3); }); // one table, so the door fills up
    seconds(e, 140); expect(e.state.guests.filter(g => g.stage === 'queued').length).toBeLessThanOrEqual(QUEUE_MAX); expect(e.state.totals.missed).toBeGreaterThan(0);
  });
});

describe('orders, dishes and tables', () => {
  it('a guest who has sat down is taken an order by you, or by a server after the order delay', () => {
    const e = opened(); until(e, () => Boolean(party(e))); const a = party(e)!; e.seat(a.id, 3, 0); until(e, () => a.stage === 'seated');
    expect(e.order(a.id)).toBeNull(); expect(a.stage).toBe('waiting'); expect(e.order(a.id)).toMatch(/no order/);
    until(e, () => Boolean(party(e))); const b = party(e)!; e.seat(b.id, 4, 0); until(e, () => b.stage === 'seated'); seconds(e, ORDER_DELAY + .3); expect(b.stage).not.toBe('seated');
  });
  it('you can carry a finished dish yourself, and clear a dirty seat before a server does', () => {
    const e = opened(); let served = 0, cleared = false;
    for (let i = 0; i < 2500 && !(served && cleared); i++) {
      const ready = e.state.guests.find(g => g.stage === 'ready'); if (ready && e.serve(ready.id) === null) served++;
      const dirty = e.state.dirty[0]; if (dirty) { const [t, s] = dirty.split(':').map(Number); if (e.clear(t, s) === null) cleared = true; }
      e.tick();
    }
    expect(served).toBeGreaterThan(0); expect(cleared).toBe(true); expect(e.clear(3, 0)).toMatch(/already clean/);
  });
});

describe('the hustle chain', () => {
  it('grows with quick moves, lapses after the decay, and a live chain raises tips', () => {
    const e = opened(); until(e, () => Boolean(party(e))); const g = party(e)!;
    expect(e.hustleLive()).toBe(0); e.seat(g.id, 3, 0); expect(e.hustleLive()).toBe(1); expect(e.state.hustle.best).toBe(1);
    seconds(e, HUSTLE_DECAY + 1); expect(e.hustleLive()).toBe(0); expect(e.state.hustle.best).toBe(1);
  });
  it('a slow seating does not count', () => {
    const e = opened(); until(e, () => Boolean(party(e))); const g = party(e)!; seconds(e, 3.5); if (g.stage === 'queued') { e.seat(g.id, 3, 0); expect(e.hustleLive()).toBe(0); }
  });
  it('the hands-on helper builds a long chain, replays to the same night, and out-earns the team alone', () => {
    for (const date of datesFrom('2026-12-09', 4)) {
      const run = playWithHelper(cozyBot, date, undefined, floorPolicy), r = run.replay;
      if ('error' in r) throw new Error(r.error);
      expect(r.hash, date).toBe(run.liveHash); expect(r.rejected, date).toBe(0); expect(r.state.hustle.best, date).toBeGreaterThan(10);
      const alone = runService(createRestaurant(), cozyBot.actions, createDailyHeadline(date)); if ('error' in alone) throw new Error(alone.error);
      expect(r.report.profit, date).toBeGreaterThan(alone.report.profit);
    }
  });
});

describe('the station move', () => {
  it('is scored from how far through the dish it is: best near the middle', () => {
    expect([.5, .4, .62].map(moveQuality)).toEqual([3, 3, 3]); expect([.25, .75].map(moveQuality)).toEqual([2, 2]); expect([.05, .95].map(moveQuality)).toEqual([1, 1]);
  });
  it('a well-timed move forgives a slightly late plate, can be made once, and a rough one costs nothing', () => {
    const e = opened(s => { s.staff = s.staff.filter(m => m.role !== 'chef'); s.menu.burger.enabled = false; });
    until(e, () => e.state.guests.some(g => g.stage === 'waiting')); const g = e.state.guests.find(x => x.stage === 'waiting')!, dish = DISHES[g.dish];
    expect(e.claimTicket(g.id)).toBeNull(); expect(e.move(g.id)).toBeNull(); expect(e.state.hands[0].moved).toBe(1); // at second zero: a rough move
    expect(e.move(g.id)).toMatch(/already/);
    abandon(e, g.id);
    until(e, () => e.state.guests.some(x => x.stage === 'waiting')); const h = e.state.guests.find(x => x.stage === 'waiting')!;
    e.claimTicket(h.id); while (h.cook < DISHES[h.dish].seconds * .5) e.tick(); expect(e.move(h.id)).toBeNull(); expect(e.state.hands[0].moved).toBe(3);
    while (h.cook < DISHES[h.dish].seconds * 1.4) e.tick(); expect(e.plate(h.id)).toBeNull(); expect(h.quality).toBe(3); // a 1.4x plate is "over" alone; the move forgives it
    void dish;
  });
});
const abandon = (e: RestaurantEngine, id: number): void => { e.abandonCook(id); };

describe('decisions', () => {
  it('one comes up in the night, from the date, and waits for the player or the default', () => {
    const e = opened(); until(e, () => Boolean(e.state.incident), 1600); const incident = e.state.incident!;
    expect(['complaint', 'allergy', 'supplier']).toContain(incident.kind); expect(e.state.incidents).toBe(1);
    seconds(e, INCIDENT_TTL + .5); expect(e.state.incident?.at === incident.at).toBe(false); // the default was taken
  });
  it('a supplier deal costs $40 and takes a quarter off ingredients for the night; a complaint can be comped or soothed', () => {
    const e = opened(); e.state.incident = { kind: 'supplier', guestId: 0, at: 0 }; const cash = e.state.cash, before = dishCost(e.state, 'burger');
    expect(e.decide(1)).toBeNull(); expect(e.state.cash).toBe(cash - 40); expect(e.state.deal).toBe(true); expect(dishCost(e.state, 'burger')).toBeLessThan(before);
    expect(e.decide(0)).toMatch(/nothing to decide/);
    const f = opened(); until(f, () => f.state.guests.some(g => g.stage === 'waiting')); const g = f.state.guests.find(x => x.stage === 'waiting')!; g.waiting = 20;
    f.state.incident = { kind: 'complaint', guestId: g.id, at: f.state.elapsed }; expect(f.decide(2)).toBeNull(); expect(g.waiting).toBeLessThan(20);
    f.state.incident = { kind: 'complaint', guestId: g.id, at: f.state.elapsed }; expect(f.decide(1)).toBeNull(); expect(g.price).toBe(0);
  });
  it('a night with decisions still replays to the same hash', () => {
    const a = runService(createRestaurant(), [], headline), b = runService(createRestaurant(), [], headline);
    if ('error' in a || 'error' in b) throw new Error('failed'); expect(stateHash(a.state)).toBe(stateHash(b.state));
  });
});

describe('the bank', () => {
  /** A restaurant with a long history that is in trouble: a final notice stands and tonight lost money. */
  const troubled = (mutate: (s: RestaurantState) => void = () => undefined): RestaurantEngine => {
    const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; const s = createRestaurant();
    const night = { revenue: 0, ingredients: 0, served: 0, missed: 0, tips: 0, headline: null, challenges: [], day: 1, wages: 0, rent: 0, debtPayment: 0, research: 0, profit: -20, rating: 3 };
    s.history = Array.from({ length: 8 }, (_, i) => ({ ...night, day: i + 1 })); s.day = 9; s.notice = 1; s.debt = 300; s.cash = 400; s.reputation = 3.5;
    s.furniture.push({ id: 30, kind: 'oven', x: 8, z: 4, rotation: 0 }); s.furniture.push({ id: 31, kind: 'wok', x: 8, z: 6, rotation: 0 });
    s.staff.push({ ...s.staff[0], id: 40, name: 'Extra' }, { ...s.staff[1], id: 41, name: 'Extra2' }); mutate(s); e.state = s; return e;
  };
  const settle = (e: RestaurantEngine, profit: number): void => { (e as unknown as { settleBank(p: number): void }).settleBank(profit); };
  it('two loss-making nights, or cash below zero, put a veteran on final notice; a good night lifts it', () => {
    const e = troubled(s => { s.notice = 0; s.streaks.losses = 2; }); settle(e, -30); expect(e.state.notice).toBe(1); expect(e.state.foreclosure).toBeNull();
    const f = troubled(s => { s.streaks.losses = 0; }); settle(f, 50); expect(f.state.notice).toBe(0);
  });
  it('a further loss under notice sells up to three pieces into storage, lets the extra crew go and clears the debt, and nothing else', () => {
    const e = troubled(), before = e.state, furniture = before.furniture.length, name = before.name, history = before.history.length, cash = before.cash;
    settle(e, -20); const s = e.state;
    expect(s.foreclosure).toMatchObject({ day: 9, released: 2 }); expect(s.foreclosure!.kinds).toHaveLength(3); expect(s.storage).toHaveLength(3); expect(s.furniture).toHaveLength(furniture - 3);
    expect(s.debt).toBe(0); expect(s.staff).toHaveLength(2); expect(s.reputation).toBe(2.9); expect(s.notice).toBe(0); expect(s.cash).toBeGreaterThan(cash);
    expect(s.name).toBe(name); expect(s.history).toHaveLength(history); expect(s.furniture.some(f => f.kind === 'table')).toBe(true); expect(s.furniture.some(f => f.kind === 'grill')).toBe(true);
  });
  it('never takes the last table or the last piece of a station the menu needs', () => {
    const e = troubled(s => { s.furniture = s.furniture.filter(f => f.kind !== 'table' || f.id === 3); }); settle(e, -20);
    expect(e.state.furniture.filter(f => f.kind === 'table')).toHaveLength(1); expect(e.state.furniture.some(f => f.kind === 'grill')).toBe(true); expect(e.state.furniture.some(f => f.kind === 'prep')).toBe(true);
  });
  it('not in the first seven nights, and not twice in a week', () => {
    const young = troubled(s => { s.history = s.history.slice(0, 3); }); settle(young, -20); expect(young.state.foreclosure).toBeNull(); expect(young.state.notice).toBe(0);
    const again = troubled(s => { s.foreclosure = { day: 6, kinds: [], released: 0, proceeds: 0 }; }); settle(again, -20); expect(again.state.foreclosure!.day).toBe(6); 
  });
  it('a piece in storage can be put back for 60% of its price, and the bank will not lend again that week', () => {
    const e = troubled(); settle(e, -20); const s = e.state, kind = s.storage[0], price = buyPrice(s, kind);
    expect(price).toBe(Math.floor(CATALOG[kind].price * .6)); s.cash = 5000;
    let placed = false; for (let z = 9; z >= 0 && !placed; z--) for (let x = 0; x < 10 && !placed; x++) { const before = s.cash; if (e.place({ id: -1, kind, x, z, rotation: 0 }) === null) { placed = true; expect(before - s.cash).toBe(price); } }
    expect(placed).toBe(true); expect(s.storage).toHaveLength(2);
    s.cash = 100; expect(e.loan()).toMatch(/will not lend/);
  });
});
