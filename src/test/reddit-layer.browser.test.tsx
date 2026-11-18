import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { restaurant, type RemoteSession } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { createDailyHeadline } from '@/management/daily-headline';
import { createRestaurant } from '@/management/types';
import type { LockResponse, TodayResponse } from '@/shared/api';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: ({ weatherMode }: { weatherMode: string }) => <div data-testid="mock-scene" data-weather={weatherMode} /> }));

const headline = createDailyHeadline('2026-12-09');
const today: TodayResponse = { type: 'today', date: '2026-12-09', headline, rev: 3, park: createRestaurant(), open: null, run: null, streak: 4, community: { opens: 5, locks: 2 } };
const NIGHT = { neighbors: [], card: { welcome: 72, speed: 64, value: 88 }, award: { id: 'warm' as const, title: 'Warmest room', text: 'A cozy room and almost nobody walked out.' }, companyValue: 2400, best: { value: 2400, day: 1 }, newBest: true, avgWait: 12, pathLength: 9 };
const lock = (stars: 0 | 1 | 2 | 3): LockResponse => ({
  type: 'lock', night: NIGHT, hash: 'abc', official: true, replaced: false, streak: 4, rev: 4, park: createRestaurant(),
  report: { ...createRestaurant().totals, served: 17, missed: 2, revenue: 400, tips: 38, ingredients: 150, headline: 'rain', challenges: [], day: 1, wages: 60, rent: 30, debtPayment: 0, research: 0, profit: 198, rating: 4.2 },
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

it('puts the moderators’ neighborhood name in front of the date, and leaves it out when none is set', async () => {
  restaurant.remote = { ...remote(null), today: { ...today, neighborhood: 'Maple Street' } };
  const screen = await render(<ManagementGame />), bar = screen.getByRole('complementary', { name: 'Today' });
  await expect.element(bar).toHaveTextContent('Maple Street · Wed 9 Dec');
  await screen.unmount(); restaurant.remote = remote(null);
  const plain = await render(<ManagementGame />);
  await expect.element(plain.getByRole('complementary', { name: 'Today' })).not.toHaveTextContent('· Wed');
  await expect.element(plain.getByRole('complementary', { name: 'Today' })).toHaveTextContent('Wed 9 Dec');
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
  const saved = lock(2); restaurant.remote = remote(null, { report: saved.report, stars: saved.stars, hash: saved.hash, headline: 'rain', submittedAt: 0, username: 'a', night: NIGHT, name: 'Little Rooftop', style: 'Garden & Grill' });
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

describe('the end of the night: award, kitchen card and optional sharing', () => {
  function social(overrides: Partial<RemoteSession> = {}) {
    const posted: string[] = [], r = remote(lock(2));
    Object.assign(r, {
      social: { posted: false, flair: null as string | null, followed: false },
      previewComment: vi.fn(async (note: string) => ({ text: `Little Rooftop · Garden & Grill · Warmest room · rating 4.2 · 4-day streak${note ? `\n\n${note}` : ''}`, reply: !note })),
      postResult: vi.fn(async (note: string) => { posted.push(note); r.social!.posted = true; restaurant.notify(); return null; }),
      wearFlair: vi.fn(async () => { r.social!.flair = 'Regular'; restaurant.notify(); return null; }),
      follow: vi.fn(async () => { r.social!.followed = true; restaurant.notify(); return null; }),
      ...overrides,
    });
    restaurant.remote = r; return { r, posted };
  }

  it('shows the award banner, the three kitchen card meters and the company value on the one card', async () => {
    social(); const screen = await render(<ManagementGame />), card = screen.getByRole('dialog');
    await expect.element(card).toHaveTextContent('Warmest room.'); await expect.element(card).toHaveTextContent('A cozy room and almost nobody walked out.');
    for (const [name, value] of [['Welcome', 72], ['Speed', 64], ['Value', 88]] as const) await expect.element(screen.getByRole('progressbar', { name })).toHaveAttribute('aria-valuenow', String(value));
    await expect.element(card).toHaveTextContent('Company value $2,400'); await expect.element(card).toHaveTextContent('a new best!');
  });

  it('lists the neighbors from the thread in plain words, and nothing when nobody came', async () => {
    const withNeighbors = { ...lock(2), night: { ...NIGHT, neighbors: [{ name: 'bob', outcome: 'served' as const, tip: 3, wait: 12, quality: 3 }, { name: 'cara', outcome: 'left' as const, tip: 0, wait: 40, quality: 0 }, { name: 'dan', outcome: 'passed' as const, tip: 0, wait: 0, quality: 0 }] } };
    restaurant.remote = remote(withNeighbors); const screen = await render(<ManagementGame />); const list = screen.getByRole('region', { name: 'Neighbors tonight' });
    await expect.element(list).toHaveTextContent('bob was served in 12s, perfectly cooked and left a $3 tip'); await expect.element(list).toHaveTextContent('cara waited too long and left'); await expect.element(list).toHaveTextContent('dan looked in, but nothing on the menu was for them');
  });
  it('shows no neighbors section when nobody came', async () => {
    restaurant.remote = remote(lock(2)); const none = await render(<ManagementGame />);
    await expect.element(none.getByText('Nice work.').or(none.getByRole('dialog'))).toBeVisible();
    expect(document.querySelector('[aria-label="Neighbors tonight"]')).toBeNull();
  });
  it('has three separate optional buttons, and Continue works without touching any of them', async () => {
    const { r } = social(); const screen = await render(<ManagementGame />);
    for (const name of [/Post this result/, /Wear .Regular. flair|Wear .*flair/, /Follow this kitchen/]) await expect.element(screen.getByRole('button', { name })).toBeVisible();
    await screen.getByRole('button', { name: 'Continue' }).click(); expect(r.result).toBeNull(); expect(r.postResult).not.toHaveBeenCalled(); expect(r.wearFlair).not.toHaveBeenCalled(); expect(r.follow).not.toHaveBeenCalled();
  });

  it('shows the exact comment and who it posts as before anything is sent, with a note limited to 80 characters', async () => {
    const { r, posted } = social(); const screen = await render(<ManagementGame />);
    await screen.getByRole('button', { name: 'Post this result' }).click();
    const card = screen.getByRole('dialog');
    await expect.element(card).toHaveTextContent('This is exactly what will be posted'); await expect.element(card).toHaveTextContent('Little Rooftop · Garden & Grill · Warmest room · rating 4.2 · 4-day streak');
    await expect.element(card).toHaveTextContent('This posts as you, under today’s results comment.');
    expect(r.postResult).not.toHaveBeenCalled(); // viewing the preview posted nothing
    const input = screen.getByLabelText('Add a short note (optional)'); expect((await input.element()).getAttribute('maxlength')).toBe('80');
    await input.fill('Great night!'); await expect.element(card).toHaveTextContent('Great night!'); await expect.element(card).toHaveTextContent('as a comment on today’s post');
    await screen.getByRole('button', { name: 'Post as me' }).click();
    expect(posted).toEqual(['Great night!']); await expect.element(screen.getByRole('button', { name: /Posted/ })).toBeDisabled();
  });

  it('can be cancelled without posting', async () => {
    const { r } = social(); const screen = await render(<ManagementGame />);
    await screen.getByRole('button', { name: 'Post this result' }).click(); await screen.getByRole('button', { name: 'Cancel' }).click();
    expect(r.postResult).not.toHaveBeenCalled(); await expect.element(screen.getByRole('button', { name: 'Post this result' })).toBeVisible();
  });

  it('flair and follow are separate actions that each work on their own', async () => {
    const { r } = social(); const screen = await render(<ManagementGame />);
    await screen.getByRole('button', { name: /flair/ }).click(); expect(r.wearFlair).toHaveBeenCalledTimes(1); expect(r.follow).not.toHaveBeenCalled(); expect(r.postResult).not.toHaveBeenCalled();
    await screen.getByRole('button', { name: /Follow this kitchen/ }).click(); expect(r.follow).toHaveBeenCalledTimes(1); await expect.element(screen.getByRole('button', { name: /Following/ })).toBeDisabled();
  });

  it('a failed action shows its message and leaves the card usable', async () => {
    const { r } = social({ follow: vi.fn(async () => 'Reddit could not follow this community.') }); const screen = await render(<><ManagementGame /><Toaster /></>);
    await screen.getByRole('button', { name: /Follow this kitchen/ }).click();
    await expect.element(screen.getByText('Reddit could not follow this community.')).toBeVisible(); await expect.element(screen.getByRole('button', { name: /Follow this kitchen/ })).toBeEnabled();
    await screen.getByRole('button', { name: 'Continue' }).click(); expect(r.result).toBeNull();
  });

  it('offers no flair until there is a streak, and keeps every button at least 44px tall', async () => {
    const r = remote({ ...lock(0), streak: 0 }); Object.assign(r, { social: { posted: false, flair: null, followed: false }, previewComment: async () => ({ text: 'x', reply: true }), postResult: async () => null, wearFlair: async () => null, follow: async () => null }); restaurant.remote = r;
    const screen = await render(<ManagementGame />);
    await expect.element(screen.getByRole('button', { name: 'Earn a star to wear flair' })).toBeDisabled();
    await new Promise(r => setTimeout(r, 600)); // the dialog scales in from 95%: measure once it has settled
    for (const name of ['Post this result', 'Earn a star to wear flair', 'Continue']) expect((await screen.getByRole('button', { name }).element()).getBoundingClientRect().height, name).toBeGreaterThanOrEqual(44);
  });
});
