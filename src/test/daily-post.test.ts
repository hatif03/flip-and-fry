import { beforeEach, describe, expect, it } from 'vitest';
import { CLAIM_STALE_MS, POSTS_KEY, postContent, rollDay, type PostApi } from '@/server/core/daily-post';
import { FakeStore } from './fake-store';

let store: FakeStore, created: Array<{ title: string; postData: Record<string, string>; textFallback: string; flairText?: string }>, comments: string[], stickies: number;
let behaviour: { failPost?: boolean; failFlair?: boolean; failComment?: boolean; failSticky?: boolean; delay?: () => Promise<void> };
const api: PostApi = {
  async createPost(options) {
    await behaviour.delay?.();
    if (behaviour.failPost) throw new Error('reddit is down');
    if (behaviour.failFlair && options.flairText) throw new Error('no flair template');
    created.push(options); return { id: `t3_post${created.length}` };
  },
  async comment(postId, text) {
    if (behaviour.failComment) throw new Error('comment failed');
    comments.push(`${postId}:${text}`);
    return { id: `t1_sticky${comments.length}`, makeSticky: async () => { if (behaviour.failSticky) throw new Error('not a mod'); stickies++; } };
  },
};
const DATE = '2026-12-09';
beforeEach(() => { store = new FakeStore(); created = []; comments = []; stickies = 0; behaviour = {}; });

describe('rollDay', () => {
  it('creates the post, a sticky comment and remembers both', async () => {
    const r = await rollDay(store, api, store.now, DATE);
    expect(r).toMatchObject({ ok: true, postId: 't3_post1', stickyId: 't1_sticky1', created: true });
    expect(created).toHaveLength(1); expect(comments).toEqual(['t3_post1:Results for today go under this comment.']); expect(stickies).toBe(1);
    expect(JSON.parse((await store.hGet(POSTS_KEY, DATE))!)).toEqual({ postId: 't3_post1', stickyId: 't1_sticky1' });
  });
  it('is idempotent: a second call finds the post and creates nothing', async () => {
    await rollDay(store, api, store.now, DATE);
    expect(await rollDay(store, api, store.now + 1000, DATE)).toMatchObject({ ok: true, postId: 't3_post1', created: false }); expect(created).toHaveLength(1);
  });
  it('twenty simultaneous requests create exactly one post (the cron, the menu and players can all race)', async () => {
    behaviour.delay = () => new Promise(resolve => setTimeout(resolve, 5));
    const results = await Promise.all(Array.from({ length: 20 }, () => rollDay(store, api, store.now, DATE)));
    expect(created).toHaveLength(1); expect(comments).toHaveLength(1);
    expect(results.filter(r => 'created' in r && r.created)).toHaveLength(1);
    expect(results.every(r => !('error' in r) || r.busy)).toBe(true); // the losers either saw the finished post or were told it is being made
    expect(await rollDay(store, api, store.now, DATE)).toMatchObject({ ok: true, postId: 't3_post1' });
  });
  it('keeps each date separate', async () => {
    await rollDay(store, api, store.now, DATE); await rollDay(store, api, store.now, '2026-12-10');
    expect(created.map(c => c.postData.date)).toEqual([DATE, '2026-12-10']);
  });
});

describe('failures', () => {
  it('releases the claim when Reddit fails, so the next request can retry', async () => {
    behaviour.failPost = true;
    expect(await rollDay(store, api, store.now, DATE)).toMatchObject({ ok: false, busy: false, error: 'reddit is down' });
    expect(await store.hGet(POSTS_KEY, DATE)).toBeUndefined();
    behaviour.failPost = false; expect(await rollDay(store, api, store.now, DATE)).toMatchObject({ ok: true, created: true });
  });
  it('retries without flair when the flair template is missing, because the post matters more', async () => {
    behaviour.failFlair = true;
    expect(await rollDay(store, api, store.now, DATE)).toMatchObject({ ok: true, created: true });
    expect(created).toHaveLength(1); expect(created[0].flairText).toBeUndefined();
  });
  it('still returns a playable post when the sticky comment cannot be made or pinned', async () => {
    behaviour.failComment = true; expect(await rollDay(store, api, store.now, DATE)).toMatchObject({ ok: true, stickyId: null, created: true });
    store = new FakeStore(); behaviour = { failSticky: true }; expect(await rollDay(store, api, store.now, DATE)).toMatchObject({ ok: true, stickyId: 't1_sticky1' });
  });
  it('tells a request that arrives while another is creating the post to wait, and takes over a dead claim', async () => {
    await store.hSet(POSTS_KEY, { [DATE]: `pending:${store.now}` });
    expect(await rollDay(store, api, store.now + 1000, DATE)).toMatchObject({ ok: false, busy: true });
    expect(await rollDay(store, api, store.now + CLAIM_STALE_MS + 1, DATE)).toMatchObject({ ok: true, created: true });
    expect(created).toHaveLength(1);
  });
  it('a corrupt stored value reads as a dead claim and heals itself instead of leaving the day without a post', async () => {
    await store.hSet(POSTS_KEY, { [DATE]: '{broken' });
    expect(await rollDay(store, api, store.now, DATE)).toMatchObject({ ok: true, created: true }); expect(created).toHaveLength(1);
    expect(JSON.parse((await store.hGet(POSTS_KEY, DATE))!).postId).toBe('t3_post1');
  });
});

describe('post content', () => {
  it('carries the headline in postData (under 2 KB) so the splash needs no server call', () => {
    const c = postContent(DATE);
    expect(c.postData).toEqual({ date: DATE, headline: 'rain', title: 'Rain on the roof' }); expect(JSON.stringify(c.postData).length).toBeLessThan(2048);
    expect(c.title).toBe('Today on the roof · Wed 9 Dec');
  });
  it('has a text fallback for old Reddit and search that names the date and headline and never mentions Reddit branding', () => {
    const c = postContent(DATE);
    expect(c.textFallback).toContain('Wed 9 Dec'); expect(c.textFallback).toContain('Rain on the roof'); expect(c.textFallback.length).toBeLessThan(40_000);
    expect(c.textFallback + c.title).not.toMatch(/karma|snoo/i);
  });
});
