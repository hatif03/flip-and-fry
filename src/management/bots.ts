import { createDailyHeadline, type DailyHeadline } from './daily-headline';
import { runService, type Action, type ServiceResult } from './replay';
import { createRestaurant, type RestaurantState } from './types';

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
