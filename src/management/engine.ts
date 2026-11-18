import { accessPoints, findPath, layoutError, placementError, seatPoint } from './layout';
import { COMPS_PER_NIGHT, COOK_BURN, cookQuality, CATALOG, COMFORT_GAP, COMFORT_GAP_MAX, DAY_LENGTH, DISHES, PRICE_SLOPE, SAVE_KEY, capacity, comfort, createRestaurant, discountLift, dishCost, entrance, freshTotals, guestPatienceSeconds, restaurantSchema, staffWage, width, type Dish, type Furniture, type Guest, type Point, type RestaurantState, type Role, type Staff } from './types';
import { headlineEffects, mixSeed, type DailyHeadline, type HeadlineEffects } from './daily-headline';

import { advanceDailyChallenges, createDailyChallenges, isSpecialGuest, challengeTitles } from './daily-challenges';
import type { CashReceipt } from './cash-feedback';
import type { Action } from './actions';
import type { LockResponse, TodayResponse } from '../shared/api';

export const GOALS = [
  { id: 'first-service', title: 'A warm welcome', text: 'Serve your first 5 guests', target: 5, reward: 180, value: (s: RestaurantState) => s.lifetimeServed },
  { id: 'atmosphere', title: 'Make it yours', text: 'Reach 50 atmosphere', target: 50, reward: 150, value: comfort },
  { id: 'more-tables', title: 'Room for everyone', text: 'Build 5 bistro tables', target: 5, reward: 250, value: (s: RestaurantState) => capacity(s) / 2 },
  { id: 'three-days', title: 'The neighborhood favorite', text: 'Complete 3 service days', target: 3, reward: 300, value: (s: RestaurantState) => s.history.length },
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
  pause(value: boolean): void { if (this.catchingUp) { this.pauseAfterCatchUp = value; return; } this.paused = value; this.accumulator = 0; this.changed(); }
  setSpeed(value: 1 | 2 | 3): void { if (this.catchingUp) return; this.speed = value; this.paused = false; this.changed(); }
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
    this.state.furniture = this.state.furniture.filter(f => f.id !== id); this.state.cash += Math.floor(CATALOG[item.kind].price * .7);
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
    this.state.menu[dish] = { enabled, price: Math.max(10, Math.min(60, Math.round(price))) }; this.record({ tick: 0, kind: 'dish', dish, enabled, price: this.state.menu[dish].price }); this.changed(); return null;
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
  setMusic(value: boolean): void { this.state.music = value; this.record({ tick: 0, kind: 'music', on: value }); this.changed(); }
  welcome(): void { this.state.welcomed = true; this.changed(); }
  reset(): void { if (this.remote) { this.event = 'Your restaurant is saved on Reddit and cannot be reset here.'; this.notify(); return; } this.rewardSavePending = false; this.pauseAfterCatchUp = null; this.catchingUp = false; this.backgrounded = false; this.awaySummary = null; this.speed = 1; this.incomeReceipts = []; this.state = createRestaurant(); this.paused = false; this.accumulator = 0; this.savedAt = 0; this.loadWarning = ''; this.changed('A fresh beginning. Make this rooftop your own.'); }
  readiness(): string[] {
    const errors: string[] = [];
    if (!capacity(this.state)) errors.push('Build at least one bistro table.');
    for (const dish of ['salad', 'burger'] as const) if (this.state.menu[dish].enabled && !this.state.furniture.some(f => f.kind === DISHES[dish].station)) errors.push(`Add a ${DISHES[dish].station === 'prep' ? 'prep counter' : 'grill'} for ${DISHES[dish].name.toLowerCase()}, or remove it from the menu.`);
    if (this.state.cash < this.operatingCost() + 30) errors.push(`Keep $${this.operatingCost() + 30} for wages, rent and starting ingredients.`);
    const layout = layoutError(this.state.furniture, width(this.state)); if (layout) errors.push(layout);
    return errors;
  }
  operatingCost(): number { return this.state.staff.reduce((sum, staff) => sum + staffWage(staff), 0) + (this.state.expanded ? 50 : 30); }
  /** Open the doors. With a headline, its seed is mixed into the engine seed so every kitchen sees a different queue. */
  open(headline?: DailyHeadline): string | null {
    if (this.state.phase !== 'planning') return 'The restaurant is already open.';
    const errors = this.readiness(); if (errors.length) return errors[0];
    if (headline) {
      this.state.seed = mixSeed(this.state.seed ^ headline.seed);
      this.state.headline = { id: headline.id, date: headline.date, seed: headline.seed, walkouts: 0, dirtyAtClose: 0, closed: false };
    } else this.state.headline = null;
    Object.assign(this.state, { phase: 'service', renovation: false, elapsed: 0, nextArrival: 1, totals: freshTotals(), guests: [], dirty: [], comps: 0 });
    this.startChallenges(); this.relocateStaff(); this.paused = false; this.accumulator = 0; this.changed('Doors open. Your team has it from here.'); return null;
  }
  private startChallenges(): void {
    if (this.state.dailyChallenges.length) return;
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
  closeEarly(): void { if (this.remote) { this.event = 'The daily service runs its full length.'; this.notify(); return; } if (this.state.phase === 'service') { this.state.renovation = true; this.state.elapsed = Math.max(DAY_LENGTH, this.state.elapsed); this.changed('Last orders, then renovation. Your team will finish serving before closing.'); } }
  // ---- the pass: what the owner can do while the doors are open ----------------------------------------------------------
  /** The tick the engine is on: how many 0.1 s steps this service has run. Service actions are stamped with it. */
  tickCount(): number { return Math.round(this.state.elapsed * 10); }
  private stationBusy(id: number): boolean { return this.state.staff.some(w => w.stationId === id && w.role === 'chef' && w.task !== 'idle') || this.state.guests.some(g => g.owner && g.stationId === id); }
  private failCook(guest: Guest, message: string): void {
    guest.owner = false; guest.cook = 0; guest.stage = 'waiting'; guest.stationId = null; this.event = message; this.changed();
  }
  /** Take a waiting ticket and cook it yourself. You have one pair of hands: one dish at a time. */
  claimTicket(guestId: number): string | null {
    const s = this.state; if (s.phase !== 'service') return 'The doors are closed.';
    const guest = s.guests.find(g => g.id === guestId); if (!guest || guest.stage !== 'waiting') return 'That ticket is already being cooked.';
    if (s.guests.some(g => g.owner)) return 'Finish the dish you are cooking first.';
    const station = s.furniture.find(f => f.kind === DISHES[guest.dish].station && !this.stationBusy(f.id)); if (!station) return 'Every ' + (DISHES[guest.dish].station === 'prep' ? 'prep counter' : 'grill') + ' is busy.';
    const cost = dishCost(s, guest.dish); if (s.cash < cost) return 'Not enough cash for ingredients.';
    guest.stage = 'cooking'; guest.owner = true; guest.cook = 0; guest.stationId = station.id; s.cash -= cost; s.totals.ingredients += cost;
    this.record({ tick: this.tickCount(), kind: 'claimTicket', guestId }); this.changed(`You are cooking ${DISHES[guest.dish].name.toLowerCase()}. Plate it when the bar is green.`); return null;
  }
  /** Plate the dish you are cooking. How well it went depends only on how long it cooked. */
  plate(guestId: number): string | null {
    const guest = this.state.guests.find(g => g.id === guestId && g.owner); if (!guest) return 'There is nothing to plate.';
    const quality = cookQuality(guest.cook / DISHES[guest.dish].seconds);
    this.record({ tick: this.tickCount(), kind: 'cook', guestId });
    if (quality === 0) { this.failCook(guest, guest.cook < DISHES[guest.dish].seconds * .6 ? 'Too early: the dish is still raw. The ingredients are lost.' : 'Too late: the dish burnt. The ingredients are lost.'); return null; }
    guest.owner = false; guest.cook = 0; guest.quality = quality; guest.stage = 'ready';
    this.changed(quality === 3 ? 'Perfect plate! The guest will tip more.' : quality === 2 ? 'Slightly over, but it goes out.' : 'Plated. A little early, but it goes out.'); return null;
  }
  /** Walk away from the dish. The ingredients are spent and the ticket goes back to the line. */
  abandonCook(guestId: number): string | null {
    const guest = this.state.guests.find(g => g.id === guestId && g.owner); if (!guest) return 'There is nothing to put down.';
    this.record({ tick: this.tickCount(), kind: 'abandon', guestId }); this.failCook(guest, 'You put the dish down. The ingredients are lost.'); return null;
  }
  /** Move a waiting ticket to the front of the line: the next free chef takes it first. */
  rush(guestId: number): string | null {
    const guest = this.state.guests.find(g => g.id === guestId); if (this.state.phase !== 'service' || !guest || guest.stage !== 'waiting') return 'Only a ticket that is still waiting can be rushed.';
    if (guest.priority) return 'That ticket is already first in line.';
    guest.priority = true; this.record({ tick: this.tickCount(), kind: 'priority', guestId }); this.changed('Rushed to the front of the line.'); return null;
  }
  /** Comp a table: the meal is free, the guest stays happy and their patience starts over. Two a night. */
  comp(guestId: number): string | null {
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
    const dishes = (['salad', 'burger'] as const).filter(dish => s.menu[dish].enabled);
    const fx = this.fx;
    let dish = dishes[Math.floor(this.random() * dishes.length)]; if (!dish) return;
    // Bright sun nudges toward the grill. The extra roll exists only when that weight is on, so other nights keep their random stream.
    if (fx.burgerBias > 0 && dish !== 'burger' && dishes.includes('burger') && this.random() < fx.burgerBias) dish = 'burger';
    const price = s.menu[dish].price;
    if (this.random() < Math.max(0, (price / DISHES[dish].fair - 1) * PRICE_SLOPE * fx.priceRoll)) { s.totals.missed++; this.event = 'A guest thought the menu was too expensive.'; return; }
    const route = this.route(entrance, accessPoints(selected.table)[selected.seat]); if (!route) return;
    route.push(seatPoint(selected.table, selected.seat));
    const special = fx.specialAlways || isSpecialGuest(s.day, s.nextId);
    s.guests.push({ id: s.nextId++, special, ...entrance, yaw: Math.PI, route, species: (['mouse', 'rabbit', 'bear', 'crocodile'] as const)[Math.floor(this.random() * 4)], tableId: selected.table.id, seat: selected.seat, dish, price, stage: 'arriving', waiting: 0, timer: 0, happy: false, stationId: null, paid: false, owner: false, cook: 0, quality: 0, priority: false });
  }
  private leave(guest: Guest, happy: boolean): void {
    const table = this.state.furniture.find(f => f.id === guest.tableId); if (!table) return;
    const access = accessPoints(table)[guest.seat];
    guest.owner = false; guest.cook = 0; guest.stage = 'leaving'; guest.happy = happy; guest.timer = Math.max(0, guest.timer);
    guest.route = [access, ...(this.route(access, entrance) ?? []), { x: entrance.x, z: entrance.z + 1 }];
    if (!happy) {
      this.state.totals.missed++; this.event = 'A guest waited too long. Another chef or server could help.';
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
    const s = this.state; s.clock += dt; s.elapsed += dt;
    const fx = this.fx;
    if (s.elapsed < DAY_LENGTH && s.elapsed >= s.nextArrival) { this.arrive(); s.nextArrival = s.elapsed + (Math.max(5.5 + Math.min(0, fx.gapDelta), 9.5 - s.reputation * .6 - Math.min(s.day, 10) * .12 - Math.min(COMFORT_GAP_MAX, Math.max(0, comfort(s) - 20) * COMFORT_GAP) + fx.gapDelta) + this.random() * 2) * (1 - discountLift(s)); }
    // The inspector counts the dirty seats once, at the moment the doors close.
    if (s.headline && !s.headline.closed && s.elapsed >= DAY_LENGTH) { s.headline.closed = true; s.headline.dirtyAtClose = s.dirty.length; }
    for (const guest of s.guests) {
      if (guest.stage === 'arriving' && walk(guest, dt, 1.7 * fx.walk)) {
        guest.stage = 'waiting'; const table = s.furniture.find(f => f.id === guest.tableId); guest.yaw = Math.PI - (table?.rotation ?? 0) * Math.PI / 2;
      } else if (guest.stage === 'leaving') walk(guest, dt, 1.8 * fx.walk);
      else if (guest.stage === 'eating') {
        guest.timer -= dt;
        if (guest.timer <= 0) { s.dirty.push(seatKey(guest)); this.leave(guest, true); }
      } else if (['waiting', 'cooking', 'ready', 'delivering'].includes(guest.stage)) {
        guest.waiting += dt;
        if (guest.owner) { guest.cook += dt; if (guest.cook > DISHES[guest.dish].seconds * COOK_BURN) { this.failCook(guest, 'The dish burnt while you were away from it.'); continue; } }
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
          const earned = guest.price + tip; s.cash += earned; s.totals.revenue += guest.price; s.totals.tips += tip; s.totals.served++; s.lifetimeServed++; guest.paid = true;
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
    if (s.elapsed >= DAY_LENGTH && (s.guests.length === 0 && s.dirty.length === 0 || s.elapsed >= DAY_LENGTH + 90)) this.finish();
  }
  private finish(): void {
    const s = this.state;
    for (const guest of s.guests) if (!guest.paid && guest.stage !== 'leaving') s.totals.missed++;
    const wages = s.staff.reduce((sum, staff) => sum + staffWage(staff), 0), rent = s.expanded ? 50 : 30, debtPayment = Math.min(30, s.debt);
    s.cash -= wages + rent + debtPayment; s.debt -= debtPayment;
    const fx = this.fx, h = s.headline;
    let rating = Math.max(1, Math.min(5, 3 + (s.totals.served / Math.max(1, s.totals.served + s.totals.missed)) * 1.5 + comfort(s) * .005 - s.totals.missed * .06 - (h ? h.dirtyAtClose * fx.dirtyPenalty : 0)));
    if (fx.criticCap && h && h.walkouts > 0) rating = Math.min(rating, 2);
    s.reputation = Math.round((s.reputation * .65 + rating * .35) * 100) / 100;
    s.history.push({ ...s.totals, headline: h ? h.id : null, challenges: s.dailyChallenges.map(c => ({ ...c })), day: s.day, wages, rent, debtPayment, profit: s.totals.revenue + s.totals.tips - s.totals.ingredients - wages - rent - debtPayment, rating }); s.history = s.history.slice(-20);
    this.beginNextDay(); this.changed();
  }
}
function browserStorage(): StorageAdapter | undefined { return typeof window === 'undefined' ? undefined : { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) }; }
export const restaurant = new RestaurantEngine(browserStorage());
