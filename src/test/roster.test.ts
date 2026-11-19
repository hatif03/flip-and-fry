import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { createDailyHeadline } from '@/management/daily-headline';
import { applyPlanning, runService } from '@/management/replay';
import { createRestaurant, type RestaurantState } from '@/management/types';

const headline = createDailyHeadline('2026-12-09');
const engine = (mutate: (s: RestaurantState) => void = () => undefined): RestaurantEngine => { const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; e.state = createRestaurant(); mutate(e.state); return e; };

describe('a chef who specialises', () => {
  it('can be given a station that exists, and only a chef, and only while planning', () => {
    const e = engine(); expect(e.assign(10, 'grill')).toBeNull(); expect(e.state.assignments['10']).toBe('grill');
    expect(e.assign(11, 'grill')).toMatch(/Only a chef/); expect(e.assign(10, 'wok')).toMatch(/Build that station first/);
    expect(e.assign(10, null)).toBeNull(); expect(e.state.assignments['10']).toBeUndefined();
    expect(e.open(headline)).toBeNull(); expect(e.assign(10, 'prep')).toMatch(/before opening/);
  });
  it('is forgotten when the chef leaves, and replays like any planning action', () => {
    const e = engine(s => { s.staff.push({ ...s.staff[0], id: 50, name: 'Extra' }); }); e.assign(50, 'prep'); expect(e.dismiss(50)).toBeNull(); expect(e.state.assignments['50']).toBeUndefined();
    const planned = applyPlanning(createRestaurant(), [{ tick: 0, kind: 'assign', id: 10, station: 'prep' }]); if ('error' in planned) throw new Error(planned.error); expect(planned.state.assignments).toEqual({ '10': 'prep' });
  });
  it('a specialist cooks its own dishes faster, so the same night serves more or earns at least as much', () => {
    const base = runService(createRestaurant(), [], headline), special = runService(createRestaurant(), [{ tick: 0, kind: 'assign', id: 10, station: 'prep' }], headline);
    if ('error' in base || 'error' in special) throw new Error('failed'); expect(special.hash).not.toBe(base.hash); expect(special.report.served).toBeGreaterThanOrEqual(base.report.served - 1);
  });
});
