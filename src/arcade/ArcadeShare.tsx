import { useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { toast } from 'sonner';
import { arcadeHttp } from '@/client/arcade-sync';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ShareScore } from '@/components/ShareScore';
import type { Results } from '@/game/types';

/**
 * Posting a Test Kitchen result. On Reddit it is the same explicit flow as the restaurant's result: the exact text first, an
 * explicit "Post as me", once a day, built on the server from the saved best. Outside Reddit the original image share stays.
 */
export function ArcadeShare({ result }: { result: Results }) {
  const http = arcadeHttp, [open, setOpen] = useState(false), [text, setText] = useState<string | null>(null), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  if (!http) return <ShareScore result={result} />;
  const body = { level: result.level, mode: result.mode };
  const show = async (): Promise<void> => {
    setOpen(true); setText(null); const r = await http('POST', '/api/comment/arcade/preview', body);
    if (r.status === 200) setText((r.body as { text: string }).text); else { toast.error((r.body as { error?: string } | null)?.error ?? 'Could not prepare the comment.'); setOpen(false); }
  };
  const post = async (): Promise<void> => {
    setBusy(true); const r = await http('POST', '/api/comment/arcade', body); setBusy(false);
    if (r.status === 200) { toast.success('Posted.'); setDone(true); setOpen(false); } else toast.error((r.body as { error?: string } | null)?.error ?? 'Could not post.');
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button type="button" className="game-button min-h-[44px] border-gold/60 bg-teal text-paper disabled:opacity-60" disabled={done} onClick={() => void show()}><MessageSquareText className="size-5" aria-hidden="true" />{done ? 'Posted ✓' : 'Post to the thread'}</button></DialogTrigger>
    <DialogContent className="paper w-[calc(100%-32px)] max-w-md space-y-3 p-5">
      <DialogTitle className="font-display text-2xl">Post this result?</DialogTitle>
      <DialogDescription className="text-sm font-bold text-ink/65">This posts as you, under today’s results comment. It is exactly this:</DialogDescription>
      <blockquote className="rounded-xl bg-ink/5 p-3 text-sm">{text ?? 'Loading your result…'}</blockquote>
      <div className="flex gap-2"><button type="button" className="game-button min-h-[44px] flex-1 bg-teal text-paper disabled:opacity-50" disabled={busy || !text} onClick={() => void post()}>Post as me</button><button type="button" className="game-button min-h-[44px]" onClick={() => setOpen(false)}>Cancel</button></div>
    </DialogContent>
  </Dialog>;
}
