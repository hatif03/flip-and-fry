import { describe, expect, it } from 'vitest';
import { WEEK_TIERS, weekStars, keys } from '@/server/core/game';
import { FakeStore } from './fake-store';

const run = (stars: number) => JSON.stringify({ stars: { stars } });
async function seed(store: FakeStore, uid: string, date: string, stars: number) { await store.hSet(keys.runs(date), { [uid]: run(stars) }); }

describe('the weekly rank', () => {
  it('starts empty on Monday and counts only this UTC week (Monday to Sunday)', async () => {
    const s = new FakeStore(); await seed(s, 'u', '2026-12-06', 3); // Sunday of the week before
    expect(await weekStars(s, 'u', '2026-12-07')).toEqual({ stars: 0, tier: null, next: { name: 'Bronze', at: 1 } });
    await seed(s, 'u', '2026-12-07', 2); await seed(s, 'u', '2026-12-09', 1);
    expect(await weekStars(s, 'u', '2026-12-09')).toMatchObject({ stars: 3, tier: 'Bronze', next: { name: 'Silver', at: 6 } });
  });
  it('climbs Bronze, Silver, Gold, then has no next tier; Sunday belongs to the week that began on the Monday before', async () => {
    const s = new FakeStore(); for (const [d, n] of [['2026-12-07', 3], ['2026-12-08', 3], ['2026-12-09', 3], ['2026-12-10', 3], ['2026-12-13', 3]] as const) await seed(s, 'u', d, n);
    expect(await weekStars(s, 'u', '2026-12-13')).toEqual({ stars: 15, tier: 'Gold', next: null });
    expect(await weekStars(s, 'u', '2026-12-09')).toMatchObject({ stars: 9, tier: 'Silver' });
    expect(WEEK_TIERS.map(t => t.name)).toEqual(['Bronze', 'Silver', 'Gold']);
  });
  it('belongs to one player: another player has none', async () => {
    const s = new FakeStore(); await seed(s, 'u', '2026-12-09', 3); expect((await weekStars(s, 'other', '2026-12-09')).stars).toBe(0);
  });
});
