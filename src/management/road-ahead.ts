import { GOALS } from './engine';
import { CROPS, CROP_IDS, RECIPES, GOODS, plotsFor } from './crops';
import { RESEARCH, researched, type RestaurantState } from './types';
import { money } from './format';

/**
 * Road ahead: the next three things worth working toward, so there is always a goal within a few days (plan v5, 5.9). This first
 * version reads only what exists today: milestones, the player level's unlocks, the east terrace and research. Pure, so it is tested.
 */
export type RoadItem = { id: string; title: string; detail: string; value: number; target: number; ready?: boolean };
export type Level = { level: number; xp: number; nextXp: number | null };

/** What reaching a player level opens, in words, from the same tables the server checks. */
export function levelUnlocks(level: number): string[] {
  const out: string[] = [];
  if (plotsFor(level) > plotsFor(level - 1)) out.push('a garden plot');
  for (const c of CROP_IDS) if (CROPS[c].level === level && level > 1) out.push(`${CROPS[c].name.toLowerCase()} seeds`);
  for (const g of GOODS) if (RECIPES[g].level === level) out.push(`${RECIPES[g].name.toLowerCase()} in the workshop`);
  if (level === 2) out.push('station upgrades');
  if (level === 4) out.push('a second builder and level-3 stations');
  return out;
}

export function roadAhead(state: RestaurantState, level?: Level | null): RoadItem[] {
  const items: RoadItem[] = [];
  const open = GOALS.filter(g => !state.claimed.includes(g.id)).map(g => ({ g, value: Math.min(g.target, g.value(state)) }));
  for (const { g, value } of open.filter(x => x.value >= x.g.target)) items.push({ id: `goal-${g.id}`, title: `Collect: ${g.title}`, detail: `${g.text}. Done: ${money(g.reward)} is waiting.`, value, target: g.target, ready: true });
  if (level?.nextXp) {
    const next = level.level + 1, opens = levelUnlocks(next);
    if (opens.length) items.push({ id: 'level', title: `Level ${next}`, detail: `Opens ${opens.join(', ')}. Earn XP from stars, harvests and orders.`, value: level.xp, target: level.nextXp });
  }
  if (!state.expanded) items.push({ id: 'terrace', title: 'The east terrace', detail: state.history.length < 3 ? 'Forty more tiles of roof. Opens after 3 services, for $900.' : 'Forty more tiles of roof, for $900 in Build.', value: Math.min(3, state.history.length), target: 3, ready: state.history.length >= 3 && state.cash >= 900 });
  const study = RESEARCH.find(r => !researched(state, r.id));
  if (study) items.push({ id: 'research', title: `Research: ${study.title}`, detail: state.research.budget ? study.text : `${study.text} Set a nightly research budget below.`, value: Math.min(study.at, state.research.points), target: study.at });
  const closest = open.filter(x => x.value < x.g.target).sort((a, b) => b.value / b.g.target - a.value / a.g.target)[0];
  if (closest) items.push({ id: `goal-${closest.g.id}`, title: closest.g.title, detail: `${closest.g.text}. Pays ${money(closest.g.reward)}.`, value: closest.value, target: closest.g.target });
  return items.slice(0, 3);
}
