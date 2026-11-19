# What is left, and what Claude needs to do it

Written 19 November 2026, after v0.0.25. Everything below is the work that **cannot be proved by the automated tests**, because it needs a real Reddit session, a real phone or a second account. The code for all of it exists and is tested against fakes. Nothing here is a missing feature unless it says so.

## 1. What Claude can already do alone, on this machine

| Capability | How | State |
|---|---|---|
| Run every automated test, the 3-engine hash test, lint, both typechecks, the size budgets | `npm test`, `npm run test:engines`, `npm run lint`, `npm run perf:check` | Working |
| Screenshot every screen at phone and desktop size from the running game | `node tools/look-shot.mjs` | Working |
| Upload and install a build on r/flip_and_fry_dev (never `devvit publish`) | `npm run upload`, `npx devvit install flip_and_fry_dev` | Working, you are logged in |
| Read the real server's live log while you play | `npx devvit logs flip_and_fry_dev` (streams new lines only; ask Claude to run it while you test) | Working. It shows server errors from real Reddit, not the screen |
| Drive an Android phone: screenshots, taps, screen recording, open a URL, dump the on-screen buttons | `adb` (installed at `C:\Users\mdhat\AppData\Local\Android\Sdk\platform-tools`) | Needs a device, see 2A |
| An Android emulator | `flipfry_a` was created (Android 16 with Google Play). It boots, but on this machine it freezes with "System UI isn't responding", so it is not usable until RAM and CPU are freed (close other heavy programs) or it is run on a stronger machine | Created, not yet usable |

## 2. What Claude needs from you, by item

### A. A real-device pass over every new screen (needs one thing: a device Claude can reach)

Pick one:

1. **Your own Android phone over USB (best).** Settings, About phone, tap Build number seven times; Developer options, turn on **USB debugging**; plug the phone into this PC; accept the "Allow USB debugging" prompt. Claude then runs `adb devices` to confirm, opens the post in the Reddit app (or Chrome), takes screenshots, taps through the game and records a short video. You stay logged in to Reddit on the phone yourself.
2. **Wireless debugging** (no cable): Developer options, Wireless debugging, Pair device with pairing code. Tell Claude the IP:port and the code.
3. **The emulator.** Only after the machine has room for it. You log in to Reddit in the emulator window yourself (Reddit's login has a bot check that Claude must not and cannot get past).
4. **A browser tool.** If you enable one that can drive your Chrome (for example the Claude in Chrome extension or a built-in browser tool) and open reddit.com while logged in, Claude can click through the web post. Claude has none in this session.
5. **No tool at all:** send phone screenshots or a screen recording of each screen in the checklist in section 3. Slowest, still works.

Claude never needs your Reddit password and must not be given it. A password was pasted into the chat earlier in this project: **change it**.

### B. The two-account co-op test (needs a second Reddit account on a second device or profile)

The lockstep and the server relay are tested with fakes (`src/test/coop.test.ts`, `src/test/coop-panel.browser.test.tsx`). What a fake cannot show is Reddit's real realtime channel, its delays and a real second player. Needed: the second account logged in on a second device (a second phone, a second Chrome profile, or a second emulator), and the same post open on both. Then, with `adb` on each or your screenshots: one turns on **Cook together**, the other taps **Help at (kitchen)**; both cook a night; the host's result card should list the neighbor's cooking and the hashes should agree. Claude can read `npx devvit logs` for both while you do it.

### C. Real timings on Reddit's production Redis

Needs the post open on any logged-in device. Steps: plant a crop; use the moderator menu item **"Playtest: skip 6 hours of my garden timers"**; reopen the post; the crop should be ready, the strip should say so, and tapping the bed should harvest it. Repeat with a builder upgrade and a workshop batch. If it works, the server clock, the revision checks and the settling of finished jobs work on the real Redis. Claude watches `devvit logs` for errors during it.

### D. Push notifications ("your basil is ready")

Not a code gap. Reddit's push-notification beta must be granted to the app in the developer portal (apply under the app's settings; the form needs the app's name and a short use case: a once-a-day reminder when a crop or a job is ready). If granted, Claude adds a scheduler job that, for opted-in players, notifies when a timer finished and nothing was opened that day, reusing the streak-reminder code in `src/server/core/notify.ts`. If it is not granted, a ready crop shows only when the post is opened, which is already built and tested.

## 3. Checklist for the real-device pass

- First lunch (60 s): the hint, Open, the pass, the result card, "Spend your $X".
- Dinner: the door queue, seat, order, cook with the marker, flip, serve, clear, a decision card; the hustle meter; the camera framing above the pass.
- Garden tab and farm view: plant, water, harvest by tapping a bed and by the panel; the roof boxes; the tasks strip chips; level up.
- Workshop, builder (with overtime), order board, the block (party and fridge).
- Build tab: Layouts (save, change the room, use), the station chips on the Team tab.
- Sound with the speaker switch on: chain chime, coin, bell, ding, flip, pop, hammer.
- At the end of a losing streak (hard to reach by hand; covered by tests): the final notice and the foreclosure card.

## 4. What is still not done, plainly

- **Real-device and two-account verification** (sections 2A and 2B): not done.
- **Real-Redis timings** (2C): not done; the playtest menu item is the way.
- **Push notifications** (2D): waits on Reddit's beta.
- **The demo video, the Devpost form and the developer survey**: yours to do before **8 December, 6 pm PT**. Claude can draft the video script, the form text and the survey answers from `docs/listing.md` and `docs/submission.md`, and can record the phone screen through `adb` if a device is connected.
- **Making r/flip_and_fry_dev public**: the request is with Reddit.
- **Remove the moderator menu item "Playtest: skip 6 hours of my garden timers" from `devvit.json`** before the real submission if you do not want any moderator of any community to be able to use it on their own garden.
