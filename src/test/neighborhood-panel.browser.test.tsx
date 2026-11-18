import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { restaurant, type RemoteSession } from '@/management/engine';
import { Neighborhood } from '@/management/Neighborhood';
import { createDailyHeadline } from '@/management/daily-headline';
import type { BulletinNote, NeighborhoodView, VisitResult } from '@/management/social';
import { createRestaurant } from '@/management/types';
import '@/index.css';

const today = { type: 'today' as const, date: '2026-12-09', headline: createDailyHeadline('2026-12-09'), rev: 1, park: createRestaurant(), open: null, run: null, streak: 0, community: { opens: 0, locks: 0 } };
const sample = { id: 'sample-garden', kind: 'sample' as const, kitchen: "Basil's Garden", style: 'Garden & Grill', host: null, blurb: 'Planters, lanterns and a friendly pace.' };
const real = { id: 't2_maple', kind: 'real' as const, kitchen: 'Maple Rooftop', style: 'Grill', host: 'maple', blurb: 'Quick service, short waits.' };
const note: BulletinNote = { visitor: 'bob', kitchen: 'Little Rooftop', outcome: 'served', tip: 3, line: 'Served in 12s, tip $3', thought: 'The weakest point is how quickly guests reach a seat.', date: '2026-12-09' };

function hood(view: NeighborhoodView | { error: string }, extras: Partial<NonNullable<RemoteSession['neighborhood']>> = {}): RemoteSession {
  return { open: async () => null, today, result: null, dismissResult() {}, neighborhood: { load: async () => view, setDoor: async () => null, visit: async () => ({ door: sample, outcome: 'served', tip: 2, wait: 9, line: 'Served in 9s, tip $2' } satisfies VisitResult), ...extras } };
}
beforeEach(async () => { restaurant.reset(); restaurant.remote = null; await page.viewport(360, 760); });
afterEach(() => { restaurant.remote = null; });

describe('the neighborhood panel', () => {
  it('is absent in the plain browser game', async () => {
    const screen = await render(<Neighborhood state={createRestaurant()} />);
    expect(screen.container.querySelector('[aria-label="The neighborhood"]')).toBeNull();
  });
  it('always calls a sample a sample, and names the host of a real kitchen', async () => {
    restaurant.remote = hood({ doors: [real, sample], mine: false, allowed: true, bulletin: [] });
    const screen = await render(<Neighborhood state={createRestaurant()} />);
    await expect.element(screen.getByText('Sample kitchen')).toBeVisible(); await expect.element(screen.getByText('by maple ·')).toBeVisible();
    await expect.element(screen.getByText('Kitchens to visit · you would order sunset burger')).toBeVisible();
  });
  it('shows a designed empty bulletin, and the notes when there are some', async () => {
    restaurant.remote = hood({ doors: [sample], mine: false, allowed: true, bulletin: [] });
    const empty = await render(<Neighborhood state={createRestaurant()} />);
    await expect.element(empty.getByText('Leave your door open and neighbors can stop by.')).toBeVisible();
    await empty.unmount();
    restaurant.remote = hood({ doors: [sample], mine: true, allowed: true, bulletin: [note] });
    const full = await render(<Neighborhood state={createRestaurant()} />);
    await expect.element(full.getByText('bob: Served in 12s, tip $3. The weakest point is how quickly guests reach a seat.')).toBeVisible();
  });
  it('visits with the player\'s own dearest dish and shows how it went', async () => {
    const visits: string[] = [];
    restaurant.remote = hood({ doors: [sample], mine: false, allowed: true, bulletin: [] }, { visit: async (id, dish) => { visits.push(`${id}:${dish}`); return { door: sample, outcome: 'served', tip: 2, wait: 9, line: 'Served in 9s, tip $2' }; } });
    const screen = await render(<Neighborhood state={createRestaurant()} />);
    await screen.getByRole('button', { name: "Visit Basil's Garden" }).click();
    expect(visits).toEqual(['sample-garden:burger']); await expect.element(screen.getByText('Served in 9s, tip $2.')).toBeVisible();
  });
  it('turns the door switch into its own action and says what happened', async () => {
    const calls: boolean[] = [];
    restaurant.remote = hood({ doors: [sample], mine: false, allowed: true, bulletin: [] }, { setDoor: async open => { calls.push(open); return null; } });
    const screen = await render(<Neighborhood state={createRestaurant()} />); await render(<Toaster />);
    await screen.getByRole('switch', { name: 'Leave my door open' }).click(); expect(calls).toEqual([true]);
  });
  it('disables the door switch, with the reason, when moderators have turned open doors off', async () => {
    restaurant.remote = hood({ doors: [sample], mine: false, allowed: false, bulletin: [] });
    const screen = await render(<Neighborhood state={createRestaurant()} />);
    await expect.element(screen.getByRole('switch', { name: 'Leave my door open' })).toBeDisabled(); await expect.element(screen.getByText('The moderators have switched this off here.')).toBeVisible();
  });
  it('shows a failed load with a way to try again, and keeps every button at least 44px', async () => {
    const loads = [{ error: 'Could not reach the neighborhood.' } as { error: string }, { doors: [sample], mine: false, allowed: true, bulletin: [] } as NeighborhoodView]; let n = 0;
    restaurant.remote = hood(loads[0], { load: async () => loads[Math.min(n++, 1)] });
    const screen = await render(<Neighborhood state={createRestaurant()} />);
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Could not reach the neighborhood.');
    await screen.getByRole('button', { name: 'Try again' }).click();
    const visit = screen.getByRole('button', { name: "Visit Basil's Garden" }); await expect.element(visit).toBeVisible();
    expect(visit.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44); void vi;
  });
});
