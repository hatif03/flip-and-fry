import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant, type RemoteSession } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { createDailyHeadline } from '@/management/daily-headline';
import { createRestaurant } from '@/management/types';
import type { LockResponse, TodayResponse } from '@/shared/api';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: ({ weatherMode }: { weatherMode: string }) => <div data-testid="mock-scene" data-weather={weatherMode} /> }));

const headline = createDailyHeadline('2026-12-09');
const today: TodayResponse = { type: 'today', date: '2026-12-09', headline, rev: 3, park: createRestaurant(), open: null, run: null, streak: 4, community: { opens: 5, locks: 2 } };
const lock = (stars: 0 | 1 | 2 | 3): LockResponse => ({
  type: 'lock', hash: 'abc', official: true, replaced: false, streak: 4, rev: 4, park: createRestaurant(),
  report: { ...createRestaurant().totals, served: 17, missed: 2, revenue: 400, tips: 38, ingredients: 150, headline: 'rain', challenges: [], day: 1, wages: 60, rent: 30, debtPayment: 0, profit: 198, rating: 4.2 },
  stars: { stars, goal: stars >= 1, challenges: stars >= 2 ? 3 : 1, beatPrevious: stars >= 3, goalText: 'Finish with a rating of 4.0 or better' },
});
function remote(result: LockResponse | null, run: TodayResponse['run'] = null): RemoteSession { const r: RemoteSession = { open: async () => null, today: { ...today, run }, result, dismissResult() { r.result = null; restaurant.notify(); } }; return r; }

beforeEach(async () => { restaurant.reset(); restaurant.welcome(); restaurant.remote = null; await page.viewport(360, 760); });
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

it('tells the player the goal and what to do before opening', async () => {
  restaurant.remote = remote(null);
  const screen = await render(<ManagementGame />), bar = screen.getByRole('complementary', { name: 'Today' });
  await expect.element(bar).toHaveTextContent('Goal: Finish with a rating of 4.0 or better');
  await expect.element(bar).toHaveTextContent('Set up first: build tables and decor, hire a team, set prices. Then tap Open');
});

it('says what is happening while the doors are open', async () => {
  restaurant.remote = remote(null); restaurant.open();
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByRole('complementary', { name: 'Today' })).toHaveTextContent('Your team is cooking, serving and cleaning');
});

it('explains that only the best night of the day counts once a result is saved', async () => {
  const saved = lock(2); restaurant.remote = remote(null, { report: saved.report, stars: saved.stars, hash: saved.hash, headline: 'rain', submittedAt: 0, username: 'a' });
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByRole('complementary', { name: 'Today' })).toHaveTextContent('only your best night of the day counts');
});

it('never covers the cash and reputation stats on a narrow phone', async () => {
  restaurant.remote = remote(null);
  const screen = await render(<ManagementGame />);
  const bar = (await screen.getByRole('complementary', { name: 'Today' }).element()).getBoundingClientRect(), stats = (await screen.getByText('Reputation').element()).getBoundingClientRect();
  expect(bar.top).toBeGreaterThanOrEqual(stats.bottom); expect(bar.left).toBeGreaterThanOrEqual(0); expect(bar.right).toBeLessThanOrEqual(360);
});

it('shows the weather the headline promises, and hides the manual weather picker', async () => {
  restaurant.remote = remote(null);
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByTestId('mock-scene')).toHaveAttribute('data-weather', 'rain'); // Wednesday is Rain on the roof
  await screen.getByRole('button', { name: 'Restaurant settings' }).click();
  await expect.element(screen.getByRole('radio', { name: 'Bright sun' })).not.toBeInTheDocument();
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

it('folds the management tabs away while the doors are open on Reddit, keeps the controls, and brings the tabs back after', async () => {
  restaurant.remote = remote(null);
  const screen = await render(<ManagementGame />);
  const tabs = screen.getByRole('navigation', { name: 'Restaurant management' });
  await expect.element(tabs).toBeVisible();
  restaurant.open(); // a local open stands in for the server-confirmed one
  await expect.element(screen.getByRole('navigation', { name: 'Restaurant management' })).not.toBeInTheDocument();
  const pause = screen.getByRole('button', { name: 'Pause service' });
  await expect.element(pause).toBeVisible(); expect((await pause.element()).getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  await expect.element(screen.getByText('Saved on Reddit')).toBeVisible();
  restaurant.state.phase = 'planning'; restaurant.notify();
  await expect.element(screen.getByRole('navigation', { name: 'Restaurant management' })).toBeVisible();
});

it('keeps the tabs in the plain browser game while the doors are open', async () => {
  const screen = await render(<ManagementGame />);
  restaurant.open();
  await expect.element(screen.getByRole('navigation', { name: 'Restaurant management' })).toBeVisible();
  await expect.element(screen.getByText('Saved on this device')).toBeVisible();
});
