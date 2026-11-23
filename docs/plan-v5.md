# Plan v5: easy to learn, worth coming back to

Written 24 November 2026 at the author's request, in two messages:

1. *"This game is a little difficult to understand at first. We need people to understand it better and play it better. Change the layout of the restaurant if needed, make the gameplay better, add an interactive guide, teach users from the ground up, clarify the rules and what needs to be done. Explore all avenues."*
2. *"Also go through plan 4, which was not executed, and bring it into this one. I need this game to be something like RollerCoaster Tycoon or Clash of Clans: people come back every day, play regularly and build something substantial."*

So the plan has three parts:

- **Part 1, learn it** (sections 2.1 and 4): a guided first lunch, clear rules and symbols, an interface that grows with the player.
- **Part 2, the long game** (sections 2.2 and 5): a ladder of restaurant tiers that takes about ten weeks of daily play, new rooms, staff who grow, collections, seasons and a street that levels up.
- **Part 3, the Test Kitchen joined and grown** (section 6): everything from [`plan-v4-kitchen.md`](plan-v4-kitchen.md), none of which was built. That file is kept for history; **this plan's tracker is the live one.**

Nothing in this plan is built yet. **Section 8 is the tracker.** When you start an item, set its Status to **Doing**; when it passes its "Done when", set **Done** and add a line to the Log (section 12) and an entry to [`build-log.md`](build-log.md) in the same change.

---

## 0. How an agent picks up this work

1. Read, in this order: the README's *How to play*, this plan's sections 1 to 7, [`.claude/rules/build-log.md`](../.claude/rules/build-log.md), [`testing.md`](testing.md), and [`architecture.md`](architecture.md) sections on the engine and the life of a night.
2. Take the first item in section 9's milestone order whose **Needs** are all Done. Items marked *after the freeze* wait until the contest submission is in (8 December).
3. Before you edit, read every file the item names. Many components in `src/management/` are written as very long single lines; use the Read tool, not `cut`.
4. Checks before you mark Done:

```bash
npm run lint
npm test                 # unit tests, then the browser tests (Playwright, Chromium)
npm run test:engines     # only if you touched src/management/engine.ts, types.ts, replay.ts or stars.ts
npm run perf:check       # size budgets
node tools/look-shot.mjs # phone and desktop screenshots of the running game; attach the phone one to the Log line
```

5. Never run `devvit publish`. `npm run upload` to the dev subreddit is fine when an item needs a real device.

---

## 1. What the game is

**Flip and Fry** is a daily restaurant game inside a Reddit post (Devvit Web). Each day has a **headline** (Rain on the roof, Payday, A critic…) that bends the numbers of one night. The player:

1. **Sets up** the rooftop restaurant between nights: furniture (Build), staff (Team), dishes and prices (Menu), and a garden on real timers.
2. **Runs one service** (Lunch, 60 s, or Dinner, 150 s). During it the player works **the pass**, a list of jobs at the bottom of the screen: **seat** a party at the door, **take** an order, **cook** it (a timing bar: flip in the box, plate in the green), **serve** it, **clear** the table. The team does any job the player leaves, a few seconds later. Quick moves build a **hustle chain** that raises tips.
3. **Gets up to three stars**, worked out by the **server's replay** of the night: ★1 the headline goal, ★2 two of three daily challenges, ★3 beat your previous night. Stars keep a daily **streak**.

The engine (`src/management/engine.ts`) is deterministic: a fixed 0.1 s step, a seeded random source, and a log of tick-stamped actions. The server replays the log to get the only result that counts (`src/server/core/game.ts`, `lockService`).

---

## 2. What stands in the way

### 2.1 Why it is hard to learn

Facts from the code and from the phone screenshots in `docs/img/`. Each finding has an ID that the tracker items refer to.

| ID | Finding | Evidence |
|---|---|---|
| **D1** | **Nobody says what the game is.** The splash says "Run a rooftop restaurant staffed by animals. Today's headline changes the whole night." The first screen shows a city, five dock tabs, a "Daily challenges" card and one line: "Head chef: tap Open for a quick lunch." Nothing names the loop (set up, serve, stars) or says that *you* cook. Earlier phone tests already found this: "a strategy game or an action game?" (build log, 19 Nov). | `src/client/splash-text.ts`, `src/management/RedditLayer.tsx` `hintLine`, `docs/img/phone-planning.png` |
| **D2** | **The first service is unguided and fast.** The team seats a party after 4 s and takes an order after 3 s of game time. A new player reads a row and it disappears because the team did it. 2× and 3× are offered on night one, and the service screenshot shows 3× selected. | `src/management/types.ts` (`HOST_DELAY = 4, ORDER_DELAY = 3`), `ManagementGame.tsx` footer speed buttons, `docs/img/phone-service.png` |
| **D3** | **The pass and the scene do not point at the same things.** The pass says "Table 2: order", but no table in the scene has a number (the number is the table's index in the furniture array, `Pass.tsx` `tableNumber`). "A fox at the door": which fox? Seat buttons read "✦T3" and "✦" is never explained. Rush and Comp are bare icons (⚡, 🎁 with a small "2"). | `src/management/Pass.tsx` |
| **D4** | **One symbol, four meanings.** ★ is reputation (header, "3.5"), the goal line, the night's stars (result card) and a "star guest" (pass rows and the challenge "Serve n star guests"). The flame is both the streak (daily bar) and the hustle chain (night bar). | `ManagementGame.tsx` header, `RedditLayer.tsx` `DailyBar`, `TonightBar.tsx`, `daily-challenges.ts` |
| **D5** | **The star rules are hidden during the night.** The goal is a line in the night bar, the challenges are pips inside the pass, and "beat your last night" appears only on the result card. Lunch has different star lines from dinner, and lunch's third star ("Chain 4 good moves at the pass") names the hustle chain, which is only explained in a tooltip. | `src/management/stars.ts` (`LUNCH_STARS`), `TonightBar.tsx`, `Pass.tsx` `ChallengePips` |
| **D6** | **The money line reads as "already losing".** At the start of service the night bar shows "Bills $36" and "−$48". | `TonightBar.tsx`, `src/management/bills.ts` (`tonight`) |
| **D7** | **The help is wrong and hidden.** The *How to play* dialog describes the old browser game: "Days continue automatically", "Use Close for renovation", "All progress is saved in this browser", "including offline". Its button is hidden below 640 px wide (`hidden sm:grid`), so on a phone it is only inside Settings. The Team and Menu panels tell Reddit players to "Use Build → Close for renovation", which is not how the Reddit game works. | `ManagementGame.tsx` help `Dialog` and header button, `Panels.tsx` `TeamPanel`/`MenuPanel` notices |
| **D8** | **Everything is available on day one.** About fifty named ideas are reachable before the first service: headline, goal, streak, cash, reputation, bills, hustle, five floor jobs, rush, comp, decisions, prep, station move, cosy tables, star guests, challenges, milestones, research, regulars, garden, XP, workshop, builder, order board, block party, fridge, layouts, chef stations, Test Kitchen, neighborhood, co-op, bulletin, flair, lunch and dinner, practice and official results, the bank, the loan, company value, awards, the kitchen card. The **Ledger** tab alone holds weekly revenue, challenges, the register, receipts, research, neighborhood, co-op, reminders, regulars, milestones, the recovery loan and, on phones, the Test Kitchen button. | `Panels.tsx` `LedgerPanel`, `ManagementGame.tsx` |
| **D9** | **Rewards wait in a place nobody looks.** Milestone cash needs a "Collect reward" tap deep inside the Ledger. | `Panels.tsx` (`GOALS` list), `engine.ts` `claim` |
| **D10** | **The headline never says what to do about it.** Each headline changes real weights (rain: comfort counts more for tips; supplier: grill ingredients cost 50% more), but planning shows only the title and the goal. | `src/management/daily-headline.ts`, `RedditLayer.tsx` `DailyBar` |
| **D11** | **The result card explains the result, not the next move.** "Most confusing layout: seats that exist, but a long walk to reach them" names the problem but not the fix. | `src/management/awards.ts`, `RedditLayer.tsx` `ResultCard` |
| **D12** | **The room is small on a phone and nothing in it is signposted.** The rooftop fills about a third of the screen. There is no visible door, host stand, pass counter or table number, so the five floor jobs have no place in the picture. | `docs/img/phone-planning.png`, `RestaurantScene.tsx` (`SceneClock` framing factor `.86`) |

### 2.2 Why people would stop coming back

The daily rhythm is already good: a headline a day, lunch and dinner, a streak with freezes, a garden, workshop, builder and order board on real timers (20 minutes to 12 hours), a weekly rank, a block party and visits. What is missing is **scale and a spine**: the restaurant runs out of things to become.

| ID | Finding | Evidence |
|---|---|---|
| **R1** | **The restaurant stops growing in about two weeks.** The roof is 10 tiles wide with one expansion to 14 (`width` in `types.ts`); at most 6 staff (`hire` in `engine.ts`); staff train to level 3; stations upgrade to level 3; player levels end at 10 (`LEVEL_XP` ends at 1,500 in `crops.ts`); 3 research items; 10 milestones. A daily player who earns both services' stars and works the garden and orders makes roughly 120 to 150 XP a day (`serviceXp`, crop and order XP), so level 10 arrives around day 10 to 12, and research finishes around day 9 at $40 a night. | `types.ts`, `engine.ts`, `crops.ts` |
| **R2** | **Goals do not scale.** The headline goals are fixed numbers ("serve 14", "$230 profit"; `GOALS` in `stars.ts`). A grown restaurant meets them without trying, so stars stop meaning anything. | `stars.ts` |
| **R3** | **Nothing to show.** Progress is a number (company value). The building in the city looks the same on day 1 and day 60, and a visitor sees the same room shape. | `RestaurantScene.tsx`, `CityScenery.tsx` |
| **R4** | **No long arc is visible.** The card names one "Next unlock" (research). There is no ladder of big goals like a Town Hall or a park rating. | `RedditLayer.tsx` `nextUnlock` |
| **R5** | **Cash has no sinks after week two.** Furniture, training and upgrades run out, so cash piles up with nothing to save for. | `CATALOG`, `UPGRADE_STEPS` |
| **R6** | **Day 30 is day 3.** The same lunch, dinner, garden and order board; only the headline changes. | `daily-headline.ts`, `crops.ts` `ordersFor` |
| **R7** | **The street is thin.** The block party is a weekly counter and the fridge one swap a day. The subreddit, which should be the "clan", has no level, no shared project and nothing that persists. | `src/server/core/block.ts` |
| **R8** | **The Test Kitchen is a separate game** joined only by a research trickle (5 per new star, at most 10 a day). | `src/server/core/arcade.ts`, plan v4 section 1 |

---

## 3. The goal and the rules for this work

**Learning target (Part 1).** A Reddit user who has never seen the game, on a phone:

- within **30 seconds** can say what the game is ("I run the pass of a restaurant and earn stars");
- within **2 minutes** has seated, cooked, served and cleared once, and seen at least one star;
- after the first result card can say what tomorrow is for.

**Long-game targets (Part 2).**

- A daily player always has a visible next goal reachable within 1 to 4 days.
- Something new unlocks at least every 4 days for the first 60 days.
- The restaurant visibly changes in the city at every tier.
- A day's play is two or three short visits (5 to 10 minutes each) and never needs more. Missing a day costs yield, never progress.

**Principles.**

- **P1. One sentence, everywhere.** *"Run the pass of a rooftop restaurant: cook the orders, earn up to three stars, come back for tomorrow's headline."* The splash, the welcome card, the help and the listing use the same words.
- **P2. Teach by doing, one thing at a time, in the real game.** The first lunch is guided and freezes at each beat. No walls of text, no separate tutorial level.
- **P3. The interface grows with the player.** A system appears on the night it becomes useful, with a one-card introduction.
- **P4. Every symbol means one thing.**
- **P5. The scene and the interface point at the same things:** numbers, rings and arrows.
- **P6. Never change the simulation to teach.** Teaching uses pause, speed and presentation only.
- **P7. Always skippable, always replayable.**
- **P8. A spine, not a pile.** One ladder, the restaurant's tier, orders every unlock, like a Town Hall.
- **P9. Harder as you grow.** Goals scale with the tier, so stars stay earned.
- **P10. Reasons, not chores.** Timers reward a visit. No energy meters, no paid skips, no payments, no raids on other players.

**Guardrails (hard rules; an item that must break one says so and pays the cost).**

- **Determinism.** Do not add fields to `RestaurantState` or change engine constants. Either one refreshes the golden hashes (`src/test/replay-golden.test.ts`) and may move the calibration gates (`src/test/bots.test.ts`). Pause and speed are presentation only: `setSpeed` multiplies the frame accumulator (`engine.ts`, `update`), pause stops stepping, and the server's `lockService` replays tick-stamped actions with no wall-clock check. Pass actions are accepted while paused and stamped with the current tick (`seat`, `claimTicket` have no pause guard); Space already pauses a live service today.
- **One engine bump for Part 2.** Every night-rule change in Part 2 lands together as `version: 3` of the saved state, with one recalibration (tier reference bots) and one golden refresh, after the freeze. This is plan v3's rule ("one engine version bump") applied again.
- **Two kinds of state** (plan v3 section 3). The night is replayed; the world (garden, builders, orders, XP, seasons, the street) lives in Redis on the server clock and reaches a night only as inputs copied into the opening snapshot.
- **Co-op.** A hosted service cannot be paused (`pause` returns early when `restaurant.coop` is set). The guide is off while hosting or helping.
- **Phone first.** 360 px wide, 44 px touch targets, reduced motion respected, every control has an accessible name, colour is never the only signal.
- **Devvit.** No new permission. Any new Redis key has a TTL. No `devvit publish`.
- **Budgets.** `npm run perf:check` passes. The guide is plain React and CSS; no tour library.
- **Reddit only, where it matters.** The unlock ladder and guide run when `restaurant.remote` is set. The browser game (`npm run dev`) keeps everything visible, which also keeps the older browser tests valid.

---

## 4. Part 1: learn it

### 4.1 The first five minutes, beat by beat

| Beat | What the player sees | Freezes? | Advances when |
|---|---|---|---|
| **S0 Splash** | The inline card keeps the headline. The plain card's blurb becomes the one sentence (P1). The button reads "Play today's service". | n/a | Tap |
| **W1 Welcome** | One card, the chef Basil's pixel portrait (`portraits.ts`): "You own Little Rooftop. Every day: set up, run one short service at the pass, and earn up to three stars. Your first lunch is one minute. I'll walk you through it." Buttons: **Let's cook** and **Skip the tour**. | n/a | Tap |
| **T1 Open** | Spotlight on **Open**: "Open the doors." | n/a | Phase becomes `service` |
| **T2 Seat** | The first party reaches the door. The night freezes. A ring on the guest in the scene, a spotlight on the seat buttons: "A guest is at the door. Tap a table to seat them. ✦ means cosy: decor nearby, so they tip more." | Yes | That guest is `seated` |
| **T3 Order** | "Take their order." Spotlight on the row, ring on the table. | Yes | Guest is `waiting` |
| **T4 Cook** | "Tap Cook. This dish is yours now." | Yes | `restaurant.myDish()` is set |
| **T5 Timing** | Frozen first while the bar is explained: "The marker moves right. Tap Flip when it is in the box. Plate it in the green." Then it unfreezes at **½×** and live cues follow the marker: "Flip now!", "Plate it!" | Explain, then ½× | The dish is plated (or burnt: "Burnt dishes cost you. Next one!") |
| **T6 Serve** | "Carry it out: Serve." | Yes | Guest is `eating` |
| **T7 Clear** | When a seat is dirty: "Clear the table so the next guest can sit." | Yes | That seat is clean |
| **T8 Hands free** | "That is the whole job: Seat, Order, Cook, Serve, Clear. Your team does any step you leave, just slower. Quick moves build your Combo, which raises tips." The night runs at 1×; the **service flow strip** (4.10 G4) stays on screen for the rest of the lunch. | Card, then runs | Tap **Got it** |
| **T9 The card** | On the result card a pointer on the three star lines: "These are your three stars. The first is tonight's goal." | n/a | Tap |
| **T10 Spend** | The existing "Spend your $X" button opens Build. Spotlight on the table, then on the cosy aura (4.11 L4): "Put it next to the plant to make it cosy." | n/a | A table is placed |
| **T11 What next** | "Dinner is open now: two and a half minutes and daily challenges. Or come back tomorrow for a new headline." | n/a | Tap |

**Why the official first lunch can be the tutorial:** the freezes and the ½× cue are presentation (section 3, Determinism). The player's taps are real, tick-stamped actions, so the result is verified like any other night. While the night is frozen the team's 3 to 4 second fallback never fires, so a new player always gets to make the move.

**Why not a separate practice level:** it would need a second engine instance and a fake server (the `restaurant` singleton is wired to the session), and players would still face an unexplained real night afterwards. A later lunch can replay the guide (4.8).

### 4.2 The unlock ladder (Reddit only)

What a player can see depends on how many services they have closed (`state.history.length`). Nothing is taken away from the engine: a hidden system still runs with its defaults, exactly as today. **Settings → "Show everything"** turns the ladder off.

| After closed services | Appears | Introduction card (one line, coach portrait) |
|---|---|---|
| 0 | Open, the pass (seat, order, cook, serve, clear), the night bar, Settings, How to play | The guided lunch (4.1) |
| 1 | **Build** tab, the Lunch/Dinner picker, the **Daily challenges** (dinner only) | "Dinner has three daily challenges. Two of them earn your second star." |
| 1 | **Rush** and **Free meal** (comp) on tickets | First time a ticket has them: "Rush moves an order to the front. A free meal keeps a guest who is about to walk out (two a night)." |
| 2 | **Menu** tab | "Set your prices. Above the fair price, some guests walk away." |
| 2 | **Garden** tab and the tasks strip | "Grow your own ingredients: dishes made from them cost nothing and tip more." |
| 2 | **Test Kitchen** entry (plan v4 item K8) | "Cook by hand in the Test Kitchen. New stars there earn research." |
| 3 | **Team** tab, **Hold to prep** on the cook card, 2× and 3× speed | "Hire and train. A second server is the best first hire." |
| 3 | The headline's own goal starts to count (`FIRST_NIGHTS = 3` in `stars.ts`) | "From tonight the headline sets your goal. Read the tip before you open." |
| 4 | **Goals** tab extras: research, milestones, regulars | "Milestones pay cash. Research opens new equipment." |
| 5 | **Street** (neighborhood, open doors, co-op, bulletin, reminders) | "Your neighbors are here. Leave your door open or cook together." |

Part 2 systems join this ladder as they are built: each new room, tier and collection gets its row and its introduction card, so the long game never lands on a player all at once.

**Contextual first-time tips** (once each, a one-line bubble pointing at the thing, never freezing a dinner):
first decision card, first VIP guest, first regular, first walkout, first burnt dish, first bank notice, first level-up, first crop ready, first milestone ready to collect, first lunch third star missed for lack of a combo.

### 4.3 Clarity fixes: symbols, words, numbers

| Now | After | Where |
|---|---|---|
| ★ for reputation in the header | A **thumbs-up** icon and "3.5/5" (label "Reputation") | `ManagementGame.tsx` header |
| ★ "star guest" | **VIP** with a **crown** icon; the challenge reads "Serve n VIP guests" | `Pass.tsx`, `daily-challenges.ts` `challengeObjective`, `GuestSatisfactionBar.tsx` |
| ★ in the goal line | Keep ★: stars now only ever mean the night's score | `RedditLayer.tsx`, `TonightBar.tsx` |
| Flame for the hustle chain | **Combo ×n** with a lightning icon; the flame stays the streak's alone. Code keeps the name `hustle` | `TonightBar.tsx`, `stars.ts` `LUNCH_STARS[2]` ("Reach a ×4 combo at the pass") |
| ⚡ Rush (icon only) | A text button "Rush" | `Pass.tsx` `TicketRow` |
| 🎁 Comp with a tiny "2" | A text button "Free meal (2)" | `Pass.tsx` `TicketRow` |
| "✦T3" seat buttons | "Table 3 ✦" with the cosy tip the first time | `Pass.tsx` `FloorRow` |
| "Bills $36 … −$48" | One bar with a **break-even** tick. Text: "$24 to break even" until covered, then "Profit so far +$12" | `TonightBar.tsx`, `bills.ts` |
| "The pass" heading only | "The pass · your orders" | `Pass.tsx` |
| Browser-game help and notices | Rewritten for Reddit (4.8); the "Close for renovation" notices only in the browser game | `ManagementGame.tsx`, `Panels.tsx` |

**Numbers in the scene:** each table gets a small floor plate with its number during service and in Build. The number comes from one shared helper (move `tableNumber` out of `Pass.tsx` into `src/management/layout.ts`) so the plate and the pass can never disagree.

**Pass rows point at the scene:** each row starts with the guest's pixel portrait (`portraits.ts`) and the table number. Pressing or hovering a row rings that guest or table in the scene, using the projected label registry in `RestaurantLabels.tsx`.

### 4.4 The live star tracker

The night bar's goal line becomes three slots that fill during the night:

```
★ Goal  Served 3/5 · profit −$12     ☆ Challenges 1/2     ☆ Beat last night ($120)
```

Lunch shows the lunch lines. A pure function `previewStars(state, headline, previousProfit, night)` in `src/management/stars.ts` builds a "report so far" from `state.totals` and reuses the same `met` functions. It is labelled **"so far"**; the server's card is still the only truth. Rating-based goals show "rating so far". A unit test runs a bot night and checks that the preview at the last tick matches `evaluateStars` for every headline, or lists the cases where it legitimately cannot (rating settled at close).

### 4.5 Planning: tonight's tip

The floating "Daily challenges" card on the planning screen becomes **Tonight**: the headline, what it changes in one line, and **one suggested move** computed from state, with a button that opens the right panel.

| Headline | Says | Suggests when |
|---|---|---|
| quiet | Patient guests, slower arrivals | "A good night to try a new dish" (Menu) |
| rush | Guests arrive faster | Fewer than 8 seats: "Add a table" (Build); else one server: "Hire a server" (Team) |
| rain | Comfort counts more for tips | Comfort under 60: "Add a plant or a lantern" (Build) |
| supplier | Grill ingredients cost 50% more | A grill dish is on: "Raise grill prices or switch them off" (Menu) |
| critic | More VIPs; one walkout caps the night at 2★ | Always: "Rush VIP orders and keep a free meal for one" |
| payday | Guests mind high prices less | Prices at fair: "Prices can go up about 10% tonight" (Menu) |
| inspection | Dirty seats at closing hurt the rating | Always: "Clear tables in the last minute" |

The weights live in `daily-headline.ts`; the tips are a data table next to them, so a new headline cannot ship without a tip (a test checks every headline id has one).

### 4.6 The result card: "Try next"

One actionable line under the award, with a button to the panel that fixes it. A pure function `tryNext(report, night, stars)` in `src/management/awards.ts`:

| Signal | Line | Opens |
|---|---|---|
| Missed > 3 and seats < 8 | "Guests left without a seat. Add a table." | Build |
| Award *confusing* | "Move tables nearer the entrance: guests walked a long way." | Build (room view) |
| Value < 50 | "Your prices scared guests off. Bring them toward fair." | Menu |
| Award *untidy* | "Clear the last tables before closing." | none |
| Plated = 0 | "Cook a few orders yourself: your hands make the stars." | none |
| ★2 missed | "Two of the three challenges earn the second star. They are on the pass." | none |
| Profit < 0 | "Wages and rent are bigger than sales. Fewer staff, or more seats." | Team |

The first matching row wins; the order is the table's order. Unit-tested per row.

### 4.7 Navigation: a dock that matches the ladder

| Dock tab | Holds |
|---|---|
| **Build** | As today, plus the cosy aura (4.11) |
| **Menu** | As today |
| **Team** | As today |
| **Garden** | As today (Reddit only) |
| **Goals** | **Road ahead** (5.9) at the top, then today's three stars and the daily challenges, milestones (with **Collect** on top when ready), research, regulars, the streak and the week |

- **Money** (register, loan, the last 20 receipts, weekly revenue) opens from tapping the **cash** in the header, as a sheet.
- **Street** (neighborhood, open doors, co-op, bulletin, reminders) opens from the neighborhood camera button, as a sheet.
- **Test Kitchen** gets its own button beside **Open** on phones too (plan v4 K8).
- **Badges:** a dot on a tab when something there is ready to act on (a milestone to collect, crops ready, a recommended buy you can afford).

The `Panel` type in `Panels.tsx` changes from `'ledger'` to `'goals'`; `restaurant.nextPanel` and every `setPanel('ledger')` caller move with it (grep `'ledger'`).

### 4.8 Help that is true

- A **?** button in the header on every width.
- One content module, `src/management/help-content.ts`, used by the dialog (and copied by hand into the README's *How to play* when it changes). Five short sections with an icon each: **Your day**, **The night** (the five-step flow), **Stars**, **Between nights**, **Symbols** (★ stars, thumbs-up reputation, flame streak, lightning combo, crown VIP, ✦ cosy, the patience bar colours).
- **Replay the tour:** a button that turns the guide on for the next lunch. It is a real lunch; only the best result of the day counts, so nothing is lost.

### 4.9 Where the guide's progress lives

- **What is due** is derived from state: `history.length`, `phase`, `shift`, the engine events. No new field in `RestaurantState`.
- **What was seen or skipped** is a small Redis set per player, `tour:<uid>`, TTL 90 days, read with today's payload and written by `POST /api/tour/seen { id }` (ids are a fixed allowlist; rate-limited like the other routes). The browser game uses `localStorage`, wrapped in try/catch.
- Why the server and not only `localStorage`: the Reddit app's webview is not guaranteed to keep site storage, and a player on a second device should not see the welcome again.

### 4.10 Gameplay changes that make it easier to learn

| ID | Change | Cost |
|---|---|---|
| G1 | A **½×** speed, used by the guide during cooking and offered on nights 1 to 3 | Presentation only: the `speed` type becomes `0.5 \| 1 \| 2 \| 3` in `engine.ts` |
| G2 | 2× and 3× appear from night 3 (ladder) | UI only |
| G3 | The most urgent pass row gets a **Next** tag and a short reason ("leaving soon") | UI only |
| G4 | **Service flow strip**: Seat › Order › Cook › Serve › Clear, with the current guest's step lit; shown on nights 1 to 3 | UI only |
| G5 | Longer team fallbacks on nights 1 to 3 (seat 4→7 s, order 3→5 s) | **Engine change**: state-dependent constants, bots re-run, goldens refreshed. Not before the freeze |

### 4.11 The restaurant layout: signposting the room

| ID | Change | Cost |
|---|---|---|
| L1 | A **host stand and door mat** at the entrance tile `{x: 4, z: 9}`, with the queue visibly forming there | Drawn by the scene; no furniture item, no state |
| L2 | **Table number plates** (4.3) | Scene label |
| L3 | A **pass counter with a bell** between the kitchen and the dining room; a finished dish sits there until served | Drawn by the scene; reads `guest.stage === 'ready'` |
| L4 | A **cosy aura** in Build and on nights 1 to 3: a soft ring, two tiles around each decor piece (the `isCozy` rule in `types.ts`); cosy tables wear ✦ | Scene only |
| L5 | **Frame the room tighter during service on phones** (the `.86` factor in `RestaurantScene.tsx` `SceneClock`), so guests and their bubbles are bigger | One number; check with `look-shot` |
| L6 | Move the starter furniture so the cosy table is the one nearest the door | **Changes the starter park**: bots and goldens. Refused before the freeze; L4 teaches the same thing |

### 4.12 Measuring it

`src/client/journeys.ts` already records the loop. Add events: `tour_start`, `tour_step` (with the step id), `tour_skip`, `tour_done`, `first_star`. A browser test plays the guided lunch as a new player and asserts it completes and reaches the result card.

---

## 5. Part 2: the long game

### 5.1 The idea

**Grow a rooftop stall into a landmark.** RollerCoaster Tycoon gives a park that visibly grows and a rating that rises. Clash of Clans gives a Town Hall that orders every unlock, builders that are always busy, and a clan. Flip and Fry already has the daily night, the builders, the garden and the street. It lacks the **spine** and the **scale**: a ladder of restaurant tiers that takes about ten weeks of daily play. Each tier is a builder project; each opens more room, a new kind of room, more staff and harder nights, and shows on the skyline.

### 5.2 The spine: restaurant tiers

| Tier | Name | Needs | Project | Opens | Target day for a daily player |
|---|---|---|---|---|---|
| 1 | Rooftop stall | start | none | Today's starter park: 10-wide roof, 6 staff, stations to level 3 | 1 |
| 2 | Café | level 3, 5 services | $900, 2 h | The east terrace (today's `expanded`: 14 wide), rent $50 | 3 to 6 |
| 3 | Bistro | level 6, 25 stars | $1,800, 6 h | **Lounge** (5.3), staff 7, stations to level 4, the Lantern decor set | 8 to 13 |
| 4 | Restaurant | level 9, 60 stars | $3,500, 12 h | **Drinks bar** and a bartender, **takeaway window**, staff 8 | 15 to 22 |
| 5 | Fine dining | level 12, 110 stars | $6,000, 24 h | **Private room**, stations to level 5, the Retro set | 24 to 33 |
| 6 | Landmark | level 15, 180 stars | $10,000, 36 h | **Second floor**, staff 10 | 36 to 48 |
| 7 | Legend | level 18, 260 stars | $16,000, 48 h | **Chef's table** nights, the neon sign, the top trophy | 52 to 70 |

- **Stars** in "Needs" are lifetime **verified** stars from the server's replays (lunch and dinner), never a client number.
- **Player levels** extend from 10 to 20 (`LEVEL_XP` in `crops.ts`), so XP keeps meaning something.
- **Migration:** a saved park with `expanded: true` loads as tier 2; every other park as tier 1. Nothing a player owns is taken away.
- **Goal scaling (principle P9):** each tier multiplies the counts and profits in the headline goals and the daily challenges by a factor; rating thresholds stay. The factors are set by tier reference bots (5.10), not guessed. The first-three-nights goal is unchanged.
- **Bigger nights:** a higher tier also raises guest flow (a factor on the arrival gap), so a bigger room is a busier room, not an easier one.
- The numbers in this table are starting points for the simulator in 5.10, which sets the final values.

### 5.3 Rooms: the rides of the restaurant

Each room changes the night in one clear way and adds one pass job with a team fallback, like the five floor jobs.

| Room | Tier | What it does | Pass job |
|---|---|---|---|
| **Lounge** | 3 | Two more places in the door queue (`QUEUE_MAX` 4 to 6); parties waiting there lose patience half as fast | none |
| **Drinks bar** | 4 | A seated guest may add a drink (+$6, no cooking); needs a bartender (a new staff role) | **Pour** (tap), bartender after 3 s |
| **Takeaway window** | 4 | Passers-by buy a boxed dish at the window: revenue without a seat | **Box it** (tap when the dish is ready), team after 5 s |
| **Private room** | 5 | Two VIP tables; VIP and critic guests seated there tip 50% more and wait 50% longer | Seat VIPs there (the seat job) |
| **Second floor** | 6 | A second 10 by 10 room up a staircase; servers walk farther, so layout matters again | none |
| **Chef's table** | 7 | Once a week a **banquet** shift (240 s, plan v3 section 4.1): a fixed five-course order at a high price, its own board | Every course is cooked at the pass |

### 5.4 People who grow

- Staff train past level 3, up to 10, capped by the tier. Staff earn **experience from the nights they work**, read from the replayed receipt; cash training still speeds it up.
- **Traits** at levels 4, 7 and 10: one of two choices each time (for example *Quick hands* or *Steady*, *Charming* or *Tidy*). A trait is a small, named rule in the engine.
- A **head chef** promotion at tier 4 gives one perk: the house special (the dish with the highest mastery) tips 5% more.
- Wages rise with level, which is a cash sink (R5).

### 5.5 Collections

- **Recipe book.** Each dish has mastery 0 to 3, from perfect plates at the pass on verified nights (10, 30, 75). Mastery 3 makes it a **signature dish** (+5% tips on it). Plan v4's K4 becomes the Test Kitchen's bounded shortcut to a dish's *first* mastery star. Needs a per-dish count of perfect plates in the receipt.
- **Regulars' album.** Each regular has a five-visit story. Finishing it hangs their portrait on the wall (a decor piece, +2 atmosphere) and a new regular starts arriving.
- **Decor sets** (RollerCoaster Tycoon themes): Garden, Lantern, Retro and Seaside sets of four pieces each, opened by tiers and seasons. A complete set in the room adds +10 atmosphere.
- **Trophy shelf.** Each award type earned and each season rank becomes a trophy shown in the room and on visits.

### 5.6 The daily and weekly rhythm

| When | What | Built today? |
|---|---|---|
| Morning, 2 to 3 min | Harvest and replant, start a builder project, fill orders, the **catering gig** in the Test Kitchen (K2) | Mostly built; the gig is new |
| Lunch, 1 min | The short service | Built |
| Evening, 3 to 5 min | Dinner, the result card, posting | Built |
| Every day | **Daily round:** three small tasks picked from what the player has unlocked ("Harvest 2 crops", "Plate 3 perfect dishes", "Seat 4 parties at cosy tables"). Each pays XP. Five full rounds in a week open a **weekly crate** ($150 and 30 XP; a decor piece once decor sets exist) | New |
| Every week | Block party and week rank (built). **Food festival:** the week's featured dish; serving it counts for the street and earns a festival decor piece | Festival is new |
| Every four weeks | **Season:** a free 30-step track moved by verified stars and daily rounds. Rewards are cosmetics only (outfits, decor, signs) and a season trophy. No paid track | New |

### 5.7 The street is the clan

- **Block level.** The community earns block XP when the weekly party reaches its tiers. Block levels add street decorations that every member sees in their city view, and a bigger party gift. One counter per subreddit.
- **Street showcase.** The block's restaurants ranked by tier, then season stars, from verified results only. Names show only for open doors (the existing rule).
- **Help requests** (Clash of Clans donations, kind version): ask the block for one crop; a neighbor who sends it earns XP. This extends the shared fridge.
- **Visits** show the visited restaurant's tier, rooms and trophy shelf.
- **Refused:** raids, stealing, any player-versus-player loss, chat, and votes or comments as inputs (vote manipulation and Reddit's user-action rules).

### 5.8 Show it off

- **The skyline.** The building in the city gains a storey, a sign, awnings and lights at each tier. Scene only: it reads `tier`.
- **A profile card:** tier, lifetime stars, best night, collections complete, season rank. Shown on visits and in "Post my kitchen".
- **A scorecard image** through the media capability (plan v4 V6).

### 5.9 Road ahead

A panel at the top of the Goals tab with the next three goals and their progress: the next tier and what it still needs, the next level unlock, the next collection reward. There is always a next thing within a few days (target in section 3). Its first version, before the freeze, reads only what exists today: level gates, research, the terrace, station upgrades and milestones.

### 5.10 Pacing and the economy are tested, not guessed

- **A progression simulator** (`src/test/progression.test.ts`, pure, no browser): a scripted daily player plays lunch and dinner with the floor bot, runs a fixed garden routine and a greedy spending policy, and starts tier projects when it can. It runs 70 dates through `runService` and the world rules.
- **Gates:** each tier arrives within its window in 5.2; something new unlocks at least every 4 days for 60 days; the reference player's stars per dinner stay between 1.5 and 2.5 at every tier (scaling works); cash never sits above ten nights of bills while a sink is available.
- Every new payout gets a cap, a test and a row in the economy table in [`design-decisions.md`](design-decisions.md).

### 5.11 What can happen before the freeze

Only Part 2 work that changes no night rule: **Road ahead** (first version), the **daily round** (world-side XP) and a **skyline that grows with the player level** (cosmetic, later switched to the tier). Everything else is engine v3, after the contest.

---

## 6. Part 3: the Test Kitchen, joined and grown (from plan v4)

### 6.1 What it is today

A real-time, top-down 3D cooking arcade, the game this project started as (`src/game/`, `src/scene/KitchenScene.tsx`, mounted by `src/arcade/TestKitchen.tsx`). Walk, dash, pick up, place, hold to chop or wash. Two recipes (garden salad, rooftop burger), about twenty stations, a burning patty that catches fire. A 180-second shift with up to four orders, tips that shrink with waiting and grow with a combo, three shifts (Golden Hour, Dinner Rush, Last Call), solo or two chefs on one screen, a practice tutorial, outfits and a "Today's shift" by date. Scores and outfits are saved in Redis (`arcade:<uid>`); each new star gives 5 research, at most 10 a day. It is **not replayed** on the server, so its numbers are bounded and never ranked.

### 6.2 The idea

**The kitchen is your training ground, your side income and your second daily game.** What you earn there changes how your restaurant plays (skills, a first mastery star, a faster workshop); a daily catering gig pays a little real cash; the day's headline shows up in it; your garden's produce and your builder's stations appear in it. It grows: recipes on the restaurant's own stations, nine shifts, a seeded daily challenge, hazards, online co-op, and last, a **verified Daily Kitchen** the server can replay.

### 6.3 The trust rule that orders it

The restaurant's score is safe because the server replays it. The kitchen is real-time with floating-point movement and is not replayable today. Two roads, in this order:

1. **Bounded rewards first.** Anything the kitchen gives the restaurant is small, capped per day and per star, and never touches the daily stars, the streak, the boards, the tier needs or the season track.
2. **A verified kitchen last.** A fixed step and a quantised input log, replayed on the server; only then may it have stars, a board and a streak of its own.

**Refused until road 2 exists:** an unverified kitchen score reaching any board, star, streak, tier or season; running the kitchen inside a restaurant night (a hand-cooked dish takes 15 to 30 s of real-time play, which breaks the night's pacing and cannot be replayed).

### 6.4 How it plugs into the long game

| Kitchen item | Joins |
|---|---|
| K1 chef skills | The owner's own perks at the pass, next to staff traits (5.4) |
| K2 catering gig | The morning routine and the daily round (5.6) |
| K3 today's headline in the kitchen | The day's one theme across both games |
| K4 signature dish | The recipe book: a bounded shortcut to a dish's first mastery star (5.5) |
| K7 your kitchen is your restaurant's | Station levels and tiers show in the kitchen; outfits join season cosmetics |
| X1 more recipes | New recipes follow the stations the tiers open (pot, oven, fryer, wok) |
| V2 Daily Kitchen | Its own board and streak; verified kitchen stars may then count for the street (V5) |

---

## 7. Building notes

### 7.1 The guide (Part 1)

- **`src/management/tour.ts`** (pure, unit-tested): `tourStep(state, ctx, seen) → Step | null`. A `Step` has `id`, `text`, `target` (a `data-tour` key or a scene anchor such as `guest:12`), `freeze` (boolean), `slow` (½×), and `done(state) → boolean`. Steps advance on **state**, not on taps, so a step the team happens to finish still moves on.
- **`src/management/Coach.tsx`**: the overlay. It reads `tourStep` on each engine notify, freezes or slows with `restaurant.pause` and `restaurant.setSpeed`, and restores the player's speed after.
  - The spotlight is four dim rectangles around the target's `getBoundingClientRect()`, updated by `ResizeObserver` and on each animation frame while a scene target moves. The hole lets taps through to the real button.
  - The bubble has the coach portrait, the text, and **Skip the tour**; it is `role="status"` with `aria-live="polite"`. Escape skips. Under reduced motion the ring does not pulse.
- **Targets:** add `data-tour="open"`, `"seat"`, `"order"`, `"cook"`, `"move"`, `"plate"`, `"serve"`, `"clear"`, `"stars"`, `"shop-table"` to the existing buttons. Scene targets reuse the projected labels in `RestaurantLabels.tsx` (`customer-<id>`), plus new `table-<id>` plates.
- **Never** run while `restaurant.coop` is set, while `restaurant.catchingUp`, or in a visit.
- **Replay proof:** a test opens a lunch, pauses at each guide step, acts while paused, closes, and checks the server replay's hash equals the client's.

### 7.2 The long game (Part 2)

- **Engine v3** (`src/management/types.ts`, `engine.ts`, `stars.ts`, `replay.ts`): a `tier` field (1 to 7), with `width`, the staff cap, the station cap, the queue length and the goal factors read from one `TIERS` table. `expanded` becomes derived from `tier >= 2` and is kept only for loading old saves. New rooms are furniture kinds with rules in the engine; new pass jobs follow the five floor jobs' pattern (an action with a tick, a team fallback after a delay, a hustle step). One golden refresh for all of it.
- **Tier projects** live in the world (`src/server/core/world.ts`) like builder jobs: start (checks level, lifetime stars, cash), run on the server clock, and are written into the saved park at the next planning, never during a live service (the rule `settleUpgrades` already follows).
- **Lifetime verified stars** are counted by `lockService` (only the gain over the player's previous result for that date and shift, as the block party already does) into the player's profile on the server.
- **Daily round, crates, seasons, festivals, block level** are world or community state in Redis with TTLs, written only by routes or by the lock from the replayed receipt.
- **Skyline and trophies** are scene-only and read saved state.

### 7.3 The kitchen (Part 3)

- Road 1 items write only to the arcade save and to small capped world fields through server routes that check the stored arcade save, never a number the client sends.
- V1 rebuilds `src/game/engine.ts` on the restaurant engine's discipline: a fixed 0.1 s step, inputs recorded as quantised changes (a direction, a button, a tick), no wall clock, no render input.

---

## 8. The tracker

Status: **Planned**, **Doing**, **Done**. Size: **S** under a day, **M** one to three days, **L** more. "Fixes" names the diagnosis rows (D1 to D12 and R1 to R8 in section 2); tracker ids never reuse a D or an R. Plan v4's ids are kept, except its "E" items, which are now **X** so they do not clash with this plan's E.

### A. Clarity (no engine change)

| ID | Item | Size | Needs | Fixes | Status | Done when |
|---|---|---|---|---|---|---|
| A1 | **Symbols:** thumbs-up reputation, crown VIP, lightning Combo, flame only for the streak, ★ only for the night's stars (4.3) | S | none | D4 | Done | A screenshot shows each symbol once; `grep` finds no "star guest" in UI copy; browser tests updated |
| A2 | **Words on the pass:** Rush and Free meal as text buttons, "Table 3 ✦", "The pass · your orders" | S | none | D3 | Done | Phone screenshot at 360 px with no overflow; accessible names unchanged or better |
| A3 | **Table number plates** in the scene and one shared `tableNumber` helper | S | none | D3, D12 | Done | Plates show in service and Build; a test checks pass and plate numbers agree after a table is sold |
| A4 | **Break-even money bar** in the night bar | S | none | D6 | Done | Unit test for the text at zero, below and above break-even |
| A5 | **True help:** `help-content.ts`, a ? button at every width, Reddit copy, the Symbols section | S | A1 | D7 | Done | No "browser", "offline" or "renovation" text in remote mode (browser test); README *How to play* matches |
| A6 | **Remove stale notices** in remote mode ("Close for renovation" in Team, Menu, Build) | S | none | D7 | Done | Browser test in remote mode finds none |
| A7 | **Splash and welcome sentence** (P1) on the plain splash card, the listing (`docs/listing.md`) and the README intro | S | none | D1 | Done | `splash-text.test.ts` updated |
| A8 | **Rename the lunch third star** to "Reach a ×4 combo at the pass" | S | A1 | D5 | Done | `stars.ts` text and its tests |

### B. The guided first lunch

| ID | Item | Size | Needs | Fixes | Status | Done when |
|---|---|---|---|---|---|---|
| B1 | **`tour.ts` step machine** for beats W1 to T11 (4.1), state-driven | M | none | D1, D2 | Done | Unit tests drive a scripted lunch and see every step in order; a team-finished step still advances |
| B2 | **`Coach.tsx` overlay:** spotlight, bubble, skip, freeze and ½× handling, reduced motion | M | B1, C5 | D2 | Done | Browser test: a new player completes the tour; Escape skips; keyboard reaches every control |
| B3 | **½× speed** (G1) | S | none | D2 | Done | Speed type updated; a replay test shows the same hash at ½× and 1× |
| B4 | **Scene targets:** rings on guests and tables through the label registry | M | A3 | D3 | Done | Screenshot of T2 with the ring on the right guest |
| B5 | **Result-card and first-build steps** (T9, T10) with the cosy aura | S | B2, F4 | D5 | Done | Browser test reaches "table placed" from the card |
| B6 | **Replay proof:** guide pauses and acts; server replay hash matches | S | B2 | n/a | Done | Test in `src/test/` passes in `test:engines` |

### C. The ladder and first-time tips

| ID | Item | Size | Needs | Fixes | Status | Done when |
|---|---|---|---|---|---|---|
| C1 | **Unlock ladder** (4.2) from `history.length`, Reddit only, with Settings → Show everything | M | N1 | D8 | Done | Browser tests for nights 0, 1, 2, 3 and 5 show the right tabs; a test helper opens everything for older tests |
| C2 | **Introduction cards** per ladder row | S | C1, B2 | D8 | Done | Each card shows once; a second device does not show it again (server key) |
| C3 | **First-time tips** for engine events (4.2 list) | M | B2 | D8 | Done | A test per tip: triggered once by its event |
| C4 | **Speeds on the ladder** (G2) and **Hold to prep** from night 3 | S | C1 | D2 | Done | Night 0 shows ½× and 1× only |
| C5 | **Tour progress storage**: `tour:<uid>` Redis set, `GET` with today, `POST /api/tour/seen`, allowlisted ids, TTL, rate limit; `localStorage` in the browser game | S | none | n/a | Done | Server tests against the in-memory store (`fake-store.ts`); build-log entry for the new key |

### N. Navigation and rewards

| ID | Item | Size | Needs | Fixes | Status | Done when |
|---|---|---|---|---|---|---|
| N1 | **Goals tab** replaces the Ledger; **Money** sheet from the header cash; **Street** sheet from the neighborhood button (4.7) | M | none | D8 | Done | Every old Ledger section is reachable in two taps or fewer (browser test lists them); phone screenshot |
| N2 | **Badges** on dock tabs | S | N1 | D9 | Done | Unit test for `badgesFor(state, world)`; a ready milestone shows a dot |
| N3 | **Milestones on top** of Goals with Collect when ready, plus a toast at the moment one becomes collectable | S | N1 | D9 | Done | Browser test collects one from the toast |
| N4 | **Test Kitchen button beside Open** on phones (plan v4 K8, the entry part) | S | C1 | D8 | Done | Phone screenshot; plan v4 tracker updated too |

### E. Guidance before and after the night

| ID | Item | Size | Needs | Fixes | Status | Done when |
|---|---|---|---|---|---|---|
| E1 | **Tonight's tip** card on planning (4.5) with its data table | S | none | D10 | Planned | A test: every headline id has a tip; each suggestion opens its panel |
| E2 | **Live star tracker** in the night bar (4.4) with `previewStars` | M | A1 | D5 | Planned | Unit test: the preview at the last tick matches the server's stars on the bot nights, with the known exceptions listed |
| E3 | **Try next** on the result card (4.6) | S | none | D11 | Planned | One unit test per row; browser test opens the right panel |
| E4 | **Next tag** on the most urgent pass row (G3) and the **service flow strip** on nights 1 to 3 (G4) | S | C1 | D2, D3 | Planned | Screenshot; the strip lights the current guest's step |

### F. The room

| ID | Item | Size | Needs | Fixes | Status | Done when |
|---|---|---|---|---|---|---|
| F1 | **Host stand and door mat** at the entrance (L1) | S | none | D12 | Planned | Screenshot; the frame-time check holds (`FrameWatch`) |
| F2 | **Pass counter with a bell**; ready dishes sit there (L3) | M | none | D12 | Planned | Screenshot; the dish disappears when served |
| F3 | **Tighter service framing on phones** (L5) | S | none | D12 | Done | Phone screenshots before and after in the Log |
| F4 | **Cosy aura** in Build and on nights 1 to 3 (L4) | S | none | D3 | Done | Screenshot; the aura matches `isCozy` (unit test on the tile set) |

### Z. Part 1, after the freeze

| ID | Item | Size | Needs | Status | Done when |
|---|---|---|---|---|---|
| G5 | **Longer team fallbacks** on nights 1 to 3 | M | author decision 7 | Planned | Bots re-run, gates pass, goldens refreshed, a build-log entry with the numbers |
| L6 | **Starter layout**: cosy table nearest the door | S | author decision | Planned | Same as G5 |
| H1 | **Journeys for the tour** (4.12) and a dashboard note in `testing.md` | S | B2 | Planned | Events visible in `devvit logs` during a playtest |
| H2 | **Real-phone pass** of the guided lunch (see `remaining-work.md` section 2A for the device options) | S | B2, C1 | Planned | Screenshots or a recording from a real phone in the Log |

### P. The long game (Part 2)

| ID | Item | Size | Needs | Fixes | Status | Done when |
|---|---|---|---|---|---|---|
| P1 | **Road ahead**, first version: the next three goals from what exists (5.9) | S | N1 | R4 | Done | Unit test for `roadAhead(state, world)` on a new, a day-5 and a day-12 player; phone screenshot |
| P2 | **Skyline by player level** (cosmetic): a storey, sign and lights at levels 3, 6 and 9 | M | none | R3 | Planned | Screenshots at three levels; the frame-time check holds |
| P3 | **Daily round**: three tasks a day from what is unlocked, XP each, a weekly crate after seven (world state, server-checked) | M | none | R6 | Done | Server tests with a faked clock: tasks by date and level, paid once, crate once a week; browser test shows the round |
| P4 | **Lifetime verified stars** on the server, counted by the lock | S | none | R4 | Planned | Server test: a replaced result adds only its gain; a forged client number changes nothing |
| P5 | **Progression simulator** (5.10), first with today's rules to measure the current ceiling | L | P4 | R1, R5 | Planned | The test runs 70 dates in under a minute and prints the unlock calendar; the numbers are copied into the Log |
| P6 | **Engine v3: tiers in the night** (`tier`, caps, queue, goal and arrival factors, migration from `expanded`), one recalibration with tier reference bots, one golden refresh | L | P5 | R1, R2 | Planned | The simulator's gates pass; bots and the 3-engine hash test pass; old saves load at the right tier |
| P7 | **Tier projects** through the builders (needs, cost, real time, settled at planning) | M | P6 | R1, R5 | Planned | Server tests: refused without the needs, finished on the clock, never written during a live service |
| P8 | **Player levels 11 to 20** and their unlocks | S | P6 | R1 | Planned | `LEVEL_XP` extended; tests for the new gates |
| P9 | **Lounge** (tier 3) | M | P6 | R1 | Planned | Engine test: longer queue and slower patience loss; bots recalibrated if needed |
| P10 | **Drinks bar and bartender** (tier 4) with the Pour job | L | P6 | R1 | Planned | Engine and replay tests; the bartender fallback; pass row and phone screenshot |
| P11 | **Takeaway window** (tier 4) with the Box it job | L | P6 | R1 | Planned | Same as P10 |
| P12 | **Private room** (tier 5) | M | P6 | R1 | Planned | Engine test for VIP tips and patience there |
| P13 | **Second floor** (tier 6) | L | P6 | R1, R3 | Planned | Pathing tests across the stairs; camera and Build work on both floors; phone frame-time check |
| P14 | **Chef's table** weekly banquet shift (tier 7) | M | P6 | R6 | Planned | Its own keys and board, like lunch; replay test |
| P15 | **Staff growth**: levels to 10, experience from worked nights, traits | L | P6 | R1, R5 | Planned | Engine tests per trait; experience comes only from the receipt |
| P16 | **Recipe book**: per-dish perfect plates in the receipt, mastery 0 to 3, signature dishes | M | P6 | R6 | Planned | Receipt field replays identically; mastery tests; the K4 shortcut is capped |
| P17 | **Regulars' album** with portraits on the wall | M | none | R6 | Planned | A finished story adds the decor piece once |
| P18 | **Decor sets** and the set bonus | M | P6 | R5 | Planned | Engine test for the bonus; shop shows set progress |
| P19 | **Trophy shelf** in the room and on visits | S | none | R3 | Planned | Screenshot; trophies read only verified results |
| P20 | **Food festival** each week | M | P3 | R6 | Planned | Server test: counts only verified serves of the featured dish |
| P21 | **Season track** (four weeks, cosmetic only) | M | P4 | R6 | Planned | Server tests: moved only by verified stars and rounds; rewards granted once; reset by the scheduler and lazily on first request |
| P22 | **Block level** and street decorations | M | none | R7 | Planned | Server test for block XP from party tiers; decorations in the city view |
| P23 | **Street showcase** | S | P6 | R7 | Planned | Verified only; names only for open doors |
| P24 | **Help requests** (ask the block for a crop) | S | none | R7 | Planned | Server tests: once a day each way, never negative, XP to the giver |
| P25 | **Profile card** on visits and kitchen posts | S | P4 | R3 | Planned | Browser test; nothing private shown |
| P26 | **Skyline by tier** (replaces P2's level rule) | S | P6, P2 | R3 | Planned | Screenshots per tier |
| P27 | **Economy table**: every source and sink with its cap in `design-decisions.md` | S | P5 | R5 | Planned | A test reads the caps from code and the table matches |

### K. The Test Kitchen feeds the restaurant (Part 3, road 1: bounded; from plan v4)

| ID | Item | Size | Needs | Status | Done when |
|---|---|---|---|---|---|
| K1 | **Chef skills.** Each Test Kitchen star is one skill point. Four small perks for a restaurant night: **Knife** (prep counts perfect within 25% of ideal, not 20%), **Fire** (the station move's perfect window ±18%, not ±15%), **Rhythm** (the chain lapses after 10 s, not 8), **Charm** (a cosy table tips 15%, not 10%). Stored in the saved park (a replay input), set only by a server route that checks the points against the stored arcade save | M | none | Planned | A bot with skills differs from one without and replays identically; the server refuses more points than the save allows; the card shows "Knife ★★" |
| K2 | **Catering gig.** "Today's shift" becomes a neighbor's catering order: reach its target once a day for **cash ($60 to $150 by shift), XP and a produce gift**, paid through the world routes; a "Gig" chip on the tasks strip; a daily-round task | M | none | Planned | Server test: paid once a day, never above the cap, refused with the doors open; the chip opens the kitchen |
| K3 | **Today's headline in the kitchen.** Rain (wet floor, slower walk), rush (faster arrivals), critic (a VIP who wants a perfect plate), supplier (fewer patties), inspection (dirty plates count against you), payday (bigger tips) | M | none | Planned | Seven headlines each change the kitchen in one visible, tested way; the briefing says how |
| K4 | **Signature shortcut.** Two stars on a shift that features a recipe gives that dish its first mastery star in the recipe book (P16), once | S | P16 for the book; X1 for more than two dishes | Planned | Salad and burger work; each new recipe adds one |
| K5 | **Hands-on batch.** A 60-second mini-shift takes 30 minutes off a workshop batch per star, once a day per good | M | none | Planned | Server test for the cap; the Workshop card offers it |
| K6 | **Your produce in the kitchen.** Pantry produce appears as crates; using it scores +10% on that dish; the pantry is not consumed | S | none | Planned | The kitchen reads the pantry; a test shows the bonus and an unchanged pantry |
| K7 | **Your kitchen is your restaurant's.** Station levels and the tier show as faster grills and bigger boards; your hired chef is an AI sous-chef in solo; outfits are shared with the restaurant staff and the season cosmetics | M | none | Planned | Station level and the sous-chef visible and tested; outfits match on the rooftop |
| K8 | **Where it lives.** One-tap entry on phones (done by N4), a gig chip, and a result card that says what the shift gave the restaurant ("+1 skill point, +$90") | S | N4, K1, K2 | Planned | Phone screenshot with the entry and the card |

### X. The kitchen game grows (from plan v4, was "E")

| ID | Item | Size | Needs | Status | Done when |
|---|---|---|---|---|---|
| X1 | **More recipes and stations** on the restaurant's station bodies: soup (stock pot: hold to stir), flatbread (oven: timed like the grill), fries (fryer: lift on the beep), stir-fry (wok: toss rhythm); then ramen and dumplings | L | none | Planned | Each recipe has a station, a rule, points, a test and a practice step; the lazy chunk stays in budget |
| X2 | **Nine shifts, not three** (three tiers of three), with themed shifts (Garden Party, Critic's Night, Rain Rush, Banquet); star lines set by scripted bots | M | X1 | Planned | A test fails if a star line is unreachable |
| X3 | **Seeded daily challenge and an endless mode** (until three orders time out) | M | none | Planned | Two clients on the same date get the same orders |
| X4 | **Hazards and events**: a spill, a power flicker, a VIP order, a delivery crate, a rush of three tickets | M | none | Planned | Each has a cue, a counter and a test |
| X5 | **Tools from the skills**: a faster knife, tongs, a timer ring on every order | S | K1 | Planned | Each visible in the HUD and tested |
| X6 | **Better practice**: per recipe, a coach line from real state, a "show me" ghost | M | X1, B2 | Planned | A new player serves within 60 seconds in a scripted browser run |
| X7 | **Chef cosmetics** unlocked by stars, shown in the kitchen and on the rooftop | S | K7 | Planned | Unlocks are server-checked |
| X8 | **Phone controls and performance**: one-thumb stick with a contextual action, landscape layout, quality tiers in the kitchen scene | M | none | Planned | Phone screenshots and a frame-time check |
| X9 | **Sound from the shared mixer**: chop, serve, fire and miss synthesised, so the speaker switch rules both games and the audio files can go | S | none | Planned | The audio budget falls; the switch silences the kitchen |

### V. Verified and social kitchen (from plan v4, road 2)

| ID | Item | Size | Needs | Status | Done when |
|---|---|---|---|---|---|
| V1 | **A deterministic kitchen core** (7.3) | L | X1, X2 settled | Planned | Golden hashes for scripted runs agree in Chromium, Firefox and WebKit |
| V2 | **Daily Kitchen on the server**: the input log replayed; its own stars, board and streak; the bounded rewards stay | L | V1 | Planned | A run replays to the same score; a forged log is rejected; the board only holds replayed scores |
| V3 | **Ghost runs**: watch the day's best run or race a friend's | M | V2 | Planned | A ghost replays to the stored score |
| V4 | **Online co-op** in lockstep over realtime, reusing the hosted-service code; local two-chef mode stays | L | V1 | Planned | The lockstep rig test and a two-account test |
| V5 | **Kitchen cook-off**: verified kitchen stars count for the block party and the block level | S | V2, P22 | Planned | The counter reads kitchen stars; a cap test |
| V6 | **Share a shift**: a scorecard image through the media capability, with the confirm step | S | none | Planned | One image posted with the confirm step |

### Q. Quality, every item

| ID | Rule | Status |
|---|---|---|
| Q1 | A unit test for every new rule; a golden for every new deterministic path; economy tests for every payout (caps, once a day, refused with the doors open) | Standing |
| Q2 | Budgets pass (`npm run perf:check`); new models only if a primitive build will not do | Standing |
| Q3 | A phone screenshot for every new screen, a build-log entry for every decision, a row in `assets-provenance.md` for every new file | Standing |

---

## 9. Order and dates

Today is 24 November. The **freeze is 5 December**; submission closes **8 December, 6 pm PT**. The hackathon asks for a game "understandable from the example post alone", so Part 1 is judged directly. Part 2 and most of Part 3 change night rules or need weeks of play to matter, so they come after the submission. During judging, only upload a version that passes every check in section 0.

| Milestone | Items | About | When | Why this order |
|---|---|---|---|---|
| **M1 Clear** | A1 to A8, F3 | 2 days | 24 to 26 Nov | Cheap, no engine change, fixes what every player meets first |
| **M2 Guided** | C5, B3, B1, B4, B2, B6, F4, B5 | 4 days | 26 Nov to 1 Dec | The biggest single change: the first lunch teaches the game |
| **L0 The arc, visible** | N1, P1, P3, P2, N4 | 3 days | 1 to 4 Dec | Shows the long game without touching the night: Road ahead, the daily round, a growing skyline, the kitchen one tap away |
| **Freeze** | fixes only | | 5 to 8 Dec | Demo video, form, survey |
| **M3 Gradual** | C1, C2, C4, N2, N3, C3 | 3 days | 9 to 12 Dec | The ladder and first-time tips |
| **M4 Guidance** | E1, E3, E2, E4, F1, F2 | 2 days | 12 to 15 Dec | The headline and the result point to the next move |
| **K-M1 Kitchen joined** | K1, K2, K3, K8 | 4 days | 15 to 19 Dec | Bounded, the biggest "it is one game" feeling |
| **L1 Engine v3** | P4, P5, P6, P7, P8, P26 | 8 days | 19 Dec to early Jan | The spine: tiers, scaling and the one recalibration |
| **L2 Rooms and people** | P9, P12, P15, P16, K4, P18, P19, P17 | about 2 weeks | January | The things to build and the things to collect |
| **L3 Rhythm and street** | P20, P21, P22, P23, P24, P25, P27, Z (G5, L6, H1, H2) | about 2 weeks | late January | Weekly and monthly reasons to return |
| **K-M2/M3 Kitchen grows** | X1, K6, X9, X2, X3, X4, K7, K5 | about 2 weeks | alongside L2 and L3 | More to cook, on the stations the tiers open |
| **L4 Big rooms** | P10, P11, P13, P14 | about 3 weeks | February | The largest engine pieces, once the spine has settled |
| **K-M4/M5 Kitchen verified and social** | V1, V2, X5 to X8, V3 to V6 | about 3 weeks | after L4 | The expensive step after the rules settle |

If time runs short before the freeze, ship **M1 and M2**. If L0 does not fit, P1 (Road ahead) alone is the most useful piece of it.

---

## 10. Decisions for the author (defaults in bold)

**Decided 24 November 2026:** the author delegated every decision below ("do what will be better for the game"). All defaults are taken as written.

1. Is the guided lunch the player's **official** first lunch? **Yes.** The freezes are presentation only; the result is verified.
2. Hide systems until they are useful? **Yes, on Reddit, with Settings → Show everything.**
3. Reputation icon? **A thumbs-up with "/5".**
4. Rename "hustle" to **Combo** in the interface? **Yes.** Code names stay.
5. Rename "star guest" to **VIP** with a crown? **Yes.**
6. What goes in before the freeze? **M1, M2, then L0** (section 9). Plan v4's kitchen M1 moves to after the submission.
7. Longer team fallbacks for new players (G5)? **Not before the freeze.**
8. Seven tiers, stall to legend, about ten weeks for a daily player? **Yes**; the simulator (P5) sets the final numbers.
9. Idle income, like Clash of Clans' collectors? **No.** The earlier refusal stands: income across days without a night would spend the headline without the player. The garden, workshop, orders and the gig are the between-night income.
10. Goals scale with the tier? **Yes**, so a big restaurant still has to play well.
11. Seasons, crates and cosmetics, never for money? **Yes. No payments of any kind.**
12. Should a kitchen result ever count toward the daily stars, the streak, the tier or the season? **No, not until V2 replays it** (plan v4 decision 1).
13. Is the catering gig paid in cash? **Yes, small and capped ($60 to $150, once a day), with XP and a produce gift.**
14. Do kitchen skill points survive a change to the kitchen's star lines? **Yes: a changed line never takes a star back.**
15. Does the kitchen ever replace the pass's moves inside a night? **No** (6.3).
16. Keep local two-chef co-op once online co-op exists? **Yes.**

---

## 11. Risks

- **Test churn.** Many browser tests click through the interface (for example `full-loop.browser.test.tsx`, `restaurant.browser.test.tsx`, `pass.browser.test.tsx`). The ladder hides tabs and the guide covers the screen. Add one helper that marks the tour seen and turns the ladder off, and use it in older tests; new tests cover the new behaviour.
- **A guide that gets stuck.** Steps advance on state, every step has Skip, and a step whose target never appears for 20 seconds of real time skips itself.
- **Overlays on moving 3D targets.** Scene targets use the same projection as the guest bubbles; if a projection is missing, the spotlight falls back to the pass row.
- **The star preview disagrees with the card.** It is labelled "so far" and tested against the bots; the server stays the only truth.
- **Copy drift.** Help text lives in one module; the README's *How to play* is updated in the same change.
- **Scope.** M2 is the largest piece. B1 and B2 should be built before polishing anything else in M2.
- **Engine v3 is the largest risk in Part 2.** Do it once, with the simulator and tier reference bots in place first (P5 before P6), and keep the first-three-nights goal unchanged.
- **Complexity comes back.** Part 2 adds many systems; each must enter through the ladder (4.2) with one introduction card, or Part 1's work is undone.
- **Economy creep.** Every payout is a new source of cash or XP; each gets a cap, a test and a row in the economy table (P27).
- **Timers as chores.** Short first timers, wilting that only lowers yield, and no timer that blocks a night (principle P10).
- **Phone performance.** Bigger rooms and a second floor add draw calls; the quality tiers and `FrameWatch` checks apply to every room item.
- **Changing the kitchen's rules after V1 refreshes its goldens**, so its rules settle (X1, X2) before determinism (V1).

---

## 12. Log

| Date | Item | What happened |
|---|---|---|
| 2026-11-24 | Plan | Written after reading the code and the phone screenshots. Nothing built. |
| 2026-11-24 | Plan | Extended with Part 2 (the long game) and Part 3 (plan v4 merged, its "E" items renamed X). Renamed from `plan-v5-onboarding.md` to `plan-v5.md`. Nothing built. |
| 2026-11-24 | M1 | Done: A1 to A8 and F3. Symbols (thumbs-up reputation, crown VIP, lightning Combo; stars only for the night's score), text Rush and Free buttons, two seat buttons reading "Table 3 ✦", number plates over tables in service and Build (one `tableNumber` helper in `layout.ts`), a break-even money line (`moneyLine` in `bills.ts`), a true *How to play* for Reddit (`help-content.ts`) with a ? button at every width, Reddit-correct notices (and the browser-only capital banner hidden on Reddit), the splash sentence, tighter service framing in portrait. Left out: a visible "The pass · your orders" heading (it cost a row of height on phones; the pass rows say what they are) and the listing text in `docs/listing.md` (portal values the author re-enters by hand). Unit 1,066 and browser 248 tests pass. |
| 2026-11-24 | M2 | Done: C5, B3, B1, B4, B2, B6, F4, B5, and C4 brought forward. The guide (`tour.ts` steps, `Coach.tsx` overlay) welcomes a new owner, points at Open, freezes the first lunch at seat, order, cook, serve and clear, explains the bar, slows the cooking to ½× with live cues ("In the box: Flip now!"), hands the lunch over, teaches the three stars inside the first result card, and walks through buying a cosy table (gold tiles in Build, `cozyTiles` in `layout.ts`). Progress is a Redis hash `tour:<uid>` (90 days) through `POST /api/tour`, returned with today. A ½× speed; on Reddit 2× and 3× and "Hold to prep" wait until night 3. Proof: `guided-replay.test.ts` (frozen and ½× play replays to the same hash on three dates), `tour.test.ts`, `tour-server.test.ts`, `coach.browser.test.tsx`. Help has "Replay the tour on my next lunch". Initial JS 494 of 650 KB. |
| 2026-11-24 | L0 | Done: N1, P1, P3, N4. The Ledger is split: **Goals** (dock tab: Road ahead, today's round, challenges, milestones with ready ones on top, research, regulars, a link to the street), **Money** (tap the cash: the week, the register, tonight's totals, the loan, receipts) and **Street** (neighbors, open doors, co-op, reminders; from Goals or the neighborhood view). **Road ahead** (`road-ahead.ts`) lists the next three goals from milestones, the next player level's unlocks, the terrace and research. **Daily round** (`round.ts`): three tasks a day from the date and the day's starting level (one always at the pass), XP once each, counted only from garden routes and the replayed receipt; five full rounds in a week open a crate ($150, 30 XP) through `POST /api/world/crate`. Changed from the plan: five of seven rounds, not seven, so one missed weekend does not lose the week. The Test Kitchen button sits beside Open on phones from the third night. **Deferred: P2** (skyline by level): pure 3D placement that needs a visual check on screenshots, which this session could not open; it waits for a session that can look. |
| 2026-11-24 | M3 | Done: C1, C2, C3, N2, N3 (brought forward from after the freeze: no rule changes). The **unlock ladder** (`ladder.ts`): night 0 shows only Open and the pass; Build, Goals, Rush and Free from night 1; Menu, Garden and the Test Kitchen from night 2; Team (with 2×, 3× and Hold to prep) from night 3; the Street from night 5. It is off in the browser game, for a player who skipped the tour, and with Settings → "Show everything" (stored on the device). Each new system gets one **introduction card** pointing at its tab, plus one on night 4 when the headline's own goal starts to count. **First-time tips** (once each): a decision, a VIP, the bank's notice, a milestone ready, a crop ready. **Dots** on Goals and Garden when something there is ready (`badges.ts`). Changed from the plan: no toast for a ready milestone, because a phone toast covered the Lunch/Dinner picker; the dot, the ready-first order in Goals and the one-time tip cover it. Under a full parallel browser run three older tests can hit their 15 s timeouts; each passes alone. |
