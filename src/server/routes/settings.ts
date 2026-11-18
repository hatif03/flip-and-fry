import { Hono } from 'hono';
import type { SettingsValidationRequest, SettingsValidationResponse } from '@devvit/web/shared';
import { neighborhoodProblem } from '../core/neighborhood';

export const settingsRoutes = new Hono();

/** The moderator's neighborhood name is checked before it is saved, so a bad value never reaches the daily bar. */
settingsRoutes.post('/validate-neighborhood', async c => {
  const body = await c.req.json<SettingsValidationRequest<string>>().catch(() => null);
  const problem = neighborhoodProblem(body?.value);
  return c.json<SettingsValidationResponse>(problem ? { success: false, error: problem } : { success: true });
});
