import type { SetOptions, Store, TxLike, ZMember } from '@/server/core/store';

/**
 * In-memory stand-in for Devvit Redis, faithful where the game depends on it: expiry is per key and driven by an injected
 * clock, hashes cannot expire per field, there is no key scan, bitfield bits are MSB-first, and EXEC after a watched key was
 * written returns an empty result. A `calls` counter lets tests assert command budgets.
 */
export class FakeStore implements Store {
  now = 1_800_000_000_000;
  calls = 0;
  private strings = new Map<string, string>();
  private hashes = new Map<string, Map<string, string>>();
  private zsets = new Map<string, Map<string, number>>();
  private bits = new Map<string, number[]>();
  private expires = new Map<string, number>();
  private versions = new Map<string, number>();
  /** Test hook: run once, in the middle of the next EXEC, to simulate another request winning the race. */
  beforeExec: (() => Promise<void>) | null = null;

  private live(key: string): boolean {
    const at = this.expires.get(key);
    if (at !== undefined && at <= this.now) { for (const m of [this.strings, this.hashes, this.zsets, this.bits]) m.delete(key); this.expires.delete(key); return false; }
    return true;
  }
  private touch(key: string): void { this.versions.set(key, (this.versions.get(key) ?? 0) + 1); }
  advance(seconds: number): void { this.now += seconds * 1000; }
  ttl(key: string): number | undefined { this.live(key); const at = this.expires.get(key); return at === undefined ? undefined : Math.round((at - this.now) / 1000); }
  has(key: string): boolean { return this.live(key) && (this.strings.has(key) || this.hashes.has(key) || this.zsets.has(key) || this.bits.has(key)); }
  keys(): string[] { return [...new Set([...this.strings.keys(), ...this.hashes.keys(), ...this.zsets.keys(), ...this.bits.keys()])].filter(k => this.live(k)); }

  async get(key: string) { this.calls++; return this.live(key) ? this.strings.get(key) : undefined; }
  async set(key: string, value: string, options?: SetOptions) {
    this.calls++;
    if (options?.nx && this.live(key) && this.strings.has(key)) return '';
    if (options?.xx && !(this.live(key) && this.strings.has(key))) return '';
    this.strings.set(key, value); this.touch(key);
    if (options?.expiration) this.expires.set(key, options.expiration.getTime()); else this.expires.delete(key);
    return 'OK';
  }
  async del(...keys: string[]) { this.calls++; for (const k of keys) { for (const m of [this.strings, this.hashes, this.zsets, this.bits]) m.delete(k); this.expires.delete(k); this.touch(k); } }
  async expire(key: string, seconds: number) { this.calls++; if (this.has(key)) this.expires.set(key, this.now + seconds * 1000); }
  async incrBy(key: string, value: number) { this.calls++; this.live(key); const n = Number(this.strings.get(key) ?? 0) + value; this.strings.set(key, String(n)); this.touch(key); return n; }

  private hash(key: string): Map<string, string> { this.live(key); let h = this.hashes.get(key); if (!h) { h = new Map(); this.hashes.set(key, h); } return h; }
  async hGet(key: string, field: string) { this.calls++; return this.live(key) ? this.hashes.get(key)?.get(field) : undefined; }
  async hSet(key: string, fv: Record<string, string>) { this.calls++; const h = this.hash(key); let added = 0; for (const [f, v] of Object.entries(fv)) { if (!h.has(f)) added++; h.set(f, v); } this.touch(key); return added; }
  async hSetNX(key: string, field: string, value: string) { this.calls++; const h = this.hash(key); if (h.has(field)) return 0; h.set(field, value); this.touch(key); return 1; }
  async hGetAll(key: string) { this.calls++; return this.live(key) ? Object.fromEntries(this.hashes.get(key) ?? []) : {}; }
  async hDel(key: string, fields: string[]) { this.calls++; const h = this.hash(key); let n = 0; for (const f of fields) if (h.delete(f)) n++; this.touch(key); return n; }
  async hIncrBy(key: string, field: string, value: number) { this.calls++; const h = this.hash(key), n = Number(h.get(field) ?? 0) + value; h.set(field, String(n)); this.touch(key); return n; }

  private zset(key: string): Map<string, number> { this.live(key); let z = this.zsets.get(key); if (!z) { z = new Map(); this.zsets.set(key, z); } return z; }
  async zAdd(key: string, ...members: ZMember[]) { this.calls++; const z = this.zset(key); let n = 0; for (const m of members) { if (!z.has(m.member)) n++; z.set(m.member, m.score); } this.touch(key); return n; }
  async zRem(key: string, members: string[]) { this.calls++; const z = this.zset(key); let n = 0; for (const m of members) if (z.delete(m)) n++; this.touch(key); return n; }
  async zRange(key: string, start: number | string, stop: number | string, options?: { reverse?: boolean; by?: 'rank' | 'score' | 'lex' }) {
    this.calls++; if (!this.live(key)) return [];
    const all = [...(this.zsets.get(key) ?? [])].map(([member, score]) => ({ member, score })).sort((a, b) => a.score - b.score || (a.member < b.member ? -1 : 1));
    if (options?.by === 'score') { const hits = all.filter(m => m.score >= Number(start) && m.score <= Number(stop)); return (options.reverse ? hits.reverse() : hits).slice(0, 1000); }
    const ordered = options?.reverse ? all.reverse() : all, s = Number(start), e = Number(stop);
    return ordered.slice(s, e < 0 ? undefined : e + 1);
  }

  /** Redis bit order: offset 0 is the most significant bit of the first byte. Supports `get uN` and `set uN`. */
  async bitfield(key: string, ...cmds: (string | number)[]) {
    this.calls++; this.live(key);
    const bits = this.bits.get(key) ?? [], out: number[] = [];
    for (let i = 0; i < cmds.length;) {
      const op = cmds[i], width = Number(String(cmds[i + 1]).slice(1)), offset = Number(cmds[i + 2]);
      if (op === 'get') { let v = 0; for (let b = 0; b < width; b++) v = v * 2 + (bits[offset + b] ?? 0); out.push(v); i += 3; }
      else if (op === 'set') { const value = Number(cmds[i + 3]); let old = 0; for (let b = 0; b < width; b++) { old = old * 2 + (bits[offset + b] ?? 0); bits[offset + b] = Math.floor(value / 2 ** (width - 1 - b)) % 2; } out.push(old); i += 4; }
      else throw new Error(`bitfield op ${String(op)} not supported by the fake`);
    }
    for (let b = 0; b < bits.length; b++) if (bits[b] === undefined) bits[b] = 0;
    this.bits.set(key, bits); this.touch(key); return out;
  }

  async watch(...keys: string[]): Promise<TxLike> {
    const seen = new Map(keys.map(k => [k, this.versions.get(k) ?? 0])), queued: Array<() => void> = [];
    return {
      multi: async () => undefined,
      set: async (key: string, value: string, options?: SetOptions) => { queued.push(() => { void this.set(key, value, options); }); return 'QUEUED'; },
      discard: async () => undefined,
      exec: async () => {
        if (this.beforeExec) { const run = this.beforeExec; this.beforeExec = null; await run(); }
        for (const [k, v] of seen) if ((this.versions.get(k) ?? 0) !== v) return [];
        queued.forEach(q => q()); return queued.map(() => 'OK');
      },
    };
  }
}
