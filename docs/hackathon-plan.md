# Flip and Fry — Reddit Game of the Day plan

**Hackathon:** [Reddit's Game of the Day](https://redditgameofday2026.devpost.com/). Submission closes **Tue 8 Dec 2026, 6:00 pm PT** (02:00 UTC on 9 Dec; Devpost shows it as 9 Dec 7:30 am IST). Judging runs 9 Dec 12:00 am PT to 16 Dec 6:00 pm PT. Winners are announced around 17 Dec.
**Platform:** [Devvit Web](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_overview).
**Target prize:** Best Ported Daily Game ($6,000). It is still scored for Best Daily Game ($15,000), but a project can win only one prize.
**Companion docs:** `docs/plan-review.md` (evidence for the changes in this plan, with the Devvit doc sources), `docs/build-log.md` (the decision record).

This plan replaces the earlier draft. Everything in it is meant to be built. Order is by dependency, not by what to cut.

## 0. What the rules say, and what that changes

Read from the saved Devpost pages (Overview, Resources, Rules) and the official docs in `reddit/devvit-docs`.

### Hard requirements (a missing one is a fail at Stage One)

| Requirement | What we do |
|---|---|
| Built on **Devvit Web**, runs on Reddit, uses an Interactive Post. | `devvit.json` with a custom post. No game lives outside Reddit. |
| **App listing**: your `developers.reddit.com/apps/{app-name}` link, created by `devvit upload`. | App name `flip-and-fry` (the name `too-many-cooks` was taken). Upload, never publish. |
| **Demo post**: link to a **public** test subreddit with **fewer than 200 members** and a post running the game. Or install `dr-admin-approve` so admins can join. | Create a public subreddit (not private) and install `dr-admin-approve`. One post per UTC day keeps running through the judging window. |
| **README.md in the repo root** that describes the game and how to play. | **Required, not optional.** The current README describes the browser game and must be rewritten (section 16). |
| **Text description** of features and functionality. | Written for the Devpost form (section 16). |
| **New & existing**: a project that existed before 11 Nov must be *significantly updated* during the period, and you must *explain how*. | State that this is a port of a game we own (the browser tycoon). Tag the pre-Reddit commit (`git tag pre-devvit`) and list what is new in the description. |
| Third-party material must be licensed. | Provenance table for every GLB, audio file and font (section 14). Anything unclear is replaced. |
| Demo video is optional, **under 1 minute**, on YouTube, Vimeo, Facebook Video or Youku. | Shot list in section 16. |
| Do **not** publish the app. | `devvit upload` and `devvit playtest` only. |

### What the judges score (four equal criteria; ties break in this order)

1. **Delightful UX** — easy and fun to uncover what the app offers.
2. **Polish** — as close to publishable as possible and Devvit-Rules compliant, understandable from the example post alone.
3. **Reddity** — community-minded, its own identity, brings something fresh. *Not* "about Reddit": no karma, Snoo or subreddit theming.
4. **Daily Content** — recurring content, challenges and intrigue.

Because UX breaks ties first, the first minute of play is the highest-value thing we build.

### What the Overview says stands out, and where we answer it

| Devpost asks for | Our answer | Section |
|---|---|---|
| Intuitive onboarding: contextual hints, no wall of text. | No welcome essay. One contextual line at a time. | 11 |
| Visual craft: accessible contrast, uncluttered controls, no "unstyled generic components". | A custom pixel UI kit replaces the default shadcn look. | 13 |
| Calibrated daily content: legible, fair, solvable, a tuned difficulty curve. | Seven headlines, calibrated by bots on the exact judging dates. | 5, 17 |
| Focused gameplay: a start screen with name, description, date, attribution, stats; no secondary actions in play. | Splash with those five items. The dock collapses during service. | 11 |
| Clear end state: one result card, a next step, not several end screens. | One receipt card. The day locks by itself. | 11 |
| Journey instrumentation. | Journeys on the whole loop, with the server writing the official end. | 12 |
| Bonus: journeys, flair, comments, snoovatars, streaks. | All five are in the plan (snoovatars behind a spike). | 3 |

### What it says to avoid

- **AI slop.** UI fits the viewport, has its own identity, is accessible. The pixel kit and the animal cast are the identity.
- **On-the-nose Reddit theming.** The "neighborhood" is the subreddit as a community. Nothing is named after Reddit.
- **Common ideas.** A restaurant tycoon with a daily headline is not on their list of overused ideas.
- **Games not running on Reddit.** The first deliverable is the game running in a Reddit post on a phone.

## 1. What we are shipping

One interactive post a day. You own a rooftop restaurant, played by animals. Staff cook, serve and clean. Guests arrive on their own, order, lose patience, tip, or walk out. Between services you build, hire, train and price. When the night gets busy you can step in at the pass and cook a ticket yourself. The whole game is one restaurant that never resets, plus a daily headline shared by the subreddit.

The **daily** is that headline: rain, a critic, a supplier hike, a payday crowd. Your floor, prices and staff are yours, so the same headline plays differently in every kitchen. Each night ends on one result card with stars, the streak, an award, and how the neighborhood did.

Keep from the existing game: the deterministic simulation, the 3D rooftop and city, the four animal species, the palette, and the hands-on kitchen (`KitchenEngine`).

Changes to the player's day: it is bite-sized on the surface and deep underneath. A first-time player sees today's headline, one **Open** button and one result card. Contracts, research, regulars, visits and co-op appear as the restaurant grows.

App name: `flip-and-fry` (12 characters; the docs allow 3–20 lowercase letters, digits and hyphens). The first choice, `too-many-cooks`, was already taken. The game is shown as **Flip and Fry** everywhere. The app listing is `developers.reddit.com/apps/flip-and-fry` and the test subreddit is `r/flip_and_fry_dev`.

## 2. Architecture: a deterministic engine and an action log

Treat the engine as a pure function: `(snapshot, headline, actionLog) → receipt`.

| Use | Who produces the log | Who runs it |
|---|---|---|
| Official lock | The owner's client | The server replays it. Its receipt is the official one. |
| Bots (calibration) | Test code | Node, headless |
| Open-door visit | A visitor, against the host's stored kitchen | The server replays it and writes the host's note |
| Hosted co-op | Host and joiners | Every client runs the same engine in lockstep |
| Presence diners | The server writes them into the opening snapshot | Replayed like any other arrival |

Log entry: `{tick, kind, ...args}` where `kind` is one of `place`, `sell`, `hire`, `train`, `dish`, `expand`, `loan`, `claim`, `research`, `claimTicket`, `cook`, `deliver`, `comp`, `priority`. Planning actions use tick 0 and run through the engine's own methods, so cash, phase and layout checks are the same ones the game uses.

Rules:
- **The server's replay is the only source of cash, stars, streaks and receipts.** The client's live run is a preview and may differ by rounding without being rejected.
- The server stores the park. A client never posts its own cash, reputation or staff.
- The engine uses only exactly-rounded operations (`+ - * /`, `Math.sqrt`, integer ops). `Math.hypot` in `walk()` (`engine.ts:21`) is replaced with `Math.sqrt(dx*dx + dz*dz)`. `atan2` only feeds `yaw`, which is visual.
- No `Math.random`, `Date.now` or `performance.now` inside the engine. A test greps for them.
- The server is serverless (30 s, 4 MB request, 10 MB response, no WebSockets). All state is in Redis.

## 3. Using what Reddit offers

| Reddit feature | How we use it | Section |
|---|---|---|
| Interactive post, inline and expanded | Static splash inline (tap only, under 1 s); the full 3D game in expanded mode | 11 |
| `postData` (2 KB) | `{date, headlineId}` so the splash shows today's headline with no server call | 11 |
| Redis | Parks, runs, streak bitfield, boards, presence, doors, bulletin, co-op log | 15 |
| Scheduler | Daily roll, a night-report job, a nightly cleanup | 15 |
| Triggers | `onCommentDelete`, `onPostDelete`, `onAppInstall`, `onAppUpgrade` | 15 |
| Menu items | Moderator: post today, highlight today's post, set a special-event day | 15 |
| Realtime | Co-op lockstep, a live toast when a neighbor visits | 12 |
| Comments | A canned receipt reply to the sticky comment, as the player; the app's own nightly report comment | 12 |
| Flair | Post flair is today's headline; user flair is the streak tier | 12 |
| Subscribe | Its own explicit button | 12 |
| Client `showForm` and `showToast`, `navigateTo` | The 80-character note, the restaurant name, system toasts, links to yesterday's post | 12 |
| Subreddit settings | Neighborhood name, open doors on or off, a moderator event override | 15 |
| Text fallback | Markdown description of today's headline for old Reddit, search and AutoMod | 15 |
| Journeys | Whole loop instrumented; the server writes the end | 12 |
| Community highlights | The app highlights today's post (needs mod permission on the demo subreddit) | 15 |
| Snoovatars (judging bonus) | Spike: show a visitor's avatar on their guest tag. Fallback: a deterministic pixel face from their user id | 12 |
| `userGeneratedContent` custom posts as the user | Optional "Post my kitchen" action that creates a post of that kitchen. It is its own explicit button. Unapproved apps run it as the app account except for the owner | 12 |
| Push notifications | A gated beta. Apply now. Nothing depends on getting it | 12 |
| Media uploads | Spike: upload the result card as an image. Only if the permission works without review | 12 |
| In-app catalog assets, app icon | Produced as part of the asset kit even though they only take effect after approval | 14 |
| **Not used** | Payments, HTTP fetch, blob storage, external endpoints. `permissions.http.enable` is set to **false** explicitly because the docs say it defaults to true | 15 |

Rules these features must respect (from `userActions.mdx`): ask before acting for the player, act only after an explicit button, never gate play on a comment or subscribe, keep post, comment and subscribe as separate actions, and never spam. Upvotes and karma never touch the simulation.

## 4. The tycoon we already have, and what changes

`RestaurantEngine` (`src/management/engine.ts`) is the game. Keep and build on: the fixed 0.1 s step and seeded LCG, the grid and A* in `layout.ts`, guest stages, autonomous chefs and servers, the price walk-away roll, arrival spacing, patience from comfort, tips, dirty seats, challenge math, cash, wages, rent, training, the terrace, the recovery loan, milestones, the four species, the 3D scene, and the palette (cream `#FFF2D7`, ink `#233D3B`, teal `#224F4A`, tomato `#DC533C`, gold `#F2B743`).

Required changes (all verified against the code):

| # | Change | Why |
|---|---|---|
| E1 | `autoRoll` flag (default true so old tests still pass). With it off, `finish()` stops at a receipt. Add a headless `runService(snapshot, headline, actions)`. | `finish()` calls `beginNextDay()`, which reopens the next day itself (`engine.ts:231-238`). |
| E2 | `Math.hypot` → `Math.sqrt`. Remove the module-level `restaurant` singleton from `engine.ts`. Compute the layout key once per layout change instead of `JSON.stringify` in `route()`. | Cross-engine determinism and replay speed. |
| E3 | Schema version 2 with a v1→v2 migration. Starter staff is a chef only. Delivery becomes an owner action when no server is hired. | The schema requires two staff today, and without a server nobody delivers. |
| E4 | `Dish` becomes data. `DISHES` is the single table keyed by id. The zod enums, `arrive()`, `readiness()` and challenge kinds derive from it. | `'salad' \| 'burger'` is hard-coded in the schemas and loops. |
| E5 | Add a discount demand lift to `arrive()`: arrival gap × `(1 − min(.15, discount))`. | Refusal chance is `max(0,(price/fair−1)·.7)`, so revenue peaks near fair×1.21 and nothing rewards a lower price. |
| E6 | Weather weights read from the headline or the date, not from `weatherAt()`. | `weatherAt()` is a session-only cosmetic clock and is not replayable. |
| E7 | `createDailyChallenges` seeds from the date and the owned menu instead of `state.seed`. | Everyone sees the same three goals today. |
| E8 | Persistence moves from `localStorage` to Redis. `restaurant` state, arcade progress and outfits all move. | The iframe URL changes every upload, so `localStorage` is wiped. |

`resume()` and the away summary: on Reddit, a service left open can finish without you. The server runs that service from its opening snapshot when you return. It stops at the receipt and never starts another day or spends tomorrow's headline.

1×, 2× and 3× stay. They change only how fast the client calls `update()`. The server replays the same 0.1 s steps, so watching faster is not a higher score.

## 5. The daily headline

`createDailyHeadline(date)` is a pure function in `src/management/daily-headline.ts`. The client and the server both call it, and the server never trusts a headline from the browser.

```ts
type DailyHeadline = {
  date: string;          // 'YYYY-MM-DD' UTC
  seed: number;          // mixed into state.seed at the moment doors open
  weather: 'sunset' | 'sun' | 'rain';
  id: HeadlineId;
  title: string;         // five or six words
  blurb: string;         // one sentence
};
type HeadlineId = 'quiet' | 'rush' | 'rain' | 'supplier' | 'critic' | 'payday' | 'inspection';
```

| Day | Headline | Effect on existing formulas |
|---|---|---|
| Mon | A quiet neighborhood | Patience ×1.15, arrival gap a little wider. The teaching day. |
| Tue | The boulevard is busy | Arrival gap minus one second. |
| Wed | Rain on the roof | Rain weather, walk speed ×0.9, comfort counts ×1.5 toward tips. |
| Thu | The butcher raised prices | Burger-family ingredient cost ×1.5 for this service. |
| Fri | A critic is in the neighborhood | More special guests. A special who walks out caps the night at 2★. |
| Sat | Payday | Price walk-away roll halved. |
| Sun | The inspector comes at closing | Each dirty seat at `finish()` pulls the rating down harder. |

The weekday picks the headline. The date seed only jitters numbers inside it. The headline is **bound at Open**, so a service that crosses UTC midnight keeps its headline.

Stars read the receipt; they do not replace it:

| Star | Meaning |
|---|---|
| 1★ | Today's headline goal (authored next to the weights and checked by the bots). |
| 2★ | Also clear two of the three daily challenges. |
| 3★ | Also beat your previous service's profit, or the headline's stretch number on a first service. |

A missed star never resets the park.

**One official service per UTC day.** The first service you close on a date locks by itself (no separate Lock button). A later service the same date replaces the lock only if its replayed stars are higher, or its profit is higher at equal stars. The streak ticks when a locked service earned 1★ (section 12). Pause and 2×/3× work in official and practice services. Hiding the tab saves and resumes; it does not fast-forward.

## 6. Depth that comes from the simulation

Everything here is engine work, deterministic and covered by the bot gates.

**Contracts.** The four existing goals stay first (`GOALS`). Then:

| Contract | Constraint | Teaches |
|---|---|---|
| Pay the roof | Clear the recovery loan, or bank $400 profit if you never took it | Cash flow |
| Three good nights | Rating at least 4 on three services | Patience, comfort, staffing |
| Nailed down | For one service, selling furniture is refused | Living with a layout |
| Honest prices | Both dishes within $4 of fair, and profitable (meaningful because of E5) | The price roll as a tool |
| A full room | At least 8 seats, and serve that many in one service | The terrace and pathing |
| Regulars' table | Keep a named regular happy three visits in a row | The regular system |

**Kitchen card** (three numbers shown on the receipt and, with the doors closed, as a preview from the last service): **Welcome** (comfort and path length from the entrance), **Speed** (average wait against `guestPatienceSeconds`), **Value** (price against `DISHES[dish].fair`, and tips).

**Awards.** One banner per night, from fixed rules: Warmest room, Best food, Sharp prices, Most confusing layout, Untidy close, Quiet night. **Company value** is cash plus 70% of furniture resale. The ledger keeps your best.

**Research.** A budget you set with the doors closed ($0, $20 or $40), taken in `finish()` like wages. Meter thresholds unlock a purchase: the soup pot (the dish turns on when the pot is on the floor), then the window bench (a comfort piece), then staff cloth (hat and apron colors from `setOutfitColor`, saved with the park).

**Menu styles.** Garden, Grill or Noodle at the start. About four dishes each, around twelve in total, each with a cost, fair price, station and cook beat. New appliances (pot, wok, oven) are composed from the existing `Primitives.tsx` boxes and cylinders, so no new models are needed.

**Named regulars.** After the third service, one species-and-dish pair can become a regular, from a fixed list of about twelve names. One arrival slot per service is theirs. Cap of four.

**Weather that changes the night.** Rain slows walking and raises the weight of comfort on tips. Bright sun shortens patience slightly and raises the chance of a burger order. Both come from the headline or the date (E6).

**Restaurant Tycoon turn.** The first hire is the moment the job leaves your hands. The starter park has a chef and no server, so plates sit at the pass until you deliver them or hire a server. The second hire is a second chef, and the pass goes quiet unless you step in. Bills appear on the table during service and reach the register, one guest at a time. Comfort shortens the next-guest gap (about a third of a second per 10 atmosphere, capped so it never doubles the crowd). Reputation stars appear on the sign in the scene.

**Guest thoughts.** Driven by the existing refusal, walkout and tip code, shown as small icons over the guest ("Too pricey", "Long wait", "The usual").

## 7. The pass and the whole `KitchenEngine`

`KitchenEngine` (`src/game/engine.ts`, about 340 lines plus chopping, diners, scorecard and the Chef wardrobe) is a real-time hands-on kitchen with stations, chopping, a grill, plates, fire, two chefs and 3 shifts in solo and co-op. It is currently unmounted. The finished game mounts all of it:

### 7.1 As the pass (every night)

While doors are open, any ticket with no free chef can be yours. Tap it, and the station opens for that one dish on top of the 3D room.

- **Ticket mode**: `KitchenEngine.startTicket({ dish, patienceRemaining, stations })` builds a reduced station layout (board, grill or prep, plate counter, serve hatch) with one order. It reports `{ seconds, quality, burnt }` through `onResult`.
- The sim keeps running while the station is open at 1×, so the room is still busy. A thin bar shows the other tickets' patience.
- Finish the dish and the guest moves to `ready`, as if a chef had plated it. Burn it or time out and the ingredients are spent and the guest still waits. A chef who frees up can then cook it.
- Delivery with no server: tap the ready plate, then the table (`deliver`).
- **Server bounds.** The log records `claimTicket(tick)` and `cook(tick, seconds, quality)`. The replay checks that the guest was `waiting` and no chef was free at the claim tick, that `cookTick − claimTick` is at least half of `DISHES[dish].seconds`, and that `seconds` does not exceed the elapsed ticks. Quality changes tip by at most +15%. Cheating is bounded to "perfect cook".
- **Touch controls** are required. The arcade has a solo touch layer in `KitchenInput.touch`. It is extended to a joystick plus pick, work and dash buttons, each at least 44 px.
- A first-night contextual hint walks through the first ticket using the existing `PRACTICE_STEPS` text, one line at a time.
- Phone layout: the station fills the expanded view with the 3D room dimmed behind it. Desktop: the station takes a panel and the room stays visible.

### 7.2 As the Test Kitchen (any time the doors are closed)

All remaining arcade functionality ships: the three shifts (Golden Hour, Dinner Rush, Last Call), solo and two-chef modes, the practice tutorial, the scorecard, the Chef wardrobe, and results. Changes:

- Progress and outfits move to Redis (`arcade:{uid}`) because `localStorage` is lost on every upload.
- The old share button is replaced by the Reddit comment flow (canned text, explicit button).
- Stars earned unlock staff cloth colors for the tycoon staff and give a small research-meter bonus once per UTC day (capped; bounded trust because the arcade is not replayed).
- A "Daily shift": the date seed picks the shift and the order sequence for the day. Unranked, since the arcade cannot be replayed on the server.
- The arcade keeps its own fixed-step loop for tests. `KitchenEngine` gets a fixed-step mode so it can be unit-tested without the browser.

### 7.3 Online co-op

The two-chef mode and the tycoon service both use the lockstep co-op in section 12, so a friend on the post can cook at your pass.

## 8. Reddit-only gameplay

All of this reuses the action log from section 2.

**Presence diners.** A visitor with the post open calls `POST /api/presence` every 20 s (a sorted set scored by time, with display name and house style). At **Open** the server takes up to three present visitors and writes them into the opening snapshot as scheduled arrivals. They order their house dish, pay, and think "Came over from the thread". If it is off the menu: "Nothing here for me". Because they are in the snapshot, the lock stays verifiable.

**Open doors.** Locking can include "Leave the door open", off by default. It writes the kitchen to `door:{uid}`. A visitor plays one service in it with their own action log (build actions refused). The server replays it and appends a canned note (name, one kitchen-card thought, tip total) to `bulletin:{hostUid}`. The host deletes the door whenever they want. With few real kitchens, 4–6 static **sample kitchens** ship in code, clearly labeled "Sample kitchen", playable through the same replay. Every neighborhood feature has a designed empty state. Sample kitchens are never presented as real players.

**Hosted co-op.** Host and up to two joiners share one service. See section 12 for the lockstep protocol.

**The thread is the street.** Today's post carries the headline as flair. The app writes a nightly report comment ("12 kitchens opened, 5 warm rooms, best award: Sharp prices"). A moderator sets the neighborhood name in subreddit settings, and it is painted on the sign and the bulletin. The canned receipt comment reviews one specific kitchen. It never spawns guests.

**Kitchen posts (optional).** An explicit "Post my kitchen" button creates a custom post of that kitchen as the player (`userGeneratedContent` set). Visitors play it as an open door.

## 9. Screens

The expanded webview is full screen on mobile. The 3D view is always the background.

### Splash (inline, in the feed)

Static, tap-only, under 1 s. It shows the **game name, a one-line description, the date, attribution, and your stats** (streak, last stars), plus today's headline from `postData` and one **Open** button. The image is the pre-rendered pixel still of the rooftop (section 13). It never captures scroll or touch gestures and it has no inner scroll. The **Open** button calls `requestExpandedMode` from the click.

### Doors closed (expanded)

A top bar: restaurant name, date, headline title, cash, streak. A one-line blurb under it ("Rain. Lanterns earn their keep today."). The dock (Build, Team, Menu, Ledger) is the tycoon. One contextual line tied to `readiness()` or the headline ("Burgers need a grill."). Primary button **Open for service**. The first session starts with the Build tab showing the planter, and Monday's hint is said once, not as a modal.

### Doors open

The dock collapses to a thin bar: pause, speed, cash, clock. Challenges are three pips. Thoughts float on guests. **Comp** and **priority** live on the guest you tap. Tickets with no chef show a small "Cook" chip (the pass). The neighborhood camera is available only with doors closed.

### The result card

One card at `finish()`: stars, the kitchen card, one award banner, sales, tips, ingredients, wages, rent, profit, rating, challenges, the near miss, contract progress, tomorrow's headline, and the neighborhood banner count. The day locked by itself. Under it, separate optional buttons (none required for tomorrow): **Post this result** (a `showForm` with the exact comment and an optional 80-character note; the note is not stored), **Wear this flair**, **Follow this kitchen**, **Leave the door open**. **Continue** closes the card with the doors shut. There is no second end screen.

### Accessibility and controls

Targets at least 44 px. Escape closes a panel. Guest actions work on the selected guest. Contrast at least 4.5:1 for text, 3:1 for icons. `prefers-reduced-motion` removes bounce and rain streaks but keeps the pixel scale. Sound plays only after the first tap, has a visible mute, and mutes when the page is hidden.

## 10. Daily loop and re-engagement

- **Today** (`GET /api/today`) creates the daily post if it does not exist (lazy roll), so it never depends on the cron's undocumented timezone.
- **Streak**: one bit per day per user per year in a Redis `bitfield` (the pattern in Reddit's streaks guide), anchored to the post's UTC date. Only the server's replay sets a bit, and only for a 1★ result. Reads are forgiving: counting starts from yesterday if today is unplayed.
- **Tomorrow card**: tomorrow's headline and the next research unlock, one line each.
- **Push notifications**: a gated beta. Apply with the form. If accepted, the streak bitfield is already the data they need. Nothing else depends on it.
- **Night report comment** at the end of the UTC day gives the thread something new to read.

## 11. Inline and expanded entry

```json
"post": {
  "dir": "dist/client",
  "entrypoints": {
    "default": { "entry": "splash.html", "height": "tall" },
    "game": { "entry": "game.html", "height": "tall" }
  }
}
```

Inline rules from `scroll-traps.mdx` and `view_modes_entry_points.md`: tap and click only, load in under 1 s, a mobile Lighthouse score above 80, no `preventDefault` on wheel or touch-move, no `touch-action: none` or `overscroll-behavior: none` on the root, no `overflow: auto|scroll`. Heavy content belongs to the expanded entry, and the app may not auto-expand. Inline and expanded do not share memory, so the game fetches `GET /api/today` itself.

The splash bundle has no three.js and no React Three Fiber. The game bundle loads on tap.

## 12. Reddit features, in detail

### Journeys

| Event | When | Payload |
|---|---|---|
| App ready | The 3D scene has drawn a frame and `/api/today` has resolved | — |
| Start | Pointer-up on **Open for service** | — |
| Progress 0.3 | First guest seated | `action: 'first_guest'` |
| Progress 0.6 | Halfway through `DAY_LENGTH` | `action: 'mid_service'` |
| Progress 0.9 | `finish()` starts | `action: 'receipt'` |
| Interaction | After the engine accepts: comp, priority, a purchase, a hire, a price change, a pass cook | `action` names the verb |
| End, client | They leave during service and the save fails | `complete: false` |
| End, server | `/api/lock` accepts the replay | `complete: true`, `game.win` = 1★ or better, `game.score` = packed stars |

Client import `@devvit/analytics/client/reddit`; server `@devvit/analytics/server/reddit` with `createTelemetryRouter()`. Events fire on pointer-up or touch-end, never on down. Start never fires from a page load. No usernames or free text in payloads. Journey maps must be approved, so playtest events are likely dropped, and nothing in the game depends on them.

### Comment, flair, subscribe, forms

- Comment: canned text from the stored receipt, as the user, as a reply to the sticky. The confirm step uses `showForm` with the exact text and an optional 80-character note. A note makes it a top-level comment. The note is never stored or turned into guest speech.
- Flair: set by the app from `POST /api/flair` (tomato background `#DC533C`, light text). Streak tiers: 1 "Opened the doors", 3 "Regular", 7 "House favorite", 14 "Golden hour", 30 "Rooftop regular". Post flair is today's headline, set by the post-creation function. Flair templates are created on install. The app account needs mod permission for flair (first thing to try on the demo subreddit).
- Subscribe: its own button. There is no API to check subscription, so the flag is stored in Redis.
- Until approval, `runAs: 'USER'` runs as the app account except for the app owner. The demo uses the owner's account, and the README says so.

### Hosted co-op protocol (lockstep)

Each client runs the same deterministic engine. Only actions cross the wire.

1. **Join.** `GET /api/coop/:id` returns the host's opening snapshot and the action log so far. The joiner fast-forwards to the current tick.
2. **Joiner action.** `POST /api/coop/act` → the server checks membership and rate → `realtime.send` to the host only.
3. **Commit.** The host stamps `tick = now + 15` (1.5 s input delay) → `POST /api/coop/commit` → the server appends to Redis and `realtime.send`s the stamped action to everyone. Everyone applies it at that tick.
4. **Sync.** Every 10 s the host sends `{tick, stateHash}`. A joiner that mismatches refetches the host's snapshot (written to Redis every 20 s) and resyncs.
5. **Host leave.** No commits for 5 s: joiners pause and show "host away". A sorted set scored by heartbeat is the session registry. Co-op runs at 1×.
6. Channel names: `coop_<postId>_<sessionId>`. Names cannot contain `:`. Limits: 100 messages/s per installation, 1 MB per message. Lockstep needs a handful of messages per minute per session.

### Snoovatar spike

`reddit.getSnoovatarUrl(username)` on the server, then test whether an `<img>` from Reddit's CDN loads in the webview (CSP). If it loads, the visitor's guest tag shows their avatar. If not, the tag shows a deterministic pixel face generated from the user id. Either way the tag reads as part of the pixel kit.

### Media upload spike

Test whether `permissions.media` works on an unpublished app. If it does, "Post this result" can attach the result card as an image.

## 13. The pixel look and the asset kit

### 13.1 What stays and what changes

`RestaurantScene` (the rooftop, city, weather, traffic, orthographic camera) and the procedural animal rigs stay exactly as they are. Nothing is redrawn as a 2D board and no rig is replaced by billboards. The pixel look comes from how the scene is **presented** and from a flat UI kit drawn on top. Codixel runs in Node under `tools/pixel/` at authoring time. It never runs on the server or in the client.

### 13.2 The palette (authoring)

1. In `tools/pixel/palette.mjs`, build ramps with `P.hueRamp(n, { hue, shift, sat, light })` so darker steps move cool and lighter steps move warm: ink/teal (hue ~175), cream/sand (hue ~40), tomato (hue ~8), gold (hue ~42), leaf (hue ~110), plus one cool dusk-blue step for sky.
2. Allocate 16 colors: ink ramp 3, teal 2, cream ramp 3, tomato 3, gold 3, leaf 2. Verify the brand colors (`#FFF2D7`, `#233D3B`, `#224F4A`, `#DC533C`, `#F2B743`) are the middle steps of their ramps.
3. Check with `P.colorCount` that every ramp step is used and no color covers more than half of a typical frame.
4. Save `public/pixel/palette.png` (16×1) and `palette.json`.
5. Because weather tints the whole scene (sunset, sun, rain), generate **three** palette variants by shifting the ramps (warmer, brighter, cooler and darker), so the snap does not band or flicker when weather blends. The shader blends between the three lookup tables by the existing weather blend value.
6. Preview-first (Codixel rule): a sheet from `P.sheet` shows the palette swatches next to a still of the **real scene** with and without the snap. It is saved over one preview file. The palette is imported into `public/pixel/` only after you approve that sheet. The decision is logged in `docs/build-log.md`.

### 13.3 The render pipeline (client)

```text
R3F Canvas (internal resolution = CSS size / K, K integer)
  → scene renders into a WebGLRenderTarget with NearestFilter
  → full-screen quad: Bayer dither → 3D lookup table (nearest palette color) → optional ink outline
  → default framebuffer
  → CSS upscales with image-rendering: pixelated   (or: 2D-canvas copy, see 13.4)
```

- **Integer scale.** `K` is 2, 3 or 4 by quality tier (default 3), and the canvas is sized so each internal pixel is exactly K×K screen pixels. This avoids shimmering.
- **Camera texel snapping.** The orthographic camera position snaps to multiples of the world size of one internal pixel along the camera's right and up vectors. Without it, panning makes pixels crawl.
- **Lookup table.** `tools/pixel/make-lut.mjs` writes `lut-{sunset,sun,rain}.png`, each a 32×32×32 table flattened to 1024×32, mapping each quantized RGB to its nearest palette color. The shader does one texture fetch per pixel (no loop over 16 colors). Dither is applied before the lookup, using the 4×4 Bayer matrix (`P.BT`) at an adjustable strength.
- **Ink outline (tier-dependent).** A Sobel filter on the render target's luminance in the same quad, drawing 1-pixel `ink` edges. No second scene pass.
- **Antialiasing off.** `antialias: false` suits the pixel look and saves GPU time. Shadows switch from `PCFSoftShadowMap` to `BasicShadowMap` for hard pixel shadows.
- **Implementation.** In `RestaurantScene`, a `<PixelPass>` component takes over rendering with `useFrame(..., 1)`: render the scene into the target, then render the quad. No extra dependency.
- **Picking.** R3F listens on `gl.domElement`. When the visible canvas is a 2D copy (13.4), set `eventSource` to the wrapper element so pointer events still reach the scene.
- **Gate.** If a still of the real scene looks worse with the 16-color snap than with plain downscale plus posterize (lit scenes with shadows and tints can band), try 32 colors, then the per-weather tables, then ship downscale-only. This is an art-direction decision made from the approved preview sheet.

### 13.4 The Android WebView copy

The claim that Reddit's Android WebView composites WebGL as a black canvas is not in the docs we read, so it is a spike (S2), not an assumption.

- Behind a runtime flag, after each render call `ctx2d.drawImage(glCanvas, 0, 0)` into a **low-resolution** 2D canvas in the same task as the render (no `preserveDrawingBuffer` needed), with `imageSmoothingEnabled = false`.
- The 2D canvas stays at the internal resolution and **CSS** upscales it with `image-rendering: pixelated`. This costs far less than blitting a full-size canvas.
- The flag turns on automatically if a test frame reads back all black on the first frames, and can be forced from a `?canvasCopy=1` debug URL.

### 13.5 The UI kit (drawn with Codixel)

Everything below is a simple object, so Codixel draws it in code without a reference image. The process for each family is the same:

1. Draw it in `tools/pixel/<family>.mjs` using `P.Buf`, `P.rect`, `P.line`, `P.field`, `P.band` and the palette ramps. Add structure with `P.outline` or `P.selout` using colors from the sprite's own ramp.
2. Check it as Codixel requires: `P.edgeCheck` finds no nubs, strips or holes; `P.colorCount` shows the ramp in use; look at it at 1× and zoomed.
3. Put the family on **one** preview sheet with `P.sheet`, saved over the same file, and read it yourself.
4. **Wait for your approval.** Only then write `P.pack` atlases and any other game file.
5. Log the approval in `docs/build-log.md`.

| Family | Contents | Size | How it reaches the page |
|---|---|---|---|
| Frames | Panel, button (normal, hover, pressed, disabled), tab, pill, tooltip, toast, card | 24×24 with 8-px corners | CSS `border-image` 9-slice with `border-image-slice` in source pixels and width scaled by `--px` |
| Bars and pips | Progress segment, patience bar, challenge pip, star on/off, coin | 8–16 px | Atlas sprite |
| Icons | About 40: build, team, menu, ledger, pause, play, 1×/2×/3×, sound on/off, close, check, camera, rotate, zoom ±, neighborhood, comment, flair, follow, lock, door, weather ×3, headline ×7, furniture ×8, dishes ×12 | 16×16 | Atlas via a `<PixelIcon name>` component |
| Award stamps | Six banners | 48×48 | Atlas |
| Thought bubbles | Nine-slice bubble plus glyphs: heart, coin, clock, "!", "?", broom, sparkle, lantern | 24×24 frame, 8-px glyphs | Drawn on the overlay canvas |
| Species portraits | Mouse, crocodile, rabbit, bear | 24×24 | Captured from the real 3D rigs (see below) |
| Splash still | The rooftop at dusk | 320×200 | A PNG used by `splash.html` |

- **Portraits and the splash still are captures, not redraws.** Playwright renders the real scene (or one rig head), then the image goes through the Codixel photo route: `P.resize` → `P.quantize(buf, 16, { palette, dither: true })` → `P.cleanup({ tol: 20 })` → `P.smoothEdge` → `P.selout` for sprites. This keeps the animals exactly the ones in the game.
- **Atlas.** One `ui.png` made by `P.pack` and a `ui.json` map of names to rectangles. A `<PixelIcon>` uses `background-position` and `background-size` at integer multiples with `image-rendering: pixelated`.
- **Integer UI scale.** A CSS variable `--px` (2 on phones, 3 on large screens) scales every sprite. Layout uses multiples of `--px`.
- **Thought bubbles in the world.** DOM `Html` overlays (used today in `Diners.tsx` and `Stations.tsx`) cost one DOM node per guest and re-project every frame. They are replaced by one 2D overlay canvas over the scene. Each frame, guest positions are projected from 3D to screen and bubbles are drawn from the atlas at integer scale. The overlay is at full resolution so text and glyphs stay legible; only the 3D scene is at internal resolution.
- **Fonts.** **Silkscreen** (OFL, `@fontsource/silkscreen`) for labels, numbers and buttons. For paragraphs a pixel-friendly body face such as **Pixelify Sans** (OFL, `@fontsource/pixelify-sans`; verify it exists, else keep Nunito at 14 px or larger). Both are bundled, with no remote fetch. `-webkit-font-smoothing: none` and sizes in multiples of 8 px. Fredoka stays on the restaurant sign inside the 3D world only.
- **Radix and Sonner stay for behavior** (focus trap, keyboard, ARIA) and are restyled with the kit. Lucide is replaced by the atlas icons and removed from the bundle.
- **No default components visible.** This addresses the Overview's "unstyled generic components" and "AI slop" warnings.
- **Reduced motion.** No bounce and no rain streaks; the pixel scale does not change.

### 13.6 Marketing assets

- `marketingAssets.icon`: a 1024×1024 PNG. Draw the 64×64 original in Codixel and scale it with nearest neighbor.
- In-app catalog assets (set in the developer portal; they take effect only after approval, but produced anyway): app icon, featuring asset, tile image, featuring description, tile tagline, game category.
- Devpost gallery: screenshots at 390×844 and 1280×800, from the real pipeline.
- README banner: the splash still.

## 14. Audio and provenance

- Existing files in `public/assets/audio/`: `music.mp3`, `chop.mp3`, `served.mp3`, `engine.mp3`, `horn.mp3` (812 KB total).
- **Provenance first.** `docs/assets-provenance.md` records the source and license of every audio file, every GLB in `public/assets/models/` (9 files, 4.3 MB), and every font. Devpost requires that we own or are licensed for everything. Anything unclear is replaced before submission.
- **Two new beds, generated with Web Audio** (a few oscillators on a pentatonic scale and filtered noise): a quiet bed for doors closed, and a rain layer that ducks the service track whenever the weather is rain. No new files, no rights question, no bundle weight.
- Three beds total: doors closed (generated), service (`music.mp3`), rain layer (generated). Chop and the serve sting stay tied to sim events and to the pass.
- **Reddit requirements:** sound plays only after the first tap, there is a visible mute button, and everything mutes on `visibilitychange`. One speaker toggle.
- Traffic audio (`traffic-audio.ts`) stays, off by default.

## 15. Devvit architecture

Web layout. Server bundle is CommonJS, client is ESM. Node 24 for the CLI (the Devvit template requires 24 or newer). Vitest stays on the sim.

```text
devvit.json
src/server/index.ts        Hono, bundled to dist/server/index.cjs
src/client/splash/         inline entry (no three.js)
src/client/game/           expanded entry: the current React app, retargeted
src/management/            pure sim, imported by client and server
src/game/                  KitchenEngine
src/scene/                 3D scene
tools/pixel/               Codixel authoring (excluded from upload)
public/                    pixel kit, models, audio
```

```json
{
  "$schema": "https://developers.reddit.com/schema/config-file.v1.json",
  "name": "flip-and-fry",
  "post": { "dir": "dist/client", "entrypoints": {
    "default": { "entry": "splash.html", "height": "tall" },
    "game": { "entry": "game.html", "height": "tall" } } },
  "server": { "dir": "dist/server", "entry": "index.cjs" },
  "permissions": {
    "redis": true, "realtime": true, "journeys": true,
    "http": { "enable": false },
    "reddit": { "enable": true, "scope": "moderator",
      "asUser": ["SUBMIT_COMMENT", "SUBSCRIBE_TO_SUBREDDIT", "SUBMIT_POST"] }
  },
  "menu": { "items": [
    { "label": "Post today's service", "forUserType": "moderator", "location": "subreddit", "endpoint": "/internal/menu/post-today" },
    { "label": "Highlight today's post", "forUserType": "moderator", "location": "subreddit", "endpoint": "/internal/menu/highlight" }
  ] },
  "scheduler": { "tasks": {
    "roll-day": { "endpoint": "/internal/scheduler/roll-day", "cron": "5 0 * * *" },
    "night-report": { "endpoint": "/internal/scheduler/night-report", "cron": "50 23 * * *" }
  } },
  "triggers": {
    "onAppInstall": "/internal/triggers/install",
    "onAppUpgrade": "/internal/triggers/upgrade",
    "onCommentDelete": "/internal/triggers/comment-delete",
    "onPostDelete": "/internal/triggers/post-delete"
  },
  "settings": { "subreddit": {
    "neighborhoodName": { "type": "string", "label": "Neighborhood name", "defaultValue": "The Roof" },
    "openDoors": { "type": "boolean", "label": "Allow open-door visits", "defaultValue": true }
  } },
  "marketingAssets": { "icon": "public/pixel/icon-1024.png" },
  "scripts": { "dev": "vite build --watch", "build": "vite build && node scripts/build-server.mjs" },
  "dev": { "subreddit": "flip_and_fry_dev" }
}
```

The `scope` and `asUser` values, the `settings` shape and the `SUBMIT_POST` entry are to be confirmed against the schema on the first scaffold (they are small differences from the docs' examples). Cron timezone is undocumented, so every cron job is idempotent and everything important also runs lazily on request.

### Routes

Client-facing routes start with `/api/`. Menu, scheduler and trigger routes start with `/internal/`. Identity comes from `context` on the server; a user id in the body is ignored.

| Route | Behavior |
|---|---|
| `GET /api/today` | Headline for the UTC date; creates the daily post if missing (lazy roll); the player's park; the locked receipt; streak; neighborhood counts |
| `POST /api/open` | Load the stored park, apply the posted planning actions with the engine, mix in the headline seed, add present visitors, store the opening snapshot, return its id |
| `POST /api/lock` | Replay snapshot plus service actions. Store the receipt if it beats today's. Set the streak bit. Write the journey end |
| `POST /api/save` | Apply planning actions to the park (revision-checked) |
| `POST /api/presence` | Heartbeat for presence diners |
| `GET/POST /api/door/*` | Open, close, list, visit, and finish an open-door service |
| `POST /api/coop/*` | Create, join, act, commit, snapshot |
| `POST /api/comment` `POST /api/flair` `POST /api/subscribe` `POST /api/post-kitchen` | The explicit Reddit actions |
| `GET/POST /api/arcade` | Arcade progress and outfits |
| `/internal/scheduler/roll-day` `/internal/menu/post-today` | Same function, idempotent |
| `/internal/scheduler/night-report` | The app's nightly comment |
| `/internal/triggers/*` | Install (flair templates, first post), upgrade (migrations), delete triggers (idempotent; triggers can fire more than once) |

### Redis

Redis is per installation. Expiry is per key, so personal data lives under per-user keys, not shared hashes. There is no key scan, so every key is derived from known ids. Limits: 100 MB for an unpublished app, 40,000 commands/s, 5 MB per request.

| Key | Type | Contents | TTL |
|---|---|---|---|
| `posts` | hash | `YYYY-MM-DD` → `{postId, stickyId}` (a lock key prevents double creation) | none |
| `park:{uid}` | string | Latest `RestaurantState` plus `rev` | 30 days, refreshed on write |
| `profile:{uid}` | hash | username, streak summary, flags (`subscribed`) | 30 days |
| `streak:{uid}:{year}` | bitfield | One bit per UTC day | 400 days |
| `opens:{date}` | hash | uid → opening snapshot | 30 days |
| `runs:{date}` | hash | uid → official receipt, action log, `submittedAt`, `commentId` | 30 days |
| `lb:{date}` | zset | uid scored `stars*1_000_000 + rating*1000` | 45 days |
| `community:{date}` | hash | counts per award, opens, locks | 45 days |
| `presence:{postId}` | zset | uid scored by last heartbeat | 2 minutes |
| `door:{uid}` / `doors` | string / zset | open-door snapshot; list by last played | 30 days |
| `bulletin:{uid}` | zset | canned visitor notes, newest first, capped at 20 | 30 days |
| `coop:{sessionId}` / `coop-index:{postId}` | hash / zset | co-op snapshot and log; sessions by heartbeat | 1 day |
| `arcade:{uid}` | hash | shift stars, outfits | 30 days |
| `comments` | hash | commentId → `userId:date` (for the delete trigger) | none |
| `recent-dates` | zset | dates still inside the retention window | none |

`zRange` by score returns at most 1,000 entries. The top-five board uses `zRange` by rank with scores. Rank is stars, then rating, then earlier `submittedAt`. Comment text is never stored. Deleting a post or comment drops its ids through the triggers. The documented trigger list has no account-deletion event, so the TTLs are the backstop; do not copy a park anywhere else.

### The daily post

`rollDay(date)` is called from the cron, the moderator menu and lazily from `GET /api/today`:

1. `hSetNX posts date 'pending'`. If it already holds a post id, stop.
2. `reddit.submitCustomPost` as the **app**, entry `default`, with `postData: {date, headlineId}`, `textFallback` (Markdown: headline, how to play), and the headline as post flair. Title: `Today on the roof · Nov 18`.
3. `reddit.submitComment` as the app: "Results for today go under this comment." Save it as `stickyId`.
4. Write `posts[date]`. Highlight the post if the app has mod permission.

An older post's webview still calls `GET /api/today` and rolls to the new headline at midnight.

## 16. Documentation and submission package

- **README.md (required, replace the current one).** Contents: what the game is, how to play in five lines, the daily headline, how the park is saved, how a moderator posts today's thread and sets the neighborhood name, what runs as the app account before approval, controls (touch and keyboard), accessibility, third-party credits, and the port statement.
- **Devpost description.** Features and functionality; that it is a **port of a game we own** (the browser restaurant tycoon, tag `pre-devvit`), and the list of what was significantly updated: the Redis-backed park, the daily headline, the server-verified lock, the pixel presentation, the pass and Test Kitchen, and the Reddit features in section 3.
- **Demo video (optional, under 1 minute).** Shot list: splash in the feed, tap Open, a rainy service with a guest thought, a pass cook, the result card with stars and award, the flair and comment buttons, the neighborhood line. Footage from a phone.
- **Public repository (optional).** Yes.
- **Feedback and helpers.** Keep `docs/devvit-feedback.md` as we hit issues, and submit the developer survey before 8 Dec 6 pm PT for the Feedback prize. Help others in Discord and r/devvit for the Devvit Helper prize. These are individual prizes and do not affect the one-prize-per-project rule.
- **Build log.** Every decision and feature gets an entry in `docs/build-log.md` before the work is called done (`.claude/rules/build-log.md`, `.cursor/rules/build-log.mdc`).

## 17. First things first

Nothing is built until these are done, in this order.

1. **Baseline.** `git tag pre-devvit`. Install dependencies (`node_modules` is not present, and the repo has a `bun.lock` but no npm lockfile; use `npm`, because the Devvit CLI and the scripts assume it, and commit the new `package-lock.json`). Run `npm run lint` and `npm test`. Record the green baseline in the build log. Record frame time and bundle size **without changing anything**, in `docs/perf-log.md`.
2. **Accounts and places.** Node 24. `devvit login`. Create a **public** subreddit with under 200 members (`r/flip_and_fry_dev` was created by `devvit upload`; use it or a separate demo subreddit). Install `dr-admin-approve`. Join the Devvit Discord and r/devvit. Apply for the push-notification beta.
3. **Spikes.** Each one has a pass condition and a fallback, and its result goes in the build log.

| Spike | Question | Pass | Fallback |
|---|---|---|---|
| S1 | Does the current R3F scene run in expanded mode in the Reddit iOS and Android apps? | Draws, steady frames, taps work | Reduce `dpr`, disable shadows; this sets the quality tiers |
| S2 | Does WebGL composite black on Android? | A frame renders non-black | Turn the 2D-canvas copy on (13.4) |
| S3 | Does an image from Reddit's CDN load in the webview (snoovatar)? | Loads | Pixel face from the user id |
| S4 | Can a Web Worker and a service worker register in the webview? | Registers | Main thread only, rely on HTTP caching |
| S5 | Can the app account set user flair and create flair templates? | Works on the demo subreddit | Document the mod step in the README |
| S6 | What timezone does `cron` use? | Observed from a test job | Lazy roll already covers it |
| S7 | Realtime delivery latency and reconnection on a phone | Under 500 ms typical | Raise the co-op input delay |
| S8 | Does `permissions.media` work unpublished? | Upload succeeds | No image share |
| S9 | Does audio start after the first tap and mute on hide? | Yes | Fix before the audio phase |
| S10 | Are the existing GLBs and audio licensed? | Provenance recorded | Replace |

4. **Scaffold** `devvit.json`, the Hono server and the two client entries on a hello-world path, run `devvit playtest` on the demo subreddit, and open it on a real phone. Then S1–S9.

## 18. Build order (dependency order, nothing dropped)

| Phase | What | Needs |
|---|---|---|
| P1 | Deterministic core: E1, E2, E3, E4, the action-log type, `runService`, the cross-engine hash test | First things |
| P2 | Headline, shared daily challenges (E7), weather source (E6), discount lift (E5), the bots | P1 |
| P3 | Server: park, open, lock, lazy daily post, streak bitfield, comment, flair, subscribe, triggers | P1, P2 |
| P4 | Client shell: splash, expanded entry, dock collapse, result card, auto-lock, journeys | P3 |
| P5 | Pixel presentation and asset kit (section 13), including the palette preview approvals | P4 |
| P6 | Tycoon depth: dishes refactor, starter staff and owner delivery, bills, comfort gap, thoughts, kitchen card, awards, company value, contracts, research, regulars, menu styles | P1–P5 |
| P7 | The pass in ticket mode, then the whole `KitchenEngine`: Test Kitchen, wardrobe, Redis persistence, touch controls | P4, P6 |
| P8 | Reddit social: presence diners, open doors and sample kitchens, hosted co-op, kitchen posts, night report, highlight, settings, text fallback, forms, toasts | P3, P6, P7 |
| P9 | Audio: generated beds, rain layer, mute rules | P5 |
| P10 | Full verification and a soak (section 19, G11) | P1–P9 |
| P11 | **Optimization** (section 20), only after P10 passes | P10 |
| P12 | Submission package (section 16) | P11 |

## 19. Tests, by stage

A stage is done when its gate passes. Run the earlier gates again before each new one. Every commit runs lint, type-check and the unit tests.

### G0 Baseline
- `npm run lint`, `npx tsc -b`, `npm test` (unit and browser) all green on the untouched repo. Record the count of passing tests.

### G1 Platform spikes (manual, recorded)
- S1–S10 results recorded with device, OS, Reddit app version and the decision taken.

### G2 Deterministic core (`src/test/`)
- `determinism.test.ts`: the same snapshot and empty log gives the same receipt hash across 200 seeds.
- `replay-parity.test.ts`: a live run and a headless `runService` agree for random action logs.
- `cross-engine.browser.test.ts`: the receipt hash from Node equals the hash from Chromium and WebKit (Playwright) for 50 fixtures. **This is the canary for co-op and the lock.**
- `no-nondeterminism.test.ts`: greps `src/management` for `Math.random`, `Date.now`, `performance.now`, `Math.hypot`.
- `autoroll.test.ts`: with `autoRoll` off `finish()` stops at a receipt; with it on, the existing continuous-days tests still pass.
- `migration.test.ts`: v1 saves migrate to v2 without charging or completing a day twice.
- `action-validation.test.ts`: overspending, a wrong phase, an invalid layout, an unknown guest, a tick outside the service and an over-cap `comp` are all rejected.
- `fuzz.test.ts`: random legal actions never break invariants (cash identity, no negative stock, no stuck guest, layout valid).
- `dishes.test.ts`: every dish in `DISHES` can be cooked, priced, refused and challenged.
- Performance: a 240 s replay under 300 ms in Node; record it.

### G3 Headline and bots
- `daily-headline.test.ts`: pure, stable, seven distinct headlines, date seed only jitters numbers.
- `bots.test.ts` over the next 21 dates **and the exact judging dates (9–16 Dec)**: `cozyBot` earns 1★ on at least 18 of 21; `bareBot` wins on quiet and payday days and misses on inspection and critic days; `greedyBot` (+50%) beats `cozyBot` on payday and loses on a normal day.
- `stars.test.ts`: each headline's star line is reachable and unreachable by the right bots.
- `economy.test.ts`: the discount lift beats fair pricing only inside its cap.

### G4 Server (route tests against a hand-rolled fake Redis that honors per-key TTL and has no scan)
- `auth.test.ts`: a user id in the body is ignored.
- `lock-forgery.test.ts`: a posted `cash: 999999`, an edited receipt, or a forged stars value is rejected or ignored.
- `open-lock.test.ts`: open → lock round trip returns the replayed receipt; a replaced lock must be better; the streak bit is set only on 1★.
- `concurrency.test.ts`: two parallel opens, and two tabs saving, resolve through `rev` (no lost service). `watch/multi/exec` is used.
- `lazy-roll.test.ts`: parallel `GET /api/today` calls create exactly one post and one sticky.
- `triggers.test.ts`: delete triggers are idempotent and delivered twice.
- `limits.test.ts`: payload sizes, `zRange` caps, the 30 s budget, the per-key TTL on `park:{uid}`.
- `ratelimit.test.ts`: `/api/lock`, `/api/presence` and co-op routes.
- `no-fetch.test.ts`: the server never calls `fetch`; `permissions.http.enable` is false.

### G5 Client shell (Vitest browser, Playwright, at 390×844 and 1280×800)
- `splash.browser.test.tsx`: shows game name, description, date, attribution, stats and today's headline from `postData` with no network call; no wheel or touch `preventDefault`; no `touch-action: none`; no inner scroll; Lighthouse mobile above 80; loads in under 1 s.
- `inline-rules.test.ts`: static scan of the splash CSS and JS for the forbidden patterns in `scroll-traps.mdx`.
- `dock.browser.test.tsx`: the dock collapses when doors open and returns on the receipt.
- `receipt.browser.test.tsx`: one card, no second end screen, buttons are separate and optional, Continue leaves doors shut.
- `no-network.browser.test.ts`: every request is same-origin, none to a third party, none to `localStorage`-backed save.
- `a11y.browser.test.tsx`: targets at least 44 px, contrast ratios, keyboard paths, Escape, focus return.
- `reduced-motion.browser.test.tsx`: no bounce or rain streaks; the pixel scale is unchanged.
- `journeys.test.ts`: the call sequence matches the table in section 12; Start never fires on load; the client does not end a journey the server ended.

### G6 Pixel and assets
- `palette.test.ts`: `palette.png` has exactly 16 colors; brand colors are present; the three weather variants stay within hue bounds.
- `lut.test.ts`: the lookup table returns the nearest palette color for 10,000 random inputs.
- `assets-in-palette.test.ts` (`tools/pixel/verify.mjs`): every pixel of every `public/pixel/*.png` is a palette color or transparent.
- `sprite-qa.test.ts`: `P.edgeCheck` reports no nubs, strips or holes on every sprite; `P.colorCount` shows no color above half the sprite.
- `pixel-pass.browser.test.ts`: the rendered frame contains at most the palette colors (plus dither); a golden-image diff against an approved still per weather; picking through the pass still selects the right tile.
- `canvas-copy.browser.test.ts`: the 2D-copy path produces the same frame as the direct path.
- `integer-scale.browser.test.ts`: internal pixels are exactly K×K screen pixels at both viewports; camera panning does not crawl.
- Preview approvals logged in the build log for palette, frames, icons, bubbles, stamps, portraits and the splash still.

### G7 Tycoon depth
- `contracts.test.ts`: each contract can be completed and failed, and survives save and reload.
- `research.test.ts`: the budget is taken at `finish()`; thresholds unlock; a missed day does not skip.
- `regulars.test.ts`: after the third service, at most four regulars, one slot per service, "The usual" and "Not today" thoughts.
- `weather-weights.test.ts`: rain and sun change patience, tips and dish choice only through the headline or date.
- `thoughts.test.ts`: each thought maps to one engine event.
- `kitchen-card.test.ts` and `awards.test.ts`: values and the fixed banner rules.
- `starter.test.ts`: the starter park has a chef only; the first night is playable by delivery; the first hire is a server.
- Bots re-run (G3) after each balance change.

### G8 The pass and the whole `KitchenEngine`
- `kitchen-ticket.test.ts`: ticket mode builds the reduced stations; the result maps to `ready` or a burnt dish; fire still works.
- `kitchen-fixed-step.test.ts`: the fixed-step mode is deterministic; the existing `kitchen.test.ts` and the other arcade tests still pass.
- `pass-bounds.test.ts` (server): a `cook` shorter than half the base time is rejected; a claim when a chef was free is rejected; quality bonus capped at +15%; `deliver` obeys route time.
- `pass-touch.browser.test.tsx`: the joystick and buttons are at least 44 px; a ticket can be cooked with touch only at 390×844.
- `test-kitchen.test.ts`: all three shifts, solo and two-chef, tutorial, scorecard; progress and outfits round-trip through Redis; the old `localStorage` keys are not used.
- Manual: cook ten tickets on a phone and read the frame time.

### G9 Reddit social (mostly manual on the demo subreddit, with route tests)
- Comment as the owner and as a second account; confirm the app-account attribution for the second account and document it.
- Flair set and cleared; subscribe button; the note form; the nightly report comment appears once.
- Delete a comment and a post; the ids are dropped.
- Two phones in a co-op service: join, act, resync after a forced stall, host leaves.
- Presence: a second account appears as a diner at Open and is in the replayed snapshot.
- Open door: visit, canned note on the host's bulletin, close the door deletes the snapshot.
- Text fallback visible on old Reddit and in the post source.
- Journeys visible in `devvit logs` (events may be dropped until approval).
- `lockstep.test.ts`: two engines driven by the same stamped log keep the same hash for ten simulated minutes, including a forced resync.

### G10 Audio
- `audio.browser.test.ts`: nothing plays before the first tap; mute works; everything mutes on `visibilitychange`; the rain layer ducks the service track; the generated beds loop without a click.

### G11 Full verification (everything built, nothing optimized yet)
- All earlier gates green again.
- `full-loop.browser.test.ts` on a 390×844 viewport: splash → expand → open → a pass cook → receipt → auto-lock → reload → same park.
- **Seven-day run**: a script plays each of the seven headlines (and the judging dates) with a fresh and with an established park; no crash, no stuck state.
- **Soak**: ten simulated minutes at 3× with co-op active; memory and frame time recorded; no listener or texture leaks.
- **Fresh-user walkthrough** on a new account on a real phone with someone who has not seen the game: the first minute reads without help.
- **Judging-week rehearsal** on the demo subreddit: posts for 8 and 9 Dec exist, the cron fires, the lazy roll works, the sticky is in place.

### G12 Optimization gates (section 20)
- Budgets met on the target devices, and no earlier gate regresses.

### G13 Submission dry run
- README read against Devpost's list; the app listing link; the public subreddit with fewer than 200 members; `dr-admin-approve` installed; the demo post opens as a logged-out reviewer would see it; the video under one minute; the port statement and change list present; the feedback survey submitted.

## 20. Optimization (after G11 passes)

Optimization starts only when the game is complete and working. The baseline measured in section 17 is the "before". Measure first, change one thing at a time, and re-run the G2–G11 tests after each change. Record every result in `docs/perf-log.md`.

### 20.1 Measure first

- Chrome DevTools Performance with CPU throttling at 4× and 6×, Lighthouse mobile, `renderer.info` (calls, triangles, textures, geometries), `performance.measure` marks around `step()` and render, and a `?debug` frame-time overlay.
- Real targets: a low-end Android phone (about 4 GB), a mid iPhone, and the Reddit iOS and Android webviews. Desktop Chrome is not a target.
- Profile memory with heap snapshots across a ten-minute soak to find leaks.

### 20.2 Budgets (starting values, to be tuned from the baseline)

| Measure | Budget |
|---|---|
| Splash: time to first paint, transfer size | under 1 s on 4G; under 150 KB |
| Game: first interactive on a mid Android phone over 4G | under 4 s |
| Frame time | p95 under 33 ms (30 fps) on the low tier, under 16.7 ms on the high tier |
| Draw calls | under 150 on the low tier |
| GPU memory (textures and buffers) | tracked; under 128 MB on the low tier |
| JavaScript heap after a ten-minute soak | flat (no growth trend) |
| Server replay of 240 s of sim | under 300 ms |

### 20.3 Shrink load time and bundle size

- **Split bundles.** The splash has no three.js. The game entry code-splits three and R3F, the city, the Test Kitchen scene and the pass, so a first night loads only what it needs. `useGLTF.preload` of every model in `KitchenScene.tsx` is replaced by on-demand loading.
- **Compress models.** The nine GLBs total 4.3 MB; only the bulletin, bench and car (about 1.4 MB) are used by the management scene. Run `gltf-transform` with meshopt compression (decoder bundled locally; **no** CDN decoder), resize textures to 128–256 px with nearest filtering (the pixel look hides the detail), and aim for under 100 KB per model. The arcade models (burger, salad, tomato, lettuce, knife, grill) load only when the pass opens.
- **Compress audio.** Re-encode to mono at 48–64 kbps (AAC or MP3, whichever iOS and Android both play), short loops, loaded after the first tap.
- **Fonts.** Subset Silkscreen and the body face to the used glyphs; drop unused Nunito and Fredoka weights.
- **Remove dead weight.** Drop Lucide, unused Radix packages and unused shadcn components from the bundle; verify with a bundle analyzer.
- **Stream.** Heavy parts (city districts, rain buffers, the Test Kitchen) load after the first frame during `requestIdleCallback`, behind the pixel loading screen.
- **Caching.** Vite emits content-hashed files. Devvit serves the build, and the iframe URL changes per version, so the cache is cold after each upload; keep file counts low. Try a service worker only if S4 passed; otherwise rely on HTTP caching.

### 20.4 Cut CPU, GPU and memory overhead

- **Draw calls.** The scene already uses instanced `Batch` for terrace tiles and scenery. Audit with `renderer.info`, merge remaining static meshes, use a texture atlas for furniture, and cull city districts that are out of frame. Orthographic fixed zoom means no occlusion culling or LOD meshes are needed; far districts can be simplified or hidden instead.
- **Rendering cost.** The pixel pass renders at 1/K of the screen area, so GPU work falls roughly by K². Antialiasing is off. Shadow maps go to 512 and `BasicShadowMap`. The weather rain buffer is already one fixed vertex buffer; the count scales by tier (480, 240, 0).
- **DOM overlays.** The per-guest `Html` labels are replaced by one overlay canvas (13.5).
- **Idle rendering.** When paused with no animation, switch the Canvas to `frameloop="demand"`. Stop rendering when `document.hidden`.
- **Garbage collection.** Known allocations to remove: `route()` copying `path.map(point => ({...point}))` and building a layout key with `JSON.stringify` on each call; the repeated `s.guests.filter` and `find` in `step()` and `arrive()`; per-frame vectors in `useFrame` (reuse module-level `THREE.Vector3`). Pool temporary objects and pre-allocate arrays in loops. These also speed up the server replay.
- **Simulation off the main thread.** Catch-up (`resume()`), co-op fast-forward and any large replay move to a Web Worker if S4 allows; otherwise they run in time-sliced chunks as `resume()` already does.
- **Dispose.** Dispose geometries, materials and render targets when a district or the Test Kitchen unmounts, and on WebGL context loss (already handled by pausing).
- **Memory.** Cap `incomeReceipts` and thought lists; keep atlases to one texture each.

### 20.5 Quality tiers

At startup, pick high, medium or low from `navigator.hardwareConcurrency`, `navigator.deviceMemory` (where present), the renderer string from `WEBGL_debug_renderer_info`, and the **measured** frame time over the first three seconds. Step down at runtime if the p95 frame time exceeds the budget.

| Tier | K | Rain | Shadows | Outline | City density | Frame cap |
|---|---|---|---|---|---|---|
| High | 3 | 480 | 1024 | on | full | 60 |
| Medium | 3 | 240 | 512 | on | reduced | 60 |
| Low | 4 | 0 | off | off | minimal | 30 |

### 20.6 Server and network

- Replay speed is covered by the garbage-collection work above.
- Batch Redis reads (`mGet`, `hMGet` where enabled) and never `hGetAll` on a large hash.
- Keep payloads small: send a diff of the park, not the whole thing; compress long action logs.
- Co-op messages stay at a handful per minute per session.

### 20.7 Regression guard

`scripts/perf-check.mjs` fails the build if the splash, the game bundle, any GLB or the total audio exceeds its budget, and a Playwright trace compares frame time against the recorded baseline. Optimization is done when G12 passes and G2–G11 still pass.

## 21. Rules we build around

- Original name and animals. No Snoo, no Reddit logo, no "Reddit" in the title or theming.
- No link to a web build or another store. The Reddit post is the whole game.
- No payments, no external accounts, no client fetch to other domains, no LLM at runtime.
- Comments, flair, subscribe and "Post my kitchen" are separate explicit buttons. None gates a service, and nothing is automated.
- Upvotes and karma never change the simulation. A mechanic that rewards votes is vote manipulation.
- Do not store comment bodies. Delete ids on the delete triggers.
- The restaurant name is the only free text. Allowlist letters, numbers, spaces and apostrophes, 28 characters (the current schema). The 80-character note is previewed, sent as the player, never stored.
- The tone stays food, weather and animals.
- Do not run `devvit publish`. Upload and playtest only. If a feature works only after publish, record it in `docs/build-log.md` and ship a playtest path.

## 22. Technical fallbacks

These replace a technique, not a feature:

- If the 16-color snap bands badly: 32 colors, then the per-weather tables, then downscale-only (13.3).
- If WebGL composites black on Android: the 2D-canvas copy (13.4).
- If the CDN image does not load for snoovatars: the pixel face.
- If lockstep hashes diverge across devices: tighten the determinism rules, add the forced resync, and fall back to a larger input delay.
- If a Web Worker is blocked: time-sliced catch-up on the main thread.
- If `permissions.media` needs review: the comment stays text-only.

## 23. Done when

A judge opens the demo post, with no one in the room, and can:

- See the splash with the game name, description, date, attribution and stats, then tap **Open** and be in the pixel rooftop.
- Open the doors without a tutorial wall, and watch the same 3D animals and paths, in pixels, run a service they did not script, with a guest thought that explains a surprise.
- Cook a ticket at the pass on a phone.
- Build or reprice with the doors closed, and see Welcome, Speed or Value move on the next receipt.
- Read one card: stars, an award, the contract, the near miss, tomorrow's headline, and the neighborhood count.
- Reload and find the same park, the lock, and the contract.
- Optionally comment, wear flair, follow, leave the door open, or invite a friend into the service, each as its own choice.
- Come back the next UTC day to a new headline on the same restaurant.

And the repo shows: the cross-engine receipt hash match, the three bots hitting their gates on 21 dates and the judging week, journey calls matching section 12, no external request from the client, every pixel asset inside the palette, the whole `KitchenEngine` mounted, the performance gates passing, and a README that matches the Devpost requirements.
