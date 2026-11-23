import { useEffect } from 'react';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { vi } from 'vitest';
import { engine } from '@/game/engine';
import { restaurant } from '@/management/engine';
import { getActiveInput } from '@/scene/KitchenScene';
const activeInput = { get touch() { return getActiveInput()!.touch; }, read: () => getActiveInput()!.read() };
import TestKitchen from '@/arcade/TestKitchen';
import { TouchControls } from '@/arcade/TouchControls';
import Index from '@/pages/Index';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div data-testid="mock-scene" /> }));
// The 3D kitchen is covered by one real-canvas test in test-kitchen-scene.browser.test.tsx. Here the scene is a stand-in that
// creates the same input bridge the real one does, so the controls and the screens are tested without WebGL setup per test.
vi.mock('@/scene/KitchenScene', async () => {
  const { KitchenInput } = await import('@/game/input');
  const { engine: kitchen } = await import('@/game/engine');
  let input: InstanceType<typeof KitchenInput> | null = null;
  function Scene() { useEffect(() => { input = new KitchenInput(() => true, () => undefined); return () => { input?.dispose(); input = null; }; }, []); void kitchen; return <div data-testid="mock-kitchen-scene" />; }
  return { default: Scene, getActiveInput: () => input };
});

/** Start a shift and make sure a stray window blur from the test runner has not paused it. */
const begin = (practice = true): void => { engine.start(practice); engine.pause(false); };
/** The input bridge is created once the 3D canvas has mounted. */
const inputReady = (): Promise<void> => vi.waitFor(() => { if (!getActiveInput()) throw new Error('input not ready'); }, { timeout: 8000 });
beforeEach(async () => { await page.viewport(360, 760); engine.setPhase('menu'); engine.select(0, 'solo'); restaurant.reset(); restaurant.welcome(); });

describe('the Test Kitchen', () => {
  it('opens on its menu with the three shifts, and goes back to the restaurant', async () => {
    const exits: string[] = [];
    const screen = await render(<TestKitchen onExit={() => exits.push('exit')} touch={false} />);
    await expect.element(screen.getByRole('button', { name: /Let’s cook/ })).toBeVisible();
    await expect.element(screen.getByRole('region', { name: 'Choose your shift' })).toBeVisible();
    await screen.getByRole('button', { name: 'Back to your restaurant' }).click(); expect(exits).toEqual(['exit']);
  });
  it('starts the practice tutorial from the menu', async () => {
    const screen = await render(<TestKitchen onExit={() => undefined} touch={false} />);
    await screen.getByRole('button', { name: /Practice/ }).first().click();
    expect(engine.state.phase).toBe('playing'); expect(engine.state.practice).toBe(true);
    await expect.element(screen.getByText(/PRACTICE · 1 \/ 8/)).toBeVisible();
  });
  it('shows the stick and three buttons on a touch screen', async () => {
    const touch = await render(<TestKitchen onExit={() => undefined} touch />); begin(true);
    await expect.element(touch.getByTestId('touch-controls')).toBeVisible();
    for (const name of ['Dash', 'Work', 'Pick']) await expect.element(touch.getByRole('button', { name: new RegExp(`^${name}:`) })).toBeVisible();
  });
  it('shows none of them on a keyboard screen', async () => {
    const keys = await render(<TestKitchen onExit={() => undefined} touch={false} />); begin(true);
    await expect.element(keys.getByText('PRACTICE · 1 / 8')).toBeVisible();
    expect(keys.container.querySelector('[data-testid="touch-controls"]')).toBeNull();
  });
  it('keeps every touch target at least 44 px', async () => {
    await render(<TestKitchen onExit={() => undefined} touch />); begin(true);
    await expect.element(page.getByTestId('touch-controls')).toBeVisible();
    for (const id of ['stick', 'touch-dash', 'touch-work', 'touch-pick']) {
      const box = page.getByTestId(id).element().getBoundingClientRect(); expect(Math.min(box.width, box.height), id).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('the touch controls drive the same input as the keyboard', () => {
  it('turn a drag on the stick into movement, and release it to stop', async () => {
    await render(<TestKitchen onExit={() => undefined} touch />); begin(true);
    await expect.element(page.getByTestId('stick')).toBeVisible(); await inputReady();
    const stick = page.getByTestId('stick').element(), box = stick.getBoundingClientRect(), cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    stick.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: cx, clientY: cy, bubbles: true }));
    stick.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, buttons: 1, clientX: cx + 60, clientY: cy, bubbles: true }));
    expect(activeInput.touch.x).toBeGreaterThan(.9); expect(activeInput.touch.y).toBeCloseTo(0, 1);
    stick.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, buttons: 1, clientX: cx, clientY: cy - 60, bubbles: true }));
    expect(activeInput.touch.y).toBeGreaterThan(.9); // up on screen is forward for the chef
    stick.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    expect([activeInput.touch.x, activeInput.touch.y]).toEqual([0, 0]);
  });
  it('ignores a tiny wobble near the middle of the stick', async () => {
    await render(<TestKitchen onExit={() => undefined} touch />); begin(true);
    await expect.element(page.getByTestId('stick')).toBeVisible(); await inputReady();
    const stick = page.getByTestId('stick').element(), box = stick.getBoundingClientRect(), cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    stick.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, clientX: cx + 4, clientY: cy + 3, bubbles: true }));
    expect([activeInput.touch.x, activeInput.touch.y]).toEqual([0, 0]);
    stick.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, bubbles: true }));
  });
  it('holds Work while the finger is down, and sends Pick and Dash once per tap', async () => {
    await render(<TestKitchen onExit={() => undefined} touch />); begin(true);
    await expect.element(page.getByTestId('touch-work')).toBeVisible(); await inputReady();
    const work = page.getByTestId('touch-work').element(), pick = page.getByTestId('touch-pick').element(), dash = page.getByTestId('touch-dash').element();
    work.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, bubbles: true })); expect(activeInput.touch.work).toBe(true);
    work.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, bubbles: true })); expect(activeInput.touch.work).toBe(false);
    pick.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 4, bubbles: true })); expect(activeInput.touch.pick).toBe(true);
    expect(activeInput.read()[0].pick).toBe(true); expect(activeInput.read()[0].pick).toBe(false); // consumed by the first read
    dash.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, bubbles: true })); expect(activeInput.read()[0].dash).toBe(true);
  });
  it('is not shown for two-chef play, which needs two keyboards', async () => {
    engine.select(0, 'coop'); const screen = await render(<TestKitchen onExit={() => undefined} touch />); begin(false);
    expect(screen.container.querySelector('[data-testid="touch-controls"]')).toBeNull();
  });
});

describe('getting there from the restaurant', () => {
  it('offers the Test Kitchen beside Open, on a phone too, and swaps the views', async () => {
    const screen = await render(<Index />);
    await userEvent.click(screen.getByRole('button', { name: /^Test Kitchen/ }));
    await expect.element(screen.getByTestId('test-kitchen')).toBeVisible();
    await screen.getByRole('button', { name: 'Back to your restaurant' }).click();
    await expect.element(screen.getByRole('button', { name: /^Open restaurant/ }).or(screen.getByRole('button', { name: /Plan next day/ }))).toBeVisible();
  });
});

describe('the controls are plain React', () => {
  it('render without a scene (a unit of the layout)', async () => {
    const screen = await render(<TouchControls />); await expect.element(screen.getByTestId('touch-controls')).toBeInTheDocument();
  });
});

describe('today\'s shift', () => {
  it('offers the shift the date picked and starts it in one tap', async () => {
    const { shiftOfDay } = await import('@/arcade/daily-shift'); const { SHIFTS } = await import('@/game/config');
    const level = shiftOfDay(new Date().toISOString().slice(0, 10), l => engine.unlocked(l, 'solo'));
    const screen = await render(<TestKitchen onExit={() => undefined} touch={false} />);
    const card = screen.getByRole('button', { name: `Play today's shift: ${SHIFTS[level].name}` }); await expect.element(card).toBeVisible();
    await card.click(); expect(engine.state.phase).toBe('playing'); expect(engine.state.level).toBe(level); expect(engine.state.mode).toBe('solo'); expect(engine.state.practice).toBe(false);
  });
});
