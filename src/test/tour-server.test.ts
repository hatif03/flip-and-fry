import { FakeStore } from './fake-store';
import { markTourSeen, tourSeen } from '@/server/core/tour';
import { getToday, type Deps } from '@/server/core/game';

describe('the guide remembers what it has shown, on the server', () => {
  it('marks allowlisted ids once, refuses others, and returns them with today', async () => {
    const store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12);
    expect(await tourSeen(store, 't2_a')).toEqual([]);
    const first = await markTourSeen(store, 't2_a', 'welcome');
    expect(first).toEqual({ ok: true, value: ['welcome'] });
    await markTourSeen(store, 't2_a', 'welcome'); await markTourSeen(store, 't2_a', 'lunch');
    expect(await tourSeen(store, 't2_a')).toEqual(['welcome', 'lunch']);
    expect(await markTourSeen(store, 't2_a', 'anything')).toMatchObject({ ok: false, status: 400 });
    expect(await tourSeen(store, 't2_b')).toEqual([]);
    const deps: Deps = { store, now: () => store.now };
    const today = await getToday(deps, { id: 't2_a', name: 'a' });
    expect(today.ok && today.value.tour).toEqual(['welcome', 'lunch']);
  });
  it('limits how fast a player can mark', async () => {
    const store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12);
    for (let i = 0; i < 60; i++) expect((await markTourSeen(store, 't2_a', 'done')).ok).toBe(true);
    expect(await markTourSeen(store, 't2_a', 'done')).toMatchObject({ ok: false, status: 429 });
  });
});
