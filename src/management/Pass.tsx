import { ChefHat, Gift, Hand, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { challengeObjective, challengeTitles } from './daily-challenges';
import { restaurant } from './engine';
import { COMPS_PER_NIGHT, COOK_BURN, DEAL_COST, INCIDENT_TTL, MOVE_AT, MOVE_PERFECT, STATION_MOVE, SWAP_COST, HOST_DELAY, ORDER_DELAY, shiftLength, DISHES, cookQuality, guestPatienceSeconds, idealPrep, isCozy, type Guest } from './types';

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

/**
 * The orders and the dish in your hands. Only on Reddit, only while the doors are open. Every new order lands here, so there is always something to do:
 * cook it, rush it, comp it, or take it out of a chef's hands in the first seconds. The team still covers anything you leave.
 */
export function Pass() {
  const s = restaurant.state;
  if (!restaurant.remote || s.phase !== 'service') return null;
  const cooking = restaurant.myDish();
  const waiting = s.guests.filter(g => g.stage === 'waiting').sort((a, b) => b.waiting - a.waiting);
  const takeable = s.guests.filter(g => restaurant.canTakeOver(g)).sort((a, b) => b.waiting - a.waiting);
  const floor = floorJobs(), line = [...waiting, ...takeable].slice(0, floor.length ? 2 : 3);
  return <section aria-label="The pass" className="mx-auto mb-2 max-w-[1100px] space-y-2 rounded-2xl border border-paper/80 bg-paper/95 p-2 shadow-[0_4px_0_#73513d30]">
    <ChallengePips />
    <IncidentCard />
    <Floor jobs={floor} />
    {cooking ? <CookCard guest={cooking} /> : line.length ? <Tickets guests={line} /> : floor.length ? null : <p className="px-2 py-1 text-xs font-bold text-ink/70">{s.elapsed >= shiftLength(s) ? 'Last orders are out. Your team finishes the service.' : 'The next order lands here. You run the pass: tap Cook, prep, plate it in the green.'}</p>}
  </section>;
}

type Job = { key: string; left: number; kind: 'seat' | 'order' | 'serve' | 'clear'; guest?: Guest; tableId?: number; seat?: number };
/**
 * What the floor needs right now, most urgent first: a party at the door, a guest ready to order, a dish ready to carry, a dirty seat. Each
 * has an automatic fallback (the team does it after a few seconds), so ignoring one is slower, never stuck.
 */
export function floorJobs(): Job[] {
  const s = restaurant.state, patience = guestPatienceSeconds(s), left = (g: Guest) => Math.max(0, 1 - g.waiting / patience), jobs: Job[] = [];
  for (const g of s.guests) {
    if (g.stage === 'queued') jobs.push({ key: `seat${g.id}`, left: left(g), kind: 'seat', guest: g });
    else if (g.stage === 'seated') jobs.push({ key: `order${g.id}`, left: left(g), kind: 'order', guest: g });
    else if (g.stage === 'ready' || g.stage === 'delivering') jobs.push({ key: `serve${g.id}`, left: left(g), kind: 'serve', guest: g });
  }
  for (const key of s.dirty) { const [tableId, seat] = key.split(':').map(Number); jobs.push({ key: `clear${key}`, left: .7, kind: 'clear', tableId, seat }); }
  return jobs.sort((a, b) => a.left - b.left);
}
const tableNumber = (id: number): number => restaurant.state.furniture.filter(f => f.kind === 'table').findIndex(f => f.id === id) + 1;
const who = (g: Guest): string => g.regular ?? g.visitor ?? `a ${g.species}`;

/** The one decision of the moment: a complaint, an allergy, a supplier. Doing nothing takes the default after a few seconds. */
function IncidentCard() {
  const s = restaurant.state, incident = s.incident; if (!incident) return null;
  const guest = s.guests.find(g => g.id === incident.guestId), left = Math.max(0, Math.ceil(INCIDENT_TTL - (s.elapsed - incident.at)));
  const choose = (n: number): void => tell(restaurant.decide(n));
  const title = incident.kind === 'complaint' ? `${guest ? who(guest) : 'A guest'} has a complaint` : incident.kind === 'allergy' ? `${guest ? who(guest) : 'A guest'} mentions an allergy` : 'A supplier is at the door';
  const buttons: { n: number; label: string }[] = incident.kind === 'complaint' ? [{ n: 1, label: 'Comp it' }, { n: 2, label: 'Apologise' }, { n: 0, label: 'Ignore' }]
    : incident.kind === 'allergy' ? [{ n: 1, label: `Swap it · $${SWAP_COST}` }, { n: 0, label: 'Hope for the best' }] : [{ n: 1, label: `Buy the crate · $${DEAL_COST}` }, { n: 0, label: 'No thanks' }];
  return <div role="group" aria-label="A decision" className="rounded-xl border-2 border-gold bg-gold/15 p-2">
    <p className="flex items-center justify-between gap-2 px-1 text-sm font-extrabold"><span>{title}</span><span className="shrink-0 text-[11px] text-ink/60">{left}s</span></p>
    <p className="px-1 pb-1.5 text-[11px] text-ink/65">{incident.kind === 'complaint' ? 'Comping keeps them; an apology settles them; ignoring them wears their patience.' : incident.kind === 'allergy' ? 'A swap is safe. Leave it and it might go wrong.' : 'A quarter off ingredients for the rest of the night.'}</p>
    <div className="flex flex-wrap gap-1.5">{buttons.map(b => <button key={b.n} type="button" className={cn('min-h-[44px] flex-1 rounded-xl px-3 text-sm font-extrabold', b.n === 0 ? 'bg-ink/8 text-ink' : 'bg-teal text-paper')} onClick={() => choose(b.n)}>{b.label}</button>)}</div>
  </div>;
}

function Floor({ jobs }: { jobs: Job[] }) {
  if (!jobs.length) return null;
  const s = restaurant.state, shown = jobs.slice(0, 3), patience = guestPatienceSeconds(s);
  const tables = s.furniture.filter(f => f.kind === 'table').map((table, i) => ({ table, n: i + 1, seat: [0, 1].find(k => restaurant.seatFree(table, k)), cozy: isCozy(s.furniture, table) })).filter(t => t.seat !== undefined).sort((a, b) => Number(b.cozy) - Number(a.cozy));
  return <div aria-label="The floor">
    <p className="px-2 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-teal">On the floor · quick hands tip more</p>
    <ul className="space-y-1.5">{shown.map(j => {
      const g = j.guest, urgent = j.left < .3;
      return <li key={j.key} className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-2 py-1.5', urgent ? 'border-tomato/60 bg-tomato/10' : 'border-ink/10 bg-white/40')}>
        <div className="min-w-[7.5rem] flex-1">
          <p className="text-sm font-extrabold leading-tight">{j.kind === 'seat' ? `${who(g!)} at the door` : j.kind === 'order' ? `Table ${tableNumber(g!.tableId)} is ready to order` : j.kind === 'serve' ? `${DISHES[g!.dish].name} is ready` : `Table ${tableNumber(j.tableId!)} needs clearing`}{g?.special && <span className="ml-1 text-gold" title="Star guest">★</span>}</p>
          <p className="text-[10px] font-bold text-ink/55">{j.kind === 'seat' ? `The host seats them in ${Math.max(0, Math.ceil(HOST_DELAY - g!.waiting))}s` : j.kind === 'order' ? `A server takes it in ${Math.max(0, Math.ceil(ORDER_DELAY - g!.timer))}s` : j.kind === 'serve' ? 'A server will carry it' : 'A server will wipe it'}</p>
          {g && <div role="progressbar" aria-label="Guest patience" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0, 1 - g.waiting / patience) * 100)} className="mt-0.5 h-1 overflow-hidden rounded-full bg-ink/10"><div className={cn('h-full rounded-full', urgent ? 'bg-tomato' : 'bg-teal')} style={{ width: `${Math.max(0, 1 - g.waiting / patience) * 100}%` }} /></div>}
        </div>
        {j.kind === 'seat' ? <div className="flex max-w-full gap-1 overflow-x-auto">{tables.length ? tables.slice(0, 4).map(t => <button key={t.table.id} type="button" aria-label={`Seat ${who(g!)} at table ${t.n}${t.cozy ? ', a cosy table' : ''}`} className="flex min-h-[44px] min-w-[3.25rem] items-center justify-center rounded-xl bg-teal px-2.5 text-sm font-extrabold text-paper" onClick={() => tell(restaurant.seat(g!.id, t.table.id, t.seat!))}>{t.cozy ? '✦ ' : ''}T{t.n}</button>) : <span className="text-[11px] font-bold text-ink/55">No free table yet</span>}</div>
          : <button type="button" className="flex min-h-[44px] min-w-[4.5rem] items-center justify-center rounded-xl bg-teal px-3 text-sm font-extrabold text-paper" onClick={() => tell(j.kind === 'order' ? restaurant.order(g!.id) : j.kind === 'serve' ? restaurant.serve(g!.id) : restaurant.clear(j.tableId!, j.seat!))}>{j.kind === 'order' ? 'Take order' : j.kind === 'serve' ? 'Serve' : 'Clear'}</button>}
      </li>;
    })}</ul>
    {jobs.length > shown.length && <p className="px-2 pt-1 text-[10px] font-bold text-ink/55">{jobs.length - shown.length} more waiting</p>}
  </div>;
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
  const s = restaurant.state, patience = guestPatienceSeconds(s), comps = COMPS_PER_NIGHT - s.comps, anyWaiting = guests.some(g => g.stage === 'waiting');
  return <div>
    <p className="px-2 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-teal">{anyWaiting ? 'Order up · tap Cook' : 'Your team just started these · take over?'}</p>
    <ul className="space-y-1.5">{guests.map(g => {
      const left = Math.max(0, 1 - g.waiting / patience), urgent = left < .3, teamHasIt = g.stage === 'cooking';
      return <li key={g.id} className={cn('flex flex-wrap items-center gap-2 rounded-xl border px-2 py-1.5', urgent ? 'border-tomato/60 bg-tomato/10' : 'border-ink/10 bg-white/40')}>
        <div className="min-w-[8.5rem] flex-1">
          <p className="text-sm font-extrabold leading-tight">{DISHES[g.dish].name}{g.special && <span className="ml-1 text-gold" title="Star guest">★</span>}{g.priority && <span className="ml-1 text-[10px] font-extrabold uppercase text-teal">first</span>}{teamHasIt && <span className="ml-1 text-[10px] font-extrabold uppercase text-ink/55">chef is on it</span>}</p>
          <div role="progressbar" aria-label="Guest patience" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left * 100)} className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10"><div className={cn('h-full rounded-full', urgent ? 'bg-tomato' : 'bg-teal')} style={{ width: `${left * 100}%` }} /></div>
        </div>
        <button className={cn('flex min-h-[44px] min-w-[4.5rem] items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-extrabold text-paper', teamHasIt ? 'bg-ink/70' : 'bg-teal motion-safe:animate-pulse')} onClick={() => { const result = restaurant.claimTicket(g.id); tell(result); if (!result && restaurant.speed !== 1) { restaurant.setSpeed(1); toast('Slowed to 1× while you cook.'); } }}><ChefHat size={16} />{teamHasIt ? 'Take over' : 'Cook'}</button>
        {!teamHasIt && <>
          <button className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-ink/8 px-2.5 text-xs font-extrabold disabled:opacity-40" disabled={g.priority} aria-label={`Rush ${DISHES[g.dish].name} to the front of the line`} onClick={() => tell(restaurant.rush(g.id))}><Zap size={15} />Rush</button>
          <button className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-ink/8 px-2.5 text-xs font-extrabold disabled:opacity-40" disabled={comps <= 0} aria-label={`Comp ${DISHES[g.dish].name}: free meal, the guest stays. ${comps} left tonight`} onClick={() => tell(restaurant.comp(g.id))}><Gift size={15} />Comp {comps}</button>
        </>}
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

/** Flip, stir, toss: one tap while the dish cooks, best when the marker is inside the box on the bar. A well-timed one forgives a late plate. */
function MoveButton({ guest }: { guest: Guest }) {
  const dish = DISHES[guest.dish], verb = STATION_MOVE[dish.station] || 'Turn', mine = restaurant.state.hands.find(h => h.guestId === guest.id), moved = mine?.moved ?? 0;
  return <button type="button" disabled={moved > 0} aria-label={moved ? `${verb}: ${['', 'a little off', 'decent', 'perfect'][moved]}` : `${verb} the ${dish.name.toLowerCase()}`} className={cn('mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border-2 px-3 text-sm font-extrabold', moved === 3 ? 'border-teal bg-teal text-paper' : moved ? 'border-ink/20 bg-white/50 text-ink/70' : 'border-gold bg-gold text-ink')} onClick={() => tell(restaurant.move(guest.id))}>
    {moved ? `${verb}: ${['', 'a little off', 'decent', 'perfect!'][moved]}` : `${verb}! (when the marker is in the box)`}
  </button>;
}

function CookCard({ guest }: { guest: Guest }) {
  const dish = DISHES[guest.dish], ratio = guest.cook / dish.seconds, zone = cookZone(ratio), at = Math.min(1, ratio / COOK_BURN) * 100;
  return <div className="rounded-xl border border-teal/50 bg-teal/5 p-2">
    <p className="flex items-center gap-2 text-sm font-extrabold"><Hand size={16} className="text-teal" aria-hidden />You are cooking: {dish.name}</p>
    <div role="progressbar" aria-label="Cooking" aria-valuemin={0} aria-valuemax={COOK_BURN * 100} aria-valuenow={Math.round(ratio * 100)} aria-valuetext={ZONE_TEXT[zone]} className="relative mt-2 h-4 rounded-full" style={{ background: BAR }}>
      <div aria-hidden className="absolute inset-y-0 rounded-sm border-2 border-ink/60" style={{ left: `${(MOVE_AT - MOVE_PERFECT) / COOK_BURN * 100}%`, width: `${MOVE_PERFECT * 2 / COOK_BURN * 100}%` }} />
      <div className="absolute -top-1 h-6 w-1.5 -translate-x-1/2 rounded-full border border-paper bg-ink" style={{ left: `${at}%` }} />
    </div>
    <p role="status" aria-live="polite" className={cn('mt-1 text-sm font-extrabold', ZONE_STYLE[zone])}>{ZONE_TEXT[zone]}</p>
    <MoveButton guest={guest} />
    <Prep guest={guest} />
    <div className="mt-1.5 flex gap-2">
      <button className="min-h-14 flex-1 rounded-xl bg-tomato px-4 text-base font-extrabold text-paper shadow-[0_3px_0_#9a3a29] active:translate-y-0.5 active:shadow-none" onClick={() => tell(restaurant.plate(guest.id))}>Plate it</button>
      <button className="min-h-14 rounded-xl bg-ink/8 px-3 text-xs font-extrabold" aria-label="Put the dish down; the ingredients are lost" onClick={() => tell(restaurant.abandonCook(guest.id))}>Put down</button>
    </div>
  </div>;
}
