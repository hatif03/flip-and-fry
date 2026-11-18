import type { Action } from '../management/actions';
import { noJourneys, interactionName, type Journeys } from './journeys';
import { DAY_LENGTH } from '../management/types';
import type { RemoteSession, RestaurantEngine } from '../management/engine';
import { stateHash } from '../management/replay';
import type { ErrorResponse, LockResponse, OpenResponse, SaveResponse, TodayResponse } from '../shared/api';

/** One round trip to /api. Injected so the session is tested against the real server rules without a network. */
export type Http = (method: 'GET' | 'POST', path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: unknown }>;
export type Scheduler = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

const FLUSH_MS = 600;
const isError = (b: unknown): b is ErrorResponse => !!b && typeof b === 'object' && (b as { type?: unknown }).type === 'error';
const message = (r: { status: number; body: unknown }): string => isError(r.body) ? r.body.error : r.status === 401 ? 'Log in to Reddit to run your restaurant.' : 'Could not reach the restaurant. Check your connection.';

/**
 * Connects one engine to the server. The server owns the park: this class sends the owner's planning actions, opens and
 * closes services through the API, and adopts whatever the server says is true. The engine's own live run is only a
 * preview of the service the server will replay.
 */
export class Session implements RemoteSession {
  today: TodayResponse | null = null;
  result: LockResponse | null = null;
  /** The last problem worth showing the player (a lost connection, a conflict that forced a reload). */
  notice = '';
  private rev = 0;
  private pending: Action[] = [];
  /** What the owner did at the pass this service, stamped with ticks. Sent with the lock, never saved on its own. */
  private serviceLog: Action[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  private timer: unknown = null;
  private openDate: string | null = null;
  private watching = false;
  private wasService = false;
  private sentFirstGuest = false;
  private sentHalfway = false;

  constructor(private readonly engine: RestaurantEngine, private readonly http: Http, private readonly scheduler: Scheduler = { set: (fn, ms) => setTimeout(fn, ms), clear: h => clearTimeout(h as ReturnType<typeof setTimeout>) }, private readonly journeys: Journeys = noJourneys) {}

  /** Load today's data and take over the engine. Returns an error message, or null when the game can start. */
  async start(): Promise<string | null> {
    const e = this.engine;
    e.detach(); e.autoRoll = false; e.remote = this; e.onAction = a => { if (a.tick === 0) this.queue(a); else this.serviceLog.push(a); const verb = interactionName(a); if (verb) this.journeys.interaction(verb, this.today?.run ? 'later' : 'official'); };
    if (!this.watching) { this.watching = true; e.subscribe(() => this.onEngineChange()); }
    return this.load();
  }

  private async load(): Promise<string | null> {
    const r = await this.http('GET', '/api/today');
    if (r.status !== 200 || isError(r.body)) return message(r);
    const today = r.body as TodayResponse;
    this.today = today; this.rev = today.rev; this.pending = []; this.cancelTimer(); this.openDate = null;
    if (today.open) {
      // A service was opened and never closed (a reload mid-service). It replays from its first tick, which is the same night.
      this.engine.adopt(today.open.snapshot);
      const error = this.engine.open(today.headline);
      if (!error) { this.openDate = today.open.date; return null; }
    }
    this.engine.adopt(today.park);
    return null;
  }

  // ---- planning ---------------------------------------------------------------------------------------------------

  private queue(action: Action): void {
    this.pending.push(action);
    this.schedule(FLUSH_MS);
  }
  private schedule(ms: number): void {
    if (this.timer === null) this.timer = this.scheduler.set(() => { this.timer = null; void this.flush(); }, ms);
  }
  private cancelTimer(): void { if (this.timer !== null) { this.scheduler.clear(this.timer); this.timer = null; } }

  /** Send queued planning actions now. Serialised, so a second flush never races the first. */
  flush(): Promise<void> {
    this.cancelTimer();
    const run = this.chain.then(async () => {
      if (!this.pending.length) return;
      const actions = this.pending; this.pending = [];
      const r = await this.http('POST', '/api/save', { rev: this.rev, actions });
      if (r.status === 200 && !isError(r.body)) { this.rev = (r.body as SaveResponse).rev; return; }
      if (isError(r.body) && r.body.conflict) { this.notice = 'Your restaurant changed in another tab, so it was reloaded.'; await this.load(); this.engine.notify(); return; }
      this.pending = [...actions, ...this.pending]; this.notice = message(r); this.schedule(FLUSH_MS * 5); // keep the changes and retry later
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  // ---- services ---------------------------------------------------------------------------------------------------

  /** Replaces the engine's local open(): the server validates the plan, stores the snapshot and picks the headline. */
  async open(): Promise<string | null> {
    this.journeys.start(); // pointer-up on Open: the explicit user action a journey must begin with
    this.cancelTimer();
    return this.enqueue(async () => {
      const actions = this.pending; this.pending = [];
      const r = await this.http('POST', '/api/open', { rev: this.rev, actions });
      if (r.status !== 200 || isError(r.body)) {
        if (isError(r.body) && r.body.conflict) { this.notice = 'Your restaurant changed in another tab, so it was reloaded.'; await this.load(); this.engine.notify(); return r.body.error; }
        this.pending = [...actions, ...this.pending]; // the server refused to open but still has to learn about these changes
        if (this.pending.length) this.schedule(FLUSH_MS);
        return message(r);
      }
      const opened = r.body as OpenResponse;
      this.rev = opened.rev; this.result = null;
      this.engine.adopt(opened.snapshot);
      const error = this.engine.open(opened.headline);
      if (!error) { this.openDate = opened.date; this.sentFirstGuest = false; this.sentHalfway = false; this.serviceLog = []; } // only once the doors are really open: adopting a closed snapshot must not look like a finished service
      return error;
    });
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job);
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** When the live preview finishes (phase returns to planning), ask the server to replay and lock it. */
  private onEngineChange(): void {
    const state = this.engine.state, phase = state.phase;
    if (this.openDate && phase === 'service') {
      if (!this.sentFirstGuest && state.guests.some(g => g.stage !== 'arriving' && g.stage !== 'leaving')) { this.sentFirstGuest = true; this.journeys.progress(.3, 'first_guest'); }
      if (!this.sentHalfway && state.elapsed >= DAY_LENGTH / 2) { this.sentHalfway = true; this.journeys.progress(.6, 'mid_service'); }
    }
    if (this.openDate && this.wasService && phase === 'planning') { const date = this.openDate; this.openDate = null; this.journeys.progress(.9, 'receipt'); void this.close(date); }
    this.wasService = phase === 'service';
  }

  private async close(date: string): Promise<void> {
    await this.enqueue(async () => {
      const journeyId = this.journeys.id(), r = await this.http('POST', '/api/lock', { date, actions: this.serviceLog }, journeyId ? { 'x-devvit-journey-id': journeyId } : undefined);
      if (r.status !== 200 || isError(r.body)) {
        this.notice = isError(r.body) && r.body.conflict ? 'Your restaurant changed in another tab, so it was reloaded.' : message(r);
        await this.load(); this.engine.notify(); return;
      }
      const lock = r.body as LockResponse;
      this.rev = lock.rev; this.result = lock; this.serviceLog = []; this.journeys.clear(); // the server wrote the official end with the replayed score
      // The server's replay is the only receipt that counts. If this preview disagrees, the server's park wins.
      if (stateHash(this.engine.state) !== lock.hash) this.engine.adopt(lock.park);
      if (this.today) this.today = { ...this.today, rev: lock.rev, park: lock.park, streak: lock.streak, run: lock.official ? { report: lock.report, stars: lock.stars, hash: lock.hash, headline: lock.report.headline!, submittedAt: 0, username: '' } : this.today.run, community: { opens: this.today.community.opens, locks: this.today.community.locks + (lock.official && !lock.replaced && !this.today.run ? 1 : 0) } };
      this.engine.notify();
    });
  }

  /** Resolves when every queued request has finished (used by tests and by the page before it unloads). */
  idle(): Promise<unknown> { return this.chain; }

  dismissResult(): void { this.result = null; this.engine.notify(); }
}
