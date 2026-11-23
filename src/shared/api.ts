import type { RoundView } from '../management/round';
import type { NightSummary } from '../management/awards';
import type { DailyHeadline } from '../management/daily-headline';
import type { DoorSummary } from '../management/social';
import type { Action } from '../management/replay';
import type { Stars } from '../management/stars';
import type { CropId, Order, Pantry } from '../management/crops';
import type { Report, RestaurantState, Shift } from '../management/types';

/** Request and response shapes shared by the client and the server. Import only types and pure modules from here. */
/** This week's stars (Monday to Sunday) and the tier they reach. */
export type WeekView = { stars: number; tier: string | null; next: { name: string; at: number } | null };
export type InitResponse = { type: 'init'; postId: string; date: string; username: string };

export type StoredRun = { report: Report; stars: Stars; hash: string; headline: DailyHeadline['id']; submittedAt: number; username: string; night: NightSummary; name: string; style: string; commentId?: string; shift?: Shift };

export type TodayResponse = {
  type: 'today';
  date: string;
  headline: DailyHeadline;
  /** Incremented on every park write; the client sends it back so a stale tab cannot overwrite a newer one. */
  rev: number;
  park: RestaurantState;
  /** The service the player opened and has not closed yet. The client replays it from its first tick. */
  open: { snapshot: RestaurantState; date: string } | null;
  /** The official (locked) service for today, if any. */
  run: StoredRun | null;
  /** Today's official lunch, if any. */
  lunchRun?: StoredRun | null;
  streak: number;
  /** Missed days the streak can absorb: one is earned per seven played days in a row, up to two. */
  freezes?: number;
  week?: WeekView;
  community: { opens: number; locks: number };
  /** What the guide has already shown this player (see TOUR_IDS). */
  tour?: TourId[];
  /** The name a moderator gave the neighborhood in the subreddit settings, already checked. */
  neighborhood?: string | null;
  /** Set when this post is a kitchen someone posted: the kitchen a visitor can stop by. */
  kitchen?: DoorSummary | null;
};

export type SaveRequest = { rev: number; actions: Action[] };
export type SaveResponse = { type: 'save'; rev: number; park: RestaurantState };

export type OpenRequest = { rev: number; actions: Action[] };
export type OpenResponse = { type: 'open'; date: string; rev: number; headline: DailyHeadline; snapshot: RestaurantState };

export type LockRequest = { date: string; actions: Action[]; shift?: Shift };
export type LockResponse = {
  type: 'lock';
  shift: Shift;
  /** Experience this service earned and the level reached; absent if the world could not be updated. */
  xp?: XpGain | null;
  /** The server's replay is the only receipt that counts. A client preview with a different hash should adopt `park`. */
  hash: string;
  report: Report;
  stars: Stars;
  /** The kitchen card, the award banner and the company value, all from the replayed state. */
  night: NightSummary;
  /** True when this service is now today's locked result (the first of the day, or a better one). */
  official: boolean;
  replaced: boolean;
  streak: number;
  freezes?: number;
  week?: WeekView;
  rev: number;
  park: RestaurantState;
};

export type ErrorResponse = { type: 'error'; error: string; conflict?: boolean };

/** Today's board: official results on this subreddit, best first. Names appear only for players who left their door open, and for the viewer. */
export type BoardEntry = { rank: number; name: string; stars: number; rating: number; profit: number; you: boolean };
export type BoardView = { type: 'board'; date: string; shift?: Shift; total: number; entries: BoardEntry[]; you: { rank: number; stars: number; profit: number } | null };

/** The rooftop garden, the order board and experience, as the server's clock sees them. Every time is a server timestamp in milliseconds. */
/** An empty plot has `crop: null` and zeros. */
export type PlotView = { index: number; crop: CropId | null; readyAt: number; plantedAt: number; watered: boolean; ready: boolean; wilted: boolean; yield: number };
/** A station a builder can upgrade, what it is now, and what the next step costs (or null at the top). */
export type StationView = { id: number; kind: string; name: string; level: number; next: { toLevel: 2 | 3; cost: number; seconds: number; levelNeeded: number } | null };
export type WorldView = {
  /** Today's three tasks and the week toward the crate. */
  round?: RoundView;
  type: 'world'; now: number; xp: number; level: number; nextXp: number | null; slots: number; plots: PlotView[];
  orders: (Order & { done: boolean; canFill: boolean })[]; pantry: Pantry; cash: number;
  /** The block: the weekly party and the shared fridge. */
  block: { party: { week: string; stars: number; mine: number; tiers: { at: number; reward: number; reached: boolean; claimed: boolean; canClaim: boolean }[] }; fridge: { items: Partial<Record<CropId, number>>; left: boolean; took: boolean } };
  /** Three saved arrangements of the room: how many pieces each holds, and whether it still fits the room as it is now. */
  layouts: ({ pieces: number; fits: boolean } | null)[];
  /** The workshop: what can be made, what it takes, and what is cooking. */
  workshop: { good: string; name: string; level: number; seconds: number; yield: number; inputs: { crop: CropId; n: number }[]; readyAt: number | null; canStart: boolean; unlocked: boolean }[];
  builders: { count: number; jobs: { furnitureId: number; name: string; toLevel: number; readyAt: number; rushCost: number }[]; rushUsed: boolean };
  stations: StationView[];
};
/** The reply to a change: the new view, plus the restaurant's new revision and state (cash and pantry moved). */
export type WorldResponse = WorldView & { rev: number; park: RestaurantState };
export type WorldRequest = { rev: number; plot?: number; crop?: string; index?: number };
/** Experience from a closed service. */
export type XpGain = { gained: number; level: number; leveledUp: boolean };

/**
 * What the guide has shown a player, stored on the server so a second device does not repeat it. A fixed allowlist: the server
 * refuses any other id. 'skip' means the player turned the guide off.
 */
export const TOUR_IDS = ['welcome', 'lunch', 'card', 'build', 'done', 'skip',
  'intro-dinner', 'intro-menu', 'intro-garden', 'intro-kitchen', 'intro-team', 'intro-goal', 'intro-goals', 'intro-street',
  'tip-incident', 'tip-vip', 'tip-regular', 'tip-walkout', 'tip-burnt', 'tip-notice', 'tip-level', 'tip-crop', 'tip-milestone', 'tip-rush'] as const;
export type TourId = typeof TOUR_IDS[number];
