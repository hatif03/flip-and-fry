import type { NightSummary } from '../management/awards';
import type { DailyHeadline } from '../management/daily-headline';
import type { DoorSummary } from '../management/social';
import type { Action } from '../management/replay';
import type { Stars } from '../management/stars';
import type { Report, RestaurantState } from '../management/types';

/** Request and response shapes shared by the client and the server. Import only types and pure modules from here. */
export type InitResponse = { type: 'init'; postId: string; date: string; username: string };

export type StoredRun = { report: Report; stars: Stars; hash: string; headline: DailyHeadline['id']; submittedAt: number; username: string; night: NightSummary; name: string; style: string; commentId?: string };

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
  streak: number;
  /** Missed days the streak can absorb: one is earned per seven played days in a row, up to two. */
  freezes?: number;
  community: { opens: number; locks: number };
  /** The name a moderator gave the neighborhood in the subreddit settings, already checked. */
  neighborhood?: string | null;
  /** Set when this post is a kitchen someone posted: the kitchen a visitor can stop by. */
  kitchen?: DoorSummary | null;
};

export type SaveRequest = { rev: number; actions: Action[] };
export type SaveResponse = { type: 'save'; rev: number; park: RestaurantState };

export type OpenRequest = { rev: number; actions: Action[] };
export type OpenResponse = { type: 'open'; date: string; rev: number; headline: DailyHeadline; snapshot: RestaurantState };

export type LockRequest = { date: string; actions: Action[] };
export type LockResponse = {
  type: 'lock';
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
  rev: number;
  park: RestaurantState;
};

export type ErrorResponse = { type: 'error'; error: string; conflict?: boolean };

/** Today's board: official results on this subreddit, best first. Names appear only for players who left their door open, and for the viewer. */
export type BoardEntry = { rank: number; name: string; stars: number; rating: number; profit: number; you: boolean };
export type BoardView = { type: 'board'; date: string; total: number; entries: BoardEntry[]; you: { rank: number; stars: number; profit: number } | null };
