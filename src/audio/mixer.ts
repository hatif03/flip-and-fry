import { LOOP_STEPS, STEP_SECONDS, levels, notesAt, type Mix, type Note } from './score';
import type { Cue } from './cues';

/** The slice of the Web Audio API the mixer touches, so tests can stand in for it. */
export interface AudioLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainLike;
  createOscillator(): OscillatorLike;
  createBiquadFilter(): FilterLike;
  createBuffer(channels: number, length: number, rate: number): { getChannelData(channel: number): Float32Array };
  createBufferSource(): SourceLike;
}
interface ParamLike { value: number; setValueAtTime(v: number, t: number): unknown; linearRampToValueAtTime(v: number, t: number): unknown; cancelScheduledValues(t: number): unknown }
interface NodeLike { connect(to: unknown): unknown; disconnect(): void }
interface GainLike extends NodeLike { gain: ParamLike }
interface FilterLike extends NodeLike { type: string; frequency: ParamLike; Q: ParamLike }
interface OscillatorLike extends NodeLike { type: string; frequency: ParamLike; start(t: number): void; stop(t: number): void }
interface SourceLike extends NodeLike { buffer: unknown; loop: boolean; start(t?: number): void; stop(t?: number): void }

const LOOKAHEAD = .35, TICK_MS = 120;

/**
 * The soundtrack, made while it plays: no audio files. It follows the existing "Rooftop soundtrack" switch, starts only after the
 * player's first tap (browsers require it), goes silent when the tab is hidden or the service is paused, and lets rain push the
 * music back. One master gain does all of the muting, so nothing can be left playing.
 */
export class Mixer {
  private ctx: AudioLike | null = null;
  private master: GainLike | null = null;
  private musicBus: GainLike | null = null;
  private rainBus: GainLike | null = null;
  private sfxBus: GainLike | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStep = 0;
  private nextTime = 0;
  private mix: Mix = { music: false, weather: 'sunset', service: false, paused: false };
  private hidden = false;
  private unlocked = false;
  constructor(private readonly make: () => AudioLike = () => new AudioContext() as unknown as AudioLike) {}

  /** Call from a tap or key press. The first call creates the audio context; later calls resume it. */
  unlock(): void {
    this.unlocked = true;
    if (!this.ctx) this.build();
    this.apply();
  }
  /** Tell the mixer what should be audible. Safe to call every frame; it only acts on a change. */
  set(mix: Mix): void { this.mix = mix; this.apply(); }
  /** The tab was hidden or shown. Hidden always means silent. */
  setHidden(hidden: boolean): void { this.hidden = hidden; this.apply(); }
  get audible(): boolean { const l = levels(this.mix); return this.unlocked && !this.hidden && (l.music > 0 || l.rain > 0); }
  dispose(): void { if (this.timer) clearInterval(this.timer); this.timer = null; void this.ctx?.close().catch(() => undefined); this.ctx = null; }

  private build(): void {
    const ctx = this.make(); this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0; this.musicBus.connect(this.master);
    this.rainBus = ctx.createGain(); this.rainBus.gain.value = 0; this.rainBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = .5; this.sfxBus.connect(ctx.destination);
    this.startRain(ctx, this.rainBus);
    this.nextTime = ctx.currentTime + .1; this.nextStep = 0;
  }

  /** Effects are heard when the soundtrack switch is on, the page is visible and the first tap has happened. */
  private get sfxOn(): boolean { return this.unlocked && !this.hidden && this.mix.music && !this.mix.paused; }
  /** One short effect. `n` is the chain length for the chain chime (it rises with the chain) and is ignored by the others. */
  cue(name: Cue, n = 0): void {
    const ctx = this.ctx, bus = this.sfxBus; if (!ctx || !bus || !this.sfxOn) return;
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    const t = ctx.currentTime + .005;
    const tone = (hz: number, at: number, seconds: number, gain: number, type = 'sine'): void => {
      const osc = ctx.createOscillator(), out = ctx.createGain(); osc.type = type; osc.frequency.setValueAtTime(hz, at);
      out.gain.setValueAtTime(0, at); out.gain.linearRampToValueAtTime(gain, at + .008); out.gain.linearRampToValueAtTime(0, at + seconds);
      osc.connect(out); out.connect(bus); osc.start(at); osc.stop(at + seconds + .02);
    };
    const click = (at: number, hz: number): void => { const src = ctx.createBufferSource(); src.buffer = this.noise(ctx, .1); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(hz, at); const out = ctx.createGain(); out.gain.setValueAtTime(.5, at); out.gain.linearRampToValueAtTime(0, at + .06); src.connect(f); f.connect(out); out.connect(bus); src.start(at); src.stop(at + .08); };
    switch (name) {
      case 'chain': { const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21], hz = 440 * Math.pow(2, (steps[Math.min(n, steps.length) - 1] ?? 0) / 12); tone(hz, t, .16, .22, 'triangle'); break; }
      case 'coin': tone(988, t, .08, .18); tone(1319, t + .07, .16, .18); break;
      case 'bell': tone(784, t, .3, .2); tone(1568, t, .2, .06); break;
      case 'ding': tone(1175, t, .22, .2, 'triangle'); break;
      case 'pop': tone(330, t, .06, .25); tone(660, t + .05, .1, .22); break;
      case 'plop': tone(220, t, .09, .22); tone(165, t + .06, .1, .18); break;
      case 'hammer': click(t, 1800); click(t + .16, 1500); tone(110, t, .08, .2, 'square'); break;
      case 'flip': click(t, 3000); tone(520, t, .06, .12, 'triangle'); break;
    }
  }

  private apply(): void {
    const ctx = this.ctx; if (!ctx || !this.master || !this.musicBus || !this.rainBus) return;
    const l = levels(this.mix), on = this.audible, now = ctx.currentTime;
    const ramp = (p: ParamLike, v: number): void => { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(v, now + .6); };
    ramp(this.master.gain, on ? .55 : 0); ramp(this.musicBus.gain, l.music); ramp(this.rainBus.gain, l.rain);
    if (this.sfxBus) ramp(this.sfxBus.gain, this.sfxOn ? .5 : 0);
    if (on) { if (ctx.state !== 'running') void ctx.resume().catch(() => undefined); this.startScheduler(); }
    else { this.stopScheduler(); if (ctx.state === 'running') void ctx.suspend().catch(() => undefined); }
  }

  private startScheduler(): void { if (!this.timer) { this.nextTime = Math.max(this.nextTime, (this.ctx?.currentTime ?? 0) + .05); this.timer = setInterval(() => this.schedule(), TICK_MS); this.schedule(); } }
  private stopScheduler(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  /** Queue every note that starts inside the lookahead window. Time comes from the audio clock, never from timers. */
  schedule(): void {
    const ctx = this.ctx; if (!ctx || !this.musicBus) return;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      for (const note of notesAt(this.nextStep, this.mix.service)) this.play(ctx, this.musicBus, note, this.nextTime);
      this.nextStep = (this.nextStep + 1) % LOOP_STEPS; this.nextTime += STEP_SECONDS;
    }
  }

  private play(ctx: AudioLike, bus: GainLike, note: Note, at: number): void {
    const out = ctx.createGain(); out.gain.setValueAtTime(0, at);
    const attack = note.kind === 'pad' ? .5 : note.kind === 'tick' ? .002 : .015;
    out.gain.linearRampToValueAtTime(note.gain, at + attack); out.gain.linearRampToValueAtTime(0, at + note.seconds);
    out.connect(bus);
    if (note.kind === 'tick') { this.tick(ctx, out, at, note.seconds); return; }
    const osc = ctx.createOscillator(); osc.type = note.kind === 'pad' ? 'triangle' : note.kind === 'bass' ? 'sine' : 'sine'; osc.frequency.setValueAtTime(note.hz, at);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(note.kind === 'pad' ? 1400 : 2400, at);
    osc.connect(filter); filter.connect(out); osc.start(at); osc.stop(at + note.seconds + .05);
  }
  private tick(ctx: AudioLike, out: GainLike, at: number, seconds: number): void {
    const src = ctx.createBufferSource(); src.buffer = this.noise(ctx, .1); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(5000, at);
    src.connect(hp); hp.connect(out); src.start(at); src.stop(at + seconds);
  }
  private noiseBuffer: unknown = null;
  private noise(ctx: AudioLike, seconds: number): unknown {
    if (this.noiseBuffer) return this.noiseBuffer;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate), data = buffer.getChannelData(0);
    // A fixed pattern, not Math.random: the same room sounds the same every time it is opened.
    let seed = 12345; for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = (seed / 0xffffffff) * 2 - 1; }
    this.noiseBuffer = buffer; return buffer;
  }
  private startRain(ctx: AudioLike, bus: GainLike): void {
    const src = ctx.createBufferSource(); src.buffer = this.noise(ctx, 2); src.loop = true;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.setValueAtTime(2200, 0);
    const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.setValueAtTime(400, 0);
    src.connect(high); high.connect(low); low.connect(bus); src.start();
  }
}
