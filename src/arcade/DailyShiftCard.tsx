import { CalendarDays } from 'lucide-react';
import { SHIFTS } from '@/game/config';
import { engine } from '@/game/engine';
import { shiftOfDay } from './daily-shift';

/** One tap into the shift the date picked. Shown on the Test Kitchen's menu, solo only (two chefs need two keyboards). */
export function DailyShiftCard({ date }: { date: string }) {
  const level = shiftOfDay(date, l => engine.unlocked(l, 'solo'));
  return <button type="button" onClick={() => { engine.select(level, 'solo'); engine.start(false); }} className="pointer-events-auto fixed left-4 top-[68px] z-30 flex min-h-11 items-center gap-2 rounded-xl bg-gold px-3 text-sm font-extrabold text-ink shadow-md md:left-8" aria-label={`Play today's shift: ${SHIFTS[level].name}`}>
    <CalendarDays size={18} aria-hidden />Today’s shift · {SHIFTS[level].name}
  </button>;
}
