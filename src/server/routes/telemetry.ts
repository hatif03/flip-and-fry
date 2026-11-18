import { Hono } from 'hono';
import { telemetry } from '@devvit/analytics/server/reddit';
import { endBody, interactionBody, progressBody } from '../core/telemetry';

/**
 * The Journeys client posts here (`/api/telemetry/journey/*`). Devvit ships these routes only for Express, so they are
 * served from Hono with the same shapes. A bad or dropped event answers 4xx/5xx and the client just logs a warning.
 */
export const journeys = new Hono();
const bad = (error: string) => ({ error, receipt: { status: 'JOURNEY_RECEIPT_INVALID', message: 'Invalid: Event payload was not recorded.' } });

journeys.post('/journey/start', async c => {
  try { return c.json(await telemetry.startJourney()); } catch (error) { console.error(`telemetry start failed: ${error}`); return c.json({ error: 'Internal server error' }, 500); }
});
journeys.post('/journey/app-ready', async c => {
  try { return c.json(await telemetry.appReady()); } catch (error) { console.error(`telemetry app-ready failed: ${error}`); return c.json({ error: 'Internal server error' }, 500); }
});
journeys.post('/journey/progress', async c => {
  const body = progressBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(bad('Invalid progress event.'), 400);
  try { return c.json(await telemetry.journeyProgress({ journeyId: body.data.journeyId, progress: body.data.progress, action: body.data.action ?? '', actionDetails: body.data.actionDetails ?? '' })); } catch (error) { console.error(`telemetry progress failed: ${error}`); return c.json({ error: 'Internal server error' }, 500); }
});
journeys.post('/journey/interaction', async c => {
  const body = interactionBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(bad('Invalid interaction event.'), 400);
  try { return c.json(await telemetry.journeyInteraction({ journeyId: body.data.journeyId ?? '', action: body.data.action, actionDetails: body.data.actionDetails ?? '' })); } catch (error) { console.error(`telemetry interaction failed: ${error}`); return c.json({ error: 'Internal server error' }, 500); }
});
journeys.post('/journey/end', async c => {
  const body = endBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(bad('Invalid end event.'), 400);
  try { return c.json(await telemetry.endJourney({ journeyId: body.data.journeyId, complete: body.data.complete ?? false, ...(body.data.game ? { game: { win: body.data.game.win ?? false, score: body.data.game.score ?? 0 } } : {}) })); } catch (error) { console.error(`telemetry end failed: ${error}`); return c.json({ error: 'Internal server error' }, 500); }
});
