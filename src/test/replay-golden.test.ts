import { describe, expect, it } from 'vitest';
import { replayHashes } from './replay-fixtures';

describe('replay golden hashes (Node)', () => {
  // Refresh deliberately with `npx vitest run -u` when the simulation changes on purpose.
  it('match the checked-in golden file that Chromium, Firefox and WebKit are held to', async () => {
    const hashes = replayHashes();
    expect(Object.values(hashes).some(h => h.startsWith('error:'))).toBe(false);
    await expect(JSON.stringify(hashes, null, 1)).toMatchFileSnapshot('./fixtures/replay-golden.json');
  });
});
