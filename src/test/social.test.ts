import { beforeEach, describe, expect, it } from 'vitest';
import { cozyBot } from '@/management/bots';
import { receiptComment } from '@/management/social';
import { rollDay, POSTS_KEY, type PostApi } from '@/server/core/daily-post';
import { getToday, keys, lockService, openService, type Deps, type Player } from '@/server/core/game';
import { COMMENTS_KEY, commentDeleted, commentPreview, follow, postDeleted, postResult, wearFlair, type SocialApi } from '@/server/core/social';
import type { StoredRun } from '@/shared/api';
import { FakeStore } from './fake-store';

const alice: Player = { id: 't2_alice', name: 'alice' }, bob: Player = { id: 't2_bob', name: 'bob' };
let store: FakeStore, deps: Deps, calls: Array<{ kind: string; args: unknown[] }>, mode: { failComment?: boolean; failFlair?: boolean; failFollow?: boolean };
const api: SocialApi = {
  async comment(parentId, text) { calls.push({ kind: 'comment', args: [parentId, text] }); if (mode.failComment) throw new Error('down'); return { id: `t1_c${calls.length}` }; },
  async setFlair(username, text, background) { calls.push({ kind: 'flair', args: [username, text, background] }); if (mode.failFlair) throw new Error('no mod'); },
  async subscribe() { calls.push({ kind: 'subscribe', args: [] }); if (mode.failFollow) throw new Error('no'); },
};
const postApi: PostApi = { createPost: async () => ({ id: 't3_today' }), comment: async () => ({ id: 't1_sticky', makeSticky: async () => undefined }) };
const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };

async function finishedService(user = alice) {
  const t = good(await getToday(deps, user)), o = good(await openService(deps, user, t.rev, cozyBot.actions)); const locked = good(await lockService(deps, user, o.date, []));
  await rollDay(store, postApi, store.now, o.date); return locked;
}
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); deps = { store, now: () => store.now }; calls = []; mode = {}; });

describe('posting today\'s result', () => {
  it('needs a finished service first, and today\'s post to exist', async () => {
    expect(await postResult(deps, api, alice)).toMatchObject({ ok: false, status: 409, error: 'Finish a service today to post a result.' });
    const t = good(await getToday(deps, alice)); good(await openService(deps, alice, t.rev, cozyBot.actions)); await lockService(deps, alice, t.date, []);
    expect(await postResult(deps, api, alice)).toMatchObject({ ok: false, status: 409, error: 'Today’s post is not ready yet.' }); expect(calls).toEqual([]);
  });
  it('replies to the sticky comment with the canned line built from the real receipt', async () => {
    const locked = await finishedService(), r = good(await postResult(deps, api, alice));
    expect(calls).toHaveLength(1); expect(calls[0].args[0]).toBe('t1_sticky');
    expect(r.text).toBe(receiptComment({ name: 'Little Rooftop', style: 'Garden & Grill', award: locked.night.award.title, rating: locked.report.rating, streak: locked.streak }));
    expect(r.text).toMatch(/rating \d\.\d/);
  });
  it('makes it a top-level comment on the post when the player adds a note, and shows the note under the canned line', async () => {
    await finishedService(); const r = good(await postResult(deps, api, alice, '  Great night,   thanks!  '));
    expect(calls[0].args[0]).toBe('t3_today'); expect(r.text.endsWith('\n\nGreat night, thanks!')).toBe(true);
  });
  it('previews exactly what will be posted', async () => {
    await finishedService(); const preview = good(await commentPreview(deps, alice, 'hello')), posted = good(await postResult(deps, api, alice, 'hello'));
    expect(preview.text).toBe(posted.text); expect(preview.reply).toBe(false); expect(calls).toHaveLength(1); // previewing posted nothing
  });
  it('refuses a note with a link or a mention, without calling Reddit', async () => {
    await finishedService();
    for (const note of ['look https://x.com', 'thanks u/bob', 'x'.repeat(81)]) expect(await postResult(deps, api, alice, note)).toMatchObject({ ok: false, status: 400 });
    expect(calls).toEqual([]);
  });
  it('is one a day: a second tap, even a simultaneous one, cannot post twice', async () => {
    await finishedService();
    const both = await Promise.all([postResult(deps, api, alice), postResult(deps, api, alice)]);
    expect(both.filter(r => 'value' in r)).toHaveLength(1); expect(calls.filter(c => c.kind === 'comment')).toHaveLength(1);
    expect(await postResult(deps, api, alice)).toMatchObject({ ok: false, status: 409, error: 'You already posted today’s result.' });
  });
  it('lets the player try again if Reddit failed, and records the comment id when it works', async () => {
    await finishedService(); mode.failComment = true;
    expect(await postResult(deps, api, alice)).toMatchObject({ ok: false, status: 500 }); mode.failComment = false;
    const r = good(await postResult(deps, api, alice)); const run = JSON.parse((await store.hGet(keys.runs('2026-12-09'), alice.id))!) as StoredRun;
    expect(run.commentId).toBe(r.commentId); expect(await store.hGet(COMMENTS_KEY, r.commentId)).toBe(`${alice.id}:2026-12-09`);
  });
  it('is per player', async () => {
    await finishedService(alice); await finishedService(bob); good(await postResult(deps, api, alice)); good(await postResult(deps, api, bob)); expect(calls).toHaveLength(2);
  });
  it('is rate limited', async () => {
    await finishedService(); mode.failComment = true;
    for (let i = 0; i < 6; i++) await postResult(deps, api, alice);
    expect(await postResult(deps, api, alice)).toMatchObject({ ok: false, status: 429 });
  });
});

describe('wearing flair', () => {
  it('needs a streak first, and never rewards a comment or a vote', async () => {
    expect(await wearFlair(deps, api, alice)).toMatchObject({ ok: false, status: 409 }); expect(calls).toEqual([]);
  });
  it('sets the tier from the real streak, in the tomato colour', async () => {
    await finishedService(); const r = good(await wearFlair(deps, api, alice));
    expect(r.text).toBe('Opened the doors'); expect(calls[0]).toEqual({ kind: 'flair', args: ['alice', 'Opened the doors', '#DC533C'] });
  });
  it('reports a failure to set flair instead of pretending it worked', async () => { await finishedService(); mode.failFlair = true; expect(await wearFlair(deps, api, alice)).toMatchObject({ ok: false, status: 500 }); });
});

describe('following', () => {
  it('subscribes as its own action and remembers it for 30 days', async () => {
    good(await follow(deps, api, alice)); expect(calls).toEqual([{ kind: 'subscribe', args: [] }]);
    expect(await store.get(`subscribed:${alice.id}`)).toBe('1'); expect(store.ttl(`subscribed:${alice.id}`)).toBeGreaterThan(29 * 86400);
  });
  it('is available without playing, because nothing gates on it', async () => { expect(await follow(deps, api, bob)).toMatchObject({ ok: true }); });
  it('reports a failure and stores nothing', async () => { mode.failFollow = true; expect(await follow(deps, api, alice)).toMatchObject({ ok: false, status: 500 }); expect(await store.get(`subscribed:${alice.id}`)).toBeUndefined(); });
});

describe('deletion', () => {
  it('a deleted comment is forgotten and the player may post again; deleting twice changes nothing', async () => {
    await finishedService(); const r = good(await postResult(deps, api, alice));
    await commentDeleted(deps, r.commentId); await commentDeleted(deps, r.commentId);
    expect(await store.hGet(COMMENTS_KEY, r.commentId)).toBeUndefined(); expect((JSON.parse((await store.hGet(keys.runs('2026-12-09'), alice.id))!) as StoredRun).commentId).toBeUndefined();
    expect(good(await postResult(deps, api, alice)).commentId).not.toBe(r.commentId);
  });
  it('an unknown comment id is ignored', async () => { await commentDeleted(deps, 't1_nope'); expect(store.keys()).toEqual([]); });
  it('a deleted daily post is dropped so the next request makes a fresh one', async () => {
    await rollDay(store, postApi, store.now, '2026-12-09'); expect(await store.hGet(POSTS_KEY, '2026-12-09')).toBeDefined();
    await postDeleted(deps, 't3_today'); await postDeleted(deps, 't3_today'); expect(await store.hGet(POSTS_KEY, '2026-12-09')).toBeUndefined();
    expect(await rollDay(store, postApi, store.now, '2026-12-09')).toMatchObject({ ok: true, created: true });
  });
  it('leaves other days and other posts alone', async () => {
    await rollDay(store, postApi, store.now, '2026-12-09'); await postDeleted(deps, 't3_other'); expect(await store.hGet(POSTS_KEY, '2026-12-09')).toBeDefined();
  });
});
