import { arcadeSaveSchema, emptyArcade, mergeArcade, type ArcadeSave } from '../../game/arcade-save';
import type { Deps, Fail, Player } from './game';
import { casUpdate, withinRate } from './store';

/**
 * The Test Kitchen's scores and outfits, kept per player so they survive an upload (localStorage does not: the iframe URL changes
 * with every upload). The arcade cannot be replayed on the server, so these numbers are bounded, never trusted as a ranking:
 * whole scores in a fixed range, a best never goes down, and nothing here feeds the leaderboard or the daily stars.
 */
const key = (uid: string): string => `arcade:${uid}`;
const TTL_SECONDS = 400 * 86400;
const fail = (status: Fail['status'], error: string): Fail => ({ ok: false, status, error });

function parse(raw: string | undefined): ArcadeSave {
  if (!raw) return emptyArcade();
  try { const r = arcadeSaveSchema.safeParse(JSON.parse(raw)); return r.success ? r.data as ArcadeSave : emptyArcade(); } catch { return emptyArcade(); }
}

export async function loadArcade(deps: Deps, user: Player): Promise<{ ok: true; value: ArcadeSave }> {
  return { ok: true, value: parse(await deps.store.get(key(user.id))) };
}

/** Merge the client's copy into the stored one. Concurrent saves from two tabs each keep their best. */
export async function saveArcade(deps: Deps, user: Player, body: unknown): Promise<{ ok: true; value: ArcadeSave } | Fail> {
  if (!(await withinRate(deps.store, `rate:arcade:${user.id}`, 30, 60))) return fail(429, 'Slow down a little and try again.');
  const incoming = arcadeSaveSchema.safeParse(body);
  if (!incoming.success) return fail(400, 'Those scores do not look right.');
  const result = await casUpdate<ArcadeSave>(deps.store, key(user.id), current => ({ value: mergeArcade(current ? parse(JSON.stringify(current)) : emptyArcade(), incoming.data as ArcadeSave) }), { ttlSeconds: TTL_SECONDS, now: deps.now });
  return 'error' in result ? fail(409, result.error) : { ok: true, value: result.value };
}
