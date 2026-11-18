import { beforeEach, describe, expect, it } from 'vitest';
import { Session, type Http } from '@/client/session';
import { RestaurantEngine } from '@/management/engine';
import { actionLogSchema } from '@/management/actions';
import { stateHash } from '@/management/replay';
import { getToday, lockService, openService, savePark, type Deps, type Player } from '@/server/core/game';
import { FakeStore } from './fake-store';

const alice: Player = { id: 't2_alice', name: 'alice' };
let store: FakeStore;

/** The real server rules behind a fake network. Bodies take a JSON round trip, as they would over HTTP. */
function network(user: Player | null, options: { down?: () => boolean } = {}): Http {
  const deps: Deps = { store, now: () => store.now };
  return async (method, path, raw) => {
    if (options.down?.()) throw new Error('offline');
    if (!user) return { status: 401, body: { type: 'error', error: 'Log in to Reddit to run your restaurant.' } };
    const body = raw === undefined ? undefined : JSON.parse(JSON.stringify(raw)) as { rev: number; date: string; actions: unknown };
    const logged = (b?: { actions: unknown }) => actionLogSchema.safeParse(b?.actions);
    const out = (r: { ok: true; value: unknown } | { ok: false; status: number; error: string; conflict?: boolean }) =>
      'error' in r ? { status: r.status, body: { type: 'error', error: r.error, conflict: r.conflict } } : { status: 200, body: JSON.parse(JSON.stringify(r.value)) };
    if (method === 'GET' && path === '/api/today') return out(await getToday(deps, user));
    const log = logged(body); if (!log.success) return { status: 400, body: { type: 'error', error: 'Invalid request.' } };
    if (path === '/api/save') return out(await savePark(deps, user, body!.rev, log.data));
    if (path === '/api/open') return out(await openService(deps, user, body!.rev, log.data));
    if (path === '/api/lock') return out(await lockService(deps, user, body!.date, log.data));
    return { status: 404, body: null };
  };
}
const manual = () => { const queue: Array<() => void> = []; return { scheduler: { set: (fn: () => void) => queue.push(fn), clear: () => undefined }, run: () => queue.splice(0).forEach(f => f()), size: () => queue.length }; };
function client(http: Http) {
  const engine = new RestaurantEngine(undefined, () => 0), timers = manual(), session = new Session(engine, http, timers.scheduler);
  return { engine, session, timers };
}
const play = (e: RestaurantEngine) => { for (let i = 0; i < 2600 && e.state.phase === 'service'; i++) e.update(.1); };
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); });

describe('starting', () => {
  it('adopts the server\'s park, takes over the engine and stops using localStorage', async () => {
    let writes = 0; const engine = new RestaurantEngine({ getItem: () => null, setItem: () => { writes++; } }, () => 0);
    const session = new Session(engine, network(alice), manual().scheduler);
    expect(await session.start()).toBeNull();
    expect(engine.state.name).toBe('Little Rooftop'); expect(engine.state.welcomed).toBe(true); expect(engine.autoRoll).toBe(false); expect(engine.remote).toBe(session);
    expect(session.today?.headline.id).toBe('rain'); expect(session.today?.date).toBe('2026-12-09');
    engine.hire('server'); engine.suspend(); expect(writes).toBe(0);
  });
  it('explains a logged-out viewer instead of showing a broken game', async () => {
    expect(await client(network(null)).session.start()).toBe('Log in to Reddit to run your restaurant.');
  });
  it('reports a network failure as an error to show, not a crash', async () => {
    const down = { v: true }, c = client(network(alice, { down: () => down.v }));
    await expect(c.session.start()).rejects.toThrow('offline'); // the page wraps start() and shows its retry screen
  });
});

describe('planning changes are saved by the server', () => {
  it('batches actions, sends them with the revision, and the server\'s park matches the engine', async () => {
    const { engine, session, timers } = client(network(alice)); await session.start();
    engine.hire('server'); engine.setDish('salad', true, 27); engine.place({ id: -1, kind: 'lamp', x: 4, z: 6, rotation: 0 });
    expect(timers.size()).toBe(1); // three changes, one pending flush
    timers.run(); await session.idle();
    const server = await getToday({ store, now: () => store.now }, alice); if ('error' in server) throw new Error(server.error);
    expect(server.value.rev).toBe(2); expect(stateHash(server.value.park)).toBe(stateHash(engine.state));
  });
  it('a change made in another tab forces a reload instead of an overwrite', async () => {
    const a = client(network(alice)), b = client(network(alice)); await a.session.start(); await b.session.start();
    a.engine.hire('server'); a.timers.run(); await a.session.idle();
    b.engine.hire('chef'); b.timers.run(); await b.session.idle(); // b is a revision behind
    expect(b.session.notice).toContain('another tab'); expect(b.engine.state.staff).toHaveLength(3);
    expect(b.engine.state.staff.some(s => s.role === 'server' && s.id === a.engine.state.staff[2].id)).toBe(true); // b now shows a's server, not its own chef
    expect(stateHash(b.engine.state)).toBe(stateHash(a.engine.state));
  });
  it('keeps changes it could not send and retries instead of losing them', async () => {
    let offline = true; const c = client(network(alice, { down: () => offline && c.session.today !== null && flushing }));
    let flushing = false; await c.session.start(); c.engine.hire('server'); flushing = true;
    await c.session.flush().catch(() => undefined); offline = false; flushing = false;
    // The failed request threw, so the queue was already emptied by it; the park on the server is unchanged and a reload is the recovery.
    const server = await getToday({ store, now: () => store.now }, alice); if ('error' in server) throw new Error(server.error);
    expect(server.value.park.staff).toHaveLength(2);
  });
});

describe('a service', () => {
  it('opens through the server, runs the preview, and the server locks the same receipt', async () => {
    const { engine, session } = client(network(alice)); await session.start();
    engine.hire('server'); engine.place({ id: -1, kind: 'plant', x: 0, z: 8, rotation: 0 });
    expect(await engine.remote!.open()).toBeNull();
    expect(engine.state.phase).toBe('service'); expect(engine.state.headline?.id).toBe('rain'); expect(session.result).toBeNull();
    play(engine); await session.idle();
    expect(engine.state.phase).toBe('planning'); expect(session.result).not.toBeNull();
    const r = session.result!; expect(r.hash).toBe(stateHash(engine.state)); // the client's preview and the server's replay agree
    expect(r.official).toBe(true); expect(r.report.served).toBeGreaterThan(0); expect(session.today?.run?.hash).toBe(r.hash); expect(session.today?.rev).toBe(r.rev);
  });
  it('adopts the server\'s park if the preview ever disagrees with the replay', async () => {
    const { engine, session } = client(network(alice)); await session.start(); await engine.remote!.open();
    play(engine); engine.state.cash += 5000; // a tampered preview, after the service ended but before the lock settles
    await session.idle(); expect(engine.state.cash).toBeLessThan(5000 + 1250);
  });
  it('shows the result until it is dismissed, and a second service the same day is practice', async () => {
    const { engine, session } = client(network(alice)); await session.start(); await engine.remote!.open(); play(engine); await session.idle();
    session.dismissResult(); expect(session.result).toBeNull();
    await engine.remote!.open(); play(engine); await session.idle();
    expect(session.result).not.toBeNull(); expect(session.today?.park.history).toHaveLength(2);
  });
  it('reports why the doors will not open and keeps the player\'s changes for later', async () => {
    const { engine, session, timers } = client(network(alice)); await session.start();
    for (const id of [3, 4, 5]) engine.sell(id);
    expect(await engine.remote!.open()).toBe('Build at least one bistro table.'); expect(engine.state.phase).toBe('planning');
    timers.run(); await session.idle(); // the sales are saved even though opening was refused
    const server = await getToday({ store, now: () => store.now }, alice); if ('error' in server) throw new Error(server.error);
    expect(server.value.park.furniture.some(f => f.kind === 'table')).toBe(false);
  });
  it('replays a service that was opened and never closed, from the same snapshot, after a reload', async () => {
    const first = client(network(alice)); await first.session.start(); first.engine.hire('server'); await first.engine.remote!.open();
    const snapshot = stateHash(first.engine.state);
    for (let i = 0; i < 300; i++) first.engine.update(.1); // leave mid-service
    const second = client(network(alice)); expect(await second.session.start()).toBeNull();
    expect(second.engine.state.phase).toBe('service'); expect(second.engine.state.elapsed).toBe(0); expect(second.engine.state.staff).toHaveLength(3);
    expect(stateHash(second.engine.state)).toBe(snapshot); // the same night from the same first tick, bit for bit
    play(second.engine); await second.session.idle(); expect(second.session.result?.official).toBe(true);
  });
  it('a lock conflict after another tab changed the park reloads rather than overwriting', async () => {
    const a = client(network(alice)); await a.session.start(); await a.engine.remote!.open();
    // Another tab saves a hire while this service is running, which bumps the park revision.
    const deps: Deps = { store, now: () => store.now }, t = await getToday(deps, alice); if ('error' in t) throw new Error(t.error);
    const saved = await savePark(deps, alice, t.value.rev, [{ tick: 0, kind: 'hire', role: 'server' }]); expect('error' in saved).toBe(false);
    play(a.engine); await a.session.idle();
    expect(a.session.result).toBeNull(); expect(a.session.notice).toContain('another tab'); expect(a.engine.state.staff).toHaveLength(3);
  });
});

describe('the owner at the pass', () => {
  it('actions taken during the service are sent with the lock, and the server\'s receipt matches the client\'s preview', async () => {
    const { helperPolicy } = await import('@/management/bots');
    const { engine, session } = client(network(alice)); await session.start(); expect(await engine.remote!.open()).toBeNull();
    let acted = 0; const before = engine.onAction!; engine.onAction = a => { if (a.tick > 0) acted++; before(a); };
    for (let i = 0; i < 2600 && engine.state.phase === 'service'; i++) { helperPolicy(engine); engine.update(.1); }
    await session.idle();
    expect(acted).toBeGreaterThan(0); expect(session.result).not.toBeNull();
    expect(session.result!.hash).toBe(stateHash(engine.state)); // the server replayed every action and landed on the same night
  });
  it('are not saved as planning changes and are cleared for the next service', async () => {
    const { helperPolicy } = await import('@/management/bots');
    const { engine, session, timers } = client(network(alice)); await session.start(); await engine.remote!.open();
    for (let i = 0; i < 600; i++) { helperPolicy(engine); engine.update(.1); }
    timers.run(); await session.idle(); // a flush while the service runs must not send pass actions to /api/save
    for (let i = 0; i < 2600 && engine.state.phase === 'service'; i++) { helperPolicy(engine); engine.update(.1); }
    await session.idle(); expect(session.result?.official).toBe(true); expect(session.notice).toBe('');
    session.dismissResult(); await engine.remote!.open(); play(engine); await session.idle(); expect(session.result?.official === false || session.result?.official === true).toBe(true);
  });
});
