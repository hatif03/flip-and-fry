import { beforeEach, describe, expect, it } from 'vitest';
import { bareBot, cozyBot, greedyBot } from '@/management/bots';
import { createDailyHeadline } from '@/management/daily-headline';
import { rollDay, type PostApi } from '@/server/core/daily-post';
import { getToday, keys, lockService, openService, streakFor, utcDate, type Deps, type Player } from '@/server/core/game';
import { postNightReport } from '@/server/core/neighborhood';
import { FakeStore } from './fake-store';

/**
 * A rehearsal of the judging week: 9 to 16 December, three kinds of player, every day through the real server rules. It checks the
 * things that go wrong over a week and not in a single night: the daily post and the report appear once per day, streaks count only
 * verified days, nothing carries over by mistake, and the server stays fast.
 */
const players: Array<{ user: Player; actions: typeof cozyBot.actions; name: string }> = [
  { user: { id: 't2_cozy', name: 'cozy' }, actions: cozyBot.actions, name: 'cozy' },
  { user: { id: 't2_bare', name: 'bare' }, actions: bareBot.actions, name: 'bare' },
  { user: { id: 't2_greedy', name: 'greedy' }, actions: greedyBot.actions, name: 'greedy' },
];
const DAYS = ['2026-12-09', '2026-12-10', '2026-12-11', '2026-12-12', '2026-12-13', '2026-12-14', '2026-12-15', '2026-12-16'];
let store: FakeStore, deps: Deps, posts: string[], reports: string[];
const api: PostApi = {
  createPost: async o => { posts.push(o.postData.date); return { id: `t3_${o.postData.date}` }; },
  comment: async (id, text) => { if (text.startsWith('**Last night')) reports.push(`${id}|${text}`); return { id: `t1_${id}`, makeSticky: async () => undefined }; },
};
const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };
const at = (date: string, hour: number): number => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hour);
beforeEach(() => { store = new FakeStore(); store.now = at(DAYS[0], 9); deps = { store, now: () => store.now }; posts = []; reports = []; });

describe('the judging week', () => {
  it('runs eight days for three kinds of player without a single error, and stays fast', async () => {
    const started = Date.now(); const stars: Record<string, number[]> = { cozy: [], bare: [], greedy: [] };
    for (const [i, date] of DAYS.entries()) {
      store.now = at(date, 9); await rollDay(store, api, store.now, date); await postNightReport(deps, api, DAYS[i - 1] ?? '2026-12-08');
      for (const p of players) {
        const t = good(await getToday(deps, p.user)); expect(t.date).toBe(date); expect(t.headline.id).toBe(createDailyHeadline(date).id);
        const o = good(await openService(deps, p.user, t.rev, i === 0 ? p.actions : []));
        const l = good(await lockService(deps, p.user, o.date, [])); expect(l.official).toBe(true); expect(l.report.headline).toBe(createDailyHeadline(date).id);
        stars[p.name].push(l.stars.stars);
      }
    }
    expect(Date.now() - started).toBeLessThan(60_000);
    // one post a day, in order
    expect(posts).toEqual(DAYS);
    // a report for every day that had a post and was over by the time the next began
    expect(reports.map(r => r.split('|')[0])).toEqual(DAYS.slice(0, -1).map(d => `t3_${d}`));
    // the well-run kitchen earns stars far more often than the bare one over the week (the calibration holds across headlines)
    const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);
    expect(sum(stars.cozy)).toBeGreaterThan(sum(stars.bare));
  }, 120_000);

  it('counts a streak only from verified one-star days, and ends it on a day with none', async () => {
    const user = players[0].user, played: boolean[] = [];
    // The streak is the run of verified days ending today, or ending yesterday while today is not yet earned (so it stays visible all day).
    const model = (): number => { let n = 0, i = played.length - 1; if (!played[i]) i--; while (i >= 0 && played[i]) { n++; i--; } return n; };
    for (const [i, date] of DAYS.slice(0, 5).entries()) {
      store.now = at(date, 10);
      const t = good(await getToday(deps, user)), o = good(await openService(deps, user, t.rev, i === 0 ? cozyBot.actions : [])), l = good(await lockService(deps, user, o.date, []));
      played.push(l.stars.stars >= 1); expect(l.streak, date).toBe(model());
    }
    store.now = at(DAYS[6], 10); // two days with no play at all
    expect(await streakFor(store, user.id, utcDate(store.now))).toBe(0);
  });

  it('keeps today\'s result per player and per day, and never mixes two players', async () => {
    store.now = at(DAYS[0], 11);
    for (const p of players) { const t = good(await getToday(deps, p.user)), o = good(await openService(deps, p.user, t.rev, p.actions)); good(await lockService(deps, p.user, o.date, [])); }
    const runs = await store.hGetAll(keys.runs(DAYS[0])); expect(Object.keys(runs).sort()).toEqual(['t2_bare', 't2_cozy', 't2_greedy']);
    for (const p of players) expect(good(await getToday(deps, p.user)).run?.username).toBe(p.user.name);
  });

  it('opens a service that crosses midnight under the headline it opened with', async () => {
    const user = players[0].user; store.now = at(DAYS[0], 23) + 55 * 60_000;
    const t = good(await getToday(deps, user)), o = good(await openService(deps, user, t.rev, cozyBot.actions));
    store.now = at(DAYS[1], 0) + 10 * 60_000; // ten minutes into the next UTC day
    const l = good(await lockService(deps, user, o.date, [])); expect(l.report.headline).toBe(createDailyHeadline(DAYS[0]).id); expect(o.date).toBe(DAYS[0]);
  });
});
