import { beforeEach, describe, expect, it } from 'vitest';
import { createDailyHeadline } from '@/management/daily-headline';
import { runService, type Action } from '@/management/replay';
import { evaluateStars, goalText, LUNCH_STARS } from '@/management/stars';
import { billsTonight } from '@/management/bills';
import { createRestaurant, shiftLength, SHIFT_SECONDS } from '@/management/types';
import { getBoard } from '@/server/core/board';
import { getToday, keys, lockService, openService, weekStars, type Deps, type Player } from '@/server/core/game';
import { FakeStore } from './fake-store';

const lunch: Action = { tick: 0, kind: 'shift', shift: 'lunch' };
const ok = (r: ReturnType<typeof runService>) => { if ('error' in r) throw new Error(r.error); return r; };
const headline = createDailyHeadline('2026-12-09');

describe('a lunch is a shorter night, decided by the opening snapshot', () => {
  it('lengths: lunch 60 s, dinner 150 s, and the starter restaurant is a dinner', () => {
    expect(SHIFT_SECONDS).toEqual({ lunch: 60, dinner: 150 }); expect(shiftLength(createRestaurant())).toBe(150);
  });
  it('closes about 60 s in, serves a handful, and pays 40% of the day\'s bills', () => {
    const dinner = ok(runService(createRestaurant(), [], headline)), short = ok(runService(createRestaurant(), [lunch], headline));
    expect(short.state.shift).toBe('lunch'); expect(short.ticks).toBeLessThan(dinner.ticks); expect(short.report.served).toBeGreaterThanOrEqual(3); expect(short.report.served).toBeLessThan(dinner.report.served);
    expect(dinner.report.wages + dinner.report.rent).toBe(90); expect(short.report.wages + short.report.rent).toBe(36);
  });
  it('a lunch has no daily challenges, and its bills line matches what is charged', () => {
    const short = ok(runService(createRestaurant(), [lunch], headline));
    expect(short.report.challenges).toEqual([]);
    expect(billsTonight({ ...createRestaurant(), shift: 'lunch' }).total).toBe(short.report.wages + short.report.rent + short.report.debtPayment);
  });
  it('replays the same lunch to the same hash', () => {
    expect(ok(runService(createRestaurant(), [lunch], headline)).hash).toBe(ok(runService(createRestaurant(), [lunch], headline)).hash);
  });
  it('the shift can only be chosen while planning', () => {
    const s = createRestaurant(); expect(runService(s, [lunch, { tick: 5, kind: 'shift', shift: 'dinner' } as unknown as Action], headline)).toMatchObject({ ok: false });
  });
});

describe('lunch stars', () => {
  const report = (o: Partial<{ served: number; profit: number; rating: number }>) => ({ ...ok(runService(createRestaurant(), [lunch], headline)).report, ...o });
  const h = ok(runService(createRestaurant(), [lunch], headline)).state.headline!;
  it('1 for serving five in profit, 2 for a rating of 4, 3 for a chain of four', () => {
    expect(evaluateStars(report({ served: 4 }), h, null, 1, 'lunch').stars).toBe(0);
    expect(evaluateStars(report({ served: 5, profit: 10, rating: 3.5 }), h, null, 1, 'lunch').stars).toBe(1);
    expect(evaluateStars(report({ served: 5, profit: 10, rating: 4.2 }), h, null, 1, 'lunch').stars).toBe(2);
    expect(evaluateStars(report({ served: 5, profit: 10, rating: 4.2 }), h, null, 1, 'lunch', 4).stars).toBe(3);
  });
  it('shows the lunch goal text on every night, not the first-week one', () => { expect(goalText('critic', 9, 'lunch')).toBe(LUNCH_STARS[0]); expect(goalText('critic', 1)).toBe('Serve 8 guests'); });
});

describe('the server keeps lunch and dinner apart', () => {
  const alice: Player = { id: 't2_alice', name: 'alice' };
  let store: FakeStore, deps: Deps;
  beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); deps = { store, now: () => store.now }; });
  const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };
  const play = async (actions: Action[], shift: 'lunch' | 'dinner') => { const t = good(await getToday(deps, alice)), o = good(await openService(deps, alice, t.rev, actions)); return good(await lockService(deps, alice, o.date, [], shift)); };

  it('stores each result under its own key, and the same day can hold both', async () => {
    const lunchLock = await play([lunch], 'lunch'), dinnerLock = await play([{ tick: 0, kind: 'shift', shift: 'dinner' }], 'dinner');
    expect(lunchLock.shift).toBe('lunch'); expect(dinnerLock.shift).toBe('dinner');
    expect(await store.hGet(keys.runs('2026-12-09', 'lunch'), alice.id)).toBeDefined(); expect(await store.hGet(keys.runs('2026-12-09'), alice.id)).toBeDefined();
    const today = good(await getToday(deps, alice)); expect(today.lunchRun?.shift).toBe('lunch'); expect(today.run?.shift).toBe('dinner');
  });
  it('a lunch is its own board, and its star counts toward the week', async () => {
    const l = await play([lunch], 'lunch');
    expect(good(await getBoard(deps, alice, '2026-12-09', 'lunch')).entries).toHaveLength(1); expect(good(await getBoard(deps, alice, '2026-12-09')).entries).toHaveLength(0);
    expect((await weekStars(store, alice.id, '2026-12-09')).stars).toBe(l.stars.stars);
  });
  it('a lunch left open comes back as the open service after a reload', async () => {
    const t = good(await getToday(deps, alice)); good(await openService(deps, alice, t.rev, [lunch]));
    const again = good(await getToday(deps, alice)); expect(again.open?.snapshot.shift).toBe('lunch');
  });
});
