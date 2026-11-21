# Deployment size fix and guard, 2026-11-21 (Claude)

State: PUBLISHED to main on 2026-11-21 after the user wrote the publish word for production. Preview builds were measured first on branch `perf/function-size-20261121` (based on `0c55c668`)

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

## Production verification

Commit `1dd9b40c` pushed to main on 2026-11-21. Production build: pending 17:54:50Z, success 17:56:05Z, 75 seconds, against 23.1 minutes for `0c55c668`. The live site moved from deployment `dpl_8p1qRw8t2wGpySHMfdpGoDjuWnXP` to `dpl_EnGpHnWSrjHEgi9iVwhbnEwtmqgj`

Before the push, 100 answers of barndaksa.com were recorded twice and were stable: the wallet logo of 29 brands in both shapes (58 PNG images), seven pages, and five static files including both tutorial videos. After the deployment all 100 answers were the same, the 58 logo images byte for byte. The MQAS77 wallet logo, which is read from the fixed file `public/mqas77/wallet-emblem-v1.png` inside a wallet function, returned an image

Not verified by me: Apple and Google wallet card downloads and finance invoice PDFs, which need a signed-in session. The user tries them on the live site. To undo, revert `a12c0eaf` on main, about two minutes with the current build time

## Hardening after publication

State: PUBLISHED to main on 2026-11-21 after the user wrote the publish word for the hardening, pushed in the commit that carries this line. Tested first on previews of branch `perf/deployment-guard-hardening-20261121`

Production: commit `4690c27f` on main, Vercel build pending 19:18:56Z, success 19:19:33Z, 37 seconds. The GitHub check `Deployment guard stays wired` passed on that commit, the live site moved to deployment `dpl_J9f39UdQYqb3kJzwNptjanoMJUgs`, and 100 recorded live answers were identical before and after

The user asked for certainty that neither assistant ships a slow build again. Proofs run on Vercel with throwaway preview branches, all deleted afterwards:

| Build | Result on Vercel |
|---|---|
| The published fix with the exclude removed (`7d609393`) | failed in 35 seconds |
| Hardening commit (`8356edfa`) | passed in 28 seconds |
| Hardening with the old build command `next build` and the old tracing config copied back (`5384bd2d`) | failed in 27 seconds |

The hole it closes: the local development tree `C:/Projects/branda-platform` is 339 commits behind main and holds older copies of `next.config.ts`, `package.json` (build command `next build`) and `vercel.json`. Copying the first two over main would remove the fix and the guard together. `vercel.json` now runs the guard a second time through `buildCommand`, so that case stops the build

A third, independent check runs on GitHub: `.github/workflows/deployment-guard.yml` runs `scripts/check-deployment-size.mjs` on any branch when `package.json`, `vercel.json`, `next.config.ts`, `lib/wallet/logo.ts` or the guard scripts change. It needs no build and no secrets. A failed run marks the commit and is emailed to the account that pushed. It passed on the hardening branch, and it reported a failure on a commit whose test file was broken

What no check in the build can stop: all three files replaced by older copies at once, a deliberate removal of the guard, and a slow build from a different cause that keeps functions small. For those the rule in AGENTS.md applies: measure the build time after every deployment and stop when it passes five minutes. Measured on 2026-11-21: 39 seconds for a docs commit and 2 minutes 3 seconds for the admin account feature (`b1d8a34c`). The same rules were added to the local AGENTS.md of `C:/Projects/branda-platform` and of the release worktree

## Preview finding: broken loyalty logo

On the preview the user saw the brand logo broken on `/loyalty/<slug>` for DeliCake and LOCO while production showed it. That logo comes from `/api/wallet/brand/<slug>/logo`, which calls `walletBaseUrl()` first and returns 503 without `WALLET_PUBLIC_BASE_URL`. A throwaway preview build that exits 1 when that setting is missing failed in 11 seconds, and a control run on `NEXT_PUBLIC_SUPABASE_URL` passed, so the Preview environment has no wallet base address and the logo is broken on every preview with or without this change. Both brands store their logo in storage, not in `public`. Wallet cards cannot be tested on a preview for the same reason. The throwaway branches were never merged

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

- To measure a build: `gh api repos/{owner}/{repo}/commits/<sha>/statuses`, last pending time to success time
- The six videos stay in `public` because WhatsApp messages link to them. They no longer reach any function
- Nine old project copies tracked under `.codex-tmp` (839 MB) only slow the clone. Removing them is a separate decision
- Chromium is still packed into about 30 finance routes at 67 MB each. That is the next largest share and was not touched
