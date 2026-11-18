import { useState } from 'react';
import { toast } from 'sonner';
import { restaurant } from './engine';
import { houseDish } from './social';
import { DISHES } from './types';

/** On a post someone made of their kitchen: who it is, and one button to stop by as a guest. Only on Reddit, only when the post says so. */
export function KitchenPostCard() {
  const remote = restaurant.remote, kitchen = remote?.today?.kitchen, [line, setLine] = useState<string | null>(null), [busy, setBusy] = useState(false);
  if (!remote?.neighborhood || !kitchen) return null;
  const dish = houseDish(restaurant.state);
  const visit = async (): Promise<void> => { setBusy(true); const r = await remote.neighborhood!.visit(kitchen.id, dish); setBusy(false); if ('error' in r) toast.error(r.error); else setLine(r.line); };
  return <aside aria-label="A kitchen to visit" className="pointer-events-auto mx-auto mt-2 max-w-[1600px] rounded-2xl border border-gold/70 bg-paper/95 px-4 py-2 text-ink shadow-md">
    <p className="text-[10px] font-extrabold uppercase tracking-widest text-teal">You are at a neighbor’s kitchen</p>
    <p className="font-display text-base leading-tight">{kitchen.kitchen}{kitchen.host ? <span className="font-body text-xs font-normal text-ink/60"> · run by {kitchen.host}</span> : null}</p>
    <p className="text-xs text-ink/65">{kitchen.style} · {kitchen.blurb}</p>
    {line ? <p role="status" className="mt-1 rounded-lg bg-gold/20 p-2 text-sm">{line}.</p> : <button className="mt-2 min-h-[44px] w-full rounded-xl bg-teal px-3 text-sm font-extrabold text-paper disabled:opacity-60" disabled={busy} onClick={() => void visit()}>{busy ? 'Visiting…' : `Stop by and order the ${DISHES[dish].name.toLowerCase()}`}</button>}
  </aside>;
}
