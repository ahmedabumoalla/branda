# Current task state

Updated 2026-10-19 13:54 +03:00 - Asia/Riyadh

## Resume here

- Latest application: admin-logo/home-account navigation on `main` for production `branda-2`. Identify its commit with `git log -1 --format=%H -- lib/data/home-account.ts`; exact publication evidence is `.git/home-account-production.json`. Missing evidence means deployment is not verified
- Admin sidebar logo opens `/` in expanded/collapsed/mobile states. Homepage renders a visible account icon from the validated active server session: platform admin to `/admin`, brand owner/manager/staff to `/dashboard`. Guests/inactive or unavailable sessions keep sign-in links. Existing destination authorization remains unchanged; no credentials or user profile data enter client props
- Account icon remains visible on mobile; mobile/footer links use the same destination. Public content and account lookup run independently so a CMS failure does not remove a valid account link. Homepage remains dynamic and not publicly cached
- Previous release: wallet history `0a875fbf0a9b9733fca7d24ce93872a88d63b064`, production `dpl_BWRjQtoxqqP9uchwhBo8RK9zU9Sw` verified 2026-10-19 13:40 +03:00 in `.git/message-history-production.json`
- Owner loyalty dashboard now shows saved announcement title/body, creation/update timestamps, queue/provider states, total distinct messages and 10-message pages. History refreshes after a send attempt; admin operations has a per-brand history dialog beside promotional totals
- History covers all saved announcements, independent of the report period. Report customer/send counts remain unchanged. Provider acceptance does not prove delivery or reading; provider request counts are not shown as customer totals. There is no per-message audience count in this release
- No schema change or message dispatch was needed. Server verifies active profile and owner/manager membership or platform-admin access, excludes deleted brands and sync jobs, and returns allowlisted fields with private/no-store caching
- Previous application release `7854ed177552d1f12d0b5083cdb4b825b76264d3` and documentation baseline `9b4f18097d8f43fec673c2a3f106df23f979421f` remain the source of established catalog/operations behavior below

## Latest verification

- RUN 2026-10-19 13:53 +03:00 Node24.21.0: `node scripts/check-home-page-ui.mjs` passed 16 grouped SSR/auth/role/sidebar/mobile/CMS/motion checks; text integrity, `tsc --noEmit --incremental false` and scoped ESLint passed. One existing unoptimized CMS-image warning remains; two pre-existing test-harness lint errors were fixed without suppression. Exact commands and input hashes: `.git/home-account-checks.json`
- RUN 2026-10-19 13:53:00 +03:00 isolated `next build --webpack` PASS in `C:/Projects/branda-home-account-release-20261019`; temporary environment removed. `.git/home-account-build-exit.json` captures application hashes. Only test-harness lint cleanup followed the build and was rerun separately; production verifier matches application hashes to the build and the test file to its later passing run
- Publication check `.git/verify-home-account-production.cjs` verifies exact main SHA/project/alias, guest home200 with login and no account link, private/no-store response and admin logo home link. Authenticated role rendering tested in isolated session/SSR checks; no browser or physical-device test

## Message-history verification

- RUN 2026-10-19 13:36 +03:00 Node24.21.0: `node scripts/check-wallet-message-history.mjs` passed 36 auth/tenant/pagination/provider-state/HTTP/React SSR checks; existing `node scripts/check-operations-report-ui.mjs`, `node scripts/check-text-integrity.mjs`, `tsc --noEmit --incremental false` and scoped ESLint passed. Commands, timestamps and changed-source/dependency/config hashes: `.git/message-history-checks.json`
- RUN 2026-10-19 13:37:57 +03:00 isolated `next build --webpack` PASS at `C:/Projects/branda-message-history-release-20261019`; only the nine task files over the clean baseline were built. Temporary environment file removed. Source hashes and baseline: `.git/message-history-build-exit.json`; publication verification asserts the published application matches, allowing only accompanying documentation differences
- RUN 2026-10-19 13:35 +03:00 read-only actual database loader queries found four DeliCake messages with intact content. Session was mocked as the existing owner; actual database/profile/tenant queries and anonymous queue denial verified. No customer payloads saved in evidence, no messages sent. `.git/message-history-live.json`
- Source review covered responsive wrapping, theme inheritance, native modal keyboard/focus behavior, loading/empty/error/retry states and escaped customer-authored text. No browser or physical-device test. Management CLI still returns403; no database migration was required
- Final live verification uses `.git/verify-message-history-production.cjs`: correct project and exact main commit/deployment alias, menu200, anonymous history403/no-store and malformed page400. Missing evidence is not a successful deployment

## Established behavior

- Product media primary choice persists in existing media JSON; unavailable/deleted products and unavailable free rewards stay hidden. Offers include the full Saudi end date and server validation. Failed saves retain drafts. Public menu refresh retains the established 30-second/foreground/reconnect behavior
- Dashboard product media signs on authenticated lazy load through the tenant-scoped owner endpoint; fixed private Storage bucket, no public credential or policy change. Public menu images remain intact
- Operations and PDF exclude electronic-branch visitors/accounts/last visit. Pager usage counts orders created, including cancelled orders, once per order. Promotional customers are distinct per brand/period; sends count each announcement/customer once across both wallets
- Migration `20261017001500_operations_pager_promotions` is applied and recorded. Private RLS recipient ledger and service-only tenant-validated insertion; active platform-admin-only aggregate. Existing v1 RPC remains for rollout compatibility
- Promotion recipient tracking begins 2026-10-17 00:11:35 +03:00. Counts represent provider-accepted dispatch, not confirmed notification delivery/reading or wallet installation. No invented historical audience. Failed/pending attempts do not count; partial accepted recipients do. No real messages sent during implementation verification
- Deli catalog migration is complete: never replay the earlier bulk update. Publication had 45 owner products; later owner availability changes are intentional and must be preserved. Source mapping: `docs/deli-catalog-20261016.json`
- Preserve each brand's approved identity and tenant/package boundaries. Direct loyalty name/phone enrollment is intentional; do not reintroduce OTP there. Existing staff WhatsApp OTP remains separate. Legacy electronic storefronts remain archived

## Previous release verification and evidence

- RUN2026-10-17 00:13-00:15 +03:00 Node24.21.0: 74 PostgreSQL auth/tenant/RLS/date/dedup/real-loader checks, actual React report SSR/filter/empty states, 31-brand PDF, 1201-recipient pagination/partial success/failure/retry checks, existing wallet-sync regression, text integrity, TypeScript and scoped ESLint PASS
- Exact isolated Next16.3.8 webpack + TypeScript build PASS00:15:14+03 at previous application commit `7854ed177552d1f12d0b5083cdb4b825b76264d3`; temporary environment file removed. Evidence `.git/operations-checks.json`, `.git/operations-build-exit.json`
- Live authenticated SQL read-only rollback: 14 brands, 12 pager orders, zero newly tracked promotional recipients, removed metrics absent. Function/source hashes and migration registry match; privilege assertions passed. These are verification-time counts, not permanently fixed totals. Evidence `.git/operations-database-live.json`
- Production exact alias/menu200 and anonymous report-data denial verified; anonymous admin shell returns200 with an authorization error and no report metrics. Evidence `.git/operations-production.json`
- REUSED 2026-10-17 01:06 +03:00: all recorded source/test/dependency/config hashes matched prior passing evidence, Node24 unchanged. Documentation-only task requires no new application build. Evidence `.git/handoff-check-reuse.json`; text integrity and documentation diff reviewed again before commit
- Browser was limited to necessary authenticated Supabase SQL migration; no fresh application-browser or physical-phone test. Management API token expired and Vercel direct API returned403 historically; GitHub deployment/status plus exact live alias provide production evidence. Never print credentials or assume an account switch restored them

## Unpublished work and remaining limits

- Preserve unrelated modified `AGENTS.md`, Rast CSS and Taza catalog draft, untracked generic loyalty/scanner files, local generated assets/output/tests and Supabase temporary files. They are not pending pieces of the completed release; never stage all files or deploy the old `.vercel/project.json`
- Physical POS overlay behavior, real wallet installation/notification reading and real customer WhatsApp delivery were not tested in this release. Historical follow-ups outside this task remain in the archive; do not claim them resolved
- GREEN-API account/partnership investigation remains stopped at the user's earlier explicit instruction. Do not resume, resubmit, or message anyone without a new request
- Continue from the user's next request, reading actual git status first. No data resets, repeated catalog SQL, credential changes or unsolicited messages

## History

Detailed previous records preserved verbatim in [task history through October 17](BARNDAKSA_HANDOFF/history/task-state-through-20261017.md) and [handoff history through October 17](BARNDAKSA_HANDOFF/history/handoff-through-20261017.md). Historical headings and counts are not current state. Evidence under `.git` remains local and is not synchronized to GitHub or another device
