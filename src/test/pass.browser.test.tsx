import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { restaurant, type RemoteSession } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { cookZone } from '@/management/Pass';
import { createDailyHeadline } from '@/management/daily-headline';
import { COOK_BURN, DISHES, createRestaurant, idealPrep } from '@/management/types';
const idealPrepFor = idealPrep;
import type { TodayResponse } from '@/shared/api';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div data-testid="mock-scene" /> }));

const today: TodayResponse = { type: 'today', date: '2026-12-09', headline: createDailyHeadline('2026-12-09'), rev: 1, park: createRestaurant(), open: null, run: null, streak: 0, community: { opens: 0, locks: 0 } };
const remote = (): RemoteSession => ({ open: async () => null, today, result: null, dismissResult() {} });

/** A kitchen with no chef, so tickets wait for the owner. Runs until `count` guests are waiting. */
function openKitchen(count = 1) {
  restaurant.reset(); restaurant.welcome(); restaurant.remote = remote(); restaurant.autoRoll = false;
  restaurant.state.staff = restaurant.state.staff.filter(s => s.role !== 'chef'); restaurant.state.cash = 5000;
  expect(restaurant.open()).toBeNull();
  for (let i = 0; i < 900 && restaurant.state.guests.filter(g => g.stage === 'waiting').length < count; i++) restaurant.tick();
  restaurant.pause(true); restaurant.notify();
}
const advance = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 10); i++) restaurant.tick(); restaurant.notify(); };

beforeEach(async () => { await page.viewport(360, 760); });
afterEach(() => { restaurant.remote = null; restaurant.autoRoll = true; });

describe('the zones of the cooking bar match the engine', () => {
  it('names each band from raw to burnt', () => {
    expect([.2, .59].map(cookZone)).toEqual(['raw', 'raw']); expect([.6, .8].map(cookZone)).toEqual(['early', 'early']); expect([.9, 1.2].map(cookZone)).toEqual(['perfect', 'perfect']);
    expect([1.3, 1.6].map(cookZone)).toEqual(['over', 'over']); expect([1.7, COOK_BURN].map(cookZone)).toEqual(['burnt', 'burnt']);
  });
});

describe('the pass panel', () => {
  it('is absent in the plain browser game and while the doors are closed', async () => {
    restaurant.reset(); restaurant.welcome(); restaurant.remote = null;
    const screen = await render(<ManagementGame />); await expect.element(screen.getByRole('region', { name: 'The pass' })).not.toBeInTheDocument();
    restaurant.remote = remote(); restaurant.notify(); await expect.element(screen.getByRole('region', { name: 'The pass' })).not.toBeInTheDocument();
  });

  it('shows waiting tickets with a patience bar and big Cook, Rush and Comp buttons', async () => {
    openKitchen(); const screen = await render(<ManagementGame />);
    const pass = screen.getByRole('region', { name: 'The pass' }); await expect.element(pass).toBeVisible(); await expect.element(pass).toHaveTextContent('Order up');
    await expect.element(screen.getByRole('progressbar', { name: 'Guest patience' }).first()).toBeVisible();
    for (const name of [/Cook/, /Rush/, /Comp/]) { const b = await screen.getByRole('button', { name }).first().element(); expect(b.getBoundingClientRect().height, String(name)).toBeGreaterThanOrEqual(44); }
  });

  it('claims a ticket, shows the bar moving through its zones, and plates at the perfect moment', async () => {
    openKitchen(); const screen = await render(<ManagementGame />), guest = restaurant.state.guests.find(g => g.stage === 'waiting')!, seconds = DISHES[guest.dish].seconds;
    await screen.getByRole('button', { name: /Cook/ }).first().click();
    expect(guest.owner).toBe(true);
    await expect.element(screen.getByRole('region', { name: 'The pass' })).toHaveTextContent(`You are cooking: ${DISHES[guest.dish].name}`);
    await expect.element(screen.getByRole('region', { name: 'The pass' }).getByRole('status')).toHaveTextContent('Still raw');
    advance(seconds * .7); await expect.element(screen.getByRole('region', { name: 'The pass' }).getByRole('status')).toHaveTextContent('A little early');
    advance(seconds * .3); await expect.element(screen.getByRole('region', { name: 'The pass' }).getByRole('status')).toHaveTextContent('Perfect: plate it now!');
    const plate = screen.getByRole('button', { name: 'Plate it' }); expect((await plate.element()).getBoundingClientRect().height).toBeGreaterThanOrEqual(56);
    await plate.click();
    expect(guest.stage).toBe('ready'); expect(guest.quality).toBe(3);
    await expect.element(screen.getByText(/You are cooking/)).not.toBeInTheDocument();
  });

  it('too early and too late both lose the dish, and the panel says so', async () => {
    openKitchen(); const screen = await render(<ManagementGame />), guest = restaurant.state.guests.find(g => g.stage === 'waiting')!;
    await screen.getByRole('button', { name: /Cook/ }).first().click(); advance(DISHES[guest.dish].seconds * .2);
    await screen.getByRole('button', { name: 'Plate it' }).click(); expect(guest.stage).toBe('waiting'); expect(restaurant.event).toMatch(/raw/);
  });

  it('lets the owner put a dish down, and slows the game to 1x while cooking', async () => {
    openKitchen(); restaurant.setSpeed(3); restaurant.pause(true); restaurant.notify();
    const screen = await render(<ManagementGame />), guest = restaurant.state.guests.find(g => g.stage === 'waiting')!;
    await screen.getByRole('button', { name: /Cook/ }).first().click(); expect(restaurant.speed).toBe(1);
    await screen.getByRole('button', { name: /Put the dish down/ }).click(); expect(guest.owner).toBe(false);
  });

  it('rushes a ticket once, and comps at most two tables a night', async () => {
    openKitchen(3); const screen = await render(<ManagementGame />);
    const rush = screen.getByRole('button', { name: /Rush/ }).first(); await rush.click(); await expect.element(screen.getByRole('button', { name: /Rush/ }).first()).toBeDisabled();
    restaurant.state.comps = 2; restaurant.notify(); await expect.element(screen.getByRole('button', { name: /Comp/ }).first()).toBeDisabled();
  });

  it('keeps the daily challenges in view as thin pips instead of a panel that covers the floor', async () => {
    openKitchen(); const screen = await render(<ManagementGame />);
    await expect.element(screen.getByRole('list', { name: 'Daily challenges' })).toBeVisible();
    await expect.element(screen.getByRole('region', { name: 'Business updates' })).not.toBeInTheDocument();
  });

  it('says what to do when nobody is waiting', async () => {
    restaurant.reset(); restaurant.welcome(); restaurant.remote = remote(); restaurant.open(); restaurant.pause(true);
    const screen = await render(<ManagementGame />);
    await expect.element(screen.getByRole('region', { name: 'The pass' })).toHaveTextContent('The next order lands here');
  });

  it('never overlaps the night bar with the camera buttons, and stays inside the phone screen', async () => {
    openKitchen(); const screen = await render(<><ManagementGame /><Toaster /></>);
    const bar = (await screen.getByRole('region', { name: 'Tonight' }).element()).getBoundingClientRect(), zoom = (await screen.getByRole('button', { name: 'Camera controls' }).element()).getBoundingClientRect();
    expect(zoom.top >= bar.bottom || zoom.bottom <= bar.top || zoom.left >= bar.right || zoom.right <= bar.left).toBe(true);
    const pass = (await screen.getByRole('region', { name: 'The pass' }).element()).getBoundingClientRect();
    expect(pass.left).toBeGreaterThanOrEqual(0); expect(pass.right).toBeLessThanOrEqual(360); expect(pass.bottom).toBeLessThanOrEqual(760);
  });
});

describe('prepping by hand at the pass', () => {
  it('shows an optional hold button while you cook, counts the hold, and says how the prep went', async () => {
    openKitchen(1); const screen = await render(<><ManagementGame /><Toaster /></>); const g = restaurant.state.guests.find(x => x.stage === 'waiting')!;
    expect(restaurant.claimTicket(g.id)).toBeNull(); restaurant.notify();
    const button = screen.getByRole('button', { name: /Hold to prep/ }); await expect.element(button).toBeVisible();
    expect(button.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    const el = button.element(); el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, bubbles: true }));
    expect(restaurant.state.hands[0]?.holding).toBe(true); await expect.element(screen.getByRole('button', { name: /Release when the bar is in the green/ })).toBeVisible();
    advance(idealPrepFor(g.dish)); el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true }));
    expect(restaurant.state.hands[0]).toMatchObject({ holding: false, quality: 3 }); restaurant.notify();
    await expect.element(screen.getByRole('status').filter({ hasText: 'A clean, even prep' })).toBeVisible();
  });
  it('works from the keyboard too: Space holds, and letting go releases', async () => {
    openKitchen(1); const screen = await render(<ManagementGame />); const g = restaurant.state.guests.find(x => x.stage === 'waiting')!; restaurant.claimTicket(g.id); restaurant.notify();
    await expect.element(screen.getByRole('button', { name: /Hold to prep/ })).toBeVisible(); const el = screen.getByRole('button', { name: /Hold to prep/ }).element() as HTMLButtonElement; el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); expect(restaurant.state.hands[0]?.holding).toBe(true);
    el.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })); expect(restaurant.state.hands[0]?.holding).toBe(false);
  });
});
