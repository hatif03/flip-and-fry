import type { HeadlineId } from './daily-headline';
import type { HeadlineState, Report } from './types';

/**
 * Stars read the receipt; they never replace profit, wages or the ledger. 1★ is tonight's headline goal, 2★ adds two of
 * the three daily challenges, 3★ adds beating your previous service's profit (or the headline's stretch on a first night).
 * The numbers were set from the bots in `bots.ts` over 28 dates: the plain room clears the easy headlines and misses the
 * hard ones, the room with a second server and some decor clears nearly all of them.
 */
type Goal = { text: string; met: (r: Report, h: HeadlineState) => boolean; stretch: number };

export const GOALS: Record<HeadlineId, Goal> = {
  quiet: { text: 'Serve 6 guests and finish in profit', met: r => r.served >= 6 && r.profit > 0, stretch: 320 },
  rush: { text: 'Serve 14 guests and keep the rating at 3.8 or better', met: r => r.served >= 14 && r.rating >= 3.8, stretch: 340 },
  rain: { text: 'Finish with a rating of 4.0 or better', met: r => r.rating >= 4, stretch: 320 },
  supplier: { text: 'Make $230 profit despite the butcher', met: r => r.profit >= 230, stretch: 290 },
  critic: { text: 'Every star guest leaves happy and at most 3 guests are missed', met: (r, h) => h.walkouts === 0 && r.missed <= 3, stretch: 360 },
  payday: { text: 'Make $240 profit while guests feel generous', met: r => r.profit >= 240, stretch: 400 },
  inspection: { text: 'At most one dirty seat at closing and a rating of 3.5 or better', met: (r, h) => h.dirtyAtClose <= 1 && r.rating >= 3.5, stretch: 340 },
};

export interface Stars {
  stars: 0 | 1 | 2 | 3;
  goal: boolean;
  challenges: number;
  beatPrevious: boolean;
  goalText: string;
}

export function evaluateStars(report: Report, headline: HeadlineState, previousProfit: number | null): Stars {
  const g = GOALS[headline.id], goal = g.met(report, headline);
  const challenges = report.challenges.filter(c => c.rewarded).length;
  const beatPrevious = previousProfit === null ? report.profit >= g.stretch : report.profit > previousProfit;
  const stars = !goal ? 0 : challenges < 2 ? 1 : !beatPrevious ? 2 : 3;
  return { stars, goal, challenges, beatPrevious, goalText: g.text };
}

/** `stars * 1_000_000 + rating * 1000`, the leaderboard score: stars first, then rating. */
export const packScore = (stars: number, rating: number): number => stars * 1_000_000 + Math.round(rating * 1000);
