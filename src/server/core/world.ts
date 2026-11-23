import { CROPS, CROP_IDS, GOODS, RECIPES, MAX_STATION_LEVEL, UPGRADABLE, UPGRADE_STEPS, WATER_CUT, buildersFor, rushCost, WILT_AFTER, levelFor, nextLevelAt, ordersFor, plotsFor, wiltedYield, type CropId, type Order, type Pantry } from '../../management/crops';
import { CATALOG, stationLevel, width, type RestaurantState } from '../../management/types';
import { layoutError } from '../../management/layout';
import type { PlotView, WorldResponse, WorldView, XpGain } from '../../shared/api';
import { casUpdate, withinRate } from './store';
import { PARTY_TIERS, claimTier, fridgeLeave, fridgeTake, fridgeUntake, fridgeUnleave, fridgeView, partyView, unclaimTier } from './block';
import { loadWorld, saveWorld, worldKey, type World } from './worldstore';
import { CRATE, CRATE_AT, bumpRound, roundFor, roundView, type TaskKind } from '../../management/round';

/** One event for the daily round: progress, and the task's XP once it is finished. */
function onRound(world: World, now: number, kind: TaskKind, value: number): World {
  const b = bumpRound(world.round, utcDate(now), levelFor(world.xp), kind, value);
  return { ...world, round: b.round, xp: world.xp + b.xp };
}
import { hasLiveOpen, loadPark, settleUpgrades, TTL, utcDate, keys, type Deps, type Fail, type Park, type Player } from './game';

/**
 * The world between nights: the rooftop garden, the order board and experience. It runs on the SERVER clock (every time here is a timestamp
 * the server wrote), is changed only through the routes in this file, and is not replayed. It reaches a night only as inputs: the pantry and the
 * cash sit in the saved restaurant, which the next opening copies into its snapshot. Changing the phone's clock changes nothing here.
 */
const fail = (status: Fail['status'], error: string): Fail => ({ ok: false, status, error });
async function guard(deps: Deps, uid: string): Promise<Fail | null> { return (await withinRate(deps.store, `rate:world:${uid}`, 90, 60)) ? null : fail(429, 'Slow down a little and try again.'); }

/** A saved layout fits when it names exactly the pieces in the room now. */
function layoutFits(layout: { items: { id: number }[] }, park: RestaurantState): boolean {
  const ids = new Set(park.furniture.map(f => f.id));
  return layout.items.length === ids.size && layout.items.every(i => ids.has(i.id));
}

/** The garden as the screen shows it: grown to the number of plots the level allows, with everything derived from the server's `now`. */
function view(world: World, park: RestaurantState, now: number, block: WorldView['block']): WorldView {
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
  const workshop = GOODS.map(good => { const r = RECIPES[good], job = world.crafts.find(c => c.good === good);
    return { good, name: r.name, level: r.level, seconds: r.seconds, yield: r.yield, inputs: r.inputs, readyAt: job ? job.readyAt : null, unlocked: level >= r.level, canStart: level >= r.level && !job && r.inputs.every(i => (park.pantry[i.crop] ?? 0) >= i.n) }; });
  return { type: 'world', round: roundView(world.round, date, level), now, xp: world.xp, level, nextXp: nextLevelAt(world.xp), slots, plots, orders, pantry: park.pantry as Pantry, cash: park.cash, builders: { count: buildersFor(level), jobs, rushUsed: world.rushDate === date }, stations, block, workshop, layouts: world.layouts.map(l => l ? { pieces: l.items.length, fits: layoutFits(l, park) } : null) };
}

async function blockOf(deps: Deps, uid: string): Promise<WorldView['block']> {
  const date = utcDate(deps.now()); return { party: await partyView(deps.store, date, uid), fridge: await fridgeView(deps.store, date, uid) };
}

export async function getWorld(deps: Deps, user: Player): Promise<{ ok: true; value: WorldView } | Fail> {
  const limited = await guard(deps, user.id); if (limited) return limited;
  const first = await loadPark(deps, user); if ('status' in first) return first;
  const park = await settleUpgrades(deps, user, first);
  return { ok: true, value: view(await loadWorld(deps.store, user.id), park.state, deps.now(), await blockOf(deps, user.id)) };
}

/** `pre` runs before the restaurant is written and may refuse; `undo` puts it back if the restaurant then refuses. */
type Change = { world: World; park?: (state: RestaurantState) => string | null; pre?: () => Promise<string | null>; undo?: () => Promise<void> };
/**
 * Apply one change to the world and, when it touches money or the pantry, to the saved restaurant in the same request. The restaurant's own
 * revision is checked, so a stale tab cannot overwrite a newer one; the world is written only after the restaurant took the change.
 */
async function change(deps: Deps, user: Player, rev: number, make: (world: World, park: RestaurantState, now: number) => Change | string): Promise<{ ok: true; value: WorldResponse } | Fail> {
  const limited = await guard(deps, user.id); if (limited) return limited;
  const first = await loadPark(deps, user); if ('status' in first) return first;
  const loaded = await settleUpgrades(deps, user, first);
  if (loaded.state.phase !== 'planning') return fail(409, 'The garden is closed while the doors are open.');
  // A service that is open right now holds the restaurant's revision: the garden waits until it is shut. One abandoned long ago does not.
  if (await hasLiveOpen(deps, user.id)) return fail(409, "Finish tonight's service first: the garden waits until the doors are shut.");
  const world = await loadWorld(deps.store, user.id), now = deps.now(), made = make(world, loaded.state, now);
  if (typeof made === 'string') return fail(400, made);
  const early = made.pre ? await made.pre() : null; if (early) return fail(400, early);
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
  if ('error' in result) await made.undo?.();
  if ('error' in result) return refusal.text ? fail(400, refusal.text) : (() => { const conflict = !!result.conflict || result.error.includes('another tab'); return { ok: false as const, status: conflict ? 409 as const : 400 as const, error: result.error, conflict }; })();
  await saveWorld(deps.store, user.id, made.world, deps.now());
  return { ok: true, value: { ...view(made.world, finalState ?? loaded.state, now, await blockOf(deps, user.id)), rev: result.value.rev, park: result.value.state } };
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
  return { world: onRound(next, now, 'plant', 1), park: s => { if (s.cash < CROPS[crop].seed) return `Seeds cost $${CROPS[crop].seed}.`; s.cash -= CROPS[crop].seed; return null; } };
});

export const water = (deps: Deps, user: Player, rev: number, plotIndex: number) => change(deps, user, rev, (world, _park, now) => {
  const p = world.plots[plotIndex]; if (!p) return 'There is nothing to water.';
  if (now >= p.readyAt) return 'It is ready: harvest it.';
  if (p.watered) return 'Already watered.';
  const next: World = { ...world, plots: world.plots.map((x, i) => i === plotIndex ? { ...p, readyAt: p.readyAt - Math.floor((p.readyAt - now) * WATER_CUT), watered: true } : x) };
  return { world: onRound(next, now, 'water', 1) };
});

export const harvest = (deps: Deps, user: Player, rev: number, plotIndex: number) => change(deps, user, rev, (world, _park, now) => {
  const p = world.plots[plotIndex]; if (!p) return 'There is nothing to pick.';
  if (now < p.readyAt) return 'Not ready yet.';
  const units = now - p.readyAt >= WILT_AFTER * 1000 ? wiltedYield(p.crop) : CROPS[p.crop].yield;
  const next: World = { ...world, xp: world.xp + CROPS[p.crop].xp, plots: world.plots.map((x, i) => i === plotIndex ? null : x) };
  return { world: onRound(next, now, 'harvest', 1), park: s => { s.pantry[p.crop] = (s.pantry[p.crop] ?? 0) + units; return null; } };
});

export const deliver = (deps: Deps, user: Player, rev: number, index: number) => change(deps, user, rev, (world, _park, now) => {
  const date = utcDate(now), level = levelFor(world.xp), order = ordersFor(date, level)[index];
  if (!order) return 'There is no such order.';
  const done = world.orders.date === date ? world.orders.done : [];
  if (done.includes(index)) return 'You already filled that one.';
  const next: World = { ...world, xp: world.xp + order.xp, orders: { date, done: [...done, index] } };
  return { world: onRound(next, now, 'order', 1), park: s => {
    for (const w of order.wants) if ((s.pantry[w.crop] ?? 0) < w.n) return 'Not enough in the pantry yet.';
    for (const w of order.wants) { s.pantry[w.crop] = (s.pantry[w.crop] ?? 0) - w.n; if (!s.pantry[w.crop]) delete s.pantry[w.crop]; }
    s.cash += order.reward; return null;
  } };
});

/** Experience from a closed service, added to the world the lock does not otherwise touch. Returns what was gained and the level reached. */
export async function awardXp(deps: Deps, uid: string, gained: number, night?: { served: number; stars: number; chain: number }): Promise<XpGain> {
  let world = await loadWorld(deps.store, uid); const before = levelFor(world.xp), start = world.xp, now = deps.now();
  world.xp += gained;
  // The daily round's service tasks, from the replayed receipt only.
  if (night) { world = onRound(world, now, 'serve', night.served); world = onRound(world, now, 'stars', night.stars); world = onRound(world, now, 'combo', night.chain); }
  await saveWorld(deps.store, uid, world, now);
  const level = levelFor(world.xp); return { gained: world.xp - start, level, leveledUp: level > before };
}

/** The weekly crate: cash and XP once a week, after CRATE_AT full rounds. */
export const claimCrate = (deps: Deps, user: Player, rev: number) => change(deps, user, rev, (world, _park, now) => {
  const r = roundFor(world.round, utcDate(now), levelFor(world.xp));
  if (r.crate) return 'This week’s crate is already open.';
  if (r.full < CRATE_AT) return `Finish ${CRATE_AT - r.full} more daily ${CRATE_AT - r.full === 1 ? 'round' : 'rounds'} this week to open the crate.`;
  return { world: { ...world, round: { ...r, crate: true }, xp: world.xp + CRATE.xp }, park: s => { s.cash += CRATE.cash; return null; } };
});

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

/** Collect a block-party gift: cash, once per tier, for anyone who earned a star this week while the community reached it. */
export const claimParty = (deps: Deps, user: Player, rev: number, tier: number) => change(deps, user, rev, (world, _park, now) => {
  const t = PARTY_TIERS[tier]; if (!t) return 'There is no such tier.';
  const date = utcDate(now);
  return { world, pre: async () => {
    const view = await partyView(deps.store, date, user.id), mine = view.tiers[tier];
    if (!mine.reached) return 'The block has not reached that yet.'; if (mine.claimed) return 'You already collected that one.'; if (view.mine <= 0) return 'Earn a star this week to share in the gifts.';
    return (await claimTier(deps.store, date, user.id, tier)) ? null : 'You already collected that one.';
  }, undo: () => unclaimTier(deps.store, date, user.id, tier), park: s => { s.cash += t.reward; return null; } };
});

/** Leave one crop in the shared fridge (once a day). */
export const leaveInFridge = (deps: Deps, user: Player, rev: number, crop: CropId) => change(deps, user, rev, (world, park, now) => {
  const date = utcDate(now);
  if (!CROP_IDS.includes(crop)) return 'That is not a crop we know.';
  if ((park.pantry[crop] ?? 0) < 1) return 'You have none of that to leave.';
  return { world, pre: async () => (await fridgeLeave(deps.store, date, user.id, crop)) ? null : 'You already left something today.', undo: () => fridgeUnleave(deps.store, date, user.id, crop),
    park: s => { if ((s.pantry[crop] ?? 0) < 1) return 'You have none of that to leave.'; s.pantry[crop] = (s.pantry[crop] ?? 0) - 1; if (!s.pantry[crop]) delete s.pantry[crop]; return null; } };
});

/** Take one crop from the shared fridge (once a day). */
export const takeFromFridge = (deps: Deps, user: Player, rev: number, crop: CropId) => change(deps, user, rev, (world, _park, now) => {
  const date = utcDate(now);
  if (!CROP_IDS.includes(crop)) return 'That is not a crop we know.';
  return { world, pre: async () => { const r = await fridgeTake(deps.store, date, user.id, crop); return r === 'ok' ? null : r === 'already' ? 'You already took something today.' : 'There is none of that in the fridge.'; },
    undo: () => fridgeUntake(deps.store, date, user.id, crop), park: s => { s.pantry[crop] = (s.pantry[crop] ?? 0) + 1; return null; } };
});

/** Start a batch in the workshop: the produce goes in now, the goods come out on real time. One batch per good at a time. */
export const startCraft = (deps: Deps, user: Player, rev: number, good: string) => change(deps, user, rev, (world, park, now) => {
  const recipe = (RECIPES as Record<string, (typeof RECIPES)[keyof typeof RECIPES]>)[good]; if (!recipe) return 'That is not on the workshop\'s list.';
  if (levelFor(world.xp) < recipe.level) return `${recipe.name} opens at level ${recipe.level}.`;
  if (world.crafts.some(c => c.good === good)) return 'That batch is already cooking.';
  if (!recipe.inputs.every(i => (park.pantry[i.crop] ?? 0) >= i.n)) return 'Not enough produce in the pantry.';
  return { world: onRound({ ...world, crafts: [...world.crafts, { good, readyAt: now + recipe.seconds * 1000 }] }, now, 'craft', 1), park: s => {
    for (const i of recipe.inputs) { if ((s.pantry[i.crop] ?? 0) < i.n) return 'Not enough produce in the pantry.'; s.pantry[i.crop] = (s.pantry[i.crop] ?? 0) - i.n; if (!s.pantry[i.crop]) delete s.pantry[i.crop]; }
    return null;
  } };
});

/** Take a finished batch into the pantry. */
export const collectCraft = (deps: Deps, user: Player, rev: number, good: string) => change(deps, user, rev, (world, _park, now) => {
  const recipe = (RECIPES as Record<string, (typeof RECIPES)[keyof typeof RECIPES]>)[good], job = world.crafts.find(c => c.good === good);
  if (!recipe || !job) return 'There is nothing cooking there.';
  if (now < job.readyAt) return 'Not ready yet.';
  return { world: { ...world, xp: world.xp + recipe.xp, crafts: world.crafts.filter(c => c !== job) }, park: s => { s.pantry[good] = (s.pantry[good] ?? 0) + recipe.yield; return null; } };
});

/** Remember where every piece stands, in one of three slots. */
export const saveLayout = (deps: Deps, user: Player, rev: number, slot: number) => change(deps, user, rev, (world, park) => {
  if (!(slot >= 0 && slot < 3)) return 'There is no such slot.';
  const layouts = world.layouts.map((l, i) => i === slot ? { items: park.furniture.map(f => ({ id: f.id, x: f.x, z: f.z, rotation: f.rotation })) } : l);
  return { world: { ...world, layouts } };
});

/** Put every piece back where a slot remembers. Free, only between services, and only if the room still holds the same pieces. */
export const useLayout = (deps: Deps, user: Player, rev: number, slot: number) => change(deps, user, rev, (world, park) => {
  const layout = world.layouts[slot]; if (!layout) return 'That slot is empty.';
  if (!layoutFits(layout, park)) return 'You have bought or sold something since you saved this one. Save it again.';
  return { world, park: s => {
    for (const item of layout.items) { const f = s.furniture.find(x => x.id === item.id)!; f.x = item.x; f.z = item.z; f.rotation = item.rotation; }
    const error = layoutError(s.furniture, width(s)); return error ? `That arrangement does not work here: ${error}` : null;
  } };
});
