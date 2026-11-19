# Plan status

[`hackathon-plan.md`](hackathon-plan.md) against what exists, by build phase (plan section 18). "Changed" means built differently from the plan, always with the reason in [`build-log.md`](build-log.md).

| Phase | Plan | Status |
|---|---|---|
| **P1** Deterministic core | Action log, `runService`, cross-engine hash, E1 to E4 | **Done.** Hash identical in Chromium, Firefox and WebKit. Changed: the `restaurant` singleton stays in `engine.ts` (harmless without `window`); schema stayed at version 1 because old saves load through defaults |
| **P2** Headline, bots | Headline, shared challenges, weather, discount lift, bots | **Done.** Calibrated; economy numbers changed because the first bot run showed the starter economy did not discriminate |
| **P3** Server | Park, open, lock, lazy daily post, streak, comment, flair, subscribe, triggers | **Done** |
| **P4** Client shell | Splash, expanded entry, collapsed dock, result card, auto-lock, journeys | **Done** |
| **P5** Pixel and assets | Pixel scene and UI kit, splash still, icon, Android 2D copy, quality tiers | **Done, with changes.** Pixel scene with automatic size; pixel interface via one stylesheet block; icon and portraits drawn in code (no 9-slice image files, no thought-bubble sprites); quality tiers. Not built: the Android 2D-canvas copy (spike S2 showed no black canvas on the first phone, so it stays a fallback only) |
| **P6** Tycoon depth | Dishes as data, starter staff, bills, comfort gap, thoughts, kitchen card, awards, company value, contracts, research, regulars, menu styles | **Done, with refusals.** Not built: chef-only starter park, bills on tables, a style chosen at the start. "Nailed down" and "Honest prices" were redefined to be earnable rather than forced |
| **P7** The pass, `KitchenEngine` | Ticket-mode station, Test Kitchen, wardrobe, Redis persistence, touch, daily shift, stars bonus | **Done, changed.** The pass is a deterministic timing bar plus optional hold-to-prep (inputs, not reported results) instead of a 3D station; the Test Kitchen ships whole with touch, Redis save, a daily shift, a bounded research bonus and the comment flow. Fixed-step mode for the arcade engine not added |
| **P8** Reddit social | Presence, open doors and samples, hosted co-op, kitchen posts, night report, highlight, settings, text fallback, forms, toasts, notifications, snoovatar, media | **Done.** Visits are server replays rather than a second client mode. Co-op is one helper in lockstep. Notifications, media and avatars are built and tested against fakes and fail soft; the live behaviour needs the author's device and (for notifications) beta access |
| **P9** Audio | Generated beds, rain layer, mute rules | **Done** (one generated bed plus a rain layer on the existing switch) |
| **P10** Verification | Whole loop, seven-day run, soak, judging week | **Done** except a ten-minute heap soak and device frame traces (need a device) |
| **P11** Optimization | Bundles, models, audio, draw calls, GC, tiers, perf guard | **Done** for size (splash 17 KB, models 0.7 MB, audio 0.35 MB, fonts Latin only, size guard, tiers). Not done: draw-call audit, GC micro-work, one overlay canvas for labels, source maps (forced by the Devvit plugin) |
| **P12** Submission package | README, Devpost text, video shot list, provenance, feedback, demo subreddit | **Done** except what only the author can do (see the checklist in [`submission.md`](submission.md)) |

## Gates (plan section 19)

G0 to G4 and G11 pass as written. G5 to G10 pass in their automated form; their device-only parts are in the checklist. G12 (optimization) passes for size and not yet for device frame time. G13 (the dry run) is the author's.

## Plan v2 (20 November onward)

See [`plan-v2.md`](plan-v2.md). Status:

| Phase | Status |
|---|---|
| A. A screen that reads as a game | Built: one-row header, two-line daily bar, one hint line, one-row dock, camera toggle, Test Kitchen in the Ledger on a phone, toasts above the dock. From 1024 px the tabs sit in a left rail, the bottom bar keeps seats, cosiness, Test Kitchen and Open, and a right-hand drawer holds the panels; the camera glides instead of jumping when a panel opens |
| B. The first sixty seconds | Mostly through A: no welcome card, one hint, the Open button. Built after the phone test: the first night's goal is gentle (serve 8 guests, finish in profit) and the starter restaurant always meets it, orders are always on the pass, the card ends with "Spend your $X" and the table is marked "Best first buy". Refused: a shorter first service (service length is shared by every replay, bot and board) |
| C. Visible stakes | Built: night bar with bills, the till and reputation on the card, today's board, streak freezes. Weekly rank built after (Bronze, Silver, Gold by the week's stars). Not built: a bankruptcy rule (refused: it would delete progress) |
| D. Daily content | Partly: 21 distinct titles (three tellings per weekday, same numbers underneath). Built: the new-player gate (a bot that changes nothing earns a star on each of nights 1 to 3 on every one of the next 21 dates and the judging week), without touching the 21-date gates |
| E. One card, one next step | Built: stars, profit, award, goals, board and neighbors first; the kitchen card, stats and till under "The night in detail"; flair and follow under "More"; Continue pinned at the bottom |
| F. Measure it | Built: moderator menu item "Retention report" (totals only). The funnel was already in Journeys (open, first guest, midway, receipt, official end, plus each action) |
