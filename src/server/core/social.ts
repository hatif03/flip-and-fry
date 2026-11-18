import { cleanNote, flairForStreak, FLAIR, receiptComment } from '../../management/social';
import type { StoredRun } from '../../shared/api';
import { POSTS_KEY } from './daily-post';
import { keys, streakFor, utcDate, type Deps, type Fail, type Player } from './game';
import { withinRate } from './store';

/**
 * The things a player can post, each from its own explicit button. Rules from Reddit's user-action policy: ask first (the client shows
 * the exact text), act only after a tap, keep comment, flair and follow separate, never gate play on any of them. The Reddit calls
 * sit behind this adapter so the rules are tested without Reddit.
 */
export interface SocialApi {
  /** Comment as the player. Before the app is approved this runs as the app account (except for the app owner). */
  comment(parentId: string, text: string): Promise<{ id: string }>;
  setFlair(username: string, text: string, background: string): Promise<void>;
  subscribe(): Promise<void>;
}
export const COMMENTS_KEY = 'comments';
const commented = (date: string) => `commented:${date}`;
const TTL = 45 * 86400;
const fail = (status: Fail['status'], error: string): Fail => ({ ok: false, status, error });
const limited = async (deps: Deps, uid: string, action: string): Promise<Fail | null> => (await withinRate(deps.store, `rate:${action}:${uid}`, 6, 60)) ? null : fail(429, 'Slow down a little and try again.');

/** The exact comment, built from the stored receipt. The client previews this same text before anything is sent. */
export async function commentPreview(deps: Deps, user: Player, note: string): Promise<{ ok: true; value: { text: string; reply: boolean } } | Fail> {
  const cleaned = cleanNote(note); if ('error' in cleaned) return fail(400, cleaned.error);
  const date = utcDate(deps.now()), raw = await deps.store.hGet(keys.runs(date), user.id);
  if (!raw) return fail(409, 'Finish a service today to post a result.');
  const run = JSON.parse(raw) as StoredRun, streak = await streakFor(deps.store, user.id, date);
  const line = receiptComment({ name: run.name, style: run.style, award: run.night.award.title, rating: run.report.rating, streak });
  return { ok: true, value: { text: cleaned.note ? `${line}\n\n${cleaned.note}` : line, reply: !cleaned.note } };
}

/** Post today's result as the player: a reply to the sticky results comment, or a top-level comment if they added a note. One a day. */
export async function postResult(deps: Deps, api: SocialApi, user: Player, note = ''): Promise<{ ok: true; value: { commentId: string; text: string } } | Fail> {
  const guard = await limited(deps, user.id, 'comment'); if (guard) return guard;
  const preview = await commentPreview(deps, user, note); if ('error' in preview) return preview;
  const date = utcDate(deps.now()), post = await deps.store.hGet(POSTS_KEY, date), stored = post ? JSON.parse(post) as { postId?: string; stickyId?: string | null } : null;
  if (!stored?.postId) return fail(409, 'Today’s post is not ready yet.');
  // The claim comes first, so two quick taps can never post twice.
  if ((await deps.store.hSetNX(commented(date), user.id, 'pending')) === 0) return fail(409, 'You already posted today’s result.');
  await deps.store.expire(commented(date), TTL);
  try {
    const parent = preview.value.reply ? (stored.stickyId ?? stored.postId) : stored.postId, made = await api.comment(parent, preview.value.text);
    await deps.store.hSet(COMMENTS_KEY, { [made.id]: `${user.id}:${date}` });
    await deps.store.hSet(commented(date), { [user.id]: made.id });
    const rawRun = await deps.store.hGet(keys.runs(date), user.id);
    if (rawRun) await deps.store.hSet(keys.runs(date), { [user.id]: JSON.stringify({ ...(JSON.parse(rawRun) as StoredRun), commentId: made.id }) });
    return { ok: true, value: { commentId: made.id, text: preview.value.text } };
  } catch (error) {
    await deps.store.hDel(commented(date), [user.id]); // release, so the player can try again
    return fail(500, error instanceof Error ? 'Reddit could not post the comment.' : 'Could not post.');
  }
}

/** Set the player's flair from their streak. The flair is a reward for a real streak, never for a comment or a vote. */
export async function wearFlair(deps: Deps, api: SocialApi, user: Player): Promise<{ ok: true; value: { text: string } } | Fail> {
  const guard = await limited(deps, user.id, 'flair'); if (guard) return guard;
  const text = flairForStreak(await streakFor(deps.store, user.id, utcDate(deps.now())));
  if (!text) return fail(409, 'Earn a star today to start a streak, then you can wear the flair.');
  try { await api.setFlair(user.name, text, FLAIR.background); return { ok: true, value: { text } }; } catch { return fail(500, 'Reddit could not set your flair here.'); }
}

/** Follow this kitchen's community. Its own button; skipping it changes nothing. There is no API to ask whether they already do. */
export async function follow(deps: Deps, api: SocialApi, user: Player): Promise<{ ok: true; value: { followed: true } } | Fail> {
  const guard = await limited(deps, user.id, 'follow'); if (guard) return guard;
  try { await api.subscribe(); } catch { return fail(500, 'Reddit could not follow this community.'); }
  await deps.store.set(`subscribed:${user.id}`, '1', { expiration: new Date(deps.now() + 30 * 86400 * 1000) });
  return { ok: true, value: { followed: true } };
}

// ---- deletion ---------------------------------------------------------------------------------------------------------------
// Triggers can fire more than once, so both are idempotent.

/** A deleted comment drops its stored id everywhere, and the player may post again. */
export async function commentDeleted(deps: Deps, commentId: string): Promise<void> {
  const owner = await deps.store.hGet(COMMENTS_KEY, commentId); if (!owner) return;
  const [uid, date] = owner.split(':');
  const rawRun = await deps.store.hGet(keys.runs(date), uid);
  if (rawRun) { const { commentId: _gone, ...run } = JSON.parse(rawRun) as StoredRun; void _gone; await deps.store.hSet(keys.runs(date), { [uid]: JSON.stringify(run) }); }
  await deps.store.hDel(commented(date), [uid]); await deps.store.hDel(COMMENTS_KEY, [commentId]);
}

/** A deleted daily post is forgotten, so the next request creates today's post again instead of pointing at a dead one. */
export async function postDeleted(deps: Deps, postId: string): Promise<void> {
  const all = await deps.store.hGetAll(POSTS_KEY), dates = Object.entries(all).filter(([, raw]) => { try { return (JSON.parse(raw) as { postId?: string }).postId === postId; } catch { return false; } }).map(([date]) => date);
  if (dates.length) await deps.store.hDel(POSTS_KEY, dates);
}
