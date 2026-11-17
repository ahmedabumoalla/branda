# Per-package service and section controls

- Branches now appears as an independent editable package service
- Finance exposes31navigation sections immediately, with search and group/all toggles
- Choices persist per package; combined subscriptions retain union semantics
- Account settings/subscription recovery remain visible; employee permissions remain independent
- Finance department settings control navigation visibility through the existing module system
- Menu branches require both menu and branch entitlement in page, action and database management RPC
- Catalog defaults preserve current menu-branch access; subscriptions, branches, customers and pricing unchanged

## Verification

Isolated release full TypeScript and scoped original text integrity passed
Actual UI handler/save/reload/search/bulk selection and finance sidebar checks passed
34PostgreSQL branch behavior checks and25navigation checks passed, branch-source guards passed
Legacy navigation harness updated for existing inventory imports; no production code changes for harness failure
Database rollback compilation and apply asserted subscription/branch/unrelated-plan preservation
Exact migration history verified2026-11-17T21:40:04.877Z
Evidence and input hashes: output/plan-options-20261118/release-checks.json and {compile,apply,verify}.json
No browser, live test messages or retained test records

## Publication

Application04fcc1596848e39b5e8558f5de09a59e33ed59c3, Verceldpl_AFKo49PPbCPzXwpKbkRxxppLi9FX READY, both aliases exact deployment HTTP200 verified2026-11-17T21:49:36.682Z; follow-up docs only

## Workspace

Authoritative source: .codex-tmp/release-branches-aldeem-20261117
Root-source mirror failed its preflight before writes due to existing divergent work; preserved intentionally
Both task records and handoff indexes updated

## Rollback

Use a new forward migration restoring the prior service wrapper and branch management guard
Do not remove branch/catalog/subscription records
Feature defaults may remain for compatibility; do not overwrite subsequent administrator choices
