# Owner handoff uses selected plans - 2026-11-11

User rule: choose any package(s), then send owner credentials; the same prepared package(s) start exactly seven days at provider acceptance, without keeping a separate trial package selected. Existing running paid subscriptions keep their terms

Root cause reproduced on Forn Altaboon: selected pro loyalty row was prepared, but the handoff still required the original cancelled trial subscription ID. Claim now uses current eligible selections; receipt starts all still-selected prepared rows. Removing all packages before adding a replacement preserves unsent onboarding intent. Cancelled/inactive/paid/future/expired rows are not revived or shortened; finance monthly snapshot constraints retained. Shared deadline propagation skips only this prepared-to-delivered transition because receipt explicitly updates its whole eligible group

Service-only functions keep administrator/owner/receipt guards and consistent locks. Provider failures do not start a clock; repeated acknowledgement does not resend or extend. UI explains selected packages and clears stale errors on manual status refresh. Creation defaults remain unchanged; this fix concerns selection and delivery

Migration20261111165826 applied after exact live function prerequisite assertions. Actual brand rollback before/after installation proves selected pro, no claim-time clock, exactly seven days, cancelled row identical and receipt idempotency. No real message sent or retained business change. Function bodies/history/private grants verified; security advisors200->200 unchanged. An initial root wrapper hash calculated from exported Unicode definition differed; replaced with database-calculated hashes and reran successfully, preserving prerequisite guards

Validation:50 selected-plan SQL scenarios,73 shared subscription checks,12 UI states and9 server/provider mocks PASS. Node24.22.1 TypeScript/text/scoped lint and production webpack build PASS, zero scoped lint warnings. No browser or actual outbound delivery. Evidence and source identities in matching CHECKS.json; local detailed logs .barndaksa-backups/selected-plan-welcome

Deployment pending exact production commit and alias verification; final state recorded in current task-state and matching DEPLOYMENT.json
