# Current task state

Updated 2026-10-17 01:06 +03:00 - Asia/Riyadh

## Resume here

- Latest application release: `7854ed177552d1f12d0b5083cdb4b825b76264d3` on `main`, verified on correct Vercel `branda-2` production `dpl_GZgp8kM42sgozvWQVXJJZUKnMyWU` at 2026-10-17 00:17 +03:00
- This handoff update changes documentation only and preserves that exact application tree. The documentation commit is identified by `git log -1 --format=%H -- docs/task-state.md`; verify its GitHub/Vercel status and live alias using `.git/handoff-production.json` after publication. Do not confuse the application release hash above with the later documentation commit
- Completed user requests: Deli catalog/photos, primary image or video selection, optional descriptions, actual menu visibility/offers, immediate product updates/cancel preserving scroll position, dashboard image renewal, and operations/PDF pager and promotional recipient metrics. No pending implementation or database migration for these requests

## Established behavior

- Product media primary choice persists in existing media JSON; unavailable/deleted products and unavailable free rewards stay hidden. Offers include the full Saudi end date and server validation. Failed saves retain drafts. Public menu refresh retains the established 30-second/foreground/reconnect behavior
- Dashboard product media signs on authenticated lazy load through the tenant-scoped owner endpoint; fixed private Storage bucket, no public credential or policy change. Public menu images remain intact
- Operations and PDF exclude electronic-branch visitors/accounts/last visit. Pager usage counts orders created, including cancelled orders, once per order. Promotional customers are distinct per brand/period; sends count each announcement/customer once across both wallets
- Migration `20261017001500_operations_pager_promotions` is applied and recorded. Private RLS recipient ledger and service-only tenant-validated insertion; active platform-admin-only aggregate. Existing v1 RPC remains for rollout compatibility
- Promotion recipient tracking begins 2026-10-17 00:11:35 +03:00. Counts represent provider-accepted dispatch, not confirmed notification delivery/reading or wallet installation. No invented historical audience. Failed/pending attempts do not count; partial accepted recipients do. No real messages sent during implementation verification
- Deli catalog migration is complete: never replay the earlier bulk update. Publication had 45 owner products; later owner availability changes are intentional and must be preserved. Source mapping: `docs/deli-catalog-20261016.json`
- Preserve each brand's approved identity and tenant/package boundaries. Direct loyalty name/phone enrollment is intentional; do not reintroduce OTP there. Existing staff WhatsApp OTP remains separate. Legacy electronic storefronts remain archived

## Verification and release evidence

- RUN2026-10-17 00:13-00:15 +03:00 Node24.21.0: 74 PostgreSQL auth/tenant/RLS/date/dedup/real-loader checks, actual React report SSR/filter/empty states, 31-brand PDF, 1201-recipient pagination/partial success/failure/retry checks, existing wallet-sync regression, text integrity, TypeScript and scoped ESLint PASS
- Exact isolated Next16.3.8 webpack + TypeScript build PASS00:15:14+03 at application commit above; temporary environment file removed. Evidence `.git/operations-checks.json`, `.git/operations-build-exit.json`
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
