# Azo brand management — 2026-11-18

Account, two independent loyalty subscriptions and logos created; source checked, publication pending

- One Auth owner and one management account named ادارة براندات Azo, with restaurant azo-bait-ezzo and coffee azo-house-cafe as separate cafe tenants
- Both use pro loyalty-only,30-day trial, no menu/offers/finance; no charge or messages
- Supplied restaurant and coffee logos normalized with the existing logo pipeline and uploaded into their separate cafe paths
- Native POST brand selector, server ownership/RLS validation, user-bound HttpOnly selection cookie, full navigation and stale-tab guard; existing accounts skip the new RPC
- Existing brand/customer/card/reward/message/branch ledgers remain cafe-scoped; no combined balances or invented customers
- Loyalty reward rules and branch locations have not been invented or configured; owner configures each brand before customer use
- Migration20261118015516 applied02:01:52Z; account provisioned02:03:59Z; actual login, two memberships,30-day subscriptions, RLS and exact logo downloads passed
- Actual authenticated pre-release HTTP on production02:13:18Z and localhost02:13:53Z showed loyalty-only navigation with no menu/offers; user screenshot mismatch not reproduced, no entitlement rewrites
- Security advisors returned no affected findings; new tables use SELECT-only owner RLS and invoker function
- Full release TypeScript passed after final source edit; focused management/login/cache tests and18staff workspace checks passed; original scoped text check recorded in verification manifest
- Existing login-alias test lacked the previously added staff-landing stub; repaired harness without weakening role assertions and added managed-login redirect coverage
- No browser, device proximity delivery or real message tests; no retained synthetic financial records
- Evidence output/azo-management-20261118 and output/fawasel-branches-20261118/azo-*.json; credentials excluded
