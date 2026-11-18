import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { createDailyChallenges } from '@/management/daily-challenges';
import { createDailyHeadline, headlineEffects, type DailyHeadline, type HeadlineId } from '@/management/daily-headline';
import { runService } from '@/management/replay';
import { createRestaurant, dishCost, guestPatienceSeconds, type RestaurantState } from '@/management/types';

/** A headline of a given kind, with a fixed seed so the weather does not vary between the cases we compare. */
const headline = (id: HeadlineId, seed = 2): DailyHeadline => ({ ...createDailyHeadline('2026-12-09'), id, seed, weather: 'sunset' });
const seeds = Array.from({ length: 16 }, (_, i) => 91273 + i * 7919);
const start = (seed: number): RestaurantState => ({ ...createRestaurant(), seed });
const total = (id: HeadlineId, pick: (r: NonNullable<ReturnType<typeof ok>>) => number, over?: (s: RestaurantState) => void) =>
  seeds.reduce((sum, seed) => { const s = start(seed); over?.(s); return sum + pick(ok(runService(s, [], headline(id)))); }, 0);
function ok(r: ReturnType<typeof runService>) { if ('error' in r) throw new Error(r.error); return r; }

describe('a headline changes the night through existing formulas', () => {
  it('mixes its seed into the engine seed: same headline same night, other headline other night', () => {
    const a = ok(runService(start(5), [], headline('quiet'))), b = ok(runService(start(5), [], headline('quiet'))), c = ok(runService(start(5), [], headline('rush')));
    expect(a.hash).toBe(b.hash); expect(a.hash).not.toBe(c.hash);
    expect(a.state.headline).toMatchObject({ id: 'quiet', date: '2026-12-09' });
    expect(a.report.headline).toBe('quiet');
  });
  it('two different kitchens do not see the same queue under the same headline', () => {
    const plain = start(7), bigger = { ...plain, furniture: [...plain.furniture, { id: 40, kind: 'lamp' as const, x: 4, z: 6, rotation: 0 }] };
    const a = ok(runService(plain, [], headline('rush'))), b = ok(runService(bigger, [], headline('rush')));
    expect(a.hash).not.toBe(b.hash);
  });
  it('rush brings more guests to the door than a quiet night', () => {
    const arrivals = (r: { report: { served: number; missed: number } }) => r.report.served + r.report.missed;
    expect(total('rush', arrivals)).toBeGreaterThan(total('quiet', arrivals));
  });
  it('quiet makes guests more patient', () => {
    const s = start(1); const base = guestPatienceSeconds(s);
    expect(guestPatienceSeconds({ ...s, headline: { id: 'quiet', date: '2026-12-14', seed: 2, walkouts: 0, dirtyAtClose: 0, closed: false } })).toBeCloseTo(base * 1.15 * (headlineEffects({ id: 'quiet', seed: 2 }).burgerBias > 0 ? .95 : 1));
  });
  it('the supplier hike raises the burger and leaves the salad alone', () => {
    const s = { ...start(1), headline: { id: 'supplier' as const, date: '2026-12-10', seed: 2, walkouts: 0, dirtyAtClose: 0, closed: false } };
    expect(dishCost(s, 'burger')).toBeGreaterThanOrEqual(17); expect(dishCost(s, 'burger')).toBeLessThanOrEqual(19);
    expect(dishCost(s, 'salad')).toBe(7); expect(dishCost(start(1), 'burger')).toBe(12);
  });
  it('payday halves the price walk-away so a bold menu survives', () => {
    const bold = (s: RestaurantState) => { s.menu.salad.price = 40; s.menu.burger.price = 60; };
    const served = (r: { report: { served: number } }) => r.report.served;
    expect(total('payday', served, bold)).toBeGreaterThan(total('quiet', served, bold));
  });
  it('rain keeps comfort in the tips and slows nobody into a different day count', () => {
    const tips = (r: { report: { tips: number } }) => r.report.tips;
    expect(total('rain', tips)).toBeGreaterThan(0);
  });
});

describe('critic and inspector', () => {
  it('every guest is a star guest on a critic night', () => {
    const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.open(headline('critic'));
    for (let i = 0; i < 800; i++) e.tick();
    const seen = e.state.guests; expect(seen.length).toBeGreaterThan(2); expect(seen.every(g => g.special)).toBe(true);
  });
  it('a star guest who walks out caps the night at two stars', () => {
    const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.open(headline('critic'));
    for (let i = 0; i < 400 && e.state.guests.length === 0; i++) e.tick();
    const guest = e.state.guests[0]; expect(guest).toBeDefined();
    (e as unknown as { leave(g: typeof guest, happy: boolean): void }).leave(guest, false);
    expect(e.state.headline!.walkouts).toBe(1);
    for (let i = 0; i < 2600 && e.state.phase === 'service'; i++) e.tick();
    expect(e.state.history[0].rating).toBeLessThanOrEqual(2);
  });
  it('other headlines never count walkouts as a critic would', () => {
    const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.open(headline('quiet'));
    for (let i = 0; i < 400 && e.state.guests.length === 0; i++) e.tick();
    (e as unknown as { leave(g: unknown, happy: boolean): void }).leave(e.state.guests[0], false);
    for (let i = 0; i < 2600 && e.state.phase === 'service'; i++) e.tick();
    expect(e.state.history[0].rating).toBeGreaterThan(2);
  });
  it('the inspector counts dirty seats once, when the doors close, and docks the rating', () => {
    const run = (id: HeadlineId) => { const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.open(headline(id)); let injected = false;
      for (let i = 0; i < 2600 && e.state.phase === 'service'; i++) { if (!injected && e.state.elapsed >= 149.9) { e.state.dirty.push('3:0', '3:1'); injected = true; } e.tick(); }
      return e; };
    const inspected = run('inspection'), calm = run('quiet');
    expect(inspected.state.headline!.dirtyAtClose).toBeGreaterThanOrEqual(2); expect(inspected.state.headline!.closed).toBe(true);
    expect(calm.state.headline!.dirtyAtClose).toBeGreaterThanOrEqual(2);
    expect(inspected.state.history[0].rating).toBeLessThan(calm.state.history[0].rating);
  });
});

describe('shared daily challenges', () => {
  it('everyone on the same menu and tier gets the same three goals today', () => {
    const h = { id: 'rain' as const, date: '2026-12-09', seed: 77, walkouts: 0, dirtyAtClose: 0, closed: false };
    const a = createDailyChallenges({ ...start(1), headline: h }), b = createDailyChallenges({ ...start(999), headline: h });
    expect(a).toEqual(b); expect(a).toHaveLength(3);
  });
  it('without a headline the private roll is unchanged', () => {
    expect(createDailyChallenges(start(1))).not.toEqual(createDailyChallenges(start(2)));
  });
});
