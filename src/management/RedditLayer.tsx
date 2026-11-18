import { Flame, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { money } from './format';
import { formatDate, shiftDate } from './daily-headline';
import { GOALS as STAR_GOALS } from './stars';

/** 'Wed 9 Dec' from a 'YYYY-MM-DD' UTC date. */
export const prettyDate = formatDate;

/** What the player should do right now, in one sentence. Tied to the real state of the game, never generic. */
export function coachLine(phase: 'planning' | 'service' | 'report', hasResultToday: boolean): string {
  if (phase === 'service') return 'Your team is cooking, serving and cleaning. When a ticket is waiting, tap Cook in the pass below and plate it in the green zone.';
  if (hasResultToday) return 'Tonight’s result is saved. Rebuild, rehire or reprice, then open again: only your best night of the day counts.';
  return 'Set up first: build tables and decor, hire a team, set prices. Then tap Open to run tonight’s service.';
}

/** Today's date, headline, goal and next step. It sits in the header's flow so it can never cover the stats on a narrow phone. */
export function DailyBar() {
  const remote = restaurant.remote;
  if (!remote?.today) return null;
  const { today, result } = remote, streak = result?.streak ?? today.streak, goal = STAR_GOALS[today.headline.id].text;
  const hasResult = Boolean(today.run || result);
  return <aside aria-label="Today" className="pointer-events-auto mx-auto mt-2 max-w-[1600px] rounded-2xl border border-paper/70 bg-teal/95 px-4 py-2 text-paper shadow-[0_3px_0_#0e2a2766]">
    <div className="flex items-center gap-x-3">
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-gold">{prettyDate(today.date)}</span>
      <span className="min-w-0 flex-1 truncate font-display text-sm leading-tight">{today.headline.title}</span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-extrabold" title="Days in a row with at least one star"><Flame size={14} className={cn(streak > 0 ? 'text-gold' : 'text-paper/40')} />{streak}</span>
    </div>
    <p className="mt-0.5 flex items-start gap-1.5 text-xs leading-snug text-paper/90"><Star size={13} className="mt-px shrink-0 fill-gold text-gold" aria-hidden /><span><b>Goal:</b> {goal}</span></p>
    <p className="mt-0.5 text-[11px] leading-snug text-paper/70">{coachLine(restaurant.state.phase, hasResult)}</p>
  </aside>;
}

/** Only mounted on Reddit (restaurant.remote is set by the client session). */
export function RedditLayer() {
  return <ResultCard />;
}

/** One card at the end of a service. Everything on it comes from the server's replayed receipt. */
function ResultCard() {
  const remote = restaurant.remote;
  const result = remote?.result, today = remote?.today;
  if (!result || !today) return null;
  const { report, stars } = result, tomorrow = shiftDate(today.date, 1);
  const verdict = stars.stars === 0 ? 'Not quite tonight' : stars.stars === 1 ? 'A good night' : stars.stars === 2 ? 'A great night' : 'A perfect night';
  return <Dialog open onOpenChange={open => { if (!open) remote!.dismissResult(); }}>
    <DialogContent className="max-h-[88svh] w-[calc(100%-24px)] max-w-md overflow-y-auto rounded-3xl border-paper bg-paper p-6 text-ink">
      <DialogTitle className="font-display text-3xl leading-none">{verdict}</DialogTitle>
      <DialogDescription className="text-xs font-extrabold uppercase tracking-widest text-teal">{prettyDate(today.date)} · {today.headline.title}</DialogDescription>
      <div className="flex items-center justify-center gap-2 py-1" role="img" aria-label={`${stars.stars} of 3 stars`}>
        {[1, 2, 3].map(n => <Star key={n} size={44} className={n <= stars.stars ? 'fill-gold text-gold' : 'text-ink/20'} />)}
      </div>
      <ul className="space-y-1 text-sm">
        <li className={cn('flex gap-2', stars.goal ? 'text-teal' : 'text-ink/60')}><span aria-hidden>{stars.goal ? '★' : '☆'}</span><span><b>Tonight's goal:</b> {stars.goalText}</span></li>
        <li className={cn('flex gap-2', stars.challenges >= 2 ? 'text-teal' : 'text-ink/60')}><span aria-hidden>{stars.challenges >= 2 ? '★' : '☆'}</span><span><b>Two of three challenges:</b> {stars.challenges} done</span></li>
        <li className={cn('flex gap-2', stars.beatPrevious ? 'text-teal' : 'text-ink/60')}><span aria-hidden>{stars.beatPrevious ? '★' : '☆'}</span><span><b>A better night than before</b></span></li>
      </ul>
      <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-white/40 p-3 text-center">
        <Stat label="Served" value={String(report.served)} /><Stat label="Missed" value={String(report.missed)} /><Stat label="Rating" value={report.rating.toFixed(1)} />
        <Stat label="Sales" value={money(report.revenue)} /><Stat label="Tips" value={money(report.tips)} /><Stat label="Profit" value={money(report.profit)} strong />
      </dl>
      <p className="text-xs text-ink/70">{result.official ? (result.replaced ? 'This beat your earlier result and is now today’s official one.' : 'This is today’s official result.') : 'Practice night. Your earlier result today still counts.'} {result.streak > 0 ? `${result.streak}-day streak.` : 'Earn a star to start a streak.'}</p>
      <p className="text-xs text-ink/60">Tomorrow: {prettyDate(tomorrow)}.</p>
      <button className="game-button game-button-primary min-h-12 w-full" onClick={() => remote!.dismissResult()}>Continue</button>
    </DialogContent>
  </Dialog>;
}
function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div><dt className="text-[10px] font-extrabold uppercase tracking-wider text-ink/50">{label}</dt><dd className={cn('font-display text-lg', strong && 'text-teal')}>{value}</dd></div>;
}
