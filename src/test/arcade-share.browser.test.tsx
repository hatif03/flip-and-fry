import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { connectArcade } from '@/client/arcade-sync';
import { ArcadeShare } from '@/arcade/ArcadeShare';
import { setArcadeDriver, localDriver } from '@/game/storage';
import type { Results } from '@/game/types';
import '@/index.css';

const result: Results = { score: 320, orderPoints: 300, tips: 20, penalties: 0, served: 6, missed: 0, stars: 2, level: 0, mode: 'solo', newBest: true, unlocked: false };
beforeEach(async () => { await page.viewport(360, 760); });
afterEach(() => setArcadeDriver(localDriver));

describe('posting a Test Kitchen result', () => {
  it('shows the exact text first, posts only after "Post as me", and then says it is done', async () => {
    const calls: Array<[string, string, unknown]> = [];
    await connectArcade(async (method, path, body) => { calls.push([method, path, body]); return path.endsWith('/preview') ? { status: 200, body: { text: 'Test Kitchen · Golden Hour · solo · best 300 points · 2 stars' } } : path === '/api/arcade' ? { status: 200, body: {} } : { status: 200, body: { commentId: 't1_x' } }; });
    const screen = await render(<><ArcadeShare result={result} /><Toaster /></>);
    await screen.getByRole('button', { name: 'Post to the thread' }).click();
    await expect.element(screen.getByText('Test Kitchen · Golden Hour · solo · best 300 points · 2 stars')).toBeVisible(); await expect.element(screen.getByText(/This posts as you/)).toBeVisible();
    expect(calls.some(c => c[1] === '/api/comment/arcade')).toBe(false); // nothing posted yet
    await screen.getByRole('button', { name: 'Post as me' }).click();
    await vi.waitFor(() => expect(calls.some(c => c[1] === '/api/comment/arcade' && JSON.stringify(c[2]) === '{"level":0,"mode":"solo"}')).toBe(true));
    await expect.element(screen.getByRole('button', { name: 'Posted ✓' })).toBeDisabled();
  });
  it('can be cancelled without posting, and a refused preview closes with the reason', async () => {
    const calls: string[] = [];
    await connectArcade(async (_m, path) => { calls.push(path); return path.endsWith('/preview') ? { status: 409, body: { error: 'Play that shift first.' } } : { status: 200, body: {} }; });
    const screen = await render(<><ArcadeShare result={result} /><Toaster /></>);
    await screen.getByRole('button', { name: 'Post to the thread' }).click();
    await expect.element(screen.getByText('Play that shift first.')).toBeVisible(); expect(calls).not.toContain('/api/comment/arcade');
  });
});
