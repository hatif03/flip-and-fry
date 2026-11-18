import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { restaurant, type RemoteSession } from '@/management/engine';
import { kitchenCardImage, CARD_HEIGHT, CARD_WIDTH } from '@/management/kitchen-card';
import { NeighborAvatar } from '@/management/NeighborAvatar';
import { pixelFace } from '@/management/pixel-face';
import { Reminder } from '@/management/Reminder';
import { createDailyHeadline } from '@/management/daily-headline';
import { createRestaurant } from '@/management/types';
import { pngFromDataUri } from '@/server/core/media';
import '@/index.css';

const today = { type: 'today' as const, date: '2026-12-09', headline: createDailyHeadline('2026-12-09'), rev: 1, park: createRestaurant(), open: null, run: null, streak: 0, community: { opens: 0, locks: 0 } };
const remote = (extra: Partial<RemoteSession> = {}): RemoteSession => ({ open: async () => null, today, result: null, dismissResult() {}, ...extra });
beforeEach(async () => { restaurant.remote = null; await page.viewport(360, 760); });
afterEach(() => { restaurant.remote = null; });

describe('the picture for a kitchen post', () => {
  it('is a real PNG the server will accept, at the card size, and differs between kitchens', () => {
    const a = kitchenCardImage({ name: 'Little Rooftop', style: 'Garden & Grill', host: 'maple', reputation: 4.2 }), b = kitchenCardImage({ name: 'Noodle Cart', style: 'Noodle', host: null, reputation: 2 });
    expect(a).toMatch(/^data:image\/png;base64,/); expect(pngFromDataUri(a)).not.toBeNull(); expect(a).not.toBe(b);
    const img = new Image(); img.src = a!; return img.decode().then(() => { expect([img.naturalWidth, img.naturalHeight]).toEqual([CARD_WIDTH, CARD_HEIGHT]); });
  });
  it('is left out (undefined) where a canvas cannot be made', () => { expect(kitchenCardImage({ name: 'x', style: 'y', host: null, reputation: 3 }, () => null)).toBeUndefined(); });
});

describe('a neighbor\'s face', () => {
  it('is the pixel face right away, and stays so when there is no avatar to ask for', async () => {
    const screen = await render(<NeighborAvatar name="maple" />);
    await expect.element(screen.container.querySelector('img') as HTMLElement).toHaveAttribute('src', pixelFace('maple'));
  });
  it('becomes the Reddit avatar when one is given and it loads, and falls back to the pixel face when it will not', async () => {
    const good = pixelFace('someone-else'); // any image that loads
    restaurant.remote = remote({ avatar: async name => name === 'withavatar' ? good : 'https://i.redd.it/definitely-missing-404.png' });
    const ok = await render(<NeighborAvatar name="withavatar" />);
    await vi.waitFor(() => expect(ok.container.querySelector('img')!.getAttribute('src')).toBe(good)); await ok.unmount();
    const broken = await render(<NeighborAvatar name="brokenone" />);
    await vi.waitFor(() => expect(broken.container.querySelector('img')!.getAttribute('src')).toBe(pixelFace('brokenone')), { timeout: 8000 });
  });
});

describe('the reminder switch', () => {
  it('is absent in the plain browser game', async () => { const screen = await render(<Reminder />); expect(screen.container.querySelector('[role="switch"]')).toBeNull(); });
  it('shows the current setting, turns it on as its own action, and says so', async () => {
    const calls: boolean[] = []; let on = false;
    restaurant.remote = remote({ neighborhood: { load: async () => ({ error: 'x' }), setDoor: async () => null, visit: async () => ({ error: 'x' }), postKitchen: async () => ({ error: 'x' }), reminder: { status: async () => on, set: async v => { calls.push(v); on = v; return null; } } } });
    const screen = await render(<><Reminder /><Toaster /></>); const sw = screen.getByRole('switch', { name: 'Remind me about my streak' });
    await expect.element(sw).not.toBeChecked(); await sw.click(); expect(calls).toEqual([true]); await expect.element(sw).toBeChecked();
  });
  it('shows Reddit\'s refusal and stays off when reminders are not available', async () => {
    restaurant.remote = remote({ neighborhood: { load: async () => ({ error: 'x' }), setDoor: async () => null, visit: async () => ({ error: 'x' }), postKitchen: async () => ({ error: 'x' }), reminder: { status: async () => false, set: async () => 'Reminders are not available right now.' } } });
    const screen = await render(<><Reminder /><Toaster /></>); const sw = screen.getByRole('switch', { name: 'Remind me about my streak' });
    await sw.click(); await expect.element(screen.getByText('Reminders are not available right now.')).toBeVisible(); await expect.element(sw).not.toBeChecked();
  });
});
