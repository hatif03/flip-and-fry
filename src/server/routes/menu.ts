import { Hono } from 'hono';
import { context, redis } from '@devvit/web/server';
import type { UiResponse } from '@devvit/web/shared';
import { rollDay } from '../core/daily-post';
import { utcDate } from '../core/game';
import { postApi } from '../reddit';

export const menu = new Hono();

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
