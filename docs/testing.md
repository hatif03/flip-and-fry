# Testing

What is tested, how, and what the tests cannot prove. Run them with the commands in the README.

## Suites

| Command | What | Size (at writing) |
|---|---|---|
| `npm test` | Unit tests (Vitest, Node), then browser tests (Vitest browser mode on Playwright Chromium, 360 by 760 phone viewport) | about 960 unit, 230 browser |
| `npm run test:engines` | The same receipts in Chromium, Firefox and WebKit | 3 files, 96 fixtures |
| `npm run lint` | ESLint over the repository | clean |
| `npx tsc -p tsconfig.app.json`, `-p tsconfig.server.json` | Type checks for client and server | clean |
| `npm run build:devvit` then `npm run perf:check` | The Reddit build and the size guard | budgets in `scripts/perf-check.mjs` |

## What the tests lean on

- **A fake Redis** (`src/test/fake-store.ts`) that honors per-key expiry from an injected clock, has no key scan, orders bitfield bits like Redis, supports sorted-set rank and score ranges (negative ranks too) and fails `EXEC` when a watched key changes. Server rules run against it unchanged.
- **A fake network** that bridges the client `Session` to the real server rules, with a JSON round trip on every body, so a client and server disagreement shows up as a failing test, not a production surprise.
- **Fakes for each Reddit call** (`PostApi`, `SocialApi`, `KitchenPostApi`, `MediaApi`, `NotifyApi`, `AvatarApi`, realtime), so claims, releases and refusals are tested without Reddit.
- **Golden hashes** (`src/test/fixtures/replay-golden.json`): when state gains a field the hashes change on purpose; a test confirms the *reports* did not, and the file is refreshed once.
- **Calibration gates** (`bots.test.ts`): the bots must keep their ordering over 21 dates and the judging week.

## By area

- **Determinism:** the engine over 40 seeds, live versus replay parity, forged opening states, action validation, a source guard against clocks, random sources and `Math.hypot`, the 96-fixture cross-engine hash.
- **Server:** forged logs, wrong identity, stale revisions, races injected between read and commit, the midnight crossing, streaks across years, TTLs, command budgets, rate limits, claim-before-call and release-on-failure for every post, one-a-day rules, and every "who may say what" rule for hosted service.
- **Client:** batching and retry, conflicts reloading, the finish watcher, journeys, the Test Kitchen's debounced save, presence heartbeats, live toasts.
- **Screens (browser):** the result card and its three optional buttons, the daily bar, the pass (including prep by hand, by pointer and by keyboard), the neighborhood, cook together, the research and menu panels, the Test Kitchen with a stub scene and once with the real 3D scene, touch targets of at least 44 px, no overlap at 320, 390, 768 and 1280 px.
- **Whole loop:** `full-loop.browser.test.tsx` plays a night through the real screens (open, cook, the server's card, post, flair, follow, leave the door open); `judging-week.test.ts` runs 9 to 16 December for three kinds of player; `coop-client.test.ts` runs a hosted night end to end and checks the server's lock of the host's log equals the host's hash.
- **Pixel and assets:** the lookup-table colour distance, the render pass against real palettes, the real models loading after compression.
- **Hosted service core:** two engines and a pretend network with latency, lag, reordering, a deliberately late message caught by the checksum, and late joining.

## What tests cannot prove

Listed, not assumed, in [`devvit-and-reddit.md`](devvit-and-reddit.md): behaviours that depend on Reddit approving a permission or on a real device (flair rights, comment and post as the user, media upload, push notifications, avatars on the CDN, realtime latency, the soundtrack on a phone speaker, the inline card on a real feed).

## Habits that kept it honest

Run the earlier suites again before each new one; refresh golden files once and say why; when a test fails only under load, find the timing assumption and remove it, not the test; keep a test next to every bug that was found (the finish watcher, the stranded open entry, the rank-range bug, the hands array).
