# Multiple brand plans with one expiry

Implemented 2026-11-07 Riyadh for the administrator brand subscription dialog

## Behavior

- Select and activate several additional plans together; existing assigned plans remain
- One expiry edit updates every standing subscription whose plan remains enabled; archived expired/cancelled records remain history
- Prepared trials start together when login details are delivered; adding a plan does not prematurely start that clock
- Existing inconsistent dates are shown honestly until an explicit activation or expiry edit unifies them; deployment does not rewrite client subscriptions
- Actual feature access uses the union of currently valid plans; scheduled/date-expired assignments are separately manageable
- Paid activation and renewal preserve existing paid periods, financial snapshots and ledger behavior

## Implementation and validation

The server validates the complete subscription revision and selected plans. Active-admin-only atomic RPCs lock the brand, subscriptions and plans. Payment activation is service-role-only. The existing bank approval function gains a guarded plan lock before its active-plan check

Migration `20261106214239_shared_brand_subscription_deadline.sql` was applied and read back with MD5 `8570bdc75ed541c93e39eda013397190`. Live rollback/application preserved nine business/financial table hashes and existing RLS/ACLs. The actual DAL schema and summaries parsed all 34 brands and 66 subscriptions without retaining private payloads

Node 24.19.0 release text integrity, TypeScript, targeted summary/DAL/deadline/UI/payment/Excel/access/clock checks, scoped ESLint and an isolated production build passed. SQL fixtures have 72 assertions. Evidence and exact input/dependency identities are in `output/shared-subscriptions/{release-checks,final-checks,db-checks,applied,live-state-shape}.json`

Final GitHub commit, Vercel ready deployment, both production aliases and live authorization checks are recorded in `output/shared-subscriptions/publication.json` after publication verification

## Local runtime

The updated isolated build runs at `http://localhost:3017/admin/cafes`, PID 5920, directory `C:/Projects/branda-local-runtime-20261107-multi-plan`. The prior runtime remains available on port 3016, PID 23568. Do not stop either or build over its `.next` during future release preparation; dependencies are junctions to the release checkout

## Verification limits

No real client plan activation, payment, invoice email, welcome message or browser session was used for testing. Genuine two-session database races were not exercised; lock ordering/NOWAIT handling were reviewed, and revision/replay behavior was tested in transaction fixtures. Existing invoice mail remains a best-effort post-commit effect
