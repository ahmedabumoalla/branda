# حارس السرعة, 2026-11-24 (Claude)

State: Included in the authorized wallet-links release on 2026-11-24, based on measured Claude source at df990363. All original budgets and baseline preserved. WhatsApp secrets are absent; no real alert message is enabled

The user names the two guards apart: «حارس الرفع» is the deployment size guard of 2026-11-21, «حارس السرعة» is this one

## What it does

| Layer | When | What it checks | On a problem |
|---|---|---|---|
| 1 | After every production build (`postbuild`) | Compressed first load JavaScript of all 154 pages against the measured baseline | Stops the build, production keeps its current version |
| 2 | After each push to main, once Vercel reports success | Lighthouse, throttled mobile, median of 3 runs: `/`, `/login`, `/cashier/login` and two catalogue brands (menu and loyalty), rotating daily | WhatsApp alert and a failed GitHub run (email). Never rolls back |
| 3 | Every 10 minutes on GitHub | Response time of six fixed public paths, the catalogue (reads the database) and three catalogue brands rotating every run | Alert when a page type is slow (over 3 s) or failing 3 runs in a row, repeated every 30 minutes, and one message when it recovers |

## Files

- `speed-guard.config.json`: every limit and page list
- `scripts/speed-guard/verify-page-weight.mjs` and `page-weight-baseline.json`: layer 1. `--update` rewrites the baseline, only when the user accepts measured growth
- `scripts/speed-guard/lighthouse.mjs`, `watch.mjs`, `shared.mjs`: layers 2 and 3
- `scripts/speed-guard/check.mjs`: self test and wiring checks, run by `.github/workflows/speed-guard.yml`
- `.github/workflows/speed-guard-deploy.yml`, `speed-guard-watch.yml`
- `lib/analytics/speed-guard-visit.ts`: visits whose user agent holds `BrandaSpeedGuard` or `Chrome-Lighthouse` never send brand statistics. Lighthouse runs also block `*/api/analytics/*`. Layer 3 sends plain GET requests that run no page scripts

## Effect on the platform

The only runtime change is the early return in `trackBrandEngagement` and `reportCustomerUsage` for those user agents. Layer 1 adds about two seconds to the build and does not touch the deployment guard lines that `scripts/check-deployment-size.mjs` asserts. When Next.js stops writing `.next/diagnostics/route-bundle-stats.json`, layer 1 prints a warning and lets the release go on

## Measured on 2026-11-24

- Layer 1 baseline: largest page `/dashboard/finance` 1032 KB, `/menu/[slug]` 468 KB, `/loyalty/[slug]` 325 KB, `/` 224 KB, `/login` 214 KB. Limit per page: measured plus 30 percent or 80 KB, whichever is larger. A new public page 560 KB, a new private page 1240 KB
- Full `npm run build` with both guards: 3 min locally, exit 0
- Layer 2 on this machine, Lighthouse 12.8.2: `/` 3.9 s largest paint, 1686 KB, score 89. `/login` 1.9 to 2.3 s, 417 KB, 98 to 100. `/cashier/login` 4.9 s, 780 KB, 82. One menu 5.7 s, 980 KB, 76. Budgets set above these: 7 s, 1800 ms server response, 3000 KB, score 50
- Layer 3 against the live site: every page answered within 0.2 to 0.9 s
- Proofs: layer 1 exits 1 when a page passes its limit, layer 3 alerted on the third slow run, repeated, and sent recovery when the pages were fast again (WhatsApp settings absent, so only logged)

## Pending

- GitHub secrets for the WhatsApp alert through the notifications number: `SPEED_GUARD_WA_API_URL`, `SPEED_GUARD_WA_INSTANCE`, `SPEED_GUARD_WA_TOKEN`, `SPEED_GUARD_WA_TO`. Recipient confirmation is pending. One real test message needs the user's word
- Pages behind sign in (dashboard, finance, cashier, admin) need a read only test account, a database change that needs «عدل القاعدة»
- Layer 2 numbers on GitHub runners may differ from this machine; review the first runs and adjust budgets with the measured numbers
