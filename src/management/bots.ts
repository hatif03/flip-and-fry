import { createDailyHeadline, type DailyHeadline } from './daily-headline';
import { RestaurantEngine } from './engine';
import { applyPlanning, MAX_SERVICE_TICKS, runService, stateHash, type Action, type ServiceResult } from './replay';
import { COMPS_PER_NIGHT, DISHES, createRestaurant, guestPatienceSeconds, type RestaurantState } from './types';

/**
 * Bots own a restaurant; they do not tap tickets. Each is a fixed set of planning actions on the starter park,
 * replayed through the same engine the server uses. They exist to calibrate the headlines: if a headline's star
 * line fails its gate, change its weight or its star line, never the engine's arrival or patience code.
 */
export type Bot = { name: string; actions: Action[] };

const plant: Action = { tick: 0, kind: 'place', item: { id: -1, kind: 'plant', x: 0, z: 8, rotation: 0 } };
const lamp: Action = { tick: 0, kind: 'place', item: { id: -1, kind: 'lamp', x: 4, z: 6, rotation: 0 } };

/** Sells the starter planters and lantern: a plain room at fair prices. */
export const bareBot: Bot = { name: 'bare', actions: [6, 7, 8].map(id => ({ tick: 0, kind: 'sell', id }) as Action) };
/** One planter, one lantern and a second server, prices left at fair value. The lone server carries every plate and cleans every table, so a second one is the first hire that raises throughput; decor draws guests only a floor that keeps up can serve. */
export const cozyBot: Bot = { name: 'cozy', actions: [{ tick: 0, kind: 'hire', role: 'server' }, plant, lamp] };
/** Pushes both prices well past fair (+50%) and buys no atmosphere. */
export const greedyBot: Bot = { name: 'greedy', actions: [{ tick: 0, kind: 'dish', dish: 'salad', enabled: true, price: 36 }, { tick: 0, kind: 'dish', dish: 'burger', enabled: true, price: 57 }] };
export const BOTS: readonly Bot[] = [bareBot, cozyBot, greedyBot];

/** `YYYY-MM-DD` for `count` consecutive UTC days starting at `start`, by day arithmetic (no Date object). */
export function datesFrom(start: string, count: number): string[] {
  const out: string[] = [], [y0, m0, d0] = start.split('-').map(Number);
  let y = y0, m = m0, d = d0;
  const dim = (yy: number, mm: number) => mm === 2 ? (yy % 4 === 0 && (yy % 100 !== 0 || yy % 400 === 0) ? 29 : 28) : [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    if (++d > dim(y, m)) { d = 1; if (++m > 12) { m = 1; y++; } }
  }
  return out;
}

export type BotRun = { bot: string; date: string; headline: DailyHeadline; result: ServiceResult };
/** One service from the starter park under that date's headline. */
export function runBot(bot: Bot, date: string, start: RestaurantState = createRestaurant()): BotRun {
  const headline = createDailyHeadline(date);
  return { bot: bot.name, date, headline, result: runService(start, bot.actions, headline) };
}

/**
 * A scripted owner who helps at the pass: each tick it plates the dish it is cooking at the perfect moment, comps a table that is
 * about to walk out, and otherwise claims the ticket that has waited longest. It plays the live engine and records exactly what a
 * client would send, so the same night can be replayed (as the server does) and the receipts compared.
 */
export function helperPolicy(engine: RestaurantEngine): void {
  const s = engine.state, cooking = s.guests.find(g => g.owner);
  if (cooking) { if (cooking.cook >= DISHES[cooking.dish].seconds) engine.plate(cooking.id); return; }
  if (s.comps < COMPS_PER_NIGHT) {
    const patience = guestPatienceSeconds(s), desperate = s.guests.find(g => ['waiting', 'cooking', 'ready', 'delivering'].includes(g.stage) && g.price > 0 && g.waiting > patience * .85);
    if (desperate) engine.comp(desperate.id);
  }
  const next = s.guests.filter(g => g.stage === 'waiting').sort((a, b) => b.waiting - a.waiting)[0];
  if (next) engine.claimTicket(next.id);
}

export type HelpedRun = { actions: Action[]; liveHash: string; live: RestaurantState; replay: ServiceResult };
/** Plays one service live with the helper and then replays the recorded log, so a test can prove they agree. */
export function playWithHelper(bot: Bot, date: string, start: RestaurantState = createRestaurant(), helper: (e: RestaurantEngine) => void = helperPolicy): HelpedRun {
  const headline = createDailyHeadline(date), planned = applyPlanning(start, bot.actions);
  if ('error' in planned) throw new Error(planned.error);
  const engine = new RestaurantEngine(undefined, () => 0), owner: Action[] = [];
  engine.autoRoll = false; engine.state = structuredClone(planned.state); engine.onAction = a => owner.push(a);
  const error = engine.open(headline); if (error) throw new Error(error);
  for (let i = 0; i < MAX_SERVICE_TICKS && engine.state.phase === 'service'; i++) { helper(engine); engine.tick(); }
  const actions = [...bot.actions, ...owner];
  return { actions, liveHash: stateHash(engine.state), live: engine.state, replay: runService(start, actions, headline) };
}
