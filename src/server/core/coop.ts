import { actionSchema, isServiceAction, MAX_SERVICE_ACTIONS, type Action } from '../../management/replay';
import type { DailyHeadline } from '../../management/daily-headline';
import { createDailyHeadline } from '../../management/daily-headline';
import type { CoopListing } from '../../management/coop';
import { VISITOR_NAME, type RestaurantState } from '../../management/types';
import { keys, utcDate, type Deps, type Fail, type Player } from './game';
import { withinRate } from './store';

/**
 * Hosted service: the host's open night, shared with one helper. The server never simulates anything. It keeps the opening snapshot
 * and the actions the host has stamped (so a helper can join late), checks who is allowed to say what, and passes messages on over
 * realtime. The host's device stays the authority, and the host's log is what the lock replays, so a hosted night is as verifiable as
 * a solo one.
 */
export const coopChannel = (hostId: string): string => `coop_${hostId}`;
const sessionKey = (id: string): string => `coop:${id}`, logKey = (id: string): string => `coop-log:${id}`, joinerKey = (id: string): string => `coop-joiner:${id}`;
export const OPEN_KEY = 'coop-open';
/** A host that has not published a checksum for this long is gone. */
export const FRESH_MS = 60_000;
const TTL = 3 * 3600;
const fail = (status: Fail['status'], error: string): Fail => ({ ok: false, status, error });

type Session = { hostId: string; host: string | null; kitchen: string; date: string; snapshot: RestaurantState; headline: Pick<DailyHeadline, 'id' | 'date'>; tick: number; syncedAt: number };
export type Send = (channel: string, message: unknown) => Promise<void>;
export type { CoopListing };
export type CoopJoin = { snapshot: RestaurantState; headline: DailyHeadline; log: Action[]; tick: number; channel: string; host: string | null; kitchen: string };

async function load(deps: Deps, id: string): Promise<Session | null> {
  if (!/^t2_[a-z0-9]+$/.test(id)) return null;
  const raw = await deps.store.get(sessionKey(id)); if (!raw) return null;
  try { return JSON.parse(raw) as Session; } catch { return null; }
}
const fresh = (s: Session, now: number): boolean => now - s.syncedAt <= FRESH_MS;
async function save(deps: Deps, s: Session): Promise<void> {
  await deps.store.set(sessionKey(s.hostId), JSON.stringify(s), { expiration: new Date(deps.now() + TTL * 1000) });
  await deps.store.zAdd(OPEN_KEY, { member: s.hostId, score: s.syncedAt }); await deps.store.expire(OPEN_KEY, TTL);
}

/** The host offers the night they have just opened. Needs an open service today. */
export async function startCoop(deps: Deps, host: Player): Promise<{ ok: true; value: { channel: string } } | Fail> {
  if (!(await withinRate(deps.store, `rate:coop-start:${host.id}`, 6, 60))) return fail(429, 'Slow down a little and try again.');
  const date = utcDate(deps.now()), raw = await deps.store.hGet(keys.opens(date), host.id);
  if (!raw) return fail(409, 'Open the doors first, then invite a neighbor.');
  const opened = JSON.parse(raw) as { snapshot: RestaurantState };
  await deps.store.del(logKey(host.id), joinerKey(host.id));
  await save(deps, { hostId: host.id, host: VISITOR_NAME.test(host.name) ? host.name : null, kitchen: opened.snapshot.name, date, snapshot: opened.snapshot, headline: { id: createDailyHeadline(date).id, date }, tick: 0, syncedAt: deps.now() });
  return { ok: true, value: { channel: coopChannel(host.id) } };
}

/** Open sessions a neighbor could help in: fresh, not their own, with no other helper. */
export async function listCoop(deps: Deps, user: Player): Promise<CoopListing[]> {
  const out: CoopListing[] = [];
  for (const { member } of await deps.store.zRange(OPEN_KEY, deps.now() - FRESH_MS, Number.MAX_SAFE_INTEGER, { by: 'score', reverse: true })) {
    if (member === user.id || out.length >= 6) continue;
    const s = await load(deps, member); if (!s || !fresh(s, deps.now())) continue;
    const helper = await deps.store.get(joinerKey(member)); if (helper && helper !== user.id) continue;
    out.push({ id: s.hostId, host: s.host, kitchen: s.kitchen, helper: helper === user.id });
  }
  return out;
}

/** A neighbor takes the helper's place (one helper a night), and gets what they need to catch up to the host's present. */
export async function joinCoop(deps: Deps, user: Player, id: string): Promise<{ ok: true; value: CoopJoin } | Fail> {
  if (!(await withinRate(deps.store, `rate:coop-join:${user.id}`, 10, 60))) return fail(429, 'Slow down a little and try again.');
  if (id === user.id) return fail(400, 'This is your own kitchen.');
  const s = await load(deps, id); if (!s || !fresh(s, deps.now())) return fail(409, 'That kitchen is not open for help right now.');
  const taken = await deps.store.set(joinerKey(id), user.id, { nx: true, expiration: new Date(deps.now() + TTL * 1000) });
  const holder = taken ? user.id : await deps.store.get(joinerKey(id));
  if (holder !== user.id) return fail(409, 'That kitchen already has a helper tonight.');
  const log = (await deps.store.zRange(logKey(id), 0, -1)).flatMap(row => { try { return [JSON.parse(row.member) as Action]; } catch { return []; } });
  return { ok: true, value: { snapshot: s.snapshot, headline: createDailyHeadline(s.date), log, tick: s.tick, channel: coopChannel(id), host: s.host, kitchen: s.kitchen } };
}

/** The helper's tap, passed to the host (who stamps it). Only the helper may send it, and only a pass action, never a planning one. */
export async function relayRequest(deps: Deps, user: Player, id: string, action: unknown, send: Send): Promise<{ ok: true; value: { relayed: true } } | Fail> {
  if (!(await withinRate(deps.store, `rate:coop-act:${user.id}`, 60, 60))) return fail(429, 'Slow down a little and try again.');
  const s = await load(deps, id); if (!s || !fresh(s, deps.now())) return fail(409, 'That kitchen is not open for help right now.');
  if ((await deps.store.get(joinerKey(id))) !== user.id) return fail(409, 'You are not helping in this kitchen.');
  const parsed = actionSchema.safeParse(typeof action === 'object' && action ? { ...(action as object), tick: 1 } : null);
  if (!parsed.success || !isServiceAction(parsed.data)) return fail(400, 'That is not something to do at the pass.');
  const { tick: _t, ...request } = parsed.data; void _t; // the host chooses the tick
  await send(coopChannel(id), { kind: 'act', action: request }); return { ok: true, value: { relayed: true } };
}

/** The host's stamped action, kept for late joiners and passed to everyone. Host only. */
export async function commitAction(deps: Deps, user: Player, action: unknown, send: Send): Promise<{ ok: true; value: { committed: true } } | Fail> {
  if (!(await withinRate(deps.store, `rate:coop-commit:${user.id}`, 90, 60))) return fail(429, 'Slow down a little and try again.');
  const s = await load(deps, user.id); if (!s) return fail(409, 'You are not hosting a service.');
  const parsed = actionSchema.safeParse(action); if (!parsed.success || !isServiceAction(parsed.data)) return fail(400, 'That is not something to do at the pass.');
  if ((await deps.store.zRange(logKey(user.id), 0, -1)).length >= MAX_SERVICE_ACTIONS) return fail(400, 'Too many actions for one service.');
  await deps.store.zAdd(logKey(user.id), { member: JSON.stringify(parsed.data), score: parsed.data.tick }); await deps.store.expire(logKey(user.id), TTL);
  await send(coopChannel(user.id), { kind: 'commit', action: parsed.data }); return { ok: true, value: { committed: true } };
}

/** The host's checksum, passed on so the helper can check it is still in step. Also the heartbeat that says the host is here. */
export async function publishSync(deps: Deps, user: Player, tick: unknown, hash: unknown, send: Send): Promise<{ ok: true; value: { synced: true } } | Fail> {
  if (!(await withinRate(deps.store, `rate:coop-sync:${user.id}`, 30, 60))) return fail(429, 'Slow down a little and try again.');
  const s = await load(deps, user.id); if (!s) return fail(409, 'You are not hosting a service.');
  if (!Number.isInteger(tick) || (tick as number) < 0 || typeof hash !== 'string' || !/^[0-9a-f]{16}$/.test(hash)) return fail(400, 'That checksum does not look right.');
  await save(deps, { ...s, tick: tick as number, syncedAt: deps.now() });
  await send(coopChannel(user.id), { kind: 'sync', tick, hash }); return { ok: true, value: { synced: true } };
}

/** The host is finished (or the helper leaves): free the kitchen. */
export async function endCoop(deps: Deps, user: Player, send: Send, asHelperOf?: string): Promise<{ ok: true; value: { ended: true } } | Fail> {
  if (asHelperOf) { if ((await deps.store.get(joinerKey(asHelperOf))) === user.id) await deps.store.del(joinerKey(asHelperOf)); return { ok: true, value: { ended: true } }; }
  if (!(await load(deps, user.id))) return { ok: true, value: { ended: true } };
  await deps.store.del(sessionKey(user.id), logKey(user.id), joinerKey(user.id)); await deps.store.zRem(OPEN_KEY, [user.id]);
  await send(coopChannel(user.id), { kind: 'end' }); return { ok: true, value: { ended: true } };
}
