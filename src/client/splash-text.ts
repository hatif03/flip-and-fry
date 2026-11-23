import { createDailyHeadline, formatDate } from '../management/daily-headline';

/**
 * What the inline card says, from the post's own data, so it needs no server call. A daily post carries the date and the headline;
 * a kitchen post carries the kitchen's name. Anything missing or odd falls back to the plain card, and every value is shown as text.
 */
const clean = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
export function splashText(data: Record<string, unknown> | undefined, username?: string): { eyebrow: string; title: string; blurb: string; byline: string } {
  const byline = username ? `Hello, ${username}` : '';
  if (data?.kind === 'kitchen') {
    const kitchen = clean(data.title, 28);
    return { eyebrow: 'A kitchen on the roof', title: kitchen || 'A neighbor’s kitchen', blurb: 'Open the post, stop by as a guest and order a dish. Nothing is lost, nothing is won.', byline };
  }
  const date = clean(data?.date, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    try { const headline = createDailyHeadline(date); return { eyebrow: formatDate(date), title: headline.title, blurb: headline.blurb, byline }; } catch { /* not a real date: use the plain card */ }
  }
  return { eyebrow: '', title: 'Flip and Fry', blurb: 'Run the pass of a rooftop restaurant: cook the orders, earn up to three stars, come back for tomorrow’s headline.', byline };
}
