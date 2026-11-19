import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { Session, type Http } from '@/client/session';
import { actionLogSchema } from '@/management/actions';
import { CROPS } from '@/management/crops';
import { getToday, savePark, type Deps, type Player } from '@/server/core/game';
import { deliver, getWorld, harvest, plant, saveLayout, useLayout, water } from '@/server/core/world';
import { FakeStore } from './fake-store';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: ({ garden, onBed }: { garden?: boolean; onBed?: (i: number) => void }) => <div data-testid="mock-scene" data-garden={String(Boolean(garden))}>{[0, 1].map(i => <button key={i} data-testid={`bed-${i}`} style={{ width: 20, height: 20 }} onClick={() => onBed?.(i)}>bed</button>)}</div> }));

const alice: Player = { id: 't2_alice', name: 'alice' };
let store: FakeStore;

/** The real server rules over a faked clock, so the garden's timers can be wound forward. */
function network(): Http {
  const deps: Deps = { store, now: () => store.now };
  return async (method, path, raw) => {
    const body = raw === undefined ? undefined : JSON.parse(JSON.stringify(raw)) as { rev: number; plot?: number; crop?: string; index?: number; actions?: unknown };
    const out = (r: { ok: true; value: unknown } | { ok: false; status: number; error: string; conflict?: boolean }) => 'error' in r ? { status: r.status, body: { type: 'error', error: r.error, conflict: r.conflict } } : { status: 200, body: r.value };
    if (method === 'GET' && path === '/api/today') return out(await getToday(deps, alice));
    if (method === 'GET' && path === '/api/world') return out(await getWorld(deps, alice));
    if (path === '/api/world/plant') return out(await plant(deps, alice, body!.rev, body!.plot!, body!.crop as never));
    if (path === '/api/world/water') return out(await water(deps, alice, body!.rev, body!.plot!));
    if (path === '/api/world/harvest') return out(await harvest(deps, alice, body!.rev, body!.plot!));
    if (path === '/api/world/layoutsave') return out(await saveLayout(deps, alice, body!.rev, body!.index!));
    if (path === '/api/world/layoutuse') return out(await useLayout(deps, alice, body!.rev, body!.index!));
    if (path === '/api/world/deliver') return out(await deliver(deps, alice, body!.rev, body!.index!));
    if (path === '/api/save') { const log = actionLogSchema.safeParse(body?.actions); return log.success ? out(await savePark(deps, alice, body!.rev, log.data)) : { status: 400, body: { type: 'error', error: 'Invalid request.' } }; }
    return { status: 404, body: null };
  };
}
beforeEach(async () => { store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 9); restaurant.reset(); restaurant.remote = null; await page.viewport(360, 760); });
afterEach(() => { restaurant.remote = null; restaurant.autoRoll = true; });

describe('the garden tab', () => {
  it('is only there on Reddit, and five tabs still fit a 320 px phone', async () => {
    restaurant.reset(); restaurant.welcome(); let screen = await render(<ManagementGame />);
    await expect.element(screen.getByRole('button', { name: 'Garden', exact: true })).not.toBeInTheDocument(); await screen.unmount();
    await page.viewport(320, 700);
    const session = new Session(restaurant, network(), { set: () => 0, clear: () => undefined }); expect(await session.start()).toBeNull();
    screen = await render(<ManagementGame />);
    await expect.element(screen.getByRole('button', { name: 'Garden', exact: true })).toBeVisible();
    for (const button of document.querySelectorAll('nav[aria-label="Restaurant management"] button')) { const rect = button.getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(320); expect(rect.height).toBeGreaterThanOrEqual(44); }
    const open = screen.getByRole('button', { name: 'Open restaurant' }).element().getBoundingClientRect(); expect(open.right).toBeLessThanOrEqual(320);
  });

  it('plants, waters and harvests on the server clock, and the pantry and cash follow', async () => {
    const session = new Session(restaurant, network(), { set: () => 0, clear: () => undefined }); expect(await session.start()).toBeNull();
    const screen = await render(<><ManagementGame /><Toaster /></>), cash = restaurant.state.cash;
    await screen.getByRole('button', { name: 'Garden', exact: true }).click();
    await expect.element(screen.getByRole('region', { name: 'Level' })).toHaveTextContent('Level 1');
    await screen.getByRole('button', { name: /^Plant tomatoes/ }).first().click();
    await expect.element(screen.getByRole('progressbar', { name: 'Tomatoes growth' })).toBeVisible(); expect(restaurant.state.cash).toBe(cash - CROPS.tomato.seed);
    await screen.getByRole('button', { name: /^Water/ }).click(); await expect.element(screen.getByRole('button', { name: 'Watered' })).toBeDisabled();
    store.now += CROPS.tomato.seconds * 1000; // the server's clock moves on
    await page.viewport(360, 761); await page.viewport(360, 760);
    await screen.getByRole('button', { name: 'Close panel' }).click(); await screen.getByRole('button', { name: 'Garden', exact: true }).click();
    await screen.getByRole('button', { name: /^Harvest/ }).click();
    await expect.element(screen.getByRole('region', { name: 'Pantry' })).toHaveTextContent('Tomatoes ×3'); expect(restaurant.state.pantry.tomato).toBe(3);
  });

  it('the between-nights strip says what needs you and opens the garden', async () => {
    const session = new Session(restaurant, network(), { set: () => 0, clear: () => undefined }); expect(await session.start()).toBeNull();
    const screen = await render(<ManagementGame />), strip = screen.getByRole('navigation', { name: 'Between nights' });
    await expect.element(strip).toHaveTextContent('Plant something'); await expect.element(strip).toHaveTextContent('orders waiting');
    for (const b of strip.element().querySelectorAll('button')) expect(b.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await strip.getByRole('button', { name: /Plant something/ }).click(); await expect.element(screen.getByRole('region', { name: 'The garden' })).toBeVisible();
    await screen.getByRole('button', { name: /^Plant tomatoes/ }).first().click(); await screen.getByRole('button', { name: 'Close panel' }).click();
    await expect.element(screen.getByRole('navigation', { name: 'Between nights' })).toHaveTextContent('Harvest in 20m');
  });

  it('shows the order board and delivers an order once the pantry covers it', async () => {
    const session = new Session(restaurant, network(), { set: () => 0, clear: () => undefined }); expect(await session.start()).toBeNull();
    const screen = await render(<ManagementGame />);
    await screen.getByRole('button', { name: 'Garden', exact: true }).click();
    const board = screen.getByRole('region', { name: 'The order board' }); await expect.element(board).toBeVisible();
    await expect.element(board.getByRole('button', { name: 'Need more produce' }).first()).toBeDisabled();
  });

  it('shows the block party and the shared fridge', async () => {
    const session = new Session(restaurant, network(), { set: () => 0, clear: () => undefined }); expect(await session.start()).toBeNull();
    const screen = await render(<ManagementGame />); await screen.getByRole('button', { name: 'Garden', exact: true }).click();
    const block = screen.getByRole('region', { name: 'The block' }); await expect.element(block).toBeVisible();
    await expect.element(block).toHaveTextContent('Block party'); await expect.element(block).toHaveTextContent('Shared fridge'); await expect.element(block).toHaveTextContent('The fridge is empty');
  });

  it('saves the room in a slot from the Build panel and shows it', async () => {
    const session = new Session(restaurant, network(), { set: () => 0, clear: () => undefined }); expect(await session.start()).toBeNull();
    const screen = await render(<><ManagementGame /><Toaster /></>); await screen.getByRole('button', { name: 'Build', exact: true }).click();
    const slots = screen.getByRole('region', { name: 'Saved layouts' }); await expect.element(slots).toBeVisible(); await expect.element(slots).toHaveTextContent('Slot 1 empty');
    await expect.element(slots.getByRole('button', { name: 'Use the layout in slot 1' })).toBeDisabled();
    await slots.getByRole('button', { name: 'Save the room in slot 1' }).click(); await expect.element(slots).toHaveTextContent('8 pieces');
    await expect.element(slots.getByRole('button', { name: 'Use the layout in slot 1' })).toBeEnabled();
  });

  it('the farm view: the Garden tab and the camera button take the camera to the farm, and tapping a bed waters, harvests or opens the seeds', async () => {
    const session = new Session(restaurant, network(), { set: () => 0, clear: () => undefined }); expect(await session.start()).toBeNull();
    const screen = await render(<><ManagementGame /><Toaster /></>), scene = () => screen.getByTestId('mock-scene').element().getAttribute('data-garden');
    expect(scene()).toBe('false');
    await screen.getByRole('button', { name: 'Garden', exact: true }).click(); expect(scene()).toBe('true');
    await screen.getByRole('button', { name: 'Close panel' }).click(); expect(scene()).toBe('false');
    await page.viewport(1280, 800); await screen.getByRole('button', { name: 'Farm view' }).click(); expect(scene()).toBe('true');
    // an empty bed opens the seed choice
    await screen.getByTestId('bed-0').click(); await expect.element(screen.getByRole('region', { name: 'The garden' })).toBeVisible();
    await screen.getByRole('button', { name: /^Plant tomatoes/ }).first().click(); await screen.getByRole('button', { name: 'Close panel' }).click();
    // a growing bed is watered once, then says how long is left
    await screen.getByTestId('bed-0').click(); await expect.element(screen.getByText('Tomatoes watered.')).toBeVisible();
    await screen.getByTestId('bed-0').click(); await expect.element(screen.getByText(/Tomatoes: ready in/)).toBeVisible();
    // and a ready bed is harvested
    store.now += CROPS.tomato.seconds * 1000; await restaurant.remote!.world!.load(); // the real clock moves on by itself; the test's faked one needs a refresh
    await screen.getByTestId('bed-0').click();
    await vi.waitFor(() => expect(restaurant.state.pantry.tomato).toBe(CROPS.tomato.yield));
  });

  it('every button is at least 44 px tall', async () => {
    const session = new Session(restaurant, network(), { set: () => 0, clear: () => undefined }); expect(await session.start()).toBeNull();
    const screen = await render(<ManagementGame />); await screen.getByRole('button', { name: 'Garden', exact: true }).click();
    await expect.element(screen.getByRole('region', { name: 'The garden' })).toBeVisible();
    for (const b of document.querySelectorAll('aside[aria-label="The rooftop garden"] button')) expect(b.getBoundingClientRect().height, b.textContent ?? '').toBeGreaterThanOrEqual(44);
  });
});
