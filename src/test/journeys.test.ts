import { beforeEach, describe, expect, it } from 'vitest';
import { interactionName, noJourneys, type Journeys } from '@/client/journeys';
import { Session, type Http } from '@/client/session';
import { RestaurantEngine } from '@/management/engine';
import { endBody, interactionBody, officialEnd, progressBody } from '@/server/core/telemetry';
import { getToday, lockService, openService, type Deps, type Player } from '@/server/core/game';
import { actionLogSchema, type Action } from '@/management/actions';
import { packScore } from '@/management/stars';
import { FakeStore } from './fake-store';

const alice: Player = { id: 't2_alice', name: 'alice' };
let store: FakeStore;
type Call = { kind: string; a?: string | number; b?: string };

function recorder(id: string | null = 'journey-1') {
  const calls: Call[] = []; let current: string | undefined = id ?? undefined;
  const journeys: Journeys = {
    appReady: () => { calls.push({ kind: 'ready' }); }, start: () => { calls.push({ kind: 'start' }); },
    progress: (p, a) => { calls.push({ kind: 'progress', a: p, b: a }); }, interaction: (a, d) => { calls.push({ kind: 'interaction', a, b: d }); },
    id: () => current, clear: () => { calls.push({ kind: 'clear' }); current = undefined; },
  };
  return { calls, journeys };
}
const headersSeen: Array<Record<string, string> | undefined> = [];
function network(): Http {
  const deps: Deps = { store, now: () => store.now };
  return async (method, path, raw, headers) => {
    headersSeen.push(path === '/api/lock' ? headers : undefined);
    const body = raw === undefined ? undefined : JSON.parse(JSON.stringify(raw)) as { rev: number; date: string; actions: unknown };
    const out = (r: { ok: true; value: unknown } | { ok: false; status: number; error: string; conflict?: boolean }) => 'error' in r ? { status: r.status, body: { type: 'error', error: r.error, conflict: r.conflict } } : { status: 200, body: JSON.parse(JSON.stringify(r.value)) };
    if (path === '/api/today') return out(await getToday(deps, alice));
    const log = actionLogSchema.parse(body!.actions) as Action[];
    return path === '/api/open' ? out(await openService(deps, alice, body!.rev, log)) : out(await lockService(deps, alice, body!.date, log));
  };
}
const idle = { set: () => 0, clear: () => undefined };
const play = (e: RestaurantEngine) => { for (let i = 0; i < 2600 && e.state.phase === 'service'; i++) e.update(.1); };
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); headersSeen.length = 0; });

describe('which planning changes become interaction events', () => {
  it('names the verbs and skips cosmetic ones', () => {
    expect(interactionName({ tick: 0, kind: 'place', item: { id: -1, kind: 'lamp', x: 1, z: 1, rotation: 0 } })).toBe('purchase');
    expect(interactionName({ tick: 0, kind: 'place', item: { id: 6, kind: 'plant', x: 1, z: 1, rotation: 0 } })).toBe('move');
    expect(interactionName({ tick: 0, kind: 'dish', dish: 'salad', enabled: true, price: 27 })).toBe('price');
    expect(interactionName({ tick: 0, kind: 'hire', role: 'chef' })).toBe('hire');
    expect(interactionName({ tick: 0, kind: 'rename', name: 'Pip' })).toBeNull(); expect(interactionName({ tick: 0, kind: 'music', on: true })).toBeNull();
  });
  it('does not touch the network or throw when journeys are off', () => { expect(() => { noJourneys.start(); noJourneys.progress(.3, 'x'); noJourneys.interaction('a', 'b'); noJourneys.clear(); }).not.toThrow(); expect(noJourneys.id()).toBeUndefined(); });
});

describe('the journey around one service', () => {
  it('starts on Open, reports interactions, then 0.3, 0.6 and 0.9 once each and in order', async () => {
    const { calls, journeys } = recorder(), engine = new RestaurantEngine(undefined, () => 0), session = new Session(engine, network(), idle, journeys);
    await session.start();
    engine.hire('server'); engine.setDish('salad', true, 27); engine.rename('Pip'); engine.place({ id: -1, kind: 'plant', x: 0, z: 8, rotation: 0 });
    expect(calls).toEqual([{ kind: 'interaction', a: 'hire', b: 'official' }, { kind: 'interaction', a: 'price', b: 'official' }, { kind: 'interaction', a: 'purchase', b: 'official' }]);
    calls.length = 0;
    expect(await engine.remote!.open()).toBeNull();
    expect(calls[0]).toEqual({ kind: 'start' }); expect(calls.filter(c => c.kind === 'start')).toHaveLength(1);
    play(engine); await session.idle();
    const progress = calls.filter(c => c.kind === 'progress').map(c => `${c.a}:${c.b}`);
    expect(progress).toEqual(['0.3:first_guest', '0.6:mid_service', '0.9:receipt']);
    expect(calls.map(c => c.kind).lastIndexOf('clear')).toBe(calls.length - 1); // cleared only after the server closed the journey
  });
  it('sends the journey id to the lock, so the server can write the official end', async () => {
    const { journeys } = recorder('journey-77'), engine = new RestaurantEngine(undefined, () => 0), session = new Session(engine, network(), idle, journeys);
    await session.start(); await engine.remote!.open(); play(engine); await session.idle();
    expect(headersSeen.filter(Boolean)).toEqual([{ 'x-devvit-journey-id': 'journey-77' }]);
  });
  it('sends no header when there is no journey (telemetry dropped or off) and the game still works', async () => {
    const { journeys } = recorder(null), engine = new RestaurantEngine(undefined, () => 0), session = new Session(engine, network(), idle, journeys);
    await session.start(); await engine.remote!.open(); play(engine); await session.idle();
    expect(headersSeen.filter(Boolean)).toEqual([]); expect(session.result?.official).toBe(true);
  });
  it('marks changes made after today\'s result as "later"', async () => {
    const { calls, journeys } = recorder(), engine = new RestaurantEngine(undefined, () => 0), session = new Session(engine, network(), idle, journeys);
    await session.start(); await engine.remote!.open(); play(engine); await session.idle(); calls.length = 0;
    engine.hire('chef'); expect(calls).toEqual([{ kind: 'interaction', a: 'hire', b: 'later' }]);
  });
  it('starts a fresh journey for the next service', async () => {
    const { calls, journeys } = recorder(), engine = new RestaurantEngine(undefined, () => 0), session = new Session(engine, network(), idle, journeys);
    await session.start(); await engine.remote!.open(); play(engine); await session.idle(); session.dismissResult(); await engine.remote!.open();
    expect(calls.filter(c => c.kind === 'start')).toHaveLength(2);
  });
});

describe('server side', () => {
  it('writes the official end from the replayed receipt: win means at least one star, score is the packed result', () => {
    const lock = { stars: { stars: 2 as const, goal: true, challenges: 2, beatPrevious: false, goalText: '' }, report: { rating: 4.321 } as never };
    expect(officialEnd('j1', lock)).toEqual({ journeyId: 'j1', complete: true, game: { win: true, score: packScore(2, 4.321) } });
    expect(officialEnd('j1', { ...lock, stars: { ...lock.stars, stars: 0 as const } }).game.win).toBe(false);
  });
  it('validates the client event bodies and rejects bad ones', () => {
    expect(progressBody.safeParse({ journeyId: 'j', progress: .3, action: 'first_guest' }).success).toBe(true);
    expect(progressBody.safeParse({ journeyId: 'j', progress: 1.5 }).success).toBe(false); expect(progressBody.safeParse({ progress: .3 }).success).toBe(false);
    expect(interactionBody.safeParse({ action: 'hire', actionDetails: 'official' }).success).toBe(true); expect(interactionBody.safeParse({ action: '' }).success).toBe(false);
    expect(interactionBody.safeParse({ action: 'x'.repeat(65) }).success).toBe(false);
    expect(endBody.safeParse({ journeyId: 'j', complete: true, game: { win: true, score: 3_004_321 } }).success).toBe(true);
    expect(endBody.safeParse({ journeyId: 'j', game: { score: Number.NaN } }).success).toBe(false);
  });
});
