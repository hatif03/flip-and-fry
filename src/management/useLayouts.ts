import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { restaurant } from './engine';
import type { WorldView } from '../shared/api';

/** The saved layouts and the two things to do with them, or null off Reddit. Reads the garden's own view, so it needs no new request of its own. */
export function useLayouts(): { slots: WorldView['layouts']; busy: boolean; save: (i: number) => Promise<void>; use: (i: number) => Promise<void> } | null {
  const world = restaurant.remote?.world, [slots, setSlots] = useState<WorldView['layouts'] | null>(world?.peek?.()?.view.layouts ?? null), [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; void world?.load().then(r => { if (live && !('error' in r)) setSlots(r.layouts); }); return () => { live = false; }; }, [world]);
  const act = useCallback(async (path: 'layoutsave' | 'layoutuse' | 'crate', i: number, done: string): Promise<void> => {
    if (!world) return; setBusy(true); const r = await world.act(path, { index: i }); setBusy(false);
    if ('error' in r) { toast.error(r.error); return; } setSlots(r.layouts); toast.success(done);
  }, [world]);
  if (!world || !slots) return null;
  return { slots, busy, save: i => act('layoutsave', i, `Room saved in slot ${i + 1}.`), use: i => act('layoutuse', i, `Slot ${i + 1}: the room is rearranged.`) };
}
