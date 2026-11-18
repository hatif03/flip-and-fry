# Flip and Fry

A rooftop restaurant tycoon that lives inside a Reddit post. Every day brings a new neighborhood headline. You build the room, hire the crew, set the menu, open the doors for one night, and Reddit's server replays your service to lock in the result. Built for Reddit's **Game of the Day** hackathon on Devvit Web.

> **This is a port of a game we already owned.** The browser version (a React Three Fiber restaurant tycoon called *Too Many Cooks*, tagged `pre-devvit` in this repository) was reworked for Reddit. See [What changed in the port](#what-changed-in-the-port).

## How to play

1. Open today's post. The headline (for example *Rain on the roof*) and a goal for the night are at the top.
2. **Build:** place tables, planters, lanterns and kitchen equipment. **Team:** hire and train. **Menu:** switch dishes on and set prices.
3. Tap **Open restaurant**. Your team cooks, serves and cleans. When a ticket is waiting, tap **Cook** at the pass and plate it in the green zone.
4. When the night ends the server replays it and gives you up to three stars: the headline goal, two of three daily challenges, and beating your last night.
5. Come back tomorrow. A new headline arrives, your streak grows, and the neighbors have been busy.

Between nights you can step into the **Test Kitchen** and cook by hand (three shifts, solo or two chefs).

## The daily headline

The weekday picks the headline. The date only jitters the numbers inside it.

| Day | Headline | What it changes |
|---|---|---|
| Mon | A quiet neighborhood | More patient guests, a wider arrival gap |
| Tue | The boulevard is busy | Guests arrive faster |
| Wed | Rain on the roof | Slower walking, comfort counts more for tips |
| Thu | The butcher raised prices | Grill ingredients cost 50% more |
| Fri | A critic is in the neighborhood | More star guests; one walkout caps the night at 2 stars |
| Sat | Payday | Guests are less put off by a high price |
| Sun | The inspector comes at closing | Dirty seats at closing hurt the rating |

## What is on Reddit

- **One official service a day.** The server opens your night from your saved restaurant and replays it with the same deterministic engine the game runs on. Only the server's receipt counts, so stars cannot be faked from a browser.
- **Your restaurant is saved on Reddit** (Redis), per player, so it follows you across devices and survives app updates. The Test Kitchen's scores and outfits are saved the same way.
- **A streak** of days with at least one star, and flair that goes with it (tiers at 1, 3, 7, 14 and 30 days). Flair is a reward for a real streak, never for a comment or a vote.
- **Post this result**, **Wear flair** and **Follow this community** are three separate, optional buttons. Each shows exactly what it will do first ("This posts as you"), runs only when you tap it, and nothing in the game waits for any of them.
- **The neighborhood:** neighbors who have the post open come over as guests while you serve; you can leave your door open for visits, visit one of four sample kitchens (always labelled as samples), read a bulletin of notes from visitors, and post your kitchen as its own post.
- **The thread is the street:** each day's post is highlighted and carries a stickied results comment; the app comments a short report on the day that just ended.
- **Journeys** instrument the whole loop; the final event is written by the server from the replayed result.

## For moderators

- **Post today's service** (subreddit menu) creates the day's post. It is also created automatically by the first player request of each UTC day and by a scheduled job, and the three cannot create it twice.
- **Highlight today's post** (subreddit menu) pins it in community highlights. The app needs moderator permission for this and for setting user flair.
- **Settings:** *Neighborhood name* (shown on the daily bar; letters, numbers, spaces and apostrophes, up to 24 characters) and *Allow open doors* (on by default).
- Posts and comments made on a player's behalf run as the **app account** until the app is approved, except for the app's owner. The demo is shown with the owner's account.

## Controls

| | Keyboard | Touch |
|---|---|---|
| The restaurant | Click and tap everywhere. `R` rotates a piece being placed, arrow keys nudge it, `Esc` cancels, `Space` pauses service | Tap. Every control is at least 44 px |
| The pass | Tap **Cook**, then **Plate it** | The same |
| Test Kitchen, one chef | `WASD` move, `E` pick up and put down, `F` hold to work, `Space` dash | A stick plus **Work**, **Pick** and **Dash** buttons |
| Test Kitchen, two chefs | Chef 2: arrows, `K`, `L`, `J` | Needs two keyboards |

## Accessibility

Every control has a visible label and an accessible name. Meters and thoughts are spoken as text, so colour is never the only signal. Reduced-motion preferences are respected. Touch targets are at least 44 px, and the layout works from 360 px wide.

## What changed in the port

- The Redis-backed **park**: your restaurant, saved by the server and changed only through validated actions.
- The deterministic **action log and replay**: the server is the only source of a score.
- The **daily headline**, shared **daily challenges**, stars and the streak.
- **Twelve dishes in three menu styles**, five appliances, contracts, regulars, research and guest thoughts.
- **The owner at the pass**: cook a ticket by hand during service, with the quality worked out by the engine from simulated time (a client cannot claim a perfect plate).
- The **pixel presentation** of the existing 3D scene (palette-snapped, with an automatic pixel size so it stays readable on a phone).
- The **Test Kitchen** (the original hands-on arcade) mounted with touch controls and server-side saves.
- Every Reddit feature above.

The decisions behind each of these, including the ones we refused, are in [`docs/build-log.md`](docs/build-log.md).

## How it works

- `src/management/` is the game: a fixed 0.1 second step with a seeded random source, whose only inputs are the saved state and an action log. `runService(state, actions, headline)` is a pure function and returns the receipt. Its hash is identical in Chromium, Firefox and WebKit (`npm run test:engines`).
- `src/server/` is a Hono app on Devvit Web. `core/` holds the rules behind a small `Store` interface, so they run unchanged in tests against an in-memory Redis.
- `src/client/` is the Reddit entry: a static splash (no 3D) that opens the expanded game on tap.
- Calibration bots (a bare, a cozy and a greedy menu) run the engine in tests over many dates, so a change that breaks the daily goals fails the build.

## Develop

Node 24 and npm. Install with `npm install`.

```bash
npm run lint
npm test                # unit tests, then the browser tests (Playwright, Chromium)
npm run test:engines    # the same receipt in Chromium, Firefox and WebKit
npm run build:devvit    # build the client and server for Devvit
npx devvit playtest     # run on your own test subreddit
npx devvit upload       # upload a new version
```

`devvit.json` is the app's configuration. The game never makes outside network requests (`permissions.http.enable` is `false`). Do not run `build:devvit` while `devvit playtest` is running on Windows.

## Playing outside Reddit

`npm run dev` runs the original browser game, with its progress saved in the browser and no headline, stars or neighborhood.

## Credits

- Fonts: [Fredoka](https://fonts.google.com/specimen/Fredoka), [Nunito](https://fonts.google.com/specimen/Nunito) and [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) (SIL Open Font License), through `@fontsource`.
- Icons: [Lucide](https://lucide.dev) (ISC).
- Characters, furniture, the city, weather and lighting are procedural and authored in this repository.
- Some 3D props and the audio in `public/assets/` were AI-generated by the original project's author. See [`docs/assets-provenance.md`](docs/assets-provenance.md) for what is known about each file.

## License

No license has been chosen yet. Fonts and icons keep their own licenses.
