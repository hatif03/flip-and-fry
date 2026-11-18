import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectArcade } from '@/client/arcade-sync';
import { emptyArcade } from '@/game/arcade-save';
import { loadOutfits, loadProgress, localDriver, saveOutfits, saveProgress, setArcadeDriver } from '@/game/storage';
import type { Http } from '@/client/session';

type Call = { method: string; path: string; body?: unknown };
let calls: Call[], serverSave: unknown, postStatus: number, getStatus: number;
const http: Http = async (method, path, body) => { calls.push({ method, path, body }); return method === 'GET' ? { status: getStatus, body: serverSave } : { status: postStatus, body: {} }; };
beforeEach(() => { vi.useFakeTimers(); calls = []; serverSave = { type: 'arcade', progress: { solo: [210, 0, 0], coop: [0, 0, 0] }, outfits: [{ hat: 'gold', apron: 'cream' }, { hat: 'cream', apron: 'cream' }] }; postStatus = 200; getStatus = 200; });
afterEach(() => { vi.useRealTimers(); setArcadeDriver(localDriver); });

describe('keeping the Test Kitchen on the server', () => {
  it('hands the engine the server\'s copy as its starting point', async () => {
    await connectArcade(http); expect(loadProgress().solo).toEqual([210, 0, 0]); expect(loadOutfits()[0].hat).toBe('gold');
  });
  it('starts empty and still plays when the server cannot be reached or sends nonsense', async () => {
    getStatus = 500; await connectArcade(http); expect(loadProgress()).toEqual(emptyArcade().progress);
    serverSave = { progress: 'x' }; getStatus = 200; await connectArcade(http); expect(loadProgress()).toEqual(emptyArcade().progress);
    await connectArcade(async () => { throw new Error('offline'); }); expect(loadOutfits()).toEqual(emptyArcade().outfits);
  });
  it('sends several quick changes as one save, with both scores and outfits', async () => {
    await connectArcade(http, 600); calls = [];
    saveProgress({ solo: [300, 0, 0], coop: [0, 0, 0] }); saveOutfits([{ hat: 'dusk', apron: 'tomato' }, { hat: 'cream', apron: 'cream' }]);
    expect(calls).toHaveLength(0); await vi.advanceTimersByTimeAsync(700);
    expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/arcade' });
    const sent = calls[0].body as { progress: { solo: number[] }; outfits: { hat: string; apron: string }[] }; expect(sent.progress.solo).toEqual([300, 0, 0]); expect(sent.outfits[0]).toEqual({ hat: 'dusk', apron: 'tomato' });
  });
  it('keeps trying after a failed save, on the next change or when the tab is hidden', async () => {
    const { flush } = await connectArcade(http, 600); calls = []; postStatus = 500;
    saveProgress({ solo: [5, 0, 0], coop: [0, 0, 0] }); await vi.advanceTimersByTimeAsync(700); expect(calls).toHaveLength(1);
    postStatus = 200; await flush(); expect(calls).toHaveLength(2); expect((calls[1].body as { progress: { solo: number[] } }).progress.solo).toEqual([5, 0, 0]);
    await flush(); expect(calls).toHaveLength(2); // nothing left to send
  });
  it('reports the save as made so the game does not show a storage warning', async () => {
    await connectArcade(http); expect(saveProgress({ solo: [1, 0, 0], coop: [0, 0, 0] })).toBe(true); expect(saveOutfits(emptyArcade().outfits)).toBe(true);
  });
});

describe('the research bonus message', () => {
  it('tells the player once a save earned research, and says nothing otherwise', async () => {
    const earned: number[] = []; let bonus = 5;
    const reply: Http = async (method) => method === 'GET' ? { status: 200, body: serverSave } : { status: 200, body: { bonus } };
    const { flush } = await connectArcade(reply, 600, n => earned.push(n));
    saveProgress({ solo: [180, 0, 0], coop: [0, 0, 0] }); await flush(); expect(earned).toEqual([5]);
    bonus = 0; saveProgress({ solo: [190, 0, 0], coop: [0, 0, 0] }); await flush(); expect(earned).toEqual([5]);
    bonus = 'x' as unknown as number; saveProgress({ solo: [195, 0, 0], coop: [0, 0, 0] }); await flush(); expect(earned).toEqual([5]);
  });
});
