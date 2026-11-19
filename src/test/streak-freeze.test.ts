import { describe, expect, it } from 'vitest';
import { markPlayed, streakState } from '@/server/core/game';
import { shiftDate } from '@/management/daily-headline';
import { FakeStore } from './fake-store';

const T = '2026-12-09';
async function play(store: FakeStore, days: number[]) { for (const d of days) await markPlayed(store, 'u', shiftDate(T, -d)); }
const run = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => from - i); // days ago, from `from` down to `to`

describe('streak freezes', () => {
  it('behave like the plain streak below seven days: a miss ends it', async () => {
    const s = new FakeStore(); await play(s, [...run(5, 3), ...run(1, 0)]);
    expect(await streakState(s, 'u', T)).toEqual({ streak: 2, freezes: 0 });
  });
  it('earn one at seven played days in a row, and spend it on a single missed day', async () => {
    const s = new FakeStore(); await play(s, [...run(9, 3), ...run(1, 0)]); // 7 played, miss day 2, then 2 played
    expect(await streakState(s, 'u', T)).toEqual({ streak: 9, freezes: 0 });
  });
  it('keep the streak alive through today being unplayed, and do not spend anything on it', async () => {
    const s = new FakeStore(); await play(s, run(7, 1));
    expect(await streakState(s, 'u', T)).toEqual({ streak: 7, freezes: 1 });
  });
  it('do not save a streak from two missed days in a row with only one freeze', async () => {
    const s = new FakeStore(); await play(s, [...run(10, 4), 0]); // 7 played, miss 3 and 2 and 1, then today
    expect(await streakState(s, 'u', T)).toEqual({ streak: 1, freezes: 0 });
  });
  it('hold at most two, however long the streak', async () => {
    const s = new FakeStore(); await play(s, run(30, 0)); expect(await streakState(s, 'u', T)).toEqual({ streak: 31, freezes: 2 });
  });
  it('cannot be forged: only played-day bits matter, and another player has none', async () => {
    const s = new FakeStore(); await play(s, run(8, 1)); expect(await streakState(s, 'someone-else', T)).toEqual({ streak: 0, freezes: 0 });
  });
});
