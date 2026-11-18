import { beforeEach, describe, expect, it } from 'vitest';
import { arcadeComment } from '@/game/arcade-comment';
import { rollDay, type PostApi } from '@/server/core/daily-post';
import { saveArcade } from '@/server/core/arcade';
import type { Deps, Player } from '@/server/core/game';
import { arcadePreview, postArcadeResult, type SocialApi } from '@/server/core/social';
import { FakeStore } from './fake-store';

const alice: Player = { id: 't2_alice', name: 'alice' };
let store: FakeStore, deps: Deps, comments: Array<{ parent: string; text: string }>, fail: boolean;
const api: SocialApi = { comment: async (parent, text) => { comments.push({ parent, text }); if (fail) throw new Error('down'); return { id: `t1_c${comments.length}` }; }, setFlair: async () => undefined, subscribe: async () => undefined };
const postApi: PostApi = { createPost: async () => ({ id: 't3_today' }), comment: async () => ({ id: 't1_sticky', makeSticky: async () => undefined }) };
const save = (solo: number[]) => ({ progress: { solo, coop: [0, 0, 0] }, outfits: [{ hat: 'cream', apron: 'cream' }, { hat: 'cream', apron: 'cream' }] });
const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };
beforeEach(async () => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); deps = { store, now: () => store.now }; comments = []; fail = false; await rollDay(store, postApi, store.now, '2026-12-09'); });

describe('the line for a Test Kitchen result', () => {
  it('names the shift, the mode, the best and the stars', () => {
    expect(arcadeComment(0, 'solo', 300)).toBe('Test Kitchen · Golden Hour · solo · best 300 points · 2 stars'); expect(arcadeComment(1, 'coop', 0)).toBe('Test Kitchen · Dinner Rush · two chefs · best 0 points · 0 stars');
    expect(arcadeComment(0, 'solo', 180)).toContain('1 star');
  });
});

describe('posting it', () => {
  it('needs a played shift, and a shift that exists', async () => {
    expect(await arcadePreview(deps, alice, 0, 'solo')).toMatchObject({ ok: false, status: 409, error: 'Play that shift first.' });
    for (const [l, m] of [[5, 'solo'], [-1, 'solo'], [0.5, 'solo'], [0, 'quad'], ['0', 'solo'], [null, null]] as const) expect(await arcadePreview(deps, alice, l, m), `${l} ${m}`).toMatchObject({ ok: false, status: 400 });
  });
  it('builds the text from the saved best, so a number from the browser can never be posted', async () => {
    good(await saveArcade(deps, alice, save([300, 0, 0]))); const text = good(await arcadePreview(deps, alice, 0, 'solo')); expect(text).toBe('Test Kitchen · Golden Hour · solo · best 300 points · 2 stars');
    const r = good(await postArcadeResult(deps, api, alice, 0, 'solo')); expect(r.text).toBe(text); expect(comments).toEqual([{ parent: 't1_sticky', text }]);
  });
  it('is once a day, even for two taps at once, and separate from the restaurant result', async () => {
    good(await saveArcade(deps, alice, save([300, 0, 0])));
    const both = await Promise.all([postArcadeResult(deps, api, alice, 0, 'solo'), postArcadeResult(deps, api, alice, 0, 'solo')]);
    expect(both.filter(r => 'value' in r)).toHaveLength(1); expect(comments).toHaveLength(1);
    expect(await postArcadeResult(deps, api, alice, 0, 'solo')).toMatchObject({ ok: false, status: 409, error: 'You already posted a Test Kitchen result today.' });
  });
  it('lets the player try again after a Reddit failure, and waits for today\'s post', async () => {
    good(await saveArcade(deps, alice, save([300, 0, 0]))); fail = true; expect(await postArcadeResult(deps, api, alice, 0, 'solo')).toMatchObject({ ok: false, status: 500 });
    fail = false; good(await postArcadeResult(deps, api, alice, 0, 'solo'));
    store.now += 86400_000; expect(await postArcadeResult(deps, api, alice, 0, 'solo')).toMatchObject({ ok: false, status: 409, error: 'Today’s post is not ready yet.' });
  });
});
