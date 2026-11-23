import { Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { roadAhead } from './road-ahead';
import type { RestaurantState } from './types';

/** The next three goals with their progress, at the top of Goals: there is always a next thing within a few days. */
export function RoadAhead({ state }: { state: RestaurantState }) {
  const view = restaurant.remote?.world?.peek?.()?.view;
  const items = roadAhead(state, view ? { level: view.level, xp: view.xp, nextXp: view.nextXp } : null);
  if (!items.length) return null;
  return <section aria-label="Road ahead" className="mb-1 rounded-2xl border-2 border-teal/40 bg-teal/5 p-3">
    <h3 className="flex items-center gap-2 text-lg"><Flag size={18} aria-hidden className="text-teal" />Road ahead</h3>
    <ul className="mt-2 space-y-2.5">{items.map(item => <li key={item.id}>
      <p className="flex items-baseline justify-between gap-2 text-sm font-extrabold"><span>{item.title}</span><span className={cn('shrink-0 text-xs tabular-nums', item.ready ? 'text-teal' : 'text-ink/55')}>{item.ready ? 'Ready' : `${item.value}/${item.target}`}</span></p>
      <p className="text-[11px] leading-snug text-ink/65">{item.detail}</p>
      <div role="progressbar" aria-label={item.title} aria-valuemin={0} aria-valuemax={item.target} aria-valuenow={item.value} className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10"><div className={cn('h-full rounded-full', item.ready ? 'bg-teal' : 'bg-gold')} style={{ width: `${Math.min(100, item.value / item.target * 100)}%` }} /></div>
    </li>)}</ul>
  </section>;
}
