import type { HeadlineId } from './daily-headline';
import { DISHES, DISH_IDS, capacity, comfort, type RestaurantState } from './types';

/**
 * What to do about today's headline, in one line, with the panel that does it (plan v5, 4.5). Every headline has a tip; a test checks it.
 * The advice reads the restaurant as it stands, so it says "add a table" only to a room that needs one.
 */
export type HeadlineTip = { text: string; panel?: 'build' | 'menu' | 'team' };

export function headlineTip(id: HeadlineId, s: RestaurantState): HeadlineTip {
  const on = DISH_IDS.filter(d => s.menu[d].enabled), servers = s.staff.filter(m => m.role === 'server').length;
  switch (id) {
    case 'quiet': return { text: 'Patient guests and slower arrivals: a good night to try a new dish.', panel: 'menu' };
    case 'rush': return capacity(s) < 8 ? { text: 'Guests arrive faster: another table keeps the door moving.', panel: 'build' }
      : servers < 2 ? { text: 'Guests arrive faster: a second server keeps up.', panel: 'team' } : { text: 'Guests arrive faster: seat them quickly and keep the combo going.' };
    case 'rain': return comfort(s) < 60 ? { text: 'Comfort counts more for tips tonight: add a plant or a lantern.', panel: 'build' } : { text: 'Comfort counts more tonight, and your room is cosy: seat guests at ✦ tables.' };
    case 'supplier': return on.some(d => DISHES[d].station === 'grill') ? { text: 'Grill ingredients cost 50% more: raise grill prices or switch a grill dish off.', panel: 'menu' } : { text: 'Grill ingredients cost more tonight, and you serve none of them.' };
    case 'critic': return { text: 'More VIPs, and one VIP walkout caps the night at two stars: rush their orders and keep a Free meal for one.' };
    case 'payday': return on.every(d => s.menu[d].price <= DISHES[d].fair) ? { text: 'Guests mind high prices less: prices can go up about 10% tonight.', panel: 'menu' } : { text: 'Guests mind high prices less tonight.' };
    case 'inspection': return { text: 'Dirty seats at closing cost rating: clear tables in the last minute.' };
  }
}
