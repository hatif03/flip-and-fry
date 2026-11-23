import { useState } from 'react';
import { Check, Gift, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { cue } from '@/audio/cues';
import { restaurant } from './engine';
import { CRATE } from './round';
import { money } from './format';

/** Today's three small tasks, each paying XP once, and the week's progress toward the crate. Everything here is counted by the server. */
export function DailyRound() {
  const world = restaurant.remote?.world, round = world?.peek?.()?.view.round, [busy, setBusy] = useState(false);
  if (!world || !round) return null;
  const open = async (): Promise<void> => {
    setBusy(true); const r = await world.act('crate', {}); setBusy(false);
    if ('error' in r) toast.error(r.error); else { toast.success(`Crate opened: ${money(CRATE.cash)} and ${CRATE.xp} XP.`); cue('coin'); }
  };
  return <section aria-label="Today's round" className="mt-3 rounded-2xl border border-ink/10 bg-white/40 p-3">
    <h3 className="flex items-center gap-2 text-lg"><ListChecks size={18} aria-hidden className="text-teal" />Today’s round</h3>
    <p className="text-[11px] text-ink/60">Three small jobs, new every day. Each pays XP once.</p>
    <ul className="mt-2 space-y-1.5">{round.tasks.map(t => <li key={t.kind} className={cn('flex items-center gap-2 text-sm', t.done ? 'text-teal' : 'text-ink')}>
      <span aria-hidden className={cn('grid size-5 shrink-0 place-items-center rounded-md border-2', t.done ? 'border-teal bg-teal text-paper' : 'border-ink/25')}>{t.done && <Check size={13} />}</span>
      <span className="min-w-0 flex-1 font-bold">{t.text}</span>
      <span className="shrink-0 text-xs font-extrabold tabular-nums text-ink/55">{t.done ? `+${t.xp} XP` : `${t.progress}/${t.target}`}</span>
    </li>)}</ul>
    <div className="mt-3 flex items-center gap-2 border-t border-ink/10 pt-2">
      <Gift size={18} aria-hidden className={round.crateReady ? 'text-gold' : 'text-ink/40'} />
      <p className="min-w-0 flex-1 text-xs text-ink/70">{round.crateClaimed ? 'This week’s crate is open. A new one on Monday.' : `Weekly crate: ${Math.min(round.full, round.crateAt)}/${round.crateAt} full rounds (${money(CRATE.cash)} and ${CRATE.xp} XP).`}</p>
      {round.crateReady && <button type="button" disabled={busy || restaurant.state.phase !== 'planning'} onClick={() => void open()} className="min-h-11 shrink-0 rounded-xl bg-gold px-3 text-sm font-extrabold text-ink motion-safe:animate-pulse disabled:opacity-40">Open</button>}
    </div>
  </section>;
}
