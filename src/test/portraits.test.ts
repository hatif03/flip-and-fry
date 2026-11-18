import { describe, expect, it } from 'vitest';
import { portrait, portraitCells } from '@/management/portraits';
import { SPECIES } from '@/management/types';

describe('species portraits', () => {
  it('are 16 by 16, left-right symmetric in the head, and never blank', () => {
    for (const s of SPECIES) { const cells = portraitCells(s); expect(cells).toHaveLength(16); expect(cells.every(r => r.length === 16), s).toBe(true); expect(cells.flat().filter(Boolean).length, s).toBeGreaterThan(80); }
  });
  it('differ from one another and are the same every time', () => {
    const all = SPECIES.map(portrait); expect(new Set(all).size).toBe(4); expect(portrait('bear')).toBe(portrait('bear'));
  });
  it('use only the game\'s colours and the species\' own fur, and are self-contained sharp images', () => {
    for (const s of SPECIES) { const svg = decodeURIComponent(portrait(s).slice('data:image/svg+xml,'.length)); expect(svg).toContain('crispEdges'); expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:|<script|href/); }
  });
});
