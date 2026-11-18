import { telemetry } from '@devvit/analytics/client/reddit';
import type { Journeys } from './journeys';

/** Fire and forget: a failed or dropped telemetry call must never affect the game. */
const quiet = (call: () => Promise<unknown>): void => { try { void call().catch(() => undefined); } catch { /* telemetry is optional */ } };

export const redditJourneys: Journeys = {
  appReady: () => quiet(() => telemetry.appReady()),
  start: () => quiet(() => telemetry.startJourney()),
  progress: (progress, action) => quiet(() => telemetry.progress({ progress, action })),
  interaction: (action, details) => quiet(() => telemetry.interaction({ action, actionDetails: details })),
  id: () => telemetry.getActiveJourneyId(),
  clear: () => { try { telemetry.clearJourneyId(); } catch { /* optional */ } },
};
