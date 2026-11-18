# Loyalty branches rollout and pager navigation — 2026-11-18

Published974352d4f94c340ee352edfe4f28355090795e7f, Verceldpl_J4W2sB5vgmiuezAJA5rVyuNPsbBq READY; both aliases and HTTP verified2026-11-18T02:08:25Z

- All active loyalty accounts, existing/new, receive Fawasel-style branches inside loyalty
- Existing Loco brand-9a8c97305195 and Wahed brand-3c0437f1733a workflows, branch entitlements and separate menu navigation are preserved
- Ordinary loyalty/menu accounts use the nested entry instead of the duplicate separate branch navigation; non-loyalty menu accounts unchanged
- Owner DAL, SQL owner guards, branch enrollment/issuer and wallet locations use the same exception policy
- Canonical card/balance/stamps and immutable original branch retained across branches; no customer balance splitting
- No brand-specific artwork copied from Fawasel; each branch uses its own saved identity and uploaded logo
- Aldeem shell renders branch page directly without overview redirect
- Pager and pager reviews removed from brand sidebar; pager link removed from both loyalty cashier renderers; existing finance POS pager remains intact
- Database migration changes only3functions, no records/plan/trial/subscription edits and no new privileges or RLS changes
- Live rollback tests: new loyalty-only scope add/edit branch, stale revision, cashier binding, enrollment, shared balance/immutable origin, foreign branch and anonymous rejection; all active-owner entitlement projections checked; protected Loco/Wahed branch snapshot unchanged, no retained fixtures
- First rollback test had a fixture-only SQL alias/record collision; corrected and rerun successfully before application
- Mandatory full TypeScript and original scoped text, rollout navigation/actual sidebar/owner guard tests, wallet locations, guide and18staff workspace checks passed
- No real messages or browser/device proximity tests; notifications remain subject to wallet/device controls
- Guide4e4cf110 live verification: exact deployment on both domains, home200, unauthenticated API inline/download403 private/no-store and public asset404
- Authoritative source is isolated release worktree; unrelated root work preserved
