# Push notifications beta: application draft

Reddit's push notifications for Devvit apps are an experimental, gated beta. This is a draft of what to send, ready to paste. **Check the official page for the current steps and form first** (the docs page "Notifications overview" on developers.reddit.com); Claude could not open it from here, so the steps in the chat are from search results and must be confirmed there.

## What the game would send, and only these

All opt-in (a switch the player turns on in the post; it is already built and says "not available" until Reddit enables it). At most **one notification a day** per player, only if they have not opened the post that day, and never at night in their time zone if Reddit offers a quiet window.

| When | Copy (under 60 characters where possible) |
|---|---|
| A streak of 3 or more days would end today | "Your 5-day streak ends tonight. Today's service is on." |
| A crop or a workshop batch finished and the player did not come back that day | "Your tomatoes are ready on the roof." |
| A builder finished an upgrade | "Your grill upgrade is done." |

No marketing, no other players' names, no links except the post itself.

## Use case (paste into the form)

Flip and Fry is a once-a-day restaurant game. Players open a daily post, run one verified service, and between services tend a rooftop garden and a builder that run on real timers (20 minutes to 12 hours). A single opt-in reminder that a timer finished, or that a streak will end today, is the natural re-engagement for a daily game and is the only reason a player would otherwise have to remember to come back. We send at most one a day, only to players who turned the switch on, only when they have not played that day, and we stop for a player who turns it off. The reminder code is built, tested against fakes, and fails soft: if the capability is not enabled the switch says so and nothing else changes.

## Facts to have ready

- App name: **Flip and Fry** (`flip-and-fry`), developer account: the one you log in with.
- Demo subreddit: r/flip_and_fry_dev.
- Where the code is: `src/server/core/notify.ts` (the reminder), `src/server/routes/scheduler.ts` (`/internal/scheduler/streak-reminders`), `devvit.json` (the scheduler task).
- Privacy: `docs/privacy.md` (the reminder stores only a user id and an on/off flag).
