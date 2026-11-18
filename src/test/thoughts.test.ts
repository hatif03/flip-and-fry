import { describe, expect, it } from 'vitest';
import { guestThought } from '@/management/satisfaction';
import { DISHES, type Guest } from '@/management/types';

const PATIENCE = 50;
const guest = (over: Partial<Pick<Guest, 'stage' | 'waiting' | 'happy' | 'dish' | 'price' | 'quality' | 'paid'>> = {}) => ({ stage: 'waiting' as Guest['stage'], waiting: 0, happy: false, dish: 'salad' as const, price: DISHES.salad.fair, quality: 0, paid: false, ...over });

describe('what a guest is thinking', () => {
  it('says nothing to a guest who just arrived or is waiting a normal time at a fair price', () => {
    expect(guestThought(guest({ stage: 'arriving' }), PATIENCE)).toBeNull();
    expect(guestThought(guest({ waiting: 10 }), PATIENCE)).toBeNull();
  });
  it('complains about a long wait once most of the patience is gone', () => {
    expect(guestThought(guest({ waiting: 34 }), PATIENCE)).toBeNull();
    expect(guestThought(guest({ waiting: 36 }), PATIENCE)).toEqual({ text: 'Long wait', tone: 'bad' });
    expect(guestThought(guest({ stage: 'cooking', waiting: 40 }), PATIENCE)?.text).toBe('Long wait');
  });
  it('mentions a high price only in the first moments at the table', () => {
    const dear = guest({ price: Math.round(DISHES.salad.fair * 1.3) });
    expect(guestThought({ ...dear, waiting: 3 }, PATIENCE)).toEqual({ text: 'Too pricey', tone: 'bad' });
    expect(guestThought({ ...dear, waiting: 20 }, PATIENCE)).toBeNull();
  });
  it('praises a perfect plate first, then value, and notes a price a little over fair', () => {
    expect(guestThought(guest({ stage: 'eating', quality: 3, price: 99 }), PATIENCE)?.text).toBe('Perfectly cooked');
    expect(guestThought(guest({ stage: 'eating', price: 18 }), PATIENCE)).toEqual({ text: 'Great value', tone: 'good' });
    expect(guestThought(guest({ stage: 'eating', price: 28 }), PATIENCE)).toEqual({ text: 'A bit pricey', tone: 'bad' });
    expect(guestThought(guest({ stage: 'eating' }), PATIENCE)).toEqual({ text: 'Lovely', tone: 'good' });
  });
  it('shows why a guest left unhappy, and nothing for one who left fed', () => {
    expect(guestThought(guest({ stage: 'leaving', happy: false }), PATIENCE)).toEqual({ text: 'Too long a wait', tone: 'bad' });
    expect(guestThought(guest({ stage: 'leaving', happy: true }), PATIENCE)).toBeNull();
  });
  it('reads the price against the dish the guest actually ordered', () => {
    expect(guestThought(guest({ dish: 'steak', price: DISHES.steak.fair, stage: 'eating' }), PATIENCE)?.text).toBe('Lovely');
    expect(guestThought(guest({ dish: 'salad', price: DISHES.steak.fair, stage: 'eating' }), PATIENCE)?.text).toBe('A bit pricey');
  });
});
