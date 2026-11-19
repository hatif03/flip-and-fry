import { Landmark } from 'lucide-react';
import { restaurant } from './engine';
import { CATALOG, FORECLOSURE_PIECES } from './types';

/**
 * The bank's final notice, shown while planning. It says exactly what happens next, so a foreclosure is never a surprise, and that
 * nothing that makes the restaurant yours is ever taken.
 */
export function NoticeBanner() {
  const s = restaurant.state;
  if (s.phase !== 'planning') return null;
  if (s.notice === 1) return <aside role="alert" aria-label="Final notice" className="pointer-events-auto mx-auto mt-1.5 flex max-w-[1600px] items-start gap-2 rounded-xl border border-tomato bg-tomato px-3 py-1.5 text-xs text-white shadow-md sm:mt-2 sm:px-4">
    <Landmark size={16} className="mt-0.5 shrink-0" aria-hidden />
    <p><b>Final notice from the bank.</b> One more night at a loss and it sells up to {FORECLOSURE_PIECES} of your best pieces into storage (you can buy them back for 60%). A profitable night clears the notice.</p>
  </aside>;
  const f = s.foreclosure;
  if (f && f.day === s.day - 1) return <aside aria-label="The bank stepped in" className="pointer-events-auto mx-auto mt-1.5 flex max-w-[1600px] items-start gap-2 rounded-xl border border-ink/30 bg-paper/95 px-3 py-1.5 text-xs text-ink shadow-md sm:mt-2 sm:px-4">
    <Landmark size={16} className="mt-0.5 shrink-0 text-tomato" aria-hidden />
    <p><b>The bank stepped in.</b> It took {f.kinds.map(k => CATALOG[k].name.toLowerCase()).join(', ') || 'nothing'} into storage, let {f.released} of your crew go and cleared your loan. Buy pieces back in Build for 60%. Your name, stars, streak and records are untouched.</p>
  </aside>;
  return null;
}
