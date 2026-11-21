# Bolingo daily nearby-message periods

User authorized live activation on 2026-11-21. Scope: Bolingo only, cafe dbe942ba-dfa4-422b-a9f6-9527c3b27cc9, slug brand-d36eed2e287f. Isolated release worktree C:/Projects/branda-bolingo-nearby-20261121 based on production 06af7e99974bf93f53e4dbabf951e871bc972179. Unrelated uncommitted Aldeem/admin work remains excluded.

Rewards management now includes an owner-only period editor beneath nearby messages: enable/disable, up to 48 daily periods, start/end, text, add/delete, independent save, inline validation and stale-revision protection. Uses existing brand theme and accessible labels/status/errors. Riyadh timezone, minute precision, end-exclusive intervals, overnight periods supported, overlap rejected. Outside periods/when disabled, existing nearby/branch copy is preserved. No periods/messages are seeded; the owner supplies them.

Migration 20261120235457_bolingo_nearby_message_periods applied and exact stored source verified. Private RLS table, authenticated guarded RPC, active owner/admin and loyalty entitlement checks, cafe scope constraint, service-only schedule worker. Wallet cron checks transitions once per minute and coalesces durable sync jobs. Apple pass update timestamp advances; current message overrides all eligible branch locations. Google class details update silently; Google still controls its nearby notification. A later coalesced stamp keeps normal Google notification behavior, with microsecond ordering preserved. Device refresh and notification appearance are not guaranteed at exact boundaries.

Verification evidence in root output/bolingo-nearby-20261121:
- checks.json: exact command/runtime/input hashes and timestamps; 1515 schedule assertions including 1440 SQL/JS minute comparisons, overnight/boundary/overlap cases, PostgreSQL/RLS/permissions/revision/queue tests, service guards and server-rendered editor states
- Wallet sync regression including silent schedule refresh and later stamp; branch location regression; full TypeScript and full original text integrity passed
- Live verify.json: owner save, stale revision denial, overlap denial, disable/fallback and idempotent queue checks in a rolled-back transaction; no retained schedules or test messages, anonymous/direct writes denied
- advisors.json: affected warning is intentional authenticated SECURITY DEFINER save RPC; empty search path, explicit tenant/owner/entitlement guard and anonymous denial verified
- Source responsive/accessibility review completed; no browser inspection or real device delivery test

Publication: source prepared for main/GitHub-triggered Vercel deployment. Final commit, deployment status and live evidence will be merged into the current task record after verification. Existing local Vercel credentials are expired; GitHub deployment status and production HTTP checks can verify the automatic deployment without requiring a login.
