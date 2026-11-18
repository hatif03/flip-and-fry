import { describe, expect, it } from 'vitest';
import { splashText } from '@/client/splash-text';
import { createDailyHeadline } from '@/management/daily-headline';
import { postContent } from '@/server/core/daily-post';

describe('the inline card', () => {
  it('shows today\'s date, headline and blurb from the post\'s own data, with no server call', () => {
    const t = splashText({ date: '2026-12-09', headline: 'rain', title: 'Rain on the roof' }, 'maple'), h = createDailyHeadline('2026-12-09');
    expect(t).toEqual({ eyebrow: 'Wed 9 Dec', title: h.title, blurb: h.blurb, byline: 'Hello, maple' });
  });
  it('is built from the same post data the server writes, and fits the 2 KB limit by a wide margin', () => {
    for (const date of ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11', '2026-12-12', '2026-12-13']) {
      const data = postContent(date).postData; expect(JSON.stringify(data).length).toBeLessThan(400); expect(splashText(data).title).toBe(createDailyHeadline(date).title);
    }
  });
  it('introduces a kitchen post with the kitchen\'s name', () => {
    const t = splashText({ kind: 'kitchen', door: 't2_x', title: 'Little Rooftop' }); expect(t.eyebrow).toBe('A kitchen on the roof'); expect(t.title).toBe('Little Rooftop'); expect(t.blurb).toContain('stop by as a guest');
    expect(splashText({ kind: 'kitchen' }).title).toBe('A neighbor’s kitchen');
  });
  it('falls back to the plain card for missing or odd data, and never passes markup through as anything but text', () => {
    for (const data of [undefined, {}, { date: 'nope' }, { date: '2026-13-45x' }, { date: 5 }]) expect(splashText(data as Record<string, unknown> | undefined).title).toBe('Flip and Fry');
    expect(splashText({ kind: 'kitchen', title: '<img src=x onerror=alert(1)>'.repeat(5) }).title.length).toBeLessThanOrEqual(28);
    expect(splashText(undefined).byline).toBe('');
  });
});
