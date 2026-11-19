import { CROPS, CROP_IDS, MAX_STATION_LEVEL, UPGRADABLE, UPGRADE_STEPS, WATER_CUT, buildersFor, rushCost, WILT_AFTER, levelFor, nextLevelAt, ordersFor, plotsFor, wiltedYield, type CropId, type Order, type Pantry } from '../../management/crops';
import { CATALOG, stationLevel, type RestaurantState } from '../../management/types';
import type { PlotView, WorldResponse, WorldView, XpGain } from '../../shared/api';
import { casUpdate, withinRate } from './store';
import { loadWorld, saveWorld, worldKey, type World } from './worldstore';
import { loadPark, settleUpgrades, TTL, utcDate, keys, type Deps, type Fail, type Park, type Player } from './game';
import { shiftDate } from '../../management/daily-headline';

/**
 * The world between nights: the rooftop garden, the order board and experience. It runs on the SERVER clock (every time here is a timestamp
 * the server wrote), is changed only through the routes in this file, and is not replayed. It reaches a night only as inputs: the pantry and the
 * cash sit in the saved restaurant, which the next opening copies into its snapshot. Changing the phone's clock changes nothing here.
 */
const fail = (status: Fail['status'], error: string): Fail => ({ ok: false, status, error });
async function guard(deps: Deps, uid: string): Promise<Fail | null> { return (await withinRate(deps.store, `rate:world:${uid}`, 90, 60)) ? null : fail(429, 'Slow down a little and try again.'); }

/** The garden as the screen shows it: grown to the number of plots the level allows, with everything derived from the server's `now`. */
function view(world: World, park: RestaurantState, now: number): WorldView {
  const level = levelFor(world.xp), slots = plotsFor(level), date = utcDate(now);
  const plots: PlotView[] = Array.from({ length: slots }, (_, index) => {
    const p = world.plots[index];
    if (!p) return { index, crop: null, readyAt: 0, plantedAt: 0, watered: false, ready: false, wilted: false, yield: 0 };
    const ready = now >= p.readyAt, wilted = ready && now - p.readyAt >= WILT_AFTER * 1000;
    return { index, crop: p.crop, plantedAt: p.plantedAt, readyAt: p.readyAt, watered: p.watered, ready, wilted, yield: wilted ? wiltedYield(p.crop) : CROPS[p.crop].yield };
  });
  const done = world.orders.date === date ? world.orders.done : [];
  const orders = ordersFor(date, level).map(o => ({ ...o, done: done.includes(o.index), canFill: o.wants.every(w => (park.pantry[w.crop] ?? 0) >= w.n) }));
  const stations = park.furniture.filter(f => (UPGRADABLE as readonly string[]).includes(f.kind)).map(f => {
    const lvl = stationLevel(park, f.id), toLevel = (lvl + 1) as 2 | 3, step = lvl < MAX_STATION_LEVEL ? UPGRADE_STEPS[toLevel] : null;
    return { id: f.id, kind: f.kind, name: CATALOG[f.kind].name, level: lvl, next: step ? { toLevel, cost: Math.floor(CATALOG[f.kind].price * step.price), seconds: step.seconds, levelNeeded: step.level } : null };
  });
  const jobs = world.jobs.map(j => ({ furnitureId: j.furnitureId, name: CATALOG[park.furniture.find(f => f.id === j.furnitureId)?.kind ?? 'prep'].name, toLevel: j.toLevel, readyAt: j.readyAt, rushCost: rushCost(Math.max(0, j.readyAt - now)) }));
  return { type: 'world', now, xp: world.xp, level, nextXp: nextLevelAt(world.xp), slots, plots, orders, pantry: park.pantry as Pantry, cash: park.cash, builders: { count: buildersFor(level), jobs, rushUsed: world.rushDate === date }, stations };
}

export async function getWorld(deps: Deps, user: Player): Promise<{ ok: true; value: WorldView } | Fail> {
  const limited = await guard(deps, user.id); if (limited) return limited;
  const first = await loadPark(deps, user); if ('status' in first) return first;
  const park = await settleUpgrades(deps, user, first);
  return { ok: true, value: view(await loadWorld(deps.store, user.id), park.state, deps.now()) };
}

type Change = { world: World; park?: (state: RestaurantState) => string | null };
/**
 * Apply one change to the world and, when it touches money or the pantry, to the saved restaurant in the same request. The restaurant's own
 * revision is checked, so a stale tab cannot overwrite a newer one; the world is written only after the restaurant took the change.
 */
async function change(deps: Deps, user: Player, rev: number, make: (world: World, park: RestaurantState, now: number) => Change | string): Promise<{ ok: true; value: WorldResponse } | Fail> {
  const limited = await guard(deps, user.id); if (limited) return limited;
  const first = await loadPark(deps, user); if ('status' in first) return first;
  const loaded = await settleUpgrades(deps, user, first);
  if (loaded.state.phase !== 'planning') return fail(409, 'The garden is closed while the doors are open.');
  // A service that was opened and not yet closed holds the restaurant's revision: the garden waits until it is.
  const today = utcDate(deps.now());
  for (const date of [today, shiftDate(today, -1)]) for (const shift of ['dinner', 'lunch'] as const) if (await deps.store.hGet(keys.opens(date, shift), user.id)) return fail(409, 'Finish tonight\'s service first: the garden waits until the doors are shut.');
  const world = await loadWorld(deps.store, user.id), now = deps.now(), made = make(world, loaded.state, now);
  if (typeof made === 'string') return fail(400, made);
  let finalState: RestaurantState | null = null; const refusal: { text: string | null } = { text: null };
  const result = await casUpdate<Park>(deps.store, keys.park(user.id), current => {
    const park = current ?? loaded;
    if (park.rev !== rev) return { error: 'Your restaurant changed in another tab. Reload to continue.' };
    const state = structuredClone(park.state);
    refusal.text = made.park ? made.park(state) : null;
    if (refusal.text) return { error: refusal.text };
    finalState = state;
    return { value: { rev: park.rev + 1, state } };
  }, { ttlSeconds: TTL.park, now: deps.now });
  if ('error' in result) return refusal.text ? fail(400, refusal.text) : (() => { const conflict = !!result.conflict || result.error.includes('another tab'); return { ok: false as const, status: conflict ? 409 as const : 400 as const, error: result.error, conflict }; })();
  await saveWorld(deps.store, user.id, made.world, deps.now());
  return { ok: true, value: { ...view(made.world, finalState ?? loaded.state, now), rev: result.value.rev, park: result.value.state } };
}

export const plant = (deps: Deps, user: Player, rev: number, plotIndex: number, crop: CropId) => change(deps, user, rev, (world, park, now) => {
  const level = levelFor(world.xp);
  if (!CROP_IDS.includes(crop)) return 'That is not a seed we know.';
  if (plotIndex < 0 || plotIndex >= plotsFor(level)) return 'That plot is not yours yet. Level up to open more.';
  if (CROPS[crop].level > level) return `${CROPS[crop].name} unlock at level ${CROPS[crop].level}.`;
  if (world.plots[plotIndex]) return 'Something is already growing there.';
  if (park.cash < CROPS[crop].seed) return `Seeds cost $${CROPS[crop].seed}.`;
  const next: World = { ...world, plots: Array.from({ length: Math.max(world.plots.length, plotIndex + 1) }, (_, i) => world.plots[i] ?? null) };
  next.plots[plotIndex] = { crop, plantedAt: now, readyAt: now + CROPS[crop].seconds * 1000, watered: false };
  return { world: next, park: s => { if (s.cash < CROPS[crop].seed) return `Seeds cost $${CROPS[crop].seed}.`; s.cash -= CROPS[crop].seed; return null; } };
});

export const water = (deps: Deps, user: Player, rev: number, plotIndex: number) => change(deps, user, rev, (world, _park, now) => {
  const p = world.plots[plotIndex]; if (!p) return 'There is nothing to water.';
  if (now >= p.readyAt) return 'It is ready: harvest it.';
  if (p.watered) return 'Already watered.';
  const next: World = { ...world, plots: world.plots.map((x, i) => i === plotIndex ? { ...p, readyAt: p.readyAt - Math.floor((p.readyAt - now) * WATER_CUT), watered: true } : x) };
  return { world: next };
});

export const harvest = (deps: Deps, user: Player, rev: number, plotIndex: number) => change(deps, user, rev, (world, _park, now) => {
  const p = world.plots[plotIndex]; if (!p) return 'There is nothing to pick.';
  if (now < p.readyAt) return 'Not ready yet.';
  const units = now - p.readyAt >= WILT_AFTER * 1000 ? wiltedYield(p.crop) : CROPS[p.crop].yield;
  const next: World = { ...world, xp: world.xp + CROPS[p.crop].xp, plots: world.plots.map((x, i) => i === plotIndex ? null : x) };
  return { world: next, park: s => { s.pantry[p.crop] = (s.pantry[p.crop] ?? 0) + units; return null; } };
});

export const deliver = (deps: Deps, user: Player, rev: number, index: number) => change(deps, user, rev, (world, _park, now) => {
  const date = utcDate(now), level = levelFor(world.xp), order = ordersFor(date, level)[index];
  if (!order) return 'There is no such order.';
  const done = world.orders.date === date ? world.orders.done : [];
  if (done.includes(index)) return 'You already filled that one.';
  const next: World = { ...world, xp: world.xp + order.xp, orders: { date, done: [...done, index] } };
  return { world: next, park: s => {
    for (const w of order.wants) if ((s.pantry[w.crop] ?? 0) < w.n) return 'Not enough in the pantry yet.';
    for (const w of order.wants) { s.pantry[w.crop] = (s.pantry[w.crop] ?? 0) - w.n; if (!s.pantry[w.crop]) delete s.pantry[w.crop]; }
    s.cash += order.reward; return null;
  } };
});

/** Experience from a closed service, added to the world the lock does not otherwise touch. Returns what was gained and the level reached. */
export async function awardXp(deps: Deps, uid: string, gained: number): Promise<XpGain> {
  const world = await loadWorld(deps.store, uid), before = levelFor(world.xp);
  world.xp += gained; await saveWorld(deps.store, uid, world, deps.now());
  const level = levelFor(world.xp); return { gained, level, leveledUp: level > before };
}

/** Put a builder on the next level of a station: it costs a share of the piece's price now and takes real time. One job per builder. */
export const upgrade = (deps: Deps, user: Player, rev: number, furnitureId: number) => change(deps, user, rev, (world, park, now) => {
  const piece = park.furniture.find(f => f.id === furnitureId);
  if (!piece || !(UPGRADABLE as readonly string[]).includes(piece.kind)) return 'Only kitchen stations can be upgraded.';
  const level = levelFor(world.xp), current = stationLevel(park, furnitureId);
  if (current >= MAX_STATION_LEVEL) return 'That station is as good as it gets.';
  if (world.jobs.some(j => j.furnitureId === furnitureId)) return 'A builder is already on that one.';
  if (world.jobs.length >= buildersFor(level)) return level < 4 ? 'Your builder is busy. A second one joins at level 4.' : 'Both builders are busy.';
  const toLevel = (current + 1) as 2 | 3, step = UPGRADE_STEPS[toLevel], cost = Math.floor(CATALOG[piece.kind].price * step.price);
  if (level < step.level) return `That upgrade needs level ${step.level}.`;
  if (park.cash < cost) return `The upgrade costs $${cost}.`;
  return { world: { ...world, jobs: [...world.jobs, { furnitureId, toLevel, readyAt: now + step.seconds * 1000 }] }, park: s => { if (s.cash < cost) return `The upgrade costs $${cost}.`; s.cash -= cost; return null; } };
});

/** Pay overtime to finish a job at once: two dollars a minute left, once a day. The piece is upgraded in the same step. */
export const rush = (deps: Deps, user: Player, rev: number, furnitureId: number) => change(deps, user, rev, (world, park, now) => {
  const date = utcDate(now), job = world.jobs.find(j => j.furnitureId === furnitureId);
  if (!job) return 'There is no job on that piece.';
  if (world.rushDate === date) return 'You have already paid overtime today.';
  const cost = rushCost(Math.max(0, job.readyAt - now));
  if (park.cash < cost) return `Overtime costs $${cost}.`;
  return { world: { ...world, rushDate: date, jobs: world.jobs.filter(j => j !== job) }, park: s => {
    if (s.cash < cost) return `Overtime costs $${cost}.`; s.cash -= cost; if (s.furniture.some(f => f.id === furnitureId)) s.levels[String(furnitureId)] = job.toLevel; return null;
  } };
});
