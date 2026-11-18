import type { Action } from '../management/actions';

/**
 * Devvit Journeys events for the daily loop. The session talks to this small interface; the real implementation lives in
 * `redditJourneys` (browser only), so the Node tests inject a recorder instead of importing a browser-only package.
 * Rules from the docs: fire on committed actions (pointer-up), start only from an explicit user action, no usernames or
 * free text in any field. Journey maps need Reddit's approval, so events may be dropped in playtest; nothing depends on them.
 */
export type Journeys = {
  /** The scene has drawn and today's data has loaded. */
  appReady(): void;
  /** The player tapped Open. */
  start(): void;
  progress(progress: number, action: string): void;
  interaction(action: string, details: string): void;
  /** The active journey id, sent to the server so it can write the official end with the replayed score. */
  id(): string | undefined;
  clear(): void;
};

export const noJourneys: Journeys = { appReady() {}, start() {}, progress() {}, interaction() {}, id: () => undefined, clear() {} };

/** Verb names for the planning actions the engine accepts (cosmetic changes are not worth an event). */
export function interactionName(action: Action): string | null {
  switch (action.kind) {
    case 'place': return action.item.id === -1 ? 'purchase' : 'move';
    case 'dish': return 'price';
    case 'rename': case 'music': case 'abandon': return null;
    case 'claimTicket': return 'cook_ticket';
    case 'cook': return 'plate';
    case 'priority': return 'rush';
    default: return action.kind;
  }
}
