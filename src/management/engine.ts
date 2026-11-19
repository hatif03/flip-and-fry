import { accessPoints, findPath, layoutError, placementError, seatPoint } from './layout';
import { HONEST_BAND, RESEARCH, RESEARCH_GATE, researched, MAX_REGULARS, REGULAR_NAMES, SPECIES, DISH_IDS, PRICE_MAX, PRICE_MIN, stationName, COMPS_PER_NIGHT, COOK_BURN, billsShare, shiftLength, SHIFT_NAMES, type Shift, plateQuality, prepQuality, type Hands, companyValue, cookQuality, freshNight, CATALOG, COMFORT_GAP, COMFORT_GAP_MAX, DISHES, PRICE_SLOPE, SAVE_KEY, capacity, comfort, createRestaurant, discountLift, dishCost, entrance, freshTotals, guestPatienceSeconds, restaurantSchema, staffWage, width, type Dish, type OutfitId, type Furniture, type Guest, type Point, type RestaurantState, type Role, type Staff } from './types';
import { headlineEffects, mixSeed, type DailyHeadline, type HeadlineEffects } from './daily-headline';

import { advanceDailyChallenges, createDailyChallenges, isSpecialGuest, challengeTitles } from './daily-challenges';
import type { CashReceipt } from './cash-feedback';
import type { Action } from './actions';
import type { CoopListing } from './coop';
import type { NeighborhoodView, VisitResult } from './social';
import type { BoardView, LockResponse, TodayResponse } from '../shared/api';

export const GOALS = [
  { id: 'first-service', title: 'A warm welcome', text: 'Serve your first 5 guests', target: 5, reward: 180, value: (s: RestaurantState) => s.lifetimeServed },
  { id: 'atmosphere', title: 'Make it yours', text: 'Reach 50 atmosphere', target: 50, reward: 150, value: comfort },
  { id: 'more-tables', title: 'Room for everyone', text: 'Build 5 bistro tables', target: 5, reward: 250, value: (s: RestaurantState) => capacity(s) / 2 },
  { id: 'three-days', title: 'The neighborhood favorite', text: 'Complete 3 service days', target: 3, reward: 300, value: (s: RestaurantState) => s.history.length },
  // The contracts. Each reads only saved state, so the server's replay agrees with the client on whether one can be collected.
  { id: 'pay-the-roof', title: 'Pay the roof', text: 'Clear the recovery loan, or bank $400 in profit', target: 400, reward: 300, value: (s: RestaurantState) => s.streaks.loanCleared ? 400 : Math.max(0, s.history.reduce((sum, r) => sum + r.profit, 0)) },
  { id: 'three-good-nights', title: 'Three good nights', text: 'Earn a rating of 4 or more on 3 services', target: 3, reward: 250, value: (s: RestaurantState) => s.history.filter(r => r.rating >= 4).length },
  { id: 'nailed-down', title: 'Nailed down', text: 'Run 3 services in a row without selling any furniture', target: 3, reward: 200, value: (s: RestaurantState) => s.streaks.nailed },
  { id: 'honest-prices', title: 'Honest prices', text: `Run 3 profitable services with every dish within $${HONEST_BAND} of fair`, target: 3, reward: 200, value: (s: RestaurantState) => s.streaks.honest },
  { id: 'regulars-table', title: 'Regulars’ table', text: 'Keep a regular happy three visits in a row', target: 3, reward: 300, value: (s: RestaurantState) => Math.max(0, ...s.regulars.map(r => r.streak)) },
  { id: 'full-room', title: 'A full room', text: 'Have 8 seats and serve 8 guests in one service', target: 8, reward: 350, value: (s: RestaurantState) => capacity(s) >= 8 ? Math.max(0, ...s.history.map(r => r.served)) : 0 },
];
/** Exact business results computed while the owner was away, not an idle-income estimate. */
export interface AwaySummary { seconds: number; days: number; served: number; cashChange: number; challengeBonus: number; }
/** Set by the Reddit client. Services open and close through the server, which owns the park and replays every service. */
export interface RemoteSession {
  open(): Promise<string | null>;
  readonly today: TodayResponse | null;
  /** The server's receipt for the service that just closed, until the player dismisses it. */
  result: LockResponse | null;
  dismissResult(): void;
  /** What the player has done with today's result. Each action is its own explicit button; none is required to play. */
  social?: { posted: boolean; flair: string | null; followed: boolean };
  /** The exact comment that would be posted, so the player confirms the real text. */
  previewComment?(note: string): Promise<{ text: string; reply: boolean } | { error: string }>;
  postResult?(note: string): Promise<string | null>;
  wearFlair?(): Promise<string | null>;
  /** Hosted service: invite a neighbor to help during the night, or help in someone else's. */
  coop?: {
    invite: boolean;
    setInvite(on: boolean): void;
    /** The host's name while this device is helping in their kitchen, else null. */
    helpingAt(): string | null;
    list(): Promise<CoopListing[]>;
    join(hostId: string): Promise<string | null>;
    leave(): Promise<void>;
  };
  /** The neighborhood: look around, leave the door open, visit a kitchen. Each is its own explicit button. */
  neighborhood?: {
    load(): Promise<NeighborhoodView | { error: string }>;
    setDoor(open: boolean): Promise<string | null>;
    visit(doorId: string, dish: string): Promise<VisitResult | { error: string }>;
    /** Create a post of the player's open kitchen, as the player. Its own explicit button. */
    postKitchen(image?: string): Promise<{ url: string } | { error: string }>;
    /** Reminders: opt in or out of a push notification when a streak is at risk. */
    reminder?: { status(): Promise<boolean>; set(on: boolean): Promise<string | null> };
  };
  /** A neighbor's Reddit avatar URL, if Reddit has one. The page falls back to the pixel face when it is null or will not load. */
  avatar?(name: string): Promise<string | null>;
  follow?(): Promise<string | null>;
  /** Today's board: official results on this subreddit, from the server's replays. Optional and read-only. */
  board?(shift?: 'lunch' | 'dinner'): Promise<BoardView | { error: string }>;
}
export interface StorageAdapter { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const resetStaff = (staff: Staff): void => { staff.task = 'idle'; staff.guestId = null; staff.stationId = null; staff.timer = 0; staff.route = []; };
const seatKey = (g: Pick<Guest, 'tableId' | 'seat'>): string => `${g.tableId}:${g.seat}`;
function walk(agent: Point & { route: Point[]; yaw: number }, dt: number, speed: number): boolean {
  let remaining = dt * speed;
  while (agent.route.length && remaining > 0) {
    // sqrt is exactly rounded in every JS engine; the built-in hypotenuse helper is not, and replay must match across V8 and JavaScriptCore.
    const next = agent.route[0], dx = next.x - agent.x, dz = next.z - agent.z, length = Math.sqrt(dx * dx + dz * dz);
    if (length > .001) agent.yaw = Math.atan2(dx, dz);
    if (length <= remaining) { agent.x = next.x; agent.z = next.z; agent.route.shift(); remaining -= length; }
    else { agent.x += dx / length * remaining; agent.z += dz / length * remaining; remaining = 0; }
  }
  return agent.route.length === 0;
}

/** Independent, deterministic owner simulation. Rendering never owns money or service outcomes. */
export class RestaurantEngine {
  state: RestaurantState = createRestaurant();
  get paused(): boolean { return this.state.isPaused; }
  set paused(value: boolean) { this.state.isPaused = value; }
  /** When false, finish() stops at the receipt with the doors closed instead of opening the next day. */
  autoRoll = true;
  /** Called with every planning change the engine accepts, so the Reddit client can queue it for the server. */
  onAction: ((action: Action) => void) | null = null;
  remote: RemoteSession | null = null;
  private detached = false;
  private record(action: Action): void { if (!this.catchingUp) this.onAction?.(action); }
  /** Stop reading and writing localStorage. On Reddit the park lives in Redis; the iframe URL changes on every upload. */
  detach(): void { this.detached = true; }
  /** Replace the whole state with one the server sent (the server checked it; it is checked again here). */
  adopt(state: RestaurantState): void {
    this.state = restaurantSchema.parse(state) as RestaurantState;
    this.accumulator = 0; this.incomeReceipts = []; this.awaySummary = null; this.catchingUp = false; this.loadWarning = ''; this.saveFailed = false; this.notify();
  }
  catchingUp = false;
  catchUpProgress = 0;
  awaySummary: AwaySummary | null = null;
  private backgrounded = false;
  private pauseAfterCatchUp: boolean | null = null;
  private routeCache = new Map<string, Point[]>();
  private routeLayout = '';
  speed: 1 | 2 | 3 = 1;
  saveFailed = false;
  loadWarning = '';
  event = 'Your little rooftop is ready for its first chapter.';
  /** Bounded, session-only receipts. Money is credited before an event is recorded. */
  incomeReceipts: CashReceipt[] = [];
  private incomeSequence = 0;
  private revision = 0;
  private accumulator = 0;
  private savedAt = 0;
  private rewardSavePending = false;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly storage?: StorageAdapter, private readonly now: () => number = Date.now) {
    try {
      const raw = storage?.getItem(SAVE_KEY);
      if (raw) {
        const result = restaurantSchema.safeParse(JSON.parse(raw));
        if (!result.success) throw new Error('Invalid save');
        const restored = result.data as RestaurantState;
        if (layoutError(restored.furniture, width(restored))) throw new Error('Invalid layout');
        if (restored.dailyChallenges.some(c => c.day !== restored.day)) throw new Error('Invalid challenge day');
        this.state = restored;
        // Legacy receipts were already charged: migrate without charging or completing that day twice.
        if (this.state.phase === 'report') { this.beginNextDay(); this.state.lastActiveAt = 0; }
        // Legacy service starts challenges next day, never assigns full-day goals near closing.
        if (this.state.phase === 'service' && this.state.elapsed === 0 && !this.state.dailyChallenges.length) this.startChallenges();
        this.event = 'Welcome back. Your restaurant story continues.';
      }
    } catch { this.loadWarning = 'The previous save could not be read. A fresh restaurant is shown; save again only when you are ready to replace it.'; this.saveFailed = true; }
  }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = (): number => this.revision;
  notify = (): void => { this.revision++; this.listeners.forEach(listener => listener()); };
  save = (replaceUnreadable = false): boolean => {
    if (this.detached) return true;
    if (this.loadWarning && !replaceUnreadable) return false;
    if (!this.backgrounded && !this.catchingUp) this.state.lastActiveAt = Math.max(this.state.lastActiveAt, this.now());
    try { this.storage?.setItem(SAVE_KEY, JSON.stringify(this.state)); this.saveFailed = false; this.loadWarning = ''; return true; }
    catch { this.saveFailed = true; return false; }
  };
  private recordIncome(amount: number, source: CashReceipt['source'], guestId: number | null = null, tip = 0): void {
    if (this.catchingUp) return;
    this.incomeReceipts = [...this.incomeReceipts.slice(-11), { id: ++this.incomeSequence, amount, source, guestId, tip, clock: this.state.clock }];
  }
  private changed(message?: string): void { if (message) this.event = message; if (this.catchingUp) return; if (!this.loadWarning) this.save(); this.notify(); }
  /** A hosted service cannot be paused by one side: the other would run on without it. A helper waits for a missing host with holdForHost. */
  holdForHost(value: boolean): void { this.paused = value; this.accumulator = 0; this.notify(); }
  pause(value: boolean): void { if (this.coop && value) return; if (this.catchingUp) { this.pauseAfterCatchUp = value; return; } this.paused = value; this.accumulator = 0; this.changed(); }
  setSpeed(value: 1 | 2 | 3): void { if (this.catchingUp || this.coop) return; this.speed = value; this.paused = false; this.changed(); }
  /** Save once when leaving; subsequent pagehide/unmount events must not move the offline checkpoint. */
  suspend(): void { if (!this.backgrounded) this.save(); this.backgrounded = true; this.accumulator = 0; }
  dismissAway(): void { this.awaySummary = null; this.notify(); }
  /** Replay all elapsed wall time at 1× using the same fixed simulation step, yielding between chunks. */
  async resume(): Promise<void> {
    this.backgrounded = false;
    if (this.catchingUp) return;
    const s = this.state, start = s.lastActiveAt;
    let target = this.now();
    if (!start || target <= start || this.paused || s.phase !== 'service') { this.save(); this.notify(); return; }
    let steps = Math.floor((target - start) / 100);
    if (!steps) return;
    const before = { day: s.day, cash: s.cash, served: s.lifetimeServed, clock: s.clock, challengeBonus: s.lifetimeChallengeBonus };
    this.catchingUp = true; this.catchUpProgress = 0; this.incomeReceipts = []; this.notify();
    let done = 0;
    // Save partial checkpoints so closing the page during recovery never duplicates completed business.
    while (this.state === s && !this.paused && s.phase === 'service') {
      // Include time spent replaying/throttled in the background instead of silently discarding it.
      target = Math.max(target, this.now()); steps = Math.floor((target - start) / 100);
      if (done >= steps) break;
      const end = Math.min(steps, done + 1000);
      for (; done < end && s.phase === 'service' && !this.paused; done++) this.step(.1);
      s.lastActiveAt = start + done * 100;
      this.catchUpProgress = done / steps;
      this.save(); this.notify();
      if (done < steps && s.phase === 'service' && !this.paused) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    if (this.state !== s) return;
    s.lastActiveAt = Math.max(s.lastActiveAt, target);
    this.awaySummary = s.clock - before.clock >= 1 ? { seconds: Math.round(s.clock - before.clock), days: s.day - before.day, served: s.lifetimeServed - before.served, cashChange: s.cash - before.cash, challengeBonus: s.lifetimeChallengeBonus - before.challengeBonus } : null;
    if (this.pauseAfterCatchUp !== null) { this.paused = this.pauseAfterCatchUp; this.pauseAfterCatchUp = null; }
    this.catchUpProgress = 1; this.save(); this.catchingUp = false; this.savedAt = s.clock; this.notify();
  }
  update(dt: number): void {
    if (this.backgrounded || this.catchingUp || this.state.phase !== 'service' || this.paused || !Number.isFinite(dt) || dt <= 0) return;
    this.accumulator += Math.min(dt, .25) * this.speed;
    let changed = false;
    while (this.accumulator >= .1 && this.state.phase === 'service') { this.step(.1); this.accumulator -= .1; changed = true; }
    if (changed) {
      if (this.rewardSavePending || this.state.clock - this.savedAt > 5) { this.savedAt = this.state.clock; this.rewardSavePending = false; if (!this.loadWarning) this.save(); }
      this.notify();
    }
  }
  private fxKey = '';
  private fxValue: HeadlineEffects = headlineEffects(null);
  /** The weights of tonight's headline; memoised because step() reads them many times a second. */
  private get fx(): HeadlineEffects {
    const h = this.state.headline, key = h ? `${h.id}:${h.seed}` : '';
    if (key !== this.fxKey) { this.fxKey = key; this.fxValue = headlineEffects(h); }
    return this.fxValue;
  }
  /** One fixed 0.1 s simulation step. Replay, bots and co-op call this directly instead of update(). */
  tick(): void { if (this.state.phase === 'service') this.step(.1); }
  private random(): number { this.state.seed = (Math.imul(this.state.seed, 1664525) + 1013904223) >>> 0; return this.state.seed / 4294967296; }
  private route(from: Point, to: Point): Point[] | null {
    const layout = `${width(this.state)}:${JSON.stringify(this.state.furniture)}`;
    if (layout !== this.routeLayout) { this.routeLayout = layout; this.routeCache.clear(); }
    const key = `${from.x},${from.z}:${to.x},${to.z}`;
    let path = this.routeCache.get(key);
    if (!path) { const found = findPath(this.state.furniture, width(this.state), from, to); if (!found) return null; path = found; if (this.routeCache.size < 256) this.routeCache.set(key, path); }
    return path.map(point => ({ ...point }));
  }
  private relocateStaff(): void {
    this.state.staff.forEach((staff, i) => {
      resetStaff(staff);
      const candidate = { x: entrance.x + (i % 3) - 1, z: entrance.z - Math.floor(i / 3) };
      const safe = this.route(entrance, candidate) !== null ? candidate : entrance;
      staff.x = safe.x; staff.z = safe.z;
    });
  }
  place(item: Furniture): string | null {
    if (this.state.phase !== 'planning') return 'Rearrange the restaurant between service days.';
    const existing = this.state.furniture.find(f => f.id === item.id);
    if (existing && existing.kind !== item.kind) return 'Move the selected furniture without changing its type.';
    const gate = RESEARCH_GATE[item.kind];
    if (!existing && gate && !researched(this.state, gate)) { const study = RESEARCH.find(r => r.id === gate)!; return `Research the ${study.title.toLowerCase()} first: ${study.at} points, you have ${this.state.research.points}.`; }
    if (!existing && this.state.cash < CATALOG[item.kind].price) return 'Not enough cash. Serve a day or sell something you no longer need.';
    const error = placementError(this.state, item); if (error) return error;
    if (existing) Object.assign(existing, item);
    else { this.state.cash -= CATALOG[item.kind].price; this.state.furniture.push({ ...item, id: this.state.nextId++ }); }
    this.relocateStaff(); this.record({ tick: 0, kind: 'place', item: { id: item.id, kind: item.kind, x: item.x, z: item.z, rotation: item.rotation } }); this.changed(`${CATALOG[item.kind].name} ${existing ? 'moved' : 'built'}. A little more you.`); return null;
  }
  sell(id: number): string | null {
    if (this.state.phase !== 'planning') return 'Wait until closing to sell furniture.';
    const item = this.state.furniture.find(f => f.id === id); if (!item) return 'Select a piece of furniture first.';
    if (this.state.furniture.length === 1) return 'Keep at least one piece of furniture.';
    this.state.furniture = this.state.furniture.filter(f => f.id !== id); this.state.streaks.nailed = 0; this.state.cash += Math.floor(CATALOG[item.kind].price * .7);
    this.recordIncome(Math.floor(CATALOG[item.kind].price * .7), 'sale');
    this.relocateStaff(); this.record({ tick: 0, kind: 'sell', id }); this.changed('Sold for 70% of the original price.'); return null;
  }
  hire(role: Role): string | null {
    if (this.state.phase !== 'planning') return 'Hire before opening for the day.';
    if (this.state.staff.length >= 6) return 'Your terrace team is limited to 6 people.';
    if (this.state.cash < 150) return 'Recruitment costs $150.';
    const names = role === 'chef' ? ['Basil', 'Miso', 'Clover', 'Pepper', 'Sage', 'Olive'] : ['Pip', 'Hazel', 'Maple', 'Coco', 'Fern', 'Juniper'];
    const name = names.find(n => !this.state.staff.some(s => s.name === n)) ?? names[0];
    this.state.cash -= 150; this.state.staff.push({ id: this.state.nextId++, name, role, level: 1, ...entrance, yaw: 0, route: [], task: 'idle', guestId: null, stationId: null, timer: 0 });
    this.record({ tick: 0, kind: 'hire', role }); this.changed(`${name} joined your team. Welcome aboard!`); return null;
  }
  train(id: number): string | null {
    const staff = this.state.staff.find(s => s.id === id);
    if (this.state.phase !== 'planning' || !staff) return 'Train staff between service days.';
    if (staff.level === 3) return 'Already fully trained.';
    const cost = 180 * staff.level; if (this.state.cash < cost) return `Training costs $${cost}.`;
    this.state.cash -= cost; staff.level++; this.record({ tick: 0, kind: 'train', id }); this.changed(`${staff.name} is now level ${staff.level}. Faster service, happier guests.`); return null;
  }
  dismiss(id: number): string | null {
    const member = this.state.staff.find(s => s.id === id);
    if (!member || this.state.phase !== 'planning') return 'Manage your team before opening.';
    if (this.state.staff.filter(s => s.role === member.role).length <= 1) return 'Keep at least one chef and one server.';
    this.state.staff = this.state.staff.filter(s => s.id !== id); this.record({ tick: 0, kind: 'dismiss', id }); this.changed(`${member.name} has left the team.`); return null;
  }
  setDish(dish: Dish, enabled: boolean, price: number): string | null {
    if (this.state.phase !== 'planning') return 'Set tomorrow’s menu after closing.';
    if (!enabled && !Object.entries(this.state.menu).some(([key, value]) => key !== dish && value.enabled)) return 'Keep at least one dish on the menu.';
    this.state.menu[dish] = { enabled, price: Math.max(PRICE_MIN, Math.min(PRICE_MAX, Math.round(price))) }; this.record({ tick: 0, kind: 'dish', dish, enabled, price: this.state.menu[dish].price }); this.changed(); return null;
  }
  expand(): string | null {
    if (this.state.phase !== 'planning') return 'Build the extension before opening.';
    if (this.state.expanded) return 'Your terrace is already expanded.';
    if (this.state.history.length < 3) return 'Complete 3 service days to unlock the east terrace.';
    if (this.state.cash < 900) return 'The east terrace costs $900.';
    this.state.cash -= 900; this.state.expanded = true; this.record({ tick: 0, kind: 'expand' }); this.changed('The east terrace is yours. Forty new tiles, endless possibilities.'); return null;
  }
  claim(id: string): string | null {
    const goal = GOALS.find(g => g.id === id);
    if (!goal || this.state.claimed.includes(id) || goal.value(this.state) < goal.target) return 'Complete this milestone first.';
    this.state.claimed.push(id); this.state.cash += goal.reward; this.recordIncome(goal.reward, 'milestone'); this.record({ tick: 0, kind: 'claim', id }); this.changed(`Milestone complete: ${goal.title}. +$${goal.reward}`); return null;
  }
  loan(): string | null {
    if (this.state.phase !== 'planning' || this.state.cash >= 200 || this.state.debt > 0) return 'A $600 recovery loan is available below $200, with no existing loan.';
    this.state.cash += 600; this.state.debt = 600; this.recordIncome(600, 'loan'); this.record({ tick: 0, kind: 'loan' }); this.changed('Recovery loan received. $30 is repaid after each day, with no interest.'); return null;
  }
  rename(name: string): void { this.state.name = name.trim().slice(0, 28) || 'Little Rooftop'; this.record({ tick: 0, kind: 'rename', name: this.state.name }); this.changed(); }
  /** What to spend on research each night, taken at closing like wages. */
  setResearch(budget: 0 | 20 | 40): string | null {
    if (this.state.phase !== 'planning') return 'Set the research budget between services.';
    this.state.research.budget = budget; this.record({ tick: 0, kind: 'research', budget }); this.changed(); return null;
  }
  setOutfit(part: 'hat' | 'apron', color: OutfitId): string | null {
    if (this.state.phase !== 'planning') return 'Change the staff cloth between services.';
    if (!researched(this.state, 'cloth')) return 'Research the staff cloth first.';
    this.state.outfit[part] = color; this.record({ tick: 0, kind: 'outfit', part, color }); this.changed(); return null;
  }
  /** Choose tonight's shift. A lunch is short and has no daily challenges; a dinner is the full service. */
  setShift(shift: Shift): string | null {
    if (this.state.phase !== 'planning') return 'Choose the shift before opening.';
    if (this.state.shift === shift) return null;
    this.state.shift = shift; this.record({ tick: 0, kind: 'shift', shift }); this.changed(`${SHIFT_NAMES[shift]} it is.`); return null;
  }
  /** The length of tonight's service in simulated seconds. */
  get len(): number { return shiftLength(this.state); }
  setMusic(value: boolean): void { this.state.music = value; this.record({ tick: 0, kind: 'music', on: value }); this.changed(); }
  welcome(): void { this.state.welcomed = true; this.changed(); }
  reset(): void { if (this.remote) { this.event = 'Your restaurant is saved on Reddit and cannot be reset here.'; this.notify(); return; } this.rewardSavePending = false; this.pauseAfterCatchUp = null; this.catchingUp = false; this.backgrounded = false; this.awaySummary = null; this.speed = 1; this.incomeReceipts = []; this.state = createRestaurant(); this.paused = false; this.accumulator = 0; this.savedAt = 0; this.loadWarning = ''; this.changed('A fresh beginning. Make this rooftop your own.'); }
  readiness(): string[] {
    const errors: string[] = [];
    if (!capacity(this.state)) errors.push('Build at least one bistro table.');
    for (const dish of DISH_IDS) if (this.state.menu[dish].enabled && !this.state.furniture.some(f => f.kind === DISHES[dish].station)) errors.push(`Add a ${stationName(DISHES[dish].station)} for ${DISHES[dish].name.toLowerCase()}, or remove it from the menu.`);
    if (this.state.cash < this.operatingCost() + 30) errors.push(`Keep $${this.operatingCost() + 30} for wages, rent and starting ingredients.`);
    const layout = layoutError(this.state.furniture, width(this.state)); if (layout) errors.push(layout);
    return errors;
  }
  operatingCost(): number { return Math.round((this.state.staff.reduce((sum, staff) => sum + staffWage(staff), 0) + (this.state.expanded ? 50 : 30)) * billsShare(this.state)); }
  /** Open the doors. With a headline, its seed is mixed into the engine seed so every kitchen sees a different queue. */
  open(headline?: DailyHeadline): string | null {
    if (this.state.phase !== 'planning') return 'The restaurant is already open.';
    const errors = this.readiness(); if (errors.length) return errors[0];
    if (headline) {
      this.state.seed = mixSeed(this.state.seed ^ headline.seed);
      this.state.headline = { id: headline.id, date: headline.date, seed: headline.seed, walkouts: 0, dirtyAtClose: 0, closed: false };
    } else this.state.headline = null;
    this.state.hands = []; this.cooked = { plated: 0, perfect: 0, tookOver: 0 };
    Object.assign(this.state, { phase: 'service', renovation: false, elapsed: 0, nextArrival: 1, totals: freshTotals(), guests: [], dirty: [], comps: 0, night: freshNight() });
    this.startChallenges(); this.relocateStaff(); this.paused = false; this.accumulator = 0; this.changed('Doors open. Run the pass: cook the orders yourself.'); return null;
  }
  private startChallenges(): void {
    if (this.state.dailyChallenges.length || this.state.shift === 'lunch') return;
    this.state.dailyChallenges = createDailyChallenges(this.state);
  }
  private beginNextDay(): void {
    const renovate = this.state.renovation || !this.autoRoll;
    // A headline belongs to the service it opened. Days that roll on by themselves (autoRoll) run without one.
    if (this.autoRoll) this.state.headline = null;
    this.state.day++; this.state.phase = 'planning'; this.state.guests = []; this.state.dirty = []; this.state.elapsed = 0; this.state.nextArrival = 1; this.state.totals = freshTotals(); this.relocateStaff();
    this.state.renovation = false; this.incomeReceipts = []; this.state.dailyChallenges = [];
    const errors = this.readiness();
    if (!renovate && !errors.length) { this.state.phase = 'service'; this.startChallenges(); this.event = `Day ${this.state.day}. Doors open again — yesterday’s receipt is in Ledger.`; }
    else this.event = renovate ? 'Closed for renovation. Reopen whenever you are ready.' : `Waiting for the owner: ${errors[0]}`;
  }
  /** Compatibility for older receipts; normal service rolls forward automatically. */
  nextDay(): void { if (this.state.phase === 'report') { this.beginNextDay(); this.changed(); } }
  closeEarly(): void { if (this.remote) { this.event = 'The daily service runs its full length.'; this.notify(); return; } if (this.state.phase === 'service') { this.state.renovation = true; this.state.elapsed = Math.max(this.len, this.state.elapsed); this.changed('Last orders, then renovation. Your team will finish serving before closing.'); } }
  // ---- the pass: what the owner can do while the doors are open ----------------------------------------------------------
  // ---- hosted service: inputs that arrive stamped with the tick they take effect on ----------------------------------------------
  /**
   * Set while this device is part of a hosted service. The pass methods hand their action to it instead of applying it, and it gets
   * the action back, stamped with a tick a little in the future, through `schedule`, the same on every device.
   */
  coop: { submit(action: Action): void } | null = null;
  /** Whose hands this device's pass controls are: 0 for the owner, 1 for a neighbor helping in a hosted service. */
  /** A panel the next screen should open on (set when a result card is closed). The game screen takes it and clears it. */
  nextPanel: 'build' | null = null;
  handsBy = 0;
  /** What this device's own hands did tonight. Memory only, not part of the saved state or the replay: it feeds the result card. */
  cooked: { plated: number; perfect: number; tookOver: number } = { plated: 0, perfect: 0, tookOver: 0 };
  /** Called after every step of the simulation. A hosted service uses it to publish and compare checksums. */
  afterStep: (() => void) | null = null;
  private scheduled: Action[] = [];
  private applying = false;
  /** Queue an action to take effect on its own tick, before that tick's step. Equal ticks keep the order they arrived in. */
  schedule(action: Action): void { let i = this.scheduled.length; while (i > 0 && this.scheduled[i - 1].tick > action.tick) i--; this.scheduled.splice(i, 0, action); }
  /** Forget everything queued (a resync starts from a fresh snapshot). */
  clearScheduled(): void { this.scheduled = []; }
  private applyScheduled(): void {
    while (this.scheduled.length && this.scheduled[0].tick <= this.tickCount()) { const a = this.scheduled.shift()!; this.applying = true; try { this.applyService(a); } finally { this.applying = false; } }
  }
  /** Apply one service action with the same methods a player's tap uses. Returns the refusal, if any. */
  applyService(a: Action): string | null {
    switch (a.kind) {
      case 'claimTicket': return this.claimTicket(a.guestId, a.by ?? 0);
      case 'cook': return this.plate(a.guestId, a.by);
      case 'abandon': return this.abandonCook(a.guestId, a.by);
      case 'priority': return this.rush(a.guestId);
      case 'comp': return this.comp(a.guestId);
      case 'hold': return this.holdPrep(a.guestId, a.by);
      case 'release': return this.releasePrep(a.guestId, a.by);
      default: return 'Not a service action.';
    }
  }
  /** In a hosted service a tap becomes a stamped action instead of an immediate change. */
  private intercept(kind: 'claimTicket' | 'cook' | 'abandon' | 'priority' | 'comp' | 'hold' | 'release', guestId: number, by?: number): boolean {
    if (!this.coop || this.applying) return false;
    this.coop.submit({ tick: this.tickCount(), kind, guestId, ...(by ? { by } : {}) } as Action); return true;
  }
  /** The ticket this device's own hands are cooking, if any. */
  myDish(): Guest | undefined { const h = this.state.hands.find(x => x.by === this.handsBy); return h ? this.state.guests.find(g => g.id === h.guestId) : undefined; }
  /** The tick the engine is on: how many 0.1 s steps this service has run. Service actions are stamped with it. */
  tickCount(): number { return Math.round(this.state.elapsed * 10); }
  private stationBusy(id: number): boolean { return this.state.staff.some(w => w.stationId === id && w.role === 'chef' && w.task !== 'idle') || this.state.guests.some(g => g.owner && g.stationId === id); }
  private failCook(guest: Guest, message: string): void {
    guest.owner = false; guest.cook = 0; guest.stage = 'waiting'; guest.stationId = null; this.state.hands = this.state.hands.filter(h => h.guestId !== guest.id); this.event = message; this.changed();
  }
  /** The service action to record: the `by` field only appears for a neighbor's hands, so a solo log is exactly as it always was. */
  private stamp<K extends 'claimTicket' | 'cook' | 'abandon' | 'hold' | 'release'>(kind: K, guestId: number, by: number): Action { return { tick: this.tickCount(), kind, guestId, ...(by > 0 ? { by } : {}) } as Action; }
  private handsOf(guestId: number): Hands | undefined { return this.state.hands.find(h => h.guestId === guestId); }
  /**
   * Whether you can still take this dish out of a chef's hands: the chef has not got far yet (walking to the stove, or less than half through
   * the cooking). Nothing changes unless someone taps, so a night played with no hands is exactly what it was.
   */
  canTakeOver(guest: Guest): boolean {
    if (guest.stage !== 'cooking' || guest.owner) return false;
    const chef = this.state.staff.find(w => w.role === 'chef' && w.guestId === guest.id); if (!chef) return false;
    return chef.task === 'toKitchen' || chef.task === 'cooking' && chef.timer > DISHES[guest.dish].seconds * (1 - (chef.level - 1) * .2) * .5;
  }
  /** Take a ticket and cook it yourself: a waiting one, or one a chef has only just started (the chef is freed for the next ticket). Each pair of hands cooks one dish at a time. */
  claimTicket(guestId: number, by = 0): string | null {
    if (this.intercept('claimTicket', guestId, by)) return null;
    const s = this.state; if (s.phase !== 'service') return 'The doors are closed.';
    const guest = s.guests.find(g => g.id === guestId); if (!guest) return 'That ticket is already being cooked.';
    const takeOver = guest.stage === 'cooking' && this.canTakeOver(guest);
    if (guest.stage !== 'waiting' && !takeOver) return guest.stage === 'cooking' && !guest.owner ? 'Your chef is almost done with that one.' : 'That ticket is already being cooked.';
    if (s.hands.some(h => h.by === by)) return 'Finish the dish you are cooking first.';
    if (takeOver) {
      // The ingredients are already paid and the stove is the chef's: the chef steps away and the dish starts over in your hands.
      s.staff.filter(w => w.guestId === guest.id && w.role === 'chef').forEach(resetStaff);
      guest.owner = true; guest.cook = 0; s.hands.push({ guestId, by, holding: false, prep: 0, quality: 0 }); if (by === this.handsBy) this.cooked.tookOver++;
      this.record(this.stamp('claimTicket', guestId, by)); this.changed(`${by ? 'A neighbor took' : 'You took'} over the ${DISHES[guest.dish].name.toLowerCase()}. Plate it when the bar is green.`); return null;
    }
    const station = s.furniture.find(f => f.kind === DISHES[guest.dish].station && !this.stationBusy(f.id)); if (!station) return 'Every ' + stationName(DISHES[guest.dish].station) + ' is busy.';
    const cost = dishCost(s, guest.dish); if (s.cash < cost) return 'Not enough cash for ingredients.';
    guest.stage = 'cooking'; guest.owner = true; guest.cook = 0; guest.stationId = station.id; s.cash -= cost; s.totals.ingredients += cost; s.hands.push({ guestId, by, holding: false, prep: 0, quality: 0 });
    this.record(this.stamp('claimTicket', guestId, by)); this.changed(`${by ? 'A neighbor is' : 'You are'} cooking ${DISHES[guest.dish].name.toLowerCase()}. Plate it when the bar is green.`); return null;
  }
  private settlePrep(guest: Guest): void {
    const h = this.handsOf(guest.id); if (!h) return;
    h.holding = false; if (h.prep > 0) h.quality = prepQuality(h.prep, guest.dish);
  }
  /** Whose dish this is, if `by` is given and does not match. */
  private notYours(h: Hands | undefined, by?: number): boolean { return by !== undefined && !!h && h.by !== by; }
  /** Start prepping the dish in your hands: chopping, trimming, seasoning. It counts for as long as you hold. */
  holdPrep(guestId: number, by?: number): string | null {
    if (this.intercept('hold', guestId, by)) return null;
    const guest = this.state.guests.find(g => g.id === guestId && g.owner), h = this.handsOf(guestId);
    if (!guest || !h) return 'There is nothing in your hands to prepare.';
    if (this.notYours(h, by)) return 'That is not your dish.';
    if (h.holding) return 'You are already preparing it.';
    h.holding = true; this.record(this.stamp('hold', guestId, h.by)); this.changed(); return null;
  }
  /** Stop prepping. How good it was depends only on how long you held, against the dish's ideal. */
  releasePrep(guestId: number, by?: number): string | null {
    if (this.intercept('release', guestId, by)) return null;
    const guest = this.state.guests.find(g => g.id === guestId && g.owner), h = this.handsOf(guestId);
    if (!guest || !h || !h.holding) return 'You are not preparing anything.';
    if (this.notYours(h, by)) return 'That is not your dish.';
    this.settlePrep(guest); this.record(this.stamp('release', guestId, h.by));
    this.changed(h.quality === 3 ? 'A clean, even prep.' : h.quality === 2 ? 'A decent prep.' : 'A rough prep. It will cost you at the plate.'); return null;
  }
  /** Plate the dish you are cooking. How well it went depends on how long it cooked and how it was prepped. */
  plate(guestId: number, by?: number): string | null {
    if (this.intercept('cook', guestId, by)) return null;
    const guest = this.state.guests.find(g => g.id === guestId && g.owner); if (!guest) return 'There is nothing to plate.';
    const hands = this.handsOf(guestId); if (this.notYours(hands, by)) return 'That is not your dish.';
    if (hands?.holding) this.settlePrep(guest); // plating lets go of whatever is in your hands
    const quality = plateQuality(cookQuality(guest.cook / DISHES[guest.dish].seconds), (hands?.quality ?? 0) as 0 | 1 | 2 | 3);
    this.record(this.stamp('cook', guestId, hands?.by ?? 0));
    if (quality === 0) { this.failCook(guest, guest.cook < DISHES[guest.dish].seconds * .6 ? 'Too early: the dish is still raw. The ingredients are lost.' : 'Too late: the dish burnt. The ingredients are lost.'); return null; }
    if ((hands?.by ?? 0) === this.handsBy) { this.cooked.plated++; if (quality === 3) this.cooked.perfect++; }
    guest.owner = false; guest.cook = 0; guest.quality = quality; guest.stage = 'ready'; this.state.hands = this.state.hands.filter(h => h.guestId !== guestId);
    this.changed(quality === 3 ? 'Perfect plate! The guest will tip more.' : quality === 2 ? 'Slightly over, but it goes out.' : 'Plated. A little early, but it goes out.'); return null;
  }
  /** Walk away from the dish. The ingredients are spent and the ticket goes back to the line. */
  abandonCook(guestId: number, by?: number): string | null {
    if (this.intercept('abandon', guestId, by)) return null;
    const guest = this.state.guests.find(g => g.id === guestId && g.owner); if (!guest) return 'There is nothing to put down.';
    const h = this.handsOf(guestId); if (this.notYours(h, by)) return 'That is not your dish.';
    this.record(this.stamp('abandon', guestId, h?.by ?? 0)); this.failCook(guest, 'The dish was put down. The ingredients are lost.'); return null;
  }
  /** Move a waiting ticket to the front of the line: the next free chef takes it first. */
  rush(guestId: number): string | null {
    if (this.intercept('priority', guestId)) return null;
    const guest = this.state.guests.find(g => g.id === guestId); if (this.state.phase !== 'service' || !guest || guest.stage !== 'waiting') return 'Only a ticket that is still waiting can be rushed.';
    if (guest.priority) return 'That ticket is already first in line.';
    guest.priority = true; this.record({ tick: this.tickCount(), kind: 'priority', guestId }); this.changed('Rushed to the front of the line.'); return null;
  }
  /** Comp a table: the meal is free, the guest stays happy and their patience starts over. Two a night. */
  comp(guestId: number): string | null {
    if (this.intercept('comp', guestId)) return null;
    const s = this.state, guest = s.guests.find(g => g.id === guestId);
    if (s.phase !== 'service' || !guest || !['waiting', 'cooking', 'ready', 'delivering'].includes(guest.stage)) return 'Only a guest still waiting for food can be comped.';
    if (guest.price === 0) return 'That table is already on the house.';
    if (s.comps >= COMPS_PER_NIGHT) return 'You can comp two tables a night.';
    guest.price = 0; guest.waiting = 0; s.comps++; this.record({ tick: this.tickCount(), kind: 'comp', guestId }); this.changed('On the house. The guest stays.'); return null;
  }
  private arrive(): void {
    const s = this.state;
    if (s.guests.length >= 20) return;
    let selected: { table: Furniture; seat: number } | undefined;
    for (const table of s.furniture.filter(f => f.kind === 'table')) for (let seat = 0; seat < 2; seat++) {
      if (!selected && !s.dirty.includes(`${table.id}:${seat}`) && !s.guests.some(g => g.tableId === table.id && g.seat === seat && g.stage !== 'leaving')) selected = { table, seat };
    }
    if (!selected) { s.totals.missed++; this.event = 'A guest found no free seat. More tables or faster clearing would help.'; return; }
    const dishes = DISH_IDS.filter(dish => s.menu[dish].enabled);
    const fx = this.fx;
    // A regular's slot is a fixed arrival (the 3rd, 7th, 11th, 15th), so it takes no random draw and a night without regulars is unchanged.
    s.night.arrivals++;
    const regular = s.regulars.find((_, k) => s.night.arrivals === 3 + 4 * k) ?? null;
    if (regular && dishes.length && !s.guests.some(g => g.regular === regular.name)) return this.arriveRegular(selected, regular, dishes);
    // Neighbors from the thread take the 2nd, 6th and 10th arrival. Also no random draw.
    const visitor = s.visitors.find((_, k) => s.night.arrivals === 2 + 4 * k) ?? null;
    if (visitor && dishes.length) return this.arriveVisitor(selected, visitor);
    let dish = dishes[Math.floor(this.random() * dishes.length)]; if (!dish) return;
    // Bright sun nudges toward the grill. The extra roll exists only when that weight is on, so other nights keep their random stream.
    if (fx.burgerBias > 0 && dish !== 'burger' && dishes.includes('burger') && this.random() < fx.burgerBias) dish = 'burger';
    const price = s.menu[dish].price;
    if (this.random() < Math.max(0, (price / DISHES[dish].fair - 1) * PRICE_SLOPE * fx.priceRoll)) { s.totals.missed++; s.night.refused++; this.event = 'A guest thought the menu was too expensive.'; return; }
    const route = this.route(entrance, accessPoints(selected.table)[selected.seat]); if (!route) return;
    route.push(seatPoint(selected.table, selected.seat));
    const special = fx.specialAlways || isSpecialGuest(s.day, s.nextId);
    s.guests.push({ id: s.nextId++, special, ...entrance, yaw: Math.PI, route, species: (['mouse', 'rabbit', 'bear', 'crocodile'] as const)[Math.floor(this.random() * 4)], tableId: selected.table.id, seat: selected.seat, dish, price, stage: 'arriving', waiting: 0, timer: 0, happy: false, stationId: null, paid: false, owner: false, cook: 0, quality: 0, priority: false, regular: null, visitor: null });
  }
  /** The regular sits and orders their usual if it is on the menu, and the first dish otherwise (which will not please them). They never turn at the door over price. */
  private arriveRegular(selected: { table: Furniture; seat: number }, regular: RestaurantState['regulars'][number], dishes: Dish[]): void {
    const s = this.state, dish = dishes.includes(regular.dish) ? regular.dish : dishes[0], route = this.route(entrance, accessPoints(selected.table)[selected.seat]); if (!route) return;
    route.push(seatPoint(selected.table, selected.seat));
    s.guests.push({ id: s.nextId++, special: false, ...entrance, yaw: Math.PI, route, species: regular.species, tableId: selected.table.id, seat: selected.seat, dish, price: s.menu[dish].price, stage: 'arriving', waiting: 0, timer: 0, happy: false, stationId: null, paid: false, owner: false, cook: 0, quality: 0, priority: false, regular: regular.name, visitor: null });
    this.event = `${regular.name} the ${regular.species} is here.`;
  }
  /** A neighbor orders their house dish if it is on the menu. If not, they look and move on: nobody is missed, nothing is lost. */
  private arriveVisitor(selected: { table: Furniture; seat: number }, visitor: RestaurantState['visitors'][number]): void {
    const s = this.state;
    if (!s.menu[visitor.dish].enabled) { this.event = `${visitor.name} came over from the thread, but nothing here was for them.`; this.settleVisitor(visitor.name, 'passed', 0, 0, 0); return; }
    const route = this.route(entrance, accessPoints(selected.table)[selected.seat]); if (!route) return;
    route.push(seatPoint(selected.table, selected.seat));
    let hash = 0; for (const ch of visitor.name) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
    s.guests.push({ id: s.nextId++, special: false, ...entrance, yaw: Math.PI, route, species: SPECIES[hash % SPECIES.length], tableId: selected.table.id, seat: selected.seat, dish: visitor.dish, price: s.menu[visitor.dish].price, stage: 'arriving', waiting: 0, timer: 0, happy: false, stationId: null, paid: false, owner: false, cook: 0, quality: 0, priority: false, regular: null, visitor: visitor.name });
    this.event = `${visitor.name} came over from the thread.`;
  }
  /** One entry per neighbor, written when their visit is settled. */
  private settleVisitor(name: string, outcome: 'served' | 'left' | 'passed', tip: number, wait: number, quality: number): void {
    const log = this.state.night.visitors; if (log.some(v => v.name === name)) return;
    log.push({ name, outcome, tip, wait: Math.round(wait), quality });
  }
  /** A regular's visit ends happy when they got their usual, did not wait long, and were not overcharged. */
  private regularVisit(guest: Guest, served: boolean): void {
    const r = this.state.regulars.find(item => item.name === guest.regular); if (!r) return;
    r.visits++; r.streak = served && guest.dish === r.dish && guest.waiting <= guestPatienceSeconds(this.state) * .6 && guest.price <= DISHES[guest.dish].fair * 1.15 ? r.streak + 1 : 0;
  }
  /** After the third service, one guest at a time asks to be a regular, up to four, from the fixed list of names. */
  private recruit(): void {
    const s = this.state; if (s.regulars.length >= MAX_REGULARS || s.regulars.length >= Math.floor((s.history.length - 1) / 2)) return;
    const dishes = DISH_IDS.filter(dish => s.menu[dish].enabled), pick = mixSeed(Math.imul(s.day, 7919) ^ Math.imul(s.regulars.length + 1, 104729));
    const free = REGULAR_NAMES.filter(name => !s.regulars.some(r => r.name === name)); if (!dishes.length || !free.length) return;
    const name = free[pick % free.length];
    s.regulars.push({ name, species: SPECIES[(pick >>> 8) % SPECIES.length], dish: dishes[(pick >>> 16) % dishes.length], visits: 0, streak: 0 });
    this.event = `${name} liked it here and will be back as a regular.`;
  }
  private leave(guest: Guest, happy: boolean): void {
    const table = this.state.furniture.find(f => f.id === guest.tableId); if (!table) return;
    const access = accessPoints(table)[guest.seat];
    guest.owner = false; guest.cook = 0; guest.stage = 'leaving'; guest.happy = happy; guest.timer = Math.max(0, guest.timer); this.state.hands = this.state.hands.filter(h => h.guestId !== guest.id);
    guest.route = [access, ...(this.route(access, entrance) ?? []), { x: entrance.x, z: entrance.z + 1 }];
    if (!happy) {
      this.state.totals.missed++; this.event = 'A guest waited too long. Another chef or server could help.';
      this.state.night.walkouts++; if (guest.regular) this.regularVisit(guest, false); if (guest.visitor) this.settleVisitor(guest.visitor, 'left', 0, guest.waiting, 0);
      if (guest.special && this.state.headline) this.state.headline.walkouts++;
      this.state.staff.filter(s => s.guestId === guest.id).forEach(resetStaff);
    }
  }
  private assignJobs(): void {
    const s = this.state;
    for (const member of s.staff) {
      if (member.task !== 'idle') continue;
      if (member.role === 'chef') {
        for (const guest of s.guests.filter(g => g.stage === 'waiting').sort((a, b) => Number(b.priority) - Number(a.priority))) {
          const station = s.furniture.find(f => f.kind === DISHES[guest.dish].station && !s.staff.some(worker => worker.stationId === f.id && worker.role === 'chef' && worker.task !== 'idle') && !s.guests.some(g => g.owner && g.stationId === f.id));
          const cost = dishCost(s, guest.dish);
          if (!station || s.cash < cost) continue;
          const route = this.route(member, accessPoints(station)[0]); if (!route) continue;
          guest.stage = 'cooking'; guest.stationId = station.id; member.guestId = guest.id; member.stationId = station.id; member.task = 'toKitchen'; member.route = route;
          s.cash -= cost; s.totals.ingredients += cost; break;
        }
      } else {
        const guest = s.guests.find(g => g.stage === 'ready');
        if (guest) {
          const station = s.furniture.find(f => f.id === guest.stationId);
          const route = station ? this.route(member, accessPoints(station)[0]) : null;
          if (route) { guest.stage = 'delivering'; member.guestId = guest.id; member.stationId = station?.id ?? null; member.task = 'collect'; member.route = route; continue; }
        }
        const dirty = s.dirty.find(key => !s.staff.some(worker => worker.task === 'clean' && `${worker.stationId}:${worker.guestId}` === key));
        if (dirty) {
          const [id, seat] = dirty.split(':').map(Number), table = s.furniture.find(f => f.id === id);
          const route = table ? this.route(member, accessPoints(table)[seat]) : null;
          if (route) { member.task = 'clean'; member.stationId = id; member.guestId = seat; member.route = route; member.timer = 2.5; }
        }
      }
    }
  }
  private step(dt: number): void {
    this.applyScheduled();
    const s = this.state; s.clock += dt; s.elapsed += dt;
    const fx = this.fx;
    if (s.elapsed < this.len && s.elapsed >= s.nextArrival) { this.arrive(); s.nextArrival = s.elapsed + (Math.max(5.5 + Math.min(0, fx.gapDelta), 9.5 - s.reputation * .6 - Math.min(s.day, 10) * .12 - Math.min(COMFORT_GAP_MAX, Math.max(0, comfort(s) - 20) * COMFORT_GAP) + fx.gapDelta) + this.random() * 2) * (1 - discountLift(s)); }
    // The inspector counts the dirty seats once, at the moment the doors close.
    if (!s.night.closed && s.elapsed >= this.len) { s.night.closed = true; s.night.dirtyAtClose = s.dirty.length; }
    if (s.headline && !s.headline.closed && s.elapsed >= this.len) { s.headline.closed = true; s.headline.dirtyAtClose = s.dirty.length; }
    for (const guest of s.guests) {
      if (guest.stage === 'arriving' && walk(guest, dt, 1.7 * fx.walk)) {
        guest.stage = 'waiting'; const table = s.furniture.find(f => f.id === guest.tableId); guest.yaw = Math.PI - (table?.rotation ?? 0) * Math.PI / 2;
      } else if (guest.stage === 'leaving') walk(guest, dt, 1.8 * fx.walk);
      else if (guest.stage === 'eating') {
        guest.timer -= dt;
        if (guest.timer <= 0) { s.dirty.push(seatKey(guest)); this.leave(guest, true); }
      } else if (['waiting', 'cooking', 'ready', 'delivering'].includes(guest.stage)) {
        guest.waiting += dt;
        if (guest.owner) { const hands = this.handsOf(guest.id); if (hands?.holding) hands.prep += dt; guest.cook += dt; if (guest.cook > DISHES[guest.dish].seconds * COOK_BURN) { this.failCook(guest, 'The dish burnt while you were away from it.'); continue; } }
        if (guest.waiting > guestPatienceSeconds(s)) this.leave(guest, false);
      }
    }
    s.guests = s.guests.filter(g => g.stage !== 'leaving' || g.route.length > 0);
    this.assignJobs();
    for (const staff of s.staff) {
      if (staff.task === 'idle') continue;
      if (!walk(staff, dt, (2 + (staff.level - 1) * .4) * fx.walk)) continue;
      if (staff.task === 'clean') {
        staff.timer -= dt / (1 - (staff.level - 1) * .17);
        if (staff.timer <= 0) { s.dirty = s.dirty.filter(key => key !== `${staff.stationId}:${staff.guestId}`); resetStaff(staff); }
        continue;
      }
      const guest = s.guests.find(g => g.id === staff.guestId);
      if (!guest || guest.stage === 'leaving') { resetStaff(staff); continue; }
      if (staff.task === 'toKitchen') {
        staff.task = 'cooking'; staff.timer = DISHES[guest.dish].seconds * (1 - (staff.level - 1) * .2);
        const station = s.furniture.find(f => f.id === staff.stationId); staff.yaw = Math.PI - (station?.rotation ?? 0) * Math.PI / 2;
      } else if (staff.task === 'cooking') { staff.timer -= dt; if (staff.timer <= 0) { guest.stage = 'ready'; resetStaff(staff); } }
      else if (staff.task === 'collect') {
        const table = s.furniture.find(f => f.id === guest.tableId), route = table ? this.route(staff, accessPoints(table)[guest.seat]) : null;
        if (route) { staff.route = route; staff.task = 'deliver'; }
      } else if (staff.task === 'deliver') {
        guest.stage = 'eating'; guest.timer = 10; guest.happy = true;
        if (!guest.paid) {
          const tip = Math.max(0, Math.round(guest.price * (.04 + comfort(s) * .001 * fx.tipComfort) * Math.max(.15, 1 - guest.waiting / 60) * (1 + Math.max(0, guest.quality - 1) * .075)));
          if (guest.regular) this.regularVisit(guest, true); if (guest.visitor) this.settleVisitor(guest.visitor, 'served', tip, guest.waiting, guest.quality);
          s.night.waitSeconds += guest.waiting; const earned = guest.price + tip; s.cash += earned; s.totals.revenue += guest.price; s.totals.tips += tip; s.totals.served++; s.lifetimeServed++; guest.paid = true;
          this.recordIncome(earned, 'service', guest.id, tip);
          this.event = `${DISHES[guest.dish].name} served. +$${earned}${tip ? ` including $${tip} tip` : ''}`;
          for (const challenge of advanceDailyChallenges(s.dailyChallenges, guest, tip)) {
            s.cash += challenge.reward; s.lifetimeChallengeBonus += challenge.reward;
            this.recordIncome(challenge.reward, 'challenge');
            this.event = `Daily challenge complete: ${challengeTitles[challenge.kind]}. +$${challenge.reward} automatically added.`;
            if (!this.catchingUp) this.rewardSavePending = true;
          }
        }
        resetStaff(staff);
      }
    }
    if (s.elapsed >= this.len && (s.guests.length === 0 && s.dirty.length === 0 || s.elapsed >= this.len + 90)) this.finish();
    this.afterStep?.();
  }
  private finish(): void {
    const s = this.state;
    for (const guest of s.guests) if (!guest.paid && guest.stage !== 'leaving') s.totals.missed++;
    const share = billsShare(s), wages = Math.round(s.staff.reduce((sum, staff) => sum + staffWage(staff), 0) * share), rent = Math.round((s.expanded ? 50 : 30) * share), debtPayment = Math.min(Math.round(30 * share), s.debt);
    const research = s.research.budget > 0 && s.cash - (wages + rent + debtPayment) >= s.research.budget ? s.research.budget : 0; s.research.points += research;
    const owed = s.debt; s.cash -= wages + rent + debtPayment + research; s.debt -= debtPayment; if (owed > 0 && s.debt === 0) s.streaks.loanCleared = 1;
    const fx = this.fx, h = s.headline;
    let rating = Math.max(1, Math.min(5, 3 + (s.totals.served / Math.max(1, s.totals.served + s.totals.missed)) * 1.5 + comfort(s) * .005 - s.totals.missed * .06 - (h ? h.dirtyAtClose * fx.dirtyPenalty : 0)));
    if (fx.criticCap && h && h.walkouts > 0) rating = Math.min(rating, 2);
    s.reputation = Math.round((s.reputation * .65 + rating * .35) * 100) / 100;
    const value = companyValue(s); if (value > s.best.value) s.best = { value, day: s.day };
    const profit = s.totals.revenue + s.totals.tips - s.totals.ingredients - wages - rent - debtPayment - research;
    const honest = DISH_IDS.filter(dish => s.menu[dish].enabled).every(dish => Math.abs(s.menu[dish].price - DISHES[dish].fair) <= HONEST_BAND);
    s.streaks.nailed++; s.streaks.honest = honest && profit > 0 ? s.streaks.honest + 1 : 0;
    s.history.push({ ...s.totals, headline: h ? h.id : null, challenges: s.dailyChallenges.map(c => ({ ...c })), day: s.day, wages, rent, debtPayment, research, profit, rating }); s.history = s.history.slice(-20);
    for (const g of s.guests) if (g.visitor && !g.paid) this.settleVisitor(g.visitor, 'left', 0, g.waiting, 0);
    this.recruit(); s.visitors = [];
    this.beginNextDay(); this.changed();
  }
}
function browserStorage(): StorageAdapter | undefined { return typeof window === 'undefined' ? undefined : { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) }; }
export const restaurant = new RestaurantEngine(browserStorage());
