import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { createDailyHeadline } from '@/management/daily-headline';
import { DISHES, MOVE_AT, createRestaurant } from '@/management/types';
import { settleTour, tourActive, tourStep, type Beat, type TourContext, type TourStep } from '@/management/tour';

const ctxFor = (e: RestaurantEngine, done: Set<Beat>, extra: Partial<TourContext> = {}): TourContext => ({
  seen: new Set(['welcome']), done, mine: e.myDish(), takeable: e.state.guests.filter(g => e.canTakeOver(g)).map(g => g.id),
  building: false, drafting: false, tablesAtStart: 3, canBuyTable: true, replay: false, ...extra,
});
function lunch(date = '2026-12-09'): RestaurantEngine {
  const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state = { ...createRestaurant(), shift: 'lunch' };
  expect(e.open(createDailyHeadline(date))).toBeNull(); return e;
}

describe('the guided first lunch', () => {
  it('teaches seat, order, cook, the bar, timing, serve and clear in order, then hands the lunch over', () => {
    for (const date of ['2026-12-09', '2026-12-10', '2026-12-12']) {
      const e = lunch(date), done = new Set<Beat>(), beats: Beat[] = [];
      let prev: TourStep | null = null;
      for (let i = 0; i < 8000 && e.state.phase === 'service' && !done.has('free'); i++) {
        let step = tourStep(e.state, ctxFor(e, done));
        if (settleTour(prev, step, done)) step = tourStep(e.state, ctxFor(e, done));
        prev = step;
        if (step && beats[beats.length - 1] !== step.beat) beats.push(step.beat);
        const s = e.state;
        switch (step?.beat) {
          case 'seat': { const spot = s.furniture.filter(f => f.kind === 'table').flatMap(t => [0, 1].filter(k => e.seatFree(t, k)).map(k => ({ t, k })))[0]; e.seat(step.guest!, spot.t.id, spot.k); break; }
          case 'order': e.order(step.guest!); break;
          case 'cook': e.claimTicket(step.guest!); break;
          case 'bar': done.add('bar'); break;
          case 'timing': { const g = e.myDish()!, h = s.hands.find(x => x.guestId === g.id)!, r = g.cook / DISHES[g.dish].seconds; if (!h.moved && r >= MOVE_AT) e.move(g.id); if (r >= 1) e.plate(g.id); break; }
          case 'serve': e.serve(step.guest!); break;
          case 'clear': { const [t, k] = s.dirty[0].split(':').map(Number); e.clear(t, k); break; }
          case 'free': done.add('free'); break;
        }
        if (!step?.freeze) e.tick();
      }
      const first = (b: Beat) => beats.indexOf(b);
      expect(beats).toEqual(expect.arrayContaining(['seat', 'order', 'cook', 'bar', 'timing', 'serve', 'clear', 'free']));
      expect(first('seat')).toBeLessThan(first('order')); expect(first('order')).toBeLessThan(first('cook'));
      expect(first('cook')).toBeLessThan(first('bar')); expect(first('bar')).toBeLessThan(first('timing'));
      expect(first('timing')).toBeLessThan(first('serve')); expect(first('serve')).toBeLessThan(first('clear'));
      expect(done.has('free')).toBe(true);
    }
  });
  it('moves on when the team does the job instead', () => {
    const e = lunch(), done = new Set<Beat>();
    let prev: TourStep | null = null;
    for (let i = 0; i < 2000 && !done.has('seat'); i++) { const step = tourStep(e.state, ctxFor(e, done)); settleTour(prev, step, done); prev = step; e.tick(); }
    expect(done.has('seat')).toBe(true);
    expect(e.state.guests.some(g => g.stage !== 'queued')).toBe(true);
  });
  it('welcomes, then points at Open; never runs once skipped, in co-op, or after the first day', () => {
    const s = createRestaurant(), base = { seen: new Set<string>(), replay: false };
    expect(tourStep(s, { ...ctxFor(lunch(), new Set()), seen: new Set() })?.beat).toBe('welcome');
    expect(tourStep(s, { ...ctxFor(lunch(), new Set()), seen: new Set(['welcome']) })).toMatchObject({ beat: 'open', target: 'open' });
    expect(tourActive(s, base, false)).toBe(true);
    expect(tourActive(s, base, true)).toBe(false);
    expect(tourActive(s, { seen: new Set(['skip']), replay: false }, false)).toBe(false);
    expect(tourActive({ ...s, history: [s.history[0], s.history[0]] as never }, base, false)).toBe(false);
    expect(tourActive({ ...s, history: [1, 2] as never }, { seen: new Set(), replay: true }, false)).toBe(true);
  });
  it('after the first lunch, walks through buying a table and stops once one is placed', () => {
    const s = { ...createRestaurant(), history: [{}] as never }, e = lunch(), seen = new Set(['welcome', 'lunch']);
    const at = (more: Partial<TourContext>) => tourStep(s, { ...ctxFor(e, new Set()), seen, ...more })?.beat;
    expect(at({})).toBe('shop');
    expect(tourStep(s, { ...ctxFor(e, new Set()), seen })?.target).toBe('tab-build');
    expect(tourStep(s, { ...ctxFor(e, new Set()), seen, building: true })?.target).toBe('shop-table');
    expect(at({ building: true, drafting: true })).toBe('place');
    expect(at({ tablesAtStart: 2 })).toBe('next');
    expect(at({ canBuyTable: false })).toBeUndefined();
  });
});
