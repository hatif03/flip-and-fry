import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { runService, stateHash, MAX_SERVICE_TICKS, type Action } from '@/management/replay';
import { createRestaurant, type RestaurantState } from '@/management/types';

const seeded = (seed: number): RestaurantState => ({ ...createRestaurant(), seed });
const SEEDS = Array.from({ length: 40 }, (_, i) => 91273 + i * 7919);

/** A live engine driven exactly like the browser drives it, but with the doors left closed after the receipt. */
function live(state: RestaurantState): RestaurantEngine {
  const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state = structuredClone(state);
  expect(e.open()).toBeNull();
  for (let i = 0; i < MAX_SERVICE_TICKS && e.state.phase === 'service'; i++) e.update(.1);
  return e;
}

describe('deterministic replay', () => {
  it('gives the same receipt hash for the same opening state, many seeds', () => {
    for (const seed of SEEDS) {
      const a = runService(seeded(seed), []), b = runService(seeded(seed), []);
      expect(a.ok && b.ok).toBe(true);
      if (a.ok && b.ok) { expect(a.hash).toBe(b.hash); expect(a.report).toEqual(b.report); }
    }
  });
  it('differs when the seed differs, so the hash is not a constant', () => {
    const hashes = new Set(SEEDS.map(seed => { const r = runService(seeded(seed), []); return r.ok ? r.hash : 'fail'; }));
    expect(hashes.size).toBeGreaterThan(30);
  });
  it('matches a live engine run for the same state (replay parity)', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const state = seeded(seed), replay = runService(state, []), e = live(state);
      expect(replay.ok).toBe(true);
      if (replay.ok) expect(replay.hash).toBe(stateHash(e.state));
    }
  });
  it('never mutates its input', () => {
    const state = seeded(5), before = JSON.stringify(state);
    runService(state, [{ tick: 0, kind: 'hire', role: 'server' }]); expect(JSON.stringify(state)).toBe(before);
  });
  it('closes within the tick cap and produces a real receipt', () => {
    const r = runService(seeded(91273), []);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.ticks).toBeLessThanOrEqual(MAX_SERVICE_TICKS); expect(r.report.day).toBe(1); expect(r.report.served).toBeGreaterThan(0); expect(r.state.phase).toBe('planning'); }
  });
});

describe('planning actions go through the engine', () => {
  it('apply in order and change the result', () => {
    const base = runService(seeded(91273), []), hired = runService(seeded(91273), [{ tick: 0, kind: 'hire', role: 'chef' }, { tick: 0, kind: 'train', id: 10 }]);
    expect(base.ok && hired.ok).toBe(true);
    if (base.ok && hired.ok) { expect(hired.hash).not.toBe(base.hash); expect(hired.report.wages).toBeGreaterThan(base.report.wages); }
  });
  it('rejects overspending, unknown ids and illegal layouts with the engine message', () => {
    const poor = { ...seeded(1), cash: 100 };
    expect(runService(poor, [{ tick: 0, kind: 'hire', role: 'chef' }])).toEqual({ ok: false, error: 'Recruitment costs $150.' });
    expect(runService(seeded(1), [{ tick: 0, kind: 'sell', id: 9999 }]).ok).toBe(false);
    expect(runService(seeded(1), [{ tick: 0, kind: 'place', item: { id: -1, kind: 'plant', x: 1, z: 1, rotation: 0 } }]).ok).toBe(false);
  });
  it('rejects a log with a service tick, a bad shape, or too many entries', () => {
    expect(runService(seeded(1), [{ tick: 5, kind: 'expand' } as unknown as Action]).ok).toBe(false);
    expect(runService(seeded(1), [{ tick: 0, kind: 'dish', dish: 'salad', enabled: true, price: 9999 } as Action]).ok).toBe(false);
    expect(runService(seeded(1), Array.from({ length: 401 }, () => ({ tick: 0, kind: 'loan' }) as Action)).ok).toBe(false);
  });
  it('refuses a client-forged opening state', () => {
    expect(runService({ ...seeded(1), phase: 'service' }, []).ok).toBe(false);
    expect(runService({ ...seeded(1), cash: Number.NaN }, []).ok).toBe(false);
    expect(runService({ ...seeded(1), reputation: 99 }, []).ok).toBe(false);
  });
  it('cannot be funded by a forged action log: cash only comes from the replay', () => {
    const r = runService({ ...seeded(1), cash: 1250 }, [{ tick: 0, kind: 'claim', id: 'first-service' }]);
    expect(r).toEqual({ ok: false, error: 'Complete this milestone first.' });
  });
});
