/**
 * The rooftop's music, written as data. A four-bar loop in F: warm seventh chords, a slow bass, and a small pluck pattern on top.
 * Pure: the same step always gives the same notes, so it is tested without any audio. The mixer turns these into sound.
 */
export const BPM = 76;
export const STEPS_PER_BAR = 8;
export const BARS = 4;
export const LOOP_STEPS = STEPS_PER_BAR * BARS;
/** Seconds in one eighth note. */
export const STEP_SECONDS = 60 / BPM / 2;

const midi = (note: number): number => 440 * 2 ** ((note - 69) / 12);
/** Each bar's chord as MIDI notes, lowest first: Fmaj7, Dm7, B-flat maj7, C6. */
export const CHORDS: readonly (readonly number[])[] = [[53, 57, 60, 64], [50, 53, 57, 60], [46, 50, 53, 57], [48, 52, 55, 57]];
/** Which chord tone the pluck plays on each step of a bar (-1 is a rest), an octave above the chord. */
const PLUCK = [0, -1, 2, 3, -1, 1, 2, -1];

export type Note = { kind: 'pad' | 'bass' | 'pluck' | 'tick'; hz: number; seconds: number; gain: number };

/** What starts on this step of the loop. `service` adds a soft tick on every step. */
export function notesAt(step: number, service: boolean): Note[] {
  const s = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS, bar = Math.floor(s / STEPS_PER_BAR), inBar = s % STEPS_PER_BAR, chord = CHORDS[bar];
  const notes: Note[] = [];
  if (inBar === 0) for (const n of chord.slice(1)) notes.push({ kind: 'pad', hz: midi(n), seconds: STEP_SECONDS * STEPS_PER_BAR * 1.15, gain: .05 });
  if (inBar === 0 || inBar === 4) notes.push({ kind: 'bass', hz: midi(chord[0] - 12), seconds: STEP_SECONDS * 3.2, gain: .16 });
  const pick = PLUCK[inBar];
  if (pick >= 0) notes.push({ kind: 'pluck', hz: midi(chord[pick] + 12), seconds: STEP_SECONDS * 2.4, gain: .07 });
  if (service) notes.push({ kind: 'tick', hz: 0, seconds: .04, gain: inBar % 2 === 0 ? .035 : .02 });
  return notes;
}

/** What should be audible right now. */
export type Mix = { music: boolean; weather: 'sun' | 'sunset' | 'rain'; service: boolean; paused: boolean };
export const MUSIC_LEVEL = .9, RAIN_LEVEL = .5;
/** Rain sits on top of the music and pushes it back, so the weather is heard without a second track. */
export function levels(mix: Mix): { music: number; rain: number } {
  if (!mix.music || mix.paused) return { music: 0, rain: 0 };
  const rain = mix.weather === 'rain';
  return { music: rain ? MUSIC_LEVEL * .6 : MUSIC_LEVEL, rain: rain ? RAIN_LEVEL : 0 };
}
