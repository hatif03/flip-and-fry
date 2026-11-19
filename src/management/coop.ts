import type { Action } from './actions';
import type { RestaurantEngine } from './engine';
import { stateHash } from './replay';

/**
 * Hosted service, in lockstep. The host and a helper each run the same engine from the same opening snapshot. Nothing but actions
 * crosses the wire: a tap becomes an action; the host stamps it with a tick a little ahead of its own clock and tells everyone; every
 * device applies it on that tick, before that tick's step. Because the engine is deterministic, every device then stays identical, and
 * the host's log of stamped actions is exactly what the server replays at the lock.
 *
 * This file is transport-free and clock-free: tests drive it with two engines and a pretend network.
 */
/** How far ahead of the host's clock an action is stamped, in 0.1 s ticks: 1.5 seconds for the message to reach everyone. */
export const INPUT_DELAY = 15;
/** How often the host publishes a checksum of its state, in ticks (5 seconds). */
export const SYNC_EVERY = 50;
/** How many past checksums a helper keeps to compare with the host's. */
const KEEP = 40;

export type ServiceAction = Action;
/** A kitchen open for help, as the neighborhood shows it. */
export type CoopListing = { id: string; host: string | null; kitchen: string; helper: boolean };
/** What the host's device needs from the network. */
export interface HostLink { commit(action: Action): void; sync(tick: number, hash: string): void }
/** What the helper's device needs from the network. */
export interface GuestLink { act(action: Action): void }

/** The service actions that carry a tick (anything with tick 0 is planning and never crosses a hosted service). */
export const isStamped = (a: Action): boolean => a.tick > 0;

export class CoopHost {
  private lastSync = 0;
  constructor(private readonly engine: RestaurantEngine, private readonly link: HostLink) {
    engine.coop = { submit: a => this.stamp(a, 0) };
    engine.afterStep = () => this.afterStep();
  }
  /** The host's own tap, or a helper's request that arrived: stamp it, schedule it here, and tell everyone. */
  private stamp(a: Action, by: 0 | 1): void {
    const stamped = { ...a, tick: this.engine.tickCount() + INPUT_DELAY, ...(by ? { by } : {}) } as Action;
    this.engine.schedule(stamped); this.link.commit(stamped);
  }
  /** A request from the helper, without a tick. Only the helper's own hands are accepted. */
  onRequest(a: Action): void { this.stamp({ ...a, by: 1 } as Action, 1); }
  private afterStep(): void {
    const tick = this.engine.tickCount();
    if (tick > 0 && tick % SYNC_EVERY === 0 && tick !== this.lastSync) { this.lastSync = tick; this.link.sync(tick, stateHash(this.engine.state)); }
  }
  stop(): void { this.engine.coop = null; this.engine.afterStep = null; }
}

export type SyncVerdict = 'ok' | 'mismatch' | 'pending';
export class CoopGuest {
  private hashes = new Map<number, string>();
  private waiting: Array<{ tick: number; hash: string }> = [];
  /** Called when the helper's state has drifted from the host's: fetch a fresh snapshot and start over. */
  onMismatch: () => void = () => undefined;
  constructor(private readonly engine: RestaurantEngine, private readonly link: GuestLink) {
    engine.handsBy = 1; engine.coop = { submit: a => this.link.act({ ...a, by: 1 } as Action) };
    engine.afterStep = () => this.afterStep();
  }
  /** The host stamped an action: apply it on its tick, like everyone else. */
  onCommit(a: Action): void { this.engine.schedule(a); }
  private afterStep(): void {
    const tick = this.engine.tickCount();
    if (tick > 0 && tick % SYNC_EVERY === 0) { this.hashes.set(tick, stateHash(this.engine.state)); if (this.hashes.size > KEEP) this.hashes.delete(this.hashes.keys().next().value as number); this.settle(); }
  }
  /** The host's checksum for a tick. If this device has not reached that tick yet, it waits. */
  onSync(tick: number, hash: string): SyncVerdict {
    const mine = this.hashes.get(tick);
    if (mine === undefined) { if (tick > this.engine.tickCount()) { this.waiting.push({ tick, hash }); return 'pending'; } return 'ok'; } // too old to compare: nothing to say
    return this.verdict(mine, hash);
  }
  private verdict(mine: string, theirs: string): SyncVerdict { if (mine === theirs) return 'ok'; this.onMismatch(); return 'mismatch'; }
  private settle(): void {
    this.waiting = this.waiting.filter(w => { const mine = this.hashes.get(w.tick); if (mine === undefined) return w.tick > this.engine.tickCount(); this.verdict(mine, w.hash); return false; });
  }
  stop(): void { this.engine.coop = null; this.engine.afterStep = null; this.engine.handsBy = 0; this.waiting = []; }
}

/**
 * Bring a helper's engine up to the host's present: adopt the opening snapshot, open the doors with the same headline, queue every
 * action committed so far, and step to the host's current tick. Returns the engine's refusal to open, if any.
 */
export function catchUp(engine: RestaurantEngine, snapshot: Parameters<RestaurantEngine['adopt']>[0], headline: Parameters<RestaurantEngine['open']>[0], log: readonly Action[], toTick: number): string | null {
  engine.clearScheduled(); engine.adopt(snapshot);
  const error = engine.open(headline); if (error) return error;
  for (const a of log) engine.schedule(a);
  for (let i = 0; i < toTick + INPUT_DELAY && engine.state.phase === 'service' && engine.tickCount() < toTick; i++) engine.tick();
  return null;
}
