import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { restaurant, type RemoteSession } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { createDailyHeadline } from '@/management/daily-headline';
import { DISHES, createRestaurant } from '@/management/types';
import type { TodayResponse } from '@/shared/api';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div data-testid="mock-scene" /> }));

const today: TodayResponse = { type: 'today', date: '2026-12-09', headline: createDailyHeadline('2026-12-09'), rev: 1, park: createRestaurant(), open: null, run: null, streak: 0, community: { opens: 0, locks: 0 } };
const remote = (): RemoteSession => ({ open: async () => null, today, result: null, dismissResult() {} });

/** A restaurant on Reddit with the doors open, paused the moment `ready()` says so. */
function open(ready: () => boolean, mutate: () => void = () => undefined): void {
  restaurant.reset(); restaurant.welcome(); restaurant.remote = remote(); restaurant.autoRoll = false; restaurant.state.cash = 5000; mutate();
  expect(restaurant.open()).toBeNull();
  for (let i = 0; i < 1500 && !ready(); i++) restaurant.tick();
  restaurant.pause(true); restaurant.notify();
}
beforeEach(async () => { await page.viewport(360, 760); });
afterEach(() => { restaurant.remote = null; restaurant.autoRoll = true; });

describe('the floor in the pass', () => {
  it('shows a party at the door with a seat button per free table, and seating it takes it off the door', async () => {
    open(() => restaurant.state.guests.some(g => g.stage === 'queued'));
    const screen = await render(<ManagementGame />), guest = restaurant.state.guests.find(g => g.stage === 'queued')!;
    await expect.element(screen.getByLabelText('Your move')).toBeVisible(); await expect.element(screen.getByLabelText('Your move')).toHaveTextContent('at the door');
    const seat = screen.getByRole('button', { name: /^Seat .* at table 1/ }); expect((await seat.element()).getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await seat.click(); expect(guest.stage).toBe('arriving'); expect(guest.tableId).toBeGreaterThan(0); expect(restaurant.hustleLive()).toBe(1);
  });
  it('shows a seated guest to take an order from, a ready dish to carry and a dirty seat to clear', async () => {
    open(() => restaurant.state.guests.some(g => g.stage === 'seated'));
    const screen = await render(<ManagementGame />), guest = restaurant.state.guests.find(g => g.stage === 'seated')!;
    await screen.getByRole('button', { name: 'Take order' }).first().click(); expect(guest.stage).toBe('waiting');
    restaurant.state.dirty.push('3:0'); guest.stage = 'ready'; restaurant.notify();
    await screen.getByRole('button', { name: 'Serve' }).first().click(); expect(guest.stage).toBe('eating');
    restaurant.state.dirty = ['3:0']; restaurant.notify(); await screen.getByRole('button', { name: 'Clear' }).first().click(); expect(restaurant.state.dirty).toEqual([]);
  });
  it('the hustle chain shows on the night bar while it is live', async () => {
    open(() => restaurant.state.guests.some(g => g.stage === 'queued'));
    const screen = await render(<ManagementGame />); await expect.element(screen.getByRole('status', { name: /Combo/ })).not.toBeInTheDocument();
    await screen.getByRole('button', { name: /^Seat .* at table/ }).first().click();
    await expect.element(screen.getByRole('status', { name: /Combo 1/ })).toBeVisible();
  });
});

describe('the station move', () => {
  it('names the move for the station, can be made once, and says how it went', async () => {
    open(() => restaurant.state.guests.some(g => g.stage === 'waiting'), () => { restaurant.state.staff = restaurant.state.staff.filter(s => s.role !== 'chef'); restaurant.state.menu.burger.enabled = false; });
    const guest = restaurant.state.guests.find(g => g.stage === 'waiting')!; restaurant.claimTicket(guest.id);
    const screen = await render(<ManagementGame />);
    const verb = DISHES[guest.dish].station === 'prep' ? 'Chop' : 'Turn'; const move = screen.getByRole('button', { name: new RegExp(`^${verb} the`) });
    expect((await move.element()).getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await move.click(); await expect.element(screen.getByRole('button', { name: new RegExp(`^${verb}: `) })).toBeDisabled();
  });
});

describe('decisions', () => {
  it('shows the one decision of the moment and applies the choice', async () => {
    open(() => restaurant.state.guests.some(g => g.stage === 'waiting'));
    restaurant.state.incident = { kind: 'supplier', guestId: 0, at: restaurant.state.elapsed }; restaurant.notify();
    const screen = await render(<><ManagementGame /><Toaster /></>), cash = restaurant.state.cash;
    await expect.element(screen.getByRole('group', { name: 'A decision' })).toHaveTextContent('A supplier is at the door');
    await screen.getByRole('button', { name: /^Buy the crate/ }).click(); expect(restaurant.state.cash).toBe(cash - 40); expect(restaurant.state.deal).toBe(true);
    await expect.element(screen.getByRole('group', { name: 'A decision' })).not.toBeInTheDocument();
  });
});

describe('the bank', () => {
  it('a final notice is announced while planning, and says what happens next', async () => {
    restaurant.reset(); restaurant.welcome(); restaurant.state.notice = 1; restaurant.notify();
    const screen = await render(<ManagementGame />);
    await expect.element(screen.getByRole('alert', { name: 'Final notice' })).toHaveTextContent('One more night at a loss');
  });
  it('after a foreclosure it says what was taken and that the name, stars and records are untouched', async () => {
    restaurant.reset(); restaurant.welcome(); restaurant.state.day = 10; restaurant.state.foreclosure = { day: 9, kinds: ['oven', 'wok'], released: 2, proceeds: 300 }; restaurant.state.storage = ['oven', 'wok']; restaurant.notify();
    const screen = await render(<ManagementGame />);
    await expect.element(screen.getByLabelText('The bank stepped in')).toHaveTextContent('brick oven, wok range'); await expect.element(screen.getByLabelText('The bank stepped in')).toHaveTextContent('untouched');
    await screen.getByRole('button', { name: 'Build', exact: true }).click();
    await expect.element(screen.getByRole('button', { name: /Preview Brick oven · \$252/ })).toBeVisible();
  });
});
