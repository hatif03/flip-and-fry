import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type { InitResponse } from '../../shared/api';

export const api = new Hono();

// Identity always comes from the Devvit context, never from the request body.
api.get('/init', async c => {
  const { postId } = context;
  if (!postId) return c.json({ status: 'error', message: 'postId is required' }, 400);
  const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
  return c.json<InitResponse>({ type: 'init', postId, date: new Date().toISOString().slice(0, 10), username });
});
