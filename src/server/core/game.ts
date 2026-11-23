import { createDailyHeadline, dayOfYear, daysInYear, mixSeed, shiftDate, weekday } from '../../management/daily-headline';
import { applyPlanning, actionLogSchema, isServiceAction, MAX_SERVICE_ACTIONS, openError, runService, type Action } from '../../management/replay';
import { nightSummary } from '../../management/awards';
import { houseStyle } from '../../management/social';
import { evaluateStars, packScore } from '../../management/stars';
import { createRestaurant, restaurantSchema, type RestaurantState, type Shift } from '../../management/types';
import type { LockResponse, OpenResponse, SaveResponse, StoredRun, TodayResponse, WeekView } from '../../shared/api';
import { pendingBonus, spendBonus } from './arcade';
import { pickVisitors } from './presence';
import { casUpdate, withinRate, type Store } from './store';
import { dueJobs, loadWorld, saveWorld } from './worldstore';
import { addPartyStars } from './block';
import { tourSeen } from './tour';

/** Everything here is deterministic and talks only to `Store`, so the rules run unchanged in tests and on Devvit. */
export type Deps = { store: Store; now: () => number };
export type Player = { id: string; name: string };
export type Fail = { ok: false; status: 400 | 401 | 409 | 429 | 500; error: string; conflict?: boolean };
export type Park = { rev: number; state: RestaurantState };
type StoredOpen = { snapshot: RestaurantState; parkRev: number; openedAt: number };

const DAY = 86400;
export const TTL = { park: 30 * DAY, run: 30 * DAY, board: 45 * DAY, streak: 400 * DAY, profile: 30 * DAY } as const;
/** Who was first seen when, and who was active each day: the only inputs to the moderators' retention report. Ids only, no names. */
export const COHORT_KEY = 'cohort:first', activeKey = (date: string): string => `active:${date}`;
export const ACTIVE_TTL = 40 * DAY, COHORT_TTL = 150 * DAY;
async function recordActivity(store: Store, uid: string, date: string): Promise<void> {
  await store.hSetNX(COHORT_KEY, uid, date); await store.expire(COHORT_KEY, COHORT_TTL);
  await store.hSet(activeKey(date), { [uid]: '1' }); await store.expire(activeKey(date), ACTIVE_TTL);
}

/** Dinner keeps the keys it always had; a lunch has its own, so the two services of a day never touch each other's open, result or board. */
const slot = (date: string, shift: Shift): string => shift === 'lunch' ? `${date}:lunch` : date;
export const keys = {
  park: (uid: string) => `park:${uid}`,
  opens: (date: string, shift: Shift = 'dinner') => `opens:${slot(date, shift)}`,
  runs: (date: string, shift: Shift = 'dinner') => `runs:${slot(date, shift)}`,
  board: (date: string, shift: Shift = 'dinner') => `lb:${slot(date, shift)}`,
  community: (date: string) => `community:${date}`,
  streak: (uid: string, year: number) => `streak:${uid}:${year}`,
  profile: (uid: string) => `profile:${uid}`,
};

export function utcDate(ms: number): string { const d = new Date(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
const fail = (status: Fail['status'], error: string, extra: { conflict?: boolean } = {}): Fail => ({ ok: false, status, error, ...extra });
const expiration = (now: number, seconds: number) => new Date(now + seconds * 1000);
function strHash(text: string): number { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0; return h; }

/** A stale revision and a lost race are both "another tab changed your restaurant": the client reloads and retries. */
function casFail(result: { error: string; conflict?: boolean }): Fail {
  const conflict = !!result.conflict || result.error.includes('another tab');
  return fail(conflict ? 409 : 400, result.error, { conflict });
}

/** Plans may only touch today or yesterday (a service that opened before UTC midnight may close after it). */
export function dateAllowed(date: string, today: string): boolean { return date === today || date === shiftDate(today, -1); }

async function guard(deps: Deps, uid: string, action: string, max: number): Promise<Fail | null> {
  return (await withinRate(deps.store, `rate:${action}:${uid}`, max, 60)) ? null : fail(429, 'Slow down a little and try again.');
}

// ---- park -------------------------------------------------------------------------------------------------------

function parsePark(raw: string): Park | null {
  try {
    const value = JSON.parse(raw) as { rev?: unknown; state?: unknown }, state = restaurantSchema.safeParse(value.state);
    return state.success && typeof value.rev === 'number' ? { rev: value.rev, state: state.data as RestaurantState } : null;
  } catch { return null; }
}

/** Each player's first park is the starter restaurant with a seed of their own, so two kitchens never share a queue by accident. */
export async function loadPark(deps: Deps, user: Player): Promise<Park | Fail> {
  const key = keys.park(user.id), raw = await deps.store.get(key);
  if (raw) { const park = parsePark(raw); return park ?? fail(500, 'Your saved restaurant could not be read.'); }
  const fresh: Park = { rev: 1, state: { ...createRestaurant(), welcomed: true, seed: mixSeed(strHash(user.id)) } };
  await deps.store.set(key, JSON.stringify(fresh), { nx: true, expiration: expiration(deps.now(), TTL.park) });
  const stored = await deps.store.get(key), park = stored ? parsePark(stored) : null;
  return park ?? fail(500, 'Your saved restaurant could not be created.');
}

/** A service that has been open longer than this is abandoned (a reload, a closed app): it no longer holds the restaurant. A real one lasts under five minutes. */
export const OPEN_LIVE_MS = 12 * 60 * 1000;
/** Whether the player has a service open right now: opened recently and not yet closed. Stale entries from earlier abandoned services do not count. */
export async function hasLiveOpen(deps: Deps, uid: string): Promise<boolean> {
  const today = utcDate(deps.now());
  for (const date of [today, shiftDate(today, -1)]) for (const shift of ['dinner', 'lunch'] as const) {
    const raw = await deps.store.hGet(keys.opens(date, shift), uid); if (!raw) continue;
    try { if (deps.now() - (JSON.parse(raw) as StoredOpen).openedAt < OPEN_LIVE_MS) return true; } catch { /* an unreadable entry is not live */ }
  }
  return false;
}

/**
 * A builder's finished job becomes a level on the piece in the saved restaurant. It is written without a new revision (nothing the player has
 * open becomes stale by it), and never while a service is open, because that service's close would overwrite it: the job then waits.
 */
export async function settleUpgrades(deps: Deps, user: Player, park: Park): Promise<Park> {
  const world = await loadWorld(deps.store, user.id), now = deps.now(), due = dueJobs(world, now);
  if (!due.length) return park;
  if (await hasLiveOpen(deps, user.id)) return park;
  const result = await casUpdate<Park>(deps.store, keys.park(user.id), current => {
    const p = current ?? park, state = structuredClone(p.state);
    for (const job of due) if (state.furniture.some(f => f.id === job.furnitureId)) state.levels[String(job.furnitureId)] = job.toLevel;
    return { value: { rev: p.rev, state } };
  }, { ttlSeconds: TTL.park, now: deps.now });
  if ('error' in result) return park;
  world.jobs = world.jobs.filter(j => !due.includes(j)); await saveWorld(deps.store, user.id, world, now);
  return result.value;
}

async function touchProfile(deps: Deps, user: Player): Promise<void> {
  await deps.store.set(keys.profile(user.id), JSON.stringify({ username: user.name, lastSeen: deps.now() }), { expiration: expiration(deps.now(), TTL.profile) });
  await recordActivity(deps.store, user.id, utcDate(deps.now()));
}

/** Persist planning changes. The server applies them with the engine's own methods, so cash and layout rules are the game's. */
export async function savePark(deps: Deps, user: Player, rev: number, actions: Action[]): Promise<{ ok: true; value: SaveResponse } | Fail> {
  const limited = await guard(deps, user.id, 'save', 120); if (limited) return limited;
  const log = actionLogSchema.safeParse(actions); if (!log.success) return fail(400, 'Invalid action log.');
  const loaded = await loadPark(deps, user); if ('status' in loaded) return loaded;
  const result = await casUpdate<Park>(deps.store, keys.park(user.id), current => {
    const park = current ?? loaded;
    if (park.rev !== rev) return { error: 'Your restaurant changed in another tab. Reload to continue.' };
    const applied = applyPlanning(park.state, log.data);
    return 'error' in applied ? { error: applied.error } : { value: { rev: park.rev + 1, state: applied.state } };
  }, { ttlSeconds: TTL.park, now: deps.now });
  if ('error' in result) return casFail(result);
  await touchProfile(deps, user);
  return { ok: true, value: { type: 'save', rev: result.value.rev, park: result.value.state } };
}

// ---- opening ----------------------------------------------------------------------------------------------------

export async function openService(deps: Deps, user: Player, rev: number, actions: Action[]): Promise<{ ok: true; value: OpenResponse } | Fail> {
  const limited = await guard(deps, user.id, 'open', 30); if (limited) return limited;
  const date = utcDate(deps.now()), headline = createDailyHeadline(date);
  const log = actionLogSchema.safeParse(actions); if (!log.success) return fail(400, 'Invalid action log.');
  const first = await loadPark(deps, user); if ('status' in first) return first;
  const loaded = await settleUpgrades(deps, user, first);
  let snapshot: RestaurantState | null = null;
  const bonus = await pendingBonus(deps, user); // research earned in the Test Kitchen, applied once with this open
  const result = await casUpdate<Park>(deps.store, keys.park(user.id), current => {
    const park = current ?? loaded;
    if (park.rev !== rev) return { error: 'Your restaurant changed in another tab. Reload to continue.' };
    const applied = applyPlanning(park.state, log.data);
    if ('error' in applied) return { error: applied.error };
    applied.state.research.points += bonus;
    const blocked = openError(applied.state);
    if (blocked) return { error: blocked };
    snapshot = applied.state;
    return { value: { rev: park.rev + 1, state: applied.state } };
  }, { ttlSeconds: TTL.park, now: deps.now });
  if ('error' in result) return casFail(result);
  if (!snapshot) return fail(400, 'Could not open.');
  await spendBonus(deps, user, bonus);
  // Neighbors who have the post open come over. They live only in this service's snapshot: the park itself never holds them.
  snapshot = { ...(snapshot as RestaurantState), visitors: await pickVisitors(deps, user.id) };
  const entry: StoredOpen = { snapshot, parkRev: result.value.rev, openedAt: deps.now() };
  const shift = snapshot.shift;
  await deps.store.hSet(keys.opens(date, shift), { [user.id]: JSON.stringify(entry) });
  await deps.store.expire(keys.opens(date, shift), TTL.run);
  await deps.store.hIncrBy(keys.community(date), 'opens', 1);
  await deps.store.expire(keys.community(date), TTL.board);
  await touchProfile(deps, user);
  return { ok: true, value: { type: 'open', date, rev: result.value.rev, headline, snapshot } };
}

// ---- locking ----------------------------------------------------------------------------------------------------

const better = (a: StoredRun, b: StoredRun): boolean => a.stars.stars > b.stars.stars || (a.stars.stars === b.stars.stars && a.report.profit > b.report.profit);

/** Replay the opened service on the server. Its receipt is the only one that counts; the client's run is a preview. */
export async function lockService(deps: Deps, user: Player, date: string, actions: Action[], shift: Shift = 'dinner'): Promise<{ ok: true; value: LockResponse } | Fail> {
  const limited = await guard(deps, user.id, 'lock', 10); if (limited) return limited;
  const today = utcDate(deps.now());
  if (!dateAllowed(date, today)) return fail(400, 'That service is too old to close.');
  const log = actionLogSchema.safeParse(actions); if (!log.success) return fail(400, 'Invalid action log.');
  // Planning changes were applied when the doors opened. What arrives now is only what the owner did at the pass.
  if (log.data.some(a => !isServiceAction(a))) return fail(400, 'Planning changes belong to /api/save and /api/open.');
  if (log.data.length > MAX_SERVICE_ACTIONS) return fail(400, 'Too many owner actions for one service.');
  const rawOpen = await deps.store.hGet(keys.opens(date, shift), user.id);
  if (!rawOpen) return fail(409, 'There is no open service to close. Open the doors first.');
  const opened = JSON.parse(rawOpen) as StoredOpen;
  const headline = createDailyHeadline(date), replay = runService(opened.snapshot, log.data, headline);
  if ('error' in replay) return fail(400, replay.error);

  const parkResult = await casUpdate<Park>(deps.store, keys.park(user.id), current => {
    if (!current || current.rev !== opened.parkRev) return { error: 'Your restaurant changed in another tab. Reload to continue.' };
    return { value: { rev: current.rev + 1, state: replay.state } };
  }, { ttlSeconds: TTL.park, now: deps.now });
  if ('error' in parkResult) {
    // The park moved on (another tab). This service can never be applied, so drop it: otherwise every reload re-enters a service that cannot close.
    await deps.store.hDel(keys.opens(date, shift), [user.id]);
    return fail(409, parkResult.error, { conflict: true });
  }
  await deps.store.hDel(keys.opens(date, shift), [user.id]); // one open, one close: the same replay can never be submitted twice

  const history = replay.state.history, previousProfit = history.length >= 2 ? history[history.length - 2].profit : null;
  const stars = evaluateStars(replay.report, replay.state.headline!, previousProfit, history.length, shift);
  const night = nightSummary(replay.state, replay.report);
  const run: StoredRun = { report: replay.report, stars, hash: replay.hash, headline: headline.id, submittedAt: deps.now(), username: user.name, night, name: replay.state.name, style: houseStyle(replay.state), shift };
  const existingRaw = await deps.store.hGet(keys.runs(date, shift), user.id), existing = existingRaw ? (JSON.parse(existingRaw) as StoredRun) : null;
  const official = !existing || better(run, existing), replaced = !!existing && official;
  if (official) {
    await deps.store.hSet(keys.runs(date, shift), { [user.id]: JSON.stringify(run) });
    await deps.store.expire(keys.runs(date, shift), TTL.run);
    await deps.store.zAdd(keys.board(date, shift), { member: user.id, score: packScore(stars.stars, run.report.rating) });
    await deps.store.expire(keys.board(date, shift), TTL.board);
    if (!existing && shift === 'dinner') { await deps.store.hIncrBy(keys.community(date), 'locks', 1); await deps.store.expire(keys.community(date), TTL.board); }
    if (stars.stars >= 1) await markPlayed(deps.store, user.id, date);
    // The block party counts every star a verified result adds to what that player already had today for this shift.
    await addPartyStars(deps.store, date, user.id, stars.stars - (existing ? existing.stars.stars : 0));
  }
  await touchProfile(deps, user);
  return { ok: true, value: { type: 'lock', shift, hash: replay.hash, report: replay.report, stars, night, official, replaced, ...(await streakState(deps.store, user.id, today)), week: await weekStars(deps.store, user.id, today), rev: parkResult.value.rev, park: replay.state } };
}

// ---- streak -----------------------------------------------------------------------------------------------------
// One bit per UTC day per player per year (Reddit's streak guide). Only a server-verified 1-star result sets a bit.

export async function markPlayed(store: Store, uid: string, date: string): Promise<void> {
  const { year, index } = dayOfYear(date), key = keys.streak(uid, year);
  await store.bitfield(key, 'set', 'u1', index, 1);
  await store.expire(key, TTL.streak);
}

async function yearBits(store: Store, uid: string, year: number): Promise<boolean[]> {
  const key = keys.streak(uid, year), days = daysInYear(year), words = Math.ceil(days / 32), out: boolean[] = [];
  for (let w = 0; w < words; w += 3) {
    const chunk = Math.min(3, words - w), cmds: (string | number)[] = [];
    for (let i = 0; i < chunk; i++) cmds.push('get', 'u32', (w + i) * 32);
    const values = await store.bitfield(key, ...cmds);
    values.forEach((value, i) => { for (let b = 0; b < 32; b++) out[(w + i) * 32 + b] = ((value >>> (31 - b)) & 1) === 1; });
  }
  return out;
}

export const WEEK_TIERS = [{ name: 'Bronze', at: 1 }, { name: 'Silver', at: 6 }, { name: 'Gold', at: 12 }] as const;
/** Stars earned in the official results of this UTC week (Monday to Sunday), read from the day's stored runs. Nothing extra is stored. */
export async function weekStars(store: Store, uid: string, date: string): Promise<WeekView> {
  const back = (weekday(date) + 6) % 7; let stars = 0;
  for (let i = 0; i <= back; i++) for (const shift of ['dinner', 'lunch'] as const) { const raw = await store.hGet(keys.runs(shiftDate(date, -i), shift), uid); if (raw) stars += (JSON.parse(raw) as StoredRun).stars.stars; }
  const earned = WEEK_TIERS.filter(t => stars >= t.at), next = WEEK_TIERS.find(t => stars < t.at) ?? null;
  return { stars, tier: earned.length ? earned[earned.length - 1].name : null, next: next ? { name: next.name, at: next.at } : null };
}

export const FREEZE_EVERY = 7, FREEZE_MAX = 2, STREAK_WINDOW = 800;

/**
 * The streak and the freezes held, read in order from the day bits. Every FREEZE_EVERY played days in a row earn one freeze (at most
 * FREEZE_MAX are kept); a missed day spends one instead of ending the streak. Today does not count as missed until it is over, so the
 * streak stays visible all day. Nothing is stored: it is a pure reading of the bits, so a freeze can never be forged or lost.
 */
export async function streakState(store: Store, uid: string, date: string): Promise<{ streak: number; freezes: number }> {
  const cache = new Map<number, boolean[]>();
  const played = async (d: string): Promise<boolean> => { const { year, index } = dayOfYear(d); if (!cache.has(year)) cache.set(year, await yearBits(store, uid, year)); return cache.get(year)![index] === true; };
  let streak = 0, freezes = 0, day = shiftDate(date, -STREAK_WINDOW);
  for (let i = 0; i <= STREAK_WINDOW; i++, day = shiftDate(day, 1)) {
    if (await played(day)) { streak++; if (streak % FREEZE_EVERY === 0) freezes = Math.min(FREEZE_MAX, freezes + 1); }
    else if (day === date) continue; // today is still open
    else if (streak > 0 && freezes > 0) freezes--;
    else { streak = 0; freezes = 0; }
  }
  return { streak, freezes };
}

/** Consecutive played days ending today, or ending yesterday if today is not played yet, with freezes bridging single misses. */
export async function streakFor(store: Store, uid: string, date: string): Promise<number> { return (await streakState(store, uid, date)).streak; }

// ---- today ------------------------------------------------------------------------------------------------------

export async function getToday(deps: Deps, user: Player): Promise<{ ok: true; value: TodayResponse } | Fail> {
  const limited = await guard(deps, user.id, 'today', 120); if (limited) return limited;
  const date = utcDate(deps.now()), headline = createDailyHeadline(date);
  const first = await loadPark(deps, user); if ('status' in first) return first;
  const loaded = await settleUpgrades(deps, user, first);
  const [rawRun, rawOpen, rawLunchRun, rawLunchOpen, community, streak] = await Promise.all([
    deps.store.hGet(keys.runs(date), user.id), deps.store.hGet(keys.opens(date), user.id), deps.store.hGet(keys.runs(date, 'lunch'), user.id), deps.store.hGet(keys.opens(date, 'lunch'), user.id), deps.store.hGetAll(keys.community(date)), streakState(deps.store, user.id, date),
  ]);
  const week = await weekStars(deps.store, user.id, date), tour = await tourSeen(deps.store, user.id);
  const opened = rawOpen ? (JSON.parse(rawOpen) as StoredOpen) : rawLunchOpen ? (JSON.parse(rawLunchOpen) as StoredOpen) : null;
  await touchProfile(deps, user);
  return { ok: true, value: {
    type: 'today', date, headline, rev: loaded.rev, park: loaded.state,
    open: opened ? { snapshot: opened.snapshot, date } : null,
    run: rawRun ? (JSON.parse(rawRun) as StoredRun) : null, lunchRun: rawLunchRun ? (JSON.parse(rawLunchRun) as StoredRun) : null, streak: streak.streak, freezes: streak.freezes, week,
    community: { opens: Number(community.opens ?? 0), locks: Number(community.locks ?? 0) }, tour,
  } };
}
