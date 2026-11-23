import type { HeadlineId } from './daily-headline';
import type { HeadlineState, Report, RestaurantState, Shift } from './types';
import { headlineEffects } from './daily-headline';
import { nightRating } from './rating';
import { tonight } from './bills';

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
  critic: { text: 'Every VIP leaves happy and at most 3 guests are missed', met: (r, h) => h.walkouts === 0 && r.missed <= 3, stretch: 360 },
  payday: { text: 'Make $240 profit while guests feel generous', met: r => r.profit >= 240, stretch: 400 },
  inspection: { text: 'At most one dirty seat at closing and a rating of 3.5 or better', met: (r, h) => h.dirtyAtClose <= 1 && r.rating >= 3.5, stretch: 340 },
};

/**
 * A player's first three nights have a gentler goal that the starter restaurant meets on its own: it is the first week's curve. A new owner
 * who only taps Open still sees a star and starts a streak; from the fourth night the headline's own goal is the one that counts.
 */
export const FIRST_NIGHTS = 3;
const WELCOME: Goal = { text: 'Serve 8 guests', met: r => r.served >= 8, stretch: 0 };
/** The goal line to show for a headline on the player's `night`th service (1 is the first ever). */
export const goalText = (id: HeadlineId, night: number, shift: Shift = 'dinner'): string => shift === 'lunch' ? LUNCH_STARS[0] : night <= FIRST_NIGHTS ? WELCOME.text : GOALS[id].text;
/**
 * A lunch is a short service with no daily challenges, so it has its own three lines, the same on every headline: 1 serve five and finish
 * in profit, 2 a rating of 4 or better, 3 a chain of four good actions at the pass (the hustle meter), which only hands can build.
 */
export const LUNCH_STARS = ['Serve 5 guests and finish in profit', 'Finish with a rating of 4.0 or better', 'Reach a ×4 combo at the pass'] as const;
export const LUNCH_CHAIN = 4;

export interface Stars {
  stars: 0 | 1 | 2 | 3;
  goal: boolean;
  challenges: number;
  beatPrevious: boolean;
  goalText: string;
}

export function evaluateStars(report: Report, headline: HeadlineState, previousProfit: number | null, night: number = FIRST_NIGHTS + 1, shift: Shift = 'dinner', chain = 0): Stars {
  if (shift === 'lunch') {
    const goal = report.served >= 5 && report.profit > 0, good = report.rating >= 4, chained = chain >= LUNCH_CHAIN;
    return { stars: !goal ? 0 : !good ? 1 : !chained ? 2 : 3, goal, challenges: good ? 2 : 0, beatPrevious: chained, goalText: LUNCH_STARS[0] };
  }
  const g = GOALS[headline.id], welcome = night <= FIRST_NIGHTS, goal = welcome ? WELCOME.met(report, headline) || g.met(report, headline) : g.met(report, headline);
  const challenges = report.challenges.filter(c => c.rewarded).length;
  const beatPrevious = previousProfit === null ? report.profit >= g.stretch : report.profit > previousProfit;
  const stars = !goal ? 0 : challenges < 2 ? 1 : !beatPrevious ? 2 : 3;
  return { stars, goal, challenges, beatPrevious, goalText: welcome ? WELCOME.text : g.text };
}

/** `stars * 1_000_000 + rating * 1000`, the leaderboard score: stars first, then rating. */
export const packScore = (stars: number, rating: number): number => stars * 1_000_000 + Math.round(rating * 1000);

/**
 * The three stars as they stand during the night, a preview for the night bar (plan v5, 4.4). It reuses the goal tests and the closing
 * rating with what has happened so far (dirty seats now stand in for dirty seats at closing). The server's replay is the only result.
 */
export type StarPreview = { goal: boolean; challenges: number; beat: boolean; rating: number; beatTarget: number | null; chain: number };
export function previewStars(s: RestaurantState): StarPreview {
  const h = s.headline, fx = headlineEffects(h), dirty = s.dirty.length, walkouts = h?.walkouts ?? 0;
  const rating = nightRating(s, fx, dirty, walkouts), profit = tonight(s).net, served = s.totals.served;
  const previous = s.history.length ? s.history[s.history.length - 1].profit : null, chain = s.hustle.best;
  if (s.shift === 'lunch') return { goal: served >= 5 && profit > 0, challenges: rating >= 4 ? 2 : 0, beat: chain >= LUNCH_CHAIN, rating, beatTarget: null, chain };
  const night = s.history.length + 1, report = { served, missed: s.totals.missed, profit, rating } as Report;
  const state = { ...(h ?? { id: 'quiet', seed: 0, walkouts: 0, dirtyAtClose: 0 }), dirtyAtClose: dirty } as HeadlineState;
  const g = h ? GOALS[h.id] : null, goal = night <= FIRST_NIGHTS ? WELCOME.met(report, state) || Boolean(g?.met(report, state)) : Boolean(g?.met(report, state));
  const target = previous ?? (g ? g.stretch : null);
  return { goal, challenges: s.dailyChallenges.filter(c => c.rewarded).length, beat: target !== null && (previous === null ? profit >= target : profit > target), rating, beatTarget: target, chain };
}
