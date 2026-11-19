import { shiftDate } from '../../management/daily-headline';
import { COHORT_KEY, activeKey, utcDate, type Deps } from './game';

/**
 * Retention in numbers, for moderators only, as totals. It reads two things the game records when someone plays: the day each player was
 * first seen, and the set of players active on each day (ids, never names). A player returns on day N when they were active N days after
 * the day they were first seen. A rate is only counted for players old enough to have had day N (so it never includes a day still going).
 */
export type RetentionReport = {
  players: number; dau: number; mau: number;
  /** Share of eligible players (0 to 1), or null while nobody is old enough. */
  d1: number | null; d7: number | null; d30: number | null;
  /** Players active in the last 30 days but not in the last 7, as a share of those active in the last 30. */
  churn: number | null;
  /** Players with at least two active days, as a share of all players: a plain "came back at all". */
  returning: number | null;
  eligible: { d1: number; d7: number; d30: number };
};

const ratio = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);

export async function retentionReport(deps: Deps): Promise<RetentionReport> {
  const today = utcDate(deps.now()), first = await deps.store.hGetAll(COHORT_KEY), ids = Object.keys(first);
  const dayCache = new Map<string, Record<string, string>>();
  const day = async (d: string): Promise<Record<string, string>> => { if (!dayCache.has(d)) dayCache.set(d, await deps.store.hGetAll(activeKey(d))); return dayCache.get(d)!; };
  const rate = async (n: number): Promise<{ rate: number | null; eligible: number }> => {
    let eligible = 0, back = 0;
    for (const id of ids) { const due = shiftDate(first[id], n); if (due >= today) continue; eligible++; if ((await day(due))[id]) back++; }
    return { rate: ratio(back, eligible), eligible };
  };
  const [d1, d7, d30] = [await rate(1), await rate(7), await rate(30)];
  const lastActive = new Map<string, number>(), activeDays = new Map<string, number>();
  for (let i = 0; i < 30; i++) for (const id of Object.keys(await day(shiftDate(today, -i)))) { if (!lastActive.has(id)) lastActive.set(id, i); activeDays.set(id, (activeDays.get(id) ?? 0) + 1); }
  const lapsed = [...lastActive.values()].filter(i => i >= 7).length;
  const returning = ids.filter(id => (activeDays.get(id) ?? 0) >= 2).length;
  return {
    players: ids.length, dau: Object.keys(await day(today)).length, mau: lastActive.size,
    d1: d1.rate, d7: d7.rate, d30: d30.rate, churn: ratio(lapsed, lastActive.size), returning: ratio(returning, ids.length),
    eligible: { d1: d1.eligible, d7: d7.eligible, d30: d30.eligible },
  };
}

const pct = (v: number | null): string => (v === null ? 'n/a' : `${Math.round(v * 100)}%`);
/** One short line for a toast. Totals only. */
export function retentionLine(r: RetentionReport): string {
  return `Players ${r.players} · today ${r.dau} · 30 days ${r.mau} · D1 ${pct(r.d1)} · D7 ${pct(r.d7)} · D30 ${pct(r.d30)} · lapsed ${pct(r.churn)}`;
}
