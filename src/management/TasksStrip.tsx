import { useEffect, useState } from 'react';
import { Hammer, Package, Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';
import { countdown } from './Garden';
import { restaurant } from './engine';
import type { WorldView } from '../shared/api';

/** What needs you between nights, in a few words: crops ready, the builder, the order board. Each chip opens the Garden. */
export function tasksFor(view: WorldView, now: number): { key: string; text: string; urgent: boolean }[] {
  const out: { key: string; text: string; urgent: boolean }[] = [];
  const ready = view.plots.filter(p => p.crop && now >= p.readyAt).length, growing = view.plots.filter(p => p.crop && now < p.readyAt).sort((a, b) => a.readyAt - b.readyAt), empty = view.plots.filter(p => !p.crop).length;
  if (ready) out.push({ key: 'crops', text: `${ready} ${ready === 1 ? 'crop' : 'crops'} ready`, urgent: true });
  else if (growing.length) out.push({ key: 'crops', text: `Harvest in ${countdown(growing[0].readyAt - now)}`, urgent: false });
  else if (empty) out.push({ key: 'crops', text: 'Plant something', urgent: true });
  const job = view.builders.jobs[0];
  if (job) out.push({ key: 'builder', text: now >= job.readyAt ? `${job.name} is done` : `Builder: ${countdown(job.readyAt - now)}`, urgent: now >= job.readyAt });
  else if (view.stations.some(s => s.next && s.next.levelNeeded <= view.level && view.cash >= s.next.cost)) out.push({ key: 'builder', text: 'Builder is free', urgent: true });
  const open = view.orders.filter(o => !o.done), fillable = open.filter(o => o.canFill).length;
  if (open.length) out.push({ key: 'orders', text: fillable ? `${fillable} ${fillable === 1 ? 'order' : 'orders'} to fill` : `${open.length} ${open.length === 1 ? 'order' : 'orders'} waiting`, urgent: fillable > 0 });
  return out;
}

export function TasksStrip({ onOpen }: { onOpen: () => void }) {
  const peek = restaurant.remote?.world?.peek?.(), [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(n => n + 1), 15000); return () => clearInterval(id); }, []);
  if (!peek || restaurant.state.phase !== 'planning') return null;
  const tasks = tasksFor(peek.view, Date.now() + peek.offset);
  if (!tasks.length) return null;
  const icons = { crops: Sprout, builder: Hammer, orders: Package } as const;
  return <nav aria-label="Between nights" className="pointer-events-auto mx-auto mt-1.5 flex max-w-[1600px] gap-1.5 overflow-x-auto px-0.5 pb-0.5">
    {tasks.map(t => { const Icon = icons[t.key as keyof typeof icons]; return <button key={t.key} type="button" onClick={onOpen} className={cn('flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold shadow-sm', t.urgent ? 'border-gold bg-gold text-ink' : 'border-paper/70 bg-paper/90 text-ink/80')}><Icon size={14} aria-hidden />{t.text}</button>; })}
  </nav>;
}
