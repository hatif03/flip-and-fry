import { useEffect, useState } from 'react';
import { Award, ChefHat, Coins, Flame, Heart, Moon, Route, Sparkles, Star, Trash2 } from 'lucide-react';
import type { AwardId } from './awards';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { money } from './format';
import { createDailyHeadline, formatDate, shiftDate } from './daily-headline';
import { CATALOG, RESEARCH, SHIFTS, SHIFT_NAMES, researched, type RestaurantState } from './types';
import type { BoardView } from '../shared/api';
import { NOTE_MAX, flairForStreak, neighborLine } from './social';
import { goalText, LUNCH_STARS } from './stars';

/** 'Wed 9 Dec' from a 'YYYY-MM-DD' UTC date. */
export const prettyDate = formatDate;

/** What the player should do right now, in one sentence. Tied to the real state of the game, never generic. */
export function coachLine(phase: 'planning' | 'service' | 'report', hasResultToday: boolean): string {
  if (phase === 'service') return 'Orders land in the pass below. Tap Cook, hold Prep if you like, and plate it in the green zone. Your team covers anything you leave.';
  if (hasResultToday) return 'Tonight’s result is saved. Rebuild, rehire or reprice, then open again: only your best night of the day counts.';
  return 'Set up first: build tables and decor, hire a team, set prices. Then tap Open to run tonight’s service.';
}

/** One short line for the first nights, shown at the bottom of the screen. The pass explains service itself, so it says nothing then. */
export function hintLine(phase: 'planning' | 'service' | 'report', firstNight: boolean, hasResultToday: boolean): string | null {
  if (phase !== 'planning') return null;
  if (hasResultToday) return 'Your result is saved. Only your best night of the day counts.';
  return firstNight ? 'Head chef: tap Open for a quick lunch.' : 'Spend your cash, then tap Open. Then run the pass.';
}

/**
 * Lunch or dinner, tonight. Each is its own official service with its own stars and board; a star in either keeps the streak. The first
 * service is always lunch, so a new owner is playing within a minute. Shown only on Reddit, only while planning.
 */
export function ShiftPicker() {
  const remote = restaurant.remote, state = restaurant.state;
  if (!remote?.today || state.phase !== 'planning' || state.history.length === 0) return null;
  const { run, lunchRun } = remote.today, done = { lunch: lunchRun, dinner: run };
  return <div role="group" aria-label="Choose the service" className="pointer-events-none absolute inset-x-3 bottom-[104px] z-[6] flex justify-center sm:bottom-[112px]">
    <div className="pointer-events-auto flex gap-1 rounded-xl border-2 border-teal/80 bg-paper/95 p-1 shadow-md">
      {SHIFTS.map(shift => {
        const got = done[shift]?.stars.stars, on = state.shift === shift;
        return <button key={shift} type="button" aria-pressed={on} onClick={() => restaurant.setShift(shift)} className={cn('flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-extrabold', on ? 'bg-teal text-paper' : 'text-teal')}>
          <span>{SHIFT_NAMES[shift]}</span><span className={cn('font-normal', on ? 'text-paper/80' : 'text-ink/55')}>{shift === 'lunch' ? '1 min' : '2½ min'}</span>
          {got !== undefined && <span aria-label={`${got} of ${shift === 'lunch' ? 3 : 3} stars today`} className="text-gold">{'★'.repeat(got) || '·'}</span>}
        </button>;
      })}
    </div>
  </div>;
}

/** Today's date, headline and goal, in two short lines. It sits in the header's flow so it can never cover the stats on a narrow phone. */
export function DailyBar() {
  const remote = restaurant.remote;
  if (!remote?.today) return null;
  const { today, result } = remote, streak = result?.streak ?? today.streak, goal = goalText(today.headline.id, restaurant.state.history.length + (result ? 0 : 1), restaurant.state.shift);
  return <aside aria-label="Today" className="pointer-events-auto mx-auto mt-1.5 max-w-[1600px] rounded-xl border border-paper/70 bg-teal/95 px-3 py-1.5 text-paper shadow-[0_3px_0_#0e2a2766] sm:mt-2 sm:rounded-2xl sm:px-4">
    <div className="flex items-center gap-x-2">
      <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-widest text-gold">{today.neighborhood ? `${today.neighborhood} · ` : ''}{prettyDate(today.date)}</span>
      <span className="min-w-0 flex-1 truncate font-display text-sm leading-tight">{today.headline.title}</span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-extrabold" title="Days in a row with at least one star"><Flame size={14} className={cn(streak > 0 ? 'text-gold' : 'text-paper/40')} />{streak}</span>
    </div>
    <p className="mt-0.5 flex items-center gap-1.5 text-xs leading-snug text-paper/90"><Star size={12} className="shrink-0 fill-gold text-gold" aria-hidden /><span className="truncate"><b>Goal:</b> {goal}</span></p>
  </aside>;
}

/** Only mounted on Reddit (restaurant.remote is set by the client session). */
export function RedditLayer() {
  return <ResultCard />;
}

/** One card at the end of a service. Everything on it comes from the server's replayed receipt. */
/** How much of the night was yours. A night with no hands says so, because cooking yourself is what earns the stars and the tips. */
export function handsLine(plated: number, perfect: number, tookOver: number): string {
  if (plated === 0) return 'You did not cook tonight, so your team ran it alone. Cook the orders yourself for bigger tips, a faster room and more stars.';
  const dishes = `${plated} ${plated === 1 ? 'dish' : 'dishes'}`;
  return `You cooked ${dishes} yourself${perfect ? `, ${perfect} perfect` : ''}${tookOver ? `, ${tookOver} taken from a chef` : ''}. ${perfect === plated ? 'Every plate was perfect.' : 'Plate in the green for a perfect one.'}`;
}
/** If the bank stepped in tonight, or has put the restaurant on notice, the card says what it took and what it did not. */
function BankLine() {
  const park = restaurant.remote?.result?.park; if (!park) return null;
  const f = park.foreclosure;
  if (f && f.day === park.history[park.history.length - 1]?.day) return <p aria-label="The bank" className="rounded-2xl bg-tomato/10 px-3 py-2 text-sm"><b>The bank stepped in. </b>It took {f.kinds.map(k => CATALOG[k].name.toLowerCase()).join(', ') || 'nothing'} into storage and let {f.released} of your crew go; your loan is cleared. Buy the pieces back in Build for 60%. Your name, stars, streak and records are untouched.</p>;
  if (park.notice === 1) return <p aria-label="The bank" className="rounded-2xl bg-tomato/10 px-3 py-2 text-sm"><b>Final notice. </b>Another night at a loss and the bank sells up to three of your best pieces into storage. A profitable night clears it.</p>;
  return null;
}
function YourHands() {
  const { plated, perfect, tookOver } = restaurant.cooked;
  return <p aria-label="What you did tonight" className={cn('rounded-2xl px-3 py-2 text-sm', plated ? 'bg-teal/10 text-teal' : 'bg-tomato/10 text-ink')}><b>Your hands: </b>{handsLine(plated, perfect, tookOver)}</p>;
}
function ResultCard() {
  const remote = restaurant.remote;
  const result = remote?.result, today = remote?.today;
  if (!result || !today) return null;
  const { report, stars, night } = result, tomorrow = shiftDate(today.date, 1);
  const verdict = result.shift === 'lunch' ? ['Lunch is over', 'A good lunch', 'A great lunch', 'A perfect lunch'][stars.stars] : stars.stars === 0 ? 'Not quite tonight' : stars.stars === 1 ? 'A good night' : stars.stars === 2 ? 'A great night' : 'A perfect night';
  return <Dialog open onOpenChange={open => { if (!open) remote!.dismissResult(); }}>
    <DialogContent className="max-h-[90svh] w-[calc(100%-24px)] max-w-md space-y-3 overflow-y-auto rounded-3xl border-paper bg-paper p-5 text-ink">
      <div>
        <DialogTitle className="font-display text-3xl leading-none">{verdict}</DialogTitle>
        <DialogDescription className="mt-1 text-xs font-extrabold uppercase tracking-widest text-teal">{prettyDate(today.date)} · {today.headline.title}</DialogDescription>
      </div>
      <div className="flex items-center justify-center gap-2" role="img" aria-label={`${stars.stars} of 3 stars`}>
        {[1, 2, 3].map(n => <Star key={n} size={40} className={n <= stars.stars ? 'fill-gold text-gold' : 'text-ink/20'} />)}
      </div>
      <p className={cn('text-center font-display text-2xl', report.profit >= 0 ? 'text-teal' : 'text-tomato')} aria-label="Profit">{report.profit >= 0 ? 'Profit ' : 'Loss '}{money(Math.abs(report.profit))}</p>
      <YourHands />
      <BankLine />
      {result.xp && <p aria-label="Experience" className="text-center text-xs font-extrabold text-ink/70">+{result.xp.gained} XP · Level {result.xp.level}{result.xp.leveledUp ? ' · a new level: more garden, more seeds' : ''}</p>}
      <p className="flex items-center gap-2 rounded-2xl bg-gold/25 px-3 py-2 text-sm" data-award={night.award.id}><AwardStamp id={night.award.id} /><span><b>{night.award.title}.</b> {night.award.text}</span></p>
      {result.shift === 'lunch' ? <ul className="space-y-1 text-sm" aria-label="Lunch goals">
        {[stars.goal, stars.challenges >= 2, stars.beatPrevious].map((met, i) => <li key={i} className={cn('flex gap-2', met ? 'text-teal' : 'text-ink/60')}><span aria-hidden>{met ? '★' : '☆'}</span><span>{i === 0 && <b>Lunch goal: </b>}{LUNCH_STARS[i]}</span></li>)}
      </ul> : <ul className="space-y-1 text-sm">
          <li className={cn('flex gap-2', stars.goal ? 'text-teal' : 'text-ink/60')}><span aria-hidden>{stars.goal ? '★' : '☆'}</span><span><b>Tonight's goal:</b> {stars.goalText}</span></li>
          <li className={cn('flex gap-2', stars.challenges >= 2 ? 'text-teal' : 'text-ink/60')}><span aria-hidden>{stars.challenges >= 2 ? '★' : '☆'}</span><span><b>Two of three challenges:</b> {stars.challenges} done</span></li>
          <li className={cn('flex gap-2', stars.beatPrevious ? 'text-teal' : 'text-ink/60')}><span aria-hidden>{stars.beatPrevious ? '★' : '☆'}</span><span><b>A better night than before</b></span></li>
        </ul>}
      <TodaysBoard shift={result.shift} />
      {night.neighbors.length > 0 && <section aria-label="Neighbors tonight" className="space-y-1 rounded-2xl bg-white/40 p-3"><p className="text-[10px] font-extrabold uppercase tracking-wider text-ink/50">Neighbors from the thread</p><ul className="space-y-0.5 text-xs">{night.neighbors.map(n => <li key={n.name}>{neighborLine(n)}</li>)}</ul></section>}
      <details className="group rounded-2xl bg-white/30 px-3 py-2"><summary className="min-h-[44px] cursor-pointer list-none py-2.5 text-sm font-extrabold text-teal marker:hidden">The night in detail</summary><div className="space-y-3 pb-2">
      <section aria-label="Kitchen card" className="space-y-1.5 rounded-2xl bg-white/40 p-3">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink/50">Kitchen card</p>
        <Meter label="Welcome" value={night.card.welcome} hint="Comfort and how quickly guests reach a seat" />
        <Meter label="Speed" value={night.card.speed} hint="How long guests waited against their patience" />
        <Meter label="Value" value={night.card.value} hint="How your prices sit against fair" />
      </section>
      <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-white/40 p-3 text-center">
        <Stat label="Served" value={String(report.served)} /><Stat label="Missed" value={String(report.missed)} /><Stat label="Rating" value={report.rating.toFixed(1)} />
        <Stat label="Sales" value={money(report.revenue)} /><Stat label="Tips" value={money(report.tips)} /><Stat label="Profit" value={money(report.profit)} strong />
      </dl>
      <section aria-label="The till" className="space-y-0.5 rounded-2xl bg-white/40 p-3 text-xs">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink/50">The till</p>
        <p className="flex justify-between"><span>Sales and tips</span><span className="tabular-nums">{money(report.revenue + report.tips)}</span></p>
        <p className="flex justify-between text-ink/70"><span>Ingredients</span><span className="tabular-nums">−{money(report.ingredients)}</span></p>
        <p className="flex justify-between text-ink/70"><span>Wages and rent</span><span className="tabular-nums">−{money(report.wages + report.rent)}</span></p>
        {report.debtPayment > 0 && <p className="flex justify-between text-ink/70"><span>Loan instalment</span><span className="tabular-nums">−{money(report.debtPayment)}</span></p>}
        <p className={cn('flex justify-between border-t border-ink/10 pt-1 font-extrabold', report.profit >= 0 ? 'text-teal' : 'text-tomato')}><span>{report.profit >= 0 ? 'Profit' : 'Loss'}</span><span className="tabular-nums">{report.profit >= 0 ? '' : '−'}{money(Math.abs(report.profit))}</span></p>
        <p className="pt-1 text-ink/70" aria-label="Reputation">{reputationLine(today.park.reputation, result.park.reputation)}</p>
      </section>
      <p className="text-xs text-ink/70">Company value <b>{money(night.companyValue)}</b>{night.newBest ? ' · a new best!' : ` · best ${money(night.best.value)}`}.</p>
      </div></details>
      <p className="text-xs text-ink/70">{result.official ? (result.replaced ? 'This beat your earlier result and is now today’s official one.' : 'This is today’s official result.') : 'Practice night. Your earlier result today still counts.'} {result.streak > 0 ? `${result.streak}-day streak.` : 'Earn a star to start a streak.'}{result.freezes ? ` ${result.freezes} streak freeze${result.freezes > 1 ? 's' : ''} saved: a missed day will not break it.` : result.streak > 0 ? ` A freeze is earned every 7 days (${7 - result.streak % 7} to go).` : ''}</p>
      {result.week && <p className="text-xs text-ink/70" aria-label="This week"><b>This week:</b> {result.week.stars} ★{result.week.tier ? ` · ${result.week.tier}` : ''}{result.week.next ? ` · ${result.week.next.at - result.week.stars} more for ${result.week.next.name}` : ' · the top tier'}.</p>}
      <p className="text-xs text-ink/70" aria-label="Tomorrow"><b>Tomorrow:</b> {prettyDate(tomorrow)} · {createDailyHeadline(tomorrow).title}.{nextUnlock(result.park) && <> <b>Next unlock:</b> {nextUnlock(result.park)}.</>}</p>
      {remote!.postResult && result.shift !== 'lunch' && <ShareActions streak={result.streak} />}
      <div className="sticky bottom-0 -mx-5 -mb-5 bg-paper px-5 pb-5 pt-2 shadow-[0_-8px_8px_-6px_#fff2d7]"><button className="game-button game-button-primary min-h-12 w-full" onClick={() => { const first = restaurant.state.history.length === 1 && restaurant.state.cash >= CATALOG.table.price; remote!.dismissResult(); if (first) { restaurant.nextPanel = 'build'; restaurant.notify(); } }}>{restaurant.state.history.length === 1 && restaurant.state.cash >= CATALOG.table.price ? `Spend your ${money(restaurant.state.cash)}` : 'Continue'}</button></div>
    </DialogContent>
  </Dialog>;
}

/** What the night did to the street's opinion of the place. Reputation sets how often guests arrive, so it is the stake of a bad night. */
export function reputationLine(before: number, after: number): string {
  const d = Math.round((after - before) * 100) / 100;
  if (d > 0.04) return `Reputation ${before.toFixed(1)} → ${after.toFixed(1)}. Word is getting round: more guests tomorrow.`;
  if (d < -0.04) return `Reputation ${before.toFixed(1)} → ${after.toFixed(1)}. Fewer guests tomorrow. A better night turns it round.`;
  return `Reputation holds at ${after.toFixed(1)}. Guests keep coming at the same pace.`;
}

const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;

/** Today's board in a few lines: your place first, then the top three. It loads after the card opens and says nothing if it cannot. */
export function TodaysBoard({ shift = 'dinner' }: { shift?: 'lunch' | 'dinner' } = {}) {
  const remote = restaurant.remote, [view, setView] = useState<BoardView | null>(null);
  useEffect(() => { let live = true; void remote?.board?.(shift).then(r => { if (live && !('error' in r)) setView(r); }); return () => { live = false; }; }, [remote, shift]);
  if (!view || view.entries.length === 0) return null;
  return <section aria-label="Today's board" className="space-y-1 rounded-2xl bg-white/40 p-3">
    <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink/50">{shift === 'lunch' ? 'Lunch board' : "Today's board"}</p>
    {view.you && <p className="text-sm font-extrabold text-teal">You are {ordinal(view.you.rank)} of {view.total}{view.total >= 200 ? '+' : ''} tonight.</p>}
    <ol className="space-y-0.5 text-xs">{view.entries.slice(0, 3).map(e => <li key={e.rank} className={cn('flex items-center justify-between gap-2', e.you && 'font-extrabold text-teal')}><span className="truncate">{e.rank}. {e.you ? 'You' : e.name}</span><span className="shrink-0 tabular-nums">{'★'.repeat(e.stars) || '–'} · {e.rating.toFixed(1)}</span></li>)}</ol>
  </section>;
}

/** One small icon per award, so the banner reads at a glance. */
const STAMPS: Record<AwardId, typeof Award> = { untidy: Trash2, quiet: Moon, prices: Coins, food: ChefHat, warm: Heart, confusing: Route, steady: Sparkles };
function AwardStamp({ id }: { id: AwardId }) { const Icon = STAMPS[id] ?? Award; return <span className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-tomato/70 bg-paper text-tomato"><Icon size={20} aria-hidden /></span>; }

/** The next thing the research budget will open, with progress, or nothing when everything is open. */
export function nextUnlock(park: Pick<RestaurantState, 'research'>): string | null {
  const study = RESEARCH.find(r => !researched(park, r.id)); return study ? `${study.title} (${park.research.points}/${study.at})` : null;
}

function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  return <div title={hint}>
    <div className="flex justify-between text-xs font-extrabold"><span>{label}</span><span className="tabular-nums">{value}</span></div>
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className="mt-0.5 h-2 overflow-hidden rounded-full bg-ink/10"><div className={cn('h-full rounded-full', value >= 70 ? 'bg-teal' : value >= 40 ? 'bg-gold' : 'bg-tomato')} style={{ width: `${value}%` }} /></div>
  </div>;
}

/**
 * Three separate, optional buttons. None is needed to open tomorrow, and posting shows the exact comment first, as Reddit's
 * user-action rules require ("This posts as you"). Each is its own action: they are never combined.
 */
function ShareActions({ streak }: { streak: number }) {
  const remote = restaurant.remote!, social = remote.social ?? { posted: false, flair: null, followed: false };
  const [composing, setComposing] = useState(false), [note, setNote] = useState(''), [preview, setPreview] = useState<{ text: string; reply: boolean } | null>(null), [busy, setBusy] = useState(false);
  const tier = flairForStreak(streak);
  const run = async (job: () => Promise<string | null>, done: string) => { setBusy(true); const error = await job(); setBusy(false); if (error) toast.error(error); else toast.success(done); return !error; };
  const update = async (next: string) => { setNote(next); const r = await remote.previewComment!(next); setPreview('error' in r ? null : r); };
  return <section aria-label="Share" className="space-y-2 border-t border-ink/10 pt-3">
    <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink/50">Optional</p>
    {composing ? <div className="space-y-2 rounded-2xl border border-ink/15 bg-white/50 p-3">
      <label htmlFor="result-note" className="text-xs font-extrabold">Add a short note (optional)</label>
      <input id="result-note" value={note} maxLength={NOTE_MAX} onChange={e => void update(e.target.value)} className="min-h-[44px] w-full rounded-xl border border-ink/20 bg-white/70 px-3 text-sm" placeholder="Say something about tonight" />
      <p className="text-right text-[10px] text-ink/50">{note.length}/{NOTE_MAX}</p>
      <p className="text-xs font-extrabold">This is exactly what will be posted:</p>
      <blockquote className="whitespace-pre-wrap rounded-xl bg-ink/5 p-2 text-xs">{preview?.text ?? 'Loading your result…'}</blockquote>
      <p className="text-[11px] text-ink/60">This posts as you, {preview && !preview.reply ? 'as a comment on today’s post' : 'under today’s results comment'}.</p>
      <div className="flex gap-2">
        <button className="min-h-[44px] flex-1 rounded-xl bg-teal px-3 text-sm font-extrabold text-paper disabled:opacity-50" disabled={busy || !preview} onClick={async () => { if (await run(() => remote.postResult!(note), 'Posted.')) setComposing(false); }}>Post as me</button>
        <button className="min-h-[44px] rounded-xl bg-ink/8 px-3 text-sm font-extrabold" onClick={() => setComposing(false)}>Cancel</button>
      </div>
    </div> : <button className="min-h-[44px] w-full rounded-xl bg-ink/8 px-3 text-sm font-extrabold disabled:opacity-60" disabled={social.posted || busy} onClick={async () => { setComposing(true); const r = await remote.previewComment!(''); setPreview('error' in r ? null : r); if ('error' in r) { toast.error(r.error); setComposing(false); } }}>{social.posted ? 'Posted ✓' : 'Post this result'}</button>}
    <details className="rounded-xl"><summary className="min-h-[44px] cursor-pointer list-none rounded-xl px-3 py-3 text-center text-xs font-extrabold text-ink/65 marker:hidden">More</summary><div className="space-y-2 pb-1">
    <button className="min-h-[44px] w-full rounded-xl bg-ink/8 px-3 text-sm font-extrabold disabled:opacity-60" disabled={!tier || Boolean(social.flair) || busy} onClick={() => void run(() => remote.wearFlair!(), 'Flair set.')}>{social.flair ? `Wearing “${social.flair}” ✓` : tier ? `Wear “${tier}” flair` : 'Earn a star to wear flair'}</button>
    <button className="min-h-[44px] w-full rounded-xl px-3 text-xs font-bold text-ink/65 underline-offset-2 hover:underline disabled:opacity-60" disabled={social.followed || busy} onClick={() => void run(() => remote.follow!(), 'You are following this community.')}>{social.followed ? 'Following ✓' : 'Follow this kitchen’s community'}</button>
    </div></details>
  </section>;
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div><dt className="text-[10px] font-extrabold uppercase tracking-wider text-ink/50">{label}</dt><dd className={cn('font-display text-lg', strong && 'text-teal')}>{value}</dd></div>;
}
