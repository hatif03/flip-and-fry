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
/** Jobs whose time has come. */
export const dueJobs = (world: World, now: number): Job[] => world.jobs.filter(j => j.readyAt <= now);
