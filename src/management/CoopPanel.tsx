import { useEffect, useState } from 'react';
import { HandHelping, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { restaurant } from './engine';
import type { CoopListing } from './coop';

/**
 * Hosted service, on the ledger: a switch to invite one neighbor to help at your pass tonight, and the kitchens open for help right now.
 * Both are optional and each is its own action. Hidden outside Reddit.
 */
export function CoopPanel() {
  const coop = restaurant.remote?.coop, [sessions, setSessions] = useState<CoopListing[] | null>(null), [busy, setBusy] = useState<string | null>(null);
  const load = async (): Promise<void> => { if (coop) setSessions(await coop.list().catch(() => [])); };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!coop) return null;
  const helping = coop.helpingAt();
  const join = async (id: string): Promise<void> => { setBusy(id); const error = await coop.join(id); setBusy(null); if (error) { toast.error(error); await load(); } else toast.success('You are at their pass. Cook with them.'); };
  return <section aria-label="Cook together" className="mb-5 rounded-2xl border border-ink/10 bg-white/40 p-3">
    <h3 className="flex items-center gap-2 text-lg"><HandHelping size={18} aria-hidden />Cook together</h3>
    <p className="mt-1 text-xs text-ink/60">Two pairs of hands at one pass. Everything the helper does is part of your night, and the server replays it all.</p>
    <label className="mt-3 flex min-h-[44px] items-center justify-between gap-3 rounded-xl bg-teal/5 px-3 py-2"><span className="text-sm font-extrabold">Invite a neighbor to help tonight<span className="block text-[11px] font-normal text-ink/60">Takes effect when you open the doors. One helper.</span></span><Switch aria-label="Invite a neighbor to help tonight" checked={coop.invite} disabled={restaurant.state.phase !== 'planning'} onCheckedChange={v => coop.setInvite(v)} /></label>
    {helping ? <p role="status" className="mt-3 rounded-xl bg-gold/20 p-2 text-sm">You are helping at {helping}’s pass.</p>
      : <><p className="mb-1 mt-3 text-[11px] font-extrabold uppercase tracking-wider text-ink/50">Kitchens that could use a hand</p>
        {sessions === null ? <p role="status" className="text-xs text-ink/60">Looking…</p> : sessions.length ? <ul className="space-y-2">{sessions.map(s => <li key={s.id} className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white/50 p-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{s.kitchen}</p><p className="truncate text-[11px] text-ink/60">{s.host ? `run by ${s.host}` : 'a neighbor'} · service in progress</p></div><button className="min-h-[44px] shrink-0 rounded-xl bg-teal px-3 text-sm font-extrabold text-paper disabled:opacity-50" disabled={busy !== null || restaurant.state.phase === 'service'} aria-label={`Help at ${s.kitchen}`} onClick={() => void join(s.id)}>{busy === s.id ? 'Joining…' : 'Help'}</button></li>)}</ul>
          : <p className="rounded-lg bg-ink/5 p-2 text-xs text-ink/60">No kitchen is looking for a helper right now. Ask a neighbor to switch on “Invite a neighbor” before they open.</p>}
        <button className="mt-2 min-h-[44px] w-full rounded-xl bg-ink/8 text-xs font-extrabold" onClick={() => void load()}>Look again</button></>}
  </section>;
}

/** Shown over the restaurant while helping, with the way back to your own. */
export function HelpingBanner() {
  const coop = restaurant.remote?.coop, host = coop?.helpingAt();
  if (!coop || !host) return null;
  return <aside aria-label="Helping" className="pointer-events-auto mx-auto mt-2 flex max-w-[1600px] items-center gap-3 rounded-2xl border border-gold/70 bg-paper/95 px-4 py-2 text-ink shadow-md"><HandHelping size={18} className="shrink-0 text-teal" aria-hidden /><p className="min-w-0 flex-1 text-sm"><b>Helping at {host}’s pass.</b> <span className="text-xs text-ink/65">Your own restaurant is safe and untouched.</span></p><button className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-ink/8 px-3 text-sm font-extrabold" onClick={() => void coop.leave()}><LogOut size={16} aria-hidden />Leave</button></aside>;
}
