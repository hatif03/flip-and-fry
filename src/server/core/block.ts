import { CROP_IDS, type CropId } from '../../management/crops';
import { shiftDate, weekday } from '../../management/daily-headline';
import type { Store } from './store';

/**
 * The block: what the subreddit does together. A weekly party fed by every verified star (the lock adds them; nothing else does), with cash
 * gifts at three tiers for those who helped, and a shared fridge where a neighbor can leave one crop a day and another can take one. Counters
 * only, ids only, no names, and nothing here can be negative or written by a client's own claim.
 */
export const PARTY_TIERS = [{ at: 12, reward: 100 }, { at: 40, reward: 200 }, { at: 100, reward: 300 }] as const;
const DAY = 86400, PARTY_TTL = 21 * DAY, FRIDGE_TTL = 3 * DAY;
/** The Monday of the week a date falls in. */
export const weekOf = (date: string): string => shiftDate(date, -((weekday(date) + 6) % 7));
const partyKey = (week: string): string => `party:${week}`, byKey = (week: string): string => `party:${week}:by`, claimKey = (week: string): string => `party:${week}:claimed`;
const fridgeKey = (): string => 'fridge', fridgeDay = (date: string, kind: 'left' | 'took'): string => `fridge:${kind}:${date}`;

/** Add stars a verified service earned. A star taken back (a better result replacing one) is never subtracted: the party only counts up. */
export async function addPartyStars(store: Store, date: string, uid: string, delta: number): Promise<void> {
  if (delta <= 0) return;
  const week = weekOf(date);
  await store.hIncrBy(partyKey(week), 'stars', delta); await store.expire(partyKey(week), PARTY_TTL);
  await store.hIncrBy(byKey(week), uid, delta); await store.expire(byKey(week), PARTY_TTL);
}

export type PartyView = { week: string; stars: number; mine: number; tiers: { at: number; reward: number; reached: boolean; claimed: boolean; canClaim: boolean }[] };
export async function partyView(store: Store, date: string, uid: string): Promise<PartyView> {
  const week = weekOf(date), stars = Number(await store.hGet(partyKey(week), 'stars') ?? 0), mine = Number(await store.hGet(byKey(week), uid) ?? 0);
  const tiers = await Promise.all(PARTY_TIERS.map(async (t, i) => { const claimed = (await store.hGet(claimKey(week), `${uid}:${i}`)) === '1', reached = stars >= t.at; return { at: t.at, reward: t.reward, reached, claimed, canClaim: reached && !claimed && mine > 0 }; }));
  return { week, stars, mine, tiers };
}
/** Mark a tier claimed. Returns false if it was already, so a gift is paid once. */
export async function claimTier(store: Store, date: string, uid: string, index: number): Promise<boolean> {
  const week = weekOf(date), won = await store.hSetNX(claimKey(week), `${uid}:${index}`, '1'); await store.expire(claimKey(week), PARTY_TTL); return won === 1;
}
export async function unclaimTier(store: Store, date: string, uid: string, index: number): Promise<void> { await store.hDel(claimKey(weekOf(date)), [`${uid}:${index}`]); }

export type FridgeView = { items: Partial<Record<CropId, number>>; left: boolean; took: boolean };
export async function fridgeView(store: Store, date: string, uid: string): Promise<FridgeView> {
  const raw = await store.hGetAll(fridgeKey()), items: Partial<Record<CropId, number>> = {};
  for (const crop of CROP_IDS) { const n = Number(raw[crop] ?? 0); if (n > 0) items[crop] = n; }
  return { items, left: (await store.hGet(fridgeDay(date, 'left'), uid)) === '1', took: (await store.hGet(fridgeDay(date, 'took'), uid)) === '1' };
}
/** Put one in. Once a player a day. */
export async function fridgeLeave(store: Store, date: string, uid: string, crop: CropId): Promise<boolean> {
  if ((await store.hSetNX(fridgeDay(date, 'left'), uid, '1')) !== 1) return false;
  await store.expire(fridgeDay(date, 'left'), 2 * DAY);
  await store.hIncrBy(fridgeKey(), crop, 1); await store.expire(fridgeKey(), FRIDGE_TTL); return true;
}
export async function fridgeUnleave(store: Store, date: string, uid: string, crop: CropId): Promise<void> { await store.hIncrBy(fridgeKey(), crop, -1); await store.hDel(fridgeDay(date, 'left'), [uid]); }
/** Take one out. Once a player a day, and only if there is one: the count never goes below zero. */
export async function fridgeTake(store: Store, date: string, uid: string, crop: CropId): Promise<'ok' | 'empty' | 'already'> {
  if ((await store.hSetNX(fridgeDay(date, 'took'), uid, '1')) !== 1) return 'already';
  await store.expire(fridgeDay(date, 'took'), 2 * DAY);
  const left = await store.hIncrBy(fridgeKey(), crop, -1);
  if (left < 0) { await store.hIncrBy(fridgeKey(), crop, 1); await store.hDel(fridgeDay(date, 'took'), [uid]); return 'empty'; }
  return 'ok';
}
export async function fridgeUntake(store: Store, date: string, uid: string, crop: CropId): Promise<void> { await store.hIncrBy(fridgeKey(), crop, 1); await store.hDel(fridgeDay(date, 'took'), [uid]); }
