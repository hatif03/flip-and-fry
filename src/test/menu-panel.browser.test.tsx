import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { restaurant } from '@/management/engine';
import { MenuPanel } from '@/management/Panels';
import { createRestaurant } from '@/management/types';
import '@/index.css';

beforeEach(async () => { await page.viewport(390, 844); restaurant.reset(); });

describe('the menu by style', () => {
  it('groups dishes into Garden, Grill and Noodle, and locks the ones whose appliance is missing, with the price of the fix', async () => {
    const screen = await render(<MenuPanel state={createRestaurant()} action={() => undefined} />);
    for (const style of ['Garden dishes', 'Grill dishes', 'Noodle dishes']) await expect.element(screen.getByRole('region', { name: style })).toBeInTheDocument();
    await expect.element(screen.getByText('Needs a stock pot ($280 in the shop)').first()).toBeInTheDocument();
    await expect.element(screen.getByText('Needs a wok range ($320 in the shop)').first()).toBeInTheDocument();
    await expect.element(screen.getByRole('switch', { name: 'Offer Garden salad' })).toBeChecked();
    await expect.element(screen.getByRole('switch', { name: 'Offer Sunset ramen' })).not.toBeInTheDocument();
  });
  it('opens a dish up once its appliance is on the floor, and turning it on goes through the engine', async () => {
    const state = createRestaurant(); state.furniture.push({ id: 90, kind: 'pot', x: 5, z: 1, rotation: 0 });
    const toggled: string[] = [], original = restaurant.setDish.bind(restaurant);
    restaurant.setDish = (dish, enabled, price) => { toggled.push(`${dish}:${enabled}:${price}`); return null; };
    try {
      const screen = await render(<MenuPanel state={state} action={() => undefined} />);
      await screen.getByRole('switch', { name: 'Offer Sunset ramen' }).click();
      expect(toggled).toEqual(['ramen:true:36']);
      await expect.element(screen.getByText('Needs a stock pot ($280 in the shop)')).not.toBeInTheDocument();
    } finally { restaurant.setDish = original; }
  });
  it('keeps a price control inside the new cap', async () => {
    const state = createRestaurant(); state.menu.burger.price = 80;
    const screen = await render(<MenuPanel state={state} action={() => undefined} />);
    await expect.element(screen.getByRole('button', { name: 'Raise Sunset burger price' })).toBeDisabled();
    await expect.element(screen.getByRole('button', { name: 'Lower Sunset burger price' })).toBeEnabled();
  });
});
