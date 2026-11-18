import { VISITOR_NAME } from '../../management/types';
import type { Deps, Fail, Player } from './game';
import { withinRate } from './store';

/**
 * A neighbor's Reddit avatar (snoovatar) for their guest tag. Whether an image from Reddit's CDN may load inside the webview is
 * decided by the platform, so the client always has the pixel face to fall back on. The URL is looked up once a day per name and
 * cached; only a name that passes the same check as every other neighbor name is ever looked up.
 */
export interface AvatarApi { snoovatarUrl(username: string): Promise<string | undefined> }
const key = (name: string): string => `avatar:${name.toLowerCase()}`;
const TTL = 86400;
const fail = (status: Fail['status'], error: string): Fail => ({ ok: false, status, error });
/** Only Reddit's own image hosts are passed on, so a lookup can never point the page at somewhere else. */
export const isRedditImage = (url: string): boolean => { try { const u = new URL(url); return u.protocol === 'https:' && /(^|\.)redd\.it$|(^|\.)redditmedia\.com$|(^|\.)redditstatic\.com$/.test(u.hostname); } catch { return false; } };

export async function avatarFor(deps: Deps, api: AvatarApi, user: Player, name: unknown): Promise<{ ok: true; value: { url: string | null } } | Fail> {
  if (typeof name !== 'string' || !VISITOR_NAME.test(name)) return fail(400, 'That is not a Reddit name.');
  if (!(await withinRate(deps.store, `rate:avatar:${user.id}`, 40, 60))) return fail(429, 'Slow down a little and try again.');
  const cached = await deps.store.get(key(name));
  if (cached !== undefined) return { ok: true, value: { url: cached === '' ? null : cached } };
  let url: string | null = null;
  try { const found = await api.snoovatarUrl(name); url = found && isRedditImage(found) ? found : null; } catch { url = null; }
  await deps.store.set(key(name), url ?? '', { expiration: new Date(deps.now() + TTL * 1000) });
  return { ok: true, value: { url } };
}
