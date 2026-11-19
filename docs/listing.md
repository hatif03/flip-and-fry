# Developer Settings: exact values

For the Reddit developer portal (Developer Settings, Directory listing and In-app catalog). Filling these in does **not** publish the app. Image files are in [`listing/`](listing/); regenerate with `node tools/art/catalog-images.mjs` and `node tools/art/catalog-video.mjs`.

| Field | Value |
|---|---|
| Display name | `Flip and Fry` |
| Description (15 to 200 characters) | `A rooftop restaurant tycoon. A new headline every night, a crew of animals, and neighbors who drop by. One verified service a day.` (130) |
| Terms and conditions URL | `https://github.com/hatif03/flip-and-fry/blob/master/docs/terms.md` |
| Privacy policy URL | `https://github.com/hatif03/flip-and-fry/blob/master/docs/privacy.md` |
| NSFW | Off |
| App category | Games (or the nearest "Games" option the list offers) |
| Promotional icon | [`listing/icon-1024.png`](listing/icon-1024.png) (1024 by 1024, 6 KB) |
| Tile image (560 by 256) | [`listing/tile-560x256.png`](listing/tile-560x256.png) (32 KB) |
| Fallback image (1500 by 1000) | [`listing/fallback-1500x1000.png`](listing/fallback-1500x1000.png) (218 KB) |
| Featuring asset (MP4, 1500 by 1000) | [`listing/featuring-placeholder.mp4`](listing/featuring-placeholder.mp4) (251 KB, 12 s of stills). Replace it with real footage from the shot list in `submission.md` if you can; the limits are 800 KB per file, 3 MB at most |
| Featuring description (35 characters max) | `A new night at the rooftop, daily` (33) |
| Tile tagline (20 characters max) | `Cook. Serve. Repeat.` (20) |

The two policy URLs only work once the repository is public and these files are pushed to `master`.
