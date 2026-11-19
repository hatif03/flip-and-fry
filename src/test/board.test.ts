import { beforeEach, describe, expect, it } from 'vitest';
import { cozyBot, bareBot } from '@/management/bots';
import { getToday, lockService, openService, utcDate, type Deps, type Player } from '@/server/core/game';
import { getBoard } from '@/server/core/board';
import { setDoor } from '@/server/core/doors';
import { FakeStore } from './fake-store';

const ann: Player = { id: 't2_ann', name: 'ann_cooks' }, bo: Player = { id: 't2_bo', name: 'bo_fries' }, cy: Player = { id: 't2_cy', name: 'cy' };
let store: FakeStore, deps: Deps;
const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };
async function night(user: Player, bot: typeof cozyBot) { const t = good(await getToday(deps, user)), o = good(await openService(deps, user, t.rev, bot.actions)); return good(await lockService(deps, user, o.date, [])); }
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); deps = { store, now: () => store.now }; });
const today = () => utcDate(store.now);

describe("today's board", () => {
  it('is empty before anyone has closed a night', async () => {
    const v = good(await getBoard(deps, ann, today())); expect(v.entries).toEqual([]); expect(v.total).toBe(0); expect(v.you).toBeNull();
  });
  it('ranks official results best first, and shows names only for open doors and for yourself', async () => {
    await night(ann, cozyBot); await night(bo, bareBot); await night(cy, bareBot);
    good(await setDoor(deps, ann, true, true));
    const forBo = good(await getBoard(deps, bo, today()));
    expect(forBo.total).toBe(3); expect(forBo.entries.map(e => e.rank)).toEqual([1, 2, 3]);
    const scores = forBo.entries.map(e => e.stars * 1000 + e.rating); expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    const names = forBo.entries.map(e => e.name);
    expect(names).toContain('ann_cooks'); expect(names).toContain('bo_fries'); expect(names).not.toContain('cy');
    expect(forBo.entries.filter(e => e.name === 'a neighbor')).toHaveLength(1);
    expect(forBo.entries.filter(e => e.you)).toHaveLength(1); expect(forBo.you!.rank).toBe(forBo.entries.find(e => e.you)!.rank);
  });
  it('shows a player who has not played no row of their own, and never a name they did not open the door for', async () => {
    await night(ann, cozyBot); const v = good(await getBoard(deps, cy, today()));
    expect(v.you).toBeNull(); expect(v.entries[0].name).toBe('a neighbor'); expect(JSON.stringify(v)).not.toContain('ann_cooks');
  });
  it('only reads today and yesterday, and is rate limited', async () => {
    expect(await getBoard(deps, ann, '2026-11-01')).toMatchObject({ ok: false, status: 400 });
    let last: unknown = null; for (let i = 0; i < 22; i++) last = await getBoard(deps, ann, today());
    expect(last).toMatchObject({ ok: false, status: 429 });
  });
  it('cannot be written through the board route: only the lock writes it', async () => {
    await night(ann, cozyBot); const before = await store.zRange(`lb:${today()}`, 0, -1); await getBoard(deps, bo, today());
    expect(await store.zRange(`lb:${today()}`, 0, -1)).toEqual(before);
  });
});
