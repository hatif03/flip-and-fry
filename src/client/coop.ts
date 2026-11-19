import { CoopGuest, CoopHost, catchUp } from '../management/coop';
import type { RestaurantEngine } from '../management/engine';
import type { Action } from '../management/replay';
import type { Http, Session } from './session';

/**
 * The device side of a hosted service: the pieces that talk to the server and to realtime, around the lockstep core in
 * management/coop.ts. Nothing here decides anything about the night. A host publishes stamped actions and checksums; a helper
 * applies them. If the helper falls out of step, it starts over from a fresh snapshot. `connect` and `disconnect` are Devvit's
 * realtime calls, passed in so the whole thing is tested with two pretend devices.
 */
export type Connect = (options: { channel: string; onMessage: (message: unknown) => void }) => unknown;
export type Disconnect = (channel: string) => void;
type Message = { kind?: string; action?: Action; tick?: number; hash?: string };
/** A host that has been silent this long is treated as away, and the helper waits. */
export const HOST_AWAY_MS = 20_000;

export class CoopClient {
  private host: CoopHost | null = null;
  private guest: CoopGuest | null = null;
  private channel: string | null = null;
  private hostId: string | null = null;
  private lastSync = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  /** What the player should be told: "the host is away", "you are in step again", and so on. */
  onNotice: (text: string) => void = () => undefined;
  /** The hosted service ended (the host finished, or the helper left). */
  onEnd: () => void = () => undefined;
  constructor(private readonly engine: RestaurantEngine, private readonly http: Http, private readonly connect: Connect, private readonly disconnect: Disconnect, private readonly session?: Pick<Session, 'beginGuest' | 'endGuest'>, private readonly now: () => number = Date.now) {}

  get hosting(): boolean { return this.host !== null; }
  get helping(): boolean { return this.guest !== null; }

  // ---- the host ---------------------------------------------------------------------------------------------------------
  /** Offer the night that was just opened. Call after the doors are open. */
  async startHosting(): Promise<string | null> {
    const r = await this.http('POST', '/api/coop/start');
    if (r.status !== 200) return errorOf(r.body, 'Could not invite a neighbor.');
    const channel = (r.body as { channel: string }).channel; this.channel = channel;
    this.host = new CoopHost(this.engine, {
      commit: action => { void this.http('POST', '/api/coop/commit', { action }).catch(() => undefined); },
      sync: (tick, hash) => { void this.http('POST', '/api/coop/sync', { tick, hash }).catch(() => undefined); },
    });
    this.connect({ channel, onMessage: m => { const msg = m as Message; if (msg?.kind === 'act' && msg.action) this.host?.onRequest(msg.action); } });
    return null;
  }
  async stopHosting(): Promise<void> {
    this.host?.stop(); this.host = null;
    await this.http('POST', '/api/coop/end', {}).catch(() => undefined); // tell the helper first, then close our own end of the channel
    if (this.channel) this.disconnect(this.channel); this.channel = null;
  }

  // ---- the helper -------------------------------------------------------------------------------------------------------
  /** Join a neighbor's night: take their snapshot, catch up to their present, and follow along. */
  async join(hostId: string): Promise<string | null> {
    const r = await this.http('GET', `/api/coop/join?id=${encodeURIComponent(hostId)}`);
    if (r.status !== 200) return errorOf(r.body, 'Could not join that kitchen.');
    const j = r.body as { snapshot: Parameters<typeof catchUp>[1]; headline: Parameters<typeof catchUp>[2]; log: Action[]; tick: number; channel: string };
    this.session?.beginGuest();
    const error = catchUp(this.engine, j.snapshot, j.headline, j.log, j.tick);
    if (error) { await this.session?.endGuest(); return error; }
    this.hostId = hostId; this.channel = j.channel; this.lastSync = this.now();
    this.guest = new CoopGuest(this.engine, { act: action => { void this.http('POST', '/api/coop/act', { id: hostId, action }).catch(() => undefined); } });
    this.guest.onMismatch = () => { this.onNotice('You drifted out of step. Catching up.'); void this.resync(); };
    this.connect({ channel: j.channel, onMessage: m => this.onMessage(m as Message) });
    this.watchdog = setInterval(() => this.checkHost(), 5000);
    this.engine.notify(); return null;
  }
  private onMessage(msg: Message): void {
    if (!this.guest) return;
    if (msg.kind === 'commit' && msg.action) this.guest.onCommit(msg.action);
    else if (msg.kind === 'sync' && typeof msg.tick === 'number' && typeof msg.hash === 'string') {
      this.lastSync = this.now(); if (this.engine.paused) { this.engine.holdForHost(false); this.onNotice('The host is back.'); }
      // A helper that joined a little behind runs ahead to the host's present, never more than a few seconds at a time.
      for (let i = 0; i < 60 && this.engine.tickCount() < msg.tick - 3 && this.engine.state.phase === 'service'; i++) this.engine.tick();
      this.guest.onSync(msg.tick, msg.hash);
    } else if (msg.kind === 'end') { void this.leave().then(() => this.onEnd()); }
  }
  private checkHost(): void { if (this.guest && this.now() - this.lastSync > HOST_AWAY_MS && !this.engine.paused && this.engine.state.phase === 'service') { this.engine.holdForHost(true); this.onNotice('The host is away. Waiting for them.'); } }
  /** Start over from a fresh snapshot and the committed log. */
  private async resync(): Promise<void> {
    if (!this.hostId) return; const id = this.hostId, r = await this.http('GET', `/api/coop/join?id=${encodeURIComponent(id)}`); if (r.status !== 200 || !this.guest) return;
    const j = r.body as { snapshot: Parameters<typeof catchUp>[1]; headline: Parameters<typeof catchUp>[2]; log: Action[]; tick: number };
    if (!catchUp(this.engine, j.snapshot, j.headline, j.log, j.tick)) { this.lastSync = this.now(); this.engine.notify(); this.onNotice('Back in step.'); }
  }
  /** Stop helping and go back to our own restaurant. */
  async leave(): Promise<void> {
    if (this.watchdog) clearInterval(this.watchdog); this.watchdog = null; const id = this.hostId;
    this.guest?.stop(); this.guest = null; if (this.channel) this.disconnect(this.channel); this.channel = null; this.hostId = null;
    if (id) await this.http('POST', '/api/coop/end', { helperOf: id }).catch(() => undefined);
    await this.session?.endGuest();
  }
}
const errorOf = (body: unknown, fallback: string): string => (body as { error?: string } | null)?.error ?? fallback;
