# Codex account transfer — 8 November 2026

## Resume contract

Read repository `AGENTS.md`, `docs/task-state.md`, `00_MASTER_INDEX.md`, then this file before any work after switching Codex accounts. This is a continuity handoff, not authorization to start new work. The user wants the established workflow preserved. Wait for the user's next task after this documentation release.

- The user cancelled investigation of the old cashier screenshot after being asked for its URL. Do not reopen that investigation or repeat the question unless asked
- Do not reset data, rebuild completed features, change account/provider configuration or replay customer operations because the Codex account changed
- Preserve unrelated local changes. Never stage the entire workspace, discard changes, or publish unreviewed files
- Use short Arabic updates and the RTL wrapper specified in `AGENTS.md`. Ask only for genuinely missing information; do not repeat approvals already granted within the active scope
- Browser inspection requires an explicit request or an unresolved critical necessity explained first. Source, integration and API evidence come first
- Reuse checks only when affected implementation, tests, dependencies, configuration and runtime still match their evidence. Do not treat a commit ID alone as proof
- Keep secrets and raw customer payloads out of commits, handoff files and tool output. Revalidate access in the new account; never copy authentication tokens into documentation

## Repository and release workflow

- Main workspace: `C:/Projects/branda-platform`, with extensive unrelated local changes
- Release checkout: `C:/Projects/branda-salon-design-release-20261028`, branch `feat/barber55-identity-20261028`
- Repository: `https://github.com/ahmedabumoalla/branda`; deployment branch: `main`
- Stage only reviewed task paths. The release checkout also contains unrelated historical documentation edits; build staged task-record updates from the committed baseline and merge only current verified findings
- Publish with `git -c http.version=HTTP/1.1 push origin HEAD:main`, then verify the exact commit's Vercel status and live production responses
- Correct Vercel project: `branda-2`, project ID `prj_kHe6mtiyO05loZn6PgMOSpjlv4Ow`, team `team_y7Vs1peW8nv1hGUAz5quLRfK`
- Production hosts: `barndaksa.com` and `www.barndaksa.com`. The root workspace's old Vercel project link is not the deployment authority
- Do not build over the main workspace's `.next` while the local development server is running. Last observed local port was 3019; recheck process state before acting
- Last isolated build checkout: `C:/Projects/branda-local-runtime-20261108-stamp-queue`
- Verified runtime: Node 24.22.1 at `C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`
- Application edits require affected checks, TypeScript and text integrity. Documentation-only work requires diff/text/link review, not another local application build

## Published application baseline

Application commit: `74fbef28bf90d76a89ccb0c73848e9347e3eaeb4`

Vercel deployment: `AL9yyNGA64KBTDDtxbcuBvnGgnzW`, exact commit successful; both hosts checked at 2026-11-08 21:50:03 Riyadh time. This handoff release changes documentation only; its commit is the descendant of that application baseline.

- Cashier barcode, card number and Saudi phone inputs save one durable operation immediately, then process in the background
- Local IndexedDB acceptance is not proof of a recorded stamp. The original request ID survives retries; preserve cashier/brand scope, duplicate protection and server authorization
- Cashier displays only three accessible icon counters: successful, needing synchronization and not recorded. Names, phone hints and detailed rows remain in the owner dashboard only
- The reward button remains a separate existing verification/redemption flow. Do not gate stamp entry on customer lookup or reward preview
- Owner audit route: `/dashboard/read-operations`. Bulk retry reuses original operation IDs and only eligible failures
- Unknown phone enrollment creates the loyalty membership, card and first stamp atomically. It does not create a verified Auth login or bypass phone verification
- Wallet synchronization starts after stamp processing; a minute cron is the fallback. Scoped sync jobs and per-card leases prevent overlapping queued wallet updates
- Google link generation is not proof of saving. Invitation dispatch checks Google's actual `hasUsers`; unknown provider state is deferred without a WhatsApp POST. Apple device registration is retained as installation evidence
- Missing-card WhatsApp links use the brand name and existing signed loyalty access flow. Keep daily deduplication and never automatically resend an ambiguous provider outcome
- Never clear browser storage as a refresh fix: unsent local readings could be lost

## Verification and recovery already completed

- Migrations `20261108180040` and `20261108183724` are already applied. Do not reapply or replay their recovery steps blindly
- Latest migration MD5: `3863e2a9503e6c3411de85a5dd406fcb`; 49 new live rollback assertions plus 89 baseline assertions. Seventeen business/queue tables preserved; no added advisor findings in the delivery follow-up
- Root/release TypeScript, text integrity, server 12, wallet, outbox 13, dashboard, phone, scanner and scoped lint passed; isolated Node 24 webpack build passed
- Exact commands, run times and input hashes: `output/stamp-queue/delivery-fix/checks.json`, `checks-before-label.json`, `build-proof.json`; database evidence: `output/stamp-queue/delivery-verification.json`
- Four successful phone reads were repaired only to attach two deduplicated invitation jobs. Six ledger/profile table hashes and original stamp evidence were unchanged; no extra stamps were added
- Both repaired invitations were skipped because Google confirmed the cards were already saved. No WhatsApp POST was made for this recovery
- Google accepted both latest updates. The investigated Apple device fetched its latest pass, confirmed by the served watermark. Google acceptance does not prove what the customer's screen displayed
- Evidence: `output/stamp-queue/delivery-recovered.json`, `delivery-outcomes.json`, `delivery-fix/publication.json`
- At 2026-11-08 21:57:24 Riyadh time, fresh HTTP responses from both production hosts referenced a cashier bundle containing `readSummary` and `RastCashierReadSummary`, without `readHistoryHeader`. Evidence: `output/stamp-queue/delivery-fix/live-cashier-bundles.json`
- The user's old screenshot was not reproduced on their device, and their exact open URL was not provided. Follow-up was cancelled; do not mark the user's device issue verified or resume it without a request

## Remaining context

- No active implementation task is authorized by this account transfer
- Hadiqa replacement identity and new breakfast materials remain unavailable, as the user confirmed; do not invent them
- Detailed established brand, butcher, finance and loyalty decisions remain in their existing handoff files. Read only the relevant file for a new request and preserve completed behavior
- Local evidence files may not exist on another machine. Do not claim account/device synchronization or transfer of credentials. Repository instructions and committed handoff files are the portable source of continuity
