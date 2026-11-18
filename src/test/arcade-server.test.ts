import { beforeEach, describe, expect, it } from 'vitest';
import { ARCADE_MAX_SCORE, emptyArcade, mergeArcade, type ArcadeSave } from '@/game/arcade-save';
import { loadArcade, saveArcade } from '@/server/core/arcade';
import type { Deps, Player } from '@/server/core/game';
import { FakeStore } from './fake-store';

const alice: Player = { id: 't2_alice', name: 'alice' }, bob: Player = { id: 't2_bob', name: 'bob' };
let store: FakeStore, deps: Deps;
const save = (solo: number[], coop = [0, 0, 0], hat = 'cream'): ArcadeSave => ({ progress: { solo, coop }, outfits: [{ hat, apron: 'cream' }, { hat: 'cream', apron: 'cream' }] } as ArcadeSave);
const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); deps = { store, now: () => store.now }; });

describe('the Test Kitchen save', () => {
  it('starts empty for a new player', async () => { expect(good(await loadArcade(deps, alice))).toEqual(emptyArcade()); });
  it('keeps what a player saved, per player', async () => {
    good(await saveArcade(deps, alice, save([120, 0, 0]))); good(await saveArcade(deps, bob, save([0, 90, 0])));
    expect(good(await loadArcade(deps, alice)).progress.solo).toEqual([120, 0, 0]); expect(good(await loadArcade(deps, bob)).progress.solo).toEqual([0, 90, 0]);
  });
  it('never lowers a best, and takes the newest outfit', async () => {
    good(await saveArcade(deps, alice, save([300, 200, 100], [50, 0, 0], 'cream')));
    const after = good(await saveArcade(deps, alice, save([100, 400, 0], [0, 0, 0], 'gold')));
    expect(after.progress).toEqual({ solo: [300, 400, 100], coop: [50, 0, 0] }); expect(after.outfits[0].hat).toBe('gold');
    expect(good(await loadArcade(deps, alice))).toEqual(after);
  });
  it('refuses scores that cannot be right, and saves nothing', async () => {
    for (const body of [save([ARCADE_MAX_SCORE + 1, 0, 0]), save([-1, 0, 0]), save([1.5, 0, 0]), save([1, 2]), { progress: { solo: [0, 0, 0] } }, save([0, 0, 0], [0, 0, 0], 'neon'), null, 'x'])
      expect(await saveArcade(deps, alice, body)).toMatchObject({ ok: false, status: 400 });
    expect(good(await loadArcade(deps, alice))).toEqual(emptyArcade());
  });
  it('accepts the highest allowed score and no more', async () => { expect(good(await saveArcade(deps, alice, save([ARCADE_MAX_SCORE, 0, 0]))).progress.solo[0]).toBe(ARCADE_MAX_SCORE); });
  it('reads a damaged stored value as empty rather than failing the player', async () => {
    await store.set('arcade:t2_alice', '{not json'); expect(good(await loadArcade(deps, alice))).toEqual(emptyArcade());
    await store.set('arcade:t2_alice', JSON.stringify({ progress: { solo: [1, 2, 3] } })); expect(good(await loadArcade(deps, alice))).toEqual(emptyArcade());
    expect(good(await saveArcade(deps, alice, save([5, 0, 0]))).progress.solo).toEqual([5, 0, 0]);
  });
  it('expires a year after the last save, not on the first', async () => {
    good(await saveArcade(deps, alice, save([5, 0, 0]))); expect(store.ttl('arcade:t2_alice')).toBeGreaterThan(399 * 86400);
  });
  it('is rate limited', async () => {
    for (let i = 0; i < 30; i++) await saveArcade(deps, alice, save([i, 0, 0]));
    expect(await saveArcade(deps, alice, save([99, 0, 0]))).toMatchObject({ ok: false, status: 429 });
  });
  it('merges two simultaneous saves without losing either best', async () => {
    await Promise.all([saveArcade(deps, alice, save([200, 0, 0])), saveArcade(deps, alice, save([0, 300, 0]))]);
    expect(good(await loadArcade(deps, alice)).progress.solo).toEqual([200, 300, 0]);
  });
});

describe('merging', () => {
  it('is symmetric for scores', () => { const a = save([1, 9, 3]), b = save([4, 2, 3]); expect(mergeArcade(a, b).progress).toEqual(mergeArcade(b, a).progress); });
});
