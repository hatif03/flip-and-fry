/**
 * A small pixel face for a neighbor, made from their name alone: a mirrored 5 by 5 pattern in one of the game's colours, like a pixel
 * identicon. It stands in for a Reddit avatar (whether an avatar from Reddit's CDN may load inside the webview is still to be tried
 * on a phone), and it works with no network. Pure: the same name always gives the same face.
 */
const COLORS = ['#DC533C', '#F2B743', '#3B9C98', '#F0AB70', '#526579', '#7da15a'] as const;
export function faceCells(name: string): boolean[][] {
  let h = 0x811c9dc5; for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  const rows: boolean[][] = [];
  for (let y = 0; y < 5; y++) {
    const left = [0, 1, 2].map(x => ((h >>> (y * 3 + x)) & 1) === 1);
    rows.push([left[0], left[1], left[2], left[1], left[0]]);
  }
  // Never an empty face: if the pattern came out blank, light the middle column.
  if (!rows.some(r => r.some(Boolean))) rows.forEach(r => { r[2] = true; });
  return rows;
}
export const faceColor = (name: string): string => { let h = 7; for (const ch of name) h = Math.imul(h, 31) + ch.charCodeAt(0) >>> 0; return COLORS[h % COLORS.length]; };

/** An SVG data URI, ready for an <img>. Sharp edges at any size. */
export function pixelFace(name: string): string {
  const color = faceColor(name), cells = faceCells(name);
  const rects = cells.flatMap((row, y) => row.map((on, x) => on ? `<rect x="${x + 1}" y="${y + 1}" width="1" height="1"/>` : '')).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7" shape-rendering="crispEdges"><rect width="7" height="7" fill="#FFF2D7"/><g fill="${color}">${rects}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
