import { Hono } from 'hono';
import { context, redis } from '@devvit/web/server';
import { rollDay } from '../core/daily-post';
import { utcDate } from '../core/game';
import { postApi } from '../reddit';
import { redis as store } from '@devvit/web/server';
import { commentDeleted, postDeleted } from '../core/social';

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

/** Delete triggers can arrive more than once; both handlers are idempotent. A failure never blocks the platform. */
const deps = { store, now: () => Date.now() };
triggers.post('/comment-delete', async c => {
  try { const { commentId } = await c.req.json() as { commentId?: string }; if (commentId) await commentDeleted(deps, commentId); } catch (error) { console.error(`comment-delete failed: ${error}`); }
  return c.json({ status: 'ok' });
});
triggers.post('/post-delete', async c => {
  try { const { postId } = await c.req.json() as { postId?: string }; if (postId) await postDeleted(deps, postId); } catch (error) { console.error(`post-delete failed: ${error}`); }
  return c.json({ status: 'ok' });
});
