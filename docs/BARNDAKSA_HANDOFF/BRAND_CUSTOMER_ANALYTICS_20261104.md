# Brand customer analytics and branded PDF

## Delivery

- Admin section: `/admin/brand-analytics`, linked as تحليلات العلامات التجارية
- Each brand has customer/card/wallet counts, successful stamp and redemption dates, inactive customers with phone numbers, repeat-visit cadence, hourly/day peaks and issuance-cohort retention
- Select a brand and choose تقرير العلامة الكامل PDF to download the complete Branda report, including customers outside the current search/page
- Filters: 7/30/90/365 calendar days for visits/peaks, customer search, inactivity/regular/returning/new/no-card segments and server pagination
- Publication: release checks complete; exact production commit and deployment verification recorded after publication

## Established definitions

- Membership counts deduplicate a valid trusted Saudi phone within each brand, then account/profile fallback; overview totals count memberships across brands
- Visits require a successful stamp or actual reward redemption; all qualifying actions on one Riyadh calendar day count as one visit, timed at the first action for peaks
- Active: qualifying activity within 10 days; inactive: strictly more than 10 days without either action, anchored to issuance/registration if never visited; new cards are excluded
- Regular: at least three distinct visit days, average interval at most four days, latest visit within 10 days
- Retention is cumulative first return on a later local day within 7/14/30 days of first issuance; denominators include only customers who completed each measurement window
- Apple generated/downloaded pass, Google generated save link and confirmed Apple device registration remain distinct; none of the first two proves installation
- Event history freezes at the report timestamp across export pages; current stamp balances/lifetime counters/device counts remain current snapshots
- Historical records may predate audit recording start; missing historical events do not prove no activity

## Authorization and database

- Server session authorization plus every RPC requires an active `platform_admin`; private schema/helpers denied to API roles, anonymous/owner/customer/suspended-admin/service-role access rejected
- Existing engagement analytics RPC remains unchanged
- Applied migration `20261104104817_admin_brand_analytics.sql`, normalized source/history MD5 `999bdd64b6632b16bda865d484d8f2e4`
- Production check at 2026-11-04T11:01:53Z: 32 brands, 483 unique memberships within brands, largest brand219; overview762ms, detail175ms
- No customer, stamp, reward or wallet changes and no messages or passes issued

## Verification

- Root/release text integrity and TypeScript, scoped ESLint, 46 data/auth/export tests, 62 UI interaction/SSR tests, 77 SQL tests and existing engagement analytics regression passed
- Actual production rollback authorization/DTO/aggregate reconciliation and exact applied migration history verified
- Branded PDF synthetic fixture: all63 customers,32pages, correct pagination/phones, original logo on every page, no text overflow; Arabic layout visually inspected as a standalone PDF
- Production Node24 Next build and exact GitHub/Vercel/alias verification recorded in `output/brand-customer-analytics`
- Anonymous HTTP route remains protected; report font/logo assets checked against exact local bytes
- No application browser used under the repository policy

## Evidence and next action

- `output/brand-customer-analytics/{local,release,build}-checks.json`: commands, runtime and input hashes
- `output/brand-customer-analytics/live-application.json`: exact SQL history, real roles and no business writes
- `output/brand-analytics/pdf/{verification,layout-verification}.json`: synthetic PDF and layout evidence
- `output/brand-customer-analytics/publication.json`: exact production commit/deployment/aliases/runtime
- Next: use the admin page to select a brand and download its report; no further data migration or customer action is required
