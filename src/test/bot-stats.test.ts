import { describe, it } from 'vitest';
import { BOTS, datesFrom, runBot } from '@/management/bots';
import { evaluateStars } from '@/management/stars';

/** Calibration dump, not a gate: `VITE_BOT_STATS=1 npx vitest run src/test/bot-stats.test.ts` prints per-headline numbers and star rates. */
describe.skipIf(!import.meta.env.VITE_BOT_STATS)('bot statistics', () => {
  it('prints', () => {
    const rows: Record<string, number[]> = {};
    for (const date of datesFrom('2026-12-09', 28)) for (const bot of BOTS) {
      const r = runBot(bot, date);
      if ('error' in r.result) throw new Error(r.result.error);
      const { report, state } = r.result, h = state.headline!, s = evaluateStars(report, h, null);
      const key = `${r.headline.id.padEnd(10)} ${bot.name.padEnd(7)}`;
      (rows[key] ??= []).push(report.served, report.missed, report.profit, report.rating, h.dirtyAtClose, s.stars >= 1 ? 1 : 0, s.challenges, s.stars);
    }
    const col = (v: number[], i: number) => v.filter((_, j) => j % 8 === i), mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const lines = ['headline   bot     served missed profit rating dirty  1★rate chall  stars'];
    for (const [k, v] of Object.entries(rows).sort()) lines.push([k, ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => mean(col(v, i)).toFixed(i === 5 ? 2 : 1).padStart(6))].join(' '));
    // Vitest hides console output for passing tests, so the table is delivered as the failure message.
    throw new Error('\n' + lines.join('\n'));
  });
});
