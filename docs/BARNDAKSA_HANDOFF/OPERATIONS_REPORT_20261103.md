# Operations report - 2026-11-03

## Scope
- /admin/operations now uses a fixed-width six-column table with overview, access, loyalty, campaigns and orders views
- Compact filters preserve search, dates, subscription, feature and numeric conditions; sorting, pagination and PDF cover matching results
- Clicking a brand opens a modal with subscription/features, all26 metrics, last visit and links to message/campaign histories
- Mobile rows reflow within page width; dialog uses viewport limits and native keyboard/focus behavior
- Seven added metrics: dashboard entries, cashier logins, app-install clicks and accepted/rejected/completed/not-completed order actions

## Counting rules
- Dashboard entries use existing brand_login events deduplicated within60seconds; this is not a password-authentication count
- Cashier logins use successful canonical cashier activity records including owner entry
- Order actions are state changes, not unique sales; wallet counts are requests, not proof of installation; provider acceptance is not proof of WhatsApp delivery
- Failed report RPCs remain errors, never silently become zero counts; current subscription/features remain current rather than historical

## Database
- Migration20261103101343_operations_access_metrics.sql applied to kpguwjfkkylrdlvzeezz
- Security-definer RPC has empty search_path, active platform-admin check, authenticated-only execute and Riyadh inclusive-day boundaries
- Live rollback verification2026-11-03T10:49:55.988922Z: anonymous/non-admin denied, all seven metrics equal source records for all-time and today across all nondeleted brands; invalid ranges denied
- Exact migration source/history MD5: b34618652fc2c383489297a47a8263da

## Verification
- Root and release: npx tsc --noEmit; node scripts/check-text-integrity.mjs; scoped ESLint PASS
- node scripts/check-operations-report-ui.mjs PASS: table columns/25-row pagination, modal metrics, view switches, filters, stale responses and histories
- node scripts/check-operations-report-db.mjs PASS85 assertions including permissions, boundaries and repeated migration
- node scripts/check-operations-report-pdf.mjs PASS26 metrics/31 brands/64 pages
- Release: npx --yes --package=node@24 node node_modules/next/dist/bin/next build PASS, Next16.3.8
- Inputs and runtime/config identities: output/operations-report/checks.json; live proof: live-database.json
- No browser, physical-device or live customer-message tests; no customer operations created

## Publication
- Scoped release branch feat/barber55-identity-20261028 pushes HEAD:main
- Published and verified 2026-11-03T11:03:20.551Z: GitHub main 10d9f4f0ca26c0790f91db465f063fa80cad11a1 matches Vercel dpl_BDADCiMVMkaes3RwsLpLMMHTG5xS READY on both production aliases; anonymous report remains null with access error.
- Evidence: output/operations-report/publication.json; documentation-only follow-up does not change the tested implementation
