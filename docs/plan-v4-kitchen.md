# Plan v4: the Test Kitchen, kept, joined to the restaurant and grown

> **Merged into [`plan-v5.md`](plan-v5.md) on 24 November 2026** (Part 3 and the K, X and V items of its tracker). Nothing here was built. Do not update this tracker; update plan v5's.

Written 19 November 2026 at the author's request: *"I want the test kitchen to stay. Integrate it into the gameplay and expand it. Make new plans for it. Keep track of what is left, we will do it later."* Nothing in this plan is built yet. The table in section 3 is the tracker; update the **Status** column and add a line to the **Log** at the end whenever something moves.

## 1. What the Test Kitchen is today (facts, from the code)

- A real-time, top-down 3D cooking arcade, the game this project started as (`src/game/`, `src/scene/KitchenScene.tsx`, mounted by `src/arcade/TestKitchen.tsx`). It opens from the dock button (a desktop) or the top of the Ledger (a phone), only while the restaurant's doors are closed, and replaces the rooftop view while it is open.
- **What you do:** walk (WASD, a thumb joystick on a phone), dash, pick up, place, hold Work to chop or wash. Two recipes: **garden salad** (chopped lettuce and tomato, 50 points) and **rooftop burger** (chopped lettuce and tomato, a grilled patty, a bun, 80 points). About twenty stations: crates, chopping boards, grills, a sink, clean plates, serving hatches, dirty plates, a bin, an extinguisher. A patty left too long burns and then catches **fire**.
- **How it scores:** a 180-second shift; at most four orders at a time; a served order earns points plus a tip that shrinks as it waits and grows with a combo (up to 5 in a row); a timed-out order costs 20 and breaks the combo. Three shifts (Golden Hour, Dinner Rush, Last Call), each with its own layout, pace and star lines (300/500/700, 400/650/900, 500/800/1100; 60% of that solo), **solo** or **two chefs on one screen**, a practice tutorial, chef outfits, and a "Today's shift" the date picks.
- **How it connects to the restaurant today:** almost not at all. Its scores and outfits are saved per player in Redis (`arcade:<uid>`), and each *new* star gives 5 research points, at most 10 a day (`src/server/core/arcade.ts`). It is **not replayed on the server**, so its numbers are bounded and never trusted as a ranking.

## 2. The idea in one paragraph

**The kitchen becomes your training ground, your side income and your second daily game.** What you earn there changes how your restaurant plays (skills, a signature dish, a faster workshop), a daily catering gig pays real cash for a good shift, the day's headline shows up in it, and your garden's produce and your builder's stations appear in it. The kitchen itself grows: more recipes on the restaurant's own stations (pot, oven, fryer, wok), nine shifts instead of three, a seeded daily challenge, hazards, online co-op, and, last, a **verified Daily Kitchen** whose result the server can replay, so it can have a board of its own.

## 3. The rule that decides the order: trust

The restaurant's score is safe because the server **replays** it (a pure function of the opening state and tick-stamped actions). The arcade is real-time with floating-point movement and is **not** replayable today. So there are two roads, and they are planned in this order:

1. **Bounded rewards (cheap, safe, first).** Anything the kitchen gives the restaurant is small, capped per day and per star, and cannot touch the daily stars, the streak or the boards. A cheater who forges every kitchen score gets a bounded perk and a few dollars, and nothing that ranks.
2. **A verified kitchen (expensive, last).** Make the kitchen deterministic (a fixed step and a quantised input log), replay it on the server like a night, and only then let it have stars, a streak and a board.

**Refused until road 2 exists:** letting an unverified kitchen score reach the daily board, the stars or the streak; embedding the kitchen inside a restaurant night (a hand-cooked dish takes 15 to 30 s of real-time play, which breaks the night's pacing and cannot be replayed).

## 4. The tracker

Status: **Planned** (not started), **Doing**, **Done**. Size: S under a day, M one to three days, L three or more. "Needs" names the earlier item or an author decision.

### A. The kitchen feeds the restaurant (road 1: bounded)

| ID | Item | Size | Needs | Status | Done when |
|---|---|---|---|---|---|
| K1 | **Chef skills.** Each star the kitchen has earned is one skill point (18 today, more as it grows). Spend them on four small perks used in a *restaurant night*: **Knife** (the Prep hold counts a perfect within 25% of the ideal, not 20%), **Fire** (the station move's perfect window ±18% not ±15%), **Rhythm** (the hustle chain lapses after 10 s, not 8), **Charm** (a cosy table tips 15%, not 10%). They are stored in the saved restaurant (an input to the replay), set only by a server route that checks the points against the stored arcade save | M | none | Planned | A test shows a bot with skills differs from one without and replays identically; the server refuses more points than the arcade save allows; the card shows "Knife ★★" |
| K2 | **Catering gig.** "Today's shift" becomes a neighbor's catering order: reach its target once a day for **cash ($60 to $150 by shift), XP and a produce gift**, bounded and paid through the world routes. The tasks strip gets a "Gig" chip | M | K1 not required | Planned | A server test: paid once a day, never above the cap, refused with the doors open; the strip chip opens the kitchen |
| K3 | **Today's headline in the kitchen.** The day's headline bends the arcade shift mildly: rain (wet floor, a slower walk), rush (faster arrivals), critic (a star guest who wants a perfect plate), supplier (fewer patties), inspection (dirty plates count against you), payday (bigger tips). Same weights idea as the restaurant | M | none | Planned | Seven headlines each change the kitchen in one visible, tested way; the briefing says how |
| K4 | **Signature dish (recipe mastery).** Two stars on a shift that features a recipe makes that dish your **signature**: +5% tip on it in the restaurant, forever (stored in the saved restaurant) | S | E1 for more than two dishes | Planned | Salad and burger work now; each new recipe adds one |
| K5 | **Hands-on batch.** A 60-second kitchen mini-shift shortens a workshop batch: 30 minutes off per star, once a day per good, bounded | M | the workshop (built) | Planned | A server test for the cap; the Workshop card offers it |
| K6 | **Your produce in the kitchen.** Garden produce in the pantry shows up as crates in a kitchen shift; using it scores a bonus (+10% on that dish). The kitchen does not consume the pantry | S | none | Planned | The kitchen reads the pantry; a test shows the bonus; the pantry is unchanged afterwards |
| K7 | **Your kitchen is your restaurant's.** Builder levels show as faster grills and bigger boards; your hired chef appears as an **AI sous-chef** in solo (a slow, steady helper that chops), replacing the idle second chef; chef **outfits are shared** with the restaurant staff | M | none | Planned | Station level and the sous-chef are visible and tested; outfits match on the rooftop |
| K8 | **Where it lives.** A "Kitchen" tab-sized entry reachable in one tap from the dock on a phone (today it hides in the Ledger), a tasks-strip chip for the gig, and a result card that says what the shift gave the restaurant ("+1 skill point, +$90") | S | K1, K2 | Planned | A phone screenshot with the entry and the card |

### B. The kitchen game grows

| ID | Item | Size | Needs | Status | Done when |
|---|---|---|---|---|---|
| E1 | **More recipes and stations**, on the restaurant's own station bodies: soup (stock pot: stir by holding), flatbread (oven: timed like the grill), fries (fryer: lift on the beep), stir-fry (wok: toss rhythm). Four new recipes first, then ramen and dumplings. Orders pick from the unlocked recipes | L | none | Planned | Each recipe has a station, a rule, points, a test and a practice step; the engine tests pass; the lazy chunk stays within its budget |
| E2 | **Nine shifts, not three** (three tiers of three): new layouts and pacing, plus themed shifts (Garden Party with produce crates, Critic's Night, Rain Rush, Banquet). Star lines per shift; unlocks by stars | M | E1 | Planned | The star lines are set from scripted bots, like the restaurant's, and a test fails if one is unreachable |
| E3 | **Seeded daily challenge and an endless mode.** The order sequence of the daily shift comes from the date, so everyone faces the same night; an endless mode runs until three orders time out | M | none | Planned | Two clients on the same date get the same orders (tested) |
| E4 | **Hazards and events** inside a shift: a spill (slows you), a power flicker (the grill cools), a VIP order, a delivery crate, a rush of three tickets at once | M | none | Planned | Each event has a cue, a counter and a test |
| E5 | **Tools and power-ups** from the skills: a faster knife, tongs, a timer ring on every order | S | K1 | Planned | Each is visible in the HUD and tested |
| E6 | **Better practice.** Practice per recipe, a coach line from real state (like the restaurant's hint), and a "show me" ghost of a perfect run | M | E1 | Planned | A new player cooks their first serve in under 60 seconds in a scripted browser run |
| E7 | **Chef cosmetics.** More hat and apron styles, unlocked by stars, shown in the kitchen and on the rooftop | S | K7 | Planned | Unlocks are server-checked against the star total |
| E8 | **Phone controls and performance.** One-thumb joystick with a contextual action button, a landscape layout, the quality tiers applied to the kitchen scene | M | none | Planned | Phone screenshots and a frame-time check |
| E9 | **Sound from the shared mixer.** The kitchen's chop, serve, fire and miss become synthesised cues, so the soundtrack switch rules both games and the audio files can be dropped | S | none | Planned | The audio budget falls; the switch silences the kitchen |

### C. Verified and social (road 2)

| ID | Item | Size | Needs | Status | Done when |
|---|---|---|---|---|---|
| V1 | **A deterministic kitchen core.** A fixed 0.1 s step, input recorded as quantised changes (a direction, a button, a tick), no wall clock, no render input. Same discipline as the restaurant engine | L | E1 settled (changing rules after this refreshes goldens) | Planned | Golden hashes for scripted runs agree in Chromium, Firefox and WebKit |
| V2 | **Daily Kitchen on the server.** The server replays the input log; a verified result earns **its own stars, board and streak**, separate from the restaurant's; the bounded rewards in section A stay | L | V1 | Planned | A server test replays a run to the same score; a forged log is rejected; a board only ever holds replayed scores |
| V3 | **Ghost runs.** Watch the day's best run (from its log) on the post, or race a friend's ghost | M | V2 | Planned | A ghost replays to the stored score |
| V4 | **Online co-op.** Two Reddit players in one kitchen, in lockstep over realtime, reusing the hosted-service machinery (the local two-chef mode stays) | L | V1 | Planned | The lockstep rig test and a two-account test |
| V5 | **Kitchen cook-off.** Verified kitchen stars add to the block party's weekly counter and a subreddit weekly challenge | S | V2 | Planned | The party counter reads kitchen stars; a test for the cap |
| V6 | **Share a shift.** The result comment already exists; add an image of the scorecard through the media capability | S | none | Planned | One result image posted with the confirm step |

### D. Quality, every time

| ID | Item | Status |
|---|---|---|
| Q1 | A unit test for every new rule; a golden for every new deterministic path; the economy tests for every payout (caps, once a day, refused with the doors open) | Planned |
| Q2 | Budgets (`npm run perf:check`): the lazy chunk (60 of 120 KB gzipped) and audio; new models only if a primitive build will not do | Planned |
| Q3 | A phone screenshot for every new screen, a build-log entry for every decision, `assets-provenance.md` for every file | Planned |

## 5. Suggested order

| Milestone | Items | Why this order |
|---|---|---|
| **M1: joined (about 4 days)** | K1, K2, K3, K8 | Road 1 only: bounded, no engine change to the arcade, the biggest feeling of "it is one game" |
| **M2: richer (about 6 days)** | E1 (soup and flatbread first), K4, K6, E9 | More to cook and the signature dish; the audio file budget falls |
| **M3: bigger (about 6 days)** | E1 (fries, wok), E2, E3, E4, K7, K5 | Nine shifts, the shared daily challenge and the shared stations |
| **M4: verified (about 8 days)** | V1, V2, then E5, E6, E7, E8 | The expensive step, after the rules have settled |
| **M5: social** | V3, V4, V5, V6 | Needs M4 and a second account to test |

**Before the 5 December freeze** (if the author wants any of it in the submission): only **M1**. It is road 1, adds no server replay risk, and does not move any golden hash in the restaurant except the saved state's new `skills` field. Everything else waits until after the contest, because V1 and V2 change what the project can promise to be verified.

## 6. Decisions to make (defaults in bold)

1. Should a kitchen result ever count toward the daily stars or the streak? **No, not until V2 replays it.**
2. Is the catering gig paid in cash? **Yes, small and capped ($60 to $150, once a day); XP and a produce gift with it.**
3. Do skills persist if the author later changes the arcade's star lines? **Yes: points are by stars earned, and a changed line never takes a star back** (the save only ever raises a best).
4. Does the kitchen ever replace the pass's mini-games in a night? **No** (section 3).
5. Keep local two-chef co-op once online co-op exists? **Yes.**

## 7. Risks

- **Scope.** E1 and V1 are each as big as a phase of plan v3. M1 is deliberately small so the idea is judged before the large steps.
- **Economy creep.** Every payout is a new way to make cash or XP. Each gets a cap, a test and a line in the economy table in `design-decisions.md`.
- **Changing the kitchen's rules after V1 refreshes its goldens.** So rules settle (E1, E2) before determinism (V1).
- **Phone performance.** The kitchen scene is a second WebGL scene; only one is alive at a time today, and that stays.

## 8. Log

| Date | Item | What happened |
|---|---|---|
| 2026-11-19 | Plan | Written. Nothing built. The Test Kitchen stays as it is until an item above starts. |
