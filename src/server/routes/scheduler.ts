import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import { rollDay } from '../core/daily-post';
import { utcDate } from '../core/game';
import { postApi } from '../reddit';

export const scheduler = new Hono();

/** 00:05 UTC. The cron's timezone is undocumented, so this is a backup: the first player request of a day also rolls it. */
scheduler.post('/roll-day', async c => {
  const now = Date.now(), result = await rollDay(redis, postApi, now, utcDate(now));
  return c.json({ status: result.ok ? 'success' : 'error' }, result.ok ? 200 : 500);
});
