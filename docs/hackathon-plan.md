# Too Many Cooks — Reddit Game of the Day plan

Hackathon: [Reddit’s Game of the Day](https://redditgameofday2026.devpost.com/) (11 Nov 2026 – 8 Dec 2026, 6:00pm PST).
Platform: [Devvit Web](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_overview).
Playtest, don’t publish: [Running your app](https://developers.reddit.com/docs/quickstart#running-your-app).

This repo today: a browser restaurant tycoon (React 19, React Three Fiber, Vite). Progress lives in `localStorage`. The playable entry is `ManagementGame`. A service day is already `DAY_LENGTH = 150` seconds, plus time to finish the floor.

This document is the build plan. It does not change the game yet.

An earlier draft of this plan turned the tycoon into a 75-second ticket puzzle and replaced the 3D scene with a flat pixel canvas. That draft is withdrawn. The game stays a restaurant you own, in the 3D rooftop, with guests that surprise you.

## What we are shipping

One interactive post. You own a rooftop restaurant. Staff cook, serve, and clean. Guests arrive on their own, order, lose patience, tip, or walk out. Between services you build, hire, train, and price the menu. That is the game, in the same family as RollerCoaster Tycoon: a place that runs, a calendar that changes the conditions, and a report at the end of the day.

The **daily** is the morning headline on that calendar, shared by the whole subreddit. Rain, a critic, a supplier hike, a payday crowd. Your floor, your prices, and your staff are yours, so the same headline plays out differently in every restaurant. When the service closes, one result card shows the day’s stars, the streak, and how the neighborhood did under that headline.

Submit it as a port of this existing game (**Best Ported Daily Game**, and still eligible for Best Daily Game). The Devvit Rules forbid a “full version lives elsewhere” link, so the Reddit post is the whole game.

App slug: `too-many-cooks` (14 characters, matches `^[a-z][a-z0-9-]*$`).

### Upload and playtest. Do not publish.

The hackathon asks for a private app on Reddit, not an App Review submission. App Review is for a launch to a wide audience, and they have asked teams to wait until after 8 Dec.

| Command | What it does | Hackathon |
|---|---|---|
| `devvit playtest` | Runs the app on your dev subreddit while you work. This is the quickstart’s “running your app” step. | Use this every day. |
| `devvit upload` | Stores a private version on the developer platform. It does not list the app or send it to review. | Use this for the build judges can open. |
| `devvit publish` / `npm run launch` | Submits the app for App Review. | Do not run this for the hackathon. |

Judging uses the demo post on the playtest subreddit. The app stays private.

## The tycoon we already have

`RestaurantEngine` (`src/management/engine.ts`) is the game. The Reddit work puts it on Devvit, gives each real-world day a headline, and saves the park in Redis. It does not replace the simulation with a script.

Keep, and build on:

- Fixed 0.1s steps and the seeded LCG in `random()` (`seed = imul(seed, 1664525) + 1013904223`).
- Grid, footprints, and A* in `layout.ts`.
- Guest stages: arriving → waiting → cooking → ready → delivering → eating → leaving.
- Autonomous chefs and servers in `assignJobs()`.
- The price walk-away in `arrive()`: a guest who finds the menu too expensive never sits. That roll stays. It is one of the ways the day surprises you.
- Arrival spacing that already depends on reputation, day, and a random gap (`9.5 - reputation * 0.6 - day * 0.12`, plus up to 2s of jitter).
- Patience from atmosphere: `48 + comfort * 0.18` seconds.
- Tips from comfort and wait time.
- Dirty seats blocking the next guest.
- Two dishes in `DISHES` (garden salad on `prep`, sunset burger on `grill`), with room to add more later.
- Challenge math that pays a bonus and never pretends the bonus is revenue.
- Cash, wages, rent, training, the terrace, the recovery loan, milestones.
- The four species: mouse, crocodile, rabbit, bear.
- The 3D scene: `RestaurantScene`, the city, weather, traffic, the orthographic camera.
- The palette: cream `#FFF2D7`, ink `#233D3B`, teal `#224F4A`, tomato `#DC533C`, gold `#F2B743`.

Change for Reddit, without shrinking the sim:

- Saves move from `localStorage` to Redis. Devvit changes the webview origin on every upload, so a browser save disappears on the next version.
- If you leave during an open service, that one service can finish without you. `resume()` already replays the real steps. On Reddit it stops at `finish()` of the service that was open. It does not start another day, spend tomorrow’s headline, or run while the doors are closed. Coming back shows the receipt for that night, the same “while you were away” summary the engine already computes, for one service. A day you never opened still waits.
- The welcome essay and the stack of Radix dialogs go away. The Build, Team, Menu, and Ledger dock stays. It is how you run the restaurant. During an open service it collapses to a thin bar so the floor is what you watch.
- Remote fetches stay forbidden. `src/game/assets.ts` already points at `/assets/...`. Keep it that way.

1×, 2×, and 3× stay. They only change how fast the client calls `update()`. The server replays the same 0.1s steps, so a faster watch is not a higher score.

## Pixel feel on the existing 3D scene

Codixel is here to make the current rooftop read as pixel art. The animals, furniture, city, camera, paths, rain, and traffic stay the meshes and the simulation they are now. Nothing is redrawn as a 2D board, and the procedural rigs are not replaced by billboards.

The feel comes from how that scene is presented:

- Render `RestaurantScene` into a small target, about a third of the post width, then blit it to the full size with nearest-neighbor filtering. Edges stay hard. The camera move, a guest walking around a planter, and the rain are the same objects, seen in chunky pixels.
- Snap the blit through a 16-color palette so the bands stay flat instead of turning into a blur. Codixel authors that palette with `P.hueRamp` (cream, ink, teal, tomato, gold, leaf) and saves it as `public/pixel/palette.png`. The blit shader picks the nearest palette color per pixel.
- On the Android Reddit client, WebGL has composited as a black canvas unless the frame is copied through a 2D canvas. This blit is that copy: `drawImage` into a 2D canvas with `imageSmoothingEnabled = false`. One path does the pixel look and the workaround.
- `prefers-reduced-motion` keeps the existing scene cuts (no bounce, no rain streaks). The pixel scale stays, so the look does not change when the motion stops.

Codixel also draws the flat pieces that sit on top of the scene, because those are simple objects and the skill is built for them: the panel frame, award banner, guest-thought bubble, dish icon, and research stamp. They are DOM or sprites parented to the existing menu board, with `NearestFilter`. Previews come before any file is imported, in this order: palette swatch on a still of the real scene, then the frame, then the thought bubble. Animals are not on that list.

The SaaS look is the chrome around the scene: rounded paper cards, Lucide, Radix dialogs, Sonner. Those panels use the pixel frame and **Silkscreen** (OFL, via `@fontsource/silkscreen`), bundled. Fredoka can stay on the restaurant sign in the world. It leaves the menus.

Codixel runs in Node under `tools/pixel/` at authoring time. It does not run in the Devvit server and it is not a runtime dependency.

## The daily, without scripting the guests

### A headline, not a guest list

`createDailyHeadline(date)` is a pure function in `src/management/daily-headline.ts`. The client and the server both call it. The server never trusts a headline sent from the browser.

```ts
type DailyHeadline = {
  date: string;                 // 'YYYY-MM-DD' UTC
  seed: number;                 // mixed into the existing LCG at the moment doors open
  weather: 'sunset' | 'sun' | 'rain';
  id: HeadlineId;
  title: string;                // five or six words, shown on the open screen
  blurb: string;                // one sentence
};

type HeadlineId =
  | 'quiet'
  | 'rush'
  | 'rain'
  | 'supplier'
  | 'critic'
  | 'payday'
  | 'inspection';
```

The weekday picks the headline. The date seed only jitters numbers inside that headline (how many critics, how steep the supplier hike), and it is mixed into `state.seed` when you open. From that moment, `arrive()`, dish choice, species, price refusals, and specials use the engine’s existing `random()`. Two owners with different floors do not see the same queue. That is the point.

| Day | Headline | What it changes in the current formulas |
|---|---|---|
| Mon | A quiet neighborhood | Patience ×1.15. Arrival gap a little wider. The teaching day. |
| Tue | The boulevard is busy | The arrival-gap formula subtracts an extra second. More people, same AI. |
| Wed | Rain on the roof | Weather is rain. Walk speed ×0.9. Comfort counts ×1.5 toward tips, so a bare room hurts and lanterns matter. |
| Thu | The butcher raised prices | Burger ingredient cost ×1.5 for this service only. Salad is untouched. |
| Fri | A critic is in the neighborhood | `isSpecialGuest` is true more often. A special who walks out caps the night at 2★. |
| Sat | Payday | The price walk-away roll is halved, so a bold menu survives more often and a fair menu leaves tips on the table. |
| Sun | The inspector comes at closing | Each dirty seat still on the floor at `finish()` pulls the rating down harder. |

These are weights on code that already exists (`arrive`, `guestPatienceSeconds`, `comfort`, `isSpecialGuest`, `finish`). They are not a handwritten list of twelve guests.

### Your park persists

Redis stores the restaurant, not a one-shot puzzle.

At **Open**, the client sends the current `RestaurantState` (layout, staff, menu, cash, day, seed). The server checks it with `restaurantSchema` and `layoutError`, mixes in the headline seed, and stores that opening snapshot. The service then runs locally, as it does now.

At the receipt, the client sends the snapshot id plus any owner actions taken during service. The server rebuilds the engine from the snapshot, applies the headline, replays the actions, and steps until `finish()`. The receipt it computes is the one that can be locked. A client total that disagrees is rejected.

Owner actions during service stay rare. The staff already run the floor. The log exists so a deliberate intervention can be verified:

| Action | Effect | Limit per service |
|---|---|---|
| `comp(guestId)` | That table’s price becomes 0, they stay happy, ingredients stay spent | 2 |
| `priority(guestId)` | That waiting guest is the next dish the chef picks up | Unlimited, because it is a call on the pass, not a superpower |

`hustle`, door queues, and turn-aways are out. They turned the owner into the line cook. Comp and priority are the “open the ride” / “refund the angry guest” buttons in a tycoon: useful, scarce or soft, and unable to replace a bad layout.

Build, hire, train, price, sell, and expand stay the real decisions, and they happen **before** Open, while the dock is up. The opening snapshot is what the server trusts, so those decisions are already inside the replay.

### Stars, on top of the receipt

The receipt you already write in `finish()` stays the source of the numbers. Stars read that receipt. They do not replace profit, wages, or the ledger.

| Star | Meaning |
|---|---|
| 1★ | Today’s headline goal. Monday is “serve 6 and stay above $0.” Friday is “every critic leaves happy.” Sunday is “rating at least 3.5 with no dirty seats at close.” Each headline has its own line, authored next to the weights, and checked by the bots below. |
| 2★ | Also clear two of the three daily challenges from `createDailyChallenges`. Those challenges already roll from the menu and the equipment you actually own. |
| 3★ | Also beat your own previous service’s profit, or hit the headline’s stretch number if this is your first service. |

A missed star does not reset the park. RollerCoaster Tycoon does not delete the park when you miss the scenario goal. You read the report, move a table, change a price, and open again.

### One official service per UTC day

- The first time you close a service on a UTC date, that receipt can be locked. It is the one that counts for the streak and the neighborhood.
- You may keep playing further in-game days the same evening. They save to your park and they do not move the streak. Tomorrow’s headline is tomorrow’s.
- Replacing a lock is allowed only with a later service **that same UTC date** whose replayed star count is higher, or whose profit is higher at the same stars. Remodeling and reopening is the tycoon version of “try the level again.”
- The streak ticks when the locked service earned 1★ and the previous lock was yesterday or today. Miss a date and the next 1★ starts the streak at 1. The park is still there.
- Pause, 2×, and 3× work in official and practice services. Hiding the tab saves state to Redis and resumes on return. It does not fast-forward.

### How a day is calibrated

`src/management/bots.ts` runs the real engine. Bots do not emit ticket taps. They own a restaurant.

- `bareBot` opens the starter layout from `createRestaurant()` with no changes. After the starter drops the opening server, this bot never hires one, so plates wait.
- `cozyBot` buys one planter and one lantern, prices at the fair value, then opens.
- `greedyBot` pushes both prices to the walk-away edge and does not buy atmosphere.

Replay each bot across the next 21 dates, from the starter park, one service each. Gates:

- `cozyBot` earns 1★ on at least 18 of 21 dates. Monday through Wednesday should be the easy end of that.
- `bareBot` earns 1★ on quiet and payday days, and misses it on inspection or critic days often enough that a naked starter room is a real choice.
- `greedyBot` makes more cash than `cozyBot` on payday and less on a normal day, so the price roll is doing its job.
- If a headline fails a gate, change its multiplier or its star line. Leave `arrive()` alone.

## Why people came back, and the ladder we are missing

RollerCoaster Tycoon (1999 and 2002) had no online leaderboard and no multiplayer. Players stayed for years because the next park was a new puzzle, the last park left a personal record, and the simulation kept producing stories. Clash of Clans keeps people because the village is still there tomorrow and there is always another building. Kitchen Rush, as written up in the state canvas on 18 Nov 2026, has the simulation and then stops: 2 dishes, 6 furniture types, 4 milestones in `GOALS`, training capped at 3, weather that does not change a single dollar, and no goal after the fourth.

A ranked board is the Reddit extra. It is not the reason to open the game. RCT’s reason was the next scenario and your own company value. Ours is the next contract on a restaurant that never resets, plus today’s headline.

### One rooftop, many contracts

RCT unlocked a new park. Clash never threw the village away. We follow Clash for the place and RCT for the goals. There is one restaurant. Beating a contract unlocks the next contract and, on a few of them, something new to buy. The floor, the staff, and the cash carry over. Losing a contract writes a bad line on the receipt and leaves the doors open for another try.

The four goals already in the engine stay first, unchanged:

| Already shipped | Goal |
|---|---|
| A warm welcome | Serve 5 guests |
| Make it yours | Reach 50 atmosphere |
| Room for everyone | 5 tables |
| The neighborhood favorite | 3 completed services |

Then the campaign continues. Each contract is a constraint, the way one RCT scenario forbids deleting trees and another starts you in debt. The guest AI does not change. What you are allowed to do, or what “success” means, does.

| Next contract | Constraint | What it teaches |
|---|---|---|
| Pay the roof | Clear the recovery loan, or bank $400 profit if you never took it | Cash flow, the loan you already have |
| Three good nights | Rating at least 4 on three services | Patience, comfort, staffing |
| Nailed down | For one service, selling furniture is refused | Live with the layout, as in a scenario that will not let you bulldoze |
| Honest prices | Both dishes within $4 of fair, and the night still profitable | The price walk-away is a tool, not a tax |
| A full room | At least 8 seats, and serve at least that many in one service | The terrace and the pathing rules |
| Regulars’ table | Keep a named regular happy three visits in a row | The new regular system below |

The contract sits on the receipt under the stars. Tomorrow’s headline is still the daily twist. The contract is the longer reason, the one that survives a week.

### The kitchen card

RCT rated every coaster on Excitement, Intensity, and Nausea, and that rating told you who would ride and what you could charge. Our equivalent is three numbers already hiding in the sim, shown on the receipt and, with the doors closed, as a preview from the last service:

- **Welcome.** Comfort, plus whether paths from the entrance to the seats exist and how long they are (`layout.ts`). A pretty room nobody can reach scores low.
- **Speed.** Average wait against `guestPatienceSeconds`.
- **Value.** Menu price against `DISHES[dish].fair`, and the tips that followed.

Moving a planter, hiring a second server, or raising the burger should move a bar the next night. That is the mastery loop: the same restaurant, a better reading of it. No separate coaster-building mode.

### Awards, and the record that is yours

At `finish()`, pick **one** banner from the receipt. The rules are fixed so the banner is a joke the sim earned:

| Banner | When it fires |
|---|---|
| Warmest room | High comfort, few walkouts |
| Best food | Many served, waits well under patience |
| Sharp prices | Strong profit and several price refusals |
| Most confusing layout | Seats that exist, paths that are long |
| Untidy close | Dirty seats left when the night ends |
| Quiet night | The doors were open and almost nobody came |

Company value, in the RCT sense, is cash plus what the furniture would refund (70%, the sell rate already in the engine). The ledger keeps your best value and the day you set it. Beating it is the personal high score on the scenario-select screen. Nobody else’s park has to be involved.

The neighborhood line on the card counts how many kitchens in this subreddit earned today’s banner (“8 warm rooms tonight”). That is the social part RCT did with rival parks and banners, moved onto the subreddit. A sorted profit ladder stays off the card. A day-10 kitchen would own it, and RCT never needed that race.

### Research, regulars, weather, and the rest of the canvas

These are the systems the state canvas called out as missing. They plug into `RestaurantEngine`. They do not add a second game.

**Research.** A small budget you set with the doors closed: $0, $20, or $40, taken in `finish()` the way wages are. The meter is on the save. Thresholds unlock a buy, and a missed day does not skip it.

1. Garden soup. The meter unlocks the right to buy a soup pot. The dish turns on when that pot is on the floor, on the prep side. Cheaper and faster than the salad, fair price under the salad. The new recipe is a machine you can see, the way a pizza oven adds a pizza.
2. A window bench. Comfort piece, one cell, so atmosphere is not only planters and lanterns.
3. Staff cloth. Hat and apron colors already exist on the unmounted arcade wardrobe (`setOutfitColor`). They become a cosmetic on management staff and save with the park. The village should look like yours.

**Named regulars.** After the third service, the seed can mark one species-and-dish pair as a regular, with a name from a fixed list of about twelve. One arrival slot per service is theirs. If their dish is on the menu they pay a little over fair and think “The usual.” If it is off, they think “Not today” and count as a miss for the regulars contract. Cap the book at four regulars. This is peep personality without free-written names.

**Weather that changes the night.** The cycle in `weather.ts` is cosmetic today. Under a headline it is forced (rain on Wednesday). On other days the visible weather also applies the rain or sun weights: rain slows walking and makes comfort matter more for tips; bright sun shortens patience slightly and raises the chance of a burger order. The city stops being a backdrop that cannot affect the business.

**Music.** Three beds, all local, all in the build. The files already in `src/game/assets.ts` stay (`music`, `chop`, `served`, engine, horn). Add two original loops we have the rights to, under `public/assets/audio/`: a quieter bed while the doors are closed, and a rain layer that ducks the service track whenever the weather is rain. The service track plays while the doors are open. Chop and the serve sting stay tied to those sim events, including a dish you cook yourself. One speaker toggle. No licensed soundtrack.

**The pass.** `KitchenEngine` in `src/game` is already a hands-on cook: orders, chopping, a plate, a guest who leaves if you are late. It is unmounted. It becomes the station you work, on ordinary nights, not a contract we might get to later.

While the doors are open, any ticket with no chef free can be yours. Tap it and the arcade station opens for that one dish, on top of the 3D room. Finish the dish and the tycoon guest moves to `ready`, the same as if a chef had plated it. Burn it or time it out and the ingredients are spent and the guest is still waiting. Hire another chef and fewer tickets land on you. You can still grab one. The first nights, with a single chef and no server, are supposed to feel busy. Staff are how the night gets quieter, which is the Restaurant Tycoon turn, using a mode this repo already has.

**What we are not copying.** RCT’s file-trading (.TD4 / .TD6) and OpenRCT2 multiplayer. A layout code you can post would be the file-trading version, and it is after the hackathon. Builder timers and a second restaurant that resets the first are out. Candy Crush lives and a 75-second board are out.

### Restaurant Tycoon

The Roblox series (Ultraw) is a different fantasy from RollerCoaster Tycoon. You start by seating, taking orders, cooking through a short tapping game, and picking cash off tables. Hiring a chef is the moment the restaurant begins to run without your hands. Decoration rating pulls more guests in. A new appliance is a new recipe. Other players can walk into your plot, so the room is a showcase. The catalog is huge: global cuisines, many floors, hundreds of dishes.

We take the feeling, not the catalog.

**A reward while the night is still going.** Cooking there takes seconds, and the tip is on the table before you have time to get bored. Our dollars already move when a plate is delivered (`recordIncome`, `GuestPayment`). During service those bills have to land on the table in the 3D room and then reach the register, one guest at a time. The receipt at close is the summary. It cannot be the first time the player sees the money.

**Decor fills the room.** Comfort today changes patience and tips only. The gap until the next guest is `9.5 - reputation * 0.6 - day * 0.12`, plus jitter. It does not read the planters. Add a capped comfort term to that gap, something like a third of a second off per 10 atmosphere, and never enough to double the crowd. The shop line for a lantern becomes “guests stay longer, and a few more walk in,” which is the decoration rating from Restaurant Tycoon.

**The first hire is the turn.** That game is sticky because you feel the job leave your hands. We currently open with a chef and a server already on the payroll, so the player never has the hectic night. The starter park keeps the chef and starts without the server. Plates sit on the pass, and the tickets the chef cannot reach are yours to cook at the station. The thought is “Ready, and no one to carry it,” or “On the pass, if you want it.” The first hire is that server. The next hire is a second chef, and the station goes quiet unless you step up. That is the automation reward.

**A menu you can learn.** Before the first service, pick Garden, Grill, or Noodle. It chooses the opening dish, which appliance the research meter offers first, and which decor the shop leads with. Each style grows to about four dishes, so the whole book is around a dozen, each with a cost, a fair price, a station, and a cook beat at the pass. Five hundred dishes would not make the simulation deeper. It would make a phone-sized menu no one can price, and it would mean hundreds of models and balance passes before 8 Dec. The thing worth taking is a recipe list that opens because you bought a machine and learned the station.

**Five stars is a long chase.** Reputation is already a 1-to-5 number that moves slowly (`0.65` of the old value plus `0.35` of tonight). Put those stars on the sign in the scene. Reaching 5.0 takes many good nights. That is the completionist target, instead of emptying a recipe list.

**Other people in the dining room.** Two ways, both real shifts, described in the Reddit section below. Someone with the daily post open can show up as a guest in your service. Someone can also spend a night in a kitchen whose owner left the door open, and the owner comes back to the tip and the thought. What we do not do is run one shared physics room where every player’s chef, path, and plate are the same objects. Devvit can pass small messages between people on a post. It cannot host that clock. A sorted cash ladder, drive-thrus, farms, extra floors, and a thousand-level campaign stay out.

### Subway and Candy Crush, in one pass

The receipt still names the closest walkout, because a near miss is why a run feels finished. The three daily challenges still roll from the menu you actually own. Tomorrow’s headline and the next research unlock are one line each on the card, which is the “next level is waiting” feeling without a life system. Three stars on the headline remain, and you can remodel and beat them before UTC midnight. None of that replaces the contract track.

## Gameplay that exists because this is Reddit

The share buttons are not the Reddit game. Comments, flair, and subscribe stay optional and never gate a service. Upvotes and karma never change the sim. A mechanic that pays people for votes is vote manipulation, which the Devvit Rules forbid. Free-typed comments never become guest dialogue. Deleted posts and comments drop any id we stored, through the delete triggers.

What the platform does give us is a shared post, a message channel on that post, Redis for this subreddit, and the right to read and write that community’s thread.

**Diners who are actually here.** `permissions.realtime` opens a channel on the post. Someone with today’s post open announces themselves: user id, display name, house style. Every open restaurant on that post can spawn one extra guest from that announcement, capped at three so the floor stays readable. The guest orders the visitor’s house dish if it is on the menu, pays, and thinks “Came over from the thread.” If the dish is absent they think “Nothing here for me” and leave as a soft miss. When the visitor closes the post, the channel drops them and the guest finishes or walks out. The name lives in the channel message, not in a permanent profile. This is a person in your restaurant because you are both on the same Reddit post. It is not a second copy of your save.

**A night in someone else’s kitchen.** Lock-in can include “Leave the door open,” off unless they turn it on. That writes a public snapshot to the `open-doors` hash: layout, menu, house style, name, award. Another player picks a door from the neighborhood list and plays one service in that snapshot. They cannot move the furniture or take the cash home. When they finish, the host’s bulletin gets a canned note: the visitor’s name, a thought from the kitchen card (“Long wait”, “Lovely lanterns”), and the tip total. The host deletes the door whenever they want. `onCommentDelete` is unrelated. Closing the door deletes the snapshot. This is the Roblox “walk into their plot,” built as a visit you choose, which is how a Reddit thread actually works.

**The thread is the street.** The daily post’s flair is today’s headline, set by the cron that creates the post, so the feed shows the night before you tap. The bulletin already in the city reads three lines from Redis: today’s headline, the latest visitor note, and one open kitchen. Mods can set the neighborhood name in the app’s subreddit settings. That name is on the sign and the bulletin. The community is naming the place the game is about.

**The comment is a review of a specific room.** The canned comment stays a button on the receipt: house style, award, rating, streak. It is how a kitchen shows up in the thread people are already reading. It does not spawn guests. Presence and open doors do that, so a busy comment section is not a way to stuff the dining room.

## Screens

The webview height is `tall`. The 3D view is always the background.

### Opening

No essay. The scene is already your restaurant.

A short top bar: restaurant name, UTC date, headline title, cash, streak. One line of blurb under the headline (“Rain. Lanterns earn their keep today.”). Primary button **Open for service** when the doors are closed. If this date is already locked, the same button still opens; the card will say whether the new receipt beat the lock.

The first session starts on the starter park with the doors closed and the Build tab already showing the planter, because Monday’s hint is “atmosphere changes tips,” said once, in the blurb, not in a modal.

### Doors closed

The dock is up: Build, Team, Menu, Ledger. This is the tycoon. Panels use the pixel frame. One contextual line, tied to a real blocker from `readiness()` or the headline:

- No grill and the burger is enabled: “Burgers need a grill.”
- Inspection tomorrow, dirty seats in the last report: “Sunday counts dirty seats.”
- Cash under the opening reserve: the existing capital warning, one line, with **Close for renovation** still available during service.

### Doors open

The dock collapses to pause, speed, cash, and the service clock. Challenges sit as three thin pips, not a panel. Guest thoughts float on the guest. Comp and priority live on the guest you tap, not in a toolbar of six verbs.

Camera zoom and rotate stay. The neighborhood camera stays, and it is a view of the city you already have, not a second game. It is available with the doors closed so it does not cover the floor during service.

### The day’s card

One card when `finish()` runs. It is the receipt: sales, tips, ingredients, wages, rent, profit, guests, rating, challenges. Stars, the kitchen card (Welcome, Speed, Value), the one award banner, and the near-miss line sit at the top. Under that: the contract progress, tomorrow’s headline, and the neighborhood banner count. Ledger remains a tab you open yourself; the card does not dump you into it. The best company value lives on the ledger, next to the weekly chart.

Separate buttons under the card, each optional, none of them required to open tomorrow:

1. **Lock this day** (hidden once this receipt is the stored one).
2. **Post this result** — confirm step shows the exact comment. An optional note, up to 80 characters, can sit under the canned lines. The preview shows both before anything is sent. A note makes it a top-level comment. The canned score alone replies to the sticky. The note is not saved in Redis and is not read back as a guest thought.
3. **Wear this flair**.
4. **Follow this kitchen** — subscribe, visually quieter.

**Continue** closes the card and leaves you in the restaurant with the doors shut, ready to remodel. There is no second end screen.

Keyboard: the dock is buttons, guest actions are on the selected guest, Escape closes a panel. Targets stay at least 44px. `prefers-reduced-motion` keeps the existing scene behavior (no bounce, no rain streaks). The pixel blit stays at the same scale.

## Devvit architecture

Web layout, not the legacy blocks API. The server bundle is **CommonJS**. The client stays ESM. Use **Node 22** for the Devvit CLI. Keep Vitest on the sim.

```text
devvit.json
src/server/index.ts          # Express, bundled to dist/server/index.cjs
src/client/                  # Vite root. Current React app, retargeted.
src/management/              # pure sim. imported by client and by server
src/scene/                   # 3D scene, still mounted
tools/pixel/                 # Codixel authoring. excluded from the upload
public/                      # vite outDir: index.html, pixel sheets, models, audio
```

`devvit.json` (shape):

```json
{
  "$schema": "https://developers.reddit.com/schema/config-file.v1.json",
  "name": "too-many-cooks",
  "post": {
    "dir": "public",
    "entrypoints": { "default": { "entry": "index.html", "height": "tall" } }
  },
  "server": { "dir": "dist/server", "entry": "index.cjs" },
  "permissions": {
    "redis": true,
    "realtime": true,
    "journeys": true,
    "reddit": {
      "enable": true,
      "asUser": ["SUBMIT_COMMENT", "SUBSCRIBE_TO_SUBREDDIT"]
    }
  },
  "menu": {
    "items": [{
      "label": "Post today's service",
      "forUserType": "moderator",
      "location": "subreddit",
      "endpoint": "/internal/menu/post-today"
    }]
  },
  "scheduler": {
    "tasks": {
      "roll-day": {
        "endpoint": "/internal/scheduler/roll-day",
        "cron": "5 0 * * *"
      }
    }
  },
  "triggers": {
    "onCommentDelete": "/internal/triggers/comment-delete",
    "onPostDelete": "/internal/triggers/post-delete"
  },
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build && node scripts/build-server.mjs"
  },
  "dev": { "subreddit": "too-many-cooks-dev" }
}
```

`cron` is UTC. 00:05 leaves a few minutes after midnight. The moderator menu runs the same function if the cron is missed. Both are idempotent.

Do **not** enable `payments` or `http`. Realtime is on, for the diner channel only. Do not call an LLM. In-game dollars stay in the sim. There is no cash-out and no wager.

### Server routes

Public routes start with `/api/`. Menu, cron, and trigger routes start with `/internal/`.

| Route | Behavior |
|---|---|
| `GET /api/today` | Headline for the UTC date, this player’s park if any, locked receipt, streak, neighborhood star count. |
| `POST /api/open` | Validate the park, mix the headline seed, store the opening snapshot, return the snapshot id. |
| `POST /api/lock` | Replay from that snapshot and the action log. Store the receipt if it beats today’s lock. Header `x-devvit-journey-id`. |
| `POST /api/save` | Store the park when the doors are closed or the tab hides. Not a score. |
| `POST /api/comment` | Canned comment from the stored receipt, as the user, replying to the sticky. |
| `POST /api/flair` | Flair from the streak tier. |
| `POST /api/subscribe` | Subscribe as the user. |
| `POST /internal/scheduler/roll-day` | Create today’s post if it does not exist. |
| `POST /internal/menu/post-today` | Same function. |
| `POST /internal/triggers/comment-delete` | Drop the comment id. |
| `POST /internal/triggers/post-delete` | Drop the post id and sticky id. |

Identity comes from `context` and `reddit.getCurrentUser()` on the server. A user id in the body is ignored.

### Redis

Redis is per subreddit, and there is no key scan. Collections use stable hashes. Personal fields refresh a 30-day TTL on write, so a park that goes quiet expires, and an active owner keeps their restaurant. That matches the platform’s deletion guidance.

| Key | Type | Field / member | TTL | Contents |
|---|---|---|---|---|
| `posts` | hash | `YYYY-MM-DD` | none | `{ postId, stickyId }` |
| `parks` | hash | t2 user id | 30 days, refreshed on save | Latest `RestaurantState` |
| `opens:{date}` | hash | t2 user id | 30 days | Opening snapshot for the replay |
| `runs:{date}` | hash | t2 user id | 30 days | Official receipt, action log, `submittedAt`, `commentId` |
| `lb:{date}` | zset | t2 user id | 45 days | `stars * 1_000_000 + rating * 1000` |
| `profiles` | hash | t2 user id | 30 days, refreshed on play | `{ username, streak, lastDate }` |
| `community:{date}` | hash | `locked`, `par` | 45 days | Counts only |

Top five: `zRange` with scores, load those profiles, show username, stars, rating. Rank is stars, then rating, then earlier `submittedAt`. Profit is on the receipt and in the size-matched median, not in this set, so a veteran kitchen does not own the board by having more tables.

`comments` hash maps `commentId → userId:date` so `onCommentDelete` can find the field without a scan. Comment text is not stored. The server rebuilds it from the receipt.

Account deletion: `hDel` that t2 from `parks`, `profiles`, and each `runs:{date}` / `opens:{date}` still inside the window. A zset `recent-dates` lists those dates. Until the current account-deletion trigger is confirmed in the docs during implementation, the 30-day TTL is the backstop. Do not copy the park anywhere else.

### The daily post

`rollDay(date)`:

1. If `posts[date]` already has a `postId`, stop.
2. `reddit.submitCustomPost` as the **app** account. Title: `Today on the roof · Nov 18`. Entry `default`.
3. `reddit.submitComment` as the app: `Results for today go under this comment.` Save it as `stickyId`.
4. Write `posts[date]`.

An older post’s webview still calls `GET /api/today`, so it rolls to the new headline at midnight. The new post is the fresh thread.

### Comment, flair, subscribe

Canned comment, from the stored receipt:

```text
Little Rooftop · Garden · Warmest room · rating 4.1 · 5-day streak
```

`runAs: 'USER'`, as a reply to `stickyId`. The confirm step shows that line and “This posts as you, under today’s results comment.” No free-written comment in v1.

Flair, only from `POST /api/flair`, tomato background `#DC533C`, light text:

| Streak | Text |
|---|---|
| 1 | Opened the doors |
| 3 | Regular |
| 7 | House favorite |
| 14 | Golden hour |
| 30 | Rooftop regular |

No Snoo, no Reddit wordmark. Snoovatar images live on a CDN the webview cannot fetch without an `http` permission. They stay out of this build.

Subscribe is its own button. Skipping it still shows the full receipt.

Until the app is approved, `runAs: 'USER'` runs as the app account except for the app owner. The demo should use the owner account, and the submission notes should say attribution switches after approval. We are not requesting that approval during the hackathon.

### Journeys

`journeys: true`, and `createTelemetryRouter()` on the Express app. Client: `telemetry` from `@devvit/analytics/client/reddit`.

| Event | When | Payload |
|---|---|---|
| App ready | The 3D scene has drawn a frame and `/api/today` has resolved | — |
| Start | Pointer-up on **Open for service** | — |
| Progress 0.3 | First guest is seated | `action: 'first_guest'` |
| Progress 0.6 | Halfway through `DAY_LENGTH` | `action: 'mid_service'` |
| Progress 0.9 | `finish()` starts | `action: 'receipt'` |
| Interaction | Pointer-up on comp, priority, a purchase, a hire, or a price change, after the engine accepts it | `action` names the verb. Details: `{ mode: 'official' \| 'later' }` |
| End, client | They leave during service and the save fails | `complete: false` |
| End, server | `/api/lock` accepts the replay | `complete: true`, `game.win` = 1★ or better, `game.score` = the packed stars. Header `x-devvit-journey-id` |

Start is never fired from the loader. Interactions fire after the engine accepts the action. The server writes the official end so the analytic score is the replayed one. The client does not end that same journey again after a successful lock.

No usernames and no free text in the payloads. Playtest events are dropped until the journey is allowlisted. The streak still comes from the replay, so a dropped event cannot grant one.

## Rules we build around

- Original name and animals. No Snoo, no Reddit logo, no “Reddit” in the title.
- No link to a web build or another store.
- No payments, no external accounts, no fetch to other domains, no LLM.
- Comments, flair, and subscribe are separate explicit buttons. None of them gate the next service.
- Do not store comment bodies. Delete ids on the delete triggers.
- The restaurant name is the only free text. Allowlist letters, numbers, spaces, and apostrophes, 28 characters, matching the current schema. It is not posted. The comment is the canned receipt.
- README before any later publish: what the daily headline is, how a mod posts today’s thread, how the park is saved. Not required to enter the hackathon.
- The tone stays food, weather, and animals.

## Build order

About three weeks. Each phase ends playable on the private subreddit with `devvit playtest`.

### Phase 1 — The park runs on Reddit

1. Add `devvit.json`, the Express server, Vite `outDir` pointed at `public/`, server bundled to CJS.
2. Add `createDailyHeadline` and the multipliers inside `startService(headline)` without forking a second engine. Existing tests keep calling `createRestaurant()`.
3. `POST /api/open`, `POST /api/save`, `POST /api/lock`, with the replay built from the opening snapshot.
4. Tests: the same snapshot and an empty action log always finish with the same receipt; a edited cash total is rejected; `cozyBot`, `bareBot`, and `greedyBot` hit the gates on 21 dates.
5. The current 3D scene is what loads in the post. Wire journeys. Collapse the dock during service. One receipt card with Lock.
6. `devvit playtest`. Confirm a second browser gets the same headline and a different queue if the layout differs, and that a reload restores the park from Redis.

### Phase 2 — Pixel feel, thoughts, and the first contract past the four goals

1. The low-res nearest blit and the Codixel palette, including the 2D-canvas copy for the Android webview. Preview the palette on a still of the real scene before wiring it.
2. Pixel frames and Silkscreen on the dock and the receipt.
3. Guest thoughts, driven by the existing refusal, walkout, and tip code.
4. The kitchen card and one award banner on the receipt. Company value and its personal best on the ledger.
5. Contracts 5 and 6 (pay the roof, three good nights) added after the existing four goals. Research budget unlocked with them. Soup turns on only after the pot is placed. Bills show on the table during service. Comfort shortens the next-guest gap, with the cap above. The starter staff list is a chef until the player hires the first server.
6. The pass: a ticket with no free chef opens `KitchenEngine` for that dish and writes the result back into the tycoon guest. Planning music, service music, and the rain layer are on the speaker toggle.
7. Browser checks at 390 and 1280: dock, service bar, receipt, one cooked dish at the pass, 44px targets, reduced motion, and a frame that is the 3D scene seen through the pixel blit rather than a black canvas.

### Phase 3 — The neighborhood and the living city

1. Cron and the mod menu create the post and the sticky comment.
2. Streak, flair, comment, subscribe, tomorrow’s headline, and the banner count (“8 warm rooms tonight”) on the card.
3. Weather weights on days the headline does not already force, so sun and rain change patience, tips, or dish choice. The rain layer follows that weather.
4. Named regulars, capped at four, after the third service.
5. Realtime diners from people who have the post open, capped at three. Open-door snapshots and a one-night visit that leaves a canned note on the host’s bulletin. A host can also invite one or two people on the post into the service they are running: the host’s engine stays authoritative, a slim snapshot goes out on the channel a few times a second, and the joiners send cook results, priority, and comp. If the host leaves, the service pauses. Post flair set to today’s headline. Neighborhood name from subreddit settings.
6. Deletion triggers, including removing an open-door snapshot the owner closes.
7. Freeze headlines, contract numbers, and prices on 6 Dec. 7 Dec is playtest only: a full day, a dish cooked at the pass, a visit to an open door, a remodel, a second service, a comment, a phone-sized embed. 8 Dec is the demo post and the Devpost submission.

Staff cloth and the window bench can follow the demo if the pass, the music, and the visits are already in. They are more of the same catalog, not a different game.

### If a phase slips

Ship the 3D park with the pixel blit, Redis save, one headline, the replayed lock, the pass, the three music beds, thoughts, and the receipt with an award. A neighborhood thread can be a moderator post created by hand. Open-door visits can be the last Reddit piece added, and they are still part of this build rather than a sequel.

Cut in this order: staff cloth, window bench, regulars, research soup, banner count. Do not cut the persistent park, the headline, the 3D scene, the pixel blit, the pass, the three music beds, open-door visits, the receipt, or journeys.

## What stays out, what comes back in, and publish

### We do not publish during the hackathon

`devvit publish` sends the app to App Review. The hackathon asked teams not to do that, and the demo post does not need it. These features still work on a private upload and on `devvit playtest`:

| Feature | Without review |
|---|---|
| Redis, scheduler, menu, triggers, realtime | Work. |
| Post flair, app-account comments, the daily post | Work. The cron posts as the app. |
| Journeys | Calls ship in the client. Playtest events are dropped until Reddit allowlists the map. Streaks and scores come from the Redis replay, so a dropped event changes nothing the player sees. |
| Comment, flair, and subscribe as the player | On an unapproved app, `runAs: 'USER'` runs as the app account, except when the app owner does it. The demo uses the owner account. The build log records that, so we are not blocked on review. |
| Payments, external HTTP, Snoovatar images | Need review, and we are not using them. See below. |

If a later feature only works after publish, we write the blocker in `docs/build-log.md` and pick a playtest path the same day. We do not publish to get around it during the hackathon.

### Included, in a form that fits

**One open service can finish while you are away.** Described above. Many silent days of idle profit stay out, because that spends headlines you did not play.

**A short note on the review.** The optional 80-character line is the free-written part. It is shown before it posts, it is sent as the player, and it never enters the simulation. Anything longer belongs in Reddit’s own comment box, which we do not have to build.

**A second room on the same books.** The east terrace is already that: more floor, same cash, same staff, same company value. Later rooms follow the same rule. Scenarios never delete the first floor to start a new park. The existing reset stays a separate confirm, for someone who wants a new game, and it is not how the next contract starts.

**One shared service, hosted by a player.** Two or three people on the daily post can work the same open kitchen. The host runs `RestaurantEngine`. Joiners receive a small position snapshot over the realtime channel and send back a cook result, a priority, or a comp. There is no second clock. The whole subreddit does not share one physics world. That version stays out: Devvit has no process that can hold every restaurant at once, and a 30-second request cannot be that clock.

### Still out

**Devvit Payments.** Real money needs App Review and the Earn policy, and a paid gate on a night would fail both the hackathon and the payment rules. The economy is the in-game dollar. Nothing in the design needs a charge.

**A scripted guest list, a 75-second mode, or a renderer that replaces `RestaurantScene`.** These contradict the game you signed off on: a full service, unpredictable arrivals, and the 3D room. They are not a technical limit.

**Flat sprites in place of the animal rigs.** The pixel look is a presentation of those rigs. Swapping them for billboards is the 2D scene we already dropped.

**Upvotes, karma, or a comment required to play.** The Devvit Rules forbid vote manipulation, and they forbid gating a service on commenting or subscribing. There is no workaround that keeps the mechanic and the rules.

## Documentation

Every decision and every feature gets an entry in `docs/build-log.md` before the work is called done. That includes why a Devvit or third-party capability was turned on, and why an alternative was refused. The standing rules are `.cursor/rules/build-log.mdc` for Cursor and `.claude/rules/build-log.md` for Claude. Both say the same thing.

## Done when

A judge can open the demo post and, without us in the room:

- See their restaurant, today’s headline, and the date, and open the doors without a tutorial wall.
- Watch the same 3D animals and paths, reading as pixels, run a service they did not script, with at least one guest thought that explains a surprise.
- Build or reprice with the doors closed, and see Welcome, Speed, or Value move on the next receipt.
- Read one card: stars, an award, the contract, the near miss, tomorrow’s headline.
- Lock the day, reload, and find the same park, including the contract they are on.
- Optionally comment, wear flair, or subscribe, each as its own choice.
- Come back the next UTC day to a new headline on the same restaurant, with the next contract still waiting.

And the repo can show:

- A replay from an opening snapshot matches the client receipt.
- The three bots hit the gates.
- Journey calls match the map above.
- The client requests no external URL.
- The palette and the UI frames in `public/pixel/` are the ones accepted from a Codixel preview, and the scene under them is still `RestaurantScene`.
