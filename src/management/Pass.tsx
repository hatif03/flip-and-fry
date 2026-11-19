import { ChefHat, Gift, Hand, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { challengeObjective, challengeTitles } from './daily-challenges';
import { restaurant } from './engine';
import { COMPS_PER_NIGHT, COOK_BURN, DISHES, cookQuality, guestPatienceSeconds, idealPrep, type Guest } from './types';

/** Where the dish is in its cooking, as a share of its normal time. Uses the engine's own bands, so the bar can never disagree with the plate. */
export type CookZone = 'raw' | 'early' | 'perfect' | 'over' | 'burnt';
export function cookZone(ratio: number): CookZone {
  const q = cookQuality(ratio);
  return q === 3 ? 'perfect' : q === 1 ? 'early' : q === 2 ? 'over' : ratio < 1 ? 'raw' : 'burnt';
}
const ZONE_TEXT: Record<CookZone, string> = { raw: 'Still raw: wait', early: 'A little early', perfect: 'Perfect: plate it now!', over: 'Slightly over', burnt: 'Burning!' };
const ZONE_STYLE: Record<CookZone, string> = { raw: 'text-ink/60', early: 'text-gold', perfect: 'text-teal', over: 'text-tomato', burnt: 'text-tomato' };
/** The bar spans 0 to COOK_BURN times the normal time, so the marker sits at ratio / COOK_BURN. Zone edges follow the engine's bands. */
const BAR = 'linear-gradient(to right, #b9ad94 0 30%, #F2B743 30% 42.5%, #4f9a5c 42.5% 62.5%, #e48a43 62.5% 80%, #DC533C 80% 100%)';

const tell = (error: string | null) => { if (error) toast.error(error); };

/** Waiting tickets and the dish in your hands. Only on Reddit, only while the doors are open. */
export function Pass() {
  const s = restaurant.state;
  if (!restaurant.remote || s.phase !== 'service') return null;
  const cooking = restaurant.myDish(), line = s.guests.filter(g => g.stage === 'waiting').sort((a, b) => b.waiting - a.waiting).slice(0, 3);
  return <section aria-label="The pass" className="mx-auto mb-2 max-w-[1100px] space-y-2 rounded-2xl border border-paper/80 bg-paper/95 p-2 shadow-[0_4px_0_#73513d30]">
    <ChallengePips />
    {cooking ? <CookCard guest={cooking} /> : line.length ? <Tickets guests={line} /> : <p className="px-2 py-1 text-xs text-ink/65">No ticket is waiting. Your team has it. Stay close: when a chef is busy, a ticket will appear here.</p>}
  </section>;
}

/** The three daily challenges as thin pips, so the goals stay in view without covering the floor. */
function ChallengePips() {
  const list = restaurant.state.dailyChallenges;
  if (!list.length) return null;
  return <ul aria-label="Daily challenges" className="flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-0.5">
    {list.map(c => <li key={c.kind} title={challengeObjective(c)} className={cn('flex min-h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-extrabold', c.rewarded ? 'bg-teal text-paper' : 'bg-ink/8 text-ink/75')}>
      <span aria-hidden>{c.rewarded ? '★' : '☆'}</span><span className="max-w-[9rem] truncate">{challengeTitles[c.kind]}</span><span className="tabular-nums">{c.progress}/{c.target}</span>
    </li>)}
  </ul>;
}

function Tickets({ guests }: { guests: Guest[] }) {
  const s = restaurant.state, patience = guestPatienceSeconds(s), comps = COMPS_PER_NIGHT - s.comps;
  return <div>
    <p className="px-2 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-teal">Waiting for a chef · tap Cook to help</p>
    <ul className="space-y-1.5">{guests.map(g => {
      const left = Math.max(0, 1 - g.waiting / patience), urgent = left < .3;
      return <li key={g.id} className={cn('flex flex-wrap items-center gap-2 rounded-xl border px-2 py-1.5', urgent ? 'border-tomato/60 bg-tomato/10' : 'border-ink/10 bg-white/40')}>
        <div className="min-w-[8.5rem] flex-1">
          <p className="text-sm font-extrabold leading-tight">{DISHES[g.dish].name}{g.special && <span className="ml-1 text-gold" title="Star guest">★</span>}{g.priority && <span className="ml-1 text-[10px] font-extrabold uppercase text-teal">first</span>}</p>
          <div role="progressbar" aria-label="Guest patience" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left * 100)} className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10"><div className={cn('h-full rounded-full', urgent ? 'bg-tomato' : 'bg-teal')} style={{ width: `${left * 100}%` }} /></div>
        </div>
        <button className="flex min-h-[44px] min-w-[4.5rem] items-center justify-center gap-1.5 rounded-xl bg-teal px-3 text-sm font-extrabold text-paper" onClick={() => { const result = restaurant.claimTicket(g.id); tell(result); if (!result && restaurant.speed !== 1) { restaurant.setSpeed(1); toast('Slowed to 1× while you cook.'); } }}><ChefHat size={16} />Cook</button>
        <button className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-ink/8 px-2.5 text-xs font-extrabold disabled:opacity-40" disabled={g.priority} aria-label={`Rush ${DISHES[g.dish].name} to the front of the line`} onClick={() => tell(restaurant.rush(g.id))}><Zap size={15} />Rush</button>
        <button className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-ink/8 px-2.5 text-xs font-extrabold disabled:opacity-40" disabled={comps <= 0} aria-label={`Comp ${DISHES[g.dish].name}: free meal, the guest stays. ${comps} left tonight`} onClick={() => tell(restaurant.comp(g.id))}><Gift size={15} />Comp {comps}</button>
      </li>;
    })}</ul>
  </div>;
}

/**
 * Prep by hand: hold the button while the dish is being chopped or seasoned and let go when the bar sits in the green. The engine counts
 * the held seconds, so what the hold was worth is the same on every device and on the server. Optional: skipping it never costs anything.
 */
const PREP_TEXT = ['', 'A rough prep: it will cost you at the plate', 'A decent prep', 'A clean, even prep'] as const;
function Prep({ guest }: { guest: Guest }) {
  const mine = restaurant.state.hands.find(h => h.guestId === guest.id) ?? null, ideal = idealPrep(guest.dish), span = ideal * 1.6;
  const held = mine?.prep ?? 0, holding = mine?.holding ?? false, quality = mine?.quality ?? 0;
  const start = (): void => { tell(restaurant.holdPrep(guest.id)); }, stop = (): void => { if (restaurant.state.hands.find(h => h.guestId === guest.id)?.holding) tell(restaurant.releasePrep(guest.id)); };
  return <div className="mt-2">
    <div role="progressbar" aria-label="Prep" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, held / span) * 100)} aria-valuetext={holding ? 'Preparing' : quality ? PREP_TEXT[quality] : 'Not started'} className="relative h-3 rounded-full bg-ink/10">
      <div className="absolute inset-y-0 rounded-full bg-teal/30" style={{ left: `${.8 * ideal / span * 100}%`, width: `${.4 * ideal / span * 100}%` }} aria-hidden />
      <div className="absolute inset-y-0 left-0 rounded-full bg-gold" style={{ width: `${Math.min(1, held / span) * 100}%` }} />
    </div>
    <button type="button" aria-pressed={holding} className={cn('mt-1.5 flex min-h-[44px] w-full touch-none select-none items-center justify-center gap-2 rounded-xl border-2 px-3 text-sm font-extrabold', holding ? 'border-gold bg-gold text-ink' : 'border-ink/20 bg-white/50 text-ink')}
      onContextMenu={e => e.preventDefault()} onPointerDown={e => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } start(); }} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } }}>
      <Hand size={16} aria-hidden />{holding ? 'Release when the bar is in the green' : 'Hold to prep (optional)'}
    </button>
    {quality > 0 && !holding && <p role="status" className="mt-1 text-xs font-extrabold text-teal">{PREP_TEXT[quality]}</p>}
  </div>;
}

function CookCard({ guest }: { guest: Guest }) {
  const dish = DISHES[guest.dish], ratio = guest.cook / dish.seconds, zone = cookZone(ratio), at = Math.min(1, ratio / COOK_BURN) * 100;
  return <div className="rounded-xl border border-teal/50 bg-teal/5 p-2">
    <p className="flex items-center gap-2 text-sm font-extrabold"><Hand size={16} className="text-teal" aria-hidden />You are cooking: {dish.name}</p>
    <div role="progressbar" aria-label="Cooking" aria-valuemin={0} aria-valuemax={COOK_BURN * 100} aria-valuenow={Math.round(ratio * 100)} aria-valuetext={ZONE_TEXT[zone]} className="relative mt-2 h-4 rounded-full" style={{ background: BAR }}>
      <div className="absolute -top-1 h-6 w-1.5 -translate-x-1/2 rounded-full border border-paper bg-ink" style={{ left: `${at}%` }} />
    </div>
    <p role="status" aria-live="polite" className={cn('mt-1 text-sm font-extrabold', ZONE_STYLE[zone])}>{ZONE_TEXT[zone]}</p>
    <Prep guest={guest} />
    <div className="mt-1.5 flex gap-2">
      <button className="min-h-14 flex-1 rounded-xl bg-tomato px-4 text-base font-extrabold text-paper shadow-[0_3px_0_#9a3a29] active:translate-y-0.5 active:shadow-none" onClick={() => tell(restaurant.plate(guest.id))}>Plate it</button>
      <button className="min-h-14 rounded-xl bg-ink/8 px-3 text-xs font-extrabold" aria-label="Put the dish down; the ingredients are lost" onClick={() => tell(restaurant.abandonCook(guest.id))}>Put down</button>
    </div>
  </div>;
}
