# Deployment size fix and guard, 2026-11-21 (Claude)

State: PREVIEW ONLY. Pushed on 2026-11-21 as branch `perf/function-size-20261121` (based on `0c55c668`) after the user asked for a test deployment and a build time measurement. Not merged to main, production untouched

## Why

The user asked why Vercel builds grew from a few minutes to more than twenty. Measured from GitHub commit statuses (pending to success):

| Period | Build time |
|---|---|
| May to October | about 0.5 min |
| 1 to 11 November | about 1 min |
| 13 to 18 November | 4 to 8 min |
| 18 November, commit `12a5ea8c` (13 MB tutorial video added to public) | 16 min |
| After `a59cb542` (17 MB video) | 20 min |
| 21 November, `0c55c668` | 23 min |

## Cause

`lib/wallet/logo.ts` reads a brand logo from `public` through a variable path. The file tracer cannot know which file is needed, so it packed the whole `public` folder (200 MB) into every server function that imports the wallet modules

Local production build of `0c55c668`: 123 of 266 routes carried the whole folder, the largest route was 293 MB, and all route traces together were 29.7 GB against 330 MB of unique files. Compiling and type checking took under two minutes

Not verified: the Vercel build log itself. That the minutes are spent packing and uploading these functions is an inference from the measurements above

## Change

- `next.config.ts`: `outputFileTracingExcludes` drops `./public/**/*` from every route. `outputFileTracingIncludes` keeps the three files read by a fixed path on every route (two Tajawal fonts, the MQAS77 emblem) and keeps every public image on `/api/wallet/**`
- `scripts/verify-deployment-size.mjs`: new guard, run at the end of `npm run build`. It reads the traces and changes nothing
- `scripts/check-deployment-size.mjs`: test of the guard with synthetic traces, plus assertions that the guard stays in the build command and the config keeps its shape
- `AGENTS.md`: section "Deployment size"
- No application logic changed. `lib/wallet/logo.ts` is untouched

Only these code paths read from `public` on the server: the three invoice modules (fonts, fixed path), `lib/wallet/mqas77-assets.ts` (emblem, fixed path) and `lib/wallet/logo.ts` (logo, variable path). The logo and emblem readers run only inside `/api/wallet/**` routes: `apple/[cardCode]`, `apple/v1/passes`, `art/[cardId]/[token]` and `brand/[slug]/logo`. Other importers of `@/lib/wallet` call sync, notify and readiness functions that never reach those readers

## Evidence, same commit before and after

| Measure | Before | After |
|---|---|---|
| All route traces together | 29.7 GB | 6.6 GB |
| Largest route | 293 MB | 161 MB (wallet API) |
| Largest route outside the wallet API | 293 MB | 94 MB |
| Routes outside the wallet API carrying public files beyond the fixed three | 123 | 0 |
| Fixed files lost by any route | | 0 |
| Images lost by a wallet API route | | 0 |
| Files outside public lost by any route | | 0 |

Wallet API routes lost only the non-image files of `public` (videos, scripts, an APK). A logo that points to such a file fails before and after

Checks run: production build with the guard PASS, guard test PASS, existing `check-deployment-traces.mjs` PASS, text integrity PASS, TypeScript PASS inside the build. A build of the unfixed config with the guard exits 1 with 240 problems, which shows the guard catches the original fault

## Measured on Vercel

Preview deployment of commit `a12c0eaf` on 2026-11-21: pending 17:28:37Z, success 17:29:31Z, 54 seconds. The last production build before the fix (`0c55c668`) took 23.1 minutes, and preview builds in mid November took 6 to 7 minutes, the same as production builds then. Every function changed in this build, so the time is not an unchanged-output shortcut

Not seen: the Vercel build log. That the guard line `[deployment-size]` ran there follows from the build command in package.json and is not confirmed by reading the log. The preview address is behind the Vercel login, so pages, wallet cards and invoice PDFs on it are for the user to try

## Two things tried and rejected

- `/* turbopackIgnore: true */` on the `process.cwd()` argument in `lib/wallet/logo.ts`: the tracer then packed the whole project, 1.2 GB per route, including `.codex-tmp`. Do not use it there
- Relying on the order described in `next/dist/build/collect-build-traces.js` (excludes after includes): that step is skipped for Turbopack builds. Turbopack applies the includes after the excludes, measured by the build above

## What the guard checks

- A route outside `api/wallet/` carries a public file that is not in `FIXED_PUBLIC_FILES`
- A wallet API route carries a public file that is not an image, or misses a public image that exists on disk
- A route passes its limit: 140 MB, or 230 MB for wallet API routes
- All routes together pass 12 GB

When it fails, the build stops and production keeps its current version. The message names the route and the files

## When the guard fails later

- Stray public files on a route: some server code reads `public` through a variable path. Give it a fixed path and list the file in `FIXED_PUBLIC_FILES` and in the `"/*"` includes, or fetch the file by URL
- Wallet route over 230 MB: `public` holds too many images. Move catalogue images to storage, or narrow the `/api/wallet/**` include to the folders that hold brand logos after checking which same-origin logo paths brands use. `lib/wallet/logo.ts` falls back to fetching the logo over HTTPS when the file is not on disk
- Ordinary route over 140 MB: look at what the route added, usually a large package traced into it
- Raise a limit only with the measured numbers written next to it

## Not done

- No production deployment and no merge to main. To measure a build: `gh api repos/{owner}/{repo}/commits/<sha>/statuses`, last pending time to success time
- The six videos stay in `public` because WhatsApp messages link to them. They no longer reach any function
- Nine old project copies tracked under `.codex-tmp` (839 MB) only slow the clone. Removing them is a separate decision
- Chromium is still packed into about 30 finance routes at 67 MB each. That is the next largest share and was not touched
