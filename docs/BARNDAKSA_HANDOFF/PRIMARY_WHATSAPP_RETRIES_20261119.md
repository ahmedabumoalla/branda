# Primary WhatsApp retry policy - 2026-11-19

User requires the Branda primary sender to be tried three times, thirty seconds between attempts, before the fourth attempt may use standby

## Behavior

- Healthy primary sends immediately; recovery on the second or third readiness check never touches standby
- Platform selection probes primary at 0, 30 and 60 seconds; standby cannot be selected before the fourth slot at 90 seconds, plus actual provider latency
- OTP and owner video share one attempt budget across readiness and explicit 401/403/429/466 refusals; same message payload and recipient are retained
- A timeout, 5xx, malformed acknowledgement or accepted message never triggers a duplicate POST; other operational senders retain their one-POST contract after selection
- Legacy access-sender override cannot force standby; missing primary credentials fail closed. Existing pause semantics remain for paused message categories
- Verified private brand senders, LOCO/Wahed routing, entitlements and disabled customer welcomes remain unchanged
- Function deadlines increased to 300 seconds for affected API workers and inherited server actions. Owner video POST bounded to 30 seconds
- Four-minute database leases protect active attempts; pager/salon/renewal batches bounded to two waves, hospital notifications one claim, birthday/card-link workers account for readiness time and stop claiming additional work after 70 seconds while permitting the first send

## Database

Migration 20261118215000_primary_sender_retry_leases changes only eight existing function lease durations. Exact original definition hashes guard application. Read-only preflight, rollback compilation, application at 2026-11-18T21:54:49.911Z and post-apply verification at 2026-11-18T21:55:00.738Z passed. Exact expected bodies and ACLs asserted, existing OTP expiry/recipient checks/terminal outcomes preserved. No records or real messages created

Evidence output/fawasel-branches-20261118/primary-retry-{preflight,rollback,apply,verify}.json and output/primary-retry-20261119/lease-plan.json

## Checks and publication

Full TypeScript and nine mocked suites passed 2026-11-18T21:56:24.183Z; Node v20.20.2. Covers timing, primary recovery, overrides, backup failure, no duplicate on unknown outcome, owner video, OTP queue/auth admission, private routing, pager, reminders, hospital messages and slow birthday batch completion. Commands, actual timestamps and source/dependency/config hashes in output/primary-retry-20261119/checks.json

Legacy test loaders and old immediate-standby assertions initially failed; updated to load current dependencies and assert the requested primary-first behavior, then all passed. No real test messages or browser inspection

Published source 34a73af8c75e51a173b4e6599ff2e56e27410f40; Vercel dpl_E1sqniPhXei11Whc7mPPdm6tZ8XR READY and both production aliases verified 2026-11-18T22:20:48.368Z. Read-only production login/register HTTP200 and protected worker routes401 verified 2026-11-18T22:20:58.811Z. No jobs claimed or messages sent. Follow-up card-link/birthday budget and full TypeScript passed; evidence followup-checks.json. Initial superseded build was canceled before publication. Root application sources remain untouched; implementation in isolated release worktree

Read-only primary-provider readiness returned authorized/HTTP200 at 2026-11-18T22:03:45.936Z; this is connection state, not a real delivery test

## Update 2026-11-23 (Claude): one minute between attempts for the owner login

The user said the restriction on the primary number ended and asked that the account login messages leave from it again, with the standby only when the system refuses, after three attempts with one minute between them

- Read only at the provider on 2026-11-23: primary `authorized`, first standby `authorized`. Nothing in the code ever pinned the owner login to the standby. It left from the standby because the primary was not connected, so with the primary connected it already leaves from the primary on the first attempt
- Changed: `OWNER_LOGIN_PACING` in `lib/whatsapp/green-api.ts`. The login message an administrator sends and the clips that follow it try the primary at 0, 60 and 120 seconds. The first standby is asked right after the third failure, not a minute later. A failure is a number that is not connected or an explicit refusal (401, 403, 429, 466). A timeout, a 5xx or an unclear acknowledgement is still never repeated and never moved to the standby
- Not changed: verification codes. They leave from the notifications number first, and their fallback keeps thirty seconds between attempts so sign-in never waits three minutes. Every other message keeps its timing
- New guard: `PLATFORM_SEND_BUDGET_MS`, 200 seconds. No request starts later than that, because the claims behind these sends (`admin_claim_brand_welcome`, `claim_owner_companion_guide`) hold a four-minute lease. Usual worst case for the owner login is about 160 seconds. No database change
- Checks: `scripts/check-platform-sender-failover.cjs` 62 (six new: timing at 0, 60, 120 seconds, standby at 120, healthy primary never asks the standby, both numbers down, codes keep thirty seconds, time budget), `check-brand-owner-welcome-server` 35, `check-otp-backup` 83, `check-owner-companion-guides` 23, `check-owner-onboarding` 90, access-only 37, notifications number 57, minimal messages 19, TypeScript, text integrity. Mocked only, no message sent
- Production: commit `b5755ccf` on main, Vercel pending 22:03:09Z to success 22:04:26Z on 2026-11-22 UTC, 77 seconds. Deployment guard check passed before the push. Not yet seen: a real owner login in the provider journal after the deploy
