import { describe, expect, it } from 'vitest';
import { levelUnlocks, roadAhead } from '@/management/road-ahead';
import { createRestaurant } from '@/management/types';

describe('road ahead: always a next goal within reach', () => {
  it('a brand-new owner sees the next level, the terrace and research', () => {
    const items = roadAhead(createRestaurant(), { level: 1, xp: 10, nextXp: 30 });
    expect(items.map(i => i.id)).toEqual(['level', 'terrace', 'research']);
    expect(items[0].detail).toMatch(/lettuce seeds/);
    expect(items[1]).toMatchObject({ value: 0, target: 3 });
  });
  it('puts a milestone ready to collect first', () => {
    const s = { ...createRestaurant(), lifetimeServed: 9 };
    const items = roadAhead(s, null);
    expect(items[0]).toMatchObject({ id: 'goal-first-service', ready: true });
    expect(items[0].title).toMatch(/^Collect/);
  });
  it('a day-12 owner with the terrace and research done still has goals', () => {
    const s = { ...createRestaurant(), expanded: true, history: Array(12).fill({}) as never, research: { budget: 40 as const, points: 999 } };
    const items = roadAhead(s, { level: 6, xp: 450, nextXp: 600 });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(i => i.target > 0)).toBe(true);
  });
  it('names what each early level opens, from the tables the server checks', () => {
    expect(levelUnlocks(2).join(' ')).toMatch(/lettuce seeds.*stock.*station upgrades/);
    expect(levelUnlocks(3).join(' ')).toMatch(/garden plot.*chilies seeds.*dough/);
    expect(levelUnlocks(4).join(' ')).toMatch(/scallions.*pickles.*second builder/);
    expect(levelUnlocks(5).join(' ')).toMatch(/garden plot.*mushrooms/);
    expect(levelUnlocks(7)).toEqual([]);
  });
});
