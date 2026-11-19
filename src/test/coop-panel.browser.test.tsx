import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { Toaster } from '@/components/ui/sonner';
import { restaurant, type RemoteSession } from '@/management/engine';
import { CoopPanel, HelpingBanner } from '@/management/CoopPanel';
import { createDailyHeadline } from '@/management/daily-headline';
import { createRestaurant } from '@/management/types';
import '@/index.css';

const today = { type: 'today' as const, date: '2026-12-09', headline: createDailyHeadline('2026-12-09'), rev: 1, park: createRestaurant(), open: null, run: null, streak: 0, community: { opens: 0, locks: 0 } };
type Coop = NonNullable<RemoteSession['coop']>;
function withCoop(over: Partial<Coop> = {}): { remote: RemoteSession; coop: Coop; log: string[] } {
  const log: string[] = []; let invite = false, at: string | null = null;
  const coop: Coop = { get invite() { return invite; }, setInvite(on) { invite = on; log.push(`invite:${on}`); restaurant.notify(); }, helpingAt: () => at, list: async () => [{ id: 't2_maple', host: 'maple', kitchen: 'Maple Rooftop', helper: false }],
    join: async id => { log.push(`join:${id}`); at = 'maple'; return null; }, leave: async () => { log.push('leave'); at = null; }, ...over };
  return { remote: { open: async () => null, today, result: null, dismissResult() {}, coop }, coop, log };
}
beforeEach(async () => { restaurant.reset(); restaurant.remote = null; await page.viewport(360, 760); });
afterEach(() => { restaurant.remote = null; });

describe('cook together', () => {
  it('is absent in the plain browser game', async () => { const screen = await render(<CoopPanel />); expect(screen.container.querySelector('[aria-label="Cook together"]')).toBeNull(); });
  it('has an invite switch that is its own action, and lists kitchens that could use a hand', async () => {
    const { remote, log } = withCoop(); restaurant.remote = remote; const screen = await render(<><CoopPanel /><Toaster /></>);
    await expect.element(screen.getByText('Maple Rooftop')).toBeVisible(); await expect.element(screen.getByText('run by maple · service in progress')).toBeVisible();
    await screen.getByRole('switch', { name: 'Invite a neighbor to help tonight' }).click(); expect(log).toEqual(['invite:true']);
  });
  it('joins a kitchen with one tap, at least 44px tall, and says so', async () => {
    const { remote, log } = withCoop(); restaurant.remote = remote; const screen = await render(<><CoopPanel /><Toaster /></>);
    const help = screen.getByRole('button', { name: 'Help at Maple Rooftop' }); await expect.element(help).toBeVisible(); expect(help.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await help.click(); expect(log).toEqual(['join:t2_maple']);
  });
  it('shows the reason when a kitchen cannot be joined, and has a designed empty state', async () => {
    const { remote } = withCoop({ join: async () => 'That kitchen already has a helper tonight.' }); restaurant.remote = remote; const screen = await render(<><CoopPanel /><Toaster /></>);
    await screen.getByRole('button', { name: 'Help at Maple Rooftop' }).click(); await expect.element(screen.getByText('That kitchen already has a helper tonight.')).toBeVisible();
    await screen.unmount(); restaurant.remote = withCoop({ list: async () => [] }).remote; const empty = await render(<CoopPanel />);
    await expect.element(empty.getByText(/No kitchen is looking for a helper right now/)).toBeVisible();
  });
  it('turns the list into a status while helping, and the banner offers the way back', async () => {
    const { remote, coop, log } = withCoop(); restaurant.remote = remote; await coop.join('t2_maple');
    const screen = await render(<><CoopPanel /><HelpingBanner /></>);
    await expect.element(screen.getByRole('status').filter({ hasText: 'You are helping at maple’s pass.' })).toBeVisible();
    await screen.getByRole('button', { name: /Leave/ }).click(); expect(log).toContain('leave');
  });
  it('shows no banner when not helping', async () => { restaurant.remote = withCoop().remote; const screen = await render(<HelpingBanner />); expect(screen.container.querySelector('[aria-label="Helping"]')).toBeNull(); });
});
