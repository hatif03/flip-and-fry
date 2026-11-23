import { billsShare, staffWage, type RestaurantState } from './types';
import { money } from './format';

/** What closing time will take from the till tonight: wages, rent and the loan instalment. The engine charges exactly these (see closeService). */
export function billsTonight(s: Pick<RestaurantState, 'staff' | 'expanded' | 'debt' | 'shift'>): { wages: number; rent: number; loan: number; total: number } {
  const share = billsShare(s), wages = Math.round(s.staff.reduce((sum, staff) => sum + staffWage(staff), 0) * share), rent = Math.round((s.expanded ? 50 : 30) * share), loan = Math.min(Math.round(30 * share), s.debt);
  return { wages, rent, loan, total: wages + rent + loan };
}

/** Sales and tips minus ingredients so far tonight: the money that is there to pay the bills. */
export const earnedSoFar = (s: Pick<RestaurantState, 'totals'>): number => s.totals.revenue + s.totals.tips - s.totals.ingredients;

/** How tonight stands against the bills: how much is covered, and what profit would be if the doors closed now. */
export function tonight(s: Pick<RestaurantState, 'staff' | 'expanded' | 'debt' | 'totals' | 'shift'>): { bills: number; earned: number; net: number; covered: number } {
  const bills = billsTonight(s).total, earned = earnedSoFar(s);
  return { bills, earned, net: earned - bills, covered: bills > 0 ? Math.max(0, Math.min(1, earned / bills)) : 1 };
}

/** What the till means right now, in words: how far from paying tonight's bills, or the profit once they are paid. Never a bare minus sign. */
export const moneyLine = (net: number): string => net >= 0 ? `Profit so far +${money(net)}` : `${money(-net)} to break even`;
