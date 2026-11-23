import type { TourId } from '../shared/api';

/**
 * The unlock ladder (plan v5, 4.2): on Reddit the interface grows with the player, one system on the night it becomes useful, each
 * with a one-line introduction. Nothing is taken from the engine: a hidden system runs with its defaults exactly as before. Off for a
 * player who skipped the tour (they know the game) and for anyone who turns on "Show everything".
 */
export type Feature = 'build' | 'goals' | 'menu' | 'garden' | 'kitchen' | 'team' | 'street' | 'rush';
export type Rung = { feature: Feature; after: number; intro: TourId | null; text: string; target?: string };

export const LADDER: readonly Rung[] = [
  { feature: 'build', after: 1, intro: null, text: '' }, // the guide's own build lesson introduces it
  { feature: 'goals', after: 1, intro: 'intro-goals', text: 'New: Goals. What to aim for next, and today’s round of three small jobs for XP.', target: 'tab-goals' },
  { feature: 'rush', after: 1, intro: 'intro-dinner', text: 'Dinner is two and a half minutes with three daily challenges: two of them earn your second star. On a ticket, Rush moves it to the front and Free keeps a guest who is about to walk out.', target: 'shifts' },
  { feature: 'menu', after: 2, intro: 'intro-menu', text: 'New: Menu. Switch dishes on and set prices. Far above the fair price, guests walk away.', target: 'tab-menu' },
  { feature: 'garden', after: 2, intro: 'intro-garden', text: 'New: the Garden. Grow your own ingredients on real timers: dishes made from them cost nothing and tip more.', target: 'tab-garden' },
  { feature: 'kitchen', after: 2, intro: 'intro-kitchen', text: 'New: the Test Kitchen. Cook by hand any time the doors are shut. New stars there earn research.', target: 'kitchen' },
  { feature: 'team', after: 3, intro: 'intro-team', text: 'New: Team. Hire and train. A second server is the best first hire.', target: 'tab-team' },
  { feature: 'street', after: 5, intro: 'intro-street', text: 'Your neighbors are here: open your door for visits, or cook together. Find them at the bottom of Goals.', target: 'tab-goals' },
];
/** From the fourth night the headline's own goal counts (stars.ts FIRST_NIGHTS): said once, on that night. */
export const GOAL_INTRO = { intro: 'intro-goal' as TourId, after: 3, text: 'From tonight the headline sets your first star’s goal. It is at the top of the screen: read it before you open.' };

export type LadderContext = { reddit: boolean; seen: ReadonlySet<string>; showAll: boolean };
export const ladderOn = (c: LadderContext): boolean => c.reddit && !c.showAll && !c.seen.has('skip');

export function unlocked(feature: Feature, nights: number, c: LadderContext): boolean {
  if (!ladderOn(c)) return true;
  const rung = LADDER.find(r => r.feature === feature);
  return !rung || nights >= rung.after;
}

/** The next introduction to show between nights: the first unlocked rung whose card has not been seen. */
export function nextIntro(nights: number, c: LadderContext): { id: TourId; text: string; target?: string } | null {
  if (!ladderOn(c)) return null;
  for (const r of LADDER) if (r.intro && nights >= r.after && !c.seen.has(r.intro)) return { id: r.intro, text: r.text, target: r.target };
  if (nights === GOAL_INTRO.after && !c.seen.has(GOAL_INTRO.intro)) return { id: GOAL_INTRO.intro, text: GOAL_INTRO.text };
  return null;
}

/** "Show everything": a per-device preference, so it lives in this browser's storage (it may be empty; the ladder is then on). */
const KEY = 'flipfry:show-all';
export function readShowAll(): boolean { try { return globalThis.localStorage?.getItem(KEY) === '1'; } catch { return false; } }
export function writeShowAll(on: boolean): void { try { if (on) globalThis.localStorage?.setItem(KEY, '1'); else globalThis.localStorage?.removeItem(KEY); } catch { /* storage blocked: the setting lasts this visit */ } }
