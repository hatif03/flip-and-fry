import { useEffect, useState } from 'react';
import { DoorOpen, Footprints, MessageSquareText } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { pixelFace } from './pixel-face';
import { bulletinLine, houseDish, type NeighborhoodView, type VisitResult } from './social';
import { DISHES, type RestaurantState } from './types';

/**
 * Open doors, sample kitchens and the bulletin, on the ledger. Only on Reddit. Every action is its own button, skipping all of it
 * changes nothing, and sample kitchens are always called samples.
 */
export function Neighborhood({ state }: { state: RestaurantState }) {
  const hood = restaurant.remote?.neighborhood;
  const [view, setView] = useState<NeighborhoodView | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState<string | null>(null), [visit, setVisit] = useState<VisitResult | null>(null);
  const load = async (): Promise<void> => { if (!hood) return; const r = await hood.load(); if ('error' in r) setError(r.error); else { setView(r); setError(null); } };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!hood) return null;
  const dish = houseDish(state);
  const toggle = async (open: boolean): Promise<void> => { setBusy('door'); const e = await hood.setDoor(open); setBusy(null); if (e) toast.error(e); else { toast.success(open ? 'Your door is open. Neighbors can visit.' : 'Your door is closed.'); await load(); } };
  const post = async (): Promise<void> => { setBusy('post'); const r = await hood.postKitchen(); setBusy(null); if ('error' in r) toast.error(r.error); else toast.success('Your kitchen is posted.'); };
  const go = async (id: string): Promise<void> => { setBusy(id); const r = await hood.visit(id, dish); setBusy(null); if ('error' in r) toast.error(r.error); else { setVisit(r); await load(); } };
  return <section aria-label="The neighborhood" className="mb-5 rounded-2xl border border-ink/10 bg-white/40 p-3">
    <h3 className="flex items-center gap-2 text-lg"><Footprints size={18} aria-hidden />The neighborhood</h3>
    <p className="mt-1 text-xs text-ink/60">Visit another kitchen as a guest, or leave yours open. Visits never change anyone’s cash or stars.</p>
    {error && <p role="alert" className="mt-2 rounded-lg bg-tomato/10 p-2 text-xs text-tomato">{error} <button className="font-extrabold underline" onClick={() => void load()}>Try again</button></p>}
    {!view && !error && <p role="status" className="mt-2 text-xs text-ink/60">Looking around…</p>}
    {view && <>
      <label className="mt-3 flex min-h-[44px] items-center justify-between gap-3 rounded-xl bg-teal/5 px-3 py-2"><span className="text-sm font-extrabold"><DoorOpen size={16} className="mr-1 inline" aria-hidden />Leave my door open<span className="block text-[11px] font-normal text-ink/60">{view.allowed ? 'Neighbors play one night as your guest. You get a note.' : 'The moderators have switched this off here.'}</span></span><Switch aria-label="Leave my door open" checked={view.mine} disabled={!view.allowed || busy === 'door'} onCheckedChange={v => void toggle(v)} /></label>
      {view.mine && <button className="mt-2 min-h-[44px] w-full rounded-xl bg-ink/8 px-3 text-sm font-extrabold disabled:opacity-60" disabled={busy !== null} onClick={() => void post()}>{busy === 'post' ? 'Posting…' : 'Post my kitchen'}</button>}
      {view.mine && <p className="mt-1 text-[11px] text-ink/60">This posts as you, in this community. Neighbors who open the post can stop by your kitchen.</p>}
      <p className="mb-1 mt-3 text-[11px] font-extrabold uppercase tracking-wider text-ink/50">Kitchens to visit · you would order {DISHES[dish].name.toLowerCase()}</p>
      <ul className="space-y-2">{view.doors.map(door => <li key={door.id} className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white/50 p-2">
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{door.kitchen}</p><p className="truncate text-[11px] text-ink/60">{door.kind === 'sample' ? <span className="mr-1 rounded bg-gold/30 px-1 font-extrabold text-ink">Sample kitchen</span> : door.host ? <span className="mr-1"><img src={pixelFace(door.host)} alt="" width={12} height={12} className="mr-1 inline-block size-3 align-[-2px] [image-rendering:pixelated]" />by {door.host} ·</span> : null}{door.style} · {door.blurb}</p></div>
        <button className="min-h-[44px] shrink-0 rounded-xl bg-teal px-3 text-sm font-extrabold text-paper disabled:opacity-50" disabled={busy !== null} aria-label={`Visit ${door.kitchen}`} onClick={() => void go(door.id)}>{busy === door.id ? 'Visiting…' : 'Visit'}</button>
      </li>)}</ul>
      {visit && <div role="status" className="mt-3 rounded-xl bg-gold/20 p-3 text-sm"><p className="font-extrabold">{visit.door.kitchen}</p><p>{visit.line}.</p><button className="mt-1 text-xs font-extrabold underline" onClick={() => setVisit(null)}>Close</button></div>}
      <h4 className="mb-1 mt-4 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-ink/50"><MessageSquareText size={14} aria-hidden />Your bulletin</h4>
      {view.bulletin.length ? <ul className="space-y-1.5">{view.bulletin.map((n, i) => <li key={`${n.visitor}-${n.date}-${i}`} className={cn('rounded-lg border-l-4 bg-white/50 px-2 py-1.5 text-xs', n.outcome === 'served' ? 'border-teal' : 'border-tomato')}>{bulletinLine(n)}</li>)}</ul>
        : <p className="rounded-lg bg-ink/5 p-2 text-xs text-ink/60">{view.mine ? 'No visitors yet. Neighbors who stop by will leave a note here.' : 'Leave your door open and neighbors can stop by. Their notes will show up here.'}</p>}
    </>}
  </section>;
}
