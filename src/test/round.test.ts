import { describe, expect, it } from 'vitest';
import { CRATE_AT, bumpRound, roundFor, roundView, tasksFor, weekOf, type Round } from '@/management/round';
import { FakeStore } from './fake-store';
import { awardXp, claimCrate, harvest, plant } from '@/server/core/world';
import { loadPark, type Deps } from '@/server/core/game';
import { loadWorld, saveWorld } from '@/server/core/worldstore';

describe('the daily round', () => {
  it('picks three different tasks a day, the same for everyone at a level, and one is always at the pass', () => {
    for (const date of ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10']) for (const level of [1, 2, 5]) {
      const t = tasksFor(date, level);
      expect(new Set(t.map(x => x.kind)).size).toBe(3);
      expect(t.some(x => ['serve', 'stars', 'combo'].includes(x.kind))).toBe(true);
      expect(tasksFor(date, level)).toEqual(t);
      if (level < 2) expect(t.some(x => x.kind === 'craft')).toBe(false);
    }
  });
  it('pays each task once, counts best-of for a single service, and counts full rounds toward the crate', () => {
    const date = '2026-12-09', tasks = tasksFor(date, 1);
    let r: Round | undefined, xp = 0;
    for (const t of tasks) for (let i = 0; i < 12; i++) { const b = bumpRound(r, date, 1, t.kind, t.kind === 'serve' || t.kind === 'combo' ? t.target : 1); r = b.round; xp += b.xp; }
    expect(xp).toBe(tasks.reduce((n, t) => n + t.xp, 0));
    expect(r!.done).toHaveLength(3); expect(r!.full).toBe(1);
    const view = roundView(r, date, 1); expect(view.tasks.every(t => t.done)).toBe(true); expect(view.crateReady).toBe(CRATE_AT <= 1);
    expect(roundFor(r, '2026-12-10', 1)).toMatchObject({ full: 1, done: [], date: '2026-12-10' });
    expect(roundFor(r, '2026-12-14', 1)).toMatchObject({ full: 0, week: '2026-12-14' });
    expect(weekOf('2026-12-13')).toBe('2026-12-07');
  });
  it('keeps the day’s tasks after a level-up', () => {
    const date = '2026-12-09', first = bumpRound(undefined, date, 1, 'plant', 1).round;
    expect(roundView(first, date, 4).tasks.map(t => t.kind)).toEqual(tasksFor(date, 1).map(t => t.kind));
  });
});

describe('the daily round on the server', () => {
  const alice = { id: 't2_alice', name: 'alice' };
  it('moves with garden actions and the replayed night, and opens the crate once a week', async () => {
    const store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12);
    const deps: Deps = { store, now: () => store.now }, rev = async () => { const p = await loadPark(deps, alice); if ('status' in p) throw new Error(); return p.rev; };
    const planted = await plant(deps, alice, await rev(), 0, 'tomato'); if ('error' in planted) throw new Error(planted.error);
    const round = (await loadWorld(store, alice.id)).round!;
    expect(round.date).toBe('2026-12-09');
    if (tasksFor('2026-12-09', 1).some(t => t.kind === 'plant')) expect(round.progress.plant).toBe(1);
    const gain = await awardXp(deps, alice.id, 10, { served: 20, stars: 3, chain: 9 });
    expect(gain.gained).toBeGreaterThan(10); // the pass task paid on top
    store.now += 25 * 60 * 1000; const picked = await harvest(deps, alice, await rev(), 0); if ('error' in picked) throw new Error(picked.error);
    expect(await claimCrate(deps, alice, await rev())).toMatchObject({ ok: false });
    const w = await loadWorld(store, alice.id); w.round = { ...w.round!, full: CRATE_AT }; await saveWorld(store, alice.id, w, store.now);
    const cash = (await loadPark(deps, alice) as { state: { cash: number } }).state.cash;
    const opened = await claimCrate(deps, alice, await rev()); if ('error' in opened) throw new Error(opened.error);
    expect(opened.value.park.cash).toBe(cash + 150);
    expect(await claimCrate(deps, alice, await rev())).toMatchObject({ ok: false });
  });
});
