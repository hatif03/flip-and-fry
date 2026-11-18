import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { UiResponse } from '@devvit/web/shared';
import { createPost } from '../core/post';

export const menu = new Hono();

menu.post('/post-today', async c => {
  try {
    const post = await createPost('Today on the roof');
    return c.json<UiResponse>({ navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}` });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to create the post' }, 400);
  }
});
