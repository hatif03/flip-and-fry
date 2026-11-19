import { RestaurantEngine } from '@/management/engine';
import { billsTonight, earnedSoFar, tonight } from '@/management/bills';
import { reputationLine } from '@/management/RedditLayer';

function runNight(e: RestaurantEngine) { e.autoRoll = false; expect(e.open()).toBeNull(); for (let i = 0; i < 4000 && e.state.phase === 'service'; i++) e.tick(); }

describe('the bills shown during service are the bills the engine charges at closing', () => {
  it('matches the closing report: wages, rent and the loan instalment', () => {
    const e = new RestaurantEngine(); e.state.debt = 200; const bills = billsTonight(e.state);
    runNight(e); const report = e.state.history[e.state.history.length - 1];
    expect(report).toBeDefined();
    expect(bills.wages).toBe(report.wages); expect(bills.rent).toBe(report.rent); expect(bills.loan).toBe(report.debtPayment);
  });
  it('shows a quiet night as a loss: net is earned minus bills, and the covered share stays between 0 and 1', () => {
    const e = new RestaurantEngine(); const t0 = tonight(e.state);
    expect(t0.earned).toBe(0); expect(t0.net).toBe(-t0.bills); expect(t0.covered).toBe(0);
    e.state.totals.revenue = t0.bills * 3; expect(tonight(e.state).covered).toBe(1);
    e.state.totals.revenue = 100; e.state.totals.tips = 20; e.state.totals.ingredients = 40; expect(earnedSoFar(e.state)).toBe(80);
  });
  it('profit at closing equals the live net when nothing else (research) is taken', () => {
    const e = new RestaurantEngine(); runNight(e); const r = e.state.history[e.state.history.length - 1];
    expect(r.profit).toBeCloseTo(r.revenue + r.tips - r.ingredients - r.wages - r.rent - r.debtPayment - r.research, 5);
  });
});

describe('the reputation line on the result card', () => {
  it('says whether tomorrow is busier, quieter or the same', () => {
    expect(reputationLine(3.5, 3.7)).toMatch(/more guests tomorrow/); expect(reputationLine(3.5, 3.2)).toMatch(/Fewer guests tomorrow/); expect(reputationLine(3.5, 3.52)).toMatch(/holds at 3\.5/);
  });
});
