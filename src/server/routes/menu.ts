import { Hono } from 'hono';
import { context, redis } from '@devvit/web/server';
import type { UiResponse } from '@devvit/web/shared';
import { rollDay } from '../core/daily-post';
import { utcDate } from '../core/game';
import { retentionLine, retentionReport } from '../core/retention';
import { postApi } from '../reddit';

/** Pin today's post in the community highlights. */
export async function highlightToday(now: number): Promise<{ ok: true; postId: string } | { ok: false; error: string }> {
  const date = utcDate(now), result = await rollDay(redis, postApi, now, date);
  if ('error' in result) return { ok: false, error: result.busy ? 'Today’s post is being created. Try again in a moment.' : 'Could not find today’s post.' };
  try { await postApi.highlight?.(result.postId); return { ok: true, postId: result.postId }; } catch { return { ok: false, error: 'Reddit would not highlight the post. Check that the app is a moderator here.' }; }
}

export const menu = new Hono();

menu.post('/highlight-today', async c => {
  const r = await highlightToday(Date.now());
  return c.json<UiResponse>({ showToast: 'error' in r ? r.error : 'Today’s post is highlighted.' }, 'error' in r ? 400 : 200);
});

/** Totals only: how many players, how many came back, and when. Moderators only (devvit.json), and it reads ids, never names. */
menu.post('/retention-report', async c => {
  try { return c.json<UiResponse>({ showToast: retentionLine(await retentionReport({ store: redis, now: Date.now })) }); }
  catch (error) { console.error(`Error building the retention report: ${error}`); return c.json<UiResponse>({ showToast: 'Could not build the report.' }, 400); }
});

/** Same function the scheduler and the first player request of the day call; creating twice is impossible. */
menu.post('/post-today', async c => {
  try {
    const now = Date.now(), result = await rollDay(redis, postApi, now, utcDate(now));
    if ('error' in result) return c.json<UiResponse>({ showToast: result.busy ? 'Today’s post is being created. Try again in a moment.' : 'Could not create today’s post.' }, 400);
    return c.json<UiResponse>({ navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${result.postId.replace(/^t3_/, '')}` });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to create the post' }, 400);
  }
});
