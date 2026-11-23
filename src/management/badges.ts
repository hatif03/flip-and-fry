import { GOALS } from './engine';
import type { RestaurantState } from './types';
import type { WorldView } from '../shared/api';

/** A dot on a dock tab when something there is ready to act on: a milestone or the weekly crate in Goals, a harvest, a batch or a finished builder in the Garden. */
export function badgesFor(state: RestaurantState, view: WorldView | null | undefined, now: number): { goals: boolean; garden: boolean } {
  const milestone = GOALS.some(g => !state.claimed.includes(g.id) && g.value(state) >= g.target);
  const garden = Boolean(view && (view.plots.some(p => p.crop && now >= p.readyAt) || (view.workshop ?? []).some(w => w.readyAt !== null && now >= w.readyAt) || view.builders.jobs.some(j => now >= j.readyAt)));
  return { goals: milestone || Boolean(view?.round?.crateReady), garden };
}
