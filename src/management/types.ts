import { z } from 'zod';
import { headlineEffects, headlineId } from './daily-headline';

// Zod validates required fields at runtime; preserve them in the legacy non-strict TS project too.
type Validated<T> = T extends (infer U)[] ? Validated<U>[] : T extends object ? { [K in keyof T]-?: Validated<T[K]> } : T;

export const furnitureKind = z.enum(['table', 'prep', 'grill', 'pot', 'wok', 'oven', 'plant', 'divider', 'lamp']);
export type FurnitureKind = z.infer<typeof furnitureKind>;
/** Every dish the kitchen can cook. The schemas, the menu, the guest orders and the challenges all derive from this one list. */
export const DISH_IDS = ['salad', 'burger', 'bruschetta', 'soup', 'flatbread', 'skewers', 'steak', 'fries', 'ramen', 'dumplings', 'stirfry', 'friedrice'] as const;
export type Dish = typeof DISH_IDS[number];
/** The highest price a player can set. Steak at fair is $52, and a greedy menu asks half again. */
export const PRICE_MAX = 80;
export const PRICE_MIN = 10;
export type MenuStyle = 'garden' | 'grill' | 'noodle';
export const STYLE_NAMES: Record<MenuStyle, string> = { garden: 'Garden', grill: 'Grill', noodle: 'Noodle' };
export type DishInfo = { name: string; /** What the daily challenge calls a sale of this dish. */ plural: string; favorite: string; cost: number; fair: number; seconds: number; station: FurnitureKind; style: MenuStyle; description: string; look: 'salad' | 'burger' | 'bowl'; tint: string };
export const DISHES: Record<Dish, DishInfo> = {
  salad: { name: 'Garden salad', plural: 'garden salads', favorite: 'Garden favorites', cost: 7, fair: 24, seconds: 6, station: 'prep', style: 'garden', description: 'Crisp greens, ripe tomatoes, rooftop sunshine.', look: 'salad', tint: '#7da15a' },
  burger: { name: 'Sunset burger', plural: 'sunset burgers', favorite: 'Off the grill', cost: 12, fair: 38, seconds: 10, station: 'grill', style: 'grill', description: 'Charcoal-grilled, stacked high, made with love.', look: 'burger', tint: '#c9843f' },
  bruschetta: { name: 'Tomato bruschetta', plural: 'tomato bruschettas', favorite: 'Toast and tomato', cost: 6, fair: 22, seconds: 5, station: 'prep', style: 'garden', description: 'Grilled bread, ripe tomatoes, a little basil.', look: 'salad', tint: '#d65a3a' },
  soup: { name: 'Roof garden soup', plural: 'bowls of soup', favorite: 'Soup of the day', cost: 8, fair: 28, seconds: 8, station: 'pot', style: 'garden', description: 'Slow green soup, warm in both hands.', look: 'bowl', tint: '#8fb36a' },
  flatbread: { name: 'Herb flatbread', plural: 'herb flatbreads', favorite: 'Fresh from the oven', cost: 11, fair: 34, seconds: 9, station: 'oven', style: 'garden', description: 'Blistered in the brick oven with olive oil and herbs.', look: 'salad', tint: '#e0b873' },
  skewers: { name: 'Charred skewers', plural: 'charred skewers', favorite: 'On a stick', cost: 10, fair: 32, seconds: 8, station: 'grill', style: 'grill', description: 'Smoky vegetables and herbs, turned over the coals.', look: 'burger', tint: '#b5683a' },
  steak: { name: 'Rooftop steak', plural: 'rooftop steaks', favorite: 'The big plate', cost: 18, fair: 52, seconds: 13, station: 'grill', style: 'grill', description: 'Thick, seared, and worth the wait.', look: 'burger', tint: '#8a4a32' },
  fries: { name: 'Crispy fries', plural: 'baskets of fries', favorite: 'Golden and crisp', cost: 5, fair: 20, seconds: 7, station: 'oven', style: 'grill', description: 'Salted, hot, gone in a minute.', look: 'salad', tint: '#f0c75a' },
  ramen: { name: 'Sunset ramen', plural: 'bowls of ramen', favorite: 'Noodle night', cost: 11, fair: 36, seconds: 11, station: 'pot', style: 'noodle', description: 'A deep broth with springy noodles and a soft egg.', look: 'bowl', tint: '#e08a43' },
  dumplings: { name: 'Steamed dumplings', plural: 'plates of dumplings', favorite: 'Little parcels', cost: 8, fair: 28, seconds: 8, station: 'pot', style: 'noodle', description: 'Folded by hand and steamed until they shine.', look: 'bowl', tint: '#efe2c6' },
  stirfry: { name: 'Wok-fired noodles', plural: 'woks of noodles', favorite: 'Wok hei', cost: 10, fair: 34, seconds: 9, station: 'wok', style: 'noodle', description: 'Hot wok, fast hands, a little smoke.', look: 'bowl', tint: '#c4793a' },
  friedrice: { name: 'Egg fried rice', plural: 'plates of fried rice', favorite: 'Fried rice', cost: 8, fair: 30, seconds: 8, station: 'wok', style: 'noodle', description: 'Day-old rice, hot oil, golden egg.', look: 'bowl', tint: '#e6c46b' },
};

export const pointSchema = z.object({ x: z.number().finite().min(-2).max(16), z: z.number().finite().min(-2).max(16) });
export type Point = Validated<z.infer<typeof pointSchema>>;
const furnitureSchema = z.object({ id: z.number().int().nonnegative(), kind: furnitureKind, x: z.number().int().min(0).max(13), z: z.number().int().min(0).max(9), rotation: z.number().int().min(0).max(3) });
export type Furniture = Validated<z.infer<typeof furnitureSchema>>;
const roleSchema = z.enum(['chef', 'server']);
export type Role = z.infer<typeof roleSchema>;
const agentSchema = pointSchema.extend({ yaw: z.number().finite(), route: z.array(pointSchema).max(200) });
const staffSchema = agentSchema.extend({ id: z.number().int(), name: z.string().max(30), role: roleSchema, level: z.number().int().min(1).max(3), task: z.enum(['idle', 'toKitchen', 'cooking', 'collect', 'deliver', 'clean']), guestId: z.number().int().nullable(), stationId: z.number().int().nullable(), timer: z.number().finite().nonnegative() });
export type Staff = Validated<z.infer<typeof staffSchema>>;
const guestSchema = agentSchema.extend({ id: z.number().int(), species: z.enum(['mouse', 'crocodile', 'rabbit', 'bear']), tableId: z.number().int(), seat: z.number().int().min(0).max(1), dish: z.enum(DISH_IDS), price: z.number().min(0).max(PRICE_MAX), stage: z.enum(['arriving', 'waiting', 'cooking', 'ready', 'delivering', 'eating', 'leaving']), waiting: z.number().nonnegative(), timer: z.number().nonnegative(), happy: z.boolean(), stationId: z.number().int().nullable(), paid: z.boolean(), special: z.boolean().default(false), owner: z.boolean().default(false), cook: z.number().nonnegative().default(0), quality: z.number().int().min(0).max(3).default(0), priority: z.boolean().default(false) });
export type Guest = Validated<z.infer<typeof guestSchema>>;
const totalsSchema = z.object({ revenue: z.number().nonnegative(), ingredients: z.number().nonnegative(), served: z.number().int().nonnegative(), missed: z.number().int().nonnegative(), tips: z.number().nonnegative() });
export type Totals = Validated<z.infer<typeof totalsSchema>>;
const challengeSchema = z.object({
  day: z.number().int().positive(), kind: z.enum(['special', ...DISH_IDS, 'served', 'quick', 'revenue', 'tips']),
  target: z.number().int().positive().max(1000), progress: z.number().int().nonnegative().max(1000), reward: z.number().int().positive().max(200), rewarded: z.boolean(),
}).refine(c => c.progress <= c.target && c.rewarded === (c.progress === c.target), 'Invalid challenge progress');
export type DailyChallenge = Validated<z.infer<typeof challengeSchema>>;
const challengesSchema = z.array(challengeSchema).max(3).default([]).refine(items => new Set(items.map(c => c.kind)).size === items.length, 'Duplicate challenges');
/** What one service did that the star rules do not already count. Reset when the doors open; read by the kitchen card and the awards. */
const nightSchema = z.object({ waitSeconds: z.number().nonnegative().default(0), refused: z.number().int().nonnegative().default(0), walkouts: z.number().int().nonnegative().default(0), dirtyAtClose: z.number().int().nonnegative().default(0), closed: z.boolean().default(false) });
export type Night = Validated<z.infer<typeof nightSchema>>;
export const freshNight = (): Night => ({ waitSeconds: 0, refused: 0, walkouts: 0, dirtyAtClose: 0, closed: false });
/** Running counts the contracts read: services since furniture was last sold, services in a row at honest prices, and whether the recovery loan was ever cleared. */
const streaksSchema = z.object({ nailed: z.number().int().nonnegative().default(0), honest: z.number().int().nonnegative().default(0), loanCleared: z.number().int().min(0).max(1).default(0) });
export type Streaks = Validated<z.infer<typeof streaksSchema>>;
export const freshStreaks = (): Streaks => ({ nailed: 0, honest: 0, loanCleared: 0 });
/** A dish is priced honestly within this many dollars of fair. */
export const HONEST_BAND = 4;
/** The best company value this restaurant has had, and the service day it was set. */
const bestSchema = z.object({ value: z.number().default(0), day: z.number().int().nonnegative().default(0) });
/** The headline a service ran under, with the counters its star line and rating rules read. */
const headlineStateSchema = z.object({ id: headlineId, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), seed: z.number().int().nonnegative(), walkouts: z.number().int().nonnegative().default(0), dirtyAtClose: z.number().int().nonnegative().default(0), closed: z.boolean().default(false) });
export type HeadlineState = Validated<z.infer<typeof headlineStateSchema>>;
const reportSchema = totalsSchema.extend({ headline: headlineId.nullable().default(null), challenges: challengesSchema, day: z.number().int().positive(), wages: z.number().nonnegative(), rent: z.number().nonnegative(), debtPayment: z.number().nonnegative(), profit: z.number().finite(), rating: z.number().min(1).max(5) });
export type Report = Validated<z.infer<typeof reportSchema>>;
/** One entry per dish. A dish a save does not mention yet is simply off, at its fair price, so older saves keep loading. */
export type MenuItem = { enabled: boolean; price: number };
const menuItem = z.object({ enabled: z.boolean(), price: z.number().int().min(PRICE_MIN).max(PRICE_MAX) });
const menuSchema = z.object(Object.fromEntries(DISH_IDS.map(id => [id, menuItem.default({ enabled: false, price: DISHES[id].fair })]))) as unknown as z.ZodType<Record<Dish, MenuItem>, z.ZodTypeDef, unknown>;
/** Validated versioned save. Arcade records live under a different key. */
export const restaurantSchema = z.object({
  version: z.literal(1), name: z.string().min(1).max(28), day: z.number().int().min(1), cash: z.number().finite(), reputation: z.number().min(1).max(5), debt: z.number().nonnegative(), expanded: z.boolean(),
  furniture: z.array(furnitureSchema).min(1).max(100), staff: z.array(staffSchema).min(2).max(6), guests: z.array(guestSchema).max(24), dirty: z.array(z.string().max(30)).max(40),
  menu: menuSchema,
  phase: z.enum(['planning', 'service', 'report']), elapsed: z.number().finite().nonnegative(), nextArrival: z.number().finite().nonnegative(), clock: z.number().finite().nonnegative(), nextId: z.number().int().positive(), seed: z.number().finite(),
  headline: headlineStateSchema.nullable().default(null), comps: z.number().int().nonnegative().default(0), night: nightSchema.default(freshNight()), best: bestSchema.default({ value: 0, day: 0 }), streaks: streaksSchema.default(freshStreaks()), lastActiveAt: z.number().finite().nonnegative().default(0), isPaused: z.boolean().default(false), renovation: z.boolean().default(false),
  dailyChallenges: challengesSchema, lifetimeChallengeBonus: z.number().int().nonnegative().default(0),
  totals: totalsSchema, history: z.array(reportSchema).max(20), lifetimeServed: z.number().int().nonnegative(), claimed: z.array(z.string()).max(10), music: z.boolean(), welcomed: z.boolean(),
});
export type RestaurantState = Validated<z.infer<typeof restaurantSchema>>;
export type CatalogItem = { name: string; description: string; price: number; size: number; category: 'Dining' | 'Kitchen' | 'Atmosphere'; comfort: number };
export const CATALOG: Record<FurnitureKind, CatalogItem> = {
  table: { name: 'Bistro table', description: 'Two seats. A little room for good company.', price: 180, size: 2, category: 'Dining', comfort: 0 },
  prep: { name: 'Prep counter', description: 'One chef can prepare garden salads here.', price: 240, size: 1, category: 'Kitchen', comfort: 0 },
  grill: { name: 'Charcoal grill', description: 'One chef can cook our signature burgers.', price: 360, size: 1, category: 'Kitchen', comfort: 0 },
  pot: { name: 'Stock pot', description: 'One chef can simmer soups, ramen and dumplings here.', price: 280, size: 1, category: 'Kitchen', comfort: 0 },
  wok: { name: 'Wok range', description: 'One chef can wok-fry noodles and rice here.', price: 320, size: 1, category: 'Kitchen', comfort: 0 },
  oven: { name: 'Brick oven', description: 'One chef can bake flatbread and crisp fries here.', price: 420, size: 1, category: 'Kitchen', comfort: 0 },
  plant: { name: 'Olive planter', description: '+6 atmosphere. Happier guests leave better tips.', price: 65, size: 1, category: 'Atmosphere', comfort: 6 },
  divider: { name: 'Garden screen', description: '+4 atmosphere. Shape a cozy dining nook.', price: 80, size: 1, category: 'Atmosphere', comfort: 4 },
  lamp: { name: 'Warm lantern', description: '+8 atmosphere. A little golden-hour magic.', price: 110, size: 1, category: 'Atmosphere', comfort: 8 },
};
export const stationName = (kind: FurnitureKind): string => CATALOG[kind].name.toLowerCase();
export const DAY_LENGTH = 150;
/** Tables the owner may comp in one service. A comp trades the sale for a guest who would have walked out. */
export const COMPS_PER_NIGHT = 2;
/** A dish the owner is cooking burns, by itself, after this many times its normal cooking time. */
export const COOK_BURN = 2;
/**
 * Plating quality from how long the owner let the dish cook, as a share of its normal time. The engine computes this from
 * simulated seconds, so nothing about quality is reported by the client: 0 means raw or burnt (the dish is lost), 1 is
 * acceptable, 3 is perfect and tips 15% more, 2 is slightly over.
 */
export const cookQuality = (ratio: number): 0 | 1 | 2 | 3 => ratio < .6 ? 0 : ratio < .85 ? 1 : ratio <= 1.25 ? 3 : ratio <= 1.6 ? 2 : 0;
/** How fast the walk-away chance grows with a price above fair: refusal = (price / fair - 1) * PRICE_SLOPE. Calibrated by the bots. */
export const PRICE_SLOPE = 1.2;
/** Seconds of arrival gap one point of atmosphere above the 20 every room starts with takes off; capped so decor never doubles the crowd. */
export const COMFORT_GAP = .033;
export const COMFORT_GAP_MAX = 1.5;
/** Cheaper menus draw more people: up to 15% shorter gaps for a menu priced below fair. */
export const DISCOUNT_LIFT_MAX = .15;
export const SAVE_KEY = 'kitchen-rush-restaurant-v1';
export const CELL = 1.4;
export const HEIGHT = 10;
export const width = (state: Pick<RestaurantState, 'expanded'>): number => state.expanded ? 14 : 10;
export const entrance: Point = { x: 4, z: 9 };
export const freshTotals = (): Totals => ({ revenue: 0, ingredients: 0, served: 0, missed: 0, tips: 0 });
export const staffWage = (staff: Staff): number => (staff.role === 'chef' ? 34 : 26) + (staff.level - 1) * 12;
export const comfort = (state: RestaurantState): number => Math.min(100, state.furniture.reduce((total, item) => total + CATALOG[item.kind].comfort, 20));
/** Shared service deadline, including the restaurant's existing atmosphere bonus. */
export const guestPatienceSeconds = (state: RestaurantState): number => (48 + comfort(state) * .18) * headlineEffects(state.headline).patience;
/** Ingredient cost for one dish tonight; the supplier headline raises the grill dishes. */
export const dishCost = (state: RestaurantState, dish: Dish): number => Math.round(DISHES[dish].cost * (DISHES[dish].station === 'grill' ? headlineEffects(state.headline).burgerCost : 1));
/** Average share below fair across the enabled dishes, as a fraction of the arrival gap (0 at or above fair). */
export const discountLift = (state: RestaurantState): number => {
  const on = DISH_IDS.filter(dish => state.menu[dish].enabled);
  if (!on.length) return 0;
  const ratio = on.reduce((sum, dish) => sum + state.menu[dish].price / DISHES[dish].fair, 0) / on.length;
  return Math.min(DISCOUNT_LIFT_MAX, Math.max(0, 1 - ratio));
};
/** Cash plus what the furniture would refund (70%, the engine's sell rate) minus the loan: the figure the ledger keeps a best of. */
export const companyValue = (state: Pick<RestaurantState, 'cash' | 'furniture' | 'debt'>): number => Math.round(state.cash + state.furniture.reduce((sum, f) => sum + Math.floor(CATALOG[f.kind].price * .7), 0) - state.debt);
export const capacity = (state: RestaurantState): number => state.furniture.filter(item => item.kind === 'table').length * 2;
/** A playable starter business, with no fabricated revenue or customers served. */
export function createRestaurant(): RestaurantState {
  return { version: 1, name: 'Little Rooftop', streaks: freshStreaks(), day: 1, cash: 1250, reputation: 3.5, debt: 0, expanded: false,
    furniture: [
      { id: 1, kind: 'prep', x: 1, z: 1, rotation: 0 }, { id: 2, kind: 'grill', x: 3, z: 1, rotation: 0 },
      { id: 3, kind: 'table', x: 1, z: 4, rotation: 0 }, { id: 4, kind: 'table', x: 5, z: 4, rotation: 0 }, { id: 5, kind: 'table', x: 7, z: 1, rotation: 0 },
      { id: 6, kind: 'plant', x: 0, z: 0, rotation: 0 }, { id: 7, kind: 'plant', x: 9, z: 7, rotation: 0 }, { id: 8, kind: 'lamp', x: 9, z: 0, rotation: 0 },
    ],
    staff: [
      { id: 10, name: 'Basil', role: 'chef', level: 1, x: 1, z: 2, yaw: Math.PI, route: [], task: 'idle', guestId: null, stationId: null, timer: 0 },
      { id: 11, name: 'Pip', role: 'server', level: 1, x: 4, z: 7, yaw: 0, route: [], task: 'idle', guestId: null, stationId: null, timer: 0 },
    ], guests: [], dirty: [], menu: { ...Object.fromEntries(DISH_IDS.map(id => [id, { enabled: false, price: DISHES[id].fair }])) as Record<Dish, MenuItem>, salad: { enabled: true, price: 24 }, burger: { enabled: true, price: 38 } },
    headline: null, comps: 0, night: freshNight(), best: { value: 0, day: 0 }, lastActiveAt: 0, isPaused: false, renovation: false, dailyChallenges: [], lifetimeChallengeBonus: 0,
    phase: 'planning', elapsed: 0, nextArrival: 1, clock: 0, nextId: 20, seed: 91273, totals: freshTotals(), history: [], lifetimeServed: 0, claimed: [], music: false, welcomed: false,
  };
}
