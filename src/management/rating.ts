import type { HeadlineEffects } from './daily-headline';
import { comfort, type RestaurantState } from './types';

/**
 * The night's rating, 1 to 5. The engine calls it at closing with the real dirty seats and walkouts; the night bar calls it during
 * service with the ones so far, as a preview. One formula, so the preview cannot drift from the receipt.
 */
export function nightRating(s: Pick<RestaurantState, 'totals' | 'furniture'>, fx: Pick<HeadlineEffects, 'dirtyPenalty' | 'criticCap'>, dirty: number, walkouts: number): number {
  const rating = Math.max(1, Math.min(5, 3 + (s.totals.served / Math.max(1, s.totals.served + s.totals.missed)) * 1.5 + comfort(s as RestaurantState) * .005 - s.totals.missed * .06 - dirty * fx.dirtyPenalty));
  return fx.criticCap && walkouts > 0 ? Math.min(rating, 2) : rating;
}
