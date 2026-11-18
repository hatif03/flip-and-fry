import type { DoorSummary } from '../../management/social';
import { VISITOR_NAME } from '../../management/types';
import { doorSummary, isDoorOpen } from './doors';
import { utcDate, type Deps, type Fail, type Player } from './game';
import { withinRate } from './store';

/**
 * "Post my kitchen": an optional, explicit button that creates a post in the community as the player (a user-generated custom post),
 * so a neighbor can open it and visit that kitchen. The post carries only the door id and the kitchen's name. One a day, and only
 * for a door that is open, because the post would have nothing to show otherwise.
 */
export interface KitchenPostApi {
  /** Create the post as the player. Before the app is approved this runs as the app account, except for the app owner. */
  createAsUser(options: { title: string; postData: Record<string, string>; text: string }): Promise<{ id: string; url: string }>;
}
const postedKey = (date: string): string => `kitchen-posts:${date}`;
const fail = (status: Fail['status'], error: string): Fail => ({ ok: false, status, error });

export function kitchenPostContent(kitchen: string, host: string | null, door: string, date: string) {
  return {
    title: `${kitchen} · a kitchen on the roof`,
    postData: { kind: 'kitchen', door, title: kitchen, date },
    text: `${kitchen} is open for a visit${host ? ` (run by ${host})` : ''}. Open this post to stop by as a guest and order a dish. Nothing is lost, nothing is won: visits never change anyone's cash or stars.`,
  };
}

export async function postKitchen(deps: Deps, api: KitchenPostApi, user: Player): Promise<{ ok: true; value: { postId: string; url: string } } | Fail> {
  if (!(await withinRate(deps.store, `rate:kitchen-post:${user.id}`, 5, 60))) return fail(429, 'Slow down a little and try again.');
  if (!(await isDoorOpen(deps, user))) return fail(409, 'Leave your door open first, so there is a kitchen to visit.');
  const date = utcDate(deps.now());
  // The claim comes first, so two quick taps make one post.
  if ((await deps.store.hSetNX(postedKey(date), user.id, 'pending')) === 0) return fail(409, 'You already posted your kitchen today.');
  await deps.store.expire(postedKey(date), 3 * 86400);
  try {
    const listed = await doorSummary(deps, user.id);
    const content = kitchenPostContent(listed?.kitchen ?? 'A kitchen', VISITOR_NAME.test(user.name) ? user.name : null, user.id, date);
    const made = await api.createAsUser({ title: content.title, postData: content.postData, text: content.text });
    await deps.store.hSet(postedKey(date), { [user.id]: made.id });
    return { ok: true, value: { postId: made.id, url: made.url } };
  } catch {
    await deps.store.hDel(postedKey(date), [user.id]); // release so the player can try again
    return fail(500, 'Reddit could not create the post.');
  }
}

/** If this post is a kitchen post and its door is still open, the kitchen a visitor can stop by. */
export async function kitchenOfPost(deps: Deps, postData: unknown): Promise<DoorSummary | null> {
  if (!postData || typeof postData !== 'object') return null;
  const { kind, door } = postData as { kind?: unknown; door?: unknown };
  if (kind !== 'kitchen' || typeof door !== 'string' || !/^t2_[a-z0-9]+$/.test(door)) return null;
  return doorSummary(deps, door);
}
