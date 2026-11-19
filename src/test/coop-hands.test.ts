import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { createDailyHeadline } from '@/management/daily-headline';
import { runService, stateHash, type Action } from '@/management/replay';
import { DISHES, createRestaurant, restaurantSchema, type RestaurantState } from '@/management/types';

const headline = createDailyHeadline('2026-12-09');
const noChef = (): RestaurantState => { const s = createRestaurant(); s.staff = s.staff.map(m => ({ ...m, role: 'server' as const })); s.cash = 5000; s.furniture.push({ id: 90, kind: 'prep', x: 9, z: 4, rotation: 0 }); return s; };
function live() {
  const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state = noChef(); const log: Action[] = []; e.onAction = a => log.push(a);
  expect(e.open(headline)).toBeNull(); for (let i = 0; i < 4000 && e.state.guests.filter(g => g.stage === 'waiting' && DISHES[g.dish].station === 'prep').length < 2; i++) e.tick();
  return { e, log, tickets: () => e.state.guests.filter(g => g.stage === 'waiting' && DISHES[g.dish].station === 'prep') };
}
const run = (e: RestaurantEngine, seconds: number) => { for (let i = 0; i < Math.round(seconds * 10); i++) e.tick(); };

describe('two pairs of hands', () => {
  it('lets the owner and a neighbor each cook a dish at the same time, but only one each', () => {
    const { e, tickets } = live(), [a, b] = tickets(); expect(a && b).toBeTruthy();
    expect(e.claimTicket(a.id, 0)).toBeNull(); expect(e.claimTicket(b.id, 1)).toBeNull();
    expect(e.state.hands.map(h => [h.guestId, h.by])).toEqual([[a.id, 0], [b.id, 1]]);
    const c = e.state.guests.find(g => g.stage === 'waiting'); if (c) { expect(e.claimTicket(c.id, 0)).toBe('Finish the dish you are cooking first.'); expect(e.claimTicket(c.id, 1)).toBe('Finish the dish you are cooking first.'); }
  });
  it('keeps each person to their own dish', () => {
    const { e, tickets } = live(), [a, b] = tickets(); e.claimTicket(a.id, 0); e.claimTicket(b.id, 1);
    expect(e.holdPrep(a.id, 1)).toBe('That is not your dish.'); expect(e.plate(a.id, 1)).toBe('That is not your dish.'); expect(e.abandonCook(b.id, 0)).toBe('That is not your dish.');
    expect(e.holdPrep(b.id, 1)).toBeNull(); expect(e.releasePrep(b.id, 1)).toBeNull(); expect(e.holdPrep(a.id, 0)).toBeNull();
  });
  it('counts each one\'s prep separately', () => {
    const { e, tickets } = live(), [a, b] = tickets(); e.claimTicket(a.id, 0); e.claimTicket(b.id, 1); e.holdPrep(a.id, 0); run(e, 1); e.holdPrep(b.id, 1); run(e, 1);
    const ha = e.state.hands.find(h => h.guestId === a.id)!, hb = e.state.hands.find(h => h.guestId === b.id)!; expect(ha.prep).toBeCloseTo(2, 5); expect(hb.prep).toBeCloseTo(1, 5);
  });
  it('records a neighbor\'s actions with their hands, and the owner\'s without any, so a solo log is unchanged', () => {
    const { e, log, tickets } = live(), [a, b] = tickets(); e.claimTicket(a.id, 0); e.claimTicket(b.id, 1); e.holdPrep(b.id, 1);
    expect(log[0]).not.toHaveProperty('by'); expect(log[1]).toMatchObject({ kind: 'claimTicket', by: 1 }); expect(log[2]).toMatchObject({ kind: 'hold', by: 1 });
  });
  it('replays to the same night on the server, with both people\'s actions', () => {
    const { e, log, tickets } = live(), [a, b] = tickets(); e.claimTicket(a.id, 0); e.claimTicket(b.id, 1);
    e.holdPrep(b.id, 1); run(e, 2.4); e.releasePrep(b.id, 1); run(e, DISHES[a.dish].seconds); e.plate(a.id, 0); e.plate(b.id, 1);
    while (e.state.phase === 'service') e.tick();
    const start = noChef(); const replay = runService(start, log, headline); if ('error' in replay) throw new Error(replay.error);
    expect(replay.rejected).toBe(0); expect(replay.hash).toBe(stateHash(e.state)); expect(log.some(x => 'by' in x && x.by === 1)).toBe(true);
  });
  it('ignores a forged action for hands that are not there', () => {
    const clean = runService(noChef(), [], headline), forged = runService(noChef(), [{ tick: 30, kind: 'hold', guestId: 3, by: 1 }, { tick: 50, kind: 'cook', guestId: 3, by: 1 }], headline);
    if ('error' in clean || 'error' in forged) throw new Error('failed'); expect(forged.hash).toBe(clean.hash); expect(forged.rejected).toBe(2);
  });
  it('is valid in a save, and refuses hands that are not 0 or 1', () => {
    const { e, tickets } = live(), [a] = tickets(); e.claimTicket(a.id, 1); expect(restaurantSchema.safeParse(JSON.parse(JSON.stringify(e.state))).success).toBe(true);
    const bad = JSON.parse(JSON.stringify(e.state)); bad.hands[0].by = 2; expect(restaurantSchema.safeParse(bad).success).toBe(false);
  });
});
