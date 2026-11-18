import { SHIFTS, starsFor } from './config';
import type { Mode } from './types';

/** The canned line for a Test Kitchen result. Built from the saved best, never from a number the browser sends. */
export const ARCADE_MODES: readonly Mode[] = ['solo', 'coop'];
export function arcadeComment(level: number, mode: Mode, best: number): string {
  const stars = starsFor(best, level, mode);
  return `Test Kitchen · ${SHIFTS[level].name} · ${mode === 'solo' ? 'solo' : 'two chefs'} · best ${best} points · ${stars} ${stars === 1 ? 'star' : 'stars'}`;
}
