import { mixSeed } from './daily-headline';

/**
 * The daily round (plan v5, P3): three small tasks a day, picked from the date and the player's level, so everyone at a level shares
 * the same three. Each pays XP once. Rounds finished in a week open a weekly crate. Every event that moves a task is written by the
 * server: a garden action, or a closed service's replayed receipt. Pure, so the server and the screen read the same rules.
 */
export type TaskKind = 'plant' | 'water' | 'harvest' | 'order' | 'craft' | 'serve' | 'stars' | 'combo';
export type Task = { kind: TaskKind; text: string; target: number; xp: number };
/** `level` is the player's level when the day's round began: the three tasks stay the same all day even after a level-up. */
export type Round = { date: string; level: number; progress: Partial<Record<TaskKind, number>>; done: TaskKind[]; week: string; full: number; crate: boolean };
/** Rounds to finish in a week (Monday to Sunday, UTC) to open the crate: five of seven, so one busy weekend does not lose it. */
export const CRATE_AT = 5;
export const CRATE = { cash: 150, xp: 30 } as const;

const GARDEN: Task[] = [
  { kind: 'plant', text: 'Plant 2 seeds', target: 2, xp: 6 },
  { kind: 'water', text: 'Water a crop', target: 1, xp: 4 },
  { kind: 'harvest', text: 'Harvest 2 crops', target: 2, xp: 8 },
  { kind: 'order', text: 'Fill an order on the board', target: 1, xp: 10 },
];
const SERVICE: Task[] = [
  { kind: 'serve', text: 'Serve 10 guests in one service', target: 10, xp: 10 },
  { kind: 'stars', text: 'Earn 3 stars today', target: 3, xp: 12 },
  { kind: 'combo', text: 'Reach a ×5 combo at the pass', target: 5, xp: 10 },
];
const CRAFT: Task = { kind: 'craft', text: 'Start a workshop batch', target: 1, xp: 8 };
/** Counted tasks add up through the day; the others keep the best single value (one service's guests, one night's combo). */
const BEST: readonly TaskKind[] = ['serve', 'combo'];

/** Today's three: one in the garden, one at the pass, and one more from either (the workshop joins at level 2). */
export function tasksFor(date: string, level: number): Task[] {
  let seed = 0; for (let i = 0; i < date.length; i++) seed = (Math.imul(seed, 31) + date.charCodeAt(i)) >>> 0;
  const roll = (n: number): number => { seed = mixSeed(seed + 0x2545f491 + level); return seed % n; };
  const garden = GARDEN[roll(GARDEN.length)], service = SERVICE[roll(SERVICE.length)];
  const rest = [...GARDEN, ...SERVICE, ...(level >= 2 ? [CRAFT] : [])].filter(t => t !== garden && t !== service);
  return [garden, service, rest[roll(rest.length)]];
}

/** Monday of the date's week, as YYYY-MM-DD. */
export function weekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`), back = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
export const freshRound = (): Round => ({ date: '', level: 1, progress: {}, done: [], week: '', full: 0, crate: false });

/** Today's round, rolled over when the date or the week changes. */
export function roundFor(round: Round | undefined, date: string, level: number): Round {
  const r = round ?? freshRound(), week = weekOf(date);
  const base = r.week === week ? r : { ...r, week, full: 0, crate: false };
  return base.date === date ? base : { ...base, date, level, progress: {}, done: [] };
}

/** One event. Returns the new round and the XP it earned (finished tasks pay once). */
export function bumpRound(round: Round | undefined, date: string, level: number, kind: TaskKind, value: number): { round: Round; xp: number } {
  const r = roundFor(round, date, level), tasks = tasksFor(date, r.level), task = tasks.find(t => t.kind === kind);
  if (!task || value <= 0 || r.done.includes(kind)) return { round: r, xp: 0 };
  const now = BEST.includes(kind) ? Math.max(r.progress[kind] ?? 0, value) : (r.progress[kind] ?? 0) + value;
  const next: Round = { ...r, progress: { ...r.progress, [kind]: Math.min(task.target, now) } };
  if (now < task.target) return { round: next, xp: 0 };
  next.done = [...r.done, kind];
  if (tasks.every(t => next.done.includes(t.kind))) next.full = r.full + 1;
  return { round: next, xp: task.xp };
}

/** What the screen shows: today's tasks with their progress, and the week toward the crate. */
export function roundView(round: Round | undefined, date: string, level: number) {
  const r = roundFor(round, date, level);
  return { tasks: tasksFor(date, r.level).map(t => ({ ...t, progress: r.progress[t.kind] ?? 0, done: r.done.includes(t.kind) })), full: r.full, crateAt: CRATE_AT, crateReady: r.full >= CRATE_AT && !r.crate, crateClaimed: r.crate };
}
export type RoundView = ReturnType<typeof roundView>;
