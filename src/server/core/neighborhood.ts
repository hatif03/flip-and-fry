import { createDailyHeadline, formatDate, shiftDate } from '../../management/daily-headline';
import type { StoredRun } from '../../shared/api';
import { POSTS_KEY, type PostApi } from './daily-post';
import { keys, type Deps } from './game';

/** A moderator names the neighborhood in the subreddit's settings. It is painted on the daily bar, so it is held to the same allowlist as a restaurant name. */
export const NEIGHBORHOOD_MAX = 24;
export function neighborhoodName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  return name.length >= 1 && name.length <= NEIGHBORHOOD_MAX && /^[\p{L}\p{N} ']+$/u.test(name) ? name : null;
}
/** The text the settings form checks before it saves. */
export const neighborhoodProblem = (raw: unknown): string | undefined => (raw === undefined || raw === null || raw === '' || neighborhoodName(raw)) ? undefined : `Use letters, numbers, spaces and apostrophes, up to ${NEIGHBORHOOD_MAX} characters.`;

export const reportKey = (date: string): string => `report:${date}`;
const REPORT_TTL = 45 * 86400;

export type Tally = { kitchens: number; opens: number; served: number; threeStar: number; warm: number; topAward: { title: string; count: number } | null; best: { name: string; rating: number; stars: number } | null };

/** Everything the report says, counted from the stored receipts. Names are the allowlisted restaurant names, never user names. */
export async function tally(deps: Deps, date: string): Promise<Tally> {
  const [raw, community] = await Promise.all([deps.store.hGetAll(keys.runs(date)), deps.store.hGetAll(keys.community(date))]);
  const runs = Object.values(raw).flatMap(text => { try { return [JSON.parse(text) as StoredRun]; } catch { return []; } });
  const awards = new Map<string, number>(); let served = 0, threeStar = 0, warm = 0, best: Tally['best'] = null;
  for (const run of runs) {
    served += run.report.served; if (run.stars.stars === 3) threeStar++; if (run.night.card.welcome >= 70) warm++;
    awards.set(run.night.award.title, (awards.get(run.night.award.title) ?? 0) + 1);
    if (!best || run.report.rating > best.rating || (run.report.rating === best.rating && run.stars.stars > best.stars)) best = { name: run.name, rating: run.report.rating, stars: run.stars.stars };
  }
  const top = [...awards.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return { kitchens: runs.length, opens: Number(community.opens ?? 0), served, threeStar, warm, topAward: top ? { title: top[0], count: top[1] } : null, best };
}

/** The app's comment at the end of a day. Nothing is invented: a quiet day says so. */
export function reportText(date: string, t: Tally): string {
  const headline = createDailyHeadline(date), next = createDailyHeadline(shiftDate(date, 1));
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  const lines = [`**Last night on the roof · ${formatDate(date)} · ${headline.title}**`, ''];
  if (!t.kitchens) lines.push('No kitchen closed its doors on this one. The rooftop was quiet.');
  else {
    lines.push(`- ${plural(t.kitchens, 'kitchen', 'kitchens')} closed the night and served ${plural(t.served, 'guest', 'guests')}`);
    if (t.threeStar) lines.push(`- ${plural(t.threeStar, 'perfect night', 'perfect nights')} (3 stars)`);
    if (t.warm) lines.push(`- ${plural(t.warm, 'warm room', 'warm rooms')}`);
    if (t.topAward) lines.push(`- Most common award: ${t.topAward.title}`);
    if (t.best) lines.push(`- Best night: ${t.best.name}, rating ${t.best.rating.toFixed(1)}`);
  }
  lines.push('', `Tomorrow: ${formatDate(next.date)} · ${next.title}`);
  return lines.join('\n');
}

export type ReportResult = 'posted' | 'already' | 'no-post' | 'failed';

/**
 * Post the report for `date` under that day's post, once. The claim comes first so the 00:05 job and the first request of the next
 * day (the cron's timezone is undocumented) cannot both post. A failed post releases the claim so a later call can retry.
 */
export async function postNightReport(deps: Deps, api: Pick<PostApi, 'comment'>, date: string): Promise<ReportResult> {
  const stored = await deps.store.hGet(POSTS_KEY, date);
  let postId: string | undefined; try { postId = stored ? (JSON.parse(stored) as { postId?: string }).postId : undefined; } catch { postId = undefined; }
  if (!postId) return 'no-post';
  if ((await deps.store.hSetNX(reportKey(date), 'claim', String(deps.now()))) === 0) return 'already';
  await deps.store.expire(reportKey(date), REPORT_TTL);
  try { await api.comment(postId, reportText(date, await tally(deps, date))); return 'posted'; }
  catch { await deps.store.hDel(reportKey(date), ['claim']); return 'failed'; }
}
