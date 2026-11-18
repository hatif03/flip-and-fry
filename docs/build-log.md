# Build log

This is the running record for Too Many Cooks on Devvit. The plan lives in `docs/hackathon-plan.md`. This file says why each choice was made, including the ones made before the first line of the port.

New entries go at the top, under this introduction. Use the format at the bottom. Do not record secrets, access tokens, or private user data.

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
