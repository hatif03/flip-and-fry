# Performance log

Measurements and changes, in order. Budgets are from plan section 20.2. `npm run perf:check` (after `npm run build:devvit`) guards the size budgets.

## 2026-11-19: baseline, after the game was feature complete

| Measure | Value | Budget | Result |
|---|---|---|---|
| Splash (html, css, script, one font face, icon) | 17 KB | 150 KB | ok |
| Initial JavaScript (game entry, main, three.js, zod, shared), gzipped | 485 KB | 650 KB (own limit) | ok |
| Lazy chunks (Test Kitchen, restaurant scene), gzipped | 59 KB | 120 KB | ok |
| 3D models in the build | 4.3 MB (nine GLBs, webp textures are about 60% of each) | 4.5 MB | ok, but over what the plan wants (under 100 KB each) |
| Audio in the build | 808 KB (five MP3s; the restaurant no longer plays `music.mp3`) | 1.1 MB | ok |
| Font files a browser loads (woff2) | Latin subsets only, about 100 KB | 140 KB | ok |
| Server replay of one 150 s service | 7 to 27 ms (cold first run, then about 10 ms) | 300 ms | ok, 10 times under |
| Server bundle | 2.2 MB (`@devvit/analytics` pulls in Express) | none set | to look at |

Frame time and draw calls were not measured on a device. The first phone check (spike S1) showed steady frames and no black canvas.

## Changes made

1. **Fonts: Latin subsets only.** The three font families were imported whole, so the build carried Hebrew, Cyrillic, Vietnamese and extended Latin files that no English page loads. Now only `latin-*.css` is imported. The number of woff2 files dropped from 24 to 8.
2. **App icon.** The 1.1 MB icon was shipped to every player from `public/`. It moved out; the listing icon is now an 8 KB pixel version.
3. **Soundtrack generated in code.** The restaurant view no longer loads the 720 KB MP3.
4. **Quality tiers** (`src/scene/quality.ts`): the tier is chosen at start from cores, memory and the renderer name, can be forced with `?q=low|medium|high`, and steps down once if the measured frame time stays above 40 ms over 90 frames (`FrameWatch`). Medium halves the shadow map and the rain, low turns shadows and rain off. Only presentation changes, so a score is identical on every tier.
5. **Splash without a server call**: it reads the post's own data.

## 2026-11-19: models and audio compressed (with the author's go-ahead)

| Measure | Before | After | Budget now |
|---|---|---|---|
| Nine GLB models | 4343 KB | 731 KB | 900 KB |
| Largest model | 608 KB | 101 KB | 150 KB |
| Five MP3s | 808 KB | 347 KB | 450 KB |

- `tools/compress-models.mjs`: textures cut to 256 px and re-encoded as WebP, geometry welded, deduplicated, quantized and meshopt-compressed with `@gltf-transform`, `sharp` and `meshoptimizer`. The decoder is bundled with three and drei, so nothing is fetched at run time. The full-size originals are kept in `tools/source/models/` (not shipped).
- `tools/compress-audio.mjs`: mono, 56 kbps for the music and 48 kbps for effects, with `ffmpeg-static`. Originals are in `tools/source/audio/`.
- Checked after the change: the Test Kitchen scene test with the real models, the pixel pass tests, and a phone screenshot of the restaurant with its cars, bench and bulletin.
- The tools are dev dependencies only and are not part of the Reddit build.

## Not done yet, and what it needs

| Item | Why it is waiting |
|---|---|
| Source maps in the upload (about 15 MB, never served to players) | The Devvit Vite plugin forces `sourcemap: true`; a config override has no effect. Removing them is a post-build step. |
| Draw call and `renderer.info` audit, memory soak, throttled CPU traces | Needs a real device or a throttled desktop session. |
| One overlay canvas instead of per-guest DOM labels | Large change; the labels are few (at most about 20) and already positioned from one projection pass. |
| Allocation work in `route()` and `step()` | The server replay is already 10 times inside its budget, so this only matters for frame time; measure first. |
| Server bundle size | Express comes in with the journeys analytics package; cold start has not been measured. |
