import { DISHES, type Guest } from './types';

/** Current service mood; presentation only, never changes tips, reputation or saves. */
export type GuestMood = 'content' | 'uneasy' | 'unhappy' | 'served';

/** Uses simulation waiting time until delivery, then the engine's recorded outcome. */
export function guestSatisfaction(guest: Pick<Guest, 'stage' | 'waiting' | 'happy'>, patienceSeconds: number): number {
  if (guest.stage === 'leaving') return guest.happy ? 100 : 0;
  if (guest.stage === 'eating') return 100;
  if (guest.stage === 'arriving') return 100;
  return Math.round(Math.max(0, Math.min(1, 1 - guest.waiting / patienceSeconds)) * 100);
}

/** Color and face share the same thresholds, so the bar is not color-only feedback. */
export function guestMood(value: number, stage: Guest['stage'], happy: boolean): GuestMood {
  if (stage === 'eating' || stage === 'leaving' && happy) return 'served';
  return value <= 20 ? 'unhappy' : value <= 50 ? 'uneasy' : 'content';
}

/** What a guest is thinking, from the same numbers the simulation already uses. Display only: it never changes tips or saves. */
export type Thought = { text: string; tone: 'good' | 'bad' };
export function guestThought(guest: Pick<Guest, 'stage' | 'waiting' | 'happy' | 'dish' | 'price' | 'quality' | 'paid'>, patienceSeconds: number): Thought | null {
  const fair = DISHES[guest.dish].fair, ratio = guest.price / fair;
  if (guest.stage === 'leaving') return guest.happy ? null : { text: 'Too long a wait', tone: 'bad' };
  if (guest.stage === 'arriving') return null;
  if (guest.stage === 'eating') return guest.quality === 3 ? { text: 'Perfectly cooked', tone: 'good' } : ratio < .9 ? { text: 'Great value', tone: 'good' } : ratio > 1.1 ? { text: 'A bit pricey', tone: 'bad' } : { text: 'Lovely', tone: 'good' };
  if (guestSatisfaction(guest, patienceSeconds) <= 30) return { text: 'Long wait', tone: 'bad' };
  return ratio > 1.15 && guest.waiting < 12 ? { text: 'Too pricey', tone: 'bad' } : null;
}

/** Anchor above each species' head/ears, in the customer rig's local coordinates. */
export function satisfactionHeight(species: Guest['species']): number {
  return species === 'rabbit' ? 2.9 : species === 'mouse' ? 2.65 : species === 'bear' ? 2.55 : 2.4;
}
