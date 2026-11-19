import { beforeEach, describe, expect, it } from 'vitest';
import { CoopClient, HOST_AWAY_MS, type Connect } from '@/client/coop';
import type { Http } from '@/client/session';
import { RestaurantEngine } from '@/management/engine';
import { cozyBot } from '@/management/bots';
import { createDailyHeadline } from '@/management/daily-headline';
import { stateHash, type Action } from '@/management/replay';
import { DISHES } from '@/management/types';
import { commitAction, endCoop, joinCoop, listCoop, publishSync, relayRequest, startCoop, type Send } from '@/server/core/coop';
import { getToday, lockService, openService, type Deps, type Player } from '@/server/core/game';
import { FakeStore } from './fake-store';

const host: Player = { id: 't2_host', name: 'host_cook' }, helper: Player = { id: 't2_helper', name: 'helper' };
let store: FakeStore, deps: Deps, subscribers: Map<string, Array<(m: unknown) => void>>, clock: number;
/** Realtime: the server sends, subscribers hear it on the next turn. */
const send: Send = async (channel, message) => { for (const fn of subscribers.get(channel) ?? []) queueMicrotask(() => fn(JSON.parse(JSON.stringify(message)))); };
const connect: Connect = o => { subscribers.set(o.channel, [...(subscribers.get(o.channel) ?? []), o.onMessage]); return {}; };
const disconnect = (channel: string): void => { subscribers.delete(channel); };
/** The real server rules behind a fake network, for one player. */
function network(user: Player): Http {
  return async (method, path, raw) => {
    const body = raw === undefined ? {} : JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
    const out = (r: { ok: true; value: unknown } | { ok: false; status: number; error: string }) => 'error' in r ? { status: r.status, body: { type: 'error', error: r.error } } : { status: 200, body: JSON.parse(JSON.stringify(r.value)) };
    if (path === '/api/coop/start') return out(await startCoop(deps, user));
    if (path.startsWith('/api/coop/join')) return out(await joinCoop(deps, user, new URL(path, 'http://x').searchParams.get('id') ?? ''));
    if (path === '/api/coop/act') return out(await relayRequest(deps, user, body.id as string, body.action, send));
    if (path === '/api/coop/commit') return out(await commitAction(deps, user, body.action, send));
    if (path === '/api/coop/sync') return out(await publishSync(deps, user, body.tick, body.hash, send));
    if (path === '/api/coop/end') return out(await endCoop(deps, user, send, body.helperOf as string | undefined));
    return { status: 404, body: null };
  };
}
const engine = (): RestaurantEngine => { const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; return e; };
const turn = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
/** Let every pending request and message finish. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 20));
beforeEach(() => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); deps = { store, now: () => store.now }; subscribers = new Map(); clock = 0; });

/** The host opens through the server, as the real client does, and starts hosting. */
async function hostOpens() {
  const e = engine(), log: Action[] = []; e.onAction = a => { if (a.tick > 0) log.push(a); };
  const today = await getToday(deps, host); if ('error' in today) throw new Error(today.error);
  const opened = await openService(deps, host, today.value.rev, cozyBot.actions); if ('error' in opened) throw new Error(opened.error);
  e.state = structuredClone(opened.value.snapshot); expect(e.open(createDailyHeadline(opened.value.date))).toBeNull();
  const client = new CoopClient(e, network(host), connect, disconnect, undefined, () => clock); expect(await client.startHosting()).toBeNull();
  return { e, log, client, date: opened.value.date };
}
const waiting = (e: RestaurantEngine) => e.state.guests.filter(g => g.stage === 'waiting');

describe('a hosted night, end to end', () => {
  it('lets a neighbor help at the pass, keeps both devices identical, and locks the host\'s night with both people\'s actions', async () => {
    const h = await hostOpens();
    for (let i = 0; i < 80; i++) { h.e.tick(); } // the night is under way
    await settle(); // the host's first checksum has reached the server
    const g = engine(), gc = new CoopClient(g, network(helper), connect, disconnect, { beginGuest() { /* stands in for the session */ }, async endGuest() { return null; } }, () => clock);
    expect(await gc.join('t2_host')).toBeNull(); expect(gc.helping).toBe(true); expect(g.tickCount()).toBeGreaterThanOrEqual(40); // from the host's last checksum; it runs on to the present at the next one
    for (let i = 0; i < 2600 && h.e.state.phase === 'service'; i++) {
      h.e.tick(); g.tick(); await turn();
      const w = waiting(h.e), mine = h.e.state.hands.find(x => x.by === 0), theirs = h.e.state.hands.find(x => x.by === 1);
      if (!mine && w.length && i % 9 === 0) h.e.claimTicket(w[0].id);
      if (!theirs && w.length && i % 13 === 0) g.claimTicket((w[1] ?? w[0]).id);
      for (const hand of h.e.state.hands) { const guest = h.e.state.guests.find(x => x.id === hand.guestId); if (guest && guest.cook >= DISHES[guest.dish].seconds + .2) (hand.by === 0 ? h.e : g).plate(guest.id, hand.by); }
    }
    for (let i = 0; i < 20; i++) { g.tick(); await turn(); }
    expect(h.log.some(a => 'by' in a && a.by === 1)).toBe(true); expect(h.log.filter(a => a.kind === 'cook').length).toBeGreaterThan(2);
    // The server replays the host's log, helper actions included, and lands on the host's night.
    const locked = await lockService(deps, host, h.date, h.log); if ('error' in locked) throw new Error(locked.error);
    expect(locked.value.official).toBe(true); expect(locked.value.hash).toBe(stateHash(h.e.state));
  });
  it('shows the open kitchen to neighbors, and frees it when the host stops', async () => {
    const h = await hostOpens(); expect((await listCoop(deps, helper)).map(s => s.id)).toEqual(['t2_host']);
    await h.client.stopHosting(); expect(h.client.hosting).toBe(false); expect(h.e.coop).toBeNull(); expect(await listCoop(deps, helper)).toEqual([]);
  });
  it('tells a helper when the host ends the night, and lets go of the host\'s kitchen', async () => {
    const h = await hostOpens(), g = engine(), ended: string[] = []; let left = 0;
    const gc = new CoopClient(g, network(helper), connect, disconnect, { beginGuest() { /* guest */ }, async endGuest() { left++; return null; } }, () => clock); gc.onEnd = () => ended.push('end');
    await gc.join('t2_host'); await h.client.stopHosting(); await settle();
    expect(ended).toEqual(['end']); expect(left).toBe(1); expect(gc.helping).toBe(false); expect(g.coop).toBeNull();
  });
  it('waits for a host that has gone quiet, and carries on when they are back', async () => {
    const h = await hostOpens(), g = engine(), notes: string[] = [];
    const gc = new CoopClient(g, network(helper), connect, disconnect, { beginGuest() { /* guest */ }, async endGuest() { return null; } }, () => clock); gc.onNotice = t => notes.push(t); await gc.join('t2_host');
    clock = HOST_AWAY_MS + 6000; await new Promise(r => setTimeout(r, 5200)); expect(g.paused).toBe(true); expect(notes).toContain('The host is away. Waiting for them.');
    for (let i = 0; i < 60; i++) { h.e.tick(); await turn(); } expect(g.paused).toBe(false); expect(notes).toContain('The host is back.');
  }, 15000);
  it('refuses a second helper, and says why', async () => {
    await hostOpens(); const a = new CoopClient(engine(), network(helper), connect, disconnect, { beginGuest() { /* guest */ }, async endGuest() { return null; } });
    expect(await a.join('t2_host')).toBeNull();
    const b = new CoopClient(engine(), network({ id: 't2_third', name: 'third' }), connect, disconnect, { beginGuest() { /* guest */ }, async endGuest() { return null; } });
    expect(await b.join('t2_host')).toBe('That kitchen already has a helper tonight.'); expect(b.helping).toBe(false);
  });
});

describe('a hosted service on the engine', () => {
  it('cannot be paused or sped up from one side, because the other side would run on without it', () => {
    const e = engine(); e.state.phase = 'service'; e.coop = { submit: () => undefined }; e.pause(true); expect(e.paused).toBe(false); e.setSpeed(3); expect(e.speed).toBe(1);
    e.holdForHost(true); expect(e.paused).toBe(true); e.holdForHost(false); e.coop = null; e.pause(true); expect(e.paused).toBe(true);
  });
});
