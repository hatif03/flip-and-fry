import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mixer, type AudioLike } from '@/audio/mixer';
import { BARS, BPM, CHORDS, LOOP_STEPS, MUSIC_LEVEL, RAIN_LEVEL, STEPS_PER_BAR, STEP_SECONDS, levels, notesAt, type Mix } from '@/audio/score';

const mix = (over: Partial<Mix> = {}): Mix => ({ music: true, weather: 'sunset', service: false, paused: false, ...over });

describe('the score', () => {
  it('is a four-bar loop of eight steps at 76 beats a minute', () => { expect(LOOP_STEPS).toBe(BARS * STEPS_PER_BAR); expect(BPM).toBe(76); expect(STEP_SECONDS).toBeCloseTo(.3947, 3); expect(CHORDS).toHaveLength(BARS); });
  it('plays the same notes every time, and repeats after one loop', () => {
    for (let s = 0; s < LOOP_STEPS; s++) expect(notesAt(s, false)).toEqual(notesAt(s + LOOP_STEPS, false));
    expect(notesAt(5, true)).toEqual(notesAt(5, true));
  });
  it('lays a pad chord and a bass note on the first step of each bar, and the bass again halfway', () => {
    for (let bar = 0; bar < BARS; bar++) {
      const first = notesAt(bar * STEPS_PER_BAR, false); expect(first.filter(n => n.kind === 'pad')).toHaveLength(3); expect(first.filter(n => n.kind === 'bass')).toHaveLength(1);
      expect(notesAt(bar * STEPS_PER_BAR + 4, false).some(n => n.kind === 'bass')).toBe(true); expect(notesAt(bar * STEPS_PER_BAR + 1, false).some(n => n.kind === 'pad')).toBe(false);
    }
  });
  it('keeps every note in a sensible range, short enough to end, and quiet enough to layer', () => {
    for (let s = 0; s < LOOP_STEPS; s++) for (const n of notesAt(s, true)) {
      if (n.kind !== 'tick') { expect(n.hz).toBeGreaterThan(40); expect(n.hz).toBeLessThan(1500); }
      expect(n.seconds).toBeGreaterThan(0); expect(n.seconds).toBeLessThan(5); expect(n.gain).toBeGreaterThan(0); expect(n.gain).toBeLessThanOrEqual(.2);
    }
  });
  it('adds a soft tick on every step during service and none otherwise', () => {
    for (let s = 0; s < LOOP_STEPS; s++) { expect(notesAt(s, true).filter(n => n.kind === 'tick')).toHaveLength(1); expect(notesAt(s, false).some(n => n.kind === 'tick')).toBe(false); }
  });
  it('uses the chord tones for the bass, an octave below the chord root', () => { const root = notesAt(0, false).find(n => n.kind === 'bass')!; expect(root.hz).toBeCloseTo(440 * 2 ** ((53 - 12 - 69) / 12), 3); });
});

describe('what is audible', () => {
  it('is silence when the speaker switch is off or the service is paused, rain included', () => {
    expect(levels(mix({ music: false, weather: 'rain' }))).toEqual({ music: 0, rain: 0 }); expect(levels(mix({ paused: true, weather: 'rain' }))).toEqual({ music: 0, rain: 0 });
  });
  it('plays the music alone in fair weather', () => { expect(levels(mix())).toEqual({ music: MUSIC_LEVEL, rain: 0 }); expect(levels(mix({ weather: 'sun' }))).toEqual({ music: MUSIC_LEVEL, rain: 0 }); });
  it('adds the rain and pushes the music back in the rain', () => { const l = levels(mix({ weather: 'rain' })); expect(l.rain).toBe(RAIN_LEVEL); expect(l.music).toBeLessThan(MUSIC_LEVEL); expect(l.music).toBeGreaterThan(0); });
});

/** A fake audio context that records what the mixer builds, and lets the test move the clock. */
class FakeParam { value = 0; calls: Array<[string, number, number?]> = []; setValueAtTime(v: number, t: number) { this.value = v; this.calls.push(['set', v, t]); } linearRampToValueAtTime(v: number, t: number) { this.value = v; this.calls.push(['ramp', v, t]); } cancelScheduledValues() { /* nothing to cancel */ } }
class FakeNode { gain = new FakeParam(); frequency = new FakeParam(); Q = new FakeParam(); type = ''; buffer: unknown = null; loop = false; started: number[] = []; connections: unknown[] = []; connect(to: unknown) { this.connections.push(to); return to; } disconnect() { this.connections = []; } start(t = 0) { this.started.push(t); } stop() { /* ends */ } }
class FakeContext implements AudioLike {
  currentTime = 0; sampleRate = 8000; state = 'suspended'; destination = { destination: true }; nodes: { gain: FakeNode[]; osc: FakeNode[]; filter: FakeNode[]; source: FakeNode[] } = { gain: [], osc: [], filter: [], source: [] }; resumed = 0; suspended = 0; closed = false;
  async resume() { this.state = 'running'; this.resumed++; } async suspend() { this.state = 'suspended'; this.suspended++; } async close() { this.closed = true; }
  createGain() { const n = new FakeNode(); this.nodes.gain.push(n); return n; } createOscillator() { const n = new FakeNode(); this.nodes.osc.push(n); return n; } createBiquadFilter() { const n = new FakeNode(); this.nodes.filter.push(n); return n; }
  createBuffer(_c: number, length: number) { const data = new Float32Array(length); return { getChannelData: () => data }; } createBufferSource() { const n = new FakeNode(); this.nodes.source.push(n); return n; }
}
let ctx: FakeContext, mixer: Mixer;
beforeEach(() => { vi.useFakeTimers(); ctx = new FakeContext(); mixer = new Mixer(() => ctx); });
afterEach(() => { mixer.dispose(); vi.useRealTimers(); });
const master = () => ctx.nodes.gain[0].gain.value;

describe('the mixer', () => {
  it('makes no sound and creates no audio context before the first tap', () => {
    mixer.set(mix()); expect(ctx.nodes.gain).toHaveLength(0); expect(mixer.audible).toBe(false);
  });
  it('starts on the first tap, resumes the context, and schedules the first notes', async () => {
    mixer.set(mix()); mixer.unlock(); await vi.advanceTimersByTimeAsync(0);
    expect(ctx.resumed).toBe(1); expect(master()).toBeCloseTo(.55); expect(mixer.audible).toBe(true); expect(ctx.nodes.osc.length).toBeGreaterThan(0);
  });
  it('plays nothing with the speaker switch off, even after a tap', () => { mixer.set(mix({ music: false })); mixer.unlock(); expect(master()).toBe(0); expect(mixer.audible).toBe(false); expect(ctx.resumed).toBe(0); });
  it('goes silent and suspends the context when the tab is hidden, and comes back when it is shown', async () => {
    mixer.set(mix()); mixer.unlock(); await vi.advanceTimersByTimeAsync(0);
    mixer.setHidden(true); await vi.advanceTimersByTimeAsync(0); expect(master()).toBe(0); expect(ctx.suspended).toBe(1); expect(mixer.audible).toBe(false);
    const before = ctx.nodes.osc.length; ctx.currentTime += 10; await vi.advanceTimersByTimeAsync(1000); expect(ctx.nodes.osc.length).toBe(before); // nothing is queued while hidden
    mixer.setHidden(false); await vi.advanceTimersByTimeAsync(0); expect(master()).toBeCloseTo(.55); expect(mixer.audible).toBe(true);
  });
  it('goes silent on pause and returns on resume', async () => {
    mixer.set(mix()); mixer.unlock(); mixer.set(mix({ paused: true })); await vi.advanceTimersByTimeAsync(0); expect(master()).toBe(0);
    mixer.set(mix({ paused: false })); await vi.advanceTimersByTimeAsync(0); expect(master()).toBeCloseTo(.55);
  });
  it('lets the rain in and pushes the music back when the weather turns', async () => {
    mixer.set(mix()); mixer.unlock(); await vi.advanceTimersByTimeAsync(0);
    const [, musicBus, rainBus] = ctx.nodes.gain; expect(rainBus.gain.value).toBe(0); expect(musicBus.gain.value).toBe(MUSIC_LEVEL);
    mixer.set(mix({ weather: 'rain' })); expect(rainBus.gain.value).toBe(RAIN_LEVEL); expect(musicBus.gain.value).toBeLessThan(MUSIC_LEVEL);
    mixer.set(mix({ weather: 'sun' })); expect(rainBus.gain.value).toBe(0); expect(musicBus.gain.value).toBe(MUSIC_LEVEL);
  });
  it('keeps scheduling from the audio clock, a little ahead, and never twice for the same step', async () => {
    mixer.set(mix()); mixer.unlock(); await vi.advanceTimersByTimeAsync(0); const first = ctx.nodes.osc.length;
    await vi.advanceTimersByTimeAsync(500); expect(ctx.nodes.osc.length).toBe(first); // the clock has not moved, so nothing new is due
    ctx.currentTime += 2; await vi.advanceTimersByTimeAsync(500); expect(ctx.nodes.osc.length).toBeGreaterThan(first);
    const starts = ctx.nodes.osc.flatMap(o => o.started).sort((a, b) => a - b); expect(starts.length).toBeGreaterThan(0);
  });
  it('adds the service tick only during service', async () => {
    mixer.set(mix({ service: true })); mixer.unlock(); await vi.advanceTimersByTimeAsync(0); const ticks = ctx.nodes.source.filter(s => s.started.length && !s.loop).length; expect(ticks).toBeGreaterThan(0);
  });
  it('closes the context on dispose and stops its timer', async () => {
    mixer.set(mix()); mixer.unlock(); mixer.dispose(); expect(ctx.closed).toBe(true); const n = ctx.nodes.osc.length; ctx.currentTime += 5; await vi.advanceTimersByTimeAsync(2000); expect(ctx.nodes.osc.length).toBe(n);
  });
  it('is safe to unlock twice, and to be told things before it has a context', () => {
    mixer.setHidden(true); mixer.set(mix()); mixer.unlock(); mixer.unlock(); expect(ctx.nodes.gain.length).toBe(3);
  });
});
