import { runService, type Action } from '@/management/replay';
import { createRestaurant } from '@/management/types';

/** Shared by the Node test that writes the golden file and the multi-engine test that checks it. */
const LOGS: Record<string, Action[]> = {
  empty: [],
  chef: [{ tick: 0, kind: 'hire', role: 'chef' }, { tick: 0, kind: 'train', id: 10 }],
  menu: [{ tick: 0, kind: 'dish', dish: 'burger', enabled: false, price: 38 }, { tick: 0, kind: 'dish', dish: 'salad', enabled: true, price: 27 }],
  decor: [{ tick: 0, kind: 'place', item: { id: -1, kind: 'lamp', x: 4, z: 6, rotation: 0 } }, { tick: 0, kind: 'place', item: { id: -1, kind: 'plant', x: 0, z: 8, rotation: 0 } }],
};
export const SEEDS = Array.from({ length: 24 }, (_, i) => 91273 + i * 104729);

/** name:seed → receipt hash. A failed replay is recorded as its error so a regression shows in the golden diff. */
export function replayHashes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, log] of Object.entries(LOGS)) for (const seed of SEEDS) {
    const r = runService({ ...createRestaurant(), seed }, log);
    out[`${name}:${seed}`] = 'error' in r ? `error:${r.error}` : r.hash;
  }
  return out;
}
