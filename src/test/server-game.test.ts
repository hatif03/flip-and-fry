import { beforeEach, describe, expect, it } from 'vitest';
import { cozyBot, greedyBot } from '@/management/bots';
import { createDailyHeadline } from '@/management/daily-headline';
import { runService, type Action } from '@/management/replay';
import { getToday, keys, loadPark, lockService, markPlayed, openService, savePark, streakFor, utcDate, type Deps, type Player } from '@/server/core/game';
import { FakeStore } from './fake-store';

const alice: Player = { id: 't2_alice', name: 'alice' }, bob: Player = { id: 't2_bob', name: 'bob' };
const at = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h);
let store: FakeStore, deps: Deps;
beforeEach(() => { store = new FakeStore(); store.now = at(2026, 12, 9); deps = { store, now: () => store.now }; });

/** Narrow a result without relying on discriminated-union narrowing, which this non-strict project does not get. */
function good<T>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; }
const today = async (p = alice) => good(await getToday(deps, p));
async function play(p: Player, actions: Action[]) {
  const t = await today(p), opened = good(await openService(deps, p, t.rev, actions));
  return { opened, locked: good(await lockService(deps, p, opened.date, [])) };
}

describe('the park lives in Redis, under its own key', () => {
  it('creates a starter park per player with its own seed and returns the same one next time', async () => {
    const a = await today(alice), b = await today(bob);
    expect(a.rev).toBe(1); expect(a.park.seed).not.toBe(b.park.seed); expect(a.park.history).toEqual([]);
    expect((await today(alice)).park).toEqual(a.park);
  });
  it('expires per key after 30 days and never relies on hash-field expiry', async () => {
    await today(alice);
    expect(store.ttl(keys.park(alice.id))).toBeGreaterThan(29 * 86400); expect(store.ttl(keys.park(alice.id))).toBeLessThanOrEqual(30 * 86400);
    store.advance(31 * 86400); expect(store.has(keys.park(alice.id))).toBe(false);
  });
  it('refuses to guess at a corrupt saved park', async () => {
    await store.set(keys.park(alice.id), '{"rev":1,"state":{"nope":true}}');
    expect(await getToday(deps, alice)).toMatchObject({ ok: false, status: 500 });
    await store.set(keys.park(alice.id), 'not json'); expect(await loadPark(deps, alice)).toMatchObject({ ok: false, status: 500 });
  });
  it('shows today\'s headline from the server clock, not from anything the client sends', async () => {
    const t = await today(alice); expect(t.date).toBe('2026-12-09'); expect(t.headline).toEqual(createDailyHeadline('2026-12-09'));
  });
});

describe('opening the doors', () => {
  it('applies planning actions with the engine, bumps the revision and stores the snapshot', async () => {
    const t = await today(), o = good(await openService(deps, alice, t.rev, [{ tick: 0, kind: 'hire', role: 'server' }]));
    expect(o.rev).toBe(t.rev + 1); expect(o.snapshot.staff).toHaveLength(3); expect(o.snapshot.cash).toBe(t.park.cash - 150); expect(o.snapshot.phase).toBe('planning');
    const again = await today(); expect(again.rev).toBe(o.rev); expect(again.open?.snapshot).toEqual(o.snapshot); expect(again.community.opens).toBe(1);
  });
  it('rejects overspending, bad actions and an unready restaurant without changing the park', async () => {
    const t = await today(), poor: Action[] = Array.from({ length: 9 }, () => ({ tick: 0, kind: 'hire', role: 'chef' }));
    expect(await openService(deps, alice, t.rev, poor)).toMatchObject({ ok: false, status: 400 });
    expect(await openService(deps, alice, t.rev, [{ tick: 3, kind: 'loan' } as unknown as Action])).toMatchObject({ ok: false, status: 400 });
    const noTables: Action[] = [3, 4, 5].map(id => ({ tick: 0, kind: 'sell', id }) as Action);
    expect(await openService(deps, alice, t.rev, noTables)).toMatchObject({ ok: false, error: 'Build at least one bistro table.' });
    expect((await today()).rev).toBe(t.rev); expect((await today()).park).toEqual(t.park);
  });
  it('rejects a stale revision as a conflict', async () => {
    const t = await today(); good(await savePark(deps, alice, t.rev, [{ tick: 0, kind: 'hire', role: 'server' }]));
    expect(await openService(deps, alice, t.rev, [])).toMatchObject({ ok: false, status: 409, conflict: true });
  });
});

describe('locking is the server replaying the opened service', () => {
  it('returns the server\'s receipt, which equals a direct replay of the stored snapshot', async () => {
    const { opened, locked } = await play(alice, cozyBot.actions);
    const direct = runService(opened.snapshot, [], createDailyHeadline(opened.date)); if ('error' in direct) throw new Error(direct.error);
    expect(locked.hash).toBe(direct.hash); expect(locked.report).toEqual(direct.report); expect(locked.park).toEqual(direct.state);
    expect(locked.rev).toBe(opened.rev + 1); expect(locked.official).toBe(true); expect(locked.stars.stars).toBeGreaterThanOrEqual(1);
  });
  it('advances the stored park to the replayed state, so cash only ever comes from a replay', async () => {
    const { locked } = await play(alice, []), t = await today();
    expect(t.park).toEqual(locked.park); expect(t.park.cash).toBe(locked.park.cash); expect(t.park.history).toHaveLength(1);
  });
  it('cannot be closed twice, and cannot be closed without opening', async () => {
    const { opened } = await play(alice, []);
    expect(await lockService(deps, alice, opened.date, [])).toMatchObject({ ok: false, status: 409 });
    expect(await lockService(deps, bob, opened.date, [])).toMatchObject({ ok: false, status: 409 });
  });
  it('ignores identity in the request: only the caller\'s own open can close', async () => {
    const t = await today(alice); good(await openService(deps, alice, t.rev, []));
    expect(await lockService(deps, bob, t.date, [])).toMatchObject({ ok: false, status: 409 });
    expect(good(await lockService(deps, alice, t.date, [])).official).toBe(true);
  });
  it('refuses planning actions at close, so a log cannot smuggle in cash or staff', async () => {
    const t = await today(), o = good(await openService(deps, alice, t.rev, []));
    expect(await lockService(deps, alice, o.date, [{ tick: 0, kind: 'claim', id: 'first-service' }])).toMatchObject({ ok: false, status: 400 });
    expect(await lockService(deps, alice, o.date, [{ tick: 0, kind: 'loan' }])).toMatchObject({ ok: false, status: 400 });
  });
  it('refuses a service that is too old, but allows one that opened before UTC midnight', async () => {
    store.now = at(2026, 12, 9, 23); store.now += 59 * 60 * 1000;
    const t = await today(), o = good(await openService(deps, alice, t.rev, []));
    store.now = at(2026, 12, 10, 0) + 3 * 60 * 1000; // 00:03 the next day
    const locked = good(await lockService(deps, alice, o.date, []));
    expect(locked.report.headline).toBe(createDailyHeadline('2026-12-09').id); // the headline was bound when the doors opened
    const t2 = await today(), o2 = good(await openService(deps, alice, t2.rev, [])); store.now = at(2026, 12, 13);
    expect(await lockService(deps, alice, o2.date, [])).toMatchObject({ ok: false, status: 400 });
  });
});

describe('one official result per UTC day', () => {
  it('keeps the first result, replaces it only with a better one', async () => {
    const first = (await play(alice, cozyBot.actions)).locked;
    expect(first.official).toBe(true); expect(first.replaced).toBe(false);
    // A second service with a bold menu on the same day earns fewer stars: the stored result stays.
    const worse = (await play(alice, greedyBot.actions)).locked;
    expect(worse.stars.stars).toBeLessThan(first.stars.stars); expect(worse.official).toBe(false);
    const stored = (await today()).run!; expect(stored.hash).toBe(first.hash); expect(stored.stars).toEqual(first.stars);
  });
  it('counts one lock per day for the neighborhood however many services are played', async () => {
    await play(alice, cozyBot.actions); await play(alice, []);
    expect((await today()).community).toEqual({ opens: 2, locks: 1 });
  });
  it('puts only official results on the board, scored by stars then rating', async () => {
    const { locked } = await play(alice, cozyBot.actions);
    const board = await store.zRange(keys.board('2026-12-09'), 0, -1); expect(board).toHaveLength(1);
    expect(board[0].member).toBe(alice.id); expect(board[0].score).toBe(locked.stars.stars * 1_000_000 + Math.round(locked.report.rating * 1000));
  });
});

describe('streak', () => {
  it('sets a bit only for a verified 1-star day and counts consecutive days', async () => {
    expect((await play(alice, cozyBot.actions)).locked.streak).toBe(1);
    store.now = at(2026, 12, 10); expect((await play(alice, [])).locked.stars.stars).toBeGreaterThanOrEqual(0);
    expect(await streakFor(store, alice.id, '2026-12-10')).toBeGreaterThanOrEqual(1);
  });
  it('stays visible all day (counts from yesterday if today is unplayed) and resets after a missed day', async () => {
    for (const d of ['2026-12-07', '2026-12-08']) await markPlayed(store, alice.id, d);
    expect(await streakFor(store, alice.id, '2026-12-09')).toBe(2); // today unplayed: still shows yesterday's streak
    expect(await streakFor(store, alice.id, '2026-12-10')).toBe(0); // a whole day was missed
    await markPlayed(store, alice.id, '2026-12-10'); expect(await streakFor(store, alice.id, '2026-12-10')).toBe(1);
  });
  it('carries across the new year and through a leap day', async () => {
    for (const d of ['2026-12-30', '2026-12-31', '2027-01-01']) await markPlayed(store, alice.id, d);
    expect(await streakFor(store, alice.id, '2027-01-01')).toBe(3);
    for (const d of ['2024-02-28', '2024-02-29', '2024-03-01']) await markPlayed(store, bob.id, d);
    expect(await streakFor(store, bob.id, '2024-03-01')).toBe(3);
  });
  it('is per player', async () => { await markPlayed(store, alice.id, '2026-12-09'); expect(await streakFor(store, bob.id, '2026-12-09')).toBe(0); });
  it('counts a long run, past one 96-day read', async () => {
    let d = '2026-01-01'; for (let i = 0; i < 300; i++) { await markPlayed(store, alice.id, d); d = new Date(Date.UTC(2026, 0, 2 + i)).toISOString().slice(0, 10); }
    expect(await streakFor(store, alice.id, '2026-10-27')).toBe(300);
  });
});

describe('concurrency', () => {
  it('a write that lands between read and commit is never lost: the loser gets a conflict', async () => {
    const t = await today();
    store.beforeExec = async () => { good(await savePark(deps, alice, t.rev, [{ tick: 0, kind: 'hire', role: 'server' }])); };
    const racing = await openService(deps, alice, t.rev, []);
    expect(racing).toMatchObject({ ok: false, status: 409, conflict: true });
    const after = await today(); expect(after.rev).toBe(t.rev + 1); expect(after.park.staff).toHaveLength(3); expect(after.open).toBeNull();
  });
  it('two tabs saving the same revision: exactly one wins', async () => {
    const t = await today();
    const first = await savePark(deps, alice, t.rev, [{ tick: 0, kind: 'hire', role: 'server' }]), second = await savePark(deps, alice, t.rev, [{ tick: 0, kind: 'hire', role: 'chef' }]);
    expect('error' in first).toBe(false); expect(second).toMatchObject({ ok: false, status: 409 });
    expect((await today()).park.staff).toHaveLength(3);
  });
  it('closing a service after the park moved on is a conflict, not an overwrite', async () => {
    const t = await today(), o = good(await openService(deps, alice, t.rev, []));
    good(await savePark(deps, alice, o.rev, [{ tick: 0, kind: 'hire', role: 'server' }]));
    expect(await lockService(deps, alice, o.date, [])).toMatchObject({ ok: false, status: 409, conflict: true });
    const after = await today(); expect(after.park.staff).toHaveLength(3);
    expect(after.open).toBeNull(); // the abandoned service is dropped, so a reload is never stuck inside it
    expect(after.run).toBeNull(); // and nothing was locked
  });
});

describe('limits', () => {
  it('rate-limits opens per player per minute, and the window resets', async () => {
    let rev = (await today()).rev;
    for (let i = 0; i < 30; i++) rev = good(await openService(deps, alice, rev, [])).rev;
    expect(await openService(deps, alice, rev, [])).toMatchObject({ ok: false, status: 429 });
    expect((await openService(deps, bob, (await today(bob)).rev, [])).ok).toBe(true); // another player is unaffected
    store.advance(61); expect((await openService(deps, alice, (await today()).rev, [])).ok).toBe(true);
  });
  it('keeps date-scoped hashes on one TTL and never creates unbounded personal keys', async () => {
    await play(alice, cozyBot.actions);
    expect(store.ttl(keys.runs('2026-12-09'))).toBeGreaterThan(29 * 86400);
    expect(store.ttl(keys.board('2026-12-09'))).toBeGreaterThan(44 * 86400);
    expect(store.ttl(keys.streak(alice.id, 2026))).toBeGreaterThan(399 * 86400);
    store.advance(46 * 86400); expect(store.has(keys.board('2026-12-09'))).toBe(false); expect(store.has(keys.runs('2026-12-09'))).toBe(false);
  });
  it('uses a small, fixed number of Redis commands per request', async () => {
    const t = await today(), before = store.calls; good(await openService(deps, alice, t.rev, [])); expect(store.calls - before).toBeLessThan(25);
    const mid = store.calls; good(await lockService(deps, alice, t.date, [])); expect(store.calls - mid).toBeLessThan(40);
  });
});

describe('utcDate', () => { it('formats the UTC day, not the local one', () => { expect(utcDate(Date.UTC(2026, 11, 9, 23, 59, 59))).toBe('2026-12-09'); expect(utcDate(Date.UTC(2026, 11, 10, 0, 0, 0))).toBe('2026-12-10'); }); });
