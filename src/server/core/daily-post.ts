import { createDailyHeadline, formatDate } from '../../management/daily-headline';
import type { Store } from './store';

/**
 * The daily post, created lazily. Reddit's cron timezone is undocumented, so the 00:05 job, the moderator menu and the
 * first player request of a new UTC day all call rollDay(). A claim in Redis makes them safe to race: exactly one creates.
 */
export interface PostApi {
  createPost(options: { title: string; postData: Record<string, string>; textFallback: string; flairText?: string }): Promise<{ id: string }>;
  comment(postId: string, text: string): Promise<{ id: string; makeSticky(): Promise<void> }>;
}
export const POSTS_KEY = 'posts';
/** A claim older than this is a crashed request, not a slow one; another request may take over. */
export const CLAIM_STALE_MS = 60_000;
export type RollResult = { ok: true; postId: string; stickyId: string | null; created: boolean } | { ok: false; busy: boolean; error: string };
type Stored = { postId: string; stickyId: string | null };

const parse = (raw: string | undefined): Stored | 'pending' | null => {
  if (!raw) return null;
  if (raw.startsWith('pending:')) return 'pending';
  try { const v = JSON.parse(raw) as Stored; return typeof v.postId === 'string' ? v : null; } catch { return null; }
};

export function postContent(date: string) {
  const headline = createDailyHeadline(date);
  return {
    headline,
    title: `Today on the roof · ${formatDate(date)}`,
    // postData is limited to 2 KB and is readable by the splash with no server call.
    postData: { date, headline: headline.id, title: headline.title },
    textFallback: `# Flip and Fry — ${formatDate(date)}\n\n**${headline.title}**\n\n${headline.blurb}\n\nOpen this post in the Reddit app or on new Reddit to run your rooftop restaurant. Today's headline changes the whole night, and your restaurant is still there tomorrow.`,
  };
}

export async function rollDay(store: Store, api: PostApi, now: number, date: string): Promise<RollResult> {
  const found = parse(await store.hGet(POSTS_KEY, date));
  if (found && found !== 'pending') return { ok: true, postId: found.postId, stickyId: found.stickyId, created: false };

  const claim = `pending:${now}`;
  if ((await store.hSetNX(POSTS_KEY, date, claim)) === 0) {
    const current = await store.hGet(POSTS_KEY, date), state = parse(current);
    if (state && state !== 'pending') return { ok: true, postId: state.postId, stickyId: state.stickyId, created: false };
    const claimedAt = Number(current?.slice('pending:'.length));
    if (!(now - claimedAt >= CLAIM_STALE_MS)) return { ok: false, busy: true, error: 'Today’s post is being created.' };
    await store.hSet(POSTS_KEY, { [date]: claim }); // the first request died; take over
  }

  const content = postContent(date);
  try {
    let post: { id: string };
    try { post = await api.createPost({ title: content.title, postData: content.postData, textFallback: content.textFallback, flairText: content.headline.title }); }
    catch { post = await api.createPost({ title: content.title, postData: content.postData, textFallback: content.textFallback }); } // flair needs a template and mod rights; the post matters more
    let stickyId: string | null = null;
    try {
      const sticky = await api.comment(post.id, 'Results for today go under this comment.');
      stickyId = sticky.id;
      await sticky.makeSticky().catch(() => undefined);
    } catch { /* the post exists and is playable; a missing sticky is retried by the nightly report */ }
    await store.hSet(POSTS_KEY, { [date]: JSON.stringify({ postId: post.id, stickyId } satisfies Stored) });
    return { ok: true, postId: post.id, stickyId, created: true };
  } catch (error) {
    if ((await store.hGet(POSTS_KEY, date)) === claim) await store.hDel(POSTS_KEY, [date]); // release so the next request can retry
    return { ok: false, busy: false, error: error instanceof Error ? error.message : 'Could not create today’s post.' };
  }
}
