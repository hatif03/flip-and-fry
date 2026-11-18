import { describe, expect, it } from 'vitest';
import engine from '@/management/engine.ts?raw';
import layout from '@/management/layout.ts?raw';
import types from '@/management/types.ts?raw';
import challenges from '@/management/daily-challenges.ts?raw';
import replay from '@/management/replay.ts?raw';

/** Files whose output the server replays. A host clock, a random source or a rounded-differently function breaks replay. */
const SIM = { engine, layout, types, 'daily-challenges': challenges, replay };
const FORBIDDEN = [/Math\.random/, /Math\.hypot/, /performance\.now/, /Date\.now\s*\(/, /new Date\s*\(/, /Date\.parse/, /crypto\.getRandomValues/];

describe('simulation determinism guard', () => {
  for (const [file, text] of Object.entries(SIM)) {
    it(`${file}.ts uses no clock, random source or inexact math`, () => {
      for (const pattern of FORBIDDEN) expect(text, `${file}.ts matches ${pattern}`).not.toMatch(pattern);
    });
  }
});
