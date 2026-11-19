# Design and engineering decisions

Each decision, why it was made, and what was refused. Grouped by theme. The dated, chronological version, with the evidence, is [`build-log.md`](build-log.md).

## The game

**A tycoon on one restaurant, not a leaderboard.** The daily is a *headline on your own park*, not a scripted guest list. A headline changes weights on the formulas the game already had (patience, arrival gap, walking speed, ingredient cost, price tolerance, dirt penalty), so every night is the same game with different pressure. Refused: a fixed guest list, a 75-second mode and a replacement for the 3D room, which would have undone what makes it a tycoon.

**Your park is never replaced when you miss a star.** A missed star never resets anything. Refused: a profit ladder (a day-10 kitchen would own it) and idle income across days (it would spend the daily headline without the player).

**One official night a day, and it locks by itself.** A Lock button adds an end-screen decision the Overview asks us to avoid. The first closed night of a UTC day counts; a later one replaces it only with more stars, or equal stars and higher profit. Practice nights still save.

**Stars read the receipt.** 1★ is the headline's goal; 2★ also needs two of three daily challenges; 3★ also beats your previous night (or a stretch figure on a first night). The goals were *calibrated with bots*, not guessed (see Engineering).

**The player's job during service is the pass.** The first phone test found that "everything is happening automatically" was the biggest problem. Now, when a ticket is waiting, the owner can cook it: tap Cook, optionally hold Prep and release when the bar is green, then plate in the green zone. A perfect plate tips 15% more. Rush a ticket to the front and comp two tables a night. **Refused:** letting the browser report how well it cooked. The quality is computed by the engine from simulated time and tick-stamped holds, so the server's replay is the whole truth. The hands-on 3D kitchen exists as the Test Kitchen instead.

**Depth from the simulation, not from menus.** Twelve dishes in three styles (Garden, Grill, Noodle) from one data table; five appliances; five contracts that teach the systems; named regulars with a fixed arrival slot; a research budget that opens the next appliance; guest thoughts over the tables. Everything draws on state the engine already computed. **Refused:** five hundred dishes (a phone menu cannot be priced at that size), a style chosen at the start with a different starter kitchen (it would invalidate every calibrated number for a day-one choice the shop already offers), a chef-only starter park (same reason), bills that travel to the register (no decision changes).

**The end of the night is one card.** Stars, one award, a kitchen card (Welcome, Speed, Value), company value, a tomorrow line. Posting, flair and follow are three separate, optional buttons. **Refused:** several end screens, and anything required to open tomorrow.

**The Test Kitchen is the original arcade, kept whole.** It is unranked and not replayed on the server, so it feeds the restaurant only through a small, bounded research bonus (5 per new star, at most 10 a day), and a result can be posted through the same confirm step.

## The look and sound

**Pixel art on the real 3D scene, not a flat replacement.** Replacing the scene with a 2D canvas, then with billboard animals, were both refused; the scene renders small and is drawn back up with nearest filtering through a per-weather palette. The first phone check showed it was too pixelated to read, so the pixel size is automatic by screen width and the palettes were reduced to 24 clustered colours from real captures.

**The interface follows.** Square corners, hard edges and a pixel typeface for headings and numbers (Pixelify Sans, with the digit 5 from Fredoka because the pixel font's 5 reads as an S). Body text stays Nunito for readability. Silkscreen was tried and dropped for width.

**Art is drawn in code.** The icon and the animal portraits are placed pixel by pixel by small scripts and functions, so there are no files whose origin needs explaining and the pictures stay in the palette. A mechanical reduction of a photo-like icon was replaced.

**The soundtrack is generated.** A four-bar loop in F made while it plays, with a rain layer that pushes it back; no audio file, nothing to license, and it follows the weather. It starts only after the first tap and goes silent when hidden or paused.

## Reddit

**Reddit is the setting, not a theme.** The thread is the street: a headline each day, a stickied results comment, a nightly report, neighbors who have the post open come over as guests, kitchens you can leave open and visit, a bulletin of notes. **Refused:** upvotes or comment counts as inputs (vote manipulation, and a required comment is against the user-action rules), usernames on the realtime channel beyond the visit note, and on-the-nose Reddit theming.

**Every action on the player's behalf is its own button.** It shows exactly what it will do first ("This posts as you"), runs only after a tap, and nothing waits for it. Comment, flair, follow, post-my-kitchen, reminders and door are all separate.

**One result comment, built on the server.** A canned line from the stored receipt, with an optional 80-character note held to an allowlist (no links or mentions). The Test Kitchen's line is built from its *saved best*, never from a number the browser sends.

**Sample kitchens are always labelled samples.** The neighborhood has designed empty states; four kitchens ship in code so a visit is always possible, and they are never presented as players.

**A visit is a server replay, not a second client mode.** The visitor is a guest in a copy of the host's kitchen; the host's cash, stars and streak are untouched. A client "visiting mode" would have displaced the player's own restaurant on screen.

## Engineering

**Deterministic engine plus an action log.** The server replays it for the lock, visits and bots; clients run it in lockstep for hosted service. Only the server's receipt counts. The risk (different JavaScript engines disagreeing) was the first thing tested and holds.

**The server owns the park.** Planning actions are applied on the server through the engine's own methods, so a client cannot post its own cash or staff. Identity comes from the Devvit context. Writes use a revision and `WATCH/MULTI/EXEC`.

**Rules behind a `Store` interface.** Nothing in `src/server/core` imports Devvit. Everything is tested against an in-memory Redis that enforces the platform's limits.

**Lazy over scheduled.** Reddit's cron timezone is undocumented, so every job has a twin that the first player request of the day runs (the daily post, the nightly report). A claim in Redis makes them safe to race.

**Fail soft.** Anything that depends on a Reddit capability we could not prove from here (flair rights, media upload, push notifications, avatars, realtime) is built so a refusal changes nothing the player needs.

**Calibrate with bots, then lock the numbers in tests.** The first calibration showed the starter economy did not discriminate (a bold-price bot beat fair-price bots on every headline). Fixes: a steeper price walk-away slope, a discount demand lift, atmosphere shortening the arrival gap, and a second *server* as the good first hire. Now a cozy bot earns 1★ on at least 18 of 21 dates and every judging day, a bare bot clears only the easy headlines and a greedy bot wins only on payday.

**Dishes are data.** One table drives the schemas, the menu, the orders, the challenges and the shop copy, so a new dish is a line of data.

**Hosted service sends inputs, not results.** Stamped actions 1.5 s ahead, a state checksum every 5 seconds, and a clean restart from a snapshot on drift. The server relays and validates and simulates nothing.

**Performance by measurement.** The splash is 17 KB and needs no server call; the game's first JavaScript is about 470 KB gzipped, the Test Kitchen and scene are lazy chunks, fonts are Latin subsets, models went from 4.3 MB to 0.7 MB and audio from 0.8 MB to 0.35 MB. `npm run perf:check` fails the build if a budget is broken. Quality tiers protect low-end phones.

## Process

**A build log in the same change as the work.** Every decision, refusal and platform workaround has an entry (`docs/build-log.md`, enforced by `.claude/rules/build-log.md` and the Cursor rule).

**Verify what you can, say what you cannot.** Each feature is tested against fakes of the Reddit call; what only a phone or an approved app can show is listed, not assumed ([`devvit-and-reddit.md`](devvit-and-reddit.md)).
