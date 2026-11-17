# One-month signup and owner-welcome trials

User approved actual30days for new eligible accounts on2026-11-18

- Exact plans: trial (-), menu (starter), loyalty (pro), menu+loyalty (plan-b523d348)
- Future public phone-verified registration reads30days from configured plan
- Admin prepared accounts start their clock only after provider acknowledgement
- v2 claim returns server-derived per-plan terms and freezes a private policy for receipt processing
- Mixed accounts explicitly distinguish30-day eligible and7-day other plans in the welcome
- Existing active/started/paid subscriptions are never extended or reset by this release
- Older deployed clients/attempts retain7-day message/receipt consistency during rollout
- No changes to paid prices, sender selection, uncertain delivery or duplicate-send guards

## Verification

Root and isolated release checks passed:18mocked sender/server,12UI,90PostgreSQL handoff,74PostgreSQL signup,41onboarding server/SSR
Full TypeScript and original text-integrity checks passed for both worktrees
Initial added signup fixture exceeded the test IP rate limit; fixed fixture isolation without weakening production limits
Input hashes, runtime, actual timestamps and command outputs: output/trial-month-20261118/{root,release}-checks.json
Live rollback compilation, preservation assertions, migration application and exact history verification: {compile,apply,verify}.json
Database verification: 2026-11-17T21:25:55.684Z
No browser, real test messages or live test accounts

## Release

Application: 210864037ca3f825d4d1988569a0d1387c95c347
Vercel: dpl_BLCwJ2VoLJSFh59CBR2gNjXpfsk3 READY
Both domain aliases and returned HTML match exact deployment, HTTP200: 2026-11-17T21:32:40.993Z
Evidence: production-http.json
Follow-up commit: documentation only

## Rollback

Use a new forward migration, never rewrite applied history
Wait for v2 in-flight receipts before restoring old claim/finish functions; retain nullable private policy column
Restore trial_days7 for '-' and0 for the other three plans only if policy is revoked
Never shorten or rewrite already-created subscription clocks
