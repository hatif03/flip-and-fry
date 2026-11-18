import { actionLogSchema, type Action } from './actions';
import { RestaurantEngine } from './engine';
import type { DailyHeadline } from './daily-headline';
import { layoutError } from './layout';
import { DAY_LENGTH, restaurantSchema, width, type Furniture, type Report, type RestaurantState } from './types';

/**
 * The engine is a pure function: (opening state, action log) → receipt. The server replays the log to lock a score,
 * bots call it headless, and co-op clients drive the same log in lockstep. Nothing here reads a clock or a random source.
 * Planning actions run before the doors open and use the engine's own methods, so cash, phase and layout checks are the game's.
 */
export { actionLogSchema, actionSchema, MAX_ACTIONS, type Action } from './actions';
/** A service ends by DAY_LENGTH + 90 s of sim time at the latest; anything longer is a bug, not a slow night. */
export const MAX_SERVICE_TICKS = Math.round((DAY_LENGTH + 90) * 10) + 20;

export type ServiceResult =
  | { ok: true; report: Report; state: RestaurantState; hash: string; ticks: number }
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
  for (const action of prepared.log) { const error = apply(prepared.engine, action); if (error) return { ok: false, error }; }
  return { ok: true, state: prepared.engine.state };
}

/** Replay one service from a closed-doors state. The input is never mutated. */
export function runService(initial: RestaurantState, actions: readonly Action[], headline?: DailyHeadline): ServiceResult {
  const prepared = prepare(initial, actions);
  if ('error' in prepared) return { ok: false, error: prepared.error };
  const { engine, log } = prepared;
  for (const action of log) { const error = apply(engine, action); if (error) return { ok: false, error }; }
  const error = engine.open(headline);
  if (error) return { ok: false, error };
  const day = engine.state.day;
  let ticks = 0;
  while (engine.state.phase === 'service' && engine.state.day === day && ticks < MAX_SERVICE_TICKS) { engine.tick(); ticks++; }
  if (engine.state.phase === 'service') return { ok: false, error: 'The service did not close.' };
  const report = engine.state.history[engine.state.history.length - 1];
  return { ok: true, report, state: engine.state, hash: stateHash(engine.state), ticks };
}
