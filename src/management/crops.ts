import { mixSeed } from './daily-headline';
import { REGULAR_NAMES, type Dish } from './types';

/**
 * The rooftop garden and what grows in it. Pure data and pure functions, so the engine (which spends the pantry at night), the server
 * (which runs the timers) and the screens (which show the countdowns) all read the same numbers.
 */
export const CROP_IDS = ['tomato', 'basil', 'lettuce', 'chili', 'scallion', 'mushroom'] as const;
export type CropId = typeof CROP_IDS[number];
export type CropInfo = { name: string; /** Seconds from planting to ready. */ seconds: number; /** Units harvested. */ yield: number; seed: number; /** What a unit is worth at the order board. */ value: number; xp: number; level: number; color: string };
export const CROPS: Record<CropId, CropInfo> = {
  tomato: { name: 'Tomatoes', seconds: 20 * 60, yield: 3, seed: 4, value: 6, xp: 4, level: 1, color: '#d65a3a' },
  basil: { name: 'Basil', seconds: 40 * 60, yield: 3, seed: 4, value: 7, xp: 5, level: 1, color: '#6f9a4a' },
  lettuce: { name: 'Lettuce', seconds: 60 * 60, yield: 3, seed: 5, value: 8, xp: 6, level: 2, color: '#9ac26a' },
  chili: { name: 'Chilies', seconds: 3 * 3600, yield: 2, seed: 6, value: 12, xp: 10, level: 3, color: '#c9382a' },
  scallion: { name: 'Scallions', seconds: 6 * 3600, yield: 4, seed: 6, value: 10, xp: 14, level: 4, color: '#8fb36a' },
  mushroom: { name: 'Mushrooms', seconds: 12 * 3600, yield: 4, seed: 8, value: 14, xp: 20, level: 5, color: '#c9a77a' },
};
/** Watering once takes this share off what is left. */
export const WATER_CUT = .25;
/** A crop left unpicked this long after it is ready gives half the yield (rounded up); the plot is never lost. */
export const WILT_AFTER = 24 * 3600;
export const wiltedYield = (crop: CropId): number => Math.ceil(CROPS[crop].yield / 2);

/** What a dish takes from the pantry. A dish that finds all of it in stock costs nothing for ingredients and tips 15% more. */
export const DISH_INGREDIENTS: Record<Dish, readonly CropId[]> = {
  salad: ['lettuce', 'tomato'], burger: ['lettuce', 'tomato'], bruschetta: ['tomato', 'basil'], soup: ['tomato', 'scallion'], flatbread: ['basil', 'mushroom'], skewers: ['chili', 'scallion'],
  steak: ['mushroom', 'chili'], fries: ['scallion'], ramen: ['scallion', 'mushroom'], dumplings: ['scallion', 'chili'], stirfry: ['scallion', 'chili'], friedrice: ['scallion', 'tomato'],
};
export const GROWN_TIP = 1.15;
export type Pantry = Partial<Record<CropId, number>>;
export const inStock = (pantry: Pantry, dish: Dish): boolean => DISH_INGREDIENTS[dish].every(c => (pantry[c] ?? 0) >= 1);
export const pantryCount = (pantry: Pantry): number => CROP_IDS.reduce((sum, c) => sum + (pantry[c] ?? 0), 0);

/** Experience points needed for each level (index 0 is level 1). Level gates plots, crops, the second builder and station upgrades. */
export const LEVEL_XP = [0, 30, 80, 150, 260, 400, 600, 850, 1150, 1500] as const;
export const MAX_LEVEL = LEVEL_XP.length;
export const levelFor = (xp: number): number => { let level = 1; for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) level = i + 1; return level; };
export const nextLevelAt = (xp: number): number | null => { const level = levelFor(xp); return level >= MAX_LEVEL ? null : LEVEL_XP[level]; };
export const plotsFor = (level: number): number => level >= 5 ? 4 : level >= 3 ? 3 : 2;
export const BUILDERS_AT_LEVEL_4 = 2;

/** XP a service earns at the lock: stars count most, then guests served and the best hustle chain. */
export const serviceXp = (stars: number, served: number, chain: number): number => stars * 15 + Math.floor(served / 2) + Math.min(10, Math.floor(chain / 3));

// ---- the order board ------------------------------------------------------------------------------------------------------------------
/** Three neighbors a day ask for produce. From the date and the player's level only, so a player sees the same board all day. */
export type Order = { index: number; name: string; species: 'mouse' | 'rabbit' | 'bear' | 'crocodile'; wants: { crop: CropId; n: number }[]; reward: number; xp: number };
const SPECIES_LIST = ['mouse', 'rabbit', 'bear', 'crocodile'] as const;
export function ordersFor(date: string, level: number): Order[] {
  const unlocked = CROP_IDS.filter(c => CROPS[c].level <= level);
  let seed = 0; for (let i = 0; i < date.length; i++) seed = (Math.imul(seed, 31) + date.charCodeAt(i)) >>> 0;
  const roll = (n: number): number => { seed = mixSeed(seed + 0x9e3779b9); return seed % n; };
  return [0, 1, 2].map(index => {
    const first = unlocked[roll(unlocked.length)], second = unlocked[roll(unlocked.length)];
    const wants = first === second ? [{ crop: first, n: 2 + roll(2) }] : [{ crop: first, n: 1 + roll(2) }, { crop: second, n: 1 + roll(2) }];
    const worth = wants.reduce((sum, w) => sum + CROPS[w.crop].value * w.n, 0);
    return { index, name: REGULAR_NAMES[roll(REGULAR_NAMES.length)], species: SPECIES_LIST[roll(4)], wants, reward: Math.round(worth * 1.5), xp: 10 + wants.reduce((sum, w) => sum + w.n, 0) * 2 };
  });
}

// ---- builders and station upgrades ------------------------------------------------------------------------------------------------------
/** The stations a builder can upgrade. A level 2 station is 15% faster for the team and tips 5% more; level 3 is 30% and 10%. */
export const UPGRADABLE = ['prep', 'grill', 'pot', 'wok', 'oven'] as const;
export const STATION_SPEED = .15, STATION_TIP = .05, MAX_STATION_LEVEL = 3;
export type UpgradeStep = { /** Share of the piece's price. */ price: number; seconds: number; /** The restaurant level needed. */ level: number };
export const UPGRADE_STEPS: Record<2 | 3, UpgradeStep> = { 2: { price: .5, seconds: 30 * 60, level: 2 }, 3: { price: .9, seconds: 3 * 3600, level: 4 } };
/** One builder, two from level 4. */
export const buildersFor = (level: number): number => level >= 4 ? 2 : 1;
/** Finishing a job at once costs two dollars a minute left, at least ten, and can be done once a day. */
export const rushCost = (msLeft: number): number => Math.max(10, Math.ceil(msLeft / 60000) * 2);
