import type { Http } from './session';

/**
 * Tell the server this tab is here, every 20 seconds while it is visible, so a neighbor who opens their doors can have this player
 * come over. Never blocks anything and never reports anything but a dish id. Returns a stop function.
 */
export function startPresence(http: Http, houseDish: () => string, every = 20_000): () => void {
  let stopped = false;
  const beat = (): void => { if (stopped || (typeof document !== 'undefined' && document.hidden)) return; void http('POST', '/api/presence', { dish: houseDish() }).catch(() => undefined); };
  const onVisible = (): void => { if (typeof document !== 'undefined' && !document.hidden) beat(); };
  beat(); const timer = setInterval(beat, every);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  return () => { stopped = true; clearInterval(timer); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible); };
}
