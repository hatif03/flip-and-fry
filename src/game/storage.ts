import type { Progress } from './types';
import { cleanOutfits, type ChefOutfits } from './chef-outfit';
const KEY = 'kitchen-rush-progress-v1';
const OUTFIT_KEY = 'kitchen-rush-outfits-v1';

/** Where the Test Kitchen keeps its scores and outfits. The browser build uses localStorage; on Reddit the client swaps in a driver that talks to the server. */
export interface ArcadeDriver {
  loadProgress(): Progress;
  saveProgress(progress: Progress): boolean;
  loadOutfits(): ChefOutfits;
  saveOutfits(outfits: ChefOutfits): boolean;
}

/** Invalid or unavailable browser storage never prevents playing. */
export const localDriver: ArcadeDriver = {
  loadOutfits() {
    try { return cleanOutfits(JSON.parse(localStorage.getItem(OUTFIT_KEY) ?? 'null')); }
    catch { return cleanOutfits(null); }
  },
  saveOutfits(outfits) {
    try { localStorage.setItem(OUTFIT_KEY, JSON.stringify(outfits)); return true; }
    catch { return false; }
  },
  loadProgress() {
    try {
      const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (data && typeof data === 'object') {
        const value = data as Partial<Progress>;
        return { solo: cleanScores(value.solo), coop: cleanScores(value.coop) };
      }
    } catch { /* Storage may be disabled in private browsing. */ }
    return { solo: [0, 0, 0], coop: [0, 0, 0] };
  },
  saveProgress(progress) {
    try { localStorage.setItem(KEY, JSON.stringify(progress)); return true; } catch { return false; }
  },
};
/** Three non-negative whole scores, one per shift, whatever was stored. */
export const cleanScores = (scores: unknown): number[] => Array.isArray(scores) ? [0, 1, 2].map(i => typeof scores[i] === 'number' && Number.isSafeInteger(scores[i]) ? Math.max(0, scores[i]) : 0) : [0, 0, 0];

let driver: ArcadeDriver = localDriver;
export const setArcadeDriver = (next: ArcadeDriver): void => { driver = next; };
export const loadOutfits = (): ChefOutfits => driver.loadOutfits();
export const saveOutfits = (outfits: ChefOutfits): boolean => driver.saveOutfits(outfits);
export const loadProgress = (): Progress => driver.loadProgress();
export const saveProgress = (progress: Progress): boolean => driver.saveProgress(progress);
