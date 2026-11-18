import { actionLogSchema, isServiceAction, MAX_SERVICE_ACTIONS, MAX_SERVICE_TICKS, type Action } from './actions';
import { RestaurantEngine } from './engine';
import type { DailyHeadline } from './daily-headline';
import { layoutError } from './layout';
import { restaurantSchema, width, type Furniture, type Report, type RestaurantState } from './types';

/**
 * The engine is a pure function: (opening state, action log) → receipt. The server replays the log to lock a score,
 * bots call it headless, and co-op clients drive the same log in lockstep. Nothing here reads a clock or a random source.
 * Planning actions run before the doors open and use the engine's own methods, so cash, phase and layout checks are the game's.
 */
export { actionLogSchema, actionSchema, isServiceAction, MAX_ACTIONS, MAX_SERVICE_ACTIONS, MAX_SERVICE_TICKS, type Action } from './actions';

export type ServiceResult =
  | { ok: true; report: Report; state: RestaurantState; hash: string; ticks: number; rejected: number }
  | { ok: false; error: string };

function apply(engine: RestaurantEngine, a: Action): string | null {
  switch (a.kind) {
    case 'place': return engine.place(a.item as Furniture);
    case 'sell': return engine.sell(a.id);
    case 'hire': return engine.hire(a.role);
    case 'train': return engine.train(a.id);
    case 'dish': return engine.setDish(a.dish, a.enabled, a.price);
    case 'expand': return engine.expand();
    case 'loan': return engine.loan();
    case 'claim': return engine.claim(a.id);
    case 'dismiss': return engine.dismiss(a.id);
    case 'rename': engine.rename(a.name); return null;
    case 'music': engine.setMusic(a.on); return null;
    case 'research': return engine.setResearch(a.budget);
    case 'outfit': return engine.setOutfit(a.part, a.color);
    case 'claimTicket': return engine.claimTicket(a.guestId);
    case 'cook': return engine.plate(a.guestId);
    case 'abandon': return engine.abandonCook(a.guestId);
    case 'priority': return engine.rush(a.guestId);
    case 'hold': return engine.holdPrep(a.guestId);
    case 'release': return engine.releasePrep(a.guestId);
    case 'comp': return engine.comp(a.guestId);
  }
}

/** JSON with object keys sorted, so a state built by createRestaurant() and one rebuilt by zod serialize identically. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** FNV-1a over canonical JSON, twice with different offsets. JSON number printing is specified, so every engine agrees. */
export function stateHash(state: RestaurantState): string {
  const text = canonical(state);
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x01000193) >>> 0; }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** Validate a closed-doors state and an action log, and build an engine holding a private copy of the state. */
function prepare(initial: RestaurantState, actions: readonly Action[]): { engine: RestaurantEngine; log: Action[] } | { error: string } {
  const parsed = restaurantSchema.safeParse(initial);
  if (!parsed.success) return { error: 'Invalid restaurant.' };
  const state = parsed.data as RestaurantState;
  if (state.phase !== 'planning') return { error: 'A service starts with the doors closed.' };
  const layout = layoutError(state.furniture, width(state));
  if (layout) return { error: layout };
  const log = actionLogSchema.safeParse(actions);
  if (!log.success) return { error: 'Invalid action log.' };
  // now() is pinned: save() stamps lastActiveAt from the clock, which would make the receipt depend on the host.
  const engine = new RestaurantEngine(undefined, () => 0);
  engine.autoRoll = false;
  engine.state = structuredClone(state);
  return { engine, log: log.data };
}

/** Why this state cannot open the doors yet (the same first message the engine's open() would give), or null. */
export function openError(state: RestaurantState): string | null {
  const prepared = prepare(state, []);
  if ('error' in prepared) return prepared.error;
  return prepared.engine.readiness()[0] ?? null;
}

/** Apply planning actions to a closed-doors state without opening. Used to persist the owner's between-service changes. */
export function applyPlanning(initial: RestaurantState, actions: readonly Action[]): { ok: true; state: RestaurantState } | { ok: false; error: string } {
  const prepared = prepare(initial, actions);
  if ('error' in prepared) return { ok: false, error: prepared.error };
  if (prepared.log.some(isServiceAction)) return { ok: false, error: 'Owner actions at the pass belong to an open service.' };
  for (const action of prepared.log) { const error = apply(prepared.engine, action); if (error) return { ok: false, error }; }
  return { ok: true, state: prepared.engine.state };
}

/**
 * Replay one service from a closed-doors state. The input is never mutated. Planning actions (tick 0) run first and must all
 * succeed. Service actions (the owner at the pass) run on the tick they are stamped with; one the engine refuses does nothing
 * and is counted in `rejected`, because the same engine that took the action live would have taken it here, so a refusal can
 * only be a stale or forged action and must not change the night.
 */
export function runService(initial: RestaurantState, actions: readonly Action[], headline?: DailyHeadline): ServiceResult {
  const prepared = prepare(initial, actions);
  if ('error' in prepared) return { ok: false, error: prepared.error };
  const { engine, log } = prepared, planning = log.filter(a => !isServiceAction(a)), owner = log.filter(isServiceAction);
  if (owner.length > MAX_SERVICE_ACTIONS) return { ok: false, error: 'Too many owner actions for one service.' };
  for (let i = 1; i < owner.length; i++) if (owner[i].tick < owner[i - 1].tick) return { ok: false, error: 'Owner actions are out of order.' };
  for (const action of planning) { const error = apply(engine, action); if (error) return { ok: false, error }; }
  const error = engine.open(headline);
  if (error) return { ok: false, error };
  const day = engine.state.day;
  let ticks = 0, next = 0, rejected = 0;
  while (engine.state.phase === 'service' && engine.state.day === day && ticks < MAX_SERVICE_TICKS) {
    while (next < owner.length && owner[next].tick <= engine.tickCount()) { if (owner[next].tick < engine.tickCount() || apply(engine, owner[next])) rejected++; next++; }
    engine.tick(); ticks++;
  }
  if (engine.state.phase === 'service') return { ok: false, error: 'The service did not close.' };
  const report = engine.state.history[engine.state.history.length - 1];
  return { ok: true, report, state: engine.state, hash: stateHash(engine.state), ticks, rejected };
}
