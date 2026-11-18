import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { actionLogSchema, type Action } from '@/management/actions';
import { applyPlanning, stateHash } from '@/management/replay';
import { createRestaurant } from '@/management/types';

/** A live engine that records every accepted planning change, exactly as the Reddit client does. */
function recorder() {
  const e = new RestaurantEngine(undefined, () => 0), log: Action[] = [];
  e.autoRoll = false; e.onAction = a => log.push(a);
  return { e, log };
}
const replayed = (log: Action[]) => { const r = applyPlanning(createRestaurant(), log); if ('error' in r) throw new Error(r.error); return r.state; };

describe('planning actions emitted by the engine', () => {
  it('emit one action per accepted change and none for a refused one', () => {
    const { e, log } = recorder();
    expect(e.place({ id: -1, kind: 'plant', x: 1, z: 1, rotation: 0 })).toBeTruthy(); // overlaps the prep counter: refused
    expect(e.hire('server')).toBeNull(); expect(e.train(10)).toBeNull(); expect(e.train(999)).toBeTruthy();
    expect(log.map(a => a.kind)).toEqual(['hire', 'train']);
  });
  it('are valid against the action schema, so the server accepts what the client sends', () => {
    const { e, log } = recorder();
    e.place({ id: -1, kind: 'lamp', x: 4, z: 6, rotation: 0 }); e.hire('chef'); e.setDish('burger', true, 41); e.rename('Basil\'s Roof'); e.setMusic(true); e.loan();
    expect(actionLogSchema.safeParse(log).success).toBe(true);
  });
  it('reproduce the live engine exactly when the server replays them (the property the whole design rests on)', () => {
    const { e, log } = recorder();
    e.place({ id: -1, kind: 'plant', x: 0, z: 8, rotation: 0 });
    const planter = e.state.furniture[e.state.furniture.length - 1];
    e.place({ ...planter, x: 1, z: 8 }); // move for free
    e.hire('server'); e.hire('chef'); e.train(10); e.train(10); e.dismiss(e.state.staff[e.state.staff.length - 1].id);
    e.setDish('salad', true, 27); e.setDish('burger', false, 38); e.setDish('burger', true, 45);
    e.sell(planter.id); e.rename('Pip\'s Place'); e.setMusic(true);
    const fresh = createRestaurant(); expect(e.state.cash).not.toBe(fresh.cash);
    expect(stateHash(replayed(log))).toBe(stateHash(e.state));
  });
  it('record a purchase with its placeholder id and the replay assigns the same real id', () => {
    const { e, log } = recorder();
    e.place({ id: -1, kind: 'table', x: 5, z: 7, rotation: 0 }); e.place({ id: -1, kind: 'lamp', x: 7, z: 5, rotation: 1 });
    expect(log.map(a => (a.kind === 'place' ? a.item.id : 0))).toEqual([-1, -1]);
    expect(replayed(log).furniture.map(f => f.id)).toEqual(e.state.furniture.map(f => f.id));
  });
  it('claim a goal and take the recovery loan identically', () => {
    const { e, log } = recorder(); e.state.cash = 90; expect(e.loan()).toBeNull();
    const base = createRestaurant(); base.cash = 90;
    const r = applyPlanning(base, log); if ('error' in r) throw new Error(r.error);
    expect(r.state.cash).toBe(e.state.cash); expect(r.state.debt).toBe(600);
  });
  it('are not emitted while the engine is catching up or when no listener is set', () => {
    const { e, log } = recorder(); e.catchingUp = true; e.hire('server'); expect(log).toEqual([]);
    const plain = new RestaurantEngine(undefined, () => 0); expect(() => plain.hire('server')).not.toThrow();
  });
});

describe('adopting server state', () => {
  it('replaces the whole state, validates it and notifies subscribers', () => {
    const e = new RestaurantEngine(undefined, () => 0), seen: number[] = []; e.subscribe(() => seen.push(e.getSnapshot()));
    const park = { ...createRestaurant(), cash: 4321, name: 'From Redis' }; e.adopt(park);
    expect(e.state.cash).toBe(4321); expect(e.state.name).toBe('From Redis'); expect(seen.length).toBeGreaterThan(0);
    expect(() => e.adopt({ ...park, cash: Number.NaN })).toThrow();
  });
  it('stops touching localStorage once detached', () => {
    let writes = 0; const storage = { getItem: () => null, setItem: () => { writes++; } };
    const e = new RestaurantEngine(storage, () => 0); e.hire('server'); const before = writes; expect(before).toBeGreaterThan(0);
    e.detach(); e.hire('chef'); e.suspend(); expect(writes).toBe(before); expect(e.save()).toBe(true);
  });
  it('refuses local-only actions in remote mode instead of diverging from the server', () => {
    const e = new RestaurantEngine(undefined, () => 0); e.remote = { open: async () => null, today: null, result: null, dismissResult() {} };
    const day = e.state.day; e.closeEarly(); e.reset(); expect(e.state.renovation).toBe(false); expect(e.state.day).toBe(day);
  });
});
