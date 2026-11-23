import { TOUR_IDS, type TourId } from '../../shared/api';
import { withinRate, type Store } from './store';

/** What the guide has shown each player: a hash of ids (`tour:<uid>`), kept 90 days after the last change. Ids only, nothing else. */
const key = (uid: string): string => `tour:${uid}`;
const TTL_SECONDS = 90 * 24 * 3600;

export async function tourSeen(store: Store, uid: string): Promise<TourId[]> {
  const all = await store.hGetAll(key(uid));
  return TOUR_IDS.filter(id => all[id]);
}

/** Mark one id as seen. Refuses ids outside the allowlist, and more than 60 marks a minute. */
export async function markTourSeen(store: Store, uid: string, id: string): Promise<{ ok: true; value: TourId[] } | { ok: false; status: 400 | 429; error: string }> {
  if (!(TOUR_IDS as readonly string[]).includes(id)) return { ok: false, status: 400, error: 'Unknown guide step.' };
  if (!(await withinRate(store, `rate:tour:${uid}`, 60, 60))) return { ok: false, status: 429, error: 'Slow down a little and try again.' };
  await store.hSet(key(uid), { [id]: '1' });
  await store.expire(key(uid), TTL_SECONDS);
  return { ok: true, value: await tourSeen(store, uid) };
}
