import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { getTier, setTier, shouldStepDown, stepDown } from './quality';

/**
 * Watches the real frame time inside the 3D canvas and steps the quality tier down once if the device cannot keep up. It looks at a
 * window of frames at a time, ignores the first few (shader compilation), and stops looking after the tier has settled. It draws nothing.
 */
const WINDOW = 90, SKIP = 20, WINDOWS = 3;
export function FrameWatch() {
  const seen = useRef({ frames: 0, total: 0, skipped: 0, windows: 0 });
  useFrame((_, dt) => {
    const s = seen.current; if (s.windows >= WINDOWS || dt <= 0 || dt > 1) return; // a hidden tab or a long pause is not a slow device
    if (s.skipped < SKIP) { s.skipped++; return; }
    s.frames++; s.total += dt * 1000;
    if (s.frames < WINDOW) return;
    const tier = getTier();
    if (shouldStepDown(s.total / s.frames, s.frames, tier)) setTier(stepDown(tier));
    s.frames = 0; s.total = 0; s.windows++;
  });
  return null;
}
