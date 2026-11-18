# Build log

This is the running record for Too Many Cooks on Devvit. The plan lives in `docs/hackathon-plan.md`. This file says why each choice was made, including the ones made before the first line of the port.

New entries go at the top, under this introduction. Use the format at the bottom. Do not record secrets, access tokens, or private user data.

## 2026-11-18 — Daily headline, economy calibration and star lines (gate G3)

`createDailyHeadline(date)` and `headlineEffects` live in `src/management/daily-headline.ts` (pure, no `Date`), the engine reads the effects through a memoised getter, and `open(headline)` mixes the headline seed into the engine seed. With no headline every formula is unchanged. `src/management/stars.ts` holds the seven 1★ goals, the 2★ rule (two of three challenges) and the 3★ rule (beat the previous profit, or a stretch figure on a first night). `src/management/bots.ts` has three bots that replay one service from the starter park.

**What the bots showed, and what changed because of it.** The first calibration run (28 dates) showed the starter economy did not discriminate at all:

- The bold-price bot out-earned the fair-price bots on every headline ($360–500 against $210–250) because the one-server floor, not demand, limits throughput, so refused guests cost nothing. Fixed with a steeper walk-away slope (`PRICE_SLOPE`, 0.7 → 1.2).
- A cheaper menu now draws more guests (`discountLift`, up to 15% shorter gaps), and atmosphere shortens the arrival gap (`COMFORT_GAP`, capped at 1.5 s), as the plan intended.
- A second chef changed nothing, because the lone **server** carries every plate and cleans every table. The realistic good first hire is a second server. `cozyBot` is now: second server, one planter, one lantern, fair prices. `bareBot` sells the starter decor. `greedyBot` is +50% on both prices.

Result over the next 21 dates and the judging week: `cozyBot` earns 1★ on at least 18 of 21 dates and on every judging day; `bareBot` clears quiet and payday and mostly misses inspection and critic nights; `greedyBot` beats the fair menu on every payday and loses on at least 80% of other nights. These are tests now (`src/test/bots.test.ts`); a balance change that breaks them must change a headline weight or a star line, not the arrival code.

Corrections to the plan: the bot definitions in section 5 of the plan changed as above; the stretch figures for 3★ are in `stars.ts`. The golden replay hashes were refreshed because state gained a `headline` field and the economy changed.

Devvit or third party: none.
Code or plan: `src/management/daily-headline.ts`, `stars.ts`, `bots.ts`, `src/test/{daily-headline,headline-engine,bots}.test.ts`, plan sections 4–6 and 19 (G3).

## 2026-11-18 — Devvit scaffold: Hono server, splash and game entries

Added `devvit.json`, `src/server` (Hono, `@hono/node-server`, `createServer` and `getServerPort` from `@devvit/web/server`), `src/client/splash.{html,ts,css}` (inline entry) and `src/client/game.{html,tsx}` (expanded entry, which imports the existing `main.tsx`), `src/shared/api.ts`, and `vite.devvit.config.ts`. `npm run build:devvit` produces `dist/client` (`splash.html`, `game.html`) and `dist/server/index.cjs` (1.5 MB, CommonJS, all dependencies bundled).

Corrections to the plan, found by reading the official three.js template and the `@devvit/start` plugin source:

- **Node 24, not 22.** The template's `engines` is `>=24.0.0`, which matches this machine (v24.20).
- **Hono, not Express.** The template and the Devvit server helpers use Hono. The plan's "Express" wording is replaced.
- **The Vite plugin supports `vite build` only** and throws under `vite dev`. The Reddit build therefore has its own config (`vite.devvit.config.ts`), and `vite.config.ts` keeps serving the browser-only dev server.
- **The plugin sets the client root to `src/client`** and copies `public/` into `dist/client`, so existing `/assets/...` URLs still work.
- **Client and server need different TypeScript conditions.** `@devvit/web/client` only resolves under the `browser` condition. `tsconfig.app.json` now has `customConditions: ["browser"]` and excludes `src/server`; `tsconfig.server.json` covers `src/server` and `src/shared`. `npx tsc -p tsconfig.app.json` and `-p tsconfig.server.json` are both clean.
- The plugin forbids importing `src/server` from the client. Shared code lives outside it (`src/shared`, `src/management`).

Not done yet: `devvit login`, creating the public demo subreddit, and the first `devvit playtest`. Those need the account owner's browser login, so spike S1 (the 3D scene on a real phone) waits for that. The `dev.subreddit` value in `devvit.json` is a placeholder, `too_many_cooks_dev`.

Devvit or third party: `@devvit/web`, `@devvit/start`, `@devvit/analytics` (0.15.4), `hono`, `@hono/node-server`, and `devvit` (CLI, dev dependency). Permissions in `devvit.json`: `redis`, `reddit`, and `http` explicitly disabled. No realtime yet.
Code or plan: `devvit.json`, `src/server`, `src/client`, `vite.devvit.config.ts`, plan sections 15 and 17.

## 2026-11-18 — Baseline recorded and the deterministic core started (gate G0, part of G2)

Baseline on the untouched game, tagged `pre-devvit`: lint reports 2 errors (`no-dupe-else-if` in `src/management/city-motion.ts`, not ours) and 10 warnings. Unit tests: 502 passed. Browser tests: 132 passed in 20 files. Playwright needed `npx playwright install chromium` for the installed 1.60 build.

Built:

- `autoRoll` on the engine and a public `tick()`. With `autoRoll` off, `finish()` stops at the receipt with the doors closed. Default stays on, so the continuous-days tests are unchanged.
- `walk()` uses `Math.sqrt` instead of `Math.hypot`.
- `src/management/replay.ts`: a zod action log, `runService(opening state, actions)` and a key-order-independent state hash.
- Tests: determinism over 40 seeds, live/replay parity, forged opening states, action validation, `autoRoll`, and a source guard for clocks, random sources and `Math.hypot` in the sim files.
- **Cross-engine golden test:** 96 replay fixtures hash identically in Chromium (V8), Firefox (SpiderMonkey) and WebKit (JavaScriptCore). Run with `npm run test:engines`. This was the main risk for the server lock and for lockstep co-op, and it holds.
- `vitest` `testTimeout` raised to 30 s. The 8-hour replay test needs 4–5 s alone (5.07 s on the untouched engine) and tripped the 5 s default in parallel runs.

Deviations from the plan, and why:

- The `restaurant` singleton stays in `engine.ts`. It is harmless without `window`, and moving it would touch about 25 files and every browser test. `runService` builds its own engine, so the server never uses the singleton.
- The `route()` layout-key cost (`JSON.stringify` per call) moves to the optimization phase, where it is listed already.

Devvit or third party: none.
Code or plan: `src/management/replay.ts`, `src/test/replay*.ts`, plan sections 2, 4 (E1, E2) and 19 (G0, G2).

## 2026-11-18 — Plan rewritten from the Devpost rules and the Devvit docs

`docs/hackathon-plan.md` is replaced. It uses the saved Devpost pages (Overview, Resources, Rules) and the official docs in `reddit/devvit-docs`.

Facts that changed the plan:

- **The demo subreddit must be public with under 200 members** (or install `dr-admin-approve`). The earlier plan said private.
- **README.md in the repo root is required.** The earlier plan said it was optional.
- **The optional demo video is under 1 minute.** A port must explain how it was significantly updated; `git tag pre-devvit` marks the baseline.
- **Four equal criteria:** Delightful UX (first in the tie-break), Polish, Reddity, Daily Content. The Overview warns against AI slop, on-the-nose Reddit theming and unstyled generic components, and asks for one result card, not several end screens.
- **Snoovatars and streaks are named bonuses.** Snoovatars sit behind spike S3 with a pixel-face fallback.
- **`permissions.http.enable` defaults to true,** so it is set to false explicitly.
- **The day locks by itself.** A Lock button added an end-screen decision the Overview asks us to avoid.
- **`KitchenEngine` ships whole:** the pass in ticket mode, plus the Test Kitchen (three shifts, solo and two-chef, tutorial, wardrobe) with progress in Redis.
- **Added:** a nightly report comment, a highlighted daily post, subreddit settings for the neighborhood name, text fallback, `showForm` for the note, an optional "Post my kitchen" action, a Feedback and Devvit Helper track, test gates G0–G13 and an optimization phase that starts only after the full game passes G11.

Why: each is either a hard requirement on Devpost, a documented platform limit, or a named judging preference. Nothing from the earlier list was dropped; the tests and the optimization plan are new.

Devvit or third party: Silkscreen and a pixel body font (OFL, bundled); `gltf-transform` with meshopt (authoring time); no new Devvit permission beyond the plan's list.
Code or plan: `docs/hackathon-plan.md`, `docs/plan-review.md`.

## 2026-11-18 — Plan reviewed against the code; amendments proposed

`docs/plan-review.md` compares the plan with the engine. Proposed, not yet applied to the plan:

- Park becomes server-authoritative (the server applies planning actions through the engine's own methods), so a client cannot post its own cash.
- Park and profile live under `park:{uid}` and `profile:{uid}`, because Redis TTL is per key and not per hash field.
- `Math.hypot` in `walk()` becomes `Math.sqrt` so the replay matches across JavaScript engines. The server's receipt is the official one.
- The pass becomes a tap-and-hold micro-action in the tycoon scene, not an embedded `KitchenEngine`, because the arcade cannot be replayed on the server and is too large to embed per ticket.
- Nothing is cut. Co-op, open-door visits, presence diners, the pass, research and regulars all run on one deterministic engine plus a tick-stamped action log: the server replays it for the lock, visits and bots, and clients run it in lockstep for co-op, so only actions cross the realtime channel (100 messages/s cap, server-send only).
- Visitors are inputs to the opening snapshot, so presence diners stay replay-verifiable.
- Added: a static inline splash with `postData` and an expanded `game` entrypoint, a phone spike first, sample kitchens for the empty-subreddit case, a lazy daily-post roll (the cron timezone is undocumented), a streak bitfield, and bot calibration for 9–16 Dec.
- Push notifications are a gated beta: apply, but build nothing that depends on it.

Why: each item either breaks against the current code or needs a different mechanism on Devvit. Platform limits were checked against the official docs in the `reddit/devvit-docs` GitHub repo. Devpost and `developers.reddit.com` could not be fetched, so Devpost facts come from search excerpts and the Android WebGL claim is still unverified; the review lists them.

Devvit or third party: none turned on or off by this entry.
Code or plan: `docs/plan-review.md`, `src/management/engine.ts`.

## 2026-11-18 — The build log is a standing rule for Cursor and Claude

Cursor reads `.cursor/rules/build-log.mdc`. Claude reads `.claude/rules/build-log.md`. The text matches. Neither file is a substitute for this log.

## 2026-11-18 — What we will not do, and the versions we will

Reviewed every item that had been listed as out of scope.

- **`devvit publish` stays unused until after the hackathon.** The event asked for a private upload and a playtest post, not App Review. Redis, realtime, the scheduler, triggers, and posting as the app do not need review. Journeys may drop events until Reddit allowlists the map, so streaks are stored from the server replay. Commenting as the player runs as the app account for everyone except the owner until review. The demo uses the owner account. Payments and external image fetches need review, and we are not using them. If something later works only after publish, the workaround goes in this log the same day.
- **Devvit Payments stay off.** A real charge needs review and the Earn policy, and a paid night would gate the game. In-game dollars are the economy.
- **One open service can finish while you are away.** The engine already replays real steps in `resume()`. On Reddit that replay stops at the end of the service that was open. It does not start a new day or play a headline you never opened. Idle profit across many days was refused because it spends the daily headline without the player.
- **A scripted guest list, a 75-second mode, and a replacement for `RestaurantScene` stay out.** They undo the tycoon: full services, seeded-but-unscripted guests, and the 3D room. This is the agreed game, not a platform limit.
- **Animal rigs stay.** Codixel supplies the palette, the blit, and the flat UI. The rigs are not replaced by sprites.
- **One shared service is in. One world for the whole subreddit is out.** The host runs the engine and broadcasts a small snapshot on the Devvit realtime channel. Joiners send cook results, priority, and comp. Devvit cannot hold every restaurant on one clock. A request dies at 30 seconds.
- **Votes, karma, and a required comment stay out of the sim.** The Devvit Rules forbid vote manipulation and forbid gating play on a comment or a subscribe.
- **The review can carry an 80-character note.** It is previewed, posted as the player, not stored in Redis, and not turned into guest speech. Longer text belongs in Reddit’s own comment box.
- **A second room stays on the same books.** The east terrace already expands the floor without deleting it. A new park that wipes the first one is not how contracts advance. Reset remains an explicit confirm.

## 2026-11-18 — Reddit features that change the night

Presence, visits, and a hosted co-op service are gameplay, not share buttons.

- Realtime is enabled so people who have today’s post open can appear as up to three diners, and so a host can run one shared service. Usernames ride on the channel message and are not kept as profiles.
- An open-door snapshot in Redis lets another player run one service in your layout. They cannot remodel it or take the cash. You get a canned thought and a tip.
- Post flair is today’s headline. The subreddit setting for the neighborhood name is painted on the sign. Both use the Reddit API as the app.
- Upvotes are not an input. A busy comment thread does not spawn guests. That would reward spam, and a required comment is against the user-action rules.

## 2026-11-18 — The pass and the music are part of the night

`KitchenEngine` in `src/game` is mounted for any ticket with no free chef. Finishing the dish sets that tycoon guest to ready. Hiring staff is how the station goes quiet. Treating this as a later contract was a schedule cut, and it was reversed.

Music is three local beds: doors-closed, service, and a rain layer that ducks the service track. Chop and the serve sting stay on the existing files in `src/game/assets.ts`. The two new loops have to be original and stored under `public/assets/audio/`. No Devvit media upload and no remote host.

## 2026-11-18 — Restaurant Tycoon, taken in part

From the Roblox series: bills on the table during service, comfort shortening the next-guest gap with a cap, the opening night starting with a chef and no server, recipes unlocked by a machine you place, a house style (Garden, Grill, or Noodle) with about four dishes each, and the reputation stars on the sign.

Five hundred dishes were refused because a phone menu cannot be priced at that size and the art would not land before 8 Dec. A shared physics world of every player was refused because Devvit has no durable game process. The visit and the hosted service above are the version that fits.

## 2026-11-18 — Why people come back

RollerCoaster Tycoon had no online leaderboard. The campaign is contracts on one restaurant: the four goals already in `GOALS`, then loan, rating, a night you cannot sell furniture, fair prices, a full room, and regulars. The receipt shows Welcome, Speed, and Value, one award banner, and a personal company value. Research is a budget that unlocks the right to buy the next machine.

Clash of Clans is the reason the park is never replaced when you miss a star. A profit ladder was refused because a day-10 kitchen would own it. The neighborhood line counts banners, not cash.

The Kitchen Rush state notes (18 Nov 2026) are the gap this closes: two dishes, six furniture types, four milestones, and weather that did not change money.

## 2026-11-18 — Pixel feel on the current scene

An earlier plan replaced `RestaurantScene` with a flat canvas, then with billboard animals. Both were refused. The scene renders small and is drawn back up with nearest-neighbor filtering through a 16-color palette from Codixel (`tools/pixel/`, authoring time only). The same 2D-canvas copy is the workaround for the Android Reddit webview drawing WebGL black. Codixel also draws panel frames, thought bubbles, and icons. It does not run on the Devvit server.

## 2026-11-18 — The daily is a headline on your park

`createDailyHeadline` changes weights on the existing arrival, patience, price, and dirt formulas. It does not spawn a fixed guest list. The park is stored in Redis because the webview origin changes on every upload and `localStorage` would be wiped. The server replays an opening snapshot to lock a score. One lock per UTC date counts for the streak. Further services that evening still save.

Devvit pieces: Redis, a 00:05 UTC scheduler, a moderator menu that calls the same function, journeys with the server writing the official end, and canned comments as the user when they confirm. Identity comes from the server context. A user id in the request body is ignored.

## Entry format

```markdown
## YYYY-MM-DD — Short title

What changed or what was decided.

Why. What was refused.

Devvit or third party: name the capability or library, or write "none".
Code or plan: path or section.
```
