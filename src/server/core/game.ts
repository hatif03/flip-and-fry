import { createDailyHeadline, dayOfYear, daysInYear, mixSeed, shiftDate } from '../../management/daily-headline';
import { applyPlanning, actionLogSchema, isServiceAction, MAX_SERVICE_ACTIONS, openError, runService, type Action } from '../../management/replay';
import { nightSummary } from '../../management/awards';
import { houseStyle } from '../../management/social';
import { evaluateStars, packScore } from '../../management/stars';
import { createRestaurant, restaurantSchema, type RestaurantState } from '../../management/types';
import type { LockResponse, OpenResponse, SaveResponse, StoredRun, TodayResponse } from '../../shared/api';
import { pendingBonus, spendBonus } from './arcade';
import { pickVisitors } from './presence';
import { casUpdate, withinRate, type Store } from './store';

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

export const keys = {
  park: (uid: string) => `park:${uid}`,
  opens: (date: string) => `opens:${date}`,
  runs: (date: string) => `runs:${date}`,
  board: (date: string) => `lb:${date}`,
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
  const loaded = await loadPark(deps, user); if ('status' in loaded) return loaded;
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
  await deps.store.hSet(keys.opens(date), { [user.id]: JSON.stringify(entry) });
  await deps.store.expire(keys.opens(date), TTL.run);
  await deps.store.hIncrBy(keys.community(date), 'opens', 1);
  await deps.store.expire(keys.community(date), TTL.board);
  await touchProfile(deps, user);
  return { ok: true, value: { type: 'open', date, rev: result.value.rev, headline, snapshot } };
}

// ---- locking ----------------------------------------------------------------------------------------------------

const better = (a: StoredRun, b: StoredRun): boolean => a.stars.stars > b.stars.stars || (a.stars.stars === b.stars.stars && a.report.profit > b.report.profit);

/** Replay the opened service on the server. Its receipt is the only one that counts; the client's run is a preview. */
export async function lockService(deps: Deps, user: Player, date: string, actions: Action[]): Promise<{ ok: true; value: LockResponse } | Fail> {
  const limited = await guard(deps, user.id, 'lock', 10); if (limited) return limited;
  const today = utcDate(deps.now());
  if (!dateAllowed(date, today)) return fail(400, 'That service is too old to close.');
  const log = actionLogSchema.safeParse(actions); if (!log.success) return fail(400, 'Invalid action log.');
  // Planning changes were applied when the doors opened. What arrives now is only what the owner did at the pass.
  if (log.data.some(a => !isServiceAction(a))) return fail(400, 'Planning changes belong to /api/save and /api/open.');
  if (log.data.length > MAX_SERVICE_ACTIONS) return fail(400, 'Too many owner actions for one service.');
  const rawOpen = await deps.store.hGet(keys.opens(date), user.id);
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
    await deps.store.hDel(keys.opens(date), [user.id]);
    return fail(409, parkResult.error, { conflict: true });
  }
  await deps.store.hDel(keys.opens(date), [user.id]); // one open, one close: the same replay can never be submitted twice

  const history = replay.state.history, previousProfit = history.length >= 2 ? history[history.length - 2].profit : null;
  const stars = evaluateStars(replay.report, replay.state.headline!, previousProfit);
  const night = nightSummary(replay.state, replay.report);
  const run: StoredRun = { report: replay.report, stars, hash: replay.hash, headline: headline.id, submittedAt: deps.now(), username: user.name, night, name: replay.state.name, style: houseStyle(replay.state) };
  const existingRaw = await deps.store.hGet(keys.runs(date), user.id), existing = existingRaw ? (JSON.parse(existingRaw) as StoredRun) : null;
  const official = !existing || better(run, existing), replaced = !!existing && official;
  if (official) {
    await deps.store.hSet(keys.runs(date), { [user.id]: JSON.stringify(run) });
    await deps.store.expire(keys.runs(date), TTL.run);
    await deps.store.zAdd(keys.board(date), { member: user.id, score: packScore(stars.stars, run.report.rating) });
    await deps.store.expire(keys.board(date), TTL.board);
    if (!existing) { await deps.store.hIncrBy(keys.community(date), 'locks', 1); await deps.store.expire(keys.community(date), TTL.board); }
    if (stars.stars >= 1) await markPlayed(deps.store, user.id, date);
  }
  await touchProfile(deps, user);
  return { ok: true, value: { type: 'lock', hash: replay.hash, report: replay.report, stars, night, official, replaced, ...(await streakState(deps.store, user.id, today)), rev: parkResult.value.rev, park: replay.state } };
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
  const loaded = await loadPark(deps, user); if ('status' in loaded) return loaded;
  const [rawRun, rawOpen, community, streak] = await Promise.all([
    deps.store.hGet(keys.runs(date), user.id), deps.store.hGet(keys.opens(date), user.id), deps.store.hGetAll(keys.community(date)), streakState(deps.store, user.id, date),
  ]);
  const opened = rawOpen ? (JSON.parse(rawOpen) as StoredOpen) : null;
  await touchProfile(deps, user);
  return { ok: true, value: {
    type: 'today', date, headline, rev: loaded.rev, park: loaded.state,
    open: opened ? { snapshot: opened.snapshot, date } : null,
    run: rawRun ? (JSON.parse(rawRun) as StoredRun) : null, streak: streak.streak, freezes: streak.freezes,
    community: { opens: Number(community.opens ?? 0), locks: Number(community.locks ?? 0) },
  } };
}
