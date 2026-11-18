import { z } from 'zod';
import { OUTFIT_COLORS, type ChefOutfits } from './chef-outfit';
import { starsFor } from './config';
import type { Progress } from './types';

/**
 * What the Test Kitchen saves for one player. Shared by the client and the server, so the server accepts exactly what the
 * engine produces. The arcade cannot be replayed on the server, so the server only bounds it: whole scores in a sane range,
 * and a best never goes down.
 */
export const ARCADE_MAX_SCORE = 6000;
const colorIds = OUTFIT_COLORS.map(c => c.id) as [string, ...string[]];
const scores = z.array(z.number().int().min(0).max(ARCADE_MAX_SCORE)).length(3);
const outfit = z.object({ hat: z.enum(colorIds), apron: z.enum(colorIds) });
export const arcadeSaveSchema = z.object({ progress: z.object({ solo: scores, coop: scores }), outfits: z.tuple([outfit, outfit]) });
export type ArcadeSave = { progress: Progress; outfits: ChefOutfits };

export const emptyArcade = (): ArcadeSave => ({ progress: { solo: [0, 0, 0], coop: [0, 0, 0] }, outfits: [{ hat: 'cream', apron: 'cream' }, { hat: 'cream', apron: 'cream' }] });

/** Stars across every shift and both modes (up to 18). */
export const totalStars = (p: Progress): number => (['solo', 'coop'] as const).reduce((sum, mode) => sum + p[mode].reduce((n, score, level) => n + starsFor(score, level, mode), 0), 0);
/** Each newly earned star in the Test Kitchen is worth this much research, at most BONUS_MAX once a day. The arcade is not replayed on the server, so this stays small and bounded. */
export const BONUS_PER_STAR = 5, BONUS_MAX = 10;

/** Best scores only ever go up; outfits are the newest ones the player chose. */
export function mergeArcade(saved: ArcadeSave, incoming: ArcadeSave): ArcadeSave {
  const best = (a: number[], b: number[]): number[] => a.map((v, i) => Math.max(v, b[i]));
  return { progress: { solo: best(saved.progress.solo, incoming.progress.solo), coop: best(saved.progress.coop, incoming.progress.coop) }, outfits: incoming.outfits };
}
