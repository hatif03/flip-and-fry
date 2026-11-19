import { restaurant } from './engine';
import { cn } from '@/lib/utils';
import { tonight } from './bills';
import { money } from './format';
import { HUSTLE_DECAY, HUSTLE_TIP, HUSTLE_TIP_MAX, shiftLength } from './types';
import { goalText } from './stars';
import { Flame, Star } from 'lucide-react';

/**
 * The service screen's whole status, in two lines: how far through the night, and whether the till covers the bills. Wages, rent and the
 * loan instalment are taken at closing; a quiet night visibly costs money, which is the stake. Nothing here changes the simulation.
 */
export function TonightBar() {
  const s = restaurant.state;
  if (s.phase !== 'service') return null;
  const goal = restaurant.remote?.today ? goalText(restaurant.remote.today.headline.id, s.history.length + 1, s.shift) : null;
  const { bills, earned, net, covered } = tonight(s), through = Math.min(1, s.elapsed / shiftLength(s)), last = s.elapsed >= shiftLength(s);
  const live = restaurant.hustleLive(), fade = Math.max(0, Math.min(1, (HUSTLE_DECAY - (s.elapsed - s.hustle.at)) / HUSTLE_DECAY));
  return <section aria-label="Tonight" className="pointer-events-auto mx-auto mt-1.5 max-w-[1600px] rounded-xl border border-paper/70 bg-teal/95 px-3 py-1.5 text-paper shadow-[0_3px_0_#0e2a2766] sm:mt-2 sm:rounded-2xl sm:px-4">
    <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-gold">
      <span className="shrink-0">{last ? 'Last orders' : restaurant.paused ? 'Paused' : 'Tonight'}</span>
      <span role="progressbar" aria-label="Night progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(through * 100)} className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-paper/20"><span className="block h-full bg-gold" style={{ width: `${through * 100}%` }} /></span>
      {live > 0 && <span role="status" aria-label={`Hustle chain ${live}: tips up ${Math.round(Math.min(live, HUSTLE_TIP_MAX) * HUSTLE_TIP * 100)} percent`} title="Quick moves at the pass keep the chain alive and raise tips" className="flex shrink-0 items-center gap-0.5 text-[#ffd27a]"><Flame size={13} aria-hidden /><span className="tabular-nums">×{live}</span><span aria-hidden className="ml-0.5 h-1.5 w-6 overflow-hidden rounded-full bg-paper/20"><span className="block h-full bg-[#ffd27a]" style={{ width: `${fade * 100}%` }} /></span></span>}
      <span className="shrink-0 text-paper">{s.totals.served} served</span>
    </div>
    <div className="mt-1 flex items-center gap-2 text-xs">
      <span className="shrink-0 font-extrabold">Bills {money(bills)}</span>
      <span role="progressbar" aria-label="Bills covered" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(covered * 100)} className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-paper/20"><span className={cn('block h-full', covered >= 1 ? 'bg-[#8fd18f]' : 'bg-gold')} style={{ width: `${covered * 100}%` }} /></span>
      <span className={cn('shrink-0 font-display text-sm', net >= 0 ? 'text-[#8fd18f]' : 'text-[#ffb3a3]')} title={`Sales and tips less ingredients: ${money(earned)}. Wages, rent and the loan instalment are taken at closing.`}>{net >= 0 ? '+' : '−'}{money(Math.abs(net))}</span>
    </div>
    {goal && <p className="mt-1 flex items-center gap-1.5 text-xs text-paper/90"><Star size={12} className="shrink-0 fill-gold text-gold" aria-hidden /><span className="truncate"><b>Goal:</b> {goal}</span></p>}
  </section>;
}
