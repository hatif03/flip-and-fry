import { useEffect, useRef, useState } from 'react';
import { ChefHat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GOALS, restaurant, type Speed } from './engine';
import { CATALOG } from './types';
import { settleTour, tipStep, tourActive, tourStep, type Beat, type TourContext, type TourStep } from './tour';
import { nextIntro, readShowAll, type LadderContext } from './ladder';

/** "Replay the tour" in the help turns this on: the next lunch is taught again. Client-only, for this visit. */
export const tourReplay = { on: false };

/** "Show everything" (Settings): turns the unlock ladder off on this device. */
export const prefs = { showAll: readShowAll() };
/** The ladder's view of this player: on Reddit with a session that keeps the tour, unless they skipped it or chose to see everything. */
export function ladderCtx(): LadderContext {
  const tour = restaurant.remote?.tour;
  return { reddit: Boolean(tour), seen: tour?.seen ?? new Set<string>(), showAll: prefs.showAll };
}

/** Whether the guide is running now (the hint line stays quiet while it is). */
export function guideOn(): boolean {
  const tour = restaurant.remote?.tour;
  return Boolean(tour) && !restaurant.catchingUp && tourActive(restaurant.state, { seen: tour!.seen, replay: tourReplay.on }, Boolean(restaurant.coop));
}

type Boxes = { target?: DOMRect; ring?: DOMRect };
const PAD = 6;
const visible = (el: Element | null): DOMRect | undefined => {
  if (!el) return undefined;
  const label = el.closest<HTMLElement>('[data-anchor-height]');
  if (label && label.style.visibility !== 'visible') return undefined;
  const r = el.getBoundingClientRect(); return r.width || r.height ? r : undefined;
};
const near = (a?: DOMRect, b?: DOMRect): boolean => !a && !b || Boolean(a && b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1);

/**
 * The guide on screen: a chef's speech bubble, a dimmed screen with a hole around the control to tap, and a ring around the guest or
 * table in the room. It freezes the night (pause) or slows it (½×) as the step asks; both are presentation, never a rule change.
 */
export function Coach({ building, drafting, hidden }: { building: boolean; drafting: boolean; hidden: boolean }) {
  const s = restaurant.state, tour = restaurant.remote?.tour;
  const done = useRef(new Set<Beat>()), prev = useRef<TourStep | null>(null), tables = useRef<number | null>(null), phase = useRef(s.phase);
  const [, bump] = useState(0), refresh = (): void => bump(n => n + 1);
  // A new service starts a fresh run of the lesson (a replay teaches it again).
  if (phase.current !== s.phase) { if (s.phase === 'service') { done.current.clear(); prev.current = null; } phase.current = s.phase; }
  const tableCount = s.furniture.filter(f => f.kind === 'table').length;
  if (s.phase === 'planning' && s.history.length === 1 && tables.current === null) tables.current = tableCount;
  const on = !hidden && guideOn() && !restaurant.remote?.result;
  const ctx: TourContext | null = tour ? {
    seen: tour.seen, done: done.current, mine: restaurant.myDish(), takeable: s.guests.filter(g => restaurant.canTakeOver(g)).map(g => g.id),
    building, drafting, tablesAtStart: tables.current ?? tableCount, canBuyTable: s.cash >= CATALOG.table.price, replay: tourReplay.on,
  } : null;
  let step = on && ctx ? tourStep(s, ctx) : null;
  if (ctx && settleTour(prev.current, step, done.current)) step = on ? tourStep(s, ctx) : null;
  prev.current = step;
  // Between the guide's lessons: one introduction card per newly unlocked system, then one-time tips. Never during the guided lunch.
  if (!step && tour && !hidden && !restaurant.remote?.result && !restaurant.coop && !restaurant.catchingUp && !tour.seen.has('skip') && !guideOn()) {
    const intro = s.phase === 'planning' ? nextIntro(s.history.length, ladderCtx()) : null;
    const plots = restaurant.remote?.world?.peek?.(), now = Date.now() + (plots?.offset ?? 0);
    step = intro ? { beat: 'intro', text: intro.text, target: intro.target, freeze: false, slow: false, button: 'Got it', seenId: intro.id }
      : tipStep(s, tour.seen, { milestoneReady: GOALS.some(g => !s.claimed.includes(g.id) && g.value(s) >= g.target), cropReady: Boolean(plots?.view.plots.some(p => p.crop && now >= p.readyAt)) });
  }

  // Freeze or slow the night for the step, and give the player back their own speed afterwards.
  const froze = useRef(false), saved = useRef<Speed | null>(null);
  const freeze = Boolean(step?.freeze) && s.phase === 'service', slow = Boolean(step?.slow) && s.phase === 'service';
  useEffect(() => {
    if (freeze && !restaurant.paused) { restaurant.pause(true); froze.current = true; }
    if (!freeze && froze.current) { froze.current = false; if (restaurant.state.phase === 'service') restaurant.pause(false); }
    if (slow && restaurant.speed !== .5) { saved.current ??= restaurant.speed; restaurant.setSpeed(.5); }
    if (!slow && saved.current !== null) { const back = saved.current; saved.current = null; if (freeze) restaurant.speed = back; else if (restaurant.state.phase === 'service') restaurant.setSpeed(back); }
  });

  // Follow the target and the ring every frame: guests walk, panels slide.
  const [boxes, setBoxes] = useState<Boxes>({});
  const key = step ? `${step.beat}:${step.target}:${step.guest}:${step.table}` : '';
  useEffect(() => {
    if (!step) { setBoxes({}); return; }
    let id = 0;
    const find = (): void => {
      const target = step.target ? visible(document.querySelector(`[data-tour="${step.target}"]`)) : undefined;
      const ring = step.guest !== undefined ? visible(document.querySelector(`[data-guest-id="${step.guest}"]`)) : step.table ? visible(document.querySelector(`[data-table-plate="${step.table}"]`)) : undefined;
      setBoxes(b => near(b.target, target) && near(b.ring, ring) ? b : { target, ring });
      id = requestAnimationFrame(find);
    };
    find(); return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const skip = (): void => { tour?.mark('skip'); tourReplay.on = false; refresh(); };
  useEffect(() => {
    if (!step) return;
    const esc = (e: KeyboardEvent): void => { if (e.key === 'Escape') skip(); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(step)]);
  if (!step || !tour) return null;

  const press = (): void => {
    if (step.beat === 'welcome') tour.mark('welcome');
    else if (step.beat === 'bar') done.current.add('bar');
    else if (step.beat === 'free') { done.current.add('free'); if (!tourReplay.on) tour.mark('lunch'); tourReplay.on = false; }
    else if (step.beat === 'next') { tour.mark('build'); tour.mark('done'); }
    else if (step.seenId) tour.mark(step.seenId);
    refresh();
  };
  const t = boxes.target, dim = step.freeze || step.beat === 'open' || step.beat === 'shop' || step.beat === 'welcome';
  const W = typeof window === 'undefined' ? 0 : window.innerWidth, H = typeof window === 'undefined' ? 0 : window.innerHeight;
  const hole = t ? `M${t.left - PAD} ${t.top - PAD}h${t.width + PAD * 2}v${t.height + PAD * 2}h${-(t.width + PAD * 2)}Z` : '';
  const below = t ? t.top + t.height / 2 < H / 2 : false;
  const place = t ? below ? { top: Math.min(H - 180, t.bottom + PAD + 10) } : { bottom: Math.min(H - 180, H - t.top + PAD + 10) } : { top: Math.round(H * .28) };
  return <div data-testid="coach" data-beat={step.beat} className="pointer-events-none fixed inset-0 z-[55]">
    {dim && <svg aria-hidden className="absolute inset-0 h-full w-full" width={W} height={H}><path fillRule="evenodd" d={`M0 0H${W}V${H}H0Z${hole}`} fill="rgba(20,32,30,.5)" style={{ pointerEvents: 'auto' }} /></svg>}
    {t && <div aria-hidden className="absolute rounded-xl border-[3px] border-gold motion-safe:animate-pulse" style={{ left: t.left - PAD, top: t.top - PAD, width: t.width + PAD * 2, height: t.height + PAD * 2 }} />}
    {boxes.ring && <div aria-hidden className="absolute rounded-full border-[3px] border-gold shadow-[0_0_0_3px_#233D3B88] motion-safe:animate-pulse" style={{ left: boxes.ring.left - 14, top: boxes.ring.top - 14, width: boxes.ring.width + 28, height: boxes.ring.height + 28 }} />}
    <div className="absolute inset-x-3 mx-auto max-w-sm" style={place}>
      <div role="status" aria-live="polite" aria-label="Guide" className="pointer-events-auto rounded-2xl border-[3px] border-[#233D3B] bg-paper p-3 text-ink shadow-[4px_4px_0_#233D3B55]">
        <div className="flex gap-2.5">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal text-paper"><ChefHat size={22} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-teal">Basil, your chef</p>
            <p className="mt-0.5 text-sm font-bold leading-snug">{step.text}</p>
          </div>
        </div>
        <div className={cn('mt-2 flex items-center gap-2', step.button ? 'justify-between' : 'justify-end')}>
          <button type="button" onClick={skip} className="min-h-11 px-2 text-xs font-extrabold text-ink/60 underline-offset-2 hover:underline">{step.beat === 'welcome' ? 'Skip the tour' : 'Skip'}</button>
          {step.button && <button type="button" autoFocus onClick={press} className="game-button game-button-primary min-h-11 px-4 text-sm">{step.button}</button>}
        </div>
      </div>
    </div>
  </div>;
}
