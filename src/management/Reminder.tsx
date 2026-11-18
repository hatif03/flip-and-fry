import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { restaurant } from './engine';

/**
 * An optional push reminder, its own switch. Turning it on asks Reddit to opt the player in; it is only used to say, once a day, that a
 * streak is at risk. Push notifications are a gated beta, so if Reddit refuses the switch says so and nothing else changes.
 */
export function Reminder() {
  const reminder = restaurant.remote?.neighborhood?.reminder, [on, setOn] = useState<boolean | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; void reminder?.status().then(v => { if (live) setOn(v); }); return () => { live = false; }; }, [reminder]);
  if (!reminder) return null;
  const change = async (next: boolean): Promise<void> => { setBusy(true); const e = await reminder.set(next); setBusy(false); if (e) toast.error(e); else { setOn(next); toast.success(next ? 'Reminders are on.' : 'Reminders are off.'); } };
  return <label className="mb-5 flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-white/40 px-3 py-2"><span className="text-sm font-extrabold"><BellRing size={16} className="mr-1 inline" aria-hidden />Remind me about my streak<span className="block text-[11px] font-normal text-ink/60">One notification, only when a streak is at risk. Turn it off any time.</span></span><Switch aria-label="Remind me about my streak" checked={on === true} disabled={on === null || busy} onCheckedChange={v => void change(v)} /></label>;
}
