import type { CropId } from '../../management/crops';
import type { Store } from './store';

/**
 * Where the world between nights is kept: one small JSON value per player in Redis. Kept apart from the rules in world.ts so the saved
 * restaurant's own module (game.ts) can settle finished builder jobs without importing the garden's routes.
 */
export type Plot = { crop: CropId; plantedAt: number; readyAt: number; watered: boolean };
/** One upgrade in progress: the piece, the level it will reach, and the server time it is done. */
export type Job = { furnitureId: number; toLevel: 2 | 3; readyAt: number };
/** One thing cooking in the workshop: the good and the server time it is done. One per good. */
export type Craft = { good: string; readyAt: number };
/** A saved arrangement of the room: where each piece (by its id) stands. */
export type Layout = { items: { id: number; x: number; z: number; rotation: number }[] };
export type World = { layouts: (Layout | null)[]; xp: number; plots: (Plot | null)[]; orders: { date: string; done: number[] }; jobs: Job[]; rushDate: string; crafts: Craft[] };
export const WORLD_TTL = 30 * 86400;
export const worldKey = (uid: string): string => `world:${uid}`;
export const freshWorld = (): World => ({ layouts: [null, null, null], xp: 0, plots: [null, null], orders: { date: '', done: [] }, jobs: [], rushDate: '', crafts: [] });

export async function loadWorld(store: Store, uid: string): Promise<World> {
  const raw = await store.get(worldKey(uid)); if (!raw) return freshWorld();
  try { const w = JSON.parse(raw) as Partial<World>; return { layouts: [0, 1, 2].map(i => w.layouts?.[i] ?? null), xp: w.xp ?? 0, plots: w.plots ?? [null, null], orders: w.orders ?? { date: '', done: [] }, jobs: w.jobs ?? [], rushDate: w.rushDate ?? '', crafts: w.crafts ?? [] }; } catch { return freshWorld(); }
}
export async function saveWorld(store: Store, uid: string, world: World, now: number): Promise<void> {
  await store.set(worldKey(uid), JSON.stringify(world), { expiration: new Date(now + WORLD_TTL * 1000) });
}
/**
 * A playtest aid: move every timer in the world back by `seconds`, as if that much time had passed. It changes nothing but the garden, the
 * builder and the workshop, and only for the one player who asks (a moderator, from the subreddit menu), so a tester can see ready crops
 * and finished jobs on a real device without waiting for them.
 */
export async function fastForward(store: Store, uid: string, seconds: number, now: number): Promise<number> {
  const world = await loadWorld(store, uid), ms = seconds * 1000; let moved = 0;
  world.plots = world.plots.map(p => { if (p) moved++; return p ? { ...p, plantedAt: p.plantedAt - ms, readyAt: p.readyAt - ms } : p; });
  world.jobs = world.jobs.map(j => { moved++; return { ...j, readyAt: j.readyAt - ms }; });
  world.crafts = world.crafts.map(c => { moved++; return { ...c, readyAt: c.readyAt - ms }; });
  await saveWorld(store, uid, world, now); return moved;
}
/** Jobs whose time has come. */
export const dueJobs = (world: World, now: number): Job[] => world.jobs.filter(j => j.readyAt <= now);
