import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { Session, type Http } from '@/client/session';
import { actionLogSchema } from '@/management/actions';
import { restaurant } from '@/management/engine';
import { getBoard } from '@/server/core/board';
import ManagementGame from '@/management/ManagementGame';
import { DISHES } from '@/management/types';
import { rollDay, type PostApi } from '@/server/core/daily-post';
import { getToday, lockService, openService, savePark, utcDate, type Deps, type Player } from '@/server/core/game';
import { isDoorOpen, listDoors, readBulletin, setDoor, visitDoor } from '@/server/core/doors';
import { commentPreview, postResult, wearFlair, follow, type SocialApi } from '@/server/core/social';
import { FakeStore } from './fake-store';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div data-testid="mock-scene" /> }));

/**
 * The whole daily loop, through the real screens: today's post, a planning change, Open, a service with a cook at the pass, the result
 * card the server's replay produced, and the three optional Reddit buttons. The server rules are the real ones, on a fake Redis and a
 * fake Reddit.
 */
const alice: Player = { id: 't2_alice', name: 'alice' };
let store: FakeStore, comments: Array<{ parent: string; text: string }>, flairs: string[];
const postApi: PostApi = { createPost: async () => ({ id: 't3_today' }), comment: async () => ({ id: 't1_sticky', makeSticky: async () => undefined }) };
const social: SocialApi = { comment: async (parent, text) => { comments.push({ parent, text }); return { id: `t1_c${comments.length}` }; }, setFlair: async (_u, text) => { flairs.push(text); }, subscribe: async () => undefined };

function network(): Http {
  const deps: Deps = { store, now: () => store.now };
  return async (method, path, raw) => {
    const body = raw === undefined ? undefined : JSON.parse(JSON.stringify(raw)) as { rev: number; date: string; actions: unknown; note?: string; open?: boolean; doorId?: string; dish?: string };
    const out = (r: { ok: true; value: unknown } | { ok: false; status: number; error: string; conflict?: boolean }) => 'error' in r ? { status: r.status, body: { type: 'error', error: r.error, conflict: r.conflict } } : { status: 200, body: JSON.parse(JSON.stringify(r.value)) };
    if (method === 'GET' && path === '/api/today') return out(await getToday(deps, alice));
    if (method === 'GET' && path === '/api/doors') return { status: 200, body: { type: 'doors', doors: await listDoors(deps, alice), mine: await isDoorOpen(deps, alice), allowed: true, bulletin: await readBulletin(deps, alice) } };
    if (method === 'GET' && path.startsWith('/api/board')) return out(await getBoard(deps, alice, utcDate(store.now), path.includes('shift=lunch') ? 'lunch' : 'dinner'));
    if (path === '/api/comment/preview') return out(await commentPreview(deps, alice, body?.note ?? ''));
    if (path === '/api/comment') return out(await postResult(deps, social, alice, body?.note ?? ''));
    if (path === '/api/flair') return out(await wearFlair(deps, social, alice));
    if (path === '/api/subscribe') return out(await follow(deps, social, alice));
    if (path === '/api/door') return out(await setDoor(deps, alice, body!.open!, true));
    if (path === '/api/visit') return out(await visitDoor(deps, alice, body!.doorId!, body!.dish));
    const log = actionLogSchema.safeParse(body?.actions); if (!log.success) return { status: 400, body: { type: 'error', error: 'Invalid request.' } };
    if (path === '/api/save') return out(await savePark(deps, alice, body!.rev, log.data));
    if (path === '/api/open') return out(await openService(deps, alice, body!.rev, log.data));
    if (path === '/api/lock') return out(await lockService(deps, alice, body!.date, log.data, (body as { shift?: 'lunch' | 'dinner' }).shift ?? 'dinner'));
    return { status: 404, body: null };
  };
}

beforeEach(async () => {
  store = new FakeStore(); store.now = Date.UTC(2026, 11, 9, 12); comments = []; flairs = [];
  restaurant.reset(); restaurant.remote = null; await page.viewport(360, 760);
  await rollDay(store, postApi, store.now, '2026-12-09');
});
afterEach(() => { restaurant.remote = null; restaurant.autoRoll = true; });

it('plays a whole night: open, cook at the pass, the server\'s result card, post, flair, follow, leave the door open', async () => {
  const timers = { set: () => 0, clear: () => undefined }, session = new Session(restaurant, network(), timers);
  expect(await session.start()).toBeNull();
  const screen = await render(<><ManagementGame /><Toaster /></>);
  await expect.element(screen.getByRole('complementary', { name: 'Today' })).toHaveTextContent('Rain on the roof');

  // A change made while planning is saved by the server.
  restaurant.hire('server'); await session.flush(); await session.idle();
  expect((await getToday({ store, now: () => store.now }, alice) as { value: { park: { staff: unknown[] } } }).value.park.staff).toHaveLength(3);

  // The first service is lunch: a minute, its own card and board, and no posting from it.
  const runNight = async (): Promise<number> => {
    await screen.getByRole('button', { name: /^Open restaurant/ }).click();
    await expect.element(screen.getByRole('region', { name: 'The pass' })).toBeVisible();
    expect(restaurant.state.phase).toBe('service');
    // Run the night, taking a cook at the pass the moment a ticket is waiting and no chef is free.
    let cooked = 0;
    for (let i = 0; i < 2600 && restaurant.state.phase === 'service'; i++) {
      const waiting = restaurant.state.guests.find(g => g.stage === 'waiting');
      if (waiting && !restaurant.state.guests.some(g => g.owner) && restaurant.claimTicket(waiting.id) === null) cooked++;
      const mine = restaurant.state.guests.find(g => g.owner); if (mine && mine.cook >= DISHES[mine.dish].seconds) restaurant.plate(mine.id);
      restaurant.tick();
    }
    await session.idle(); restaurant.notify();
    return cooked;
  };
  expect(restaurant.state.shift).toBe('lunch');
  await runNight();
  const lunchCard = screen.getByRole('dialog'); await expect.element(lunchCard).toBeVisible();
  expect(session.result?.shift).toBe('lunch'); expect(session.result?.official).toBe(true);
  await expect.element(lunchCard.getByLabelText('Lunch goals')).toBeVisible();
  await expect.element(lunchCard.getByRole('button', { name: 'Post this result' })).not.toBeInTheDocument();
  await lunchCard.getByRole('button', { name: /^(Continue|Spend your)/ }).click();
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();

  // Then dinner, picked from the lunch/dinner choice: the card the rest of this test is about.
  await screen.getByRole('button', { name: 'Close panel' }).click(); // "Spend your $X" opened the shop
  await screen.getByRole('button', { name: /^Dinner/ }).click(); expect(restaurant.state.shift).toBe('dinner');
  const cooked = await runNight();

  // The card is the server's replay: the same hash the preview ended on, and an official result.
  const card = screen.getByRole('dialog'); await expect.element(card).toBeVisible();
  expect(session.result?.official).toBe(true); expect(session.result?.hash).toBeTruthy(); expect(cooked).toBeGreaterThan(0);
  await expect.element(card).toHaveTextContent('Kitchen card'); await expect.element(card).toHaveTextContent('Served');

  // Today's board: the player's own official result, ranked, from the server.
  await expect.element(card.getByLabelText("Today's board")).toHaveTextContent('You are 1st of 1');

  // Post the result as the player, after seeing the exact text.
  await card.getByRole('button', { name: 'Post this result' }).click();
  await expect.element(card.getByText('This is exactly what will be posted:')).toBeVisible();
  await card.getByRole('button', { name: 'Post as me' }).click();
  await vi.waitFor(() => expect(comments).toHaveLength(1)); expect(comments[0].parent).toBe('t1_sticky'); expect(comments[0].text).toMatch(/Little Rooftop · .+ · rating \d\.\d/);

  // Flair and follow are their own buttons.
  await card.getByText('More', { exact: true }).click();
  const flair = card.getByRole('button', { name: /Wear/ });
  if (session.result!.stars.stars >= 1) { await flair.click(); await vi.waitFor(() => expect(flairs).toHaveLength(1)); }
  await card.getByRole('button', { name: /Follow this kitchen/ }).click();

  // Continue, then leave the door open from the ledger.
  await card.getByRole('button', { name: /^(Continue|Spend your)/ }).click();
  // Wait for the card to be gone (it zooms out), so nothing is animating over the next click.
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Ledger', exact: true }).click();
  const door = screen.getByRole('switch', { name: 'Leave my door open' });
  await expect.element(door).toBeVisible();
  door.element().scrollIntoView({ block: 'center' }); (door.element() as HTMLElement).click(); // a direct click: under load the panel's settling animation can keep the element from ever looking "stable"
  await vi.waitFor(async () => expect(await isDoorOpen({ store, now: () => store.now }, alice)).toBe(true));
}, 60_000);
