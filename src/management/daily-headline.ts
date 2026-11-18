import { z } from 'zod';

/**
 * The daily headline is a set of weights on formulas the engine already has. It never scripts a guest list.
 * This file is pure and imports nothing from the engine, so the client, the server and the bots all call it.
 * It uses no Date object: the weekday is computed from the date string by integer arithmetic.
 */
export const headlineId = z.enum(['quiet', 'rush', 'rain', 'supplier', 'critic', 'payday', 'inspection']);
export type HeadlineId = z.infer<typeof headlineId>;
export type WeatherKind = 'sunset' | 'sun' | 'rain';

export interface DailyHeadline {
  /** 'YYYY-MM-DD' in UTC. */
  date: string;
  /** Mixed into the engine seed at the moment the doors open, and into the shared daily challenges. */
  seed: number;
  weather: WeatherKind;
  id: HeadlineId;
  /** Five or six words, shown on the splash and the open screen. */
  title: string;
  /** One sentence. */
  blurb: string;
}

/** What the engine multiplies or adds. `NEUTRAL` reproduces the engine exactly as it was before headlines existed. */
export interface HeadlineEffects {
  /** Multiplies guest patience. */
  patience: number;
  /** Seconds added to the gap between arrivals (negative = more guests). */
  gapDelta: number;
  /** Multiplies walking speed. */
  walk: number;
  /** Multiplies the weight of comfort in tips. */
  tipComfort: number;
  /** Multiplies the ingredient cost of grilled dishes. */
  burgerCost: number;
  /** Multiplies the price walk-away roll. */
  priceRoll: number;
  /** Rating lost per dirty seat still on the floor when the doors close. */
  dirtyPenalty: number;
  /** Every arriving guest is a star guest. */
  specialAlways: boolean;
  /** A star guest who walks out caps the night at 2★. */
  criticCap: boolean;
  /** Chance that a guest who chose another dish switches to the burger. */
  burgerBias: number;
}

export const NEUTRAL: HeadlineEffects = { patience: 1, gapDelta: 0, walk: 1, tipComfort: 1, burgerCost: 1, priceRoll: 1, dirtyPenalty: 0, specialAlways: false, criticCap: false, burgerBias: 0 };

/** Integer mixing (the same finalizer the daily challenges use), kept here so both files share one copy. */
export function mixSeed(value: number): number {
  let n = value >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm). No Date object. */
function daysFromCivil(y: number, m: number, d: number): number {
  const year = m <= 2 ? y - 1 : y, era = Math.floor(year / 400), yoe = year - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1, doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** 0 = Sunday ... 6 = Saturday. Throws on anything that is not a real 'YYYY-MM-DD'. */
export function weekday(date: string): number {
  const match = DATE.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new Error(`Invalid date: ${date}`);
  return (((daysFromCivil(y, m, d) + 4) % 7) + 7) % 7;
}
function daysInMonth(y: number, m: number): number { return m === 2 ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28) : [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }

/** Sunday first, matching weekday(). */
export const WEEK: readonly HeadlineId[] = ['inspection', 'quiet', 'rush', 'rain', 'supplier', 'critic', 'payday'];

const TEXT: Record<HeadlineId, { title: string; blurb: string }> = {
  quiet: { title: 'A quiet neighborhood', blurb: 'Patient guests and a slow street. A good night to learn the room.' },
  rush: { title: 'The boulevard is busy', blurb: 'More people on the street tonight. Same team, more tables to fill.' },
  rain: { title: 'Rain on the roof', blurb: 'Rain. Lanterns earn their keep today.' },
  supplier: { title: 'The butcher raised prices', blurb: 'Burgers cost more to make tonight. Watch your margins.' },
  critic: { title: 'A critic is in the neighborhood', blurb: 'Every star guest is watching. Keep them happy.' },
  payday: { title: 'Payday on the boulevard', blurb: 'Guests feel generous. A bold menu survives tonight.' },
  inspection: { title: 'The inspector comes at closing', blurb: 'Clean tables count tonight.' },
};

export function weatherFor(id: HeadlineId, seed: number): WeatherKind { return id === 'rain' ? 'rain' : (seed >>> 1) & 1 ? 'sun' : 'sunset'; }

export function createDailyHeadline(date: string): DailyHeadline {
  const id = WEEK[weekday(date)], seed = mixSeed(Number(date.replace(/-/g, '')) ^ 0x5eed);
  return { date, seed, weather: weatherFor(id, seed), id, ...TEXT[id] };
}

/** Pure. The same {id, seed} always gives the same effects, so a stored snapshot replays identically. */
export function headlineEffects(headline: { id: HeadlineId; seed: number } | null | undefined): HeadlineEffects {
  if (!headline) return NEUTRAL;
  const fx: HeadlineEffects = { ...NEUTRAL }, jitter = (mixSeed(headline.seed ^ 0x9e3779b9) % 5) / 20; // 0, .05, .10, .15, .20
  switch (headline.id) {
    case 'quiet': fx.patience = 1.15; fx.gapDelta = .8; break;
    case 'rush': fx.gapDelta = -1; break;
    case 'rain': fx.walk = .9; fx.tipComfort = 1.5; break;
    case 'supplier': fx.burgerCost = 1.4 + jitter; break;
    case 'critic': fx.specialAlways = true; fx.criticCap = true; break;
    case 'payday': fx.priceRoll = .5; break;
    case 'inspection': fx.dirtyPenalty = .35; break;
  }
  if (weatherFor(headline.id, headline.seed) === 'sun') { fx.patience *= .95; fx.burgerBias = .15; }
  return fx;
}
