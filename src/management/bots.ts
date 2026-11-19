import { createDailyHeadline, type DailyHeadline } from './daily-headline';
import { RestaurantEngine } from './engine';
import { applyPlanning, MAX_SERVICE_TICKS, runService, stateHash, type Action, type ServiceResult } from './replay';
import { COMPS_PER_NIGHT, DISHES, createRestaurant, guestPatienceSeconds, isCozy, MOVE_AT, type RestaurantState } from './types';

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

/** How long the scripted owner takes to notice a job and react, in simulated seconds. A person is not instant. */
export const REACTION = 1;
/**
 * The scripted owner with the floor too: seats a party at a cosy table when there is one, takes orders, carries finished dishes, wipes
 * tables, and then does everything `helperPolicy` does at the pass. It reacts after REACTION seconds, as a person would.
 */
export function floorPolicy(engine: RestaurantEngine): void {
  const s = engine.state;
  const party = s.guests.find(g => g.stage === 'queued' && g.waiting >= REACTION);
  if (party) {
    const options = s.furniture.filter(f => f.kind === 'table').flatMap(table => [0, 1].filter(seat => engine.seatFree(table, seat)).slice(0, 1).map(seat => ({ table, seat, cozy: isCozy(s.furniture, table) }))).sort((a, b) => Number(b.cozy) - Number(a.cozy));
    if (options.length) engine.seat(party.id, options[0].table.id, options[0].seat);
  }
  if (s.incident && s.elapsed - s.incident.at >= REACTION) engine.decide(s.incident.kind === 'complaint' ? 2 : 1);
  const mine = s.guests.find(g => g.owner), hands = mine && s.hands.find(h => h.guestId === mine.id);
  if (mine && hands && !hands.moved && mine.cook >= MOVE_AT * DISHES[mine.dish].seconds) engine.move(mine.id);
  const seated = s.guests.find(g => g.stage === 'seated' && g.timer >= REACTION); if (seated) engine.order(seated.id);
  const ready = s.guests.find(g => g.stage === 'ready' || g.stage === 'delivering'); if (ready) engine.serve(ready.id);
  const dirty = s.dirty[0]; if (dirty) { const [tableId, seat] = dirty.split(':').map(Number); engine.clear(tableId, seat); }
  helperPolicy(engine);
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
