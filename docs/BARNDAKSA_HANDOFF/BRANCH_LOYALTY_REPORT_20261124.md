# Branch loyalty reporting - local implementation

User requested all branched brands, including Fawasel, show issuance separately from stamps,
count cashier-created cards before wallet download, and provide branch customer details and
a central detailed export. Source is in C:/Projects/branda-wallet-links-20261124 on main base
c8b5d0e384f74d1cc8765b7829edac5932032c04. No deployment or remote migration was performed.

## Implemented behavior

- Cashier operations add distinct issue/download/save-link kinds, branch filters and branch comparison
- Branch details links exist on loyalty branch and menu branch pages
- /dashboard/loyalty/branches/[branchId]/customers shows customer cards, original issuing branch,
  employees, activity counts, latest activity and elapsed minutes/hours/days
- /api/loyalty/branches/export produces five RTL XLSX sheets: summary, branches, customers/cards,
  staff and indicator definitions; all pages are fetched with one time cutoff and checked for drift
- Scope and permissions derive from the authenticated owner/manager/platform-admin context;
  no caller-supplied tenant or privileged customer read bypasses database authorization
- Date filters scope the event timestamp, search scopes totals and rows together, and last-activity
  age is measured at the actual report time; the operation log branch comparison follows dates only
- New activity stores its execution branch. Issuance retains the original card branch, including QR
  registration. Visitors from another issuing branch appear under the branch of their operations
- Historical operations without a branch snapshot remain unassigned; current employee assignment
  is never used to invent a historical branch. Staff includes current assignments and period actors
- Apple downloadedCards counts distinct cards with download or installation history; installation
  has a separate subset counter. Google save-link generation is separate and is not claimed as saved
- A saved history entry does not prove the card is still installed now. No device presence is inferred

## Database activation required

20261124161000_loyalty_branch_reporting.sql adds immutable private card-issuance history,
future branch snapshots, constrained cashier provenance and two authenticated read RPCs.
The existing activity RPC and financial/loyalty ledgers remain unchanged.
Read-only production checks verified the exact function patch anchor and actual columns,
including loyalty_cards.issued_at; existing 1745 cards were observed during the preflight.
The migration has not been applied remotely. It must be activated before publishing this UI.

## Verification on 2026-11-24

Node v20.20.2 and current lockfile, changed source including the pending eight-digit reset-password
change. Tests run against actual local source with isolated providers/database fixtures:

- check-loyalty-branch-report-db.mjs: 60 PostgreSQL checks, issuance before download, deduplication,
  branch transfer/history/visitor handling, filters, 1004-card pagination, rollback and authorization
- check-loyalty-branch-report.cjs: session-derived tenant, roles, privacy allowlist, dates, 1001-card
  export pagination, consistent cutoff, drift rejection and safe errors
- check-loyalty-branch-report-ui.cjs: SSR states, branch links/filters, honest wallet labels and age
- check-loyalty-branch-excel.cjs: actual 1001-customer workbook round-trip, five sheets, formula safety,
  typed dates, age boundaries, secret exclusion, route scope and private error statuses
- check-loyalty-activity.mjs: 101 passed; updated old fixtures for v2 fields and previously added
  finance-session guards/current-account RPC/redeemed-notice callback; guard denial now covered
- Text integrity, diff review and complete production build with TypeScript passed
- Build: 81.768 seconds, deployment-size guard 274 routes / 6838 MB total / 161 MB largest / 0 problems
- Page-weight guard: 155 pages / 1034 KB largest / 0 problems; no guard limits or hooks changed

Evidence: temp/branch-report-build.log, temp/branch-activity-check.log, temp/branch-report-verification.json
No browser inspection, remote data mutation, live test messages or retained test customer records.
Previous eight-digit reset-password change remains local and pending publication too.

Publication explicitly authorized on 2026-11-24; full linked-database rollback rehearsal passed with real Fawasel owner reads and cross-tenant/anonymous denial before activation
