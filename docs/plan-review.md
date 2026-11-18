# Review of `hackathon-plan.md`, and how to make all of it work

Reviewed 2026-11-18 against `src/management/*`, `src/game/*`, the git history, and the official Devvit docs (read from the public `reddit/devvit-docs` repo on GitHub). The plan itself is unchanged. Everything below is a proposed amendment.

**Verdict.** The plan's direction holds up, and no feature in it is impossible on Devvit. The platform facts are friendlier than I first assumed. The problems are in the plan's own mechanics: it assumes engine behaviour the code does not have, and its server-trust design can be cheated. One architectural change (section 3) fixes the trust problem and makes co-op, open-door visits, presence diners, replay and the bots all cheap.

---

## 1. What is verified, and from where

Read from `raw.githubusercontent.com/reddit/devvit-docs/main/docs/...`. Devpost and `developers.reddit.com` could not be fetched (403 and a tool block), so Devpost facts come from search excerpts only.

| Fact | Source | Effect on the plan |
|---|---|---|
| Server is serverless: 30 s per request, 4 MB payload, 10 MB response. No WebSockets, no `fs`, no long-lived process. | `devvit_web_overview.mdx` | The plan's "30-second request cannot be the clock" is right. State must live in Redis. |
| The client can only reach its own domain (CSP). `localStorage` is lost on every app update because the iframe URL changes per version. | same | The plan's reason for moving saves to Redis is confirmed. |
| Redis: expiry is per **key**. No key scan. No sets or lists. `hSetNX`, hashes, sorted sets, `bitfield`, `incrBy`, `watch/multi/exec` exist. 100 MB for unpublished apps. 40k commands/s. `zRange` by score or lex returns at most 1,000. | `redis.mdx` | The plan's per-field 30-day TTL does not exist. Use per-user keys. 100 MB is plenty for parks of ~10 KB. |
| Realtime: the **server** sends (`realtime.send`), the **client** subscribes (`connectRealtime`). 1 MB per message, 100 messages/s per installation. Channel names cannot contain `:`. | `realtime/overview.md`, `faq.mdx` | Clients cannot publish. Everything goes through `/api/` routes. The plan's "snapshot a few times a second" would eat the whole budget. Section 3 avoids it. |
| `asUser` actions: `SUBMIT_POST`, `SUBMIT_COMMENT`, `SUBSCRIBE_TO_SUBREDDIT`. Unapproved apps run `runAs: 'USER'` as the app account, except for the app owner. Actions must be explicit, separate, non-gating. Preferred score comment: reply to a stickied comment. | `userActions.mdx` | Matches the plan. Flair is not in `asUser`, so the app sets it (needs checking, section 6). |
| `devvit.json`: `name` 3–20 chars. `triggers` include `onCommentDelete` and `onPostDelete`. Handlers live under `/internal/`. Scheduler tasks have a `cron` (timezone **not documented**), 1-minute resolution, 10 live recurring tasks. Menu items, `settings`, `marketingAssets.icon` (1024×1024 PNG). | `devvit_web_configuration.md`, `scheduler.mdx` | Matches, except the cron timezone is unconfirmed. Make post creation lazy (section 4.13). |
| Inline vs expanded. `requestExpandedMode` must be called synchronously from a user click. Inline must be tap-only, load in under 1 s, and not block feed scrolling. Heights: REGULAR 320 px, TALL 512 px. Sound only after interaction, with a mute button, and muted when the user scrolls away. | `view_modes_entry_points.md`, `scroll-traps.mdx`, `faq.mdx` | The plan has no splash or expanded entry. It needs both (section 4.3). |
| Journeys: events fire only for approved journey maps. Telemetry is Devvit Web only. Start must come from an explicit action. | `devvit-journeys.md` | Matches the plan. Playtest events are likely dropped. |
| Push notifications: a gated beta you apply for, aimed at games with traction. Streak guidance uses one bit per day per user per year in a Redis `bitfield`, with the UTC date of the post as the anchor. | `notifications-overview.md`, `adding-streaks.md` | Not in the plan. Apply for it, and use the bitfield streak design. |
| `postData`: 2 KB of JSON per post, readable from the client `context`. | `post-data.mdx` | Lets the splash show today's headline with no server call. |
| Playtest and upload: `devvit upload` makes a private build. `publish` goes to review. Logs are capped at 5,000 events or 7 days. Triggers can deliver more than once. | `faq.mdx`, `triggers.mdx`, `launch-guide.md` | Delete triggers must be idempotent. |
| Devpost, from search excerpts only: Best Daily Game $15,000. Best **Ported** Daily Game $6,000, for "existing IP or ported from another platform", which you must own and flag as a port. One prize per project. Submission is an app link, a README, a link to a post running the game, and a description. | search excerpts of the Devpost pages | The port category fits this repo. You cannot win both, so pick one in the submission. |

**Not verified.** The Android Reddit WebGL "black canvas" claim: the FAQ does not mention it, so build the 2D-canvas copy behind a flag and test it on a real device. Flair permissions for the app account. The exact Devpost Stage Two criteria: one excerpt says "Delightful UX, Polish, Daily Content", another lists a "Reddit-y" criterion.

**Judging tension to design around.** The Devpost text describes a daily game as a *bite-sized* daily experience that is *easy to get the hang of*. This plan is deep. Keep the depth, but gate it behind progressive disclosure: day 1 is one headline, one Open button, and one receipt, and the contracts, research, regulars, visits and co-op appear as the player's park grows.

---

## 2. Where the plan disagrees with the code

| # | Plan says | Code says | Fix |
|---|---|---|---|
| A1 | Doors closed → **Open** → receipt → **Continue**. | `finish()` calls `beginNextDay()`, which reopens by itself unless `renovation` is set (`engine.ts:231-238`). `tests/continuous-days.test.ts` asserts auto-roll. `resume()` replays many days. | Add an `autoRoll` flag (default true so old tests pass). With it off, `finish()` stops at a receipt. Add a headless `runService(snapshot, headline, actions)`. |
| A2 | The starter park has a chef and no server. | The schema requires `staff.min(2)`. `dismiss()` and `readiness()` assume one of each role. Without a server **nobody delivers**. | Bump the schema version. Make delivery part of the pass: tap the ready plate, then the table. |
| A3 | `parks` hash, 30-day TTL per field. | Expiry is per key. | `park:{uid}`, `profile:{uid}`. The key is known, so no scan. |
| A4 | The client posts its `RestaurantState`. | The schema checks shape, not plausibility. A client can post `cash: 999999`. | The server stores the park. The client sends planning actions, and the server applies them with the engine's own methods (section 3). |
| A5 | "A client total that disagrees is rejected." | `walk()` uses `Math.hypot` (`engine.ts:21`). Its last bit can differ between V8 and JavaScriptCore. | `Math.sqrt(dx*dx+dz*dz)` is exact in IEEE. `atan2` only feeds `yaw`. Add a cross-engine hash test (Node, Chromium, WebKit). |
| A6 | Actions `comp`/`priority`. | No timestamp. Wall-clock time is meaningless on the server. | Log `{tick, type, ...}` in sim ticks. |
| A7 | The pass reuses `KitchenEngine`. | `KitchenEngine` is a real-time WASD game with 20+ stations. Touch controls exist for solo only. The server cannot replay it. | Section 4.4: a micro-action first, the full station as an upgrade. |
| A8 | Pricing is a core decision. | Refusal is `max(0,(price/fair-1)*.7)`. Revenue peaks at about fair×1.21, +3% over fair. Nothing rewards a lower price. | Add a discount demand lift. Define `greedyBot` exactly (+50%). |
| A9 | "Size-matched median". | Never defined. | Delete it, or define it. |
| A10 | `restaurant = new RestaurantEngine(browserStorage())` is shared by client and server. | The module-level singleton runs at import. `route()` calls `JSON.stringify(furniture)` on every call. | Move the singleton to the client. Compute the layout key once per layout change. |
| A11 | Presence and visitors come from the realtime channel. | Clients cannot send, and cannot know when someone closes the post. | Make visitors an input to the opening snapshot (section 4.6). |

**Checked and fine.** No remote URLs in `src/` or `index.html`. Fonts are bundled. No GLB uses Draco, so no decoder is fetched. The sim imports only `zod` and pure modules, so it bundles for the server. The arcade has solo touch input.

---

## 3. One architecture that makes everything work: a deterministic engine plus an action log

Treat the engine as a pure function: `(snapshot, headline, actionLog) → receipt`. The engine already is one, apart from the `Math.hypot` and singleton issues above. Every feature in the plan then reduces to "who produces and checks the action log":

| Feature | Who produces the log | Who runs it |
|---|---|---|
| Official lock | The owner's client | The server replays. Its receipt is the official one. |
| Bots (calibration) | The test code | Node, headless |
| Open-door visit | A visitor, against the host's stored snapshot | The server replays and writes the host's note |
| Co-op service | Host and joiners | Everyone runs the **same** engine locally in lockstep |
| Presence diners | The server puts them in the snapshot at Open | The server replays them like any other arrival |

The action log format: `{tick:number, kind:'place'|'sell'|'hire'|'train'|'dish'|'expand'|'loan'|'comp'|'priority'|'cook'|'deliver', ...args}`. Planning actions have tick 0 and run through the same engine methods, so they check cash, layout and phase. Service actions carry a tick, and the server rejects ticks outside the service, past the per-service caps, or for guests that do not exist at that tick.

Rule: **the server's replay is the only source of cash, stars, streaks and receipts.** The client's live run is a preview.

---

## 4. Feature-by-feature: how each one works on the platform

### 4.1 Server-authoritative park and the lock
- `park:{uid}` holds the park. `POST /api/open` loads it, applies the posted planning actions with the engine methods, mixes in the headline seed, stores `open:{date}:{uid}` and returns a snapshot id.
- `POST /api/lock` replays `snapshot + serviceActions`, stores the receipt if it beats today's lock, updates the streak bitfield, and ends the journey.
- Concurrency: store `rev` in the park. `watch/multi/exec` guards the write, so two tabs cannot lose a service.
- Save after each planning action, not on `pagehide` (an expanded webview closes without warning).

### 4.2 The daily headline
- `createDailyHeadline(date)` as planned. It also seeds the shared daily challenges (`createDailyChallenges` currently seeds from `state.seed`, which is per player). Seed them from the date plus the owned menu, so everyone sees the same three goals today.
- Bind the headline at Open. A service that crosses UTC midnight keeps its headline.

### 4.3 First screen, inline and expanded
- `splash.html` is the `default` entrypoint (inline, TALL 512 px). It is **static**: a pre-rendered pixel still of the rooftop, today's headline from `context.postData` (no server call), the date, the streak, and one **Open** button. It scrolls with the feed and has no gesture capture.
- The button calls `requestExpandedMode(event.nativeEvent, 'game')`. The 3D game is the `game` entry. Inline and expanded do not share memory, so the game fetches `GET /api/today` itself.
- This also fixes first-load cost in the feed: no WebGL until the user taps.

### 4.4 The pass
- **Default (verifiable):** tap a ticket that no chef has picked up, hold to chop (reuse `chopping.ts` and `chop.mp3`), release in the green zone, tap the grill, then tap the ready plate and the table. The action is `{tick, kind:'cook', guestId, quality}`. The server checks the guest was `waiting` and no chef was free at that tick, enforces a minimum cook time of half `DISHES[dish].seconds`, and caps quality effects. Cheating is bounded to "perfect cook".
- **Upgrade:** embed the real `KitchenEngine` as a single-ticket scenario (a station subset, one order, the timer taken from the guest's remaining patience, solo touch controls). The result maps to the same `cook` action and the same server bounds. This is more work, and it needs a fixed-step mode in `KitchenEngine`, but it reuses the existing arcade. Ship the micro-action first, then swap.

### 4.5 Co-op (hosted service) with lockstep, not snapshots
- Each client runs the engine locally. Only **actions** cross the wire, not positions.
- Join: `GET /api/coop/:id` returns the host's opening snapshot and the action log so far. The joiner fast-forwards to the current tick.
- Joiner action: `POST /api/coop/act` → the server checks membership and rate → `realtime.send` to the host only → the host stamps `tick = now + 15` (1.5 s input delay) → `POST /api/coop/commit` → the server appends to Redis and `realtime.send`s the stamped action to everyone. Everyone applies it at that tick.
- Every 10 s the host sends `{tick, stateHash}`. A joiner that mismatches refetches the host's last snapshot (written to Redis every 20 s) and re-syncs.
- Message budget: a handful of actions per minute per session, against a 100/s cap. Position snapshots at 4 Hz would have used 20% of the cap per session.
- Host leave: no commits for 5 s → joiners pause and show "host away". The session registry is a sorted set scored by last heartbeat. Co-op runs at 1× only.
- Channel names: `coop_<postId>_<sessionId>`. No `:`.
- Depends on the A5 determinism fix. If the hash test fails, co-op fails first, which makes it a useful canary.

### 4.6 Presence diners
- A visitor with the post open calls `POST /api/presence` every 20 s (score = timestamp in a sorted set, display name, house style).
- At **Open**, the server takes up to three present visitors and writes them into the **opening snapshot** as scheduled arrivals (`{name, dish, tick}`). They are then ordinary replayed guests. A live toast is optional via realtime.
- A visitor whose dish is off the menu is a soft miss with the thought "Nothing here for me". Because they are in the snapshot, the lock stays verifiable.

### 4.7 Open-door visits
- Closing the door deletes `open-door:{hostUid}`. Lock-in with "Leave the door open" writes the layout, menu, house style, name and award.
- A visitor runs a service in that snapshot with their own action log, with all build actions refused. The server replays it and appends a canned note (name, one kitchen-card thought, tip total) to `bulletin:{hostUid}` (a sorted set, capped at 20).
- **Cold start.** With few real kitchens, ship 4–6 static **sample kitchens** in code, labeled "Sample kitchen", fully playable through the same replay. Give every neighborhood feature a designed empty state. Never present samples as real players.

### 4.8 Pixel presentation (all on the existing scene)
- Render the scene at ⅓ resolution (`dpr`) and let CSS (`image-rendering: pixelated`) upscale. That is zero cost.
- Palette snap: take over the render in `useFrame(..., 1)`, draw the scene into a `WebGLRenderTarget` with nearest filtering, then draw a full-screen quad with a palette lookup shader. No extra dependency.
- Gate: if a still of the real scene looks worse than plain downscale + posterize, ship the downscale (lit scenes with ACES, shadows and weather tints band badly in 16 colours; try 32, or one palette per weather).
- Android copy workaround, behind a flag: `drawImage(glCanvas)` into a **low-res** 2D canvas in the same task as the render, then CSS upscales. Set R3F's `eventSource` to the wrapper, because the visible canvas is no longer the WebGL one.
- Frames, thought bubble, stamp and Silkscreen as planned. Codixel runs in Node only.

### 4.9 Music
- Sound only after the first tap, a visible mute button, and mute on `visibilitychange` (Devvit requirements).
- The two new beds: generate them with Web Audio (a few oscillators and a pentatonic scale, a quiet bed for doors closed and a rain layer). No rights question, no new files, no bundle weight. The existing `music.mp3` stays as the service track.

### 4.10 More dishes, research, contracts, regulars, weather
These are pure engine work with no platform risk, and every one is covered by the replay and bot gates.
- **Dishes:** `Dish` is a hard-coded `'salad'|'burger'` in the zod schemas, `arrive()`, `readiness()` and the challenge kinds. Make `DISHES` the single data table, keyed by id, and derive the enums from it. New appliances (pot, wok, oven) are composed from the existing `Primitives.tsx` boxes and cylinders, so no new models are needed.
- **Research, contracts 5–6, regulars (max 4, fixed names), weather weights, bills on tables, comfort shortening the arrival gap:** schema additions plus a migration, then bot gates. Weather weights must come from the headline or the date, not the cosmetic `weatherAt()` clock, because that clock is session-only and not replayable.
- **Staff cloth:** `setOutfitColor` already exists in the arcade; store the choice in the park.

### 4.11 Streak and flair
- Streak: a `bitfield` bitmap per user per year, one bit per UTC day, anchored on the daily post's UTC date. Only the server's replay sets a bit, and only for a 1★ result. Forgiving read: start from yesterday if today is unplayed.
- Flair: set by the app from `POST /api/flair`. Create the flair templates at install time. This needs mod permission for the app account, which is the first thing to try on the dev subreddit.

### 4.12 Comment, subscribe, journeys, notifications
- Comment and subscribe as planned: explicit separate buttons, reply to the sticky, canned text, the optional 80-character note shown before sending. Store a "subscribed" flag in Redis (there is no API to check).
- Journeys as planned. The map needs review, so expect dropped events in playtest, and make sure nothing depends on them.
- Push notifications: apply to the beta now with the application form. Build nothing that depends on access. If it arrives, the streak bitfield is already the right data.

### 4.13 Daily post
- Lazy roll: `GET /api/today` computes the UTC date on the server. If `posts[date]` is empty, it takes a lock with `hSetNX`, creates the post and sticky, and fills `posts[date]`. The cron (00:05) and the moderator menu call the same function. This does not depend on the cron's undocumented timezone or its 1-minute drift.
- `postData`: `{date, headlineId}` (well under 2 KB) so the splash needs no call.
- Delete triggers: `onCommentDelete` and `onPostDelete` drop the stored ids. Triggers can deliver more than once, so make them idempotent.

### 4.14 Submission
- Devvit: `devvit upload`, never `publish`. Make the playtest subreddit reachable to judges (confirm the rule in the Devpost text), and avoid uploads during the 9–16 Dec judging window except hotfixes, because judges can see change logs.
- Required items (per excerpts): app listing link, README, link to a post running the game, text description. State in the description that this is a port of a game you own, and say what is new for Reddit.
- Calibrate the bots on the real judging dates (Wed 9 Dec through Wed 16 Dec), not only on the next 21 dates. The 6 pm PST deadline on 8 Dec is 02:00 UTC on 9 Dec, so the Dec 8 and Dec 9 posts must both exist.

---

## 5. Budgets

| Resource | Limit | Our use |
|---|---|---|
| Request time | 30 s | A replay of 240 s of sim is 2,400 steps. Measure it. Expect well under 1 s once `route()` stops stringifying. |
| Realtime | 100 msg/s, 1 MB | Co-op by actions: a few per minute per session. |
| Redis | 100 MB unpublished, 40k cmd/s | A park is ~10 KB. 1,000 players is about 10 MB. |
| `postData` | 2 KB | `{date, headlineId}` |
| Inline load | < 1 s | Static splash, one image, no WebGL. |
| Recurring tasks | 10 | 1–2 |

---

## 6. Still to confirm

- The full Devpost text, in particular the Stage Two criteria and what judges need to open a private playtest subreddit. Paste the rules page into the chat if it cannot be fetched.
- Flair permissions for the app account, and whether the dev subreddit allows flair templates.
- Whether the `cron` schedule is UTC.
- The Android WebGL behaviour, on a real device.
- Whether `runAs: 'USER'` as the app owner works as documented in the demo.

---

## 7. Build order (by dependency)

1. **Phone spike.** The `devvit.json` + Express scaffold, the 3D scene loaded in expanded mode on a real iOS and Android Reddit client. This answers the Android question and the load-time question before anything else depends on them.
2. **Deterministic core.** `autoRoll`, `runService`, the `Math.sqrt` fix, the singleton removal, the action-log type, and the cross-engine hash test. Everything below depends on this.
3. **Headline, shared challenges, bots** on the exact judging dates.
4. **Server park, open and lock**, the lazy daily post, streak bitfield, the receipt and stars.
5. **Splash, expanded mode, collapse the dock.**
6. **Pixel presentation, thoughts, kitchen card, awards, comment/flair/subscribe.**
7. **The pass (micro-action), bills, starter staff, dishes refactor.**
8. **Contracts, research, regulars, weather weights, music.**
9. **Presence diners, then open-door visits with sample kitchens, then co-op lockstep.**
10. **The full arcade station as the pass upgrade.**
11. Submission package.

Steps 2 and 4 carry most of the risk. Steps 8–10 reuse the log from step 2, which is why the order works without cutting anything.
