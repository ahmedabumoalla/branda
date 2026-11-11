# Full finance and staff workspace release - 2026-11-11

## Release state

User explicitly authorized publishing the completed local finance update together with pager/loyalty and updating GitHub, Vercel and handoff. This supersedes the earlier finance-local-only restriction. Prepared on production main 4251fc78e60064ccf304cccfd55b8e8e6559d334 in an isolated worktree. Publication verification follows below when the exact deployment is ready

## Delivered scope

- All completed canonical finance changes: company invoices and drafts, customer accounts and credit, last sale prices, invoice list/details, quotations, payment corrections, journal details/activity, stock and installments, invoice settings and advanced tax/FX/discount/status tools, immutable PDF output and explicitly requested document delivery
- Existing role, tenant and pilot gates remain authoritative. This publishes the completed implementation; it does not claim completion of the historical 131-item ERP backlog or ten sales-settings sections awaiting user specifications
- Compact pager with ready-orders dialog, call/collected actions, visible return to loyalty and brand colors
- Loyalty/pager screens retained in per-tab memory. Switching restores state without a full page loader; unchanged background queue data preserves references. Existing active polling and quiet refresh remain to catch new/changed orders. Session change invalidates the cached workspace, and preload enforces service permissions
- Jamila account logo, gray/cream identity, empty menu and existing loyalty terms preserved

## Verification

Executed 2026-11-11 in the isolated release on Node 24.19.0: TypeScript noEmit, production Next webpack build, 22 focused test/check jobs and scoped ESLint passed (zero lint errors, four warnings). Includes 164 finance navigation assertions, invoice/payment/customer/settings behavior, 18 retained-workspace checks, 57 pager UI checks, 16 customer-summary checks, 28 staff authorization checks, 26 Jamila and 776 signature-menu assertions. Exact input hashes and commands: FULL_RELEASE_20261111_CHECKS.json

The generic security source gate still reports three pre-existing findings: historical migration search_path and two customer-profile RPC requirements. All three affected files and the gate are byte-equivalent in Git to the production base. They remain unresolved; this is not an all-security-checks-pass claim

15 nonempty finance migration files are published from the canonical implementation; an abandoned zero-byte local migration is excluded. Prior canonical records document their application and rollback tests. No migration was reapplied or customer transaction/message created for this release. Fresh authenticated OpenAPI metadata returned HTTP 200 and exposed all 25 referenced public functions. Management CLI history/body recheck returned 403 while creating its login role, so exact installed-body/RLS verification is reused from prior evidence, not claimed as fresh. Latest advanced-settings database proof is dated 2026-11-11T00:04:08Z, migration SHA256 7c2a4544b03d3656c8ef938d57b7d1ae264a0811bb1d8d205cfb485972df52b0

No browser or physical companion-device test was performed. Production smoke checks are read-only; authenticated financial operations are covered by local mocked behavior tests and prior installed database rollback checks

## Continuity

Production target is GitHub main, Vercel branda-2, barndaksa.com and www.barndaksa.com. Root dirty workspace and canonical finance workspace are preserved. Future work must start from the published main commit, not the older root branch. Application rollback target is 4251fc78e60064ccf304cccfd55b8e8e6559d334; do not roll back financial data or replay already-installed migrations
