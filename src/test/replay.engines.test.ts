import { describe, expect, it } from 'vitest';
import golden from './fixtures/replay-golden.json';
import { replayHashes } from './replay-fixtures';

/**
 * Runs in Chromium (V8), Firefox (SpiderMonkey) and WebKit (JavaScriptCore). The server and the host browser
 * must agree on every receipt, or the lock rejects honest players and co-op desyncs.
 */
describe('replay is identical in every JavaScript engine', () => {
  it('produces the golden receipt hash for every fixture', () => {
    const hashes = replayHashes();
    expect(Object.keys(hashes)).toEqual(Object.keys(golden));
    expect(hashes).toEqual(golden);
  });
});
