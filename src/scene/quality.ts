import { useSyncExternalStore } from 'react';

/**
 * Quality tiers for the 3D scene (plan section 20.5). The tier is chosen once at start from what the device reports, can be forced
 * with ?q=low|medium|high, and steps down once at run time if the measured frame time says the device cannot keep up. Only
 * presentation changes: shadows and rain. Nothing here touches the simulation, so a score is the same on every tier.
 */
export type Tier = 'high' | 'medium' | 'low';
export const TIERS: readonly Tier[] = ['high', 'medium', 'low'];
export type TierSettings = { shadowMap: number; shadows: boolean; rainShare: number };
export const SETTINGS: Record<Tier, TierSettings> = {
  high: { shadowMap: 1024, shadows: true, rainShare: 1 },
  medium: { shadowMap: 512, shadows: true, rainShare: .5 },
  low: { shadowMap: 0, shadows: false, rainShare: 0 },
};
/** Average milliseconds per frame above which a tier is too much for the device. 40 ms is 25 frames a second. */
export const SLOW_FRAME_MS = 40;

export type Device = { cores?: number; memoryGb?: number; renderer?: string; search?: string };
/** A software renderer or a very small device goes straight to low; a modest one starts at medium. */
export function detectTier({ cores, memoryGb, renderer = '', search = '' }: Device): Tier {
  const forced = new URLSearchParams(search).get('q');
  if (forced === 'low' || forced === 'medium' || forced === 'high') return forced;
  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return 'low';
  if ((memoryGb !== undefined && memoryGb <= 2) || (cores !== undefined && cores <= 2)) return 'low';
  if ((memoryGb !== undefined && memoryGb <= 4) || (cores !== undefined && cores <= 4)) return 'medium';
  return 'high';
}
/** One step down, or the same tier if it is already the lowest. */
export const stepDown = (tier: Tier): Tier => TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(tier) + 1)];
/** Whether a measured average frame time should push the tier down. Never from a handful of frames. */
export const shouldStepDown = (averageMs: number, frames: number, tier: Tier): boolean => frames >= 60 && averageMs > SLOW_FRAME_MS && tier !== 'low';

// ---- a tiny store, so the scene and the frame watcher agree on one tier -----------------------------------------------------------------
let current: Tier = 'high', started = false;
const listeners = new Set<() => void>();
export function startQuality(device: Device = readDevice()): Tier { if (!started) { started = true; current = detectTier(device); } return current; }
export const getTier = (): Tier => { startQuality(); return current; };
export function setTier(next: Tier): void { if (next !== current) { current = next; listeners.forEach(l => l()); } }
export const useTier = (): Tier => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, getTier, getTier);
/** For tests: forget the choice and start again. */
export function resetQuality(): void { started = false; current = 'high'; listeners.clear(); }

function readDevice(): Device {
  if (typeof navigator === 'undefined') return {};
  let renderer = '';
  try { const gl = document.createElement('canvas').getContext('webgl'), info = gl?.getExtension('WEBGL_debug_renderer_info'); if (gl && info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)); } catch { /* unknown renderer: judge by cores and memory */ }
  return { cores: navigator.hardwareConcurrency, memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory, renderer, search: typeof location === 'undefined' ? '' : location.search };
}
