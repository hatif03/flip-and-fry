import { BONUS_MAX, BONUS_PER_STAR, arcadeSaveSchema, emptyArcade, mergeArcade, totalStars, type ArcadeSave } from '../../game/arcade-save';
import type { Deps, Fail, Player } from './game';
import { casUpdate, withinRate } from './store';

/**
 * The Test Kitchen's scores and outfits, kept per player so they survive an upload (localStorage does not: the iframe URL changes
 * with every upload). The arcade cannot be replayed on the server, so these numbers are bounded, never trusted as a ranking:
 * whole scores in a fixed range, a best never goes down, and nothing here feeds the leaderboard or the daily stars.
 */
const key = (uid: string): string => `arcade:${uid}`;
/** Research points earned in the Test Kitchen, waiting for the player's next Open. */
export const pendingKey = (uid: string): string => `arcade-pending:${uid}`;
const claimedKey = (date: string): string => `arcade-bonus:${date}`;
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
export async function pendingBonus(deps: Deps, user: Player): Promise<number> { const n = Number(await deps.store.get(pendingKey(user.id)) ?? 0); return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 0; }
/** Called once the points are in the park. Subtracts what was applied, so a bonus earned in between is not lost. */
export async function spendBonus(deps: Deps, user: Player, applied: number): Promise<void> { if (applied > 0) await deps.store.incrBy(pendingKey(user.id), -applied); }

export async function saveArcade(deps: Deps, user: Player, body: unknown): Promise<{ ok: true; value: ArcadeSave & { bonus: number } } | Fail> {
  if (!(await withinRate(deps.store, `rate:arcade:${user.id}`, 30, 60))) return fail(429, 'Slow down a little and try again.');
  const incoming = arcadeSaveSchema.safeParse(body);
  if (!incoming.success) return fail(400, 'Those scores do not look right.');
  let before = emptyArcade();
  const result = await casUpdate<ArcadeSave>(deps.store, key(user.id), current => { before = current ? parse(JSON.stringify(current)) : emptyArcade(); return { value: mergeArcade(before, incoming.data as ArcadeSave) }; }, { ttlSeconds: TTL_SECONDS, now: deps.now });
  if ('error' in result) return fail(409, result.error);
  // New stars earn a small research bonus, once a UTC day. It waits in Redis and goes into the park at the player's next Open.
  let bonus = 0; const gained = totalStars(result.value.progress) - totalStars(before.progress);
  if (gained > 0 && (await deps.store.hSetNX(claimedKey(new Date(deps.now()).toISOString().slice(0, 10)), user.id, '1')) === 1) {
    await deps.store.expire(claimedKey(new Date(deps.now()).toISOString().slice(0, 10)), 3 * 86400);
    bonus = Math.min(BONUS_MAX, gained * BONUS_PER_STAR);
    await deps.store.incrBy(pendingKey(user.id), bonus); await deps.store.expire(pendingKey(user.id), TTL_SECONDS);
  }
  return { ok: true, value: { ...result.value, bonus } };
}
