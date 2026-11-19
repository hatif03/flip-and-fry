# Build log

This is the running record for Flip and Fry (formerly Too Many Cooks) on Devvit. The plan lives in `docs/hackathon-plan.md`. This file says why each choice was made, including the ones made before the first line of the port.

New entries go at the top, under this introduction. Use the format at the bottom. Do not record secrets, access tokens, or private user data.

## 2026-11-20 — Plan v2, phase A: a screen that reads as a game

**Why:** the author's phone and desktop screenshots showed a header card, a banner with a paragraph of instructions, a welcome card, five camera buttons, a status line, a challenges card and a two-row dock all on one 360 px screen ("so cluttered", "not a game, a SaaS app").

**What changed (`ManagementGame.tsx`, `RedditLayer.tsx`, `BusinessUpdates.tsx`, `CashRegister.tsx`):**
- The header is one row on every width: name, day, cash, reputation, settings. Captions and the clock only appear from the `sm` breakpoint up.
- The daily bar is two lines (neighborhood and date, headline, streak; the goal). The coach paragraph is gone; `hintLine` gives one short sentence at the bottom, only while planning ("Tap Open to run your first night."), and the pass explains service itself.
- The welcome card is gone. The milestone card stays on wide screens only.
- Camera: one button on a phone that opens zoom, rotate, reset and neighborhood; the full column on wider screens.
- The dock is one row on a phone (four icon tabs and a large Open button). The Test Kitchen moved into the Ledger panel on a phone and stays beside Open on wider screens.
- The weather and event text in the status line are wide-screen only; "Saved on Reddit" stays.
- Toasts are lifted above the dock (`offset` and `mobileOffset` in the Toaster).
- Panels, the placement bar and the scene use new offsets for the one-row dock; a wrapped dock (the plain browser game during service) pushes panels up.

**Kept:** every accessible name the tests use ("Open restaurant" is now an `aria-label` over the visible word "Open").

**Refused:** rewriting every panel's insides in this phase (the Build and Menu panels keep their contents; the sheet container comes first), a new component library.

**Tests:** 230 browser tests and 960 unit tests pass; six browser tests were updated for the new structure (camera toggle, the hint line instead of the coach paragraph, the Test Kitchen reached through the Ledger on a phone, the cash register as the stats anchor).

**Code or plan:** `docs/plan-v2.md` phase A; `tools/look-shot.mjs` takes the screenshots.

## 2026-11-19 — Scene pixel size is always 1; plan v2 written

**Why:** the author's desktop and phone screenshots showed the scene drawn in 3-pixel blocks ("too pixelated"), a crowded interface that did not read as a game, and no visible stakes. They asked for a fix (or a return to the non-pixel view if it could not be fixed) and for a new plan covering onboarding, visual craft, daily content, focus, end states, Journeys and the retention and engagement metrics.

**Decision:** `autoPixelSize` now returns 1 for every width (it was 1 on a phone, 2 on a tablet, 3 on a desktop). The per-weather 24-colour palette and the hard-edged interface keep the pixel identity; compared side by side at 1600 px (`tools/look-shot.mjs`), size 1 reads clearly and size 2 or 3 does not. `?k=2` and `?pixel=0` remain for comparison. The test that pinned sizes 2 and 3 now pins 1.

**Plan:** `docs/plan-v2.md`: six phases (a game-like screen, the first sixty seconds, a service screen with visible bills and stakes, a bigger headline pool and a first-week curve, one card with one next step, measurement), a timeline with a feature freeze on 5 December, and the risks. The stakes are designed to keep the earlier rule that a missed star never deletes a park: reputation, a visible bills line, a streak freeze, a daily board checked by the server's replay. Monetization metrics were considered and refused: payments stay off. The research was thin (vendor blogs, one Devvit page on an unofficial mirror); the plan says so.

**Not done yet:** none of phases A to F is built; they are the plan.

**Devvit pieces:** none turned on or off. **Code or plan:** `src/scene/pixel/pixel-settings.ts`, `src/test/pixel-settings.test.ts`, `tools/look-shot.mjs`, `docs/plan-v2.md`.

## 2026-11-19 — Repository renamed to flip-and-fry; listing text no longer leads with Reddit

**Why:** the author asked that the GitHub repository carry the same name as the game and the app (`too-many-cooks` was taken on Reddit, see the earlier entry), and that the store description sell the game itself, not the platform it happens to run on.

**What:** the GitHub repository is now `hatif03/flip-and-fry` (GitHub redirects the old address; the local folder and the `pre-devvit` tag are unchanged, and the local `origin` points at the new address). The listing description in `docs/listing.md` no longer says "in a Reddit post", and the policy pages link to the new address and name the author's Reddit account for contact. The privacy policy still says Reddit where it is describing where data lives, because that is true.

**Refused:** rewriting history entries that mention the old name; they record what was true then. No new Devvit permission.

**Code or plan:** `docs/listing.md`, `docs/privacy.md`, `docs/terms.md`.

## 2026-11-19 — Listing for the developer portal, privacy and terms, provenance answered

**Why:** the author sent the developer-portal screens (Developer Settings, In-app catalog) and asked exactly what to do while staying unpublished, as the organisers prefer. Filling the listing fields does not publish the app; they were blank.

**What:** `docs/listing.md` holds the value for every field (display name, 15 to 200 character description, terms and privacy URLs, NSFW off, category, tile tagline, featuring description). `docs/listing/` holds the images, composed from this game's own screenshots and icon by `tools/art/catalog-images.mjs` (tile 560 by 256, fallback 1500 by 1000, the 1024 icon) and a 12 second placeholder MP4 from `tools/art/catalog-video.mjs` (ffmpeg-static, already a dev dependency); every file is under the portal's 800 KB limit. `docs/privacy.md` and `docs/terms.md` say only what the code does (Redis only, no outside requests, user actions only on a button press, TTLs as in the code); they link from GitHub, so the repository must be public and pushed. Provenance: the author states the props, audio and original icon were made by them with free, partly AI-assisted tools; recorded as the author's statement in `docs/assets-provenance.md` and the README credits (no tool names were given, none invented).

**Refused:** `devvit publish`; an invented list of tool names; a video made to look like real gameplay (the placeholder is stills and is labelled as such).

**Devvit pieces:** none added; no new permission. **Third party:** none new.

**Code or plan:** `docs/listing.md`, `docs/privacy.md`, `docs/terms.md`, `tools/art/catalog-*.mjs`.

## 2026-11-19 — Documentation for the whole project

**Why:** the author asked for documentation that covers everything: how the game was built from the ground up, every design and engineering decision and why, how problems were solved, and how Reddit and Devvit are used.

**What:** `docs/README.md` is the index. New: `how-it-was-built.md` (the story in twelve steps, with a problems-and-solutions table), `architecture.md` (the pure-engine idea, layers, the life of a night, Redis keys, routes, rendering, hosted service), `design-decisions.md` (game, look and sound, Reddit, engineering and process decisions, each with what was refused), `devvit-and-reddit.md` (every capability used, the limits, what is unconfirmed on a device and how it fails), `testing.md`, and `plan-status.md` (the hackathon plan section by section against what exists). The README links to all of it. `submission.md`'s checklist was rewritten into what only the author can do (including how to test hosted service with two Reddit accounts), and `assets-provenance.md` records what the files' metadata does and does not say.

**Note on this log:** entries are history. Early entries describe intentions that later changed (for example the 18 November note that the pass would mount `KitchenEngine` per ticket; it became a deterministic timing bar with optional hold-to-prep, see the 19 November entry). The documents above describe the final state.

**Code or plan:** `docs/*`, `README.md`.

## 2026-11-19 — Hosted service: a neighbor helps at your pass (lockstep over realtime)

**The author's question:** can two phones be provided, or can I configure it myself? Everything that can be proven without phones is built and tested here with two simulated devices, a pretend network and the real server rules; what remains for real hardware is the latency feel and Reddit's realtime delivery (see the checklist). To try it for real you need **two Reddit accounts**, for example the owner account on a phone and a second account on a laptop or another phone, both in the demo subreddit.

**Design (plan section 12, built as written).** Each device runs the same deterministic engine; only actions cross the wire.
1. **Two pairs of hands.** The pass used to allow one dish at a time. State now holds `hands` (a list of up to two), each with `by` 0 (the owner) or 1 (a neighbor), and the pass actions carry an optional `by`. A solo log is unchanged (no `by` field), so every calibrated night, bot and golden receipt is as before. Each person cooks one dish at a time, cannot touch the other's dish, and a forged action for hands that are not there is ignored by the replay.
2. **Stamped inputs** (`src/management/coop.ts`, transport-free). In a hosted service a tap becomes an action that the **host** stamps 15 ticks (1.5 s) ahead of its own clock and announces; every device applies it on that tick, before that tick's step. The helper's tap goes to the host first. The host's own taps take the same path, so the host sees the same 1.5 s delay while sharing a night. The host's log of stamped actions is exactly what the server replays at the lock, helper actions included.
3. **Staying in step.** Every 5 seconds the host publishes a checksum of its state; the helper compares it with its own at that tick. A mismatch (a message that arrived too late) makes the helper start over from a fresh snapshot and the committed log, and say so. A helper that joins late takes the opening snapshot, the committed log and the host's last tick, then runs on to the present at the next checksum.
4. **The server relays and checks, and simulates nothing** (`src/server/core/coop.ts`). It keeps the opening snapshot and the committed actions for late joiners, allows **one helper a night**, accepts a helper's request only from that helper and only if it is a pass action (never a planning change), drops any tick the helper claims (the host decides), accepts commits and checksums only from the host, caps the log at 140 actions, rate limits everything, and treats a host silent for 60 seconds as gone. Realtime channel `coop_<hostId>` (no colon, as required); messages are a few per minute.
5. **Pause and speed are locked** while hosted, because one side pausing would let the other run on without it. A helper waits ("The host is away") if no checksum arrives for 20 seconds.

**Screens.** Ledger, "Cook together": a switch to invite a neighbor (takes effect when you open the doors), and the kitchens open for help with a **Help** button. While helping, a banner says so and has **Leave**; the restaurant on screen is the host's and none of it is saved or locked as the helper's (`Session.beginGuest`), and Leave reloads their own park.

**Tested:** the lockstep core with two engines and a pretend network (latency, lag, out-of-order messages, a deliberately late message caught by the checksum, late joining), the server rules (who may say what), and a whole hosted night end to end through the real server: both people cook, and the server's lock of the host's log gives the host's hash. 40-odd new tests; the cross-engine hash test still passes.

**Honest limits:** a helper whose connection is slower than about a second behind the host will drift and resync; nothing here measures real realtime latency (spike S7). The helper's score does not count (they get no stars); only the host's night is locked. There is one helper, not two.

**Code:** `src/management/{coop,CoopPanel,engine,types,actions,replay,Pass}`, `src/server/core/coop.ts`, `src/server/routes/api.ts`, `src/client/{coop,coop-controls,session,game}`; tests `coop.test.ts`, `coop-hands.test.ts`, `coop-server.test.ts`, `coop-client.test.ts`, `coop-panel.browser.test.tsx`.

## 2026-11-19 — Hands-on cooking inside the night: prep by hand (the author's approval used, and not needed)

**The author's question:** "I can approve whatever is needed, just tell me how to." The hands-on kitchen inside the night would normally mean letting the browser report a result ("I cooked it perfectly") and having the server accept it within bounds. That is the trade the author offered to approve.

**What I built instead, and why it is better.** I made the hands-on part **send inputs, not results**, so nothing needs to be trusted and nothing needs approving. While cooking a ticket the owner can **hold a Prep button** (chopping, trimming, seasoning) and let go when the bar sits in the green. Only two things are sent, a `hold` and a `release`, each stamped with the tick it happened on. The engine counts the held simulated seconds and judges them against the dish's ideal (`idealPrep`: 40% of its cooking time, at least two seconds): within a fifth of it is a clean prep, within half is decent, otherwise rough. The plate's quality then combines prep and cooking (`plateQuality`): a clean prep forgives a slightly late plate, a rough one costs the perfect plate, and a dish never prepped by hand is judged on cooking alone, so every calibrated night and every bot is exactly as before. Because the result is a pure function of tick-stamped inputs, the server's replay lands on the same night as the phone (tested), and a forged `hold` or `release` is simply ignored (counted in `rejected`, no effect on the receipt).

**Why not the 3D station.** The Test Kitchen's `KitchenEngine` station is a separate 3D game with its own simulation, so using it inside the night would need either a second WebGL scene on top of the restaurant (heavy on a phone, and the restaurant's own loop would have to be kept running underneath) or trusting a reported quality. The hold-and-release prep is hands-on, touch-friendly (a 44 px button, also Space or Enter), optional, and keeps the one property the port is built on. If the author still wants the 3D station inside the night, the cost is a server rule accepting a reported quality inside bounds; that is the approval they offered, and it is not needed for this.

**Limits:** `MAX_SERVICE_ACTIONS` rose from 80 to 140 (a prepped dish is four actions: claim, hold, release, plate). The pass shows the prep meter with its green window and says how the prep went. State gained `hands` (the dish in the owner's hands and its prep), so the golden replay hashes were refreshed once more.

**Code:** `src/management/{types,engine,actions,replay,Pass,RedditLayer}.ts(x)`; tests in `prep.test.ts` (11) and `pass.browser.test.tsx`.

## 2026-11-19 — The icon is redrawn, and the animals get portraits (drawn pixel art, no asset files)

**What "hand-drawn" meant and what I did about it.** The plan's UI kit calls for drawn pixel art (icon, portraits) approved by the author before it ships. The earlier icon was a mechanical reduction of a photo-like image, which left stray specks. The author asked me to just do it, so the art is now drawn deliberately, as code that places pixels, which is how it can be reviewed, changed and reproduced:
- **App icon** (`tools/art/draw-icon.mjs` writes `public/icon-pixel.png`, 1024 px, 6 KB): a chef hat built from three puffs and a band, lit from the upper left with shade only on the lower-right edges, and a flame drawn row by row beneath it, on the game's teal with one-pixel ink outlines. The old reduction script is deleted.
- **Species portraits** (`src/management/portraits.ts`): mouse, rabbit, bear and crocodile as 16 by 16 pixel faces built from ears, head, muzzle, eyes and a shaded edge, returned as SVG data URIs (so no files to ship). They sit beside each regular's name in the ledger. `tools/art/portraits-sheet.ts` writes a contact sheet to look at them.
- Not drawn: 9-slice frames from art (the interface frames are done in CSS: square corners, hard 3 px edges, hard shadows), and a thought-bubble sprite (the bubbles are CSS too). Those read as pixel art without image files.

**Why code and not an image editor:** nothing to host, nothing whose origin needs explaining (the provenance gap is only for the earlier AI-made files), tiny size, and the pictures stay in the game's palette by construction.

**Note:** `tools/art/portraits-sheet.ts` is run with `npx vite-node`, which `npx` fetched on first use. It is an authoring helper, not part of the game or its dependencies.

**Code:** `tools/art/`, `public/icon-pixel.png`, `src/management/portraits.ts`, `Panels.tsx`; test `portraits.test.ts`.

## 2026-11-19 — Push reminders, the game badge, a picture on kitchen posts, and real avatars (all with fallbacks)

**Why:** the three remaining Reddit features from plan section 3 (push notifications, media upload, snoovatars). The author asked for them to be completed. Each one is built so that Reddit saying "no" (a gated beta, an unapproved permission, a blocked image host) changes nothing the player sees except that the extra is missing. None of them can be proven from here; each is tested against a fake of the Reddit call, and the live behaviour is on the phone-check list.

**Push reminders (`src/server/core/notify.ts`).**
- A switch in the Ledger ("Remind me about my streak") asks Reddit to opt the player in or out (`notifications.optInCurrentUser`). Its own action, off by default, with a one-line explanation.
- A scheduler job `streak-reminders` (17:00) enqueues one notification, once a day, to opted-in players who have a streak and have not played today, linking to today's post ("Keep your {{days}}-day streak going"). The day's claim is taken first (so the job and a manual run cannot both send) and released if Reddit fails. At most 1000 recipients per call, the platform limit. No message ever goes to someone who did not opt in.
- **Game badge:** when the daily post is made, the app asks Reddit to show the game badge linking to it until the end of the UTC day (`requestShowGameBadge`), best effort like the highlight.

**A picture on a kitchen post (`media.ts`, `kitchen-card.ts`).** "Post my kitchen" now draws a 512 by 256 card in the game's colours (name, style, reputation stars, a pixel face) on a canvas and sends it as a PNG data URI. The server accepts it only if it is a genuine PNG under 300 KB, uploads it with `media.upload` (`permissions.media` is now `true`) and attaches the hosted URL to the post's user-generated content. If the picture is missing, invalid, or Reddit refuses the upload, the post is made without it. Assumption to confirm on Reddit: that `media.upload` accepts a data URI as its fetchable URL.

**Real avatars (`avatar.ts`, `NeighborAvatar.tsx`).** A neighbor's tag shows their pixel face at once and swaps in their Reddit avatar if Reddit has one and the image actually loads in the webview (a load error keeps the pixel face). The server looks a name up once a day and caches the answer, only for names that pass the Reddit-name check, and only passes on URLs on Reddit's own image hosts (`redd.it`, `redditmedia.com`, `redditstatic.com`), so a lookup can never point the page elsewhere.

**Refused:** notifying anyone who has not opted in, a reminder more than once a day, and a comment image (comments do not take one; the picture goes on the kitchen post, which does).

**Code:** `src/server/core/{notify,media,avatar}.ts`, `src/server/reddit.ts`, `src/server/routes/{api,scheduler}.ts`, `devvit.json` (`media`, the `streak-reminders` task), `src/management/{kitchen-card,NeighborAvatar,Reminder}.ts(x)`; tests in `reddit-extras.test.ts` (16) and `reddit-extras.browser.test.tsx`.

## 2026-11-19 — Models and audio compressed, MIT licence, provenance evidence

**Compression (author approved installing the tools).** Dev dependencies added: `@gltf-transform/cli`, `core`, `functions`, `extensions`, `sharp`, `meshoptimizer` and `ffmpeg-static`. None is in the Reddit build. `tools/compress-models.mjs` and `tools/compress-audio.mjs` turn the originals (kept in `tools/source/`, not shipped) into the files in `public/assets/`: the nine models went from 4343 KB to 731 KB (the largest from 608 KB to 101 KB) and the audio from 808 KB to 347 KB. Textures are cut to 256 px because the pixel look hides the detail; geometry is quantized and meshopt-compressed, and the decoder is bundled with three and drei, so no decoder is fetched. The perf budgets in `scripts/perf-check.mjs` were tightened to match. Checked with the real-model scene test, the pixel pass tests and a phone screenshot. Details: `docs/perf-log.md`.

**Licence.** The code is under the MIT licence (`LICENSE`, and `package.json` now says `MIT`, replacing the template's `BSD-3-Clause`). Chosen because it is short, permissive and the usual choice for a hackathon game. The README says the grant covers the code, and that the props, audio and icon are covered by the provenance notes, not the MIT grant.

**Provenance evidence.** The files' own metadata was inspected: the GLBs carry only `generator: glTF-Transform v4.4.0` (they were post-processed, so the original tool is not recorded), the MP3s carry only an ffmpeg (`Lavf60`) encoder tag, and the icon PNG has no text chunks. Git shows the files first entered the repository in commits `b454cef` and `3a84ec0` on 16 November. So the origin cannot be recovered from the files; `docs/assets-provenance.md` states exactly that and asks the author for one sentence of confirmation.

**Demo subreddit.** `devvit list installs` shows `r/flip_and_fry_dev` already has the Devvit Admin Helper App installed alongside Flip and Fry, so `dr-admin-approve` does not need installing. (Installing it again is refused: "You do not have permission to install this app version".)

**Code:** `tools/compress-models.mjs`, `tools/compress-audio.mjs`, `tools/source/`, `public/assets/`, `scripts/perf-check.mjs`, `LICENSE`, `package.json`, `README.md`, `docs/perf-log.md`.

## 2026-11-19 — Award stamps, and what stays open from section 7 and section 12

**Added:** each of the seven end-of-night awards has its own small stamp icon beside the banner (`AwardStamp` in `RedditLayer.tsx`), so the banner reads at a glance. Drawn art for stamps and portraits is still the preview-first step with the author.

**Decision: the pass keeps its deterministic timing bar, and the hands-on station is not wired into it (plan 7.1).** The plan's "ticket mode" would open a reduced `KitchenEngine` station for one dish and report `{seconds, quality, burnt}` back, which the server could only bound, not replay. The bar I built instead computes quality in the engine from simulated time, so the server's replay is the whole truth and a client cannot claim a perfect plate. That is the property the port is built around, so I kept it. The hands-on kitchen lives on as the Test Kitchen (7.2), which is unranked on purpose and feeds the restaurant only through the small, bounded research bonus. If the author wants the station inside the night anyway, the cost is a server rule that accepts a reported quality within bounds; I would want that decision from them, not make it here.

**Still not built, for the author to decide:** the hosted co-op (plan 7.3 and 12). It needs two things first: a hands id on the owner's cook (today one pair of hands cooks at a time), and a stamped-input protocol that can only be tested for real on two phones. The realtime channel it would use is already on (visit heads-ups). Of the Reddit features in section 3, the ones not yet used are push notifications (a gated beta the author applies for), media upload (spike S8, needs a device and a published permission check), and the snoovatar image (spike S3; the pixel face stands in).

**Code:** `src/management/RedditLayer.tsx`; test in `reddit-layer.browser.test.tsx`.

## 2026-11-19 — The Test Kitchen's share button becomes the Reddit comment flow

**Why:** plan section 7.2: "the old share button is replaced by the Reddit comment flow (canned text, explicit button)". The old one built an image card and called the browser's share sheet, which is not what a Reddit game should offer.

**What it does on Reddit:** the results screen shows **Post to the thread**. It opens a confirm panel with the exact line ("Test Kitchen · Golden Hour · solo · best 300 points · 2 stars") and "This posts as you, under today's results comment", then **Post as me**. Rules, the same as the restaurant's result: its own button, once a day, claimed before the Reddit call and released if Reddit fails, separate from the restaurant's comment, and never required for anything.

**Where the text comes from:** the server builds it from the **saved best** for that shift and mode (`arcadeComment`, shared with the client's tests), never from a number the browser sends. The arcade cannot be replayed, but this way a forged request cannot make the app post a score the player never saved. A request for a shift that does not exist or has no saved score is refused.

**Outside Reddit** the original image share is unchanged.

**Code:** `src/game/arcade-comment.ts`, `src/server/core/social.ts` (`arcadePreview`, `postArcadeResult`), `src/server/routes/api.ts`, `src/client/arcade-sync.ts` (`arcadeHttp`), `src/arcade/ArcadeShare.tsx`, `src/components/KitchenUI.tsx` (a `share` slot); tests in `arcade-comment.test.ts` and `arcade-share.browser.test.tsx`.

## 2026-11-19 — The Test Kitchen feeds the restaurant: a research bonus, and today's shift

**Why:** plan section 7.2. The hands-on kitchen and the tycoon should reward each other, and the Test Kitchen needs a reason to open it today.

**Research bonus.** A newly earned star in the Test Kitchen is worth 5 research points, at most 10 a day, once per UTC day. The server counts stars from the saved bests (`totalStars`, the arcade's own thresholds), so only a score that earns a **new** star pays, and a lower or repeated score never does. The points wait in Redis (`arcade-pending:{uid}`) and go into the park **at the player's next Open**, inside the same save that opens the night. That choice matters: changing the park from outside would bump its revision and make the client's next save look like another tab; applying it at Open keeps one writer. The snapshot the server replays already contains the points, so the night is verifiable, and if the Open fails the bonus is kept for the next one. The client tells the player with a toast ("The Test Kitchen earned +5 research").

**Bounded trust:** the arcade is not replayed on the server, so the bonus is small by design (at most 10 a day, and at most 18 stars' worth in a lifetime), and it never touches cash, stars, the leaderboard or the streak.

**Today's shift.** The menu has a "Today's shift" button: the date picks one of the three shifts, so everyone is offered the same one, and it is never one the player has not unlocked. One tap starts it, solo. It is a shared suggestion, not a ranking.

**Changed from the plan:** the plan said stars also "unlock staff cloth colors". The cloth is already unlocked by the research meter (see the research entry), so the stars feed that meter instead of a second unlock path.

**Code:** `src/game/arcade-save.ts` (`totalStars`), `src/server/core/arcade.ts` (`pendingBonus`, `spendBonus`), `game.ts` (`openService`), `src/client/arcade-sync.ts`, `src/arcade/{daily-shift,DailyShiftCard,TestKitchen}`; tests in `arcade-bonus.test.ts`, `arcade-sync.test.ts` and `test-kitchen.browser.test.tsx`.

## 2026-11-19 — The tomorrow card, and the submission package text

**Why:** plan section 10 (a tomorrow card with tomorrow's headline and the next research unlock gives a reason to come back) and section 16 (the Devpost text, the demo shot list and the hand-over list).

**What changed:**
- The result card now ends with a **Tomorrow** line: the date and headline, and the next study the research budget will open with its progress ("Next unlock: Stock pot (60/100)"). Once everything is open, the unlock part is left out. It uses only the replayed park and the date, so it is as trustworthy as the receipt.
- `docs/submission.md` holds the Devpost description (with the required port statement and the list of significant updates), the under-one-minute video shot list, and a checklist of what only the author can do: the demo subreddit and `dr-admin-approve`, moderator rights for flair and highlight, the phone-only checks, the license, asset provenance, the survey and the optional notification beta.

**Refused:** writing marketing claims that the build does not back. Every feature in the description is in the code and has a test; the hosted co-op, which is not built, is not mentioned.

**Code:** `src/management/RedditLayer.tsx` (`nextUnlock`), `docs/submission.md`; tests in `reddit-layer.browser.test.tsx`.

## 2026-11-19 — Verification pass and the first optimization pass (G11, part of G12)

**Why:** plan sections 19 and 20. Everything planned for the core loop is built, so the whole loop is now tested end to end, and the optimization that needs no new tools is done and measured.

**Verification added:**
- `full-loop.browser.test.tsx`: the whole night through the real screens on a phone-sized viewport, with the real server rules on a fake Redis and a fake Reddit: today's bar, a planning change saved by the server, the real Open button, the pass appearing, a cook at the pass during the night, the result card from the server's replay, posting the result (with the exact text shown first), flair, follow, and leaving the door open from the ledger.
- `judging-week.test.ts`: 9 to 16 December for three kinds of player through the real server rules: one daily post per day, a report for each finished day, streaks that count only verified days (and stay visible until a day passes with no star), no mixing of players, a service that crosses UTC midnight keeping its headline, and the whole week under a minute. A server replay of one night takes about 10 ms against a 300 ms budget.

**Optimization done** (details and numbers in `docs/perf-log.md`): Latin-only fonts, the 1.1 MB icon out of the bundle, the generated soundtrack, **quality tiers** (`src/scene/quality.ts`, `FrameWatch`; presentation only, so scores are identical on every tier) and `npm run perf:check`, a size guard with budgets for the splash, the initial and lazy JavaScript, models, audio and fonts.

**Waiting on the author, and recorded as such:** compressing the nine GLBs and the audio needs `gltf-transform`, an image library and `ffmpeg`, none of which are installed here; running them over the author's own files is the author's decision. Source maps (about 15 MB of the upload) are forced on by the Devvit Vite plugin. Draw-call, memory and throttled-CPU measurements need a device.

**Not done from the plan:** the hosted co-op (the engine needs a hands id on the owner's cook first), the ticket-mode station at the pass, the daily shift and the research bonus from Test Kitchen stars. They stay on the list.

**Code:** `src/scene/{quality,FrameWatch}.ts(x)`, `src/management/{CityWeather,RestaurantScene}.tsx`, `src/index.css`, `scripts/perf-check.mjs`, `docs/perf-log.md`; tests `quality.test.ts`, `full-loop.browser.test.tsx`, `judging-week.test.ts`.

## 2026-11-19 — Realtime turned on: a live heads-up when a neighbor visits

**Why:** plan sections 3 and 12 list realtime as a Reddit feature we use, and a visit to your kitchen is worth hearing about while you are in the game.

**Devvit capability on:** `permissions.realtime` is now `true`. It is used for one thing: when a neighbor visits a real kitchen, the server sends the bulletin note on that host's own channel (`visits_<hostId>`, no colon, as channel names require) and the host's open game shows it as a toast. Sample kitchens have no host and send nothing. The note is already on the bulletin by then, so a failed send changes nothing (it is caught and ignored), and the client ignores any message that is not a well-formed visit note.

**Limits kept in mind:** 100 messages a second per installation and 1 MB per message; a visit note is a few hundred bytes and visits are limited to three a day per player, so traffic is tiny.

**Known and accepted:** channel names are not secret, so anyone could listen on someone else's visit channel. All it carries is what the host's public bulletin line says (a visitor's Reddit name, how the visit went). Nothing private is sent on it.

**Not built, and why:** the hosted co-op from plan section 12 (several people at one pass, in lockstep). It needs the engine to support two sets of hands at once and a stamped-input protocol that can only be tested for real on two phones; a version built blind would risk the one thing the game must not lose, a verified score. It stays on the list with the engine change (a hands id on the owner's cook) as its first step.

**Code:** `src/server/core/doors.ts` (`VisitNotify`), `src/server/routes/api.ts`, `src/client/visits-live.ts`, `src/client/game.tsx`, `src/management/social.ts` (`visitChannel`), `devvit.json`; tests in `src/test/visits-live.test.ts`.

## 2026-11-19 — Neighbors get a pixel face (the snoovatar fallback)

**Why:** plan section 12 (snoovatar spike S3). A neighbor from the thread should look like a person, not a label.

**Decision:** ship the fallback first. `src/management/pixel-face.ts` draws a mirrored 5 by 5 pixel face from the neighbor's name, in one of the game's colours, as an SVG data URI, so it needs no network and cannot be blocked by the webview's content rules. It appears beside a visiting neighbor's thought bubble and next to the host's name in the neighborhood list.

**Spike S3 is not run:** whether an image from Reddit's CDN (`reddit.getSnoovatarUrl`) loads inside the webview can only be tried on a phone. When it is, a real avatar can replace the face in the same two places, with the face as the fallback if the image fails. Nothing else depends on it, and no avatar is requested until then.

**Code:** `src/management/pixel-face.ts`, `GuestSatisfactionBar.tsx`, `RestaurantLabels.tsx`, `Neighborhood.tsx`; tests in `src/test/pixel-face.test.ts`.

## 2026-11-19 — The inline card and the app icon

**Why:** plan sections 11 and 13.6. The feed card is the first thing anyone sees, and the listing needs a square icon under 500 KB.

**What changed:**
- **The splash now tells today's story from the post itself.** `src/client/splash-text.ts` builds the eyebrow (date), the headline title and its blurb from the post's own data (`context.postData`), so the card needs no server call and nothing to load. The daily post's data gained the `blurb` (still well under 400 bytes of the 2 KB limit; a test checks all seven weekdays). A kitchen post shows the kitchen's name and "stop by as a guest". Missing or odd data falls back to the plain card, and every value is set as text. The old placeholder round trip to `/api/init` is gone. The card has the pixel icon, the pixel typeface (a Latin-only Pixelify Sans face, about 8 KB), square edges and the same hard-shadow button as the game.
- **The icon** (`public/icon-pixel.png`, 1024 px, 8 KB) is the existing chef-hat icon reduced to a 64 by 64 grid in the game's own colours (`tools/make-icon.mjs`), and is set as `marketingAssets.icon` in `devvit.json`. The original is 1.1 MB, over the 500 KB limit, so it moved out of `public/` (it was being shipped to every player) to `tools/source/icon-original.png`.

**For the author to look at:** the pixel icon is a mechanical reduction, so a few specks of shading remain on the hat; redrawing it by hand with Codixel is the preview-first step the plan calls for, and `tools/make-icon.mjs` is the placeholder until then. The original icon's origin is listed as "to confirm" in `docs/assets-provenance.md`.

**Needs Reddit to confirm:** that `context.postData` is populated in the inline entry (the code falls back cleanly if not), and the card on a real feed.

**Code:** `src/client/{splash.html,splash.css,splash.ts,splash-text.ts}`, `src/server/core/daily-post.ts`, `devvit.json`, `tools/make-icon.mjs`; tests in `src/test/splash-text.test.ts`.

## 2026-11-19 — The pixel look reaches the interface (first part of the UI kit)

**Why:** plan section 13.5. The 3D scene was pixelated and the cards, buttons and headings around it were soft and rounded, which read as two different games.

**What changed:**
- A `pixel-ui` class on the page (set at startup from the same switch as the scene; `?pixel=0` turns both off, `?ui=0` turns off only the interface so the two can be compared) restyles every card, button and heading from one stylesheet block: square corners, hard 3 px ink edges, hard offset shadows, no blur. The five brand colours are unchanged.
- **Font:** headings and numbers use **Pixelify Sans** (`@fontsource/pixelify-sans`, SIL OFL), body text stays Nunito so it is readable at phone sizes. I tried Silkscreen first (also OFL) and dropped it: its glyphs are too wide for a 360 px header and the cash and reputation row overflowed. Pixelify draws a 5 that reads as an S at small sizes, so the digit 5 alone comes from Fredoka (a one-character `unicode-range` face), which keeps ratings and prices readable.
- Layout fixes found while looking at phone screenshots: the weather and save line no longer sits over an open panel on a phone; the footer buttons no longer wrap ("Kitchen" and "Open restaurant" on one line each, the day number only when there is room).

**Not done yet from 13.5:** 9-slice frames from drawn art, hand-drawn icons, thought-bubble art, award stamps and species portraits. Those need the preview-first step with the author; this is the part that can be judged from a screenshot, so it ships first. `tools/ui-shot.mjs` takes the phone screenshots (planning, menu, ledger, service) used to review it.

**Code:** `src/index.css` (the `pixel-ui` block), `src/scene/pixel/pixel-settings.ts` (`pixelUi`, `applyPixelUi`), `src/main.tsx`, `src/management/ManagementGame.tsx`, `tools/ui-shot.mjs`; test in `pixel-settings.test.ts`.

## 2026-11-19 — The soundtrack is generated, and the rain layer rides the same switch

**Why:** plan section 14 and spike S9. The old soundtrack was a 720 KB MP3 of unknown origin (see `docs/assets-provenance.md`), and a single track cannot follow the weather. A bed made with the Web Audio API has no file, no provenance question, and can react.

**What it is** (`src/audio/score.ts`, `src/audio/mixer.ts`):
- A four-bar loop in F at 76 beats a minute: a pad of warm seventh chords, a slow bass, and a small pluck pattern on top, written as data (`notesAt(step, service)`), so it is tested without any audio. During service a very soft tick runs under it.
- **Rain** is a looped, filtered noise bed. When the weather is rain (from the headline on Reddit) it comes in and the music steps back to 60%, so the weather is heard without a second track.
- **Mute rules** (all through one master gain, so nothing can be left playing): nothing is created or played before the player's first tap or key press; the one existing "Rooftop soundtrack" switch turns both layers off; pausing the service is silent; hiding the tab suspends the audio context and stops scheduling, and showing it again resumes. Notes are scheduled a third of a second ahead from the audio clock, never from timers, and the noise is a fixed pattern rather than `Math.random`, so a room sounds the same each time.
- It replaces the `<audio>` element that played `music.mp3` in the restaurant view. The Test Kitchen's own audio (`src/game/audio.ts`) is unchanged for now, so the MP3s stay in `public/` until the optimization pass decides what to do with them.

**Refused:** a second set of controls (the existing switch is enough), and per-weather tracks (a bed that follows the weather is cheaper and simpler than three loops).

**Needs a phone to confirm:** that the tone is pleasant at phone speaker volume and that audio resumes after the app returns from the background in the Reddit apps. The mute-on-hide logic is tested; the listening is not.

**Code:** `src/audio/`, `src/management/ManagementGame.tsx`; tests in `src/test/audio.test.ts` (19, with a fake audio context).

## 2026-11-19 — The README, asset provenance and Devvit feedback notes

**Why:** the rules require a README in the repository root, and the plan asks for provenance and feedback notes to be kept as they happen, not reconstructed at the end.

**What:** `README.md` is replaced with the Reddit game's README (how to play in five lines, the headline table, what is on Reddit, what moderators do, controls, accessibility, the port statement with a list of what was significantly updated, how it works, how to develop, credits). The old browser README (321 lines) is in git history under the `pre-devvit` tag. `docs/assets-provenance.md` lists every file in `public/assets/` with what is recorded about it and what only the author can confirm. `docs/devvit-feedback.md` has eleven things we hit, each with what happened, what we did and what would help.

**Decisions:**
- The README says "no license has been chosen". Choosing one is the author's decision; the plan notes that a public repository is optional, and this is flagged in the hand-over so it is decided before the repository goes public.
- The 3D props and audio are described as AI-generated by the original project's author, which is what the old README said. Tool and terms are listed as "to confirm", because claiming more than the repository records would be inventing provenance.
- The README only describes what exists. Hosted co-op, the pixel UI kit and the generated audio beds are not mentioned; they are added when they ship.

**Code:** `README.md`, `docs/assets-provenance.md`, `docs/devvit-feedback.md`.

## 2026-11-19 — "Post my kitchen": a user-generated custom post of an open kitchen

**Why:** plan section 8 (kitchen posts) and the user-generated-content Reddit feature. A kitchen post is how an open door travels outside the daily thread.

**What it does:** with the door open, an explicit button in the Neighborhood panel ("Post my kitchen", with the line "This posts as you, in this community") creates a custom post as the player (`runAs: 'USER'`, `userGeneratedContent`, so `SUBMIT_POST` is added to the `asUser` list). The post's data holds only `{kind: 'kitchen', door, title, date}`. Anyone who opens that post sees a card with the kitchen, its host and a single "Stop by and order the …" button, which is the same visit as everywhere else. If the door has since been closed, the card is simply absent and the post is an ordinary daily view.

**Rules:** one post a day per player, claimed before the Reddit call so two taps make one post, released if Reddit fails; refused when the door is not open; a post can only point at a player's door id, never at a sample or a path. `GET /api/today` reads the post's data (one extra call, never fatal) to know which kitchen to offer.

**Until approval:** posts made as the user run as the app account for everyone except the app's owner, as with comments. The demo uses the owner's account; the README will say so.

**Refused:** posting automatically when the door opens, and putting the host's username in the post data (the post text names the host once, as allowed by the same safe-name rule as visitors).

**Code:** `src/server/core/kitchen-post.ts`, `src/server/reddit.ts` (`kitchenPostApi`), `src/management/{KitchenPostCard,Neighborhood}.tsx`, `devvit.json`; tests in `kitchen-post.test.ts` and `neighborhood-panel.browser.test.tsx`.

## 2026-11-19 — Open doors, sample kitchens and the bulletin

**Why:** plan section 8. The neighborhood is where this stops being a solo tycoon: a kitchen you leave open is a place someone else can walk into, and a note on your bulletin is a reason to come back tomorrow. Every part of it has a designed empty state, because on day one nobody else is here.

**What it is, and what it changed from the plan:**
- **Leave the door open** (ledger, Neighborhood, its own switch, off by default; also off when a moderator turns the `openDoors` setting off). Needs a closed night today. The server stores the kitchen as it stands (closed-doors state, 7 days) and lists it for neighbors.
- **Visit** is one service played in that kitchen with the visitor as a guest, ordering their own dearest dish. The plan had the visitor playing the pass with their own action log. I built it as a server replay with the visitor as a guest instead: it is the same machinery as presence diners, it is exactly as verifiable as a lock, it needs no second "visiting" mode in the client engine (which would have displaced the player's own restaurant on screen), and a visit takes one tap. The visitor sees how it went in plain words; the host gets a note.
- **Rules that keep it fair and quiet:** one visit to a given kitchen per day, three a day in all; a visit never touches the host's saved restaurant, cash, stars or streak (it runs on a copy); the visitor's name must be a safe Reddit name; a damaged or missing door is simply skipped.
- **Sample kitchens:** four ship in the code (Basil's Garden, Smoke and Fire, The Noodle Cart, The Quiet Corner), built from the same planning actions a player takes, checked to be openable in tests, always labelled "Sample kitchen", never presented as players. A visit to a sample leaves no note.
- **The bulletin:** each real visit adds a canned line to the host's bulletin (visitor name, how the visit went, the kitchen card's weakest point in words). The last 20 are kept for 30 days, the last 10 are shown. Nothing a player types ever reaches it.
- **Neighbors on the result card:** nights with presence diners now say how each neighbor's visit went ("bob was served in 12s and left a $3 tip"), from a per-night record the engine keeps (`night.visitors`), so the host and the visitor read the same facts.

**Devvit:** Redis only (`door:{uid}`, `doors`, `bulletin:{uid}`, `visited:{date}`), the `openDoors` subreddit setting. Nothing new to approve. The realtime "a neighbor is visiting" toast is still to do with the hosted co-op step.

**Also fixed:** the fake Redis used in tests now honours negative rank ranges (`zRange(key, 0, -21)`) the way Redis does. The old fake treated any negative end as "to the end", which hid a trimming bug until the bulletin test caught it.

**Code:** `src/server/core/{doors,samples}.ts`, `src/server/routes/api.ts`, `src/client/session.ts`, `src/management/{Neighborhood,Panels,RedditLayer,social,engine,types}.tsx/ts`; tests in `doors.test.ts`, `session-neighborhood.test.ts`, `neighborhood-panel.browser.test.tsx`, additions to `presence.test.ts` and `reddit-layer.browser.test.tsx`.

## 2026-11-19 — Neighbors from the thread come over (presence diners)

**Why:** plan section 8. A person with the post open is the best source of a "crowd" this game can have, and it makes opening the doors feel like it happens in a place with other people in it.

**How it works:**
- A tab that is visible sends `POST /api/presence` every 20 seconds with one thing besides who it is: the dish it would order (its own most expensive menu item). The server keeps a sorted set by time (`presence`) and a small hash of names and dishes (`presence:info`), both expiring after two days; a heartbeat counts for 60 seconds.
- When a kitchen **opens**, the server takes the three most recent visitors other than the host and writes them into the opening snapshot (`visitors`). The snapshot is what the server replays at lock, and what the client plays, so the night is identical everywhere and the lock stays verifiable. The park (the saved restaurant) never holds visitors, and the engine clears them at closing.
- In the room, visitors take the 2nd, 6th and 10th arrival (the regulars keep the 3rd, 7th, 11th and 15th). They order their dish at the menu price, never turn away at the door, pay and tip like anyone, and their bubble reads "name, from the thread". If their dish is not on the menu they look in and move on: the event line says so, and nobody is counted as missed because of them. The slots use no random draw, so a night with no visitors is exactly as before.

**Privacy and safety:** only the Reddit display name Reddit gave the visitor (letters, numbers, `_` and `-`, up to 20) and a dish id are stored or shown. A name that fails that check just means that person is not offered as a visitor. The snapshot schema refuses anything else, so a forged name cannot reach the room. Names never appear in the journey events or the night report.

**Refused:** letting a client name its own visitors (they come only from the server's registry), and showing a player's visit to the host in realtime for now (a "neighbor visits" toast waits for the realtime step).

**Also in this change:** the long-standing lint errors in `city-motion.ts` (false positives from a chained `(d -= w) < arc` test) are silenced with a reason, so `npm run lint` is clean for the first time.

**Code:** `src/server/core/presence.ts`, `src/client/presence.ts`, `game.ts` (open), `types.ts` (`visitors`, `VISITOR_NAME`), `engine.ts` (`arriveVisitor`), `satisfaction.ts`; tests in `src/test/presence.test.ts`. Golden hashes refreshed for the new field.

## 2026-11-19 — The street: neighborhood name, nightly report comment, highlighted post

**Why:** plan section 8 ("the thread is the street"). Players who play after the first hour of a day should still find something new in the post, and a moderator should be able to make the neighborhood theirs.

**Devvit pieces turned on:**
- **Subreddit settings** (`devvit.json` `settings.subreddit`): `neighborhood` (text, checked by `/internal/settings/validate-neighborhood` against the same letters, numbers, spaces and apostrophes rule as a restaurant name, 24 characters) and `openDoors` (a switch, on by default, read later by the open-doors feature). The checked name arrives in `GET /api/today` and is shown on the daily bar in front of the date. Nothing else reads free text from settings.
- **Scheduler** `night-report` at 00:20: the app comments on the previous day's post (as the app account, `runAs: 'APP'`). The first request of a new day posts it too if the job has not (the cron's timezone is undocumented, same reasoning as the daily roll). A claim in Redis (`report:{date}`, expiring after 45 days) makes the two paths safe to race, and a failed comment releases the claim.
- **Community highlight:** the daily post is highlighted when it is created (`post.highlight()`, best effort: a refusal never blocks the post), and a moderator menu item "Highlight today's post" does it by hand. The app needs moderator rights on the subreddit for this; it is on the list for the demo subreddit.

**What the report says** (`src/server/core/neighborhood.ts`): the number of kitchens that closed the night and the guests they served, how many were perfect nights and warm rooms, the most common award, and the best night by restaurant name and rating, then tomorrow's headline. All of it is counted from stored receipts. It names restaurants (an allowlisted string), never players, and a day with no kitchens says so plainly.

**Refused:** a moderator-written event override (a free choice of headline) for now. Headlines are a weekday rotation the bots are calibrated against; an arbitrary pick on a weekday could hand out an uncalibrated night.

**Needs Reddit to confirm:** that the validation endpoint's response shape (`{ success, error }`) is accepted by the settings form, and that `highlight()` works for the app account on the demo subreddit.

**Code:** `src/server/core/neighborhood.ts`, `src/server/routes/{settings,scheduler,menu,api}.ts`, `daily-post.ts`, `reddit.ts`, `devvit.json`; tests in `src/test/neighborhood.test.ts` and one added to `reddit-layer.browser.test.tsx`.

## 2026-11-19 — The Test Kitchen is mounted: three shifts, solo and couch co-op, touch controls, saved on Reddit

**Why:** plan section 7.2. The hands-on kitchen (`KitchenEngine`, its scenes and screens) had been built and never mounted. It is now reachable from the restaurant any time the doors are closed (a "Test Kitchen" button beside "Open restaurant"), and everything that was in the arcade ships: the three shifts, solo and two-chef play, the practice tutorial, the scorecard and the chef wardrobe.

**How it fits:**
- `src/arcade/TestKitchen.tsx` assembles the existing screens (home, briefing, HUD, results, toolbar) around `KitchenScene`. It replaces the rooftop view while open, so only one WebGL context is alive on a phone. It is a separate chunk (about 115 KB), loaded only when the button is pressed.
- **Touch controls** (`src/arcade/TouchControls.tsx`): a stick and Work, Pick and Dash buttons, all at least 44 px, shown for solo play on touch screens. They write into the same `KitchenInput.touch` the keyboard path already reads, so there is one input path, not two. Two-chef play needs two keyboards and has no touch layer.
- **Persistence moved off `localStorage`** (plan change E8, arcade half). `src/game/storage.ts` now has a driver; the browser build keeps `localStorage`, and on Reddit `src/client/arcade-sync.ts` swaps in a driver that loads the player's save at boot and sends changes in small debounced posts (`GET` and `POST /api/arcade`). The server (`src/server/core/arcade.ts`, Redis key `arcade:{uid}`, one year expiry) validates every post: whole scores from 0 to 6000, six palette colours, and a best score can never go down (concurrent saves are merged under WATCH).
- **Bounded trust:** the arcade cannot be replayed on the server, so its numbers never touch the leaderboard, the daily stars, or the restaurant's money. They only keep the player's own bests and outfits.

**Devvit:** Redis only (a new key and two routes). No new permission.

**Not yet done from section 7.2:** the old share button still builds an image card; it is replaced by the Reddit comment flow later. The daily shift, the research bonus from stars and online co-op come with the later phases. The pass in ticket mode (7.1) is the next step.

**Code:** `src/arcade/`, `src/game/storage.ts`, `src/game/arcade-save.ts`, `src/client/arcade-sync.ts`, `src/server/core/arcade.ts`, `src/server/routes/api.ts`, `src/pages/Index.tsx`, `src/management/ManagementGame.tsx`. Tests: `arcade-server.test.ts`, `arcade-sync.test.ts`, `test-kitchen.browser.test.tsx` (the 3D scene is a stand-in so the controls are tested without WebGL setup per test) and `test-kitchen-scene.browser.test.tsx` (one test with the real scene, where a touch input moves the real chef).

## 2026-11-19 — Tycoon depth wrap-up: reputation on the sign, and what was left out of P6

**Added:** the sign over the terrace now shows the reputation as five stars in place of the tagline (`signStars` in `RestaurantScene.tsx`, drawn on the sign's canvas texture, redrawn when the rounded reputation changes).

**Left out of P6, on purpose:**
- **A chef-only starter park with the owner delivering plates (E3).** The calibration of every bot and the headline goals was measured with the starter server. Removing the server would move all of those numbers and invalidate the replay fixtures for a first-minutes change the owner already makes: the pass lets the owner cook, and the shop and the team page already make "hire a server" the first purchase.
- **Bills that travel from the table to the register.** The money already moves at delivery and the cash feedback shows it over the guest. A separate bill object would add a per-guest state and a second payment moment without changing any decision the player makes.
- **Weather weights outside the headline (E6)** are already done: the headline carries them (rain slows walking and raises the comfort weight on tips; the bright-sun nudge toward burgers), so no cosmetic weather clock reaches the simulation.

Menu styles, contracts, regulars, thoughts and research (see the entries above) cover the rest of plan section 6. The kitchen card and company-value best are on the result card from the earlier end-of-night work; the ledger will show the best company value with the P5 UI pass.

## 2026-11-19 — Research: a nightly budget that opens the stock pot, a window bench and staff cloth

**Why:** plan section 6. Cash has few sinks after the first week; research gives a small, steady one that pays back in something visible, and it is the one place the owner trades tonight's profit for tomorrow's menu.

**Rules:**
- With the doors closed the owner sets a budget of $0, $20 or $40 (`research` action). At closing it is taken like wages, only if the register still has that much after wages and rent. Otherwise the night is skipped, not borrowed. The amount becomes research points one for one and is shown on the report (`report.research`, subtracted from profit).
- 100 points opens the **stock pot** in the shop (soup, ramen, dumplings). 220 opens the **window bench** (+10 atmosphere, a new piece drawn from boxes). 360 opens **staff cloth**: hat and apron colours for chefs, from the same six colours as the Test Kitchen wardrobe (`outfit` action). Servers keep their teal.
- The wok and the oven stay on sale from the start. Gating all three appliances would have made the first noodle or bread dish a week away; the pot is the one that matters because it carries five dishes.
- Moving a piece already placed never needs the study, so a state cannot be stranded.

**Server:** `research` and `outfit` are planning actions in the zod log, run through the same engine methods as the client, so a forged log cannot buy a gated piece or dress the staff early (the engine refuses and the lock fails).

**Refused:** research that can run the register negative, random research outcomes, and a tree. One meter, three thresholds.

**Code:** `src/management/types.ts` (`RESEARCH`, `researched`, `RESEARCH_GATE`), `engine.ts` (`setResearch`, `setOutfit`, `place` gate, `finish`), `actions.ts`, `replay.ts`, `Panels.tsx`, `InteriorsPanel.tsx`, `Agents.tsx`, `FurnitureView.tsx`, `src/components/OutfitPicker.tsx` (moved out of the wardrobe so the tycoon does not import the 3D preview); tests in `research.test.ts` and `research.browser.test.tsx`. Golden hashes refreshed again for the new fields.

## 2026-11-19 — Named regulars

**Why:** plan section 6. A restaurant with people who come back has a reason to keep the doors open tomorrow, and the sixth contract (Regulars' table) needs them.

**Rules** (`recruit()`, `arriveRegular()`, `regularVisit()` in `src/management/engine.ts`):
- After the third service, one guest asks to be a regular at each closing, until there are four, at one new regular every two services. Name from a fixed list of twelve; species and usual dish come from the date and the number of regulars, with no random draw.
- Each regular visits once a service, in a fixed arrival slot (the 3rd, 7th, 11th and 15th guest). The slot takes no random draw, so a night without regulars is exactly as it was and the calibrated bots are unaffected. They never turn away at the door over price.
- A visit is **happy** when they got their usual (it must be on the menu), waited no more than 60% of the patience, and were not charged more than 15% over fair. A happy visit adds one to their streak; any other visit sets it to zero. Three in a row completes the contract.
- The ledger lists them with their usual and their streak, and their thought bubble carries their name ("Maple: long wait").

**Refused:** regulars who leave for good, and regulars with their own orders beyond the usual. Both are more moving parts than the contract needs.

**Code:** `src/management/engine.ts`, `types.ts` (`regulars`, `REGULAR_NAMES`), `satisfaction.ts`, `Panels.tsx`; tests in `src/test/regulars.test.ts`. The state shape gained a field, so the golden replay hashes were refreshed (reports unchanged).

## 2026-11-19 — Guest thoughts over the tables

**Why:** plan section 6 ("Guest thoughts") and the phone feedback that it was unclear what was going on. A short phrase over a guest says what they feel, so the player can act on it ("Long wait" says add a chef).

**How:** `guestThought()` in `src/management/satisfaction.ts` is a pure function of the guest's stage, wait, price against the dish's fair price, and the plate quality. Phrases: "Long wait", "Too pricey" (first moments only), "Perfectly cooked", "Great value", "A bit pricey", "Lovely", "Too long a wait" (a guest leaving unhappy). The bubble sits above the existing satisfaction bar and is also spoken in the meter's `aria-valuetext`, so colour is never the only signal.

**Decision:** thoughts are display only. They are computed at draw time from state that is already saved, so there is no new field, no change to the replay hash, and no effect on tips or ratings. A guest who refuses at the door because the menu is too dear never sits down, so that case stays a line in the event feed, not a bubble. "The usual" waits for the regulars system.

**Code:** `src/management/satisfaction.ts`, `GuestSatisfactionBar.tsx`, `RestaurantLabels.tsx`; tests in `thoughts.test.ts` and `thought-bubble.browser.test.tsx`.

## 2026-11-19 — Five contracts on the ledger

**Why:** plan section 6. The four first goals teach the basics; the contracts teach the systems (cash flow, patience, living with a layout, the price roll, the terrace). They are collected the same way as the first four (the `claim` action), so nothing new crosses the server boundary.

**The contracts** (`GOALS` in `src/management/engine.ts`): Pay the roof ($300), Three good nights ($250), Nailed down ($200), Honest prices ($200), A full room ($350). Each reads only saved state, so the server's replay and the client always agree on whether one can be collected.

**Counters:** `state.streaks` holds three small counters the engine updates in `finish()` and `sell()`: services since furniture was sold, services in a row at honest prices (every dish within $4 of fair, and a profit), and whether the recovery loan was ever cleared. Saves without them load with zeros.

**Changed from the plan:** "Nailed down" was written as "for one service, selling furniture is refused". A rule that blocks a button teaches nothing, and the planning screen is where selling happens. It is now three services in a row without selling, which asks for the same thing (live with the layout you built) and can be earned, not forced. "Honest prices" is three profitable services at honest prices, because the starter menu is already at fair and a one-night check would be free. "Regulars' table" waits for the regular system.

**Code:** `src/management/engine.ts`, `types.ts` (`streaks`, `HONEST_BAND`); tests in `src/test/contracts.test.ts`.

## 2026-11-19 — Dishes are data: twelve dishes, five appliances, three menu styles

**Why:** the plan's change E4 and the menu-styles item. `'salad' | 'burger'` was hard-coded in the schemas, the arrival roll, the challenges and the panels, so a new dish meant editing a dozen files. Now `DISHES` in `src/management/types.ts` is the single table, and everything else reads it.

**What changed:**
- **Twelve dishes in three styles** (Garden, Grill, Noodle), four each, with a cost, a fair price, a cook time, an appliance, a challenge name and a look. The first two (garden salad, sunset burger) are unchanged, so every calibrated bot night is identical.
- **Three new appliances** (stock pot, wok range, brick oven), drawn from the same boxes and cylinders as the rest of the room. No new model files, no new asset source.
- **Appliances unlock dishes.** The menu panel groups dishes by style; a dish whose appliance is not on the floor shows what it needs and what that costs. Opening the doors with such a dish switched on is refused with the appliance named.
- **Price cap raised from $60 to $80**, because a greedy steak menu asks about $78. The cap lives in one constant (`PRICE_MAX`) used by the schemas, the action log and the engine.
- **Old saves still load.** The menu schema fills in any dish a save does not mention as off at its fair price, so no migration step is needed and the schema version stays 1. The golden hashes changed because the state now carries twelve menu entries; the reports did not (the bot calibration tests pass unchanged).
- Daily challenges can now name any dish ("Sell 4 bowls of ramen"). The roll only includes a new dish when it is on the menu, so a salad-and-burger menu draws the same goals as before.

**Refused:** choosing a style at the very start with a different starter kitchen. It would invalidate the calibrated bots and the replay fixtures for a day-one decision the shop already makes (buy the pot, get the soup). The three styles are earned by building toward them instead. Plan section 6 still lists the research meter, which comes next.

**Code:** `src/management/types.ts`, `daily-challenges.ts`, `Panels.tsx`, `InteriorsPanel.tsx`, `FurnitureView.tsx`, `social.ts`; tests in `src/test/dishes.test.ts` and `menu-panel.browser.test.tsx`.

## 2026-11-18 — End of night: awards, kitchen card, company value, and explicit Reddit actions

**Why:** the plan asks for a result worth sharing and for Reddit features used honestly. Nothing here gates play, and nothing posts without a tap and a preview.

**Decisions:**
- **Night stats** (`refused`, `walkouts`, `waitSeconds`, `dirtyAtClose`) are counted by the engine and come back from the server's replay in `LockResponse.night`. The client never reports them.
- **Kitchen card** (Welcome, Speed, Value, 0–100) and **one award banner** per night (`src/management/awards.ts`, priority: untidy, quiet, prices, food, warm, confusing, steady). **Company value** and a best-ever are kept in state (`best`).
- **Result comment** (`src/management/social.ts`, `src/server/core/social.ts`): a canned receipt line, plus an optional note of up to 80 characters with no links or mentions. With no note it replies to the sticky results comment; with a note it is a top-level comment. One per day, claimed with `hSetNX` before the Reddit call and released if Reddit fails. The client shows the exact text first ("This posts as you").
- **Flair** by streak tier (1/3/7/14/30 days) and **Follow** are separate buttons, never combined with the comment. Flair is a reward for a streak, never for a comment or a vote.
- **Delete triggers** `onCommentDelete` and `onPostDelete` forget stored ids; both are idempotent.

**Devvit:** `reddit.asUser` is `SUBMIT_COMMENT` and `SUBSCRIBE_TO_SUBREDDIT`. Before app approval, comments run as the app account except for the app owner.

**Refused:** auto-posting, one button for all three actions, flair for upvotes, and notes with links.

**Unverified on Reddit:** the flair permission for the app account, and commenting as the user. Both fail visibly with a message instead of pretending to work.

**Code:** `src/management/awards.ts`, `social.ts`, `RedditLayer.tsx`, `src/server/core/social.ts`, `src/server/reddit.ts`, `src/server/routes/api.ts`, `triggers.ts`.

## 2026-11-18 — The owner at the pass (start of P7): the player's job during service

**Why:** phone feedback said it was unclear what the player does, and it was right: every decision happened before opening and the service ran by itself. The plan's answer is the pass, so it is built now, in its verifiable form first; the full `KitchenEngine` station replaces the timing bar later.

**What the player can do while the doors are open** (`src/management/Pass.tsx`, engine methods `claimTicket`, `plate`, `abandonCook`, `rush`, `comp`):
- **Cook a waiting ticket** yourself when the chefs are busy. One dish at a time, at a free station of the right kind, ingredients paid on claim. A bar fills as the dish cooks, with zones: raw, a little early, **perfect**, a little over, burnt. **Plate it** in the green zone for a perfect plate (tips 15% more); too early or too late loses the dish and the ingredients and the ticket goes back to the line. A dish left for twice its time burns by itself.
- **Rush** a ticket to the front of the line; **Comp** a table that is about to walk out (free meal, patience resets, two a night).
- The game slows to 1× while you cook, so the bar is the same speed for everyone. The daily challenges are thin pips on the panel instead of a panel that covered the floor.

**How it stays verifiable:** these are service actions stamped with the tick they happen on (`claimTicket`, `cook`, `abandon`, `priority`, `comp`). **No quality is ever sent:** the engine works plating quality out from how long the dish cooked, in simulated seconds, so there is nothing to forge. The replay applies each action on its exact tick; one the engine refuses does nothing and is counted. A log must be in order, at most 80 actions, and may not contain planning actions at lock (or service actions in open or save).
- **Tested:** the scripted helping owner (`helperPolicy` in `bots.ts`) plays live on every judging day, in two kitchens, and the server-style replay lands on the identical state with zero rejected actions. The helper serves more guests than the team alone. The server accepts the log at lock, ignores refused or forged actions without changing the night, and enforces the limits. The client session collects the pass log separately from planning changes and sends it with the lock. 11 + 21 + 10 new tests (engine, replay, server and session, and the panel in a real browser at 360 px).
- **Schema:** guests gained `owner`, `cook`, `quality`, `priority`; the state gained `comps`; guest price may now be 0 (a comp). Golden hashes were refreshed; they still match in Chromium, Firefox and WebKit.

**Also fixed:** the camera buttons were hidden under the daily bar on phones; on Reddit they now sit at the right edge in the middle of the screen.

**Not changed on purpose:** the starter park still has a server. Removing it (so the first hire is the server) would invalidate the calibrated bots, since a bot cannot work the pass; that change belongs with the research and contract work and a re-calibration.

Tests: 654 unit, 165 browser, cross-engine all passing.

Devvit or third party: none.
Code or plan: `src/management/{engine,actions,replay,Pass,bots}`, plan section 7.1.

## 2026-11-18 — Phone feedback: pixel size, overlap, weather, guidance

The first phone screenshot of the pixel build (a 360 CSS px wide phone at 2× density) showed four problems.

- **Too pixelated to read.** I had fixed the pixel size at 3 CSS pixels: on a 360 px phone that is 120 pixels across the whole scene, so animals were two or three pixels tall. The size is now chosen from the screen width (`autoPixelSize`: about 360 scene pixels across, so 1 on a phone, 2 on a tablet, 3 on a desktop window), the canvas renders at 1× and the browser scales it with `image-rendering: pixelated`, so every block is the same size on any phone density. The palettes went from 16 to **24 colours per weather** (mean error 7.7 sunset, 9.3 rain, 7.3 sun) to bring back the terrace floor's tile banding, red awnings and yellow windows. Checked on captures at phone size and density, in all three weathers, and at desktop size. **If you still dislike the look, `?pixel=0` is the original renderer and the pass is one component to remove.**
- **The daily bar overlapped the header stats** on a narrow phone: it was positioned by a guessed offset. It now sits in the header's own flow (a test checks it never covers the stats at 360 px).
- **The scene showed bright sun under a "Rain on the roof" headline.** On Reddit the scene's weather now comes from the headline (rain on Wednesday), and the manual weather picker is replaced by a one-line explanation.
- **"What do I do?"** The bar now shows tonight's star goal and a next-step line that changes with the state of the game: before opening ("Set up first: build, hire, set prices, then tap Open"), during service ("Your team is cooking, serving and cleaning. Watch the floor") and after a result ("only your best night of the day counts"). This is honest about the real gap: today every decision happens before opening and the service runs by itself, because the hands-on pass from the plan is not built yet. It is the next piece (service actions the owner can take at the pass).

Tests: 616 unit and 155 browser pass.

Code or plan: `src/scene/pixel/*`, `src/management/RedditLayer.tsx`, plan sections 7, 9 and 13.

## 2026-11-18 — The pixel look on the real scene (P5, part 1: palettes and the render pass)

The existing 3D scene now goes through a pixel pass: it renders at 1/3 size into an offscreen target, a shader tone-maps it (the same ACES operator and exposure as the on-screen path, because three.js applies neither tone mapping nor the sRGB curve to an offscreen target) and snaps it to a 16-colour palette with one lookup-table fetch, and the result is drawn back at full size with nearest-neighbour sampling. The animals, furniture, city, camera and simulation are untouched. `?pixel=0` turns it off and `?k=4` changes the pixel size.

**Palette decision, from the preview sheets (Codixel preview-first):** the first palette was authored from brand colour ramps with `P.hueRamp`. On the real scene it was wrong: mean colour error 24–32 against 8–9 for a palette taken from the scene, the grey road turned teal, and roofs speckled. The brand ramps had no neutral grey. Shared palettes across weathers lost the weather (the rain scene went muddy beige); pinning the five brand colours cost fidelity and added noise. **Chosen: one 16-colour palette per weather (sunset, sun, rain), clustered from captures of the real scene, with 2 slots reserved for leaf green** (clustering alone dropped the saturated greens and the trees went grey), **no dither**, 3× pixels. The brand ramps are kept for the UI kit, whose sprites are flat shapes. Mean error 9.0 sunset, 13.0 rain, 9.3 sun.

- **This choice is provisional until you approve it** on the sheets in `tools/pixel/out/` (`preview-final-*.png` and `preview-palette3-*.png`, not committed). Light dither and full dither were compared; flat is crisper and cheaper, and the dither strength is a shader uniform if you want it back.
- **Files shipped:** `public/pixel/palettes.json` and three 1024×32 lookup tables (about 4 KB each). They map every 5-bit colour to its nearest palette colour (Codixel's channel-weighted distance), so a snapped frame can contain nothing else.
- **Weather blends:** the pass blends the three palettes with the scene's existing sun and rain blend values, so a weather change fades instead of popping.
- **Safe fallback:** if the tables fail to load the pass never mounts and the game renders plain 3D.
- **Antialiasing is off** while the pass is on (it only costs GPU and fights the pixel edges).
- **Tile grout is dropped** in pixel mode: a gap thinner than one scene pixel only aliased into scattered specks on the terrace floor.

**Bugs found on the way:** three.js already declares the sRGB functions in every `ShaderMaterial`, so including their chunk again failed to compile and the canvas went black (found from the browser console); `TextureLoader` flips images vertically by default, which would have read the wrong lookup row; Codixel's `core/pixel.js` is CommonJS and the repo is `"type": "module"`, so `require()` loses its export (the tools load it explicitly).

**Tools** (`tools/pixel/`, authoring time only, never shipped): `capture.mjs` (stills of the real scene, UI hidden, three weathers, phone and desktop; `--pixel` captures what the game shows), `palette.mjs`, `make-palettes.mjs`, `make-lut.mjs`, and the preview scripts.

**Tests:** palettes and tables (exactly 16 distinct colours each, only palette colours in the tables, every sampled colour maps to its nearest palette colour), and the pass on a real GPU frame (only palette colours, whole 3-pixel blocks along a row, shapes keep their hues, the rain and sun palettes appear when the weather changes, plain fallback when the tables cannot load). 614 unit and 150 browser tests pass.

Not done in P5 yet: the Android 2D-canvas copy (spike S2 showed no black canvas on the first phone, so it stays a flagged fallback), the pixel UI kit and Silkscreen, the thought bubbles, the splash still, and the quality tiers.

Devvit or third party: Codixel (authoring only), three.js `FullScreenQuad` addon.
Code or plan: `src/scene/pixel/*`, `public/pixel/*`, `tools/pixel/*`, plan section 13.

## 2026-11-18 — First phone test, journeys and the collapsed dock (P4)

**Spike S1 and S2, first result (Android Reddit app, a real phone):** the 3D scene draws, there is no black canvas, and the load takes about 2–4 s. The first screenshot showed the old playtest build (`v0.0.1.23`): `devvit upload` creates a version but does not install it, and the subreddit kept the old one. `devvit install flip_and_fry_dev flip-and-fry@latest` installs the new version. Version 0.0.3 is installed; every upload from here needs that install step.

**Journeys (Devvit's analytics).** `src/client/journeys.ts` is the small interface the session talks to; `src/client/journeys.reddit.ts` is the only file that imports the browser-only package. Events follow the plan: app-ready after the scene has had two frames, Start on the Open tap, interactions after the engine accepts a change (purchase, move, price, hire, train, dismiss, sell, expand, loan, claim; renaming and music are not worth an event), progress 0.3 / 0.6 / 0.9 once each and in order, and the **official end written by the server** from the replayed receipt (win means at least one star, score is the packed stars and rating). The client sends the journey id as `x-devvit-journey-id` on the lock request and clears it afterwards. Nothing carries a username or free text.

- **Devvit's telemetry router is Express-only,** and this app is Hono. The five endpoints the client calls (`/api/telemetry/journey/start|progress|interaction|end|app-ready`) are served from Hono with the same shapes, backed by the server telemetry client. Request bodies are validated with zod and tested.
- `permissions.journeys` is on. Journey maps need Reddit's review, so events are probably dropped in playtest; the game never depends on them (tested with and without a journey).
- **Cost:** importing the server telemetry module pulls Express into the server bundle (1.6 MB to 2.2 MB). Listed for the optimization phase.

**Collapsed dock.** While the doors are open on Reddit the four management tabs fold away and only the pause and speed controls and the status line remain; they return when the service closes. The plain browser game is unchanged. "Saved on this device" now says "Saved on Reddit" there.

Tests: 610 unit and 140 browser, all passing (9 new journeys tests, 2 new dock tests).

Devvit or third party: `@devvit/analytics` (client and server), `permissions.journeys`.
Code or plan: `src/client/journeys*.ts`, `src/server/routes/telemetry.ts`, `src/server/core/telemetry.ts`, plan section 12 (Journeys).

## 2026-11-18 — The daily post is created lazily and safely

`src/server/core/daily-post.ts` creates one custom post per UTC day, with the headline in `postData` (so the splash needs no server call), a Markdown text fallback for old Reddit and search, the headline as flair text, and a stickied "Results for today" comment. It is called from three places: the 00:05 scheduler task, the moderator menu ("Post today's service"), and the **first player request of a new UTC day** (`GET /api/today`), so the game never depends on the cron's undocumented timezone.

- **Exactly one post under a race.** The day is claimed with `hSetNX` on the `posts` hash. A request that loses sees either the finished post or "being created". A claim older than 60 s is a dead request and is taken over; a corrupt stored value reads as a dead claim and heals itself. Twenty simultaneous requests create one post (tested).
- **Failures degrade, not break.** If flair cannot be set (it needs a template and mod rights, spike S5) the post is created without it; a missing sticky never blocks a playable post; if Reddit fails, the claim is released so the next request retries.
- **Reddit is behind a one-file adapter** (`src/server/reddit.ts`), so the rest is tested with a fake.
- The install trigger now rolls today's post instead of creating a generic one, and `devvit.json` has the `roll-day` scheduler task.

Uploaded as app version 0.0.2 earlier in this step (the client shell); this change is committed but not uploaded yet.

Devvit or third party: Reddit API as the app (submit post, comment, distinguish), scheduler (one recurring task of the ten allowed).
Code or plan: `src/server/core/daily-post.ts`, `src/server/reddit.ts`, `src/server/routes/*`, plan section 15 (the daily post).

## 2026-11-18 — Client shell: the existing game on top of the server (start of P4)

`src/client/game.tsx` now loads today's data first (a plain loading and retry screen), then mounts the existing game. `src/client/session.ts` connects the engine to `/api`: it queues the engine's planning actions and saves them in batches with the park revision, opens and closes services through the server, plays the engine's live run as a **preview**, and adopts the server's park whenever the preview disagrees with the replay or another tab won a race. The engine gained `onAction` (reports each accepted planning change), `adopt` (take the server's state), `detach` (stop `localStorage`) and a `remote` hook; `closeEarly` and `reset` are refused in remote mode because the server would not know about them.

- **The property that makes this safe, tested:** the actions a live engine emits reproduce exactly the same state, including the ids of purchased furniture, when the server applies them (`engine-actions.test.ts`).
- **End to end, in Node:** `session.test.ts` runs the real session against the real server rules behind a fake network: batching, a stale tab, a failed open that keeps the player's changes, reloading mid-service (the same night replays bit for bit), and a lock conflict.
- **Two real bugs those tests caught:** the session armed its finish watcher before the doors were open, so adopting the closed snapshot made it lock a service the moment it opened; and after a lost lock race the stale open entry stayed on the server, so a reload re-entered a service that could never close (the server now drops an abandoned service).
- **UI:** a daily bar (date, headline, streak, kitchens closed tonight) and one result card (stars, the goal, two of three challenges, the numbers, official or practice, streak, tomorrow). The header says Flip and Fry. Settings text no longer claims the restaurant is saved in the browser, and "start a new restaurant" and "stop new arrivals" are hidden on Reddit.
- **The restaurant name is now limited to letters, numbers, spaces and apostrophes** (28 characters), as the plan says. The old browser test that used an ampersand was updated and now asserts the rejection.
- **Tooling note:** a long-running `devvit playtest` crashed with a file-watch permission error (Windows `EPERM` on `dist/`) when I rebuilt into `dist/` while it ran. Do not run `vite build` while a playtest session is up; use `devvit upload` to push a version.

Tests: 590 unit, 138 browser (6 new for the Reddit layer), all passing. Not done yet in P4: collapsing the dock while the doors are open, journeys, and running this on a phone (spike S1).

Devvit or third party: none new.
Code or plan: `src/client/*`, `src/management/RedditLayer.tsx`, `src/management/engine.ts`, plan sections 9, 11 and 12.

## 2026-11-18 — Server: park, open, lock, streak (gate G4)

`src/server/core/game.ts` holds the rules and `src/server/core/store.ts` the `Store` interface they talk to; `src/server/routes/api.ts` wires them to Hono and to Devvit's real `redis` (the assignment type-checks, so the interface matches the client). Routes: `GET /api/today`, `POST /api/save`, `POST /api/open`, `POST /api/lock`.

- **The server owns the park.** Each player has `park:{uid}` with a revision. Planning actions are applied on the server with the engine's own methods (`applyPlanning`), so a client cannot post its own cash or staff. `open` stores the opening snapshot; `lock` replays it with the server-derived headline and stores the replayed receipt. A client total is never read.
- **One open, one close.** Locking deletes the stored open, so a replay cannot be submitted twice. A service that opened before UTC midnight may close after it and keeps the headline it opened under; anything older than yesterday is refused.
- **Concurrency.** Writes use WATCH/MULTI/EXEC with a revision; a stale tab or a lost race gets a 409 conflict and reloads. ASSUMPTION still to confirm in the playtest: a failed EXEC returns an empty or null result rather than throwing. Both are handled as a conflict.
- **Official result.** The first locked service of a UTC day counts; a later one replaces it only with more stars, or equal stars and higher profit. The streak bit is set only for a server-verified 1★ result, in a per-player-per-year Redis bitfield, and the count is forgiving (it starts from yesterday if today is unplayed) and carries over the new year and a leap day.
- **Limits.** Per-player rate limits (open 30/min, lock 10/min, save 120/min, today 120/min), a 256 KB request body cap, per-key TTLs (park 30 days, runs 30 days, board and community 45 days, streak 400 days), and about 25 Redis commands per open and 40 per lock.
- **Date helpers** `shiftDate`, `dayOfYear` and `daysInYear` (no `Date` object) are in `daily-headline.ts`.

Tests: `src/test/server-game.test.ts` (28 tests) runs against `src/test/fake-store.ts`, an in-memory Redis that honors per-key expiry from an injected clock, has no key scan, orders bitfield bits MSB-first and fails EXEC when a watched key changed. They cover forged logs, wrong identity, stale revisions, races injected between read and commit, the midnight crossing, the streak across years and a 300-day run, TTLs, and command budgets.

Not yet verified on Reddit: the EXEC conflict behavior above, `reddit.getCurrentUsername()` for logged-out viewers, and rate-limit key expiry. They are checked in the first playtest.

Devvit or third party: Redis (already enabled). `hono/body-limit`, `zod` on the server.
Code or plan: `src/server/**`, `src/shared/api.ts`, plan sections 12 and 15 (routes, Redis keys) and 19 (G4).

## 2026-11-18 — The app is `flip-and-fry`; first upload and the playtest subreddit

`too-many-cooks` was already taken on Reddit, so the app is registered as **flip-and-fry** and the game is shown as **Flip and Fry** in the README, HTML titles, splash, menu text and plan. The old name stays only where it is history (this log, the README's note about the arcade's origin, the `pre-devvit` tag and the repository folder). `name` in `devvit.json` and `package.json` was rewritten by the CLI; the plan's slug, subreddit and `devvit.json` example were updated by hand.

First `devvit upload` succeeded. App listing: https://developers.reddit.com/apps/flip-and-fry. The CLI created and installed the app to the playtest subreddit **r/flip_and_fry_dev**. The upload needed the developer agreement (accepted in the browser) and the app registration through `https://developers.reddit.com/new` with `skip_template=true`, which left the repo untouched. `devvit init` was not used because it can write template files.

Devvit or third party: Reddit developer account; no new permission.
Code or plan: `devvit.json`, `package.json`, `README.md`, `src/client/*.html`, plan sections 0, 1, 15 and 17.

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

Not done at the time of this entry (login, the developer agreement and the app registration were all done later; see the entry above): the first `devvit playtest` and spike S1.

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
