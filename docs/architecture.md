# Architecture

How Flip and Fry is put together, and why it is shaped this way. For the order things were decided in, read [`build-log.md`](build-log.md); for the short version of each choice, [`design-decisions.md`](design-decisions.md).

## The one idea everything rests on

**The game is a pure function.** `runService(openingState, actionLog, headline) → receipt` in `src/management/replay.ts` takes a saved restaurant, a list of tick-stamped actions and the day's headline, and returns the night's receipt and the final state. It reads no clock and no random source (the seed lives in the state, and the sim uses a small linear-congruential generator), uses only IEEE arithmetic (`Math.sqrt`, never `Math.hypot`, which engines compute differently), and its state hash is a canonical-JSON FNV checksum. The hash comes out identical in Chromium (V8), Firefox (SpiderMonkey) and WebKit (JavaScriptCore); `npm run test:engines` checks 96 fixtures in all three.

That single property is what makes every other feature possible:

| Feature | How it uses the pure function |
|---|---|
| **The daily lock** | The server replays the night from the opening snapshot it stored. Only the server's receipt counts, so stars cannot be faked from a browser. |
| **Calibration bots** | A bare, a cozy and a greedy menu replay the same night over 21 dates and the judging week; tests fail if a balance change breaks the daily goals. |
| **Neighbors from the thread** | They are written into the opening snapshot by the server, so the replay is the same for everyone. |
| **Visits to a kitchen** | The server runs one night on a copy of the host's saved kitchen with the visitor as a guest. |
| **Prep by hand** | Only `hold` and `release` ticks are sent; the engine works out how good the prep was. |
| **Hosted service** | Two devices run the same engine and exchange stamped actions; the host's log is what the server replays at the lock. |

```
                       ┌──────────────────── browser (Reddit webview) ────────────────────┐
  inline feed card ──► │ splash (no 3D, reads postData)  ──tap──►  game (React + R3F)       │
                       │   Session ── queues planning actions, records pass actions        │
                       │   RestaurantEngine (live preview of the night)                    │
                       │   Test Kitchen (lazy chunk, own 3D scene, own save)               │
                       └───────────────┬──────────────────────────────▲───────────────────┘
                              HTTP /api/*                         realtime
                       ┌───────────────▼──────────────────────────────┴───────────────────┐
                       │ Hono server on Devvit Web (serverless, 30 s request limit)       │
                       │   core/*  rules behind a small Store interface (no Devvit imports) │
                       │   routes/*  thin Devvit wiring: context, redis, reddit, realtime   │
                       └───────────────┬──────────────────────────────────────────────────┘
                                 Redis · Reddit API · Scheduler · Realtime · Media · Notifications
```

## Layers

### `src/management/` — the game (shared by client and server)
- `engine.ts`: `RestaurantEngine`, a fixed 0.1 s step. Guests, staff, pathing (`layout.ts`), prices, patience, tips, dirty seats, challenges, regulars, research, the pass (`claimTicket`, `plate`, `holdPrep`, `releasePrep`, `rush`, `comp`) and the hooks hosted service uses (`schedule`, `intercept`, `afterStep`).
- `types.ts`: the zod schemas for the saved restaurant (the single source of truth for what a valid state is), the dish table, catalog, constants and the pure helpers (`cookQuality`, `plateQuality`, `companyValue`, ...).
- `actions.ts`: the action log schema. **Planning actions** have tick 0 (place, sell, hire, train, dish, expand, loan, claim, dismiss, rename, music, research, outfit). **Service actions** carry a tick (claimTicket, cook, abandon, priority, comp, hold, release) and an optional `by` for a helper's hands.
- `replay.ts`: `prepare`, `applyPlanning`, `runService`, `stateHash`, `openError`.
- `daily-headline.ts`, `stars.ts`, `awards.ts`, `bots.ts`, `social.ts`, `coop.ts`: the headline weights, the star rules, the end-of-night read, the calibration bots, the pure text rules for posts, and the lockstep core.
- `*.tsx`: the screens and the 3D room.

### `src/server/` — the rules, and the wiring
- `core/*.ts` hold every rule and talk only to `Store` (`core/store.ts`), a slice of Devvit's Redis client. The real `redis` satisfies it structurally; tests use an in-memory fake that honors per-key expiry, has no key scan, orders bitfield bits like Redis and fails `EXEC` when a watched key changes. So the rules run unchanged in tests and on Devvit.
- `routes/*.ts` are thin Hono handlers. Identity comes from `context.userId`, never from a request body.
- `reddit.ts` is the only place that calls Reddit's posting, flair, media, notification and avatar APIs, behind small interfaces (`PostApi`, `SocialApi`, `KitchenPostApi`, `MediaApi`, `NotifyApi`, `AvatarApi`), so the rest is tested with fakes.

### `src/client/` — the Reddit entry
- `splash.*`: the inline card. No three.js, no server call; it reads the post's own data. Tap-only, no scroll capture (Devvit's inline rules).
- `game.tsx`: boot. Loads today's park from the server, connects the Test Kitchen's save, the presence heartbeat, the live visit toast and hosted service, then imports the game.
- `session.ts`: turns the engine into a client of the server. Batches planning actions (saved with a revision), asks the server to open the night, runs the preview, and asks the server to replay and lock it. If the preview ever disagrees with the server's receipt, the server's park wins.

### `src/scene/` and `src/game/`
The 3D scene helpers, the pixel render pass (`scene/pixel/`), quality tiers (`scene/quality.ts`) and the original hands-on kitchen (`game/`, mounted as the Test Kitchen).

## The life of one night

1. `GET /api/today`: the server loads (or creates) the player's park, the day's headline, today's result and the streak. The first request of a UTC day also creates the day's post if the cron has not.
2. Planning: each accepted change is queued by `Session` and sent in a batch to `POST /api/save` with the park's revision. The server applies it with the engine's own methods, so a browser cannot post its own cash. A stale revision is a conflict and reloads (another tab).
3. **Open**: `POST /api/open` applies the last changes, checks the kitchen can open, stores the **opening snapshot** (with up to three neighbors from the thread written in), bumps the park revision and returns the snapshot and headline. The client adopts it and opens its own preview.
4. Service: the engine runs at 1×/2×/3× (speed only changes how often the client steps; the server replays the same 0.1 s steps). The owner's pass actions are recorded with their ticks.
5. **Lock**: when the preview finishes, `POST /api/lock` sends only the pass actions. The server replays the stored snapshot with the stored headline, stores the **replayed** receipt, computes stars, the kitchen card and award, sets the streak bit for a 1★ result, and returns it. One open, one close: locking deletes the stored open, so a replay cannot be submitted twice.
6. The result card shows the server's receipt. Posting, flair, follow and leaving a door open are separate, optional buttons.

## Data (Redis)

Redis has per-key TTL only, no scan and no per-field expiry, which shapes every key. Anything that must expire is its own key; anything keyed by day expires by itself.

| Key | Holds |
|---|---|
| `park:{uid}` | The player's restaurant and its revision (30 days) |
| `opens:{date}`, `runs:{date}`, `lb:{date}`, `community:{date}` | The day's open services, locked results, board and counters |
| `streak:{uid}:{year}` | One bit per day (bitfield) set only by a server-verified 1★ night |
| `posts`, `comments`, `commented:{date}`, `report:{date}`, `reminded:{date}` | The daily post, stored comment ids, one-a-day claims |
| `presence`, `presence:info` | Who has the post open (sorted set by heartbeat, and their dish) |
| `door:{uid}`, `doors`, `bulletin:{uid}`, `visited:{date}`, `kitchen-posts:{date}` | Open doors, visit notes, daily visit and post limits |
| `arcade:{uid}`, `arcade-pending:{uid}`, `arcade-bonus:{date}` | The Test Kitchen's save and its small research bonus |
| `coop:{id}`, `coop-log:{id}`, `coop-joiner:{id}`, `coop-open` | A hosted service: snapshot, stamped actions, the one helper, the open list |
| `avatar:{name}`, `subscribed:{uid}`, `rate:*` | Cached avatar lookups, a follow flag, rate-limit counters |

Writes that read-modify-write use `WATCH/MULTI/EXEC` through `casUpdate`, with a revision; a lost race is a conflict, never an overwrite. Claims that must happen once (the daily post, a comment, a report) take an `hSetNX` claim **before** calling Reddit and release it if Reddit fails.

## Routes

`/api/*` (client): `today`, `save`, `open`, `lock`, `init`, `comment/preview`, `comment`, `comment/arcade/preview`, `comment/arcade`, `flair`, `subscribe`, `arcade` (get, post), `presence`, `doors`, `door`, `visit`, `kitchen-post`, `avatar`, `reminder` (get, post), `coop/{start,list,join,act,commit,sync,end}`.
`/api/telemetry/journey/*`: the journey events, in Hono (the helper in the platform package assumes Express).
`/internal/*` (platform): `menu/post-today`, `menu/highlight-today`, `scheduler/{roll-day,night-report,streak-reminders}`, `triggers/{on-app-install,comment-delete,post-delete}`, `settings/validate-neighborhood`.

## Rendering

- The restaurant is a real 3D scene (React Three Fiber, orthographic camera). The **pixel look** renders the scene to a low-resolution target, converts to display space in a shader, snaps every pixel to a 24-colour palette per weather through a 32 by 32 by 32 lookup texture (one texture fetch), and upscales with nearest filtering. The pixel size is automatic (one scene pixel per 420 CSS pixels of width, 1 to 3) so a 360 px phone stays readable. The palettes were clustered from captures of the real scene (`tools/pixel/`).
- The interface carries the same look through one stylesheet block keyed on a `pixel-ui` class.
- **Quality tiers** (high, medium, low) choose shadow map size and rain density from the device, with a runtime step-down if frames run slow. Only presentation changes; a score is identical on every tier.
- `?pixel=0` turns the pixel look off everywhere; `?ui=0` only the interface; `?q=low|medium|high` forces a tier.

## Hosted service (lockstep)

See the entry in the build log. In short: each device runs the same engine from the same opening snapshot; a tap becomes an action; the host stamps it 15 ticks (1.5 s) ahead of its clock and announces it over realtime; every device applies it on that tick before that tick's step; every 5 seconds the host publishes a state checksum and a helper that disagrees starts over from a fresh snapshot. The server relays and validates (one helper, pass actions only, host-only commits) and simulates nothing.

## What is deliberately not here

No outside HTTP (`permissions.http.enable` is `false`), no payments, no blob storage, no remote fonts, images or scripts, no user-supplied images or free text beyond a restaurant name and an 80-character note, both held to an allowlist.
