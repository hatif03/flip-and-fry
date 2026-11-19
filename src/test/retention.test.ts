import { beforeEach, describe, expect, it } from 'vitest';
import { getToday, type Deps, type Player } from '@/server/core/game';
import { retentionLine, retentionReport } from '@/server/core/retention';
import { FakeStore } from './fake-store';

let store: FakeStore, deps: Deps;
const DAY = 86400000, users = (n: number): Player[] => Array.from({ length: n }, (_, i) => ({ id: `t2_u${i}`, name: `user${i}` }));
const at = (day: number) => { store.now = Date.UTC(2026, 11, 1 + day, 12); };
const visit = async (p: Player, day: number) => { at(day); const r = await getToday(deps, p); if ('error' in r) throw new Error(r.error); };
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 1, 12); deps = { store, now: () => store.now }; });

describe('the moderators\' retention report', () => {
  it('is all empty before anyone has played, and says n/a', async () => {
    const r = await retentionReport(deps); expect(r).toMatchObject({ players: 0, dau: 0, mau: 0, d1: null, d7: null, d30: null, churn: null });
    expect(retentionLine(r)).toContain('D1 n/a');
  });
  it('counts D1 and D7 only for players old enough, and never for a day still going', async () => {
    const [a, b, c] = users(3);
    await visit(a, 0); await visit(b, 0); await visit(c, 7);       // a, b first seen on day 0; c on day 7
    await visit(a, 1); await visit(a, 7);                          // a returns on day 1 and day 7; b never
    at(7); const r = await retentionReport(deps);                  // "today" is day 7
    expect(r.players).toBe(3); expect(r.eligible.d1).toBe(2); expect(r.d1).toBe(0.5);   // a yes, b no; c is too new
    expect(r.eligible.d7).toBe(0); expect(r.d7).toBeNull();        // day 7 is today: not yet complete
    at(8); const next = await retentionReport(deps); expect(next.eligible.d7).toBe(2); expect(next.d7).toBe(0.5);
  });
  it('reports DAU, MAU and lapsed players, from ids only', async () => {
    const [a, b, c] = users(3);
    await visit(a, 0); await visit(b, 0); await visit(c, 0); await visit(a, 9); await visit(b, 9);
    at(9); const r = await retentionReport(deps);
    expect(r.dau).toBe(2); expect(r.mau).toBe(3); expect(r.churn).toBeCloseTo(1 / 3, 2); expect(r.returning).toBeCloseTo(2 / 3, 2);
    expect(JSON.stringify(r)).not.toMatch(/user\d|t2_/); expect(retentionLine(r)).not.toMatch(/user\d|t2_/);
  });
  it('lets old days expire: activity is kept 40 days and the cohort list 150', async () => {
    const [a] = users(1); await visit(a, 0); at(41); expect(Object.keys(await store.hGetAll('active:2026-12-01'))).toEqual([]); expect(Object.keys(await store.hGetAll('cohort:first'))).toEqual([a.id]);
    store.now += DAY * 120; expect(Object.keys(await store.hGetAll('cohort:first'))).toEqual([]);
  });
});
