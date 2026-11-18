import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { context, redis, reddit } from '@devvit/web/server';
import { actionLogSchema } from '../../management/replay';
import type { ErrorResponse, InitResponse } from '../../shared/api';
import { getToday, lockService, openService, savePark, type Deps, type Fail, type Player } from '../core/game';

export const api = new Hono();

/** The only storage the game logic sees. Everything else lives behind `Store`, so it is tested without Devvit. */
const deps: Deps = { store: redis, now: () => Date.now() };

const saveBody = z.object({ rev: z.number().int().nonnegative(), actions: actionLogSchema });
const lockBody = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), actions: actionLogSchema });

// A 400-action log is about 40 KB. Anything near the 4 MB platform limit is not a game request.
api.use('*', bodyLimit({ maxSize: 256 * 1024, onError: c => c.json<ErrorResponse>({ type: 'error', error: 'Request too large.' }, 413) }));

/** Identity comes from the Devvit context, never from the request body. Logged-out viewers cannot play. */
async function player(): Promise<Player | null> {
  const id = context.userId;
  if (!id) return null;
  return { id, name: (await reddit.getCurrentUsername()) ?? 'anonymous' };
}
const failure = (c: { json: (body: ErrorResponse, status: Fail['status']) => Response }, f: Fail) => c.json({ type: 'error', error: f.error, conflict: f.conflict }, f.status);
const needLogin: ErrorResponse = { type: 'error', error: 'Log in to Reddit to run your restaurant.' };

api.get('/init', async c => {
  const { postId } = context;
  if (!postId) return c.json<ErrorResponse>({ type: 'error', error: 'postId is required' }, 400);
  const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
  return c.json<InitResponse>({ type: 'init', postId, date: new Date().toISOString().slice(0, 10), username });
});

api.get('/today', async c => {
  const user = await player();
  if (!user) return c.json(needLogin, 401);
  const r = await getToday(deps, user);
  return 'error' in r ? failure(c, r) : c.json(r.value);
});

api.post('/save', async c => {
  const user = await player();
  if (!user) return c.json(needLogin, 401);
  const body = saveBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await savePark(deps, user, body.data.rev, body.data.actions);
  return 'error' in r ? failure(c, r) : c.json(r.value);
});

api.post('/open', async c => {
  const user = await player();
  if (!user) return c.json(needLogin, 401);
  const body = saveBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await openService(deps, user, body.data.rev, body.data.actions);
  return 'error' in r ? failure(c, r) : c.json(r.value);
});

api.post('/lock', async c => {
  const user = await player();
  if (!user) return c.json(needLogin, 401);
  const body = lockBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await lockService(deps, user, body.data.date, body.data.actions);
  return 'error' in r ? failure(c, r) : c.json(r.value);
});
