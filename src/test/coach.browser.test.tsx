import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant, type RemoteSession } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { createDailyHeadline } from '@/management/daily-headline';
import { DISHES, MOVE_AT, createRestaurant } from '@/management/types';
import type { TodayResponse, TourId } from '@/shared/api';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div data-testid="mock-scene" /> }));

const headline = createDailyHeadline('2026-12-09');
const today: TodayResponse = { type: 'today', date: '2026-12-09', headline, rev: 3, park: createRestaurant(), open: null, run: null, streak: 0, community: { opens: 0, locks: 0 } };
function remote(seen: TourId[] = []): RemoteSession & { marks: TourId[] } {
  const marks: TourId[] = [], set = new Set<TourId>(seen);
  const r = { open: async () => restaurant.open(headline), today, result: null, dismissResult() { r.result = null; restaurant.notify(); }, marks,
    tour: { seen: set, mark(id: TourId) { marks.push(id); set.add(id); restaurant.notify(); } } } as RemoteSession & { marks: TourId[]; result: null };
  return r;
}
const beat = (): string | undefined => document.querySelector<HTMLElement>('[data-testid="coach"]')?.dataset.beat;
const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0));

beforeEach(async () => { restaurant.reset(); restaurant.welcome(); restaurant.remote = null; restaurant.state.shift = 'lunch'; await page.viewport(360, 760); });
afterEach(() => { restaurant.remote = null; restaurant.pause(false); });

it('welcomes a new owner, then points at Open; the hint line stays quiet', async () => {
  const r = remote(); restaurant.remote = r;
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByRole('status', { name: 'Guide' })).toHaveTextContent('You own Little Rooftop');
  await expect.element(screen.getByRole('status', { name: 'Hint' })).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Let’s cook' }).click();
  expect(r.marks).toContain('welcome');
  await expect.element(screen.getByRole('status', { name: 'Guide' })).toHaveTextContent('Open the doors');
});

it('can be skipped, and then stays away', async () => {
  const r = remote(); restaurant.remote = r;
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Skip the tour' }).click();
  expect(r.marks).toContain('skip');
  await expect.element(screen.getByTestId('coach')).not.toBeInTheDocument();
});

it('walks a whole lunch: each job frozen until the player does it, the cooking at half speed', async () => {
  const r = remote(['welcome']); restaurant.remote = r;
  await render(<ManagementGame />);
  document.querySelector<HTMLElement>('[data-tour="open"]')!.click();
  await expect.poll(() => restaurant.state.phase).toBe('service');
  const seen: string[] = [];
  for (let i = 0; i < 3000 && restaurant.state.phase === 'service' && !seen.includes('free'); i++) {
    await settle();
    const b = beat();
    if (b && seen[seen.length - 1] !== b) seen.push(b);
    if (b === 'seat' || b === 'order' || b === 'cook' || b === 'serve' || b === 'clear') {
      expect(restaurant.paused).toBe(true);
      document.querySelector<HTMLElement>(`[data-tour="${b}"]`)?.click();
    } else if (b === 'bar') {
      expect(restaurant.paused).toBe(true);
      [...document.querySelectorAll<HTMLButtonElement>('button')].find(x => x.textContent === 'Start cooking')!.click();
    } else if (b === 'timing') {
      expect(restaurant.speed).toBe(.5);
      const g = restaurant.myDish()!, h = restaurant.state.hands.find(x => x.guestId === g.id)!, ratio = g.cook / DISHES[g.dish].seconds;
      if (!h.moved && ratio >= MOVE_AT) restaurant.move(g.id);
      if (ratio >= 1) restaurant.plate(g.id);
    } else if (b === 'free') {
      [...document.querySelectorAll<HTMLButtonElement>('button')].find(x => x.textContent === 'Got it')!.click();
    }
    restaurant.update(.25);
  }
  expect(seen).toEqual(expect.arrayContaining(['seat', 'order', 'cook', 'bar', 'timing', 'serve', 'clear', 'free']));
  expect(r.marks).toContain('lunch');
  await expect.poll(() => beat()).toBeUndefined();
  expect(restaurant.paused).toBe(false);
  expect(restaurant.speed).toBe(1);
});

it('never runs after the first day', async () => {
  restaurant.remote = remote(); restaurant.state.history = [{ ...createRestaurant().totals } as never, { ...createRestaurant().totals } as never];
  await render(<ManagementGame />); await settle();
  expect(beat() === undefined || beat() === 'intro').toBe(true); // only the ladder's introduction cards, never the lessons
});

it('after the first lunch, walks through buying a cosy table, then says what tomorrow is for', async () => {
  const r = remote(['welcome', 'lunch', 'card']); restaurant.remote = r;
  restaurant.state.history = [{ ...createRestaurant().totals } as never]; restaurant.state.cash = 2000;
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByRole('status', { name: 'Guide' })).toHaveTextContent('open Build');
  document.querySelector<HTMLElement>('[data-tour="tab-build"]')!.click();
  await expect.element(screen.getByRole('status', { name: 'Guide' })).toHaveTextContent('another table');
  document.querySelector<HTMLElement>('[data-tour="shop-table"]')!.click();
  await expect.element(screen.getByRole('status', { name: 'Guide' })).toHaveTextContent('gold tile');
  document.querySelector<HTMLElement>('[data-tour="confirm"]')!.click();
  await expect.element(screen.getByRole('status', { name: 'Guide' })).toHaveTextContent('Dinner is open now');
  await screen.getByRole('button', { name: 'Got it' }).click();
  expect(r.marks).toEqual(expect.arrayContaining(['build', 'done']));
  await expect.poll(() => beat()).toBe('intro'); // the lesson is over; the ladder introduces Goals next
  await expect.element(screen.getByRole('status', { name: 'Guide' })).toHaveTextContent('New: Goals');
});

it('grows the dock with the player and introduces each new tab once', async () => {
  const r = remote(['welcome', 'lunch', 'card', 'build', 'done', 'intro-goals', 'intro-dinner']); restaurant.remote = r;
  const report = { ...createRestaurant().totals, day: 1, headline: null, challenges: [], wages: 0, rent: 0, debtPayment: 0, research: 0, profit: 0, rating: 4 } as never;
  restaurant.state.history = [report];
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByRole('button', { name: 'Build', exact: true })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Menu', exact: true })).not.toBeInTheDocument();
  await expect.element(screen.getByRole('button', { name: 'Team', exact: true })).not.toBeInTheDocument();
  restaurant.state.history = [report, report]; restaurant.notify();
  await expect.element(screen.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
  await expect.element(screen.getByRole('status', { name: 'Guide' })).toHaveTextContent('New: Menu');
  await screen.getByRole('button', { name: 'Got it' }).click();
  expect(r.marks).toContain('intro-menu');
  await expect.element(screen.getByRole('status', { name: 'Guide' })).toHaveTextContent('New: the Garden');
});

it('from the second night, says what to do about the headline, with the panel that does it', async () => {
  const seen: TourId[] = ['welcome', 'lunch', 'card', 'build', 'done', 'intro-goals', 'intro-dinner', 'intro-menu', 'intro-garden', 'intro-kitchen'];
  restaurant.remote = remote(seen);
  const report = { ...createRestaurant().totals, day: 1, headline: null, challenges: [], wages: 0, rent: 0, debtPayment: 0, research: 0, profit: 0, rating: 4 } as never;
  restaurant.state.history = [report, report];
  const screen = await render(<ManagementGame />);
  const tip = screen.getByLabelText("Tonight's tip");
  await expect.element(tip).toHaveTextContent('Comfort counts more'); // 9 Dec is "Rain on the roof"
  await tip.getByRole('button', { name: /build/i }).click();
  await expect.element(screen.getByRole('complementary', { name: 'Interiors' })).toBeVisible();
});

it('shows the three stars filling in on the night bar during service', async () => {
  restaurant.remote = remote(['skip']); restaurant.state.shift = 'dinner'; // a returning owner: the first service ever is always lunch
  restaurant.state.history = [{ ...createRestaurant().totals, day: 1, headline: null, challenges: [], wages: 0, rent: 0, debtPayment: 0, research: 0, profit: 90, rating: 4 } as never];
  const screen = await render(<ManagementGame />);
  document.querySelector<HTMLElement>('[data-tour="open"]')!.click();
  await expect.poll(() => restaurant.state.phase).toBe('service');
  await expect.element(screen.getByLabelText(/^Second star: two of three challenges, 0 so far/)).toBeInTheDocument();
  await expect.element(screen.getByLabelText(/^Third star: beat/)).toBeInTheDocument();
  await expect.element(screen.getByLabelText(/^First star, tonight's goal/)).toBeInTheDocument();
});
