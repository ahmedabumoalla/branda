# Current task state

Updated 2026-10-12 00:04 +03:00 — Asia/Riyadh

## Resume here

- Workspace `C:/Projects/branda-platform`, branch `main`
- Current task: save continuity before closing VS Code or changing the Codex account
- Latest application HEAD and last verified Production commit: `393749df3c2794d1832e3389d53f3278b085f84f`
- Universal package loyalty/offers COMPLETE; no pending implementation, migration or publication for that request
- GREEN-API checking STOPPED by explicit user request after they reported an outage; do not resume or send another partnership application until asked
- Partnership approval remains UNKNOWN; the interrupted check did not reach authenticated account status and no follow-up was sent
- Next action: read [current handoff](BARNDAKSA_HANDOFF/00_MASTER_INDEX.md), inspect Git status and continue only the user's next request

## Established scope

- Kawakib (`rast`) is the functional reference for package-enabled loyalty/rewards/cards/cashier/scanning/notifications and offers across brands
- Preserve ALL existing standalone menu designs: Kawakib retains its distinct design and other brands retain their existing Basilico-style design
- Each brand uses its own identity/data and active-package/tenant authorization; never copy Kawakib customers or program data to another brand
- Pager uses Branda's current WhatsApp number temporarily; reminders start at ready status and stop at received/cancelled; receipt triggers one rating invitation
- Only `test-cafe` was granted the existing technical administration plan for testing through 2026-11-11 05:22 +03:00; do not activate it for other brands

## Last verified release evidence — historical runs, not rerun today

- Production verified 2026-10-11 16:53 +03:00 for exact commit above, GitHub deployment `6996484234`, correct Vercel project `branda-2`, success at 13:50:45Z
- Deployment URL `https://branda-2-bs50jyywf-ahmedabumoallas-projects.vercel.app`; evidence `.git/universal-services-production.json`
- Live GET: test-cafe/rast loyalty 200 with own-menu links/enrollment; basilico loyalty 404 because its package excludes loyalty; menus 200 with distinct Rast hero only for Rast
- Migration `20261011134719_universal_package_loyalty` applied and verified; 14 brand locks generalized while package/tenant guards and restrictive RLS stayed intact; 118 cards, 8 programs and 11 staff at verification, not current counts
- Isolated `next build --webpack` passed on Node24.21.0/Next16.3.8 at application commit `87b44a6` in `C:/Projects/branda-universal-services-release-20261011`; later application unchanged after migration-path/documentation amendment
- RUN at 16:47 +03:00: 38 SQL, 15 server, 38 OTP, 16 UI, 144 directory and 23 directory UI checks plus scanner/wallet/offers/menu checks, text integrity and TypeScript passed; detailed provenance in archive
- Four complete inactive-service menu SSR baselines matched `44e8ba9`; published public-menu stylesheet files unchanged
- Evidence `.git/universal-services-build-exit.json`, `.git/universal-loyalty-migration.json`, `.git/universal-loyalty-live-verified.json`; private evidence stays local and must not be committed
- No customer messages or business test transactions were sent for this release; real WhatsApp delivery and actual phone wallet installation remain unverified

## Local unfinished alternatives — preserve and never publish wholesale

Observed 2026-10-11: modified `AGENTS.md` generated Next block and `components/menu/rast-spotlight.module.css`; untracked `app/loyalty/scan/`, generic loyalty dashboard/card/membership/scanner/login components, `public/menu-logos/rast-transparent-v1.png`, `scripts/check-loyalty-database.mjs`, `scripts/check-wallet-integration.mjs`, `supabase/tests/013_loyalty_experience_atomic_scanner_test.sql`, `supabase/.temp/`

These are NOT pending parts of the completed universal release; inspect before reuse and do not reset or stage all files

## Handoff-only update

- Condensed this record and refreshed the master index; full prior record preserved verbatim in [archive through 2026-10-11](BARNDAKSA_HANDOFF/history/task-state-through-20261011.md)
- No application, environment, database, browser account or production change in this task
- RUN 2026-10-12 00:03 +03:00 on Windows with Node24.21.0: `node scripts/check-text-integrity.mjs` and `node node_modules/typescript/bin/tsc --noEmit --incremental false` passed against the preserved current workspace/dependencies; changes in this task are documentation only. No application build or fresh live-service verification performed. Initial documentation diff check found one trailing blank line, removed before commit
- Files persist in this same workspace after editor/account changes; credentials and browser sessions remain machine/account dependent, with no claim of another-device synchronization
