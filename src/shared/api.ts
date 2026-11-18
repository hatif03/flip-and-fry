import type { DailyHeadline } from '../management/daily-headline';
import type { Action } from '../management/replay';
import type { Stars } from '../management/stars';
import type { Report, RestaurantState } from '../management/types';

/** Request and response shapes shared by the client and the server. Import only types and pure modules from here. */
export type InitResponse = { type: 'init'; postId: string; date: string; username: string };

export type StoredRun = { report: Report; stars: Stars; hash: string; headline: DailyHeadline['id']; submittedAt: number; username: string };

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
  community: { opens: number; locks: number };
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
  /** True when this service is now today's locked result (the first of the day, or a better one). */
  official: boolean;
  replaced: boolean;
  streak: number;
  rev: number;
  park: RestaurantState;
};

export type ErrorResponse = { type: 'error'; error: string; conflict?: boolean };
