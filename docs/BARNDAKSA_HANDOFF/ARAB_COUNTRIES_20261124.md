# Arab countries rollout

User explicitly authorized source and database publication on 2026-11-24 after verification

- 22 countries: SA AE BH KW OM QA YE JO PS LB SY IQ EG SD LY TN DZ MA MR SO DJ KM
- Shared mobile rules derive from Google libphonenumber; Saudi validation remains unchanged
- Accounts choose a country or infer it from a complete international owner number; explicit mismatches are rejected
- Staff may use another supported international number; local staff numbers use the account country
- Loyalty customer local numbers use their brand's country; existing country isolation remains enforced
- Brand directory, loyalty/pager customer directories and operations support country filters including counts, pagination and exports
- Admin directory handles more than 1000 brands through stable paginated reads
- Existing 84 brands were verified Saudi; no brand, phone or subscription backfill is performed
- Self-signup uses loyalty package pro with existing 30-day free period; guide precedes rewards in navigation
- Message routing, access-only policy, fees, currencies and existing financial ledgers are unchanged

## Verification

Node v20.20.2, current lockfile; actual-source tests: phone1439, isolated PostgreSQL1318,
owner117, admin63, staffOTP47, cashier64, focused staff26, country read/count/export tests,
customer SQL166, pager60, operations SQL85, WhatsApp access-only81, original invoice-points
and read-outbox19 regressions. TypeScript and text integrity passed

Actual linked database full rollback checks passed for all22 countries: self-signup,
admin creation with and without explicit country, foreign staff and local customer/card
creation; invalid country tampering rejected; all fixtures rolled back. Existing brands
and subscriptions unchanged. Admin filter rollback checks passed active-admin reads,
owner/anonymous denial, unchanged Saudi results and empty results for21other countries

Local production build passed both guards after moving country labels away from server
validation imports; no budgets changed. Initial build stopped on a dependency junction,
then the speed guard caught admin/cafes growth; both causes were fixed before publication

Remote migrations, in order:

1. 20261124105436_self_signup_loyalty_package
2. 20261124124949_arab_phone_countries
3. 20261124125215_admin_brand_customer_country_filter

Evidence in Windows TEMP: arab-phone-full-rehearsal-result.json,
arab-admin-country-rehearsal-result.json, arab-country-build.log, arab-countries-apply.sql
and arab-phone-security-baseline.json. Existing18routine permission/security hash:
08e9558111f8789008b90ec937792f87

No real test messages, retained customer fixtures or browser inspection. Provider/device
delivery in each country is not claimed; provider requests were mocked in tests

## Published verification 2026-11-24

- main c8b5d0e384f74d1cc8765b7829edac5932032c04; Vercel dpl_9EaQShHbenjt5Z162sJcqThRbLyx READY; both production aliases verified
- Three migrations above applied atomically with schema history; all source MD5 values verified after activation; 84 brands remain SA, subscriptions and existing routine security unchanged
- Production checks at 13:18:12Z: register200/22country options/loyalty package, cashier loyalty200/22options, login200/22country metadata in served chunks, existing Shibr loyalty200, both unauthenticated filtered admin exports401
- Owner login country field is conditional on numeric identity; base cashier route is an access picker; probes were corrected to check these actual flows
- Legacy login test has two stale raw-Saudi expectations; a temporary copy updated only those expected canonical values passed all13 SSR/form/recovery/CSS/contrast checks
- Production size guard ran twice:272routes,10346MB total,188MB largest,0problems; page weight154pages,1034KB largest,0problems; no guard limits changed
- Live speed watch12paths all200,135-1764ms; wiring workflow45400813176 passed; Lighthouse45400813188 still running at final check, no passed result claimed
- GitHub Vercel status pending13:11:09Z to success13:13:39Z =150seconds; Vercel building-to-ready148.076seconds
- Evidence: TEMP/arab-countries-release-20261124/deployment.json, database-verified.json, production-checks.json
- This publication supersedes earlier local-only/pending migration entries for this scoped task; local server3019 has not been synchronized with all country changes