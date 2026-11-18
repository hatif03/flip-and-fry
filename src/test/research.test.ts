import { describe, expect, it } from 'vitest';
import { OUTFIT_COLORS } from '@/game/chef-outfit';
import { actionLogSchema, type Action } from '@/management/actions';
import { RestaurantEngine } from '@/management/engine';
import { createDailyHeadline } from '@/management/daily-headline';
import { applyPlanning, runService, stateHash } from '@/management/replay';
import { OUTFIT_IDS, RESEARCH, RESEARCH_GATE, createRestaurant, restaurantSchema, researched } from '@/management/types';

const headline = createDailyHeadline('2026-12-09');
const engine = () => { const e = new RestaurantEngine(undefined, () => 0); e.autoRoll = false; return e; };

describe('the research budget', () => {
  it('is set between services and refused while the doors are open', () => {
    const e = engine(); expect(e.setResearch(20)).toBeNull(); expect(e.state.research.budget).toBe(20);
    e.state.cash = 5000; expect(e.open(headline)).toBeNull(); expect(e.setResearch(40)).toBe('Set the research budget between services.');
  });
  it('is taken at closing like wages, and turns into points and a smaller profit', () => {
    const none = runService(createRestaurant(), [], headline), spend = createRestaurant(); spend.research.budget = 40;
    const paid = runService(spend, [], headline); if ('error' in none || 'error' in paid) throw new Error('service failed');
    expect(paid.state.research.points).toBe(40); expect(paid.report.research).toBe(40); expect(none.report.research).toBe(0);
    expect(paid.report.profit).toBe(none.report.profit - 40); expect(paid.state.cash).toBe(none.state.cash - 40);
  });
  it('is skipped, not borrowed, when the register cannot cover it after wages', () => {
    const e = engine(); e.state.research.budget = 40; e.state.phase = 'service'; e.state.elapsed = 150; e.state.guests = []; e.state.dirty = []; e.state.cash = 100;
    e.tick(); expect(e.state.history).toHaveLength(1);
    expect(e.state.history[0].research).toBe(0); expect(e.state.research.points).toBe(0); expect(e.state.cash).toBe(100 - e.state.history[0].wages - e.state.history[0].rent);
  });
  it('leaves the calibrated nights alone when the budget is none', () => {
    const r = runService(createRestaurant(), [], headline); if ('error' in r) throw new Error(r.error);
    expect(r.state.research).toEqual({ budget: 0, points: 0 });
  });
});

describe('what research opens', () => {
  it('keeps the stock pot and the bench off the shop floor until the points are there', () => {
    const e = engine(); e.state.cash = 5000;
    const pot = RESEARCH.find(r => r.id === 'pot')!;
    expect(e.place({ id: -1, kind: 'pot', x: 5, z: 1, rotation: 0 })).toBe(`Research the stock pot first: ${pot.at} points, you have 0.`);
    e.state.research.points = pot.at; expect(e.place({ id: -1, kind: 'pot', x: 5, z: 1, rotation: 0 })).toBeNull();
    expect(e.place({ id: -1, kind: 'bench', x: 0, z: 8, rotation: 0 })).toMatch(/^Research the window bench first/);
  });
  it('never takes away a piece already placed: moving a pot needs no study', () => {
    const e = engine(); e.state.cash = 5000; e.state.research.points = 100; e.place({ id: -1, kind: 'pot', x: 5, z: 1, rotation: 0 });
    const pot = e.state.furniture.find(f => f.kind === 'pot')!; e.state.research.points = 0;
    expect(e.place({ ...pot, x: 6 })).toBeNull();
  });
  it('lists only furniture that exists as the gated pieces, and leaves the wok and the oven for sale', () => {
    expect(Object.keys(RESEARCH_GATE).sort()).toEqual(['bench', 'pot']); expect(RESEARCH_GATE.wok).toBeUndefined(); expect(RESEARCH_GATE.oven).toBeUndefined();
  });
  it('opens the staff cloth colours only once studied, and keeps them in the saved park', () => {
    const e = engine(); expect(e.setOutfit('hat', 'gold')).toBe('Research the staff cloth first.');
    e.state.research.points = 360; expect(researched(e.state, 'cloth')).toBe(true);
    expect(e.setOutfit('hat', 'gold')).toBeNull(); expect(e.setOutfit('apron', 'dusk')).toBeNull();
    expect(restaurantSchema.parse(structuredClone(e.state)).outfit).toEqual({ hat: 'gold', apron: 'dusk' });
  });
  it('uses the same colours as the Test Kitchen wardrobe', () => { expect([...OUTFIT_IDS]).toEqual(OUTFIT_COLORS.map(c => c.id)); });
});

describe('research in the action log', () => {
  const log: Action[] = [{ tick: 0, kind: 'research', budget: 20 }];
  it('is valid, replays to the live engine\'s state, and refuses a budget that is not on the menu', () => {
    expect(actionLogSchema.safeParse(log).success).toBe(true); expect(actionLogSchema.safeParse([{ tick: 0, kind: 'research', budget: 25 }]).success).toBe(false);
    const e = engine(); const seen: Action[] = []; e.onAction = a => seen.push(a); e.setResearch(20);
    const r = applyPlanning(createRestaurant(), seen); if ('error' in r) throw new Error(r.error); expect(stateHash(r.state)).toBe(stateHash(e.state));
  });
  it('refuses an outfit action until the cloth is studied, so a forged log cannot dress the staff early', () => {
    expect(applyPlanning(createRestaurant(), [{ tick: 0, kind: 'outfit', part: 'hat', color: 'gold' }])).toMatchObject({ ok: false, error: 'Research the staff cloth first.' });
  });
  it('loads in saves that have no research yet', () => {
    const old = JSON.parse(JSON.stringify(createRestaurant())); delete old.research; delete old.outfit;
    const parsed = restaurantSchema.parse(old); expect(parsed.research).toEqual({ budget: 0, points: 0 }); expect(parsed.outfit).toEqual({ hat: 'cream', apron: 'tomato' });
  });
});
