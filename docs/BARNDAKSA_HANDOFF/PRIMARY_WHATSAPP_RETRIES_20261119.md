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
