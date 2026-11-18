import type { SPECIES } from './types';

/**
 * Pixel portraits of the four species, drawn on a 16 by 16 grid from shapes (ears, head, eyes, muzzle) and returned as SVG data URIs.
 * They stand beside a regular's name in the ledger. Pure: the same species always gives the same picture, and nothing is fetched.
 */
export type Species = (typeof SPECIES)[number];
const SIZE = 16;
const INK = '#233D3B', WHITE = '#FFF2D7', PINK = '#F0A8A0';
const FUR: Record<Species, { main: string; shade: string; inner: string }> = {
  mouse: { main: '#bfb8ae', shade: '#9d968c', inner: PINK },
  rabbit: { main: '#f2e6d0', shade: '#d6c7aa', inner: PINK },
  bear: { main: '#a8744a', shade: '#8a5b38', inner: '#d9b48a' },
  crocodile: { main: '#6fae5a', shade: '#4f8a43', inner: '#e8e0a0' },
};

export function portraitCells(species: Species): (string | null)[][] {
  const g: (string | null)[][] = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
  const { main, shade, inner } = FUR[species];
  const fill = (test: (x: number, y: number) => boolean, color: string): void => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (test(x, y)) g[y][x] = color; };
  const ellipse = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number): boolean => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const mirror = (x: number): number => SIZE - 1 - x;

  // Ears, behind the head.
  if (species === 'mouse') for (const cx of [3.5, mirror(3.5)]) { fill(ellipse(cx, 3.5, 3, 3), main); fill(ellipse(cx, 3.5, 1.8, 1.8), inner); }
  if (species === 'rabbit') for (const cx of [4.3, mirror(4.3)]) { fill(ellipse(cx, 3, 1.8, 4.2), main); fill(ellipse(cx, 3.4, .9, 2.8), inner); }
  if (species === 'bear') for (const cx of [3.5, mirror(3.5)]) { fill(ellipse(cx, 4.5, 2.6, 2.6), main); fill(ellipse(cx, 4.8, 1.3, 1.3), inner); }
  // The head.
  const head = species === 'crocodile' ? ellipse(7.5, 9, 6, 4.6) : ellipse(7.5, 9.5, 6.2, 5.2);
  fill(head, main);
  fill((x, y) => head(x, y) && (x - 7.5) * .5 + (y - 9.5) * .85 > (species === 'crocodile' ? 3.6 : 4.4), shade);
  // The muzzle, eyes and nose.
  if (species === 'crocodile') {
    fill(ellipse(7.5, 12, 5, 2.6), inner); for (const x of [5, 10]) g[11][x] = INK; // nostrils
    for (const cx of [4.5, 10.5]) { fill(ellipse(cx, 4.5, 2, 2), main); fill(ellipse(cx, 4.5, 1.1, 1.1), WHITE); g[4][Math.round(cx)] = INK; g[5][Math.round(cx)] = INK; }
    for (const x of [3, 6, 9, 12]) g[13][x] = WHITE; // teeth
  } else {
    if (species === 'bear') fill(ellipse(7.5, 11.5, 3, 2.3), inner);
    if (species === 'mouse') fill(ellipse(7.5, 12, 2.2, 1.6), WHITE);
    for (const x of [4, mirror(4) - 0]) { g[8][x] = INK; g[9][x] = INK; }
    const noseY = species === 'bear' ? 11 : 11;
    g[noseY][7] = species === 'bear' ? INK : PINK; g[noseY][8] = species === 'bear' ? INK : PINK;
    if (species === 'rabbit') { g[12][7] = INK; g[12][8] = INK; }
  }
  // A one-pixel outline around everything.
  const copy = g.map(row => row.slice());
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (!copy[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => copy[y + dy]?.[x + dx] && copy[y + dy][x + dx] !== INK)) g[y][x] = INK;
  return g;
}

/** An SVG data URI for an <img>, sharp at any size. */
export function portrait(species: Species): string {
  const rects = portraitCells(species).flatMap((row, y) => row.map((c, x) => c ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>` : '')).join('');
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>`)}`;
}
