import { tableNumber } from '@/management/layout';
import { createRestaurant } from '@/management/types';

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
