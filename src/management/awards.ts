import { findPath, accessPoints } from './layout';
import { CATALOG, DISHES, entrance, guestPatienceSeconds, width, type Dish, type Report, type RestaurantState, type VisitNote } from './types';

/**
 * The end-of-night read of a service: the kitchen card (Welcome, Speed, Value), one award banner, and the company value. All of it
 * is computed from the replayed state, so it is as trustworthy as the receipt. Pure: no clock, no random source.
 */
export type AwardId = 'untidy' | 'quiet' | 'prices' | 'food' | 'warm' | 'confusing' | 'steady';
export type Award = { id: AwardId; title: string; text: string };
export type KitchenCard = { welcome: number; speed: number; value: number };
export type NightSummary = { neighbors: VisitNote[]; card: KitchenCard; award: Award; companyValue: number; best: { value: number; day: number }; newBest: boolean; avgWait: number; pathLength: number };

const clamp = (v: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, v));
const AWARDS: Record<AwardId, { title: string; text: string }> = {
  untidy: { title: 'Untidy close', text: 'Dirty tables were still out when the doors closed.' },
  quiet: { title: 'Quiet night', text: 'The doors were open and almost nobody came.' },
  prices: { title: 'Sharp prices', text: 'Strong profit, and guests who balked at the menu did not slow you down.' },
  food: { title: 'Best food', text: 'Plenty served, and nobody waited long.' },
  warm: { title: 'Warmest room', text: 'A cozy room and almost nobody walked out.' },
  confusing: { title: 'Most confusing layout', text: 'Seats that exist, but a long walk to reach them.' },
  steady: { title: 'A steady night', text: 'A solid service with nothing out of the ordinary.' },
};

/** Average steps from the entrance to a seat. A pretty room nobody can reach quickly scores low on Welcome. */
export function averagePathLength(state: RestaurantState): number {
  const lengths: number[] = [];
  for (const table of state.furniture.filter(f => f.kind === 'table')) for (const point of accessPoints(table)) { const path = findPath(state.furniture, width(state), entrance, point); if (path) lengths.push(path.length); }
  return lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
}

/** How well the menu is priced: fair prices score highest; a menu far above fair scares guests off, far below leaves money behind. */
export function valueScore(state: RestaurantState, refused: number): number {
  const on = (Object.keys(DISHES) as Dish[]).filter(d => state.menu[d].enabled);
  if (!on.length) return 0;
  const ratio = on.reduce((sum, d) => sum + state.menu[d].price / DISHES[d].fair, 0) / on.length;
  return Math.round(clamp(100 - Math.max(0, ratio - 1.05) * 220 - Math.max(0, .9 - ratio) * 120 - refused * 4));
}

export function nightSummary(state: RestaurantState, report: Report): NightSummary {
  const n = state.night, patience = guestPatienceSeconds(state), avgWait = report.served ? n.waitSeconds / report.served : 0, pathLength = averagePathLength(state);
  const comfortPoints = state.furniture.reduce((sum, f) => sum + CATALOG[f.kind].comfort, 20);
  const card: KitchenCard = {
    welcome: Math.round(clamp(Math.min(100, comfortPoints) * .6 + clamp(100 - (pathLength - 6) * 6) * .4)),
    speed: Math.round(clamp(100 * (1 - avgWait / patience) - report.missed * 2)),
    value: valueScore(state, n.refused),
  };
  const arrivals = report.served + report.missed;
  const id: AwardId = n.dirtyAtClose >= 3 ? 'untidy'
    : arrivals <= 6 ? 'quiet'
    : report.profit >= 250 && n.refused >= 3 ? 'prices'
    : report.served >= 16 && avgWait <= patience * .35 ? 'food'
    : comfortPoints >= 50 && n.walkouts <= 1 ? 'warm'
    : pathLength >= 14 ? 'confusing' : 'steady';
  const value = state.best.day === report.day ? state.best.value : 0;
  return { neighbors: n.visitors.map(v => ({ ...v })), card, award: { id, ...AWARDS[id] }, companyValue: Math.round(state.cash + state.furniture.reduce((s, f) => s + Math.floor(CATALOG[f.kind].price * .7), 0) - state.debt), best: { value: state.best.value, day: state.best.day }, newBest: value > 0 && state.best.day === report.day, avgWait, pathLength };
}

/** The one-line thought the kitchen card gives a visitor or a reader: its weakest number, in plain words. */
export function cardThought(card: KitchenCard): string {
  const worst = (Object.entries(card) as Array<[keyof KitchenCard, number]>).sort((a, b) => a[1] - b[1])[0];
  return worst[0] === 'speed' ? 'Long wait' : worst[0] === 'welcome' ? 'A bit bare' : 'Pricey menu';
}
