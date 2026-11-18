import { dayOfYear } from '../management/daily-headline';
import { SHIFTS } from '../game/config';

/**
 * Today's shift in the Test Kitchen: the date picks one of the three shifts, so everyone is offered the same one today. It is only ever
 * a shift the player has already unlocked (a new player gets Golden Hour). The Test Kitchen is not replayed on the server, so this is a
 * shared suggestion, not a ranking.
 */
export function shiftOfDay(date: string, unlocked: (level: number) => boolean): number {
  let level = dayOfYear(date).index % SHIFTS.length;
  while (level > 0 && !unlocked(level)) level--;
  return level;
}
