import { describe, expect, it } from 'vitest';
import { CoopGuest, CoopHost, INPUT_DELAY, SYNC_EVERY, catchUp } from '@/management/coop';
import { RestaurantEngine } from '@/management/engine';
import { createDailyHeadline } from '@/management/daily-headline';
import { runService, stateHash, type Action } from '@/management/replay';
import { DISHES, createRestaurant, type RestaurantState } from '@/management/types';

const headline = createDailyHeadline('2026-12-09');
const snapshot = (): RestaurantState => { const s = createRestaurant(); s.staff = s.staff.map(m => ({ ...m, role: 'server' as const })); s.cash = 5000; s.furniture.push({ id: 90, kind: 'prep', x: 9, z: 4, rotation: 0 }); return s; };
const engine = (): RestaurantEngine => { const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; return e; };

/** Two devices and a pretend network. Time advances one tick at a time; a message sent now arrives `latency` ticks later. */
function rig(opts: { latency?: number; lag?: number; jitter?: (n: number) => number } = {}) {
  const latency = opts.latency ?? 6, lag = opts.lag ?? 3, jitter = opts.jitter ?? (() => 0);
  const host = engine(), guest = engine(), log: Action[] = []; host.state = snapshot(); host.onAction = a => log.push(a);
  expect(host.open(headline)).toBeNull();
  let now = 0, sent = 0; const inbox: Array<{ at: number; to: 'host' | 'guest'; run: () => void }> = [];
  const send = (to: 'host' | 'guest', run: () => void): void => { inbox.push({ at: now + latency + jitter(sent++), to, run }); };
  const mismatches: number[] = [];
  const hostCore = new CoopHost(host, { commit: a => send('guest', () => guestCore.onCommit(a)), sync: (tick, hash) => send('guest', () => { guestCore.onSync(tick, hash); }) });
  const guestCore: CoopGuest = new CoopGuest(guest, { act: a => send('host', () => hostCore.onRequest(a)) });
  guestCore.onMismatch = () => mismatches.push(guest.tickCount());
  // The helper joins `lag` ticks behind the host, from the same opening snapshot.
  for (let i = 0; i < lag; i++) host.tick();
  expect(catchUp(guest, snapshot(), headline, [], host.tickCount())).toBeNull();
  const step = (n = 1): void => { for (let i = 0; i < n; i++) { now++; for (const m of inbox.filter(x => x.at <= now).sort((a, b) => a.at - b.at)) m.run(); for (let j = inbox.length - 1; j >= 0; j--) if (inbox[j].at <= now) inbox.splice(j, 1); host.tick(); guest.tick(); } };
  return { host, guest, hostCore, guestCore, log, step, mismatches, inbox };
}
const waitingTickets = (e: RestaurantEngine) => e.state.guests.filter(g => g.stage === 'waiting' && DISHES[g.dish].station === 'prep');

describe('stamping', () => {
  it('stamps an action a fixed distance ahead, applies it there on both devices, and records it for the server', () => {
    const r = rig(); while (!waitingTickets(r.host).length) r.step();
    const t = waitingTickets(r.host)[0]; const before = r.host.tickCount(); r.host.claimTicket(t.id); // the owner's tap in a hosted service
    expect(r.host.state.hands).toEqual([]); // nothing happens yet
    r.step(INPUT_DELAY + 1);
    expect(r.host.state.hands.map(h => h.guestId)).toEqual([t.id]); expect(r.log.find(a => a.kind === 'claimTicket')).toMatchObject({ tick: before + INPUT_DELAY });
    r.step(r.mismatches.length ? 0 : 10); expect(r.guest.state.hands.map(h => h.guestId)).toEqual([t.id]);
  });
  it('sends a helper\'s tap to the host, which stamps it with the helper\'s hands', () => {
    const r = rig(); while (waitingTickets(r.host).length < 2) r.step();
    const [a, b] = waitingTickets(r.host); r.host.claimTicket(a.id); r.guest.claimTicket(b.id); r.step(60);
    expect(r.host.state.hands.map(h => [h.guestId, h.by]).sort()).toEqual([[a.id, 0], [b.id, 1]].sort()); expect(r.log.find(x => x.kind === 'claimTicket' && x.by === 1)).toBeTruthy();
    expect(stateHash(r.host.state)).toBe(stateHash(r.guest.state) === stateHash(r.host.state) ? stateHash(r.host.state) : 'x');
  });
});

describe('staying in step', () => {
  it('keeps both devices identical through a whole busy night with both people cooking', () => {
    const r = rig({ latency: 8, lag: 4 });
    for (let i = 0; i < 2600 && r.host.state.phase === 'service'; i++) {
      r.step();
      const hostBusy = r.host.state.hands.some(h => h.by === 0), guestBusy = r.host.state.hands.some(h => h.by === 1);
      const w = waitingTickets(r.host);
      if (!hostBusy && w[0] && i % 7 === 0) r.host.claimTicket(w[0].id);
      if (!guestBusy && w.length && i % 11 === 0) r.guest.claimTicket((w[1] ?? w[0]).id);
      for (const h of r.host.state.hands) { const g = r.host.state.guests.find(x => x.id === h.guestId); if (g && g.cook >= DISHES[g.dish].seconds + .3) (h.by === 0 ? r.host : r.guest).plate(g.id, h.by); }
    }
    r.step(30);
    expect(r.mismatches).toEqual([]); expect(r.log.filter(a => a.kind === 'cook').length).toBeGreaterThan(2); expect(r.log.some(a => 'by' in a && a.by === 1)).toBe(true);
  });
  it('is the same night the server replays: both people\'s stamped actions give the host\'s hash', () => {
    const r = rig({ latency: 5, lag: 2 });
    for (let i = 0; i < 2600 && r.host.state.phase === 'service'; i++) {
      r.step(); const w = waitingTickets(r.host);
      if (!r.host.state.hands.some(h => h.by === 0) && w[0] && i % 5 === 0) r.host.claimTicket(w[0].id);
      if (!r.host.state.hands.some(h => h.by === 1) && w.length && i % 9 === 0) r.guest.claimTicket((w[1] ?? w[0]).id);
      for (const h of r.host.state.hands) { const g = r.host.state.guests.find(x => x.id === h.guestId); if (g && g.cook >= DISHES[g.dish].seconds + .2) (h.by === 0 ? r.host : r.guest).plate(g.id, h.by); }
    }
    r.step(INPUT_DELAY + 5); while (r.host.state.phase === 'service') r.host.tick();
    const replay = runService(snapshot(), r.log, headline); if ('error' in replay) throw new Error(replay.error);
    expect(replay.rejected).toBe(0); expect(replay.hash).toBe(stateHash(r.host.state));
  });
  it('tolerates messages arriving out of order, as long as each arrives before its tick', () => {
    const r = rig({ latency: 3, lag: 2, jitter: n => (n * 7) % 9 }); // latency between 3 and 11 ticks, reordered
    for (let i = 0; i < 1500 && r.host.state.phase === 'service'; i++) {
      r.step(); const w = waitingTickets(r.host); if (!r.host.state.hands.some(h => h.by === 0) && w[0] && i % 6 === 0) r.host.claimTicket(w[0].id);
      const mine = r.host.state.hands.find(h => h.by === 0); const g = mine && r.host.state.guests.find(x => x.id === mine.guestId); if (g && g.cook >= DISHES[g.dish].seconds + .2) r.host.plate(g.id);
    }
    r.step(40); expect(r.mismatches).toEqual([]);
  });
});

describe('noticing a drift', () => {
  it('publishes a checksum every five seconds, and a helper that agrees stays quiet', () => {
    const r = rig(); const syncs: number[] = []; const link = (r.hostCore as unknown as { link: { sync: (t: number, h: string) => void } }).link, original = link.sync; link.sync = (tick, hash) => { syncs.push(tick); original(tick, hash); };
    r.step(SYNC_EVERY * 3 + 20); expect(r.mismatches).toEqual([]); expect(syncs.length).toBeGreaterThanOrEqual(3); syncs.forEach((tick, i) => expect(tick % SYNC_EVERY, `sync ${i}`).toBe(0)); expect(new Set(syncs).size).toBe(syncs.length);
  });
  it('catches a message that arrived too late, by comparing checksums, and starts over cleanly', () => {
    const r = rig({ latency: 4, lag: 2 }); while (!waitingTickets(r.host).length) r.step();
    // The host's commit is held back far too long, so the helper applies it late and diverges.
    const t = waitingTickets(r.host)[0]; r.host.claimTicket(t.id);
    for (const m of r.inbox) if (m.to === 'guest') m.at += 40;
    r.step(SYNC_EVERY * 2); expect(r.mismatches.length).toBeGreaterThan(0);
    // Resync: a fresh snapshot, the committed log so far, and the host's tick.
    expect(catchUp(r.guest, snapshot(), headline, r.log, r.host.tickCount())).toBeNull(); expect(stateHash(r.guest.state)).toBe(stateHash(r.host.state));
  });
  it('waits for a checksum about a tick it has not reached yet', () => {
    const r = rig({ lag: 0 }); r.step(5); expect(r.guestCore.onSync(r.guest.tickCount() + 50, 'whatever')).toBe('pending');
  });
});

describe('joining late', () => {
  it('brings a helper to the host\'s present from the opening snapshot and the committed log, and they agree from then on', () => {
    const r = rig({ lag: 0 }); while (waitingTickets(r.host).length < 1) r.step();
    r.host.claimTicket(waitingTickets(r.host)[0].id); r.step(200);
    const late = engine(); expect(catchUp(late, snapshot(), headline, r.log, r.host.tickCount())).toBeNull();
    expect(late.tickCount()).toBe(r.host.tickCount()); expect(stateHash(late.state)).toBe(stateHash(r.host.state));
    for (let i = 0; i < 100; i++) { r.host.tick(); late.tick(); } expect(stateHash(late.state)).toBe(stateHash(r.host.state));
  });
  it('refuses to join a kitchen that cannot open', () => { const bad = snapshot(); bad.furniture = bad.furniture.filter(f => f.kind !== 'table'); expect(catchUp(engine(), bad, headline, [], 10)).toMatch(/table/i); });
});

describe('without a hosted service', () => {
  it('changes nothing for a solo night: taps act at once and nothing is stamped', () => {
    const e = engine(); e.state = snapshot(); const log: Action[] = []; e.onAction = a => log.push(a); e.open(headline);
    while (!waitingTickets(e).length) e.tick(); const t = waitingTickets(e)[0]; expect(e.claimTicket(t.id)).toBeNull(); expect(e.state.hands).toHaveLength(1); expect(log[0]).toMatchObject({ kind: 'claimTicket' }); expect(log[0]).not.toHaveProperty('by');
  });
  it('lets go of the engine when the hosted service stops', () => {
    const e = engine(); const host = new CoopHost(e, { commit: () => undefined, sync: () => undefined }); expect(e.coop).not.toBeNull(); host.stop(); expect(e.coop).toBeNull(); expect(e.afterStep).toBeNull();
  });
});
