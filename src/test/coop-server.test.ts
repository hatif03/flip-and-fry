import { beforeEach, describe, expect, it } from 'vitest';
import { cozyBot } from '@/management/bots';
import { MAX_SERVICE_ACTIONS } from '@/management/replay';
import { FRESH_MS, commitAction, coopChannel, endCoop, joinCoop, listCoop, publishSync, relayRequest, startCoop, type Send } from '@/server/core/coop';
import { getToday, openService, type Deps, type Player } from '@/server/core/game';
import { FakeStore } from './fake-store';

const host: Player = { id: 't2_host', name: 'host_cook' }, helper: Player = { id: 't2_helper', name: 'helper' }, other: Player = { id: 't2_other', name: 'other' };
let store: FakeStore, deps: Deps, sent: Array<{ channel: string; message: { kind: string; [k: string]: unknown } }>;
const send: Send = async (channel, message) => { sent.push({ channel, message: message as { kind: string } }); };
const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };
const HASH = 'abcdef0123456789';
async function hosting() { const t = good(await getToday(deps, host)); good(await openService(deps, host, t.rev, cozyBot.actions)); return good(await startCoop(deps, host)); }
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); deps = { store, now: () => store.now }; sent = []; });

describe('offering the night', () => {
  it('needs an open service, and gives the realtime channel a helper listens on', async () => {
    expect(await startCoop(deps, host)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining('Open the doors first') });
    const r = await hosting(); expect(r.channel).toBe('coop_t2_host'); expect(coopChannel('t2_abc')).not.toContain(':');
  });
  it('lists fresh sessions for others, never the host\'s own, and drops a host that has gone quiet', async () => {
    await hosting(); expect(await listCoop(deps, host)).toEqual([]);
    expect(await listCoop(deps, helper)).toEqual([{ id: 't2_host', host: 'host_cook', kitchen: 'Little Rooftop', helper: false }]);
    store.now += FRESH_MS + 1000; expect(await listCoop(deps, helper)).toEqual([]);
  });
});

describe('joining', () => {
  it('gives the helper the opening snapshot, the headline, the log so far and the host\'s tick', async () => {
    await hosting(); good(await commitAction(deps, host, { tick: 40, kind: 'claimTicket', guestId: 3 }, send)); good(await publishSync(deps, host, 100, HASH, send));
    const j = good(await joinCoop(deps, helper, 't2_host'));
    expect(j.snapshot.name).toBe('Little Rooftop'); expect(j.snapshot.phase).toBe('planning'); expect(j.headline.id).toBe('rain'); expect(j.log).toEqual([{ tick: 40, kind: 'claimTicket', guestId: 3 }]); expect(j.tick).toBe(100); expect(j.channel).toBe('coop_t2_host');
  });
  it('allows one helper a night, lets that helper come back, and shows the kitchen as taken to everyone else', async () => {
    await hosting(); good(await joinCoop(deps, helper, 't2_host')); good(await joinCoop(deps, helper, 't2_host'));
    expect(await joinCoop(deps, other, 't2_host')).toMatchObject({ ok: false, status: 409, error: 'That kitchen already has a helper tonight.' });
    expect(await listCoop(deps, other)).toEqual([]); expect((await listCoop(deps, helper))[0]).toMatchObject({ helper: true });
  });
  it('refuses your own kitchen, a kitchen that is not open, an id that is not a player, and a stale host', async () => {
    expect(await joinCoop(deps, host, 't2_host')).toMatchObject({ ok: false, status: 400 }); expect(await joinCoop(deps, helper, 't2_host')).toMatchObject({ ok: false, status: 409 });
    expect(await joinCoop(deps, helper, '../x')).toMatchObject({ ok: false, status: 409 });
    await hosting(); store.now += FRESH_MS + 1000; expect(await joinCoop(deps, helper, 't2_host')).toMatchObject({ ok: false, status: 409 });
  });
});

describe('who may say what', () => {
  it('passes the helper\'s tap to the host without a tick, and only from the helper', async () => {
    await hosting(); good(await joinCoop(deps, helper, 't2_host'));
    good(await relayRequest(deps, helper, 't2_host', { kind: 'claimTicket', guestId: 4, by: 1, tick: 999 }, send));
    expect(sent).toEqual([{ channel: 'coop_t2_host', message: { kind: 'act', action: { kind: 'claimTicket', guestId: 4, by: 1 } } }]); // the tick the helper claimed is dropped: the host decides
    expect(await relayRequest(deps, other, 't2_host', { kind: 'claimTicket', guestId: 4 }, send)).toMatchObject({ ok: false, status: 409, error: 'You are not helping in this kitchen.' });
    expect(await relayRequest(deps, host, 't2_host', { kind: 'claimTicket', guestId: 4 }, send)).toMatchObject({ ok: false, status: 409 });
  });
  it('accepts only things done at the pass, never planning changes or nonsense', async () => {
    await hosting(); good(await joinCoop(deps, helper, 't2_host'));
    for (const bad of [{ kind: 'hire', role: 'chef' }, { kind: 'dish', dish: 'salad', enabled: true, price: 20 }, { kind: 'claimTicket' }, { kind: 'nope', guestId: 1 }, null, 'x', 5]) expect(await relayRequest(deps, helper, 't2_host', bad, send), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    expect(sent).toEqual([]);
  });
  it('lets only the host commit and sync, and keeps a stamped action for late joiners', async () => {
    await hosting(); expect(await commitAction(deps, helper, { tick: 5, kind: 'comp', guestId: 1 }, send)).toMatchObject({ ok: false, status: 409 }); expect(await publishSync(deps, helper, 50, HASH, send)).toMatchObject({ ok: false, status: 409 });
    good(await commitAction(deps, host, { tick: 5, kind: 'comp', guestId: 1 }, send)); expect(sent.map(s => s.message.kind)).toEqual(['commit']);
  });
  it('refuses a planning action or a missing tick as a commit, and a log that is too long', async () => {
    await hosting(); for (const bad of [{ tick: 0, kind: 'hire', role: 'chef' }, { kind: 'comp', guestId: 1 }, { tick: 5, kind: 'comp' }, null]) expect(await commitAction(deps, host, bad, send)).toMatchObject({ ok: false, status: 400 });
    for (let i = 0; i < MAX_SERVICE_ACTIONS; i++) { store.now += 1; await store.set('rate:coop-commit:t2_host', '0'); good(await commitAction(deps, host, { tick: 5 + i, kind: 'priority', guestId: i }, send)); }
    await store.set('rate:coop-commit:t2_host', '0'); expect(await commitAction(deps, host, { tick: 500, kind: 'priority', guestId: 999 }, send)).toMatchObject({ ok: false, status: 400, error: 'Too many actions for one service.' });
  });
  it('checks a checksum looks like one, passes it on, and counts it as the host being here', async () => {
    await hosting(); for (const [tick, hash] of [[-1, HASH], [1.5, HASH], [50, 'nothex'], [50, 5], ['50', HASH]] as const) expect(await publishSync(deps, host, tick, hash, send), `${tick} ${hash}`).toMatchObject({ ok: false, status: 400 });
    store.now += FRESH_MS - 1000; good(await publishSync(deps, host, 600, HASH, send)); store.now += FRESH_MS - 1000; expect((await listCoop(deps, helper)).length).toBe(1); // still fresh thanks to the heartbeat
    expect(sent[sent.length - 1]).toEqual({ channel: 'coop_t2_host', message: { kind: 'sync', tick: 600, hash: HASH } });
  });
  it('is rate limited', async () => { await hosting(); good(await joinCoop(deps, helper, 't2_host')); for (let i = 0; i < 60; i++) await relayRequest(deps, helper, 't2_host', { kind: 'comp', guestId: 1 }, send); expect(await relayRequest(deps, helper, 't2_host', { kind: 'comp', guestId: 1 }, send)).toMatchObject({ ok: false, status: 429 }); });
});

describe('finishing', () => {
  it('ends the session, tells everyone, and frees the kitchen', async () => {
    await hosting(); good(await joinCoop(deps, helper, 't2_host')); good(await endCoop(deps, host, send)); expect(sent[sent.length - 1]?.message.kind).toBe('end');
    expect(await listCoop(deps, helper)).toEqual([]); expect(await joinCoop(deps, helper, 't2_host')).toMatchObject({ ok: false, status: 409 });
  });
  it('lets a helper leave and a new helper take the place, and ignores someone else\'s leave', async () => {
    await hosting(); good(await joinCoop(deps, helper, 't2_host')); good(await endCoop(deps, other, send, 't2_host')); expect(await joinCoop(deps, other, 't2_host')).toMatchObject({ ok: false, status: 409 });
    good(await endCoop(deps, helper, send, 't2_host')); good(await joinCoop(deps, other, 't2_host'));
  });
  it('is harmless to end twice, or to end a session that never started', async () => { good(await endCoop(deps, host, send)); await hosting(); good(await endCoop(deps, host, send)); good(await endCoop(deps, host, send)); });
});
