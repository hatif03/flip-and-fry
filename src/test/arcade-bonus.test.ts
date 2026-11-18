import { beforeEach, describe, expect, it } from 'vitest';
import { shiftOfDay } from '@/arcade/daily-shift';
import { BONUS_MAX, BONUS_PER_STAR, totalStars, type ArcadeSave } from '@/game/arcade-save';
import { cozyBot } from '@/management/bots';
import { pendingBonus, pendingKey, saveArcade } from '@/server/core/arcade';
import { getToday, lockService, openService, type Deps, type Player } from '@/server/core/game';
import { FakeStore } from './fake-store';

const alice: Player = { id: 't2_alice', name: 'alice' };
let store: FakeStore, deps: Deps;
// Golden Hour solo targets are 180, 300 and 420; Dinner Rush solo 240, 390, 540.
const save = (solo: number[], coop = [0, 0, 0]): ArcadeSave => ({ progress: { solo, coop }, outfits: [{ hat: 'cream', apron: 'cream' }, { hat: 'cream', apron: 'cream' }] } as ArcadeSave);
const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 12 - 1, 9, 12); deps = { store, now: () => store.now }; });

describe('counting stars', () => {
  it('counts every shift in both modes', () => { expect(totalStars({ solo: [0, 0, 0], coop: [0, 0, 0] })).toBe(0); expect(totalStars({ solo: [180, 0, 0], coop: [0, 0, 0] })).toBe(1); expect(totalStars({ solo: [420, 390, 0], coop: [700, 0, 0] })).toBe(3 + 2 + 3); });
});

describe('the research bonus from the Test Kitchen', () => {
  it('pays five a star for newly earned stars, waits for the next Open, and says how much was earned', async () => {
    expect(good(await saveArcade(deps, alice, save([180, 0, 0]))).bonus).toBe(BONUS_PER_STAR); expect(await pendingBonus(deps, alice)).toBe(BONUS_PER_STAR);
  });
  it('is capped, and only once a day', async () => {
    expect(good(await saveArcade(deps, alice, save([420, 390, 0]))).bonus).toBe(BONUS_MAX); // five stars, capped
    expect(good(await saveArcade(deps, alice, save([420, 540, 0]))).bonus).toBe(0); // more stars the same day: nothing more
    expect(await pendingBonus(deps, alice)).toBe(BONUS_MAX);
    store.now += 86400_000; expect(good(await saveArcade(deps, alice, save([420, 540, 0], [700, 0, 0]))).bonus).toBeGreaterThan(0);
  });
  it('is never paid for a score that earns no new star, or for a lower score', async () => {
    good(await saveArcade(deps, alice, save([200, 0, 0]))); store.now += 86400_000;
    expect(good(await saveArcade(deps, alice, save([250, 0, 0]))).bonus).toBe(0); expect(good(await saveArcade(deps, alice, save([100, 0, 0]))).bonus).toBe(0);
  });
  it('is paid to the player who earned it, and nobody else', async () => { good(await saveArcade(deps, alice, save([180, 0, 0]))); expect(await pendingBonus(deps, { id: 't2_bob', name: 'bob' })).toBe(0); });
  it('goes into the park with the next Open, once, and the replay starts from it', async () => {
    good(await saveArcade(deps, alice, save([180, 0, 0])));
    const t = good(await getToday(deps, alice)), o = good(await openService(deps, alice, t.rev, cozyBot.actions));
    expect(o.snapshot.research.points).toBe(BONUS_PER_STAR); expect(await pendingBonus(deps, alice)).toBe(0);
    const locked = good(await lockService(deps, alice, o.date, [])); expect(locked.park.research.points).toBe(BONUS_PER_STAR);
    store.now += 86400_000; const t2 = good(await getToday(deps, alice)), o2 = good(await openService(deps, alice, t2.rev, [])); expect(o2.snapshot.research.points).toBe(BONUS_PER_STAR); // not paid twice
  });
  it('is kept if the Open fails, and paid at the next one', async () => {
    good(await saveArcade(deps, alice, save([180, 0, 0]))); const t = good(await getToday(deps, alice));
    expect(await openService(deps, alice, t.rev + 5, [])).toMatchObject({ ok: false }); expect(await pendingBonus(deps, alice)).toBe(BONUS_PER_STAR);
  });
  it('ignores a damaged or absurd pending value', async () => {
    await store.set(pendingKey(alice.id), 'lots'); expect(await pendingBonus(deps, alice)).toBe(0); await store.set(pendingKey(alice.id), '9999'); expect(await pendingBonus(deps, alice)).toBe(50);
  });
});

describe('today\'s shift', () => {
  const all = () => true, onlyFirst = (l: number) => l === 0;
  it('is the same for everyone on a date, and moves through the three shifts', () => {
    const picks = ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11', '2026-12-12'].map(d => shiftOfDay(d, all));
    expect(new Set(picks).size).toBe(3); expect(picks.every(l => l >= 0 && l <= 2)).toBe(true); expect(shiftOfDay('2026-12-09', all)).toBe(shiftOfDay('2026-12-09', all));
  });
  it('never offers a shift the player has not unlocked', () => {
    for (const d of ['2026-12-07', '2026-12-08', '2026-12-09']) expect(shiftOfDay(d, onlyFirst)).toBe(0);
    expect(shiftOfDay('2026-12-09', l => l <= 1)).toBeLessThanOrEqual(1);
  });
});
