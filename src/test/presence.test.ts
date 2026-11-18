import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPresence } from '@/client/presence';
import { cozyBot } from '@/management/bots';
import { createDailyHeadline } from '@/management/daily-headline';
import { RestaurantEngine } from '@/management/engine';
import { runService } from '@/management/replay';
import { guestThought } from '@/management/satisfaction';
import { createRestaurant, restaurantSchema } from '@/management/types';
import { getToday, keys, loadPark, lockService, openService, type Deps, type Player } from '@/server/core/game';
import { PRESENCE_KEY, PRESENT_MS, pickVisitors, recordPresence } from '@/server/core/presence';
import { FakeStore } from './fake-store';

const alice: Player = { id: 't2_alice', name: 'alice' }, bob: Player = { id: 't2_bob', name: 'bob_the-cook' }, cara: Player = { id: 't2_cara', name: 'cara' }, dan: Player = { id: 't2_dan', name: 'dan' }, eve: Player = { id: 't2_eve', name: 'eve' };
let store: FakeStore, deps: Deps;
const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };
const tick = (ms: number) => { store.now += ms; };
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); deps = { store, now: () => store.now }; });

describe('who is here', () => {
  it('records a visitor with the dish they would order', async () => {
    good(await recordPresence(deps, bob, 'burger'));
    expect(await pickVisitors(deps, alice.id)).toEqual([{ name: 'bob_the-cook', dish: 'burger' }]);
  });
  it('refuses a dish that does not exist, and a rapid-fire sender', async () => {
    expect(await recordPresence(deps, bob, 'pizza')).toMatchObject({ ok: false, status: 400 }); expect(await recordPresence(deps, bob, 5)).toMatchObject({ ok: false, status: 400 });
    for (let i = 0; i < 8; i++) await recordPresence(deps, bob, 'salad'); expect(await recordPresence(deps, bob, 'salad')).toMatchObject({ ok: false, status: 429 });
  });
  it('never brings the host to their own kitchen, and drops visitors after a minute', async () => {
    good(await recordPresence(deps, alice, 'salad')); good(await recordPresence(deps, bob, 'salad'));
    expect((await pickVisitors(deps, alice.id)).map(v => v.name)).toEqual(['bob_the-cook']);
    tick(PRESENT_MS + 1000); expect(await pickVisitors(deps, alice.id)).toEqual([]);
    expect(await store.zRange(PRESENCE_KEY, 0, -1)).toEqual([]); // tidied away
  });
  it('takes at most three, newest first', async () => {
    for (const u of [bob, cara, dan, eve]) { good(await recordPresence(deps, u, 'salad')); tick(1000); }
    expect((await pickVisitors(deps, alice.id)).map(v => v.name)).toEqual(['eve', 'dan', 'cara']);
  });
  it('a heartbeat renews it, so someone who keeps the tab open stays here', async () => {
    good(await recordPresence(deps, bob, 'salad')); tick(50_000); good(await recordPresence(deps, bob, 'burger')); tick(50_000);
    expect(await pickVisitors(deps, alice.id)).toEqual([{ name: 'bob_the-cook', dish: 'burger' }]);
  });
  it('skips a name that could not be shown safely, and a damaged record', async () => {
    good(await recordPresence(deps, { id: 't2_odd', name: 'x<script>' }, 'salad')); expect(await pickVisitors(deps, alice.id)).toEqual([]);
    await store.zAdd(PRESENCE_KEY, { member: 't2_bad', score: store.now }); await store.hSet('presence:info', { t2_bad: '{nope' }); good(await recordPresence(deps, bob, 'salad'));
    expect((await pickVisitors(deps, alice.id)).map(v => v.name)).toEqual(['bob_the-cook']);
  });
});

describe('visitors in the opening snapshot', () => {
  it('are written into the snapshot at open and never into the saved restaurant', async () => {
    good(await recordPresence(deps, bob, 'salad')); good(await recordPresence(deps, cara, 'burger'));
    const t = good(await getToday(deps, alice)), o = good(await openService(deps, alice, t.rev, cozyBot.actions));
    expect(o.snapshot.visitors.map(v => v.name).sort()).toEqual(['bob_the-cook', 'cara']);
    const park = await loadPark(deps, alice); if ('status' in park) throw new Error('no park'); expect(park.state.visitors).toEqual([]);
  });
  it('are cleared once the night is over, so they never carry into tomorrow', async () => {
    good(await recordPresence(deps, bob, 'salad'));
    const t = good(await getToday(deps, alice)), o = good(await openService(deps, alice, t.rev, cozyBot.actions)), locked = good(await lockService(deps, alice, o.date, []));
    expect(locked.park.visitors).toEqual([]);
  });
  it('make the receipt differ from a night without them, and replay to the same receipt every time', () => {
    const headline = createDailyHeadline('2026-12-09'), withBob = createRestaurant(); withBob.visitors = [{ name: 'bob', dish: 'salad' }];
    const a = runService(withBob, [], headline), b = runService(structuredClone(withBob), [], headline), none = runService(createRestaurant(), [], headline);
    if ('error' in a || 'error' in b || 'error' in none) throw new Error('service failed'); expect(a.hash).toBe(b.hash); expect(a.report.served).toBeGreaterThanOrEqual(none.report.served);
  });
  it('a visitor whose dish is on the menu orders it and pays', () => {
    const state = createRestaurant(); state.visitors = [{ name: 'bob', dish: 'burger' }]; const seen: string[] = [];
    const headline = createDailyHeadline('2026-12-09'); const prepared = restaurantSchema.parse(state);
    const r = runService(prepared as typeof state, [], headline); if ('error' in r) throw new Error(r.error); void seen;
    expect(r.state.visitors).toEqual([]); expect(r.report.served).toBeGreaterThan(0);
  });
  it('a visitor whose dish is off the menu sits nowhere: no guest appears, and no guest is counted missed because of them', () => {
    const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state.visitors = [{ name: 'bob', dish: 'ramen' }]; e.state.cash = 5000;
    expect(e.open(createDailyHeadline('2026-12-09'))).toBeNull();
    for (let i = 0; i < 3000 && e.state.night.arrivals < 2; i++) e.tick();
    expect(e.event).toBe('bob came over from the thread, but nothing here was for them.'); expect(e.state.guests.some(g => g.visitor === 'bob')).toBe(false);
  });
  it('a visitor whose dish is on the menu arrives as the second guest and is named', () => {
    const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state.visitors = [{ name: 'bob', dish: 'burger' }]; e.state.cash = 5000;
    expect(e.open(createDailyHeadline('2026-12-09'))).toBeNull();
    for (let i = 0; i < 3000 && e.state.night.arrivals < 2; i++) e.tick();
    const bobby = e.state.guests.find(g => g.visitor === 'bob'); expect(bobby?.dish).toBe('burger'); expect(bobby?.price).toBe(e.state.menu.burger.price);
  });
  it('are refused by the schema when a name is not a Reddit name', () => {
    const state = JSON.parse(JSON.stringify(createRestaurant())); state.visitors = [{ name: '<b>', dish: 'salad' }]; expect(restaurantSchema.safeParse(state).success).toBe(false);
    state.visitors = [{ name: 'a', dish: 'salad' }, { name: 'b', dish: 'salad' }, { name: 'c', dish: 'salad' }, { name: 'd', dish: 'salad' }]; expect(restaurantSchema.safeParse(state).success).toBe(false);
  });
  it('are not in the stored run or the streak: a night with visitors is an ordinary night to the board', async () => {
    good(await recordPresence(deps, bob, 'salad')); const t = good(await getToday(deps, alice)), o = good(await openService(deps, alice, t.rev, cozyBot.actions)); good(await lockService(deps, alice, o.date, []));
    expect(await store.hGet(keys.runs('2026-12-09'), alice.id)).toBeDefined();
  });
});

describe('what a visitor is thinking', () => {
  const base = { stage: 'waiting' as const, waiting: 4, happy: false, dish: 'salad' as const, price: 24, quality: 0, paid: false };
  it('says where they came from, and keeps any complaint under their name', () => {
    expect(guestThought({ ...base, visitor: 'bob' }, 50)).toEqual({ text: 'bob, from the thread', tone: 'good' });
    expect(guestThought({ ...base, waiting: 40, visitor: 'bob' }, 50)).toEqual({ text: 'bob: long wait', tone: 'bad' });
  });
});

describe('the heartbeat on the client', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it('sends the house dish now and every twenty seconds, and stops when told', async () => {
    const calls: unknown[] = []; const stop = startPresence(async (m, p, b) => { calls.push([m, p, b]); return { status: 200, body: {} }; }, () => 'burger');
    expect(calls).toEqual([['POST', '/api/presence', { dish: 'burger' }]]); await vi.advanceTimersByTimeAsync(20_000); expect(calls).toHaveLength(2);
    stop(); await vi.advanceTimersByTimeAsync(60_000); expect(calls).toHaveLength(2);
  });
  it('survives a server that is down', async () => {
    const stop = startPresence(async () => { throw new Error('offline'); }, () => 'salad'); await vi.advanceTimersByTimeAsync(40_000); stop();
  });
});
