import { beforeEach, describe, expect, it } from 'vitest';
import { listenForVisits, type Connect } from '@/client/visits-live';
import { cozyBot } from '@/management/bots';
import { visitChannel, type BulletinNote } from '@/management/social';
import { setDoor, visitDoor, type VisitNotify } from '@/server/core/doors';
import { getToday, lockService, openService, type Deps, type Player } from '@/server/core/game';
import { FakeStore } from './fake-store';

const host: Player = { id: 't2_host', name: 'host_cook' }, guest: Player = { id: 't2_guest', name: 'guest' };
let store: FakeStore, deps: Deps, sent: Array<{ host: string; note: BulletinNote }>;
const notify: VisitNotify = async (h, note) => { sent.push({ host: h, note }); };
const good = <T,>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T => { if ('error' in r) throw new Error(`${r.status} ${r.error}`); return r.value; };
beforeEach(async () => {
  store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); deps = { store, now: () => store.now }; sent = [];
  const t = good(await getToday(deps, host)), o = good(await openService(deps, host, t.rev, cozyBot.actions)); good(await lockService(deps, host, o.date, [])); good(await setDoor(deps, host, true, true));
});

describe('telling the host right away', () => {
  it('sends one note to the host\'s own channel when a neighbor visits their kitchen', async () => {
    good(await visitDoor(deps, guest, host.id, 'salad', notify));
    expect(sent).toHaveLength(1); expect(sent[0].host).toBe('t2_host'); expect(sent[0].note).toMatchObject({ visitor: 'guest', kitchen: 'Little Rooftop' }); expect(visitChannel(sent[0].host)).toBe('visits_t2_host');
  });
  it('says nothing for a sample kitchen, which has no host to tell', async () => { good(await visitDoor(deps, guest, 'sample-garden', 'salad', notify)); expect(sent).toEqual([]); });
  it('never fails the visit if the live channel is down', async () => {
    const down: VisitNotify = async () => { throw new Error('realtime down'); };
    expect(good(await visitDoor(deps, guest, host.id, 'salad', down)).outcome).toBe('served');
  });
  it('sends nothing for a refused visit', async () => { await visitDoor(deps, guest, host.id, 'pizza', notify); expect(sent).toEqual([]); });
  it('uses a channel name Reddit accepts: no colon', () => { expect(visitChannel('t2_abc123')).not.toContain(':'); });
});

describe('hearing it', () => {
  const connected = () => { const seen: Array<{ channel: string; onMessage: (m: unknown) => void }> = []; const connect: Connect = o => { seen.push(o); return {}; }; return { seen, connect }; };
  const note: BulletinNote = { visitor: 'bob', kitchen: 'Little Rooftop', outcome: 'served', tip: 3, line: 'Served in 12s, tip $3', thought: 'A good night.', date: '2026-12-09' };
  it('listens on the host\'s own channel and turns a visit note into a line', () => {
    const { seen, connect } = connected(), lines: string[] = [];
    expect(listenForVisits(connect, 't2_host', line => lines.push(line))).toBe(true); expect(seen[0].channel).toBe('visits_t2_host');
    seen[0].onMessage({ kind: 'visit', note }); expect(lines).toEqual(['bob: Served in 12s, tip $3. A good night.']);
  });
  it('ignores anything that is not a visit note', () => {
    const { seen, connect } = connected(), lines: string[] = []; listenForVisits(connect, 't2_host', l => lines.push(l));
    for (const m of [null, 'hi', 5, {}, { kind: 'other', note }, { kind: 'visit' }, { kind: 'visit', note: { visitor: 'bob' } }, { kind: 'visit', note: { ...note, line: 5 } }]) seen[0].onMessage(m);
    expect(lines).toEqual([]);
  });
  it('does nothing without a signed-in player', () => { const { seen, connect } = connected(); expect(listenForVisits(connect, undefined, () => undefined)).toBe(false); expect(seen).toEqual([]); });
});
