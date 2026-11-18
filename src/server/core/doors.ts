import { cardThought, nightSummary } from '../../management/awards';
import { createDailyHeadline } from '../../management/daily-headline';
import { runService } from '../../management/replay';
import { houseStyle, type BulletinNote, type DoorSummary, type VisitResult } from '../../management/social';
import { DISH_IDS, VISITOR_NAME, restaurantSchema, type RestaurantState, type VisitNote } from '../../management/types';
import type { StoredRun } from '../../shared/api';
import { keys, loadPark, utcDate, type Deps, type Fail, type Player } from './game';
import { SAMPLES, sampleState } from './samples';
import { withinRate } from './store';

/**
 * Open doors and the bulletin. A kitchen can be left open after a night; a neighbor visits by having one service played in it with
 * themselves as the guest. The server runs that service from the stored kitchen with the same engine that locks scores, so a visit is
 * verifiable and cannot be forged, and it never touches the host's saved restaurant, cash or stars. The host gets a short canned note.
 */

type StoredDoor = { host: string | null; kitchen: string; style: string; blurb: string; state: RestaurantState };
const doorKey = (uid: string): string => `door:${uid}`, bulletinKey = (uid: string): string => `bulletin:${uid}`;
export const DOORS_KEY = 'doors', VISITED_KEY = (date: string): string => `visited:${date}`;
const DOOR_TTL = 7 * 86400, BULLETIN_TTL = 30 * 86400, BULLETIN_KEEP = 20, MAX_VISITS_PER_DAY = 3, LIST_MAX = 8;
const fail = (status: Fail['status'], error: string): Fail => ({ ok: false, status, error });
const DOOR_ID = /^(sample-[a-z]+|t2_[a-z0-9]+)$/;

// ---- the host's door -------------------------------------------------------------------------------------------------------

/** Leave the kitchen open, or close the door. Needs a night closed today, and a moderator who allows open doors. */
export async function setDoor(deps: Deps, user: Player, open: boolean, allowed: boolean): Promise<{ ok: true; value: { open: boolean } } | Fail> {
  if (!(await withinRate(deps.store, `rate:door:${user.id}`, 10, 60))) return fail(429, 'Slow down a little and try again.');
  if (!open) { await deps.store.del(doorKey(user.id)); await deps.store.zRem(DOORS_KEY, [user.id]); return { ok: true, value: { open: false } }; }
  if (!allowed) return fail(409, 'The moderators of this community have switched open doors off.');
  const date = utcDate(deps.now()), rawRun = await deps.store.hGet(keys.runs(date), user.id);
  if (!rawRun) return fail(409, 'Close a night first, then you can leave your door open.');
  const run = JSON.parse(rawRun) as StoredRun, park = await loadPark(deps, user); if ('status' in park) return park;
  const state: RestaurantState = { ...park.state, visitors: [], phase: 'planning' };
  const door: StoredDoor = { host: VISITOR_NAME.test(user.name) ? user.name : null, kitchen: state.name, style: houseStyle(state), blurb: cardThought(run.night.card), state };
  await deps.store.set(doorKey(user.id), JSON.stringify(door), { expiration: new Date(deps.now() + DOOR_TTL * 1000) });
  await deps.store.zAdd(DOORS_KEY, { member: user.id, score: deps.now() }); await deps.store.expire(DOORS_KEY, DOOR_TTL);
  return { ok: true, value: { open: true } };
}

export async function isDoorOpen(deps: Deps, user: Player): Promise<boolean> { return (await deps.store.get(doorKey(user.id))) !== undefined; }

// ---- the street --------------------------------------------------------------------------------------------------------------

async function loadDoor(deps: Deps, id: string): Promise<StoredDoor | null> {
  if (!DOOR_ID.test(id)) return null;
  if (id.startsWith('sample-')) {
    const sample = SAMPLES.find(s => s.id === id), state = sampleState(id);
    return sample && state ? { host: null, kitchen: sample.kitchen, style: sample.style, blurb: sample.blurb, state } : null;
  }
  const raw = await deps.store.get(doorKey(id)); if (!raw) return null;
  try {
    const door = JSON.parse(raw) as StoredDoor, state = restaurantSchema.safeParse(door.state);
    return state.success && typeof door.kitchen === 'string' ? { ...door, state: state.data as RestaurantState } : null;
  } catch { return null; }
}
const summary = (id: string, door: StoredDoor): DoorSummary => ({ id, kind: id.startsWith('sample-') ? 'sample' : 'real', kitchen: door.kitchen, style: door.style, host: door.host, blurb: door.blurb });

/** One kitchen by its id, whether or not it is among the newest, or null if its door is closed. */
export async function doorSummary(deps: Deps, id: string): Promise<DoorSummary | null> { const door = await loadDoor(deps, id); return door ? summary(id, door) : null; }

/** The sample kitchens, then the newest real doors that are not the player's own. Samples are always labelled as such by the client. */
export async function listDoors(deps: Deps, user: Player): Promise<DoorSummary[]> {
  const out: DoorSummary[] = [];
  const recent = await deps.store.zRange(DOORS_KEY, 0, 11, { reverse: true });
  for (const { member } of recent) {
    if (member === user.id || out.length >= LIST_MAX - SAMPLES.length) continue;
    const door = await loadDoor(deps, member); if (door) out.push(summary(member, door));
  }
  for (const sample of SAMPLES) { const door = await loadDoor(deps, sample.id); if (door) out.push(summary(sample.id, door)); }
  return out.slice(0, LIST_MAX);
}

const lineFor = (note: Pick<VisitNote, 'outcome' | 'tip' | 'wait' | 'quality'>): string =>
  note.outcome === 'served' ? `Served in ${note.wait}s${note.quality === 3 ? ', perfectly cooked' : ''}, tip $${note.tip}` : note.outcome === 'left' ? 'Waited too long and left' : 'Nothing on the menu was for them';

/** Play one service in a kitchen with the visitor as a guest. One visit to a door per day, three a day in all. */
export type VisitNotify = (hostId: string, note: BulletinNote) => Promise<void>;
export async function visitDoor(deps: Deps, user: Player, doorId: string, dish: unknown, notify?: VisitNotify): Promise<{ ok: true; value: VisitResult } | Fail> {
  if (!(await withinRate(deps.store, `rate:visit:${user.id}`, 6, 60))) return fail(429, 'Slow down a little and try again.');
  if (typeof dish !== 'string' || !(DISH_IDS as readonly string[]).includes(dish)) return fail(400, 'That is not a dish on the menu.');
  if (!VISITOR_NAME.test(user.name)) return fail(400, 'Your name cannot be shown in someone else’s kitchen.');
  if (doorId === user.id) return fail(400, 'This is your own door. Visit a neighbor.');
  const door = await loadDoor(deps, doorId); if (!door) return fail(409, 'That door is closed now.');
  const date = utcDate(deps.now()), visited = VISITED_KEY(date);
  if ((await deps.store.hGet(visited, `${user.id}:${doorId}`)) !== undefined) return fail(409, 'You already visited this kitchen today. Try another.');
  if ((await deps.store.hIncrBy(visited, `count:${user.id}`, 1)) > MAX_VISITS_PER_DAY) return fail(429, 'Three visits a day is plenty. Come back tomorrow.');
  await deps.store.hSet(visited, { [`${user.id}:${doorId}`]: '1' }); await deps.store.expire(visited, 3 * 86400);

  const state: RestaurantState = { ...door.state, visitors: [{ name: user.name, dish: dish as (typeof DISH_IDS)[number] }] };
  // A kitchen that needs a dish the visitor's stored menu cannot cook is still a kitchen: the replay decides, not this code.
  const replay = runService(state, [], createDailyHeadline(date));
  if ('error' in replay) return fail(409, 'That kitchen could not open tonight.');
  const note = replay.state.night.visitors.find(v => v.name === user.name) ?? { name: user.name, outcome: 'left' as const, tip: 0, wait: 0, quality: 0 };
  const result: VisitResult = { door: summary(doorId, door), outcome: note.outcome, tip: note.tip, wait: note.wait, line: lineFor(note) };
  if (!doorId.startsWith('sample-')) {
    const entry: BulletinNote = { visitor: user.name, kitchen: door.kitchen, outcome: note.outcome, tip: note.tip, line: result.line, thought: cardThought(nightSummary(replay.state, replay.report).card), date };
    const key = bulletinKey(doorId);
    await deps.store.zAdd(key, { member: JSON.stringify(entry), score: deps.now() }); await deps.store.expire(key, BULLETIN_TTL);
    const old = await deps.store.zRange(key, 0, -(BULLETIN_KEEP + 1)); if (old.length) await deps.store.zRem(key, old.map(o => o.member));
    // A live heads-up for a host who has the game open. Best effort: the note is already on the bulletin either way.
    try { await notify?.(doorId, entry); } catch { /* realtime is a courtesy */ }
  }
  return { ok: true, value: result };
}

/** What neighbors have said about the host's kitchen, newest first. */
export async function readBulletin(deps: Deps, user: Player): Promise<BulletinNote[]> {
  const rows = await deps.store.zRange(bulletinKey(user.id), 0, 9, { reverse: true });
  return rows.flatMap(row => { try { const n = JSON.parse(row.member) as BulletinNote; return typeof n.visitor === 'string' && typeof n.line === 'string' && typeof n.thought === 'string' ? [n] : []; } catch { return []; } });
}
