/**
 * The slice of Devvit's Redis client the game uses. The real `redis` from `@devvit/web/server` satisfies it structurally,
 * and tests use an in-memory fake. Keeping the game logic behind this interface means it never imports Devvit.
 * Redis rules that shape the design: expiry is per key (never per hash field), there is no key scan, and no sets or lists.
 */
export type ZMember = { member: string; score: number };
export type SetOptions = { nx?: boolean; xx?: boolean; expiration?: Date };
export interface TxLike {
  multi(): Promise<void>;
  set(key: string, value: string, options?: SetOptions): Promise<unknown>;
  exec(): Promise<unknown[] | null | undefined>;
  discard(): Promise<void>;
}
export interface Store {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, options?: SetOptions): Promise<unknown>;
  del(...keys: string[]): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
  incrBy(key: string, value: number): Promise<number>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<number>;
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hDel(key: string, fields: string[]): Promise<number>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  zAdd(key: string, ...members: ZMember[]): Promise<number>;
  zRange(key: string, start: number | string, stop: number | string, options?: { reverse?: boolean; by?: 'rank' | 'score' | 'lex' }): Promise<ZMember[]>;
  zRem(key: string, members: string[]): Promise<number>;
  /** Flat command list, e.g. ('get', 'u32', 0, 'set', 'u1', 5, 1). */
  bitfield(key: string, ...commands: (string | number)[]): Promise<number[]>;
  watch(...keys: string[]): Promise<TxLike>;
}

export type CasResult<T> = { ok: true; value: T } | { ok: false; error: string; conflict?: boolean };

/**
 * Read-modify-write one JSON value with WATCH/MULTI/EXEC, retrying when another request wrote the key in between.
 * `update` returns the new value or an error. ASSUMPTION to confirm on the first playtest: a failed EXEC (watched key changed)
 * surfaces as a null/empty result, not a throw. Both are treated as a conflict.
 */
export async function casUpdate<T>(
  store: Store, key: string, update: (current: T | undefined) => { value: T } | { error: string },
  options: { ttlSeconds?: number; attempts?: number; now?: () => number } = {},
): Promise<CasResult<T>> {
  const attempts = options.attempts ?? 5;
  for (let i = 0; i < attempts; i++) {
    const tx = await store.watch(key);
    const raw = await store.get(key);
    const next = update(raw === undefined ? undefined : (JSON.parse(raw) as T));
    if ('error' in next) { await tx.discard(); return { ok: false, error: next.error }; }
    await tx.multi();
    await tx.set(key, JSON.stringify(next.value), options.ttlSeconds ? { expiration: new Date((options.now ?? Date.now)() + options.ttlSeconds * 1000) } : undefined);
    let result: unknown[] | null | undefined;
    try { result = await tx.exec(); } catch { result = null; }
    if (result && result.length > 0) return { ok: true, value: next.value };
  }
  return { ok: false, error: 'Your restaurant changed in another tab. Reload to continue.', conflict: true };
}

/** Fixed-window counter. Returns true while the caller is within `max` calls per `windowSeconds`. */
export async function withinRate(store: Store, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const count = await store.incrBy(key, 1);
  if (count === 1) await store.expire(key, windowSeconds);
  return count <= max;
}
