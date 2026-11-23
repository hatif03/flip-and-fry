import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { context, realtime, redis, reddit, settings } from '@devvit/web/server';
import { visitChannel } from '../../management/social';
import { actionLogSchema } from '../../management/replay';
import type { ErrorResponse, InitResponse } from '../../shared/api';
import { rollDay } from '../core/daily-post';
import { getToday, lockService, openService, savePark, utcDate, type Deps, type Fail, type Player } from '../core/game';
import { avatarApi, kitchenPostApi, mediaApi, notifyApi, postApi, socialApi } from '../reddit';
import { avatarFor } from '../core/avatar';
import { reminderStatus, setReminder } from '../core/notify';
import { arcadePreview, commentPreview, follow, postArcadeResult, postResult, wearFlair } from '../core/social';
import { loadArcade, saveArcade } from '../core/arcade';
import { recordPresence } from '../core/presence';
import { commitAction, endCoop, joinCoop, listCoop, publishSync, relayRequest, startCoop } from '../core/coop';
import { getBoard } from '../core/board';
import { markTourSeen } from '../core/tour';
import { awardXp, claimCrate, claimParty, collectCraft, deliver, getWorld, harvest, leaveInFridge, plant, rush, saveLayout, startCraft, useLayout, takeFromFridge, upgrade, water } from '../core/world';
import { serviceXp } from '../../management/crops';
import { isDoorOpen, listDoors, readBulletin, setDoor, visitDoor } from '../core/doors';
import { kitchenOfPost, postKitchen } from '../core/kitchen-post';
import { neighborhoodName, postNightReport } from '../core/neighborhood';
import { shiftDate } from '../../management/daily-headline';
import { telemetry } from '@devvit/analytics/server/reddit';
import { officialEnd } from '../core/telemetry';

export const api = new Hono();

/** The only storage the game logic sees. Everything else lives behind `Store`, so it is tested without Devvit. */
const deps: Deps = { store: redis, now: () => Date.now() };

const saveBody = z.object({ rev: z.number().int().nonnegative(), actions: actionLogSchema });
const noteBody = z.object({ note: z.string().max(200).optional() });
const worldBody = z.object({ rev: z.number().int(), plot: z.number().int().min(0).max(7).optional(), crop: z.string().max(20).optional(), index: z.number().int().min(0).max(100000).optional() });
const lockBody = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), actions: actionLogSchema, shift: z.enum(['lunch', 'dinner']).optional() });

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
  // On a kitchen post, the post's own data says whose kitchen to offer. A failed lookup just means an ordinary post.
  let kitchen = null;
  if (context.postId) { try { kitchen = await kitchenOfPost(deps, await (await reddit.getPostById(context.postId)).getPostData()); } catch { kitchen = null; } }
  return c.json({ ...r.value, neighborhood, kitchen });
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
  const r = await lockService(deps, user, body.data.date, body.data.actions, body.data.shift ?? 'dinner');
  if ('error' in r) return failure(c, r);
  // The official end of the journey carries the replayed score, never a client claim. Optional: a dropped event changes nothing the player sees.
  const journeyId = c.req.header('x-devvit-journey-id');
  if (journeyId) { try { await telemetry.endJourney(officialEnd(journeyId, r.value)); } catch (error) { console.error(`journey end failed: ${error}`); } }
  // Experience from the replayed night (never from a client claim). Optional: a failure here never changes the receipt.
  let xp = null; try { xp = await awardXp(deps, user.id, serviceXp(r.value.stars.stars, r.value.report.served, r.value.park.hustle.best), { served: r.value.report.served, stars: r.value.stars.stars, chain: r.value.park.hustle.best }); } catch (error) { console.error(`xp failed: ${error}`); }
  return c.json({ ...r.value, xp });
});

// ---- the world between nights: the garden, the order board
api.get('/world', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const r = await getWorld(deps, user); return 'error' in r ? failure(c, r) : c.json(r.value);
});
for (const [path, run] of [['plant', (u: Player, b: z.infer<typeof worldBody>) => plant(deps, u, b.rev, b.plot ?? -1, b.crop as never)], ['water', (u: Player, b: z.infer<typeof worldBody>) => water(deps, u, b.rev, b.plot ?? -1)], ['harvest', (u: Player, b: z.infer<typeof worldBody>) => harvest(deps, u, b.rev, b.plot ?? -1)], ['crate', (u: Player, b: z.infer<typeof worldBody>) => claimCrate(deps, u, b.rev)], ['deliver', (u: Player, b: z.infer<typeof worldBody>) => deliver(deps, u, b.rev, b.index ?? -1)], ['upgrade', (u: Player, b: z.infer<typeof worldBody>) => upgrade(deps, u, b.rev, b.index ?? -1)], ['rush', (u: Player, b: z.infer<typeof worldBody>) => rush(deps, u, b.rev, b.index ?? -1)], ['claim', (u: Player, b: z.infer<typeof worldBody>) => claimParty(deps, u, b.rev, b.index ?? -1)], ['leave', (u: Player, b: z.infer<typeof worldBody>) => leaveInFridge(deps, u, b.rev, b.crop as never)], ['take', (u: Player, b: z.infer<typeof worldBody>) => takeFromFridge(deps, u, b.rev, b.crop as never)], ['layoutsave', (u: Player, b: z.infer<typeof worldBody>) => saveLayout(deps, u, b.rev, b.index ?? -1)], ['layoutuse', (u: Player, b: z.infer<typeof worldBody>) => useLayout(deps, u, b.rev, b.index ?? -1)], ['craft', (u: Player, b: z.infer<typeof worldBody>) => startCraft(deps, u, b.rev, b.crop ?? '')], ['collect', (u: Player, b: z.infer<typeof worldBody>) => collectCraft(deps, u, b.rev, b.crop ?? '')]] as const) {
  api.post(`/world/${path}`, async c => {
    const user = await player(); if (!user) return c.json(needLogin, 401);
    const body = worldBody.safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
    const r = await run(user, body.data); return 'error' in r ? failure(c, r) : c.json(r.value);
  });
}

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

api.get('/board', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const r = await getBoard(deps, user, c.req.query('date') ?? utcDate(Date.now()), c.req.query('shift') === 'lunch' ? 'lunch' : 'dinner');
  return 'error' in r ? failure(c, r) : c.json(r.value);
});

// ---- open doors, visits and the bulletin ----------------------------------------------------------------------------------------
const openDoorsAllowed = async (): Promise<boolean> => (await settings.get<boolean>('openDoors').catch(() => undefined)) !== false;
api.get('/doors', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const [doors, mine, bulletin, allowed] = await Promise.all([listDoors(deps, user), isDoorOpen(deps, user), readBulletin(deps, user), openDoorsAllowed()]);
  return c.json({ type: 'doors', doors, mine, allowed, bulletin });
});
api.post('/door', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = z.object({ open: z.boolean() }).safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await setDoor(deps, user, body.data.open, await openDoorsAllowed());
  return 'error' in r ? failure(c, r) : c.json({ type: 'door', ...r.value });
});
api.post('/visit', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = z.object({ doorId: z.string().max(40), dish: z.string().max(20) }).safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await visitDoor(deps, user, body.data.doorId, body.data.dish, (host, note) => realtime.send(visitChannel(host), { kind: 'visit', note }));
  return 'error' in r ? failure(c, r) : c.json({ type: 'visit', ...r.value });
});
api.post('/kitchen-post', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = z.object({ image: z.string().max(450_000).optional() }).safeParse(await c.req.json().catch(() => ({})));
  const r = await postKitchen(deps, kitchenPostApi, user, { image: body.success ? body.data.image : undefined, media: mediaApi });
  return 'error' in r ? failure(c, r) : c.json({ type: 'kitchen-post', ...r.value });
});
api.post('/comment/arcade/preview', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = z.object({ level: z.number(), mode: z.string() }).safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await arcadePreview(deps, user, body.data.level, body.data.mode);
  return 'error' in r ? failure(c, r) : c.json({ type: 'preview', text: r.value });
});
api.post('/comment/arcade', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = z.object({ level: z.number(), mode: z.string() }).safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await postArcadeResult(deps, socialApi, user, body.data.level, body.data.mode);
  return 'error' in r ? failure(c, r) : c.json({ type: 'posted', ...r.value });
});

// ---- avatars and reminders ---------------------------------------------------------------------------------------------------
api.get('/avatar', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const r = await avatarFor(deps, avatarApi, user, c.req.query('name'));
  return 'error' in r ? failure(c, r) : c.json({ type: 'avatar', ...r.value });
});
api.post('/tour', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = z.object({ id: z.string().max(32) }).safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await markTourSeen(deps.store, user.id, body.data.id);
  return 'error' in r ? c.json<ErrorResponse>({ type: 'error', error: r.error }, r.status) : c.json({ type: 'tour', seen: r.value });
});
api.get('/reminder', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  return c.json({ type: 'reminder', on: await reminderStatus(notifyApi, user) });
});
api.post('/reminder', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = z.object({ on: z.boolean() }).safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await setReminder(deps, notifyApi, user, body.data.on);
  return 'error' in r ? failure(c, r) : c.json({ type: 'reminder', ...r.value });
});

// ---- hosted service: a neighbor helps at the pass ------------------------------------------------------------------------------------
const coopSend = (channel: string, message: unknown): Promise<void> => realtime.send(channel, message as never);
api.post('/coop/start', async c => { const user = await player(); if (!user) return c.json(needLogin, 401); const r = await startCoop(deps, user); return 'error' in r ? failure(c, r) : c.json({ type: 'coop', ...r.value }); });
api.get('/coop/list', async c => { const user = await player(); if (!user) return c.json(needLogin, 401); return c.json({ type: 'coop-list', sessions: await listCoop(deps, user) }); });
api.get('/coop/join', async c => { const user = await player(); if (!user) return c.json(needLogin, 401); const r = await joinCoop(deps, user, c.req.query('id') ?? ''); return 'error' in r ? failure(c, r) : c.json({ type: 'coop-join', ...r.value }); });
api.post('/coop/act', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = z.object({ id: z.string().max(40), action: z.unknown() }).safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await relayRequest(deps, user, body.data.id, body.data.action, coopSend); return 'error' in r ? failure(c, r) : c.json({ type: 'coop-act', ...r.value });
});
api.post('/coop/commit', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = z.object({ action: z.unknown() }).safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await commitAction(deps, user, body.data.action, coopSend); return 'error' in r ? failure(c, r) : c.json({ type: 'coop-commit', ...r.value });
});
api.post('/coop/sync', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = z.object({ tick: z.unknown(), hash: z.unknown() }).safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json<ErrorResponse>({ type: 'error', error: 'Invalid request.' }, 400);
  const r = await publishSync(deps, user, body.data.tick, body.data.hash, coopSend); return 'error' in r ? failure(c, r) : c.json({ type: 'coop-sync', ...r.value });
});
api.post('/coop/end', async c => {
  const user = await player(); if (!user) return c.json(needLogin, 401);
  const body = z.object({ helperOf: z.string().max(40).optional() }).safeParse(await c.req.json().catch(() => ({})));
  const r = await endCoop(deps, user, coopSend, body.success ? body.data.helperOf : undefined); return 'error' in r ? failure(c, r) : c.json({ type: 'coop-end', ...r.value });
});
