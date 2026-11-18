import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { context, redis, reddit, settings } from '@devvit/web/server';
import { actionLogSchema } from '../../management/replay';
import type { ErrorResponse, InitResponse } from '../../shared/api';
import { rollDay } from '../core/daily-post';
import { getToday, lockService, openService, savePark, utcDate, type Deps, type Fail, type Player } from '../core/game';
import { postApi, socialApi } from '../reddit';
import { commentPreview, follow, postResult, wearFlair } from '../core/social';
import { loadArcade, saveArcade } from '../core/arcade';
import { recordPresence } from '../core/presence';
import { neighborhoodName, postNightReport } from '../core/neighborhood';
import { shiftDate } from '../../management/daily-headline';
import { telemetry } from '@devvit/analytics/server/reddit';
import { officialEnd } from '../core/telemetry';

export const api = new Hono();

/** The only storage the game logic sees. Everything else lives behind `Store`, so it is tested without Devvit. */
const deps: Deps = { store: redis, now: () => Date.now() };

const saveBody = z.object({ rev: z.number().int().nonnegative(), actions: actionLogSchema });
const noteBody = z.object({ note: z.string().max(200).optional() });
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
  // The first request of a new UTC day creates the daily post if the cron has not (its timezone is undocumented). Never fatal.
  try { await rollDay(redis, postApi, deps.now(), utcDate(deps.now())); } catch (error) { console.error(`rollDay failed: ${error}`); }
  // Yesterday's report is posted by the first request of the new day if the midnight job has not (its timezone is undocumented).
  try { await postNightReport(deps, postApi, shiftDate(utcDate(deps.now()), -1)); } catch (error) { console.error(`night report failed: ${error}`); }
  const r = await getToday(deps, user);
  if ('error' in r) return failure(c, r);
  const neighborhood = neighborhoodName(await settings.get('neighborhood').catch(() => undefined));
  return c.json({ ...r.value, neighborhood });
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
  if ('error' in r) return failure(c, r);
  // The official end of the journey carries the replayed score, never a client claim. Optional: a dropped event changes nothing the player sees.
  const journeyId = c.req.header('x-devvit-journey-id');
  if (journeyId) { try { await telemetry.endJourney(officialEnd(journeyId, r.value)); } catch (error) { console.error(`journey end failed: ${error}`); } }
  return c.json(r.value);
});

// ---- the explicit Reddit actions: each its own button, none gates play ------------------------------------------------------
api.post('/comment/preview', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = noteBody.safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await commentPreview(deps, user, body.data.note ?? '');
  return 'error' in r ? failure(c, r) : c.json({ type: 'preview', ...r.value });
});
api.post('/comment', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = noteBody.safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await postResult(deps, socialApi, user, body.data.note ?? '');
  return 'error' in r ? failure(c, r) : c.json({ type: 'posted', ...r.value });
});
api.post('/flair', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const r = await wearFlair(deps, socialApi, user);
  return 'error' in r ? failure(c, r) : c.json({ type: 'flair', ...r.value });
});
api.post('/subscribe', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const r = await follow(deps, socialApi, user);
  return 'error' in r ? failure(c, r) : c.json({ type: 'followed', ...r.value });
});

// ---- the Test Kitchen's own save ---------------------------------------------------------------------------------------------
api.get('/arcade', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const r = await loadArcade(deps, user);
  return c.json({ type: 'arcade', ...r.value });
});
api.post('/arcade', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const r = await saveArcade(deps, user, await c.req.json().catch(() => null));
  return 'error' in r ? failure(c, r) : c.json({ type: 'arcade', ...r.value });
});

// ---- who is here right now ---------------------------------------------------------------------------------------------------
api.post('/presence', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = z.object({ dish: z.string().max(20) }).safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await recordPresence(deps, user, body.data.dish);
  return 'error' in r ? failure(c, r) : c.json({ type: 'presence', ...r.value });
});
