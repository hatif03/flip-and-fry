import { DISH_IDS, MAX_VISITORS, VISITOR_NAME, type Dish, type Visitor } from '../../management/types';
import type { Deps, Fail, Player } from './game';
import { withinRate } from './store';

/**
 * Who has the post open right now. A visitor's tab sends a heartbeat every 20 seconds; a kitchen that opens its doors takes up to
 * three of the visitors seen in the last minute and writes them into the opening snapshot, so the replay is the same on the server
 * and on every client. Only the name Reddit gave the visitor and the dish they chose leave this file.
 */
export const PRESENCE_KEY = 'presence', PRESENCE_INFO_KEY = 'presence:info';
/** A heartbeat counts as "here" for this long. Three missed beats means gone. */
export const PRESENT_MS = 60_000;
const TTL_SECONDS = 2 * 86400;
const fail = (status: Fail['status'], error: string): Fail => ({ ok: false, status, error });

export async function recordPresence(deps: Deps, user: Player, dish: unknown): Promise<{ ok: true; value: { present: true } } | Fail> {
  if (!(await withinRate(deps.store, `rate:presence:${user.id}`, 8, 60))) return fail(429, 'Slow down a little and try again.');
  if (typeof dish !== 'string' || !(DISH_IDS as readonly string[]).includes(dish)) return fail(400, 'That is not a dish on the menu.');
  // Someone whose name cannot be shown safely simply is not a visitor.
  if (!VISITOR_NAME.test(user.name)) return { ok: true, value: { present: true } };
  await deps.store.zAdd(PRESENCE_KEY, { member: user.id, score: deps.now() });
  await deps.store.hSet(PRESENCE_INFO_KEY, { [user.id]: JSON.stringify({ name: user.name, dish }) });
  await deps.store.expire(PRESENCE_KEY, TTL_SECONDS); await deps.store.expire(PRESENCE_INFO_KEY, TTL_SECONDS);
  return { ok: true, value: { present: true } };
}

/** The most recent visitors other than the host, newest first. Stale entries are tidied away as they are met. */
export async function pickVisitors(deps: Deps, hostId: string, max = MAX_VISITORS): Promise<Visitor[]> {
  const now = deps.now(), recent = await deps.store.zRange(PRESENCE_KEY, now - PRESENT_MS, Number.MAX_SAFE_INTEGER, { by: 'score', reverse: true });
  const picked: Visitor[] = [];
  for (const { member } of recent) {
    if (member === hostId) continue;
    const raw = await deps.store.hGet(PRESENCE_INFO_KEY, member); if (!raw) continue;
    try {
      const info = JSON.parse(raw) as { name?: unknown; dish?: unknown };
      if (typeof info.name === 'string' && VISITOR_NAME.test(info.name) && typeof info.dish === 'string' && (DISH_IDS as readonly string[]).includes(info.dish)) picked.push({ name: info.name, dish: info.dish as Dish });
    } catch { /* a damaged entry is skipped */ }
    if (picked.length >= max) break;
  }
  const stale = await deps.store.zRange(PRESENCE_KEY, 0, now - PRESENT_MS - 1, { by: 'score' });
  if (stale.length) { await deps.store.zRem(PRESENCE_KEY, stale.map(s => s.member)); await deps.store.hDel(PRESENCE_INFO_KEY, stale.map(s => s.member)); }
  return picked;
}
