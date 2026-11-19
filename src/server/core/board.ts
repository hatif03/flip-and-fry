import { VISITOR_NAME, type Shift } from '../../management/types';
import type { BoardEntry, BoardView, StoredRun } from '../../shared/api';
import { doorKey } from './doors';
import { dateAllowed, keys, utcDate, type Deps, type Fail, type Player } from './game';
import { withinRate } from './store';

/**
 * Today's board: the night's official results on this subreddit, best first (stars, then rating). Every number comes from a server replay
 * (the lock writes the sorted set, and nothing else does), so it cannot be forged. A neighbor's name appears only if they have left their
 * door open, which is their own choice to be seen; everyone else is "a neighbor". The player always sees their own row.
 */

const TOP = 10, SCAN = 200;
const fail = (status: Fail['status'], error: string): Fail => ({ ok: false, status, error });

export async function getBoard(deps: Deps, user: Player, date: string, shift: Shift = 'dinner'): Promise<{ ok: true; value: BoardView } | Fail> {
  if (!(await withinRate(deps.store, `rate:board:${user.id}`, 20, 60))) return fail(429, 'Slow down a little and try again.');
  if (!dateAllowed(date, utcDate(deps.now()))) return fail(400, 'That board is too old.');
  // Redis has no rank-of-member call in this interface, so read the first SCAN rows: a rank beyond that is shown as "outside the top".
  const rows = await deps.store.zRange(keys.board(date, shift), 0, SCAN - 1, { reverse: true });
  const runOf = async (id: string): Promise<StoredRun | null> => { const raw = await deps.store.hGet(keys.runs(date, shift), id); return raw ? (JSON.parse(raw) as StoredRun) : null; };
  const shown = await Promise.all(rows.slice(0, TOP).map(async (row, i): Promise<BoardEntry | null> => {
    const run = await runOf(row.member); if (!run) return null;
    const mine = row.member === user.id, visible = mine || ((await deps.store.get(doorKey(row.member))) !== undefined && VISITOR_NAME.test(run.username));
    return { rank: i + 1, name: mine ? run.username : visible ? run.username : 'a neighbor', stars: run.stars.stars, rating: run.report.rating, profit: Math.round(run.report.profit), you: mine };
  }));
  const entries = shown.filter((e): e is BoardEntry => e !== null), at = rows.findIndex(r => r.member === user.id);
  let you: BoardView['you'] = null;
  if (at >= 0) { const run = await runOf(user.id); if (run) you = { rank: at + 1, stars: run.stars.stars, profit: Math.round(run.report.profit) }; }
  return { ok: true, value: { type: 'board', date, shift, total: rows.length, entries, you } };
}
