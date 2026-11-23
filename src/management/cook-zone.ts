import { cookQuality } from './types';

/** Where the dish is in its cooking, as a share of its normal time. Uses the engine's own bands, so the bar can never disagree with the plate. */
export type CookZone = 'raw' | 'early' | 'perfect' | 'over' | 'burnt';
export function cookZone(ratio: number): CookZone {
  const q = cookQuality(ratio);
  return q === 3 ? 'perfect' : q === 1 ? 'early' : q === 2 ? 'over' : ratio < 1 ? 'raw' : 'burnt';
}
