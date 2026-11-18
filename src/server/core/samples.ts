import type { Action } from '../../management/actions';
import { bareBot, cozyBot } from '../../management/bots';
import { applyPlanning } from '../../management/replay';
import { createRestaurant, type Dish, type RestaurantState } from '../../management/types';

/**
 * Kitchens that ship in the code, so the neighborhood is never empty. They are labelled "Sample kitchen" everywhere they are shown
 * and are never presented as a real player. Each is built from the same planning actions a player takes, so it is always a valid,
 * openable restaurant, and it is checked in tests whenever the rules change.
 */
export type Sample = { id: string; kitchen: string; style: string; blurb: string; actions: Action[] };

const rename = (name: string): Action => ({ tick: 0, kind: 'rename', name });
const place = (kind: 'grill' | 'pot' | 'wok' | 'lamp' | 'plant', x: number, z: number): Action => ({ tick: 0, kind: 'place', item: { id: -1, kind, x, z, rotation: 0 } });
const dish = (id: Dish, enabled: boolean, price: number): Action => ({ tick: 0, kind: 'dish', dish: id, enabled, price });

export const SAMPLES: Sample[] = [
  { id: 'sample-garden', kitchen: "Basil's Garden", style: 'Garden & Grill', blurb: 'Planters, lanterns and a friendly pace.', actions: [...cozyBot.actions, rename("Basil's Garden")] },
  { id: 'sample-grill', kitchen: 'Smoke and Fire', style: 'Grill', blurb: 'Two grills and nothing green.', actions: [place('grill', 5, 1), dish('salad', false, 24), dish('burger', true, 40), dish('skewers', true, 32), rename('Smoke and Fire')] },
  { id: 'sample-noodle', kitchen: 'The Noodle Cart', style: 'Noodle', blurb: 'A pot, a wok and a short, hot menu.', actions: [place('pot', 5, 1), place('wok', 6, 1), dish('ramen', true, 36), dish('stirfry', true, 34), dish('salad', false, 24), dish('burger', false, 38), rename('The Noodle Cart')] },
  { id: 'sample-quiet', kitchen: 'The Quiet Corner', style: 'Garden & Grill', blurb: 'Plain and tidy, with room to think.', actions: [...bareBot.actions, rename('The Quiet Corner')] },
];

let cache: Map<string, RestaurantState> | null = null;
/** The closed-doors state of each sample. Built once, then copied for every visit so no visit can change another. */
export function sampleState(id: string): RestaurantState | null {
  const sample = SAMPLES.find(s => s.id === id); if (!sample) return null;
  cache ??= new Map();
  if (!cache.has(id)) {
    const base = createRestaurant(); base.research.points = 360;
    const built = applyPlanning(base, sample.actions);
    if ('error' in built) throw new Error(`Sample kitchen ${id} is not valid: ${built.error}`);
    cache.set(id, built.state);
  }
  return structuredClone(cache.get(id)!);
}
