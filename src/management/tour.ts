import { cookZone } from './cook-zone';
import { DISHES, MOVE_AT, MOVE_PERFECT, STATION_MOVE, shiftLength, type Guest, type RestaurantState } from './types';
import type { TourId } from '../shared/api';

/**
 * The guide for a new owner's first day, as a pure function of the game's state. It never changes the simulation: the screen
 * freezes the night (pause) and slows the cooking (½×), both of which are presentation, so the night replays the same on the server.
 * Steps move on when the state moves on, not on taps, so a job the team happens to finish still counts.
 */
export type Beat = 'welcome' | 'open' | 'seat' | 'order' | 'cook' | 'bar' | 'timing' | 'serve' | 'clear' | 'free' | 'shop' | 'place' | 'next' | 'intro' | 'tip';
export type TourStep = {
  beat: Beat;
  text: string;
  /** The `data-tour` key of the control to point at, if any. */
  target?: string;
  /** A guest (by id) or a table (by its number) to ring in the room. */
  guest?: number;
  table?: number;
  /** Stop the night while this step is up. */
  freeze: boolean;
  /** Run the night at ½× while this step is up. */
  slow: boolean;
  /** A card with this button instead of a pointer (the player reads, then taps). */
  button?: string;
  /** For an introduction or a tip: the id the server remembers once it has been read. */
  seenId?: TourId;
};
/** The five jobs of the night, in the order the guide teaches them; each is taught once. */
export const JOBS: readonly Beat[] = ['seat', 'order', 'cook', 'bar', 'timing', 'serve', 'clear'];

export type TourContext = {
  /** What the server says this player has already been shown. */
  seen: ReadonlySet<string>;
  /** Steps finished in this run of the guide (kept by the screen). */
  done: ReadonlySet<Beat>;
  /** The dish in the player's own hands, if any. */
  mine?: Guest;
  /** Guests whose dish a chef has only just started (the pass offers "Take over"). */
  takeable: readonly number[];
  /** The Build panel is open, and a piece is being placed. */
  building: boolean;
  drafting: boolean;
  /** Tables when the build lesson started, to see one being added. */
  tablesAtStart: number;
  /** Cash enough for a table. */
  canBuyTable: boolean;
  /** "Replay the tour" from the help: teach the next lunch again. */
  replay: boolean;
};

const tableOf = (s: RestaurantState, id: number): number => s.furniture.filter(f => f.kind === 'table').findIndex(f => f.id === id) + 1;
const step = (beat: Beat, text: string, more: Partial<TourStep> = {}): TourStep => ({ beat, text, freeze: false, slow: false, ...more });

/** Is the guide running for this player at all? Never in co-op, never once skipped, and only around the first day (or a replay). */
export function tourActive(s: RestaurantState, ctx: Pick<TourContext, 'seen' | 'replay'>, coop: boolean): boolean {
  if (coop || ctx.seen.has('skip')) return false;
  if (ctx.replay) return true;
  return !ctx.seen.has('done') && s.history.length <= 1;
}

/** What the cooking bar means right now, in a few words. */
export function timingText(guest: Guest, moved: number): string {
  const dish = DISHES[guest.dish], ratio = guest.cook / dish.seconds, verb = STATION_MOVE[dish.station] || 'Turn', zone = cookZone(ratio);
  if (zone === 'burnt' || zone === 'over') return 'It is going over: Plate it now!';
  if (zone === 'perfect') return 'Green: Plate it!';
  if (!moved && ratio >= MOVE_AT - MOVE_PERFECT && ratio <= MOVE_AT + MOVE_PERFECT) return `In the box: ${verb} now!`;
  if (!moved) return `Watch the marker. Tap ${verb} when it is inside the box.`;
  return 'Nice. Now wait for the green, then Plate it.';
}

export function tourStep(s: RestaurantState, ctx: TourContext): TourStep | null {
  const lunchLesson = ctx.replay || s.history.length === 0;
  if (s.phase === 'planning' && lunchLesson) {
    if (!ctx.replay && !ctx.seen.has('welcome')) return step('welcome', 'You own Little Rooftop. Every day: set up, run one short service at the pass, and earn up to three stars. Your first lunch is one minute. I will walk you through it.', { button: 'Let’s cook' });
    return step('open', 'Open the doors for your first lunch.', { target: 'open' });
  }
  if (s.phase === 'service' && lunchLesson && !ctx.done.has('free')) {
    const d = ctx.done, last = s.elapsed >= shiftLength(s);
    const queued = s.guests.find(g => g.stage === 'queued');
    if (queued && !d.has('seat')) return step('seat', 'A guest is at the door. Tap a table to seat them. A ✦ table has decor nearby, so they tip more.', { target: 'seat', guest: queued.id, freeze: true });
    const seated = s.guests.find(g => g.stage === 'seated');
    if (seated && !d.has('order')) return step('order', `They are at table ${tableOf(s, seated.tableId)}. Take their order.`, { target: 'order', guest: seated.id, table: tableOf(s, seated.tableId), freeze: true });
    const ticket = s.guests.find(g => g.stage === 'waiting') ?? s.guests.find(g => ctx.takeable.includes(g.id));
    if (ticket && !ctx.mine && !d.has('cook')) return step('cook', `An order for ${DISHES[ticket.dish].name.toLowerCase()}. Tap Cook: this dish is yours now.`, { target: 'cook', guest: ticket.id, freeze: true });
    if (ctx.mine && !d.has('bar')) {
      const verb = STATION_MOVE[DISHES[ctx.mine.dish].station] || 'Turn';
      return step('bar', `The marker moves right as it cooks. Tap ${verb} when it is in the box, then Plate it in the green. I will slow things down for you.`, { target: 'cook-card', freeze: true, button: 'Start cooking' });
    }
    if (ctx.mine && !d.has('timing')) {
      const moved = s.hands.find(h => h.guestId === ctx.mine!.id)?.moved ?? 0;
      return step('timing', timingText(ctx.mine, moved), { target: 'cook-card', slow: true });
    }
    const ready = s.guests.find(g => g.stage === 'ready' || g.stage === 'delivering');
    if (ready && !d.has('serve')) return step('serve', 'The dish is ready. Serve it: carry it to the table.', { target: 'serve', guest: ready.id, freeze: true });
    if (s.dirty.length && !d.has('clear')) {
      const tableId = Number(s.dirty[0].split(':')[0]);
      return step('clear', `Table ${tableOf(s, tableId)} needs a wipe. Clear it so the next guest can sit.`, { target: 'clear', table: tableOf(s, tableId), freeze: true });
    }
    if (JOBS.every(j => d.has(j)) || last && d.has('seat')) return step('free', 'That is the whole job: Seat, Order, Cook, Serve, Clear. Your team does any job you leave, just slower. Quick moves build your ⚡ Combo, which raises tips. The rest of lunch is yours.', { freeze: true, button: 'Got it' });
    return null;
  }
  if (s.phase === 'planning' && s.history.length === 1 && !ctx.replay && !ctx.seen.has('build')) {
    const tables = s.furniture.filter(f => f.kind === 'table').length;
    if (tables > ctx.tablesAtStart) return step('next', 'A new table. Dinner is open now: two and a half minutes, with three daily challenges. Or come back tomorrow for a new headline.', { button: 'Got it' });
    if (!ctx.canBuyTable) return null;
    if (ctx.drafting) return step('place', 'Tap a gold tile: a table there has decor nearby, so it is cosy ✦ and tips more. Then Confirm.', { target: 'confirm' });
    if (ctx.building) return step('shop', 'Spend your cash on another table: more seats, more guests.', { target: 'shop-table' });
    return step('shop', 'Spend your cash: open Build.', { target: 'tab-build' });
  }
  return null;
}

/**
 * A job step is done once the screen moves off it: the job was done (by the player or by the team), or the step now points at a
 * different guest or table. The two card steps ('bar', 'free') are done by their button instead.
 */
export function settleTour(prev: TourStep | null, next: TourStep | null, done: Set<Beat>): boolean {
  if (!prev || !JOBS.includes(prev.beat) || prev.beat === 'bar' || done.has(prev.beat)) return false;
  if (next && next.beat === prev.beat && next.guest === prev.guest && next.table === prev.table) return false;
  done.add(prev.beat); return true;
}

/**
 * First-time tips: one line, once, the first time something happens that the guide did not teach (plan v5, 4.2). They never freeze
 * the night. `extra` carries what the engine state alone does not: a milestone ready to collect, a crop ready in the garden.
 */
export function tipStep(s: RestaurantState, seen: ReadonlySet<string>, extra: { milestoneReady: boolean; cropReady: boolean }): TourStep | null {
  const tip = (id: TourId, text: string, more: Partial<TourStep> = {}): TourStep | null => seen.has(id) ? null : step('tip', text, { button: 'Got it', seenId: id, ...more });
  if (s.phase === 'service') {
    if (s.incident) { const t = tip('tip-incident', 'A decision: pick one, or the default happens when the timer runs out. Each choice says what it costs.', { target: 'incident' }); if (t) return t; }
    const vip = s.guests.find(g => g.special && g.stage !== 'leaving' && g.stage !== 'arriving');
    if (vip) { const t = tip('tip-vip', 'A VIP (the crown). Some challenges count them, and on the critic’s night one VIP walkout caps you at two stars.', { guest: vip.id }); if (t) return t; }
    return null;
  }
  if (s.phase === 'planning') {
    if (s.notice === 1) { const t = tip('tip-notice', 'The bank has sent a final notice: one more night at a loss and it stores a few pieces. A profitable night clears it. Fewer staff or more seats help.'); if (t) return t; }
    if (extra.milestoneReady) { const t = tip('tip-milestone', 'A milestone is done: collect its cash in Goals.', { target: 'tab-goals' }); if (t) return t; }
    if (extra.cropReady) { const t = tip('tip-crop', 'A crop is ready on the roof. Harvest it in the Garden: home-grown dishes cost nothing and tip more.', { target: 'tab-garden' }); if (t) return t; }
  }
  return null;
}
