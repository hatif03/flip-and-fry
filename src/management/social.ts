import { DISHES, type Dish, type RestaurantState } from './types';

/** Text rules for the things a player can post. Pure and shared, so the preview the player confirms is exactly what the server sends. */
export const NOTE_MAX = 80;

/** The house style the comment names. Menu styles (Garden, Grill, Noodle) refine this later; for now it follows the enabled dishes. */
export function houseStyle(state: Pick<RestaurantState, 'menu'>): string {
  const on = (Object.keys(DISHES) as Dish[]).filter(d => state.menu[d].enabled);
  return on.length === 2 ? 'Garden & Grill' : on[0] === 'burger' ? 'Grill' : 'Garden';
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

export const FLAIR = { background: '#DC533C', text: 'light' } as const;
const TIERS: Array<[number, string]> = [[30, 'Rooftop regular'], [14, 'Golden hour'], [7, 'House favorite'], [3, 'Regular'], [1, 'Opened the doors']];
/** The flair a streak earns, or null while there is no streak. */
export function flairForStreak(streak: number): string | null { return TIERS.find(([min]) => streak >= min)?.[1] ?? null; }
