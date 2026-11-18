import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';

describe('autoRoll', () => {
  it('stops at the receipt with the doors closed when off', () => {
    const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.open();
    for (let i = 0; i < 2600 && e.state.phase === 'service'; i++) e.update(.1);
    expect(e.state.phase).toBe('planning'); expect(e.state.day).toBe(2); expect(e.state.history).toHaveLength(1);
    expect(e.state.guests).toEqual([]); expect(e.state.dailyChallenges).toEqual([]);
    const cash = e.state.cash, clock = e.state.clock;
    for (let i = 0; i < 500; i++) e.update(.1);
    expect(e.state.cash).toBe(cash); expect(e.state.clock).toBe(clock); expect(e.state.history).toHaveLength(1);
  });
  it('reopens the next day by itself when on (the existing behaviour)', () => {
    const e = new RestaurantEngine(undefined, () => 0); e.open();
    for (let i = 0; i < 2600 && e.state.day === 1; i++) e.update(.1);
    expect(e.state.phase).toBe('service'); expect(e.state.day).toBe(2);
  });
  it('can open the next service on request and play a second day', () => {
    const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.open();
    for (let i = 0; i < 2600 && e.state.phase === 'service'; i++) e.update(.1);
    expect(e.open()).toBeNull();
    for (let i = 0; i < 2600 && e.state.phase === 'service'; i++) e.update(.1);
    expect(e.state.history.map(r => r.day)).toEqual([1, 2]);
  });
  it('tick() does nothing while the doors are closed', () => {
    const e = new RestaurantEngine(undefined, () => 0); const clock = e.state.clock; e.tick(); expect(e.state.clock).toBe(clock);
  });
});
