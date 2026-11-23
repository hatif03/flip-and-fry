import { describe, expect, it } from 'vitest';
import type { Action } from '@/management/actions';
import { RestaurantEngine } from '@/management/engine';
import { createDailyHeadline } from '@/management/daily-headline';
import { runService, stateHash } from '@/management/replay';
import { DISHES, MOVE_AT, createRestaurant } from '@/management/types';

/**
 * The guide freezes the night at each job and slows the cooking to ½×. Both are presentation: pause stops the fixed steps and the
 * speed only scales the frame clock. This plays a lunch that way, through the real frame clock, and checks the server's replay agrees.
 */
function guideActs(e: RestaurantEngine): void {
  const s = e.state;
  const party = s.guests.find(g => g.stage === 'queued');
  if (party) { const spot = s.furniture.filter(f => f.kind === 'table').flatMap(table => [0, 1].filter(seat => e.seatFree(table, seat)).map(seat => ({ table, seat })))[0]; if (spot) e.seat(party.id, spot.table.id, spot.seat); }
  const seated = s.guests.find(g => g.stage === 'seated'); if (seated) e.order(seated.id);
  if (!e.myDish()) { const waiting = s.guests.find(g => g.stage === 'waiting'); if (waiting) e.claimTicket(waiting.id); }
  const ready = s.guests.find(g => g.stage === 'ready'); if (ready) e.serve(ready.id);
  const dirty = s.dirty[0]; if (dirty) { const [tableId, seat] = dirty.split(':').map(Number); e.clear(tableId, seat); }
}

describe('a lunch played the way the guide plays it', () => {
  it('acts while frozen, cooks at half speed, and the server replays the same night', () => {
    for (const date of ['2026-12-09', '2026-12-11', '2026-12-13']) {
      const headline = createDailyHeadline(date), start = { ...createRestaurant(), shift: 'lunch' as const };
      const e = new RestaurantEngine(undefined, () => 0), owner: Action[] = [];
      e.autoRoll = false; e.state = structuredClone(start); e.onAction = a => owner.push(a);
      expect(e.open(headline)).toBeNull();
      let frozenActs = 0;
      for (let i = 0; i < 40000 && e.state.phase === 'service'; i++) {
        const s = e.state, job = s.guests.some(g => g.stage === 'queued' || g.stage === 'seated' || g.stage === 'ready' || g.stage === 'waiting' && !e.myDish()) || s.dirty.length > 0;
        if (job) {
          e.pause(true);
          const before = e.state.elapsed, logged = owner.length;
          e.update(.25); guideActs(e); e.update(.25);
          expect(e.state.elapsed).toBe(before); // frozen: no time passes, whatever the frame clock does
          frozenActs += owner.length - logged;
        }
        const mine = e.myDish();
        if (mine) {
          const hands = e.state.hands.find(h => h.guestId === mine.id), ratio = mine.cook / DISHES[mine.dish].seconds;
          if (hands && !hands.moved && ratio >= MOVE_AT) e.move(mine.id);
          if (ratio >= 1) e.plate(mine.id);
        }
        const speed = mine ? .5 : 1;
        if (e.paused || e.speed !== speed) e.setSpeed(speed); // also unpauses
        e.update(1 / 30);
      }
      expect(e.state.phase).not.toBe('service');
      expect(frozenActs).toBeGreaterThan(5);
      const replay = runService(start, owner, headline);
      if ('error' in replay) throw new Error(replay.error);
      expect(replay.hash).toBe(stateHash(e.state));
    }
  });
});
