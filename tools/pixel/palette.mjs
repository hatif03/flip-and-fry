// Authoring-time only. The 16-colour palette, built with Codixel's hueRamp so darker steps lean cool and lighter steps lean warm.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
/** Codixel is CommonJS and this repo is "type": "module", so require() would run it as ESM and lose the export. Load it explicitly. */
export const P = (() => { const module = { exports: {} }; new Function('module', 'require', readFileSync(new URL('../../.claude/skills/codixel/core/pixel.js', import.meta.url), 'utf8'))(module, createRequire(import.meta.url)); return module.exports; })();

/** Brand anchors (the game's existing colours). Each is the middle step of one ramp below. */
export const BRAND = { cream: '#FFF2D7', ink: '#233D3B', teal: '#224F4A', tomato: '#DC533C', gold: '#F2B743' };

/** Ramps are sized from what the real scene contains: roads and shadow (ink), ground and walls (cream), brick, terracotta and awnings (tomato), taxis and lamps (gold), trees (leaf). */
export const RAMPS = {
  ink:    P.hueRamp(4, { hue: 176, shift: 18, sat: .30, satDrop: .25, light: [.09, .36] }),
  cream:  P.hueRamp(4, { hue: 40,  shift: 16, sat: .55, satDrop: .30, light: [.64, .93] }),
  tomato: P.hueRamp(4, { hue: 12,  shift: 14, sat: .62, satDrop: .20, light: [.27, .56] }),
  gold:   P.hueRamp(2, { hue: 42,  shift: 10, sat: .85, satDrop: .10, light: [.52, .68] }),
  leaf:   P.hueRamp(2, { hue: 112, shift: 20, sat: .34, satDrop: .20, light: [.24, .42] }),
};
export const PALETTE = Object.values(RAMPS).flat();

export const hex = c => '#' + P.unpack(c).map(v => v.toString(16).padStart(2, '0')).join('');
/** Mean distance from every pixel to its nearest palette colour: lower is a more faithful snap. */
export function meanError(buf, palette) {
  const pal = palette.map(c => (typeof c === 'number' ? P.unpack(c) : c)); let sum = 0, n = 0;
  for (const c of buf.px) if (c >>> 24) { sum += Math.sqrt(P.dist2(P.unpack(c), pal[P.nearest(pal, P.unpack(c))])); n++; }
  return sum / Math.max(1, n);
}
/** A strip of colour swatches, 1 pixel per colour scaled up, for the preview sheet. */
export function swatches(palette, cell = 22) {
  const b = new P.Buf(palette.length * cell, cell);
  palette.forEach((c, i) => b.rect(i * cell, 0, cell, cell, typeof c === 'number' ? c : P.col(c)));
  return b;
}
