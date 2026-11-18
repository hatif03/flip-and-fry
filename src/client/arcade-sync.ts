import { arcadeSaveSchema, emptyArcade, type ArcadeSave } from '../game/arcade-save';
import { setArcadeDriver } from '../game/storage';
import type { Http } from './session';

/**
 * Keep the Test Kitchen's scores and outfits on the server. Called once at boot, before the kitchen code is loaded, so the engine
 * is built from the server's copy. Saves are small and batched; a failed save is retried the next time anything changes or the tab
 * is hidden, and never blocks play (the scores stay in memory for the session).
 */
/** The page's request function once the Reddit save is connected. Null in the plain browser build, where there is no thread to post to. */
export let arcadeHttp: Http | null = null;
export async function connectArcade(http: Http, wait = 600, onBonus: (points: number) => void = () => undefined): Promise<{ flush: () => Promise<void> }> {
  let cache = emptyArcade(), dirty = false, timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const r = await http('GET', '/api/arcade');
    const parsed = r.status === 200 ? arcadeSaveSchema.safeParse(r.body) : null;
    if (parsed?.success) cache = parsed.data as ArcadeSave;
  } catch { /* offline: start empty, still playable */ }
  const flush = async (): Promise<void> => {
    clearTimeout(timer); if (!dirty) return;
    dirty = false;
    try {
      const r = await http('POST', '/api/arcade', cache); if (r.status !== 200) dirty = true;
      else { const bonus = (r.body as { bonus?: unknown } | null)?.bonus; if (typeof bonus === 'number' && bonus > 0) onBonus(bonus); }
    } catch { dirty = true; }
  };
  const queue = (): void => { dirty = true; clearTimeout(timer); timer = setTimeout(() => void flush(), wait); };
  arcadeHttp = http;
  setArcadeDriver({
    loadProgress: () => cache.progress, loadOutfits: () => cache.outfits,
    saveProgress(progress) { cache = { ...cache, progress }; queue(); return true; },
    saveOutfits(outfits) { cache = { ...cache, outfits }; queue(); return true; },
  });
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) void flush(); });
  return { flush };
}
