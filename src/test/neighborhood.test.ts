import { beforeEach, describe, expect, it } from 'vitest';
import { cozyBot, bareBot } from '@/management/bots';
import { POSTS_KEY, rollDay, type PostApi } from '@/server/core/daily-post';
import { getToday, keys, lockService, openService, type Deps, type Player } from '@/server/core/game';
import { NEIGHBORHOOD_MAX, neighborhoodName, neighborhoodProblem, postNightReport, reportKey, reportText, tally } from '@/server/core/neighborhood';
import { settingsRoutes } from '@/server/routes/settings';
import { FakeStore } from './fake-store';

const DAY = '2026-12-09', alice: Player = { id: 't2_alice', name: 'alice' }, bob: Player = { id: 't2_bob', name: 'bob' }, cara: Player = { id: 't2_cara', name: 'cara' };
let store: FakeStore, deps: Deps, comments: Array<{ postId: string; text: string }>, highlighted: string[], failComment: boolean;
const api: PostApi = {
  createPost: async () => ({ id: 't3_today' }),
  comment: async (postId, text) => { comments.push({ postId, text }); if (failComment) throw new Error('down'); return { id: `t1_c${comments.length}`, makeSticky: async () => undefined }; },
  highlight: async postId => { highlighted.push(postId); },
};
const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };
async function play(user: Player, actions = cozyBot.actions) { const t = good(await getToday(deps, user)), o = good(await openService(deps, user, t.rev, actions)); return good(await lockService(deps, user, o.date, [])); }
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); deps = { store, now: () => store.now }; comments = []; highlighted = []; failComment = false; });

describe('the neighborhood name', () => {
  it('accepts a plain name and tidies spaces', () => { expect(neighborhoodName('  Maple   Street ')).toBe('Maple Street'); expect(neighborhoodName('Maple\nStreet')).toBe('Maple Street'); expect(neighborhoodName('Café d\'Or')).toBe('Café d\'Or'); });
  it('refuses anything else, so the daily bar can never carry a link or markup', () => {
    for (const bad of ['', '   ', 'x'.repeat(NEIGHBORHOOD_MAX + 1), 'visit https://x.com', '<b>hi</b>', 'a/b', 'u/someone', 5, null, undefined]) expect(neighborhoodName(bad), String(bad)).toBeNull();
  });
  it('explains a bad value to the moderator, and lets an empty setting through', () => {
    expect(neighborhoodProblem('bad/name')).toMatch(/letters, numbers/i); expect(neighborhoodProblem('')).toBeUndefined(); expect(neighborhoodProblem(undefined)).toBeUndefined(); expect(neighborhoodProblem('Maple Street')).toBeUndefined();
  });
  it('is checked by the settings endpoint the moderator form calls', async () => {
    const post = (value: unknown) => Promise.resolve(settingsRoutes.request('/validate-neighborhood', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value, isEditing: false }) })).then(r => r.json());
    expect(await post('Maple Street')).toEqual({ success: true }); expect(await post('a/b')).toMatchObject({ success: false, error: expect.stringContaining('Use letters') });
    const bad = await settingsRoutes.request('/validate-neighborhood', { method: 'POST', body: 'nope' }); expect(await bad.json()).toEqual({ success: true });
  });
});

describe('the night report', () => {
  it('counts only what the receipts say', async () => {
    await rollDay(store, api, store.now, DAY); await play(alice); await play(bob); await play(cara, bareBot.actions);
    const t = await tally(deps, DAY);
    expect(t.kitchens).toBe(3); expect(t.opens).toBe(3); expect(t.served).toBeGreaterThan(10); expect(t.topAward?.count).toBeGreaterThanOrEqual(1); expect(t.best?.name).toBe('Little Rooftop');
  });
  it('reads as a short list with tomorrow\'s headline, and says so when nobody played', async () => {
    const empty = reportText(DAY, await tally(deps, DAY)); expect(empty).toContain('No kitchen closed its doors'); expect(empty).toContain('Tomorrow: Thu 10 Dec'); expect(empty).not.toContain('- ');
    await play(alice); const full = reportText(DAY, await tally(deps, DAY));
    expect(full).toMatch(/- 1 kitchen closed the night and served \d+ guests/); expect(full).toContain('Best night: Little Rooftop, rating'); expect(full).toContain('Wed 9 Dec · Rain on the roof');
  });
  it('never names a player: only the restaurant name appears', async () => {
    await play(alice); const text = reportText(DAY, await tally(deps, DAY)); expect(text).not.toMatch(/alice|t2_|u\//i);
  });
  it('posts under that day\'s post, once, however many callers race', async () => {
    await rollDay(store, api, store.now, DAY); await play(alice);
    const results = await Promise.all([postNightReport(deps, api, DAY), postNightReport(deps, api, DAY), postNightReport(deps, api, DAY)]);
    expect(results.filter(r => r === 'posted')).toHaveLength(1); expect(results.filter(r => r === 'already')).toHaveLength(2);
    const reports = comments.filter(c => c.text.startsWith('**Last night')); expect(reports).toHaveLength(1); expect(reports[0].postId).toBe('t3_today');
    expect(await postNightReport(deps, api, DAY)).toBe('already');
  });
  it('has nothing to say when the day had no post', async () => { expect(await postNightReport(deps, api, DAY)).toBe('no-post'); expect(comments).toEqual([]); });
  it('releases the claim when Reddit fails, so a later call can try again', async () => {
    await rollDay(store, api, store.now, DAY); failComment = true;
    expect(await postNightReport(deps, api, DAY)).toBe('failed'); expect(await store.hGet(reportKey(DAY), 'claim')).toBeUndefined();
    failComment = false; expect(await postNightReport(deps, api, DAY)).toBe('posted');
  });
  it('treats a damaged post record as no post', async () => { await store.hSet(POSTS_KEY, { [DAY]: '{broken' }); expect(await postNightReport(deps, api, DAY)).toBe('no-post'); });
  it('expires, so reports do not pile up', async () => { await rollDay(store, api, store.now, DAY); await postNightReport(deps, api, DAY); expect(store.ttl(reportKey(DAY))).toBeGreaterThan(40 * 86400); });
});

describe('highlighting today\'s post', () => {
  it('is asked for once, after the post exists', async () => { await rollDay(store, api, store.now, DAY); expect(highlighted).toEqual(['t3_today']); await rollDay(store, api, store.now, DAY); expect(highlighted).toEqual(['t3_today']); });
  it('never stops the post if Reddit refuses', async () => {
    const strict: PostApi = { ...api, highlight: async () => { throw new Error('not a moderator'); } };
    expect(await rollDay(store, strict, store.now, DAY)).toMatchObject({ ok: true, created: true });
  });
  it('works for an api that cannot highlight at all', async () => { const { highlight: _h, ...plain } = api; void _h; expect(await rollDay(store, plain, store.now, DAY)).toMatchObject({ ok: true }); });
});

describe('today\'s counters', () => { it('still count opens and locks the report reads', async () => { await play(alice); expect(await store.hGet(keys.community(DAY), 'locks')).toBe('1'); }); });
