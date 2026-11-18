import { beforeEach, describe, expect, it } from 'vitest';
import { cozyBot } from '@/management/bots';
import { openError } from '@/management/replay';
import { getToday, lockService, openService, type Deps, type Player } from '@/server/core/game';
import { bulletinLine } from '@/management/social';
import { DOORS_KEY, isDoorOpen, listDoors, readBulletin, setDoor, visitDoor } from '@/server/core/doors';
import { SAMPLES, sampleState } from '@/server/core/samples';
import { FakeStore } from './fake-store';

const host: Player = { id: 't2_host', name: 'host_cook' }, guest: Player = { id: 't2_guest', name: 'guest' }, third: Player = { id: 't2_third', name: 'third' };
let store: FakeStore, deps: Deps;
const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };
async function closeNight(user: Player) { const t = good(await getToday(deps, user)), o = good(await openService(deps, user, t.rev, cozyBot.actions)); return good(await lockService(deps, user, o.date, [])); }
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); deps = { store, now: () => store.now }; });

describe('sample kitchens', () => {
  it('are valid, openable restaurants, every time the rules change', () => {
    expect(SAMPLES).toHaveLength(4);
    for (const s of SAMPLES) { const state = sampleState(s.id)!; expect(openError(state), s.id).toBeNull(); expect(state.name, s.id).toBe(s.kitchen); }
  });
  it('differ from one another, and a visit can never change the next visitor\'s copy', () => {
    const a = sampleState('sample-noodle')!; a.cash = 1; a.furniture = a.furniture.slice(0, 1);
    const b = sampleState('sample-noodle')!; expect(b.cash).not.toBe(1); expect(b.furniture.length).toBeGreaterThan(1);
    expect(sampleState('sample-nope')).toBeNull(); expect(new Set(SAMPLES.map(s => sampleState(s.id)!.furniture.length)).size).toBeGreaterThan(1);
  });
  it('each shows its own menu', () => {
    expect(sampleState('sample-noodle')!.menu.ramen.enabled).toBe(true); expect(sampleState('sample-noodle')!.menu.salad.enabled).toBe(false);
    expect(sampleState('sample-grill')!.menu.skewers.enabled).toBe(true);
  });
});

describe('leaving the door open', () => {
  it('needs a night closed today first', async () => { expect(await setDoor(deps, host, true, true)).toMatchObject({ ok: false, status: 409 }); expect(await isDoorOpen(deps, host)).toBe(false); });
  it('opens and closes, and a moderator can switch the feature off', async () => {
    await closeNight(host);
    expect(await setDoor(deps, host, true, false)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining('switched open doors off') });
    good(await setDoor(deps, host, true, true)); expect(await isDoorOpen(deps, host)).toBe(true); expect((await store.zRange(DOORS_KEY, 0, -1)).map(m => m.member)).toEqual([host.id]);
    good(await setDoor(deps, host, false, false)); expect(await isDoorOpen(deps, host)).toBe(false); expect(await store.zRange(DOORS_KEY, 0, -1)).toEqual([]);
  });
  it('shows up for neighbors but not for the host, after the four samples', async () => {
    await closeNight(host); good(await setDoor(deps, host, true, true));
    const forGuest = await listDoors(deps, guest), forHost = await listDoors(deps, host);
    expect(forGuest[0]).toMatchObject({ id: host.id, kind: 'real', host: 'host_cook', kitchen: 'Little Rooftop' }); expect(forGuest.filter(d => d.kind === 'sample')).toHaveLength(4);
    expect(forHost.every(d => d.id !== host.id)).toBe(true); expect(forHost.filter(d => d.kind === 'sample')).toHaveLength(4);
  });
  it('lists only samples when nobody has left a door open', async () => { expect((await listDoors(deps, guest)).every(d => d.kind === 'sample')).toBe(true); });
  it('drops a door whose stored kitchen is damaged', async () => {
    await closeNight(host); good(await setDoor(deps, host, true, true)); await store.set(`door:${host.id}`, '{broken'); expect((await listDoors(deps, guest)).some(d => d.id === host.id)).toBe(false);
  });
});

describe('visiting', () => {
  it('plays one service in a sample kitchen with the visitor as a guest, and reports how it went', async () => {
    const r = good(await visitDoor(deps, guest, 'sample-garden', 'salad'));
    expect(r.door).toMatchObject({ id: 'sample-garden', kind: 'sample', kitchen: "Basil's Garden", host: null }); expect(['served', 'left', 'passed']).toContain(r.outcome);
    expect(r.outcome).toBe('served'); expect(r.line).toMatch(/^Served in \d+s/);
  });
  it('says so when the kitchen has nothing the visitor wants', async () => {
    const r = good(await visitDoor(deps, guest, 'sample-noodle', 'salad')); expect(r.outcome).toBe('passed'); expect(r.line).toBe('Nothing on the menu was for them'); expect(r.tip).toBe(0);
  });
  it('is the same every time for the same visitor and kitchen on the same day', async () => {
    const a = good(await visitDoor(deps, guest, 'sample-grill', 'burger'));
    const other = new FakeStore(); other.now = store.now; const b = good(await visitDoor({ store: other, now: () => other.now }, guest, 'sample-grill', 'burger'));
    expect(b).toEqual(a);
  });
  it('is one visit to a door a day, and three a day in all', async () => {
    good(await visitDoor(deps, guest, 'sample-garden', 'salad'));
    expect(await visitDoor(deps, guest, 'sample-garden', 'salad')).toMatchObject({ ok: false, status: 409, error: expect.stringContaining('already visited') });
    good(await visitDoor(deps, guest, 'sample-grill', 'burger')); good(await visitDoor(deps, guest, 'sample-noodle', 'ramen'));
    expect(await visitDoor(deps, guest, 'sample-quiet', 'salad')).toMatchObject({ ok: false, status: 429 });
    store.now += 86400_000; good(await visitDoor(deps, guest, 'sample-garden', 'salad')); // a new day
  });
  it('refuses a door that does not exist, your own door, a bad dish, or an id that is not a door', async () => {
    expect(await visitDoor(deps, guest, 'sample-nope', 'salad')).toMatchObject({ ok: false, status: 409 });
    expect(await visitDoor(deps, guest, 't2_nobody', 'salad')).toMatchObject({ ok: false, status: 409 });
    expect(await visitDoor(deps, guest, '../etc', 'salad')).toMatchObject({ ok: false, status: 409 });
    expect(await visitDoor(deps, guest, 'sample-garden', 'pizza')).toMatchObject({ ok: false, status: 400 });
    expect(await visitDoor(deps, guest, guest.id, 'salad')).toMatchObject({ ok: false, status: 400 });
    expect(await visitDoor(deps, { id: 't2_x', name: 'bad name!' }, 'sample-garden', 'salad')).toMatchObject({ ok: false, status: 400 });
  });
  it('never changes the host\'s restaurant, cash, stars or streak', async () => {
    await closeNight(host); good(await setDoor(deps, host, true, true));
    const before = JSON.stringify(good(await getToday(deps, host)).park); good(await visitDoor(deps, guest, host.id, 'salad'));
    expect(JSON.stringify(good(await getToday(deps, host)).park)).toBe(before);
  });
});

describe('the bulletin', () => {
  it('gets a short canned note from each visit to a real kitchen, and none for a sample', async () => {
    await closeNight(host); good(await setDoor(deps, host, true, true));
    good(await visitDoor(deps, guest, 'sample-garden', 'salad')); expect(await readBulletin(deps, host)).toEqual([]);
    const r = good(await visitDoor(deps, guest, host.id, 'salad')); const notes = await readBulletin(deps, host);
    expect(notes).toHaveLength(1); expect(notes[0]).toMatchObject({ visitor: 'guest', kitchen: 'Little Rooftop', outcome: r.outcome, tip: r.tip });
    expect(bulletinLine(notes[0])).toMatch(/^guest: .+\. /); expect(bulletinLine(notes[0])).not.toMatch(/t2_/);
  });
  it('lists the newest first, keeps the last twenty, and expires', async () => {
    await closeNight(host); good(await setDoor(deps, host, true, true));
    for (let i = 0; i < 24; i++) { const v: Player = { id: `t2_v${i}`, name: `v${i}` }; store.now += 1000; good(await visitDoor(deps, v, host.id, 'salad')); }
    const notes = await readBulletin(deps, host); expect(notes[0].visitor).toBe('v23'); expect(notes).toHaveLength(10);
    expect((await store.zRange(`bulletin:${host.id}`, 0, -1)).length).toBe(20); expect(store.ttl(`bulletin:${host.id}`)).toBeGreaterThan(29 * 86400);
  });
  it('skips a damaged note', async () => {
    await store.zAdd(`bulletin:${host.id}`, { member: '{x', score: 1 }, { member: JSON.stringify({ visitor: 'a' }), score: 2 }); expect(await readBulletin(deps, host)).toEqual([]);
  });
  it('is read only by its host', async () => {
    await closeNight(host); good(await setDoor(deps, host, true, true)); good(await visitDoor(deps, guest, host.id, 'salad'));
    expect(await readBulletin(deps, third)).toEqual([]);
  });
});
