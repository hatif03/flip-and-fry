import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { engine } from '@/game/engine';
import { getActiveInput } from '@/scene/KitchenScene';
import TestKitchen from '@/arcade/TestKitchen';
import '@/index.css';

// One test with the real 3D kitchen: the canvas draws, the input bridge exists, and a shift can be started and left.
describe('the Test Kitchen with its real 3D scene', () => {
  it('draws the kitchen, creates the input bridge, and runs a practice shift', async () => {
    await page.viewport(360, 760); engine.setPhase('menu');
    const screen = await render(<TestKitchen onExit={() => undefined} touch />);
    await expect.element(screen.getByRole('button', { name: /Let’s cook/ })).toBeVisible();
    await vi.waitFor(() => { if (!screen.container.querySelector('canvas')) throw new Error('no canvas yet'); }, { timeout: 10000 });
    await vi.waitFor(() => { if (!getActiveInput()) throw new Error('no input yet'); }, { timeout: 10000 });
    engine.start(true); engine.pause(false);
    await expect.element(screen.getByTestId('touch-controls')).toBeVisible();
    const before = engine.state.chefs[0].x;
    getActiveInput()!.touch.x = 1;
    await vi.waitFor(() => { if (engine.state.chefs[0].x === before) throw new Error('the chef has not moved'); }, { timeout: 8000 });
    getActiveInput()!.touch.x = 0;
    expect(engine.state.chefs[0].x).toBeGreaterThan(before);
  });
});
