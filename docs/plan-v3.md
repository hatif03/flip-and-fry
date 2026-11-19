# Plan v3: from "watch a simulation" to "a game you play all day"

Written 19 November 2026, after the phone test of 0.0.19. Status of the earlier plans: [`plan-status.md`](plan-status.md). Deadline: **Tue 8 December 2026, 6 pm PT**; feature freeze proposed **Sat 5 December** (the last three days are fixes, the demo video and the form).

The author's words: *"a lot of things are simulated; take every opportunity for the user to play; think Clash of Clans, FarmVille 2."* This plan answers that and also builds the two things earlier plans refused: a **shorter first service** and a **bankruptcy rule**.

## 1. What is wrong, in one table

Today a night is: guests arrive, are seated, order, are cooked for, are served, pay and are cleaned up by the team. The owner can optionally cook. Between nights the owner buys furniture, hires and prices. Measured: a player who only taps Open earns a star on 4 of 21 nights, so hands matter, but only one of about eight steps of a night is the player's.

| Game | What the player does, all the time | What our game has instead |
|---|---|---|
| Clash of Clans | Designs the base layout; keeps builders busy on timers; trains an army; raids; the clan donates | A layout that does little; instant purchases; no timers; no raid; neighbors only visit |
| FarmVille 2 | Clears land, plants, waters, harvests on timers; crafts in workshops; fills the order board; co-op trades | Planters are decoration; cash buys everything; ingredients are a number; no orders |

Two timescales are missing: **minutes to hours between nights** (the reason to open the game three times a day) and **seconds inside a night** (the reason to keep your thumb on it).

## 2. The design in one paragraph

**You own the roof and run the night.** By day you grow and prepare: plant a rooftop garden, water it, harvest, craft stock and dough in the workshop, keep your builder busy upgrading stations, fill the order board, and arrange your room for the headline. In the evening you are the host and head chef: you seat parties, take orders, flip, fry and toss at the stations, clear tables and handle what the night throws at you, with a **hustle** meter that rewards a chain of good actions. The team is still there as a safety net, slower than you. Your neighbors' subreddit is your clan: a block-party goal, a shared fridge, and cooking together.

## 3. Rules that keep it fair and testable

These are the contract every new activity follows. They are why this can be built in 16 days and not break the server's verification.

1. **Two kinds of state.**
   - *The night* (`RestaurantState` plus the owner's tick-stamped actions) is replayed by the server. Everything inside a night is deterministic and goes in the action log.
   - *The world* (garden, workshop, builders, orders, XP, storage, community) lives in Redis next to the park, runs on the **server clock** (`readyAt` timestamps), and is changed only through its own routes. It is not replayed. It reaches the night only as inputs copied into the opening snapshot: pantry stock, finished upgrades, the shift, the event seed. The existing `casUpdate` and the per-route rate limits protect it. Changing the phone's clock changes nothing.
2. **The team is a safety net, never the main act.** Every new player action has an automatic fallback that is slower, so doing nothing still works and a new owner is never stuck.
3. **Nothing deletes progress.** Names, stars, streak, records, regulars, research and outfits are never touched by any rule below. A missed day costs yield, never the plot.
4. **One engine version bump.** All rule changes land together as `version: 2` of the saved state (older saves load with defaults) and the golden hashes and star lines are recalibrated **once**, with new bots (section 4). After that only the server, the screen and the world change.
5. **No new currency or payment.** Cash, XP and the existing stars. No payments, no pay-to-skip, no taking from other players.

## 4. Phase 1: Engine v2, the night you play (20 to 25 Nov)

Everything that changes the replayed rules, once.

### 4.1 A shorter first service (the refused item, solved)

The reason it was refused: the service length is a constant (`DAY_LENGTH`, 150 s) used by every replay, bot, board and the clock. The fix is to make it a **property of the night**, not of the game.

- A **shift** is stored in the opening snapshot: `lunch` (60 s of service, about 6 guests), `dinner` (150 s, as now), `banquet` (240 s, unlocked at level 5). A single `shiftLength(state)` replaces the constant in the ten or so places that read it (the engine, `MAX_SERVICE_TICKS`, the bar, the clock, the bulletin, the session's halfway mark). The replay reads it from the snapshot, so it stays deterministic.
- **The first night is always lunch.** A new player is in the game for 60 seconds, not 150, and sees a result card in under two minutes.
- **Lunch is also a second official service every day.** Same headline, a lighter goal ("serve 5 and finish in profit"), its own board (`lb:<date>:lunch`) and its own stars. A star in either counts for the streak. That is a second reason to open the post (lunch now, dinner later) and is the retention lever the plan v2 metrics asked for.
- The board never compares a lunch with a dinner. Goals and boards are keyed by `(date, shift)`; the card says which shift it was.

### 4.2 Hands on the floor (replace the simulated steps)

Each step below is a service action (tick-stamped, replayed, at most one per step) with an automatic fallback after a delay. Engine v2 makes the fallbacks slower than v1's instant floor, which is what gives the player's hands weight.

| Step | Player action | If the player does nothing |
|---|---|---|
| Greet and seat | Parties wait at the door with a patience ring. Tap a party, tap a table. A good match (window seat for the critic, a lantern for a couple) earns hustle | The host seats them after 6 s, at the first free table |
| Take the order | Tap the table's order bubble | A server takes it after 5 s |
| Cook | Exists (Cook, Prep, Plate). **New: station moves.** Grill: *flip* once in the window. Fryer: *lift* on the beep. Wok: *toss* twice in rhythm. Pot: *stir* (hold). Each is a tick-stamped tap whose timing the engine scores, like Prep | The chef cooks it at normal quality |
| Garnish | Pick a herb from the pantry for a quality bump | None |
| Serve | **Hand off** a ready dish to speed the server | The server carries it |
| Clear | Tap a dirty table | A server cleans it |
| Events | A deck of one to three per night, from the date: *allergy (swap an ingredient)*, *complaint (comp, discount or apologise)*, *critic walks in (three perfect plates in a row)*, *grease fire (tap to put it out)*, *supplier at the door (take the deal or not)*. Each is one decision | The default choice applies and costs a little |

**Hustle.** Each good action adds one to a chain; the chain drops after 8 idle seconds; the chain multiplies tips (up to ×1.5) and adds guest patience. It is shown as a meter. It is computed from the action ticks only, so it replays exactly. Calibration note: the team alone never builds a chain, so a hands-off night stays at the v1 level.

### 4.3 Stakes, built in (the bankruptcy rule, solved)

The reason it was refused: bankruptcy that deletes the restaurant destroys the thing people return for. The Clash of Clans answer is that a raid takes loot, never the base. **Foreclosure takes things, not the restaurant.**

1. **Bills** are already on the night bar. Cash below zero at closing draws the recovery loan, as now.
2. **Final notice.** Debt of $450 or more, or two loss-making nights in a row. A banner on the planning screen says what happens next, so it is never a surprise.
3. **Foreclosure** at the next closing in which the notice still stands:
   - the bank takes the three most valuable pieces that are not the last table or the last piece of a needed station, and puts them in **Storage** (they are not destroyed: buy each back in planning for 60% of its price);
   - the crew above the starter two is let go (rehire at normal price);
   - the debt is cleared to zero;
   - reputation falls by 0.6 (not below 2.0);
   - a "Fresh start" line goes in the ledger.
4. **Kept, always:** the name, every star, the streak and freezes, records and best company value, regulars, research, outfits, layout slots, XP and the garden.
5. **Guard rails:** not in the first seven nights; at most once a week; the loan is capped below what the bank takes, so it can never be farmed.

Tests: a scripted losing owner reaches the notice and then the foreclosure on the expected nights; no bot on the 21 dates or the judging week ever reaches a notice; storage round-trips through save and load.

### 4.4 Other engine v2 fields

`furniture.level` (1 to 3: a grill at level 2 cooks 20% faster, at level 3 holds two dishes), `pantry` (ingredient counts; a dish uses stock first, cash if there is none, so a night with no stock is exactly v1's cost), `shift`, `storage`, `notice`, `eventSeed`, and `hustle`. Zod defaults make older saves load.

### 4.5 Recalibration (once)

New bots: **auto** (no actions), **helper v2** (seats, orders, cooks with station moves, clears), and the existing three planning bots. Gates: auto earns the welcome goal on nights 1 to 3 on every date; auto earns the headline goal on at least 8 of 21 dates; helper v2 on at least 19 of 21; a hands-on night beats an auto night in profit on at least 90% of dates; the judging week stays playable. Goldens are refreshed once, with the reports shown unchanged for nights that touch no new rule.

**Done when:** the new calibration, replay-equality (live helper v2 equals server replay) and foreclosure tests pass; the 3-engine hash test passes; a phone screenshot of the new service screen is in the build log.

## 5. Phase 2: The world, between nights (26 Nov to 1 Dec)

Server module `server/core/world.ts`, routes under `/api/world/*`, a lazy-loaded **Garden** tab, and small 3D beds on the roof. All timers are `readyAt` server timestamps; a client shows a countdown. Plots never die: an ignored crop waits at 50% yield after 24 hours.

| Activity | Source of the idea | How it works | Feeds the night |
|---|---|---|---|
| **Rooftop garden** | FarmVille 2 plant, water, harvest | 2 plots, up to 8 by level. Six crops (tomato 20 min, basil 40 min, lettuce 1 h, chili 3 h, scallion 6 h, mushroom 12 h). Water once to take 25% off the timer. Harvest adds to the pantry | Pantry: free ingredients and fresher dishes (a "rooftop-grown" tip bonus) |
| **Workshop** | FarmVille 2 crafting | Stock pot (stock, 2 h), dough bench (dough, 1 h), jar shelf (pickles, 8 h). One job per station, real time | Prepared components cut a dish's cooking time by 30% |
| **Builders** | Clash of Clans builders | One builder at the start (a second at level 4). An upgrade (station level, expand, a new station) is a timer from 15 minutes to 12 hours and cannot be rushed with cash beyond one "overtime" use a day | Finished upgrades enter the next opening snapshot |
| **Order board** | FarmVille 2 order board | Three neighbors a day (named, from the date) ask for ingredients or prepared goods. Delivering gives cash and XP | A second daily session that is not service |
| **Layout slots** | Clash of Clans base layouts | Three saved layouts, switched in planning for free: a *rush* layout, a *cozy* layout, an *inspection* layout. The headline of the day tells you which to pick | Layout and the headline finally interact |
| **Level and XP** | Town Hall / farm level | XP from perfect plates, harvests, crafts, orders and stars. Level gates plots, the second builder, stations and the banquet shift | Pacing, so there is always a next thing |
| **Staff roster** | Clash troops | Assign a chef to a station (a specialist cooks that station's dishes faster); a rested crew works better. Default is automatic, so bots are unchanged | A choice that is not only "hire more" |

A **Tasks strip** under the header is the one place that says what needs you: "2 crops ready · builder free · order 1 of 3". Phones show it as one line of badges (FarmVille's "ready" marks and Clash's builder bar are the model).

**Done when:** world routes pass fake-store tests with a faked clock (growth, early harvest refused, 24-hour wilt, builder queue, one builder busy, level gates); the opening snapshot carries pantry and finished upgrades; a night with a stocked pantry replays identically on the server; rate limits are tested.

## 6. Phase 3: The block (2 to 4 Dec), the Reddit-native part

The subreddit is the clan.

- **Block party.** A weekly community goal ("this community earns 150 stars"), fed by verified results. Reaching tiers puts a banner and lights on every member's roof and releases a small cash gift. Redis: one counter per community per week; the scheduler already runs the weekly reset.
- **Shared fridge.** Once a day a player can leave one surplus ingredient; once a day another can take one (Clash's troop donation). A hash with a TTL, names optional, nothing from a stranger can be negative.
- **Cook together and visit** already exist; the order board adds "deliver to a neighbor's kitchen" as a one-tap gift later if time allows.
- **Labels, not matches.** Boards show a level badge next to names so a level 9 owner is not read against a level 2 one.

**Refused:** stealing or raiding other players (Reddit communities are not PvP), chat, any currency for sale.

## 7. Assets: what is needed, where it comes from, and the budget

The scene is built from primitives in code (`Box`, `Cylinder`), the soundtrack and effects come from the WebAudio mixer, and only a few models are files. That is the cheapest route and keeps the build inside the budgets in `scripts/perf-check.mjs` (initial JS 480 of 650 KB, models 731 of 900 KB, audio 347 of 450 KB).

| Need | Made how | Size |
|---|---|---|
| Garden beds with three growth stages for six crops, scarecrow, watering motion | Code, from primitives | 0 KB of files |
| Builder scaffold and hammering, station level trims, storage crates, waiting-party sign, host stand, event props (flames, delivery crate), block-party banner and lights | Code | 0 |
| Ingredient and seed icons (12 plus 6), builder, XP, hustle, event icons: about 40 | One pixel sprite sheet from the Codixel pipeline in `tools/art`, in the existing palette; other icons stay Lucide | about 10 KB |
| Three new portraits (builder, supplier, critic) | The existing portrait sheet pipeline | about 15 KB |
| New models | At most two GLBs (a watering can, a delivery van), made by the author with the same free tools, compressed by `tools/compress-models.mjs` | at most 120 KB |
| Sound: seed, water, harvest pop, hammer, coin, combo chime, sizzle, flip, bell, fire, fanfare | Synthesised in the mixer | 0 |
| A lunch music variant | The mixer already makes the soundtrack while it plays; a lighter pattern, no file | 0 |

`assets-provenance.md` gets a row per new file with the author's statement (made by the author with free, partly AI-assisted tools). Lazy-load the Garden and workshop screens so the initial bundle grows by at most 90 KB gzipped.

## 8. Devvit and Reddit capabilities

| Capability | Use |
|---|---|
| Redis | The world (`world:<uid>`, TTL 30 days), the community counters, the fridge |
| Scheduler | Weekly block-party reset; a daily nudge ("your basil is ready") only as a notification if the push-notification beta is granted, otherwise nothing |
| Realtime | Already used for cooking together; unchanged |
| Journeys | New nodes: lunch started, first harvest, first upgrade, event handled, foreclosure notice |
| Payments, HTTP fetch | Not used, by design (recorded in `devvit-and-reddit.md`) |

Anything that works only after `devvit publish` is written in the build log and gets a playtest path. We do not publish.

## 9. Timeline and the cut line

| Dates | Work | Exit |
|---|---|---|
| 20 to 25 Nov | **Phase 1** engine v2: shifts, floor actions, events, hustle, station levels, pantry field, foreclosure, one recalibration | Gates green, replay equal, phone screenshot |
| 26 Nov to 1 Dec | **Phase 2** world: garden, pantry, order board, builders, level, layout slots, tasks strip; workshop and roster last | Fake-store tests with a faked clock |
| 2 to 4 Dec | **Phase 3** block party, fridge, level badges; assets and sounds finished; screenshots | Two-account test on the dev subreddit |
| 5 Dec | **Freeze.** Upload and install only | Version in the log |
| 6 to 8 Dec | Fixes, demo video, Devpost form, survey | Submitted before 6 pm PT on the 8th |

**Cut order if time runs short:** the staff roster, then the workshop, then layout slots, then the shared fridge, then the block party. **Never cut:** lunch and the short first service, hands on the floor with hustle, the garden with the pantry, builders, and foreclosure. They are what answer "what do I do?".

## 10. Risks

- **The recalibration is the biggest risk.** The mitigation is doing it once, early, with bots that play the new actions, and keeping the first-three-nights welcome goal so a judge who only taps Open still sees a star.
- **More screens on a phone.** The dock keeps four tabs (Build, Garden, Team, Menu); the ledger moves under the header, and workshop and orders live inside Garden. The Tasks strip is one line. Each new panel gets the same phone screenshot check as phase A.
- **Real-time timers can feel like chores.** Short first timers (20 minutes), a wilt that only lowers yield, and no timer that blocks the night.
- **Fairness on the board.** Progression gives stronger players an edge, as in any tycoon; the level badge and the lunch board keep new players comparable.
- **Scope.** If phase 1 slips past 27 Nov, phase 2 shrinks to garden plus builders and nothing else.
