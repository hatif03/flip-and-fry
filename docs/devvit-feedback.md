# Devvit feedback

Things we hit while porting Flip and Fry to Devvit Web, kept for the developer survey and the Feedback prize. Each has what happened, what we did, and what would have helped.

| # | Area | What happened | What we did | What would help |
|---|---|---|---|---|
| 1 | Tooling, Windows | Running `vite build` while `devvit playtest` is watching `dist/` crashes the watcher with `EPERM` | Use `devvit upload` and `devvit install` for device checks, or stop playtest before building | A note in the playtest docs, or the watcher retrying on `EPERM` |
| 2 | `devvit install` | `devvit install <subreddit> <app>@latest` failed once right after an upload with "Failed to prepare deployment for upgrade check" and worked on the immediate retry | Retry | A clearer message, or a short built-in retry |
| 3 | Scheduler | The cron expression's timezone is not documented | Made the daily post lazy: the first player request of each UTC day creates it, and the cron is a backup | One sentence in the scheduler docs ("cron runs in UTC") |
| 4 | Journeys | The telemetry router helper expects Express; the Devvit Web examples use Hono | Wrote the three journey endpoints by hand in Hono | A Hono adapter, or a framework-neutral handler |
| 5 | `devvit.json` | `permissions.http.enable` defaults to `true`, so an app that never calls `fetch` still declares network access | Set it to `false` explicitly | A default of `false`, or a warning when it is on and unused |
| 6 | Redis | No scan and no per-field expiry, which shapes every key design (a sorted set plus a hash for presence, one key per day for anything that expires) | Designed around it and wrote an in-memory fake that enforces the same limits for tests | A "Redis limits and patterns" page for games |
| 7 | Redis, transactions | It is not documented whether a failed `EXEC` (a watched key changed) throws or returns an empty result | Treat both as a conflict and retry | A line in the Redis docs, with an example |
| 8 | Testing | There is no official way to run server code against a local Redis | Put the game rules behind a small `Store` interface and a fake | A `@devvit/test` package with an in-memory Redis |
| 9 | Posts as the user | `runAs: 'USER'` for posts needs `userGeneratedContent`, and `SUBMIT_POST` in `asUser`; the error when either is missing is generic | Added both | An error naming the missing option |
| 10 | Settings validation | The validation endpoint's request and response shapes are only in a type file (`SettingsValidationRequest`), not on the settings docs page | Used the types | The shapes in the docs |
| 11 | Docs | The platform limits that matter to games (30 s request limit, 2 KB `postData`, 100 realtime messages a second) are spread over several pages | Collected them in `docs/plan-review.md` | One "limits" page |

## Positive

- The same code path runs the inline splash and the expanded game, which made the "tap to open" flow simple.
- `context.userId` and `context.postId` on the server meant the client never has to say who it is.
- Realtime, Redis and the Reddit API all being available behind one `@devvit/web/server` import kept the server small.
