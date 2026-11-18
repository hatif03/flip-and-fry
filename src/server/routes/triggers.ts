import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';

export const triggers = new Hono();

triggers.post('/on-app-install', async c => {
  try {
    const post = await createPost('Today on the roof');
    return c.json({ status: 'success', message: `Post ${post.id} created in r/${context.subredditName}` }, 200);
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json({ status: 'error', message: 'Failed to create the post' }, 400);
  }
});
