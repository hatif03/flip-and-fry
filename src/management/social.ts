import { DISHES, DISH_IDS, STYLE_NAMES, type Dish, type RestaurantState } from './types';

/** Text rules for the things a player can post. Pure and shared, so the preview the player confirms is exactly what the server sends. */
export const NOTE_MAX = 80;

/** The house style the comment names: the styles of the dishes on the menu, in menu order ("Garden & Grill"). */
export function houseStyle(state: Pick<RestaurantState, 'menu'>): string {
  const styles = [...new Set(DISH_IDS.filter(d => state.menu[d].enabled).map(d => DISHES[d].style))];
  const names = styles.map(s => STYLE_NAMES[s]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : names[0] ?? 'Garden';
}

/** The canned receipt comment. No score is invented here: every figure comes from the replayed night. */
export function receiptComment(args: { name: string; style: string; award: string; rating: number; streak: number }): string {
  return `${args.name} · ${args.style} · ${args.award} · rating ${args.rating.toFixed(1)}${args.streak > 0 ? ` · ${args.streak}-day streak` : ''}`;
}

/** An optional note under the canned line: short, one line, plain text, no links. Returns the clean note or an error to show. */
export function cleanNote(raw: string): { ok: true; note: string } | { ok: false; error: string } {
  const note = raw.replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (note.length > NOTE_MAX) return { ok: false, error: `Keep the note under ${NOTE_MAX + 1} characters.` };
  if (/https?:|www\.|\.(com|net|org|io|gg|ly)\b|reddit\.com|\bu\/|\br\//i.test(note)) return { ok: false, error: 'Notes cannot contain links or user names.' };
  return { ok: true, note };
}

/** The dish a visiting neighbor would order from this menu: the most expensive one that is on it. Used by the presence heartbeat and by visits. */
export const houseDish = (state: Pick<RestaurantState, 'menu'>): Dish =>
  [...DISH_IDS].filter(d => state.menu[d].enabled).sort((a, b) => state.menu[b].price - state.menu[a].price)[0] ?? 'salad';

/** How a neighbor's visit read, for the host's result card. Plain words, no scores. */
export const neighborLine = (n: { name: string; outcome: 'served' | 'left' | 'passed'; tip: number; wait: number; quality?: number }): string =>
  n.outcome === 'served' ? `${n.name} was served in ${n.wait}s${n.quality === 3 ? ', perfectly cooked' : ''} and left a $${n.tip} tip` : n.outcome === 'left' ? `${n.name} waited too long and left` : `${n.name} looked in, but nothing on the menu was for them`;

/** The neighborhood's shapes, shared by the server that builds them and the panel that shows them. */
export type DoorSummary = { id: string; kind: 'real' | 'sample'; kitchen: string; style: string; host: string | null; blurb: string };
export type VisitResult = { door: DoorSummary; outcome: 'served' | 'left' | 'passed'; tip: number; wait: number; line: string };
export type BulletinNote = { visitor: string; kitchen: string; outcome: 'served' | 'left' | 'passed'; tip: number; line: string; thought: string; date: string };
export type NeighborhoodView = { doors: DoorSummary[]; mine: boolean; allowed: boolean; bulletin: BulletinNote[] };
/** The realtime channel a host listens on for visits to their kitchen. Channel names cannot contain a colon. */
export const visitChannel = (hostId: string): string => `visits_${hostId}`;
/** One bulletin line as the host reads it. */
export const bulletinLine = (n: BulletinNote): string => `${n.visitor}: ${n.line}. ${n.thought}`;

export const FLAIR = { background: '#DC533C', text: 'light' } as const;
const TIERS: Array<[number, string]> = [[30, 'Rooftop regular'], [14, 'Golden hour'], [7, 'House favorite'], [3, 'Regular'], [1, 'Opened the doors']];
/** The flair a streak earns, or null while there is no streak. */
export function flairForStreak(streak: number): string | null { return TIERS.find(([min]) => streak >= min)?.[1] ?? null; }
