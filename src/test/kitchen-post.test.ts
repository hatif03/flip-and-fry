import { beforeEach, describe, expect, it } from 'vitest';
import { cozyBot } from '@/management/bots';
import { getToday, lockService, openService, type Deps, type Player } from '@/server/core/game';
import { setDoor, visitDoor } from '@/server/core/doors';
import { kitchenOfPost, kitchenPostContent, postKitchen, type KitchenPostApi } from '@/server/core/kitchen-post';
import { FakeStore } from './fake-store';

const host: Player = { id: 't2_host', name: 'host_cook' }, guest: Player = { id: 't2_guest', name: 'guest' };
let store: FakeStore, deps: Deps, created: Array<{ title: string; postData: Record<string, string>; text: string }>, fail: boolean;
const api: KitchenPostApi = { createAsUser: async o => { created.push(o); if (fail) throw new Error('down'); return { id: `t3_k${created.length}`, url: `https://reddit.com/r/x/comments/k${created.length}` }; } };
const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };
async function openDoor() { const t = good(await getToday(deps, host)), o = good(await openService(deps, host, t.rev, cozyBot.actions)); good(await lockService(deps, host, o.date, [])); good(await setDoor(deps, host, true, true)); }
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); deps = { store, now: () => store.now }; created = []; fail = false; });

describe('posting a kitchen', () => {
  it('needs an open door, because the post would have nothing to show', async () => {
    expect(await postKitchen(deps, api, host)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining('Leave your door open') }); expect(created).toEqual([]);
  });
  it('creates one post as the player, with only the door, the name and the date in its data', async () => {
    await openDoor(); const r = good(await postKitchen(deps, api, host));
    expect(r.url).toContain('reddit.com'); expect(created).toHaveLength(1);
    expect(created[0].postData).toEqual({ kind: 'kitchen', door: 't2_host', title: 'Little Rooftop', date: '2026-12-09' });
    expect(created[0].title).toBe('Little Rooftop · a kitchen on the roof'); expect(created[0].text).toContain('run by host_cook'); expect(created[0].text).not.toMatch(/t2_/);
  });
  it('is one a day, even for two quick taps, and again tomorrow', async () => {
    await openDoor(); const both = await Promise.all([postKitchen(deps, api, host), postKitchen(deps, api, host)]);
    expect(both.filter(r => 'value' in r)).toHaveLength(1); expect(created).toHaveLength(1);
    expect(await postKitchen(deps, api, host)).toMatchObject({ ok: false, status: 409, error: 'You already posted your kitchen today.' });
  });
  it('lets the player try again when Reddit fails', async () => {
    await openDoor(); fail = true; expect(await postKitchen(deps, api, host)).toMatchObject({ ok: false, status: 500 });
    fail = false; good(await postKitchen(deps, api, host));
  });
  it('leaves out a name that could not be shown safely', () => { expect(kitchenPostContent('Pip', null, 't2_x', '2026-12-09').text).not.toContain('run by'); });
});

describe('opening a kitchen post', () => {
  it('offers the kitchen named in the post while its door is open, and a visit works from it', async () => {
    await openDoor(); const data = { kind: 'kitchen', door: 't2_host', title: 'Little Rooftop', date: '2026-12-09' };
    const kitchen = await kitchenOfPost(deps, data); expect(kitchen).toMatchObject({ id: 't2_host', kitchen: 'Little Rooftop', kind: 'real', host: 'host_cook' });
    expect(good(await visitDoor(deps, guest, kitchen!.id, 'salad')).outcome).toBe('served');
  });
  it('offers nothing once the door is closed, or for any ordinary post', async () => {
    await openDoor(); const data = { kind: 'kitchen', door: 't2_host' }; good(await setDoor(deps, host, false, true));
    expect(await kitchenOfPost(deps, data)).toBeNull(); expect(await kitchenOfPost(deps, { date: '2026-12-09', headline: 'rain' })).toBeNull(); expect(await kitchenOfPost(deps, undefined)).toBeNull();
  });
  it('ignores a door id that is not a player id, so a post cannot point at a sample or at a path', async () => {
    expect(await kitchenOfPost(deps, { kind: 'kitchen', door: 'sample-garden' })).toBeNull(); expect(await kitchenOfPost(deps, { kind: 'kitchen', door: '../x' })).toBeNull(); expect(await kitchenOfPost(deps, { kind: 'kitchen', door: 5 })).toBeNull();
  });
});
