import { useState } from 'react';
import { Award, ChefHat, Coins, Flame, Heart, Moon, Route, Sparkles, Star, Trash2 } from 'lucide-react';
import type { AwardId } from './awards';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { money } from './format';
import { createDailyHeadline, formatDate, shiftDate } from './daily-headline';
import { RESEARCH, researched, type RestaurantState } from './types';
import { NOTE_MAX, flairForStreak, neighborLine } from './social';
import { GOALS as STAR_GOALS } from './stars';

/** 'Wed 9 Dec' from a 'YYYY-MM-DD' UTC date. */
export const prettyDate = formatDate;

/** What the player should do right now, in one sentence. Tied to the real state of the game, never generic. */
export function coachLine(phase: 'planning' | 'service' | 'report', hasResultToday: boolean): string {
  if (phase === 'service') return 'Your team is cooking, serving and cleaning. When a ticket is waiting, tap Cook in the pass below, hold Prep if you like, and plate it in the green zone.';
  if (hasResultToday) return 'Tonight’s result is saved. Rebuild, rehire or reprice, then open again: only your best night of the day counts.';
  return 'Set up first: build tables and decor, hire a team, set prices. Then tap Open to run tonight’s service.';
}

/** One short line for the first nights, shown at the bottom of the screen. The pass explains service itself, so it says nothing then. */
export function hintLine(phase: 'planning' | 'service' | 'report', firstNight: boolean, hasResultToday: boolean): string | null {
  if (phase !== 'planning') return null;
  if (hasResultToday) return 'Your result is saved. Only your best night of the day counts.';
  return firstNight ? 'Tap Open to run your first night.' : 'Spend your cash, then tap Open.';
}

/** Today's date, headline and goal, in two short lines. It sits in the header's flow so it can never cover the stats on a narrow phone. */
export function DailyBar() {
  const remote = restaurant.remote;
  if (!remote?.today) return null;
  const { today, result } = remote, streak = result?.streak ?? today.streak, goal = STAR_GOALS[today.headline.id].text;
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
function ResultCard() {
  const remote = restaurant.remote;
  const result = remote?.result, today = remote?.today;
  if (!result || !today) return null;
  const { report, stars, night } = result, tomorrow = shiftDate(today.date, 1);
  const verdict = stars.stars === 0 ? 'Not quite tonight' : stars.stars === 1 ? 'A good night' : stars.stars === 2 ? 'A great night' : 'A perfect night';
  return <Dialog open onOpenChange={open => { if (!open) remote!.dismissResult(); }}>
    <DialogContent className="max-h-[90svh] w-[calc(100%-24px)] max-w-md space-y-3 overflow-y-auto rounded-3xl border-paper bg-paper p-5 text-ink">
      <div>
        <DialogTitle className="font-display text-3xl leading-none">{verdict}</DialogTitle>
        <DialogDescription className="mt-1 text-xs font-extrabold uppercase tracking-widest text-teal">{prettyDate(today.date)} · {today.headline.title}</DialogDescription>
      </div>
      <div className="flex items-center justify-center gap-2" role="img" aria-label={`${stars.stars} of 3 stars`}>
        {[1, 2, 3].map(n => <Star key={n} size={40} className={n <= stars.stars ? 'fill-gold text-gold' : 'text-ink/20'} />)}
      </div>
      <p className="flex items-center gap-2 rounded-2xl bg-gold/25 px-3 py-2 text-sm" data-award={night.award.id}><AwardStamp id={night.award.id} /><span><b>{night.award.title}.</b> {night.award.text}</span></p>
      <ul className="space-y-1 text-sm">
        <li className={cn('flex gap-2', stars.goal ? 'text-teal' : 'text-ink/60')}><span aria-hidden>{stars.goal ? '★' : '☆'}</span><span><b>Tonight's goal:</b> {stars.goalText}</span></li>
        <li className={cn('flex gap-2', stars.challenges >= 2 ? 'text-teal' : 'text-ink/60')}><span aria-hidden>{stars.challenges >= 2 ? '★' : '☆'}</span><span><b>Two of three challenges:</b> {stars.challenges} done</span></li>
        <li className={cn('flex gap-2', stars.beatPrevious ? 'text-teal' : 'text-ink/60')}><span aria-hidden>{stars.beatPrevious ? '★' : '☆'}</span><span><b>A better night than before</b></span></li>
      </ul>
      <section aria-label="Kitchen card" className="space-y-1.5 rounded-2xl bg-white/40 p-3">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink/50">Kitchen card</p>
        <Meter label="Welcome" value={night.card.welcome} hint="Comfort and how quickly guests reach a seat" />
        <Meter label="Speed" value={night.card.speed} hint="How long guests waited against their patience" />
        <Meter label="Value" value={night.card.value} hint="How your prices sit against fair" />
      </section>
      {night.neighbors.length > 0 && <section aria-label="Neighbors tonight" className="space-y-1 rounded-2xl bg-white/40 p-3"><p className="text-[10px] font-extrabold uppercase tracking-wider text-ink/50">Neighbors from the thread</p><ul className="space-y-0.5 text-xs">{night.neighbors.map(n => <li key={n.name}>{neighborLine(n)}</li>)}</ul></section>}
      <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-white/40 p-3 text-center">
        <Stat label="Served" value={String(report.served)} /><Stat label="Missed" value={String(report.missed)} /><Stat label="Rating" value={report.rating.toFixed(1)} />
        <Stat label="Sales" value={money(report.revenue)} /><Stat label="Tips" value={money(report.tips)} /><Stat label="Profit" value={money(report.profit)} strong />
      </dl>
      <p className="text-xs text-ink/70">Company value <b>{money(night.companyValue)}</b>{night.newBest ? ' · a new best!' : ` · best ${money(night.best.value)}`}.</p>
      <p className="text-xs text-ink/70">{result.official ? (result.replaced ? 'This beat your earlier result and is now today’s official one.' : 'This is today’s official result.') : 'Practice night. Your earlier result today still counts.'} {result.streak > 0 ? `${result.streak}-day streak.` : 'Earn a star to start a streak.'} </p>
      <p className="text-xs text-ink/70" aria-label="Tomorrow"><b>Tomorrow:</b> {prettyDate(tomorrow)} · {createDailyHeadline(tomorrow).title}.{nextUnlock(result.park) && <> <b>Next unlock:</b> {nextUnlock(result.park)}.</>}</p>
      {remote!.postResult && <ShareActions streak={result.streak} />}
      <button className="game-button game-button-primary min-h-12 w-full" onClick={() => remote!.dismissResult()}>Continue</button>
    </DialogContent>
  </Dialog>;
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
    <button className="min-h-[44px] w-full rounded-xl bg-ink/8 px-3 text-sm font-extrabold disabled:opacity-60" disabled={!tier || Boolean(social.flair) || busy} onClick={() => void run(() => remote.wearFlair!(), 'Flair set.')}>{social.flair ? `Wearing “${social.flair}” ✓` : tier ? `Wear “${tier}” flair` : 'Earn a star to wear flair'}</button>
    <button className="min-h-[44px] w-full rounded-xl px-3 text-xs font-bold text-ink/65 underline-offset-2 hover:underline disabled:opacity-60" disabled={social.followed || busy} onClick={() => void run(() => remote.follow!(), 'You are following this community.')}>{social.followed ? 'Following ✓' : 'Follow this kitchen’s community'}</button>
  </section>;
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div><dt className="text-[10px] font-extrabold uppercase tracking-wider text-ink/50">{label}</dt><dd className={cn('font-display text-lg', strong && 'text-teal')}>{value}</dd></div>;
}
