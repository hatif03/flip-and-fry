import { z } from 'zod';
import { packScore } from '../../management/stars';
import type { LockResponse } from '../../shared/api';

/** Request shapes for the Journeys client endpoints. Strings are short and fixed in practice; none carries a username or free text. */
const label = z.string().trim().min(1).max(64);
export const progressBody = z.object({ journeyId: z.string().min(1).max(200), progress: z.number().min(0).max(1), action: label.optional(), actionDetails: label.optional() });
export const interactionBody = z.object({ journeyId: z.string().max(200).optional(), action: label, actionDetails: label.optional() });
export const endBody = z.object({ journeyId: z.string().min(1).max(200), complete: z.boolean().optional(), game: z.object({ win: z.boolean().optional(), score: z.number().finite().optional() }).optional() });

/** The official end of a journey is written by the server from the replayed receipt, never from anything the client claims. */
export function officialEnd(journeyId: string, lock: Pick<LockResponse, 'stars' | 'report'>) {
  return { journeyId, complete: true, game: { win: lock.stars.stars >= 1, score: packScore(lock.stars.stars, lock.report.rating) } };
}
