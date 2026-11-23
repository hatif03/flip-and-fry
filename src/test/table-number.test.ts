import { cozyTiles, tableNumber } from '@/management/layout';
import { HEIGHT, createRestaurant, isCozy } from '@/management/types';

describe('table numbers: the pass and the plates in the room use the same count', () => {
  it('numbers tables from 1 in their order, and renumbers when one is sold', () => {
    const s = createRestaurant(), tables = s.furniture.filter(f => f.kind === 'table');
    expect(tables.map(t => tableNumber(s.furniture, t.id))).toEqual([1, 2, 3]);
    const rest = s.furniture.filter(f => f.id !== tables[0].id);
    expect(tableNumber(rest, tables[1].id)).toBe(1);
    expect(tableNumber(rest, tables[0].id)).toBe(0);
    expect(tableNumber(s.furniture, s.furniture.find(f => f.kind === 'grill')!.id)).toBe(0);
  });
});

describe('the cosy aura in Build matches the rule the engine uses', () => {
  it('marks exactly the tiles where a table would be cosy', () => {
    const s = createRestaurant(), decor = s.furniture.filter(f => f.kind !== 'table'), tiles = cozyTiles(decor, 10);
    for (let x = 0; x < 10; x++) for (let z = 0; z < HEIGHT; z++) {
      const probe = { id: 999, kind: 'table' as const, x, z, rotation: 0 };
      expect(tiles.has(`${x}:${z}`)).toBe(isCozy(decor, probe));
    }
    expect(tiles.size).toBeGreaterThan(0);
  });
});
