import { beforeEach, describe, expect, it } from 'vitest';
import { Session, type Http } from '@/client/session';
import { RestaurantEngine } from '@/management/engine';
import { cozyBot } from '@/management/bots';
import { houseDish } from '@/management/social';
import { createRestaurant } from '@/management/types';
import { isDoorOpen, listDoors, readBulletin, setDoor, visitDoor } from '@/server/core/doors';
import { getToday, lockService, openService, type Deps, type Player } from '@/server/core/game';
import { FakeStore } from './fake-store';

const alice: Player = { id: 't2_alice', name: 'alice' }, bob: Player = { id: 't2_bob', name: 'bob' };
let store: FakeStore, deps: Deps;
/** Only the neighborhood routes, backed by the real server rules, for the player `user`. */
function network(user: Player, allowed = true): Http {
  return async (method, path, raw) => {
    const body = raw === undefined ? undefined : JSON.parse(JSON.stringify(raw)) as { open?: boolean; doorId?: string; dish?: string };
    const out = (r: { ok: true; value: unknown } | { ok: false; status: number; error: string }) => 'error' in r ? { status: r.status, body: { type: 'error', error: r.error } } : { status: 200, body: JSON.parse(JSON.stringify(r.value)) };
    if (method === 'GET' && path === '/api/doors') return { status: 200, body: { type: 'doors', doors: await listDoors(deps, user), mine: await isDoorOpen(deps, user), allowed, bulletin: await readBulletin(deps, user) } };
    if (path === '/api/door') return out(await setDoor(deps, user, body!.open!, allowed));
    if (path === '/api/visit') return out(await visitDoor(deps, user, body!.doorId!, body!.dish));
    return { status: 404, body: null };
  };
}
const session = (user: Player, allowed = true) => new Session(new RestaurantEngine(undefined, () => 0), network(user, allowed), { set: () => 0, clear: () => undefined });
const closeNight = async (user: Player) => { const t = await getToday(deps, user); if ('error' in t) throw new Error(t.error); const o = await openService(deps, user, t.value.rev, cozyBot.actions); if ('error' in o) throw new Error(o.error); await lockService(deps, user, o.value.date, []); };
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); deps = { store, now: () => store.now }; });

describe('the neighborhood through the session', () => {
  it('loads the street: four samples, whether your door is open, and an empty bulletin', async () => {
    const view = await session(alice).neighborhood.load(); if ('error' in view) throw new Error(view.error);
    expect(view.doors.filter(d => d.kind === 'sample')).toHaveLength(4); expect(view).toMatchObject({ mine: false, allowed: true, bulletin: [] });
  });
  it('leaves the door open after a night, and a neighbor\'s visit shows up on the host\'s bulletin', async () => {
    await closeNight(alice); const host = session(alice), visitor = session(bob);
    expect(await host.neighborhood.setDoor(true)).toBeNull();
    const view = await visitor.neighborhood.load(); if ('error' in view) throw new Error(view.error);
    expect(view.doors[0]).toMatchObject({ id: 't2_alice', kind: 'real', kitchen: 'Little Rooftop' });
    const visit = await visitor.neighborhood.visit('t2_alice', houseDish(createRestaurant())); if ('error' in visit) throw new Error(visit.error);
    expect(visit.outcome).toBe('served');
    const mine = await host.neighborhood.load(); if ('error' in mine) throw new Error(mine.error);
    expect(mine.mine).toBe(true); expect(mine.bulletin).toHaveLength(1); expect(mine.bulletin[0]).toMatchObject({ visitor: 'bob', outcome: 'served' });
  });
  it('turns a refusal into a message to show', async () => {
    expect(await session(alice).neighborhood.setDoor(true)).toBe('Close a night first, then you can leave your door open.');
    expect(await session(alice, false).neighborhood.setDoor(true)).toMatch(/switched open doors off/);
    const r = await session(alice).neighborhood.visit('sample-nope', 'salad'); expect(r).toEqual({ error: 'That door is closed now.' });
  });
  it('picks the dearest dish on the menu as the one a visitor orders', () => {
    const s = createRestaurant(); expect(houseDish(s)).toBe('burger'); s.menu.burger.enabled = false; expect(houseDish(s)).toBe('salad'); s.menu.steak.enabled = true; s.menu.steak.price = 60; expect(houseDish(s)).toBe('steak');
  });
});
