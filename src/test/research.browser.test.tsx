import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { restaurant } from '@/management/engine';
import { InteriorsPanel } from '@/management/InteriorsPanel';
import { GoalsPanel, TeamPanel } from '@/management/Panels';
import { createRestaurant } from '@/management/types';
import '@/index.css';

beforeEach(async () => { await page.viewport(390, 844); restaurant.reset(); });

describe('research on the ledger', () => {
  it('offers three budgets, marks the one in force, and sends a change through the engine', async () => {
    const state = createRestaurant(); state.research.budget = 20; const set: number[] = [], original = restaurant.setResearch.bind(restaurant);
    restaurant.setResearch = budget => { set.push(budget); return null; };
    try {
      const screen = await render(<GoalsPanel state={state} action={() => undefined} />);
      await expect.element(screen.getByRole('button', { name: 'Research $20 a night' })).toHaveClass('border-teal');
      await screen.getByRole('button', { name: 'Research $40 a night' }).click(); expect(set).toEqual([40]);
    } finally { restaurant.setResearch = original; }
  });
  it('shows progress toward each study and which are ready', async () => {
    const state = createRestaurant(); state.research.points = 150;
    const screen = await render(<GoalsPanel state={state} action={() => undefined} />);
    await expect.element(screen.getByText('Ready ✓')).toBeVisible();
    await expect.element(screen.getByRole('region', { name: 'Research' }).getByText('150/220')).toBeVisible();
    await expect.element(screen.getByRole('progressbar', { name: 'Staff cloth research' })).toBeVisible();
  });
  it('locks the budget buttons while the doors are open', async () => {
    const state = createRestaurant(); state.phase = 'service';
    const screen = await render(<GoalsPanel state={state} action={() => undefined} />);
    await expect.element(screen.getByRole('button', { name: 'Research $40 a night' })).toBeDisabled();
  });
});

describe('the shop and the team', () => {
  it('shows the stock pot as locked, with the points still needed, until it is studied', async () => {
    const state = createRestaurant(); state.cash = 2000; state.research.points = 40;
    const screen = await render(<InteriorsPanel state={state} choose={() => undefined} inspect={() => undefined} action={() => undefined} />);
    const pot = screen.getByRole('button', { name: /Preview Stock pot/ });
    await expect.element(pot).toBeDisabled(); await expect.element(pot).toHaveTextContent('Research stock pot: 40/100');
    await expect.element(screen.getByRole('button', { name: /Preview Wok range/ })).toBeEnabled();
  });
  it('opens the pot once studied', async () => {
    const state = createRestaurant(); state.cash = 2000; state.research.points = 100;
    const screen = await render(<InteriorsPanel state={state} choose={() => undefined} inspect={() => undefined} action={() => undefined} />);
    await expect.element(screen.getByRole('button', { name: /Preview Stock pot/ })).toBeEnabled();
  });
  it('offers hat and apron colours on the team page only once the cloth is studied', async () => {
    const closed = await render(<TeamPanel state={createRestaurant()} action={() => undefined} />);
    expect(closed.container.querySelector('[aria-label="Staff cloth"]')).toBeNull();
    const state = createRestaurant(); state.research.points = 360;
    const open = await render(<TeamPanel state={state} action={() => undefined} />);
    await expect.element(open.getByRole('radiogroup', { name: 'Hat color' })).toBeVisible();
    await expect.element(open.getByRole('radiogroup', { name: 'Apron color' })).toBeVisible();
  });
});
