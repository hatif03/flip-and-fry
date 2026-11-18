import { Hono } from 'hono';
import { context, redis } from '@devvit/web/server';
import { rollDay } from '../core/daily-post';
import { utcDate } from '../core/game';
import { postApi } from '../reddit';

export const triggers = new Hono();

triggers.post('/on-app-install', async c => {
  try {
    const now = Date.now(), result = await rollDay(redis, postApi, now, utcDate(now));
    if ('error' in result) return c.json({ status: 'error', message: result.error }, 400);
    return c.json({ status: 'success', message: `Post ${result.postId} ready in r/${context.subredditName}` }, 200);
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json({ status: 'error', message: 'Failed to create the post' }, 400);
  }
});
