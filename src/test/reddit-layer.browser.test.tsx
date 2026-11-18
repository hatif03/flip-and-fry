import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant, type RemoteSession } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { createDailyHeadline } from '@/management/daily-headline';
import { createRestaurant } from '@/management/types';
import type { LockResponse, TodayResponse } from '@/shared/api';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div data-testid="mock-scene" /> }));

const headline = createDailyHeadline('2026-12-09');
const today: TodayResponse = { type: 'today', date: '2026-12-09', headline, rev: 3, park: createRestaurant(), open: null, run: null, streak: 4, community: { opens: 5, locks: 2 } };
const lock = (stars: 0 | 1 | 2 | 3): LockResponse => ({
  type: 'lock', hash: 'abc', official: true, replaced: false, streak: 4, rev: 4, park: createRestaurant(),
  report: { ...createRestaurant().totals, served: 17, missed: 2, revenue: 400, tips: 38, ingredients: 150, headline: 'rain', challenges: [], day: 1, wages: 60, rent: 30, debtPayment: 0, profit: 198, rating: 4.2 },
  stars: { stars, goal: stars >= 1, challenges: stars >= 2 ? 3 : 1, beatPrevious: stars >= 3, goalText: 'Finish with a rating of 4.0 or better' },
});
function remote(result: LockResponse | null): RemoteSession { const r: RemoteSession = { open: async () => null, today, result, dismissResult() { r.result = null; restaurant.notify(); } }; return r; }

beforeEach(async () => { restaurant.reset(); restaurant.welcome(); restaurant.remote = null; await page.viewport(390, 844); });
afterEach(() => { restaurant.remote = null; });

it('shows nothing Reddit-specific in the plain browser game', async () => {
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByRole('complementary', { name: 'Today' })).not.toBeInTheDocument();
});

it('shows the date, the headline and the streak in the daily bar', async () => {
  restaurant.remote = remote(null);
  const screen = await render(<ManagementGame />);
  const bar = screen.getByRole('complementary', { name: 'Today' });
  await expect.element(bar).toBeVisible();
  await expect.element(bar).toHaveTextContent('Wed 9 Dec'); await expect.element(bar).toHaveTextContent(headline.title); await expect.element(bar).toHaveTextContent('4');
});

it('shows one result card with stars, the goal and the numbers, and Continue closes it', async () => {
  restaurant.remote = remote(lock(2));
  const screen = await render(<ManagementGame />);
  const card = screen.getByRole('dialog');
  await expect.element(card).toBeVisible();
  await expect.element(card).toHaveTextContent('A great night'); await expect.element(card).toHaveTextContent('Finish with a rating of 4.0 or better');
  await expect.element(card).toHaveTextContent('$198'); await expect.element(card).toHaveTextContent('4.2'); await expect.element(card).toHaveTextContent('official result');
  await expect.element(screen.getByRole('img', { name: '2 of 3 stars' })).toBeVisible();
  const button = screen.getByRole('button', { name: 'Continue' });
  const rect = (await button.element()).getBoundingClientRect(); expect(rect.height).toBeGreaterThanOrEqual(44);
  await button.click();
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument(); expect(restaurant.remote!.result).toBeNull();
});

it('says a no-star night is not a failure and that a practice night leaves the official result alone', async () => {
  const practice = lock(0); practice.official = false;
  restaurant.remote = remote(practice);
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByRole('dialog')).toHaveTextContent('Not quite tonight'); await expect.element(screen.getByRole('dialog')).toHaveTextContent('Practice night');
});

it('keeps the result card inside a phone screen', async () => {
  restaurant.remote = remote(lock(3));
  await render(<ManagementGame />);
  const rect = document.querySelector('[role="dialog"]')!.getBoundingClientRect();
  expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(390); expect(rect.bottom).toBeLessThanOrEqual(844);
});

it('hides actions that would diverge from the server and says why', async () => {
  restaurant.remote = remote(null);
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Restaurant settings' }).click();
  await expect.element(screen.getByRole('button', { name: 'Start a new restaurant' })).not.toBeInTheDocument();
  await expect.element(screen.getByText('One service a night · saved on Reddit')).toBeVisible();
});
