import { describe, expect, it } from 'vitest';
import { bareBot, cozyBot, datesFrom, helperPolicy, playWithHelper, runBot } from '@/management/bots';
import { createDailyHeadline } from '@/management/daily-headline';
import { MAX_SERVICE_ACTIONS, applyPlanning, isServiceAction, runService, type Action } from '@/management/replay';
import { createRestaurant } from '@/management/types';

const DATES = datesFrom('2026-12-09', 8);
const ok = (r: ReturnType<typeof runService>) => { if ('error' in r) throw new Error(r.error); return r; };

describe('owner actions replay exactly', () => {
  it('a night played with the helper replays to the same state, on every judging day and for every kitchen', () => {
    for (const date of DATES) for (const bot of [bareBot, cozyBot]) {
      const run = playWithHelper(bot, date), replay = ok(run.replay);
      expect(replay.hash, `${bot.name} ${date}`).toBe(run.liveHash); expect(replay.rejected, `${bot.name} ${date}`).toBe(0);
      expect(run.actions.filter(isServiceAction).length, `${bot.name} ${date}`).toBeGreaterThan(0);
    }
  });
  it('the recorded actions are valid, ordered and stamped with real ticks', () => {
    const run = playWithHelper(cozyBot, '2026-12-11'), owner = run.actions.filter(isServiceAction);
    expect(owner.every(a => Number.isInteger(a.tick) && a.tick >= 1)).toBe(true);
    for (let i = 1; i < owner.length; i++) expect(owner[i].tick).toBeGreaterThanOrEqual(owner[i - 1].tick);
    expect(new Set(owner.map(a => a.kind)).has('claimTicket')).toBe(true); expect(new Set(owner.map(a => a.kind)).has('cook')).toBe(true);
  });
  it('helping changes the night: more guests are served than with the team alone', () => {
    let helped = 0, alone = 0;
    for (const date of DATES) { helped += ok(playWithHelper(bareBot, date).replay).report.served; alone += ok(runBot(bareBot, date).result).report.served; }
    expect(helped).toBeGreaterThan(alone);
  });
  it('perfect plating and comps are worth stars: the helped plain room clears hard nights the lone plain room misses', () => {
    let helpedGoals = 0, aloneGoals = 0;
    for (const date of DATES) { helpedGoals += ok(playWithHelper(bareBot, date).replay).report.rating >= 4 ? 1 : 0; aloneGoals += ok(runBot(bareBot, date).result).report.rating >= 4 ? 1 : 0; }
    expect(helpedGoals).toBeGreaterThanOrEqual(aloneGoals);
  });
});

describe('what the server accepts in an owner log', () => {
  const base = () => { const p = applyPlanning(createRestaurant(), []); if ('error' in p) throw new Error(p.error); return p.state; };
  const headline = createDailyHeadline('2026-12-09');
  it('ignores an action the engine refuses and counts it, without changing the night', () => {
    const plain = ok(runService(base(), [], headline));
    const stale = ok(runService(base(), [{ tick: 5, kind: 'claimTicket', guestId: 12345 }, { tick: 9, kind: 'cook', guestId: 12345 }, { tick: 20, kind: 'comp', guestId: 999 }], headline));
    expect(stale.rejected).toBe(3); expect(stale.hash).toBe(plain.hash);
  });
  it('rejects a log that is out of order or has too many owner actions', () => {
    const out: Action[] = [{ tick: 50, kind: 'priority', guestId: 1 }, { tick: 20, kind: 'priority', guestId: 1 }];
    expect(runService(base(), out, headline)).toEqual({ ok: false, error: 'Owner actions are out of order.' });
    const many: Action[] = Array.from({ length: MAX_SERVICE_ACTIONS + 1 }, (_, i) => ({ tick: 10 + i, kind: 'priority', guestId: 1 }));
    expect(runService(base(), many, headline)).toEqual({ ok: false, error: 'Too many owner actions for one service.' });
  });
  it('rejects a tick outside the service and a tick of zero for a pass action', () => {
    expect(runService(base(), [{ tick: 99999, kind: 'comp', guestId: 1 }], headline).ok).toBe(false);
    expect(runService(base(), [{ tick: 0, kind: 'comp', guestId: 1 } as unknown as Action], headline).ok).toBe(false);
  });
  it('does not let owner actions sneak into the planning step', () => {
    expect(applyPlanning(createRestaurant(), [{ tick: 3, kind: 'comp', guestId: 1 }])).toEqual({ ok: false, error: 'Owner actions at the pass belong to an open service.' });
  });
  it('planning actions still run before the doors open, and owner actions after', () => {
    const run = playWithHelper(cozyBot, '2026-12-09'), kinds = run.actions.map(a => a.tick === 0);
    expect(kinds.indexOf(false)).toBeGreaterThan(kinds.lastIndexOf(true)); // every planning action precedes every owner action
    expect(ok(run.replay).state.furniture.length).toBeGreaterThan(createRestaurant().furniture.length);
  });
  it('a perfectly timed owner cannot cheat quality: the log carries no quality, only when they plated', () => {
    const run = playWithHelper(bareBot, '2026-12-09');
    for (const a of run.actions) expect(Object.keys(a).sort()).not.toContain('quality');
    // Plating a tick early or late changes the replayed night, because quality comes from the simulated cooking time alone.
    const last = run.actions.map(a => a.kind).lastIndexOf('cook'), shifted = run.actions.map((a, i) => i === last ? ({ ...a, tick: a.tick + 4 } as Action) : a);
    const early = ok(runService(createRestaurant(), shifted, createDailyHeadline('2026-12-09')));
    expect(early.hash === ok(run.replay).hash).toBe(false);
  });
  it('helperPolicy never throws on an idle engine', () => { expect(() => helperPolicy({ state: createRestaurant() } as never)).not.toThrow(); });
});
