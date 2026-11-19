# Submission package

Copy-ready text for the Devpost form, a shot list for the demo video, and the checklist of things only the author can do. Deadline: Tuesday 8 December 2026, 6:00 pm PT (02:00 UTC on the 9th). Judging runs 9 to 16 December, so the app must keep working the whole week.

## Devpost description (paste as is)

**Flip and Fry** is a rooftop restaurant tycoon that lives inside a Reddit post. Every day brings a new neighborhood headline (a rainy night, a critic in town, payday). You build the room, hire a crew of animals, set the menu, and open the doors for one night. Reddit's server replays your service with the same deterministic engine the game runs on and locks the result, so the stars you earn are real.

**How it plays.** Open today's post and tap *Open for service*. Build tables, planters and kitchen equipment, hire and train, set your prices (a fair price, a bargain or greedy: guests notice). When the night runs, step in at the pass and cook a ticket yourself when your chefs are busy: hold Prep until the bar is green, then plate it in the green zone for a perfect dish and a better tip. At closing you get up to three stars for the headline goal, the daily challenges and beating your last night, plus a kitchen card (Welcome, Speed, Value) and one award. Come back tomorrow: a new headline, a growing streak, and a neighborhood that has been busy without you.

**What makes it a Reddit game.**
- One official, server-verified service a day, shared headline and shared goals, and a streak with flair.
- Neighbors who have the post open come over as guests while you serve. Leave your door open and neighbors can visit your kitchen; four sample kitchens are always there to visit. A bulletin collects their notes, and a live toast tells you when someone stops by.
- You can post your kitchen as its own post, post your result as a comment, wear streak flair and follow the community. Each is its own button, shows exactly what it will do first, and nothing in the game waits for any of them.
- Moderators name the neighborhood and switch open doors on or off in the subreddit settings; each day's post is highlighted, stickied with a results comment, and followed by a short report on the night before.
- A neighbor can help at your pass for a night (two devices in lockstep over realtime, replayed by the server), and an opt-in reminder protects a streak.
- Journeys instrument the whole loop, and the final event is written by the server from the replayed result.

**Also in the game.** Twelve dishes in three menu styles, five appliances, contracts, named regulars, a research budget that unlocks new equipment, guest thoughts over the tables, a pixel-art presentation of the 3D city, a generated soundtrack that follows the weather, and the Test Kitchen: the original hands-on arcade (three shifts, solo or two chefs, touch controls), with its scores saved on Reddit.

### Port statement (required for Best Ported Daily Game)

Flip and Fry is a **port of a game we already owned**: a browser restaurant tycoon, *Too Many Cooks*, built in React Three Fiber (tagged `pre-devvit` in the repository). For Reddit we significantly updated it:
1. The restaurant is saved on Reddit (Redis) and changed only through validated actions.
2. The simulation became a deterministic action-log replay, and the server's replay is the only source of a score.
3. A daily headline, shared daily challenges, stars and a streak.
4. A pixel-art presentation of the existing 3D scene and a pixel interface, designed to stay readable on a phone.
5. The owner at the pass, and the Test Kitchen mounted with touch controls and server-side saves.
6. Twelve dishes, contracts, regulars, research and guest thoughts.
7. Every Reddit feature listed above.

The decisions behind each, and the ones we refused, are in `docs/build-log.md` in the repository.

## Demo video shot list (under one minute, shot on a phone)

| Seconds | Shot |
|---|---|
| 0 to 5 | The feed: the daily post card with today's headline. Tap *Open for service*. |
| 5 to 15 | The rooftop in pixel style. Build a lantern and a table, set one price. |
| 15 to 30 | Tap *Open restaurant*. A rainy service: guests arrive, a thought bubble ("Long wait"), a neighbor from the thread arrives by name. |
| 30 to 40 | A ticket waits: tap *Cook*, plate it in the green zone. |
| 40 to 50 | The result card: stars, award, kitchen card, a neighbor's note. Tap *Post this result* and show the text first. |
| 50 to 58 | Ledger: leave the door open, the bulletin, a sample kitchen visit. |
| 58 to 60 | Title card: Flip and Fry. |

## Checklist for the author

Done by me: the MIT licence; the demo subreddit already has the Devvit Admin Helper (`dr-admin-approve`) installed next to the app; models and audio compressed; the icon redrawn; every feature built and tested against fakes. What is left needs your account, a real device or an answer only you have.

### Needs you (a few minutes each)
- [ ] **Confirm the demo subreddit** is public with under 200 members (r/flip_and_fry_dev, created by `devvit upload`). Reddit does not let me read it from here.
- [ ] **Moderator rights for the app** on that subreddit (Mod Tools, Moderators, the app account) so it can set user flair and highlight the post. After one daily post, check the post is highlighted and try "Wear flair" once. If either is refused the game still works; note it in `docs/devvit-feedback.md`.
- [x] **Provenance:** answered on 19 November: the props, the music and sound effects and the original icon were made by the author with free, partly AI-assisted tools (recorded in `assets-provenance.md` as the author's statement).
- [ ] **Push notifications:** apply for the beta at the link on the Devvit docs page. Nothing depends on it; the reminder switch says "not available" until Reddit enables it.
- [ ] **Developer survey** before 8 December 6 pm PT (the Feedback prize), using `docs/devvit-feedback.md`.

- [ ] **Developer portal listing** (does not publish): fill Developer Settings and the In-app catalog from [`listing.md`](listing.md), using the images in `docs/listing/`. Push the repository first so the privacy and terms links work.

### Phone checks (each is listed under "Needs a phone to confirm" in the build log)
- [ ] Open the post on your Android phone: the inline card shows today's headline; the game loads; the pixel interface and the soundtrack are pleasant at phone volume and come back after the app returns from the background.
- [ ] **Hosted service needs two Reddit accounts.** Account A (the owner, on your phone): Ledger, switch on "Invite a neighbor to help tonight", then Open. Account B (a second account on a laptop or second phone, in the same subreddit, with the same daily post open): Ledger, Cook together, tap Help. Both should see the same room; B's taps should appear on A within about two seconds. Watch for a "Catching up" notice (it means a message arrived late, and it recovers by itself).
- [ ] Visit a sample kitchen; leave your door open and visit it from the second account; check the toast and the bulletin note.
- [ ] Try "Post my kitchen" (does the picture attach?) and a neighbor's avatar on their tag (does the image load, or does the pixel face stay?).

### Optional
- [ ] Record the under-one-minute video from the shot list above.
- [ ] Look at the pixel interface and the redrawn icon, and say if anything should change.
- [ ] Do not run `devvit publish` during the hackathon.
