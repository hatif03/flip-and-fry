import { describe, expect, it } from 'vitest';
import { faceCells, faceColor, pixelFace } from '@/management/pixel-face';

describe('a neighbor\'s pixel face', () => {
  it('is the same every time for the same name, and differs between names', () => {
    expect(pixelFace('maple')).toBe(pixelFace('maple'));
    const faces = new Set(['maple', 'bob', 'cara', 'dan_the-man', 'eve', 'x', 'host_cook', 'guest'].map(pixelFace)); expect(faces.size).toBeGreaterThanOrEqual(7);
  });
  it('is mirrored left to right, five cells square, and never blank', () => {
    for (const name of ['maple', 'a', 'zzzzzz', '0', 'Some_Long_Name-12', '']) {
      const cells = faceCells(name); expect(cells).toHaveLength(5);
      for (const row of cells) { expect(row).toHaveLength(5); expect(row[0]).toBe(row[4]); expect(row[1]).toBe(row[3]); }
      expect(cells.some(r => r.some(Boolean)), name).toBe(true);
    }
  });
  it('uses only the game\'s colours', () => { for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) expect(['#DC533C', '#F2B743', '#3B9C98', '#F0AB70', '#526579', '#7da15a']).toContain(faceColor(name)); });
  it('is a self-contained image with sharp edges and no network request', () => {
    const uri = pixelFace('maple'); expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(uri.slice('data:image/svg+xml,'.length)); expect(svg).toContain('crispEdges'); expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:|<script|href/);
  });
});
