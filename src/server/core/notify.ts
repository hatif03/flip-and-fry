import { POSTS_KEY } from './daily-post';
import { keys, streakFor, type Deps, type Fail, type Player } from './game';
import { withinRate } from './store';

/**
 * Push reminders, and the game badge. Both are opt-in and explicit: a player taps "Remind me" (which asks Reddit to opt them in), and
 * only opted-in players are ever messaged. A reminder is sent at most once a day, only to someone with a streak to lose who has not
 * played today, and links to today's post. Reddit's push notifications are a gated beta, so every call here can fail without harm.
 */
export interface NotifyApi {
  optIn(): Promise<boolean>;
  optOut(): Promise<boolean>;
  isOptedIn(userId: string): Promise<boolean>;
  optedInUsers(): AsyncIterable<string>;
  enqueue(options: { title: string; body: string; recipients: Array<{ userId: string; link: string; data: Record<string, string> }> }): Promise<{ successCount: number; failureCount: number }>;
  /** Show the game badge, linking to a post, until `expiresAt`. */
  showBadge(postId: string, expiresAt: Date): Promise<boolean>;
}
const fail = (status: Fail['status'], error: string): Fail => ({ ok: false, status, error });
const remindedKey = (date: string): string => `reminded:${date}`;
export const MAX_RECIPIENTS = 1000;

/** Opt the player in or out. Its own button; nothing depends on it. */
export async function setReminder(deps: Deps, api: NotifyApi, user: Player, on: boolean): Promise<{ ok: true; value: { on: boolean } } | Fail> {
  if (!(await withinRate(deps.store, `rate:remind:${user.id}`, 6, 60))) return fail(429, 'Slow down a little and try again.');
  try { const done = on ? await api.optIn() : await api.optOut(); return done ? { ok: true, value: { on } } : fail(500, 'Reddit did not change your reminder setting.'); }
  catch { return fail(500, 'Reminders are not available right now.'); }
}
export async function reminderStatus(api: NotifyApi, user: Player): Promise<boolean> { try { return await api.isOptedIn(user.id); } catch { return false; } }

export type ReminderResult = { sent: number; skipped: number; reason?: 'no-post' | 'already-sent' | 'unavailable' };

/** Send today's streak reminders. The claim is taken first, so the job and a manual run cannot both send. */
export async function sendStreakReminders(deps: Deps, api: NotifyApi, date: string): Promise<ReminderResult> {
  const stored = await deps.store.hGet(POSTS_KEY, date);
  let postId: string | undefined; try { postId = stored ? (JSON.parse(stored) as { postId?: string }).postId : undefined; } catch { postId = undefined; }
  if (!postId) return { sent: 0, skipped: 0, reason: 'no-post' };
  if ((await deps.store.hSetNX(remindedKey(date), 'claim', String(deps.now()))) === 0) return { sent: 0, skipped: 0, reason: 'already-sent' };
  await deps.store.expire(remindedKey(date), 3 * 86400);
  const recipients: Array<{ userId: string; link: string; data: Record<string, string> }> = []; let skipped = 0;
  try {
    for await (const userId of api.optedInUsers()) {
      if (recipients.length >= MAX_RECIPIENTS) break;
      // Someone who has already played today, or has no streak to lose, is left alone.
      if (await deps.store.hGet(keys.runs(date), userId)) { skipped++; continue; }
      const streak = await streakFor(deps.store, userId, date);
      if (streak < 1) { skipped++; continue; }
      recipients.push({ userId, link: postId, data: { days: String(streak) } });
    }
    if (!recipients.length) return { sent: 0, skipped };
    const r = await api.enqueue({ title: 'Your rooftop is waiting', body: 'Keep your {{days}}-day streak going: today’s headline is up.', recipients });
    return { sent: r.successCount, skipped: skipped + r.failureCount };
  } catch {
    await deps.store.hDel(remindedKey(date), ['claim']); // release, so a later run can try again
    return { sent: 0, skipped, reason: 'unavailable' };
  }
}

/** The badge that links to today's post until the end of the UTC day. Best effort, from the daily post's creation. */
export async function showTodaysBadge(deps: Deps, api: NotifyApi, postId: string): Promise<boolean> {
  const next = new Date(deps.now()); next.setUTCHours(24, 0, 0, 0);
  try { return await api.showBadge(postId, next); } catch { return false; }
}
