import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import { rollDay } from '../core/daily-post';
import { shiftDate } from '../../management/daily-headline';
import { utcDate } from '../core/game';
import { postNightReport } from '../core/neighborhood';
import { postApi } from '../reddit';

export const scheduler = new Hono();

/** Just after midnight: the app's comment on yesterday's post. Claimed once, so the lazy path in /api/today and this job cannot both post. */
scheduler.post('/night-report', async c => {
  const now = Date.now(), result = await postNightReport({ store: redis, now: () => now }, postApi, shiftDate(utcDate(now), -1));
  return c.json({ status: result === 'failed' ? 'error' : 'success', result }, result === 'failed' ? 500 : 200);
});

/** 00:05 UTC. The cron's timezone is undocumented, so this is a backup: the first player request of a day also rolls it. */
scheduler.post('/roll-day', async c => {
  const now = Date.now(), result = await rollDay(redis, postApi, now, utcDate(now));
  return c.json({ status: result.ok ? 'success' : 'error' }, result.ok ? 200 : 500);
});
