# Brand directory Excel export

## Delivered behavior

- Admin brand directory has an export button for all brands, independent of current search, filters and the twelve-row page
- Fresh server-side XLSX table with five columns: brand name, Riyadh join date, account status, subscription state and remaining days
- Branda colors, RTL worksheet, actual date/numeric cells, sortable table filters, frozen headers and printable landscape layout
- Remaining partial days round upward with an explicit note; prepared trials, future starts, indefinite terms, expired/cancelled subscriptions and missing plans have distinct truthful values
- Current service selection is respected: valid active subscriptions before trials, newest assignment first; expired later history never hides an older currently valid assignment
- Downloads use loading/disabled feedback, meaningful errors, MIME/filename validation and delayed object URL cleanup

## Authorization and data

- GET `/api/admin/brands/export` requires an authenticated active platform administrator, private/no-store response headers and server-only workbook generation
- Minimal authenticated DAL reads all nondeleted brands and their subscriptions through stable keyset pagination; no customer/owner contact details or financial figures are exported
- No database migration, business-data mutation, message or new session
- ExcelJS 4.4.0 is pinned server-side; customer brand names remain literal strings, never formulas

## Validation

- Node 24.19.0 release checks completed 2026-11-06T19:58:05.818Z: text integrity, TypeScript, directory UI 15 groups, DAL 10 groups, XLSX/route 17 groups, scoped ESLint and production webpack build passed
- Final check inputs remained unchanged; dependency/config/source identities and command logs are in `output/brand-directory-export/release-checks.json`
- Live read-only verification completed 2026-11-06T19:58:15.090Z: 33 brands and 65 subscriptions, authenticated administrator RLS reads matched privileged read hashes; actual DAL queries and real workbook readback passed in memory
- Live verification used read-only SQL authorization checks and a privileged transport with an explicit authorization stub for DAL query validation, not an authenticated HTTP download; see `output/brand-directory-export/live-data-checks.json`
- No browser inspection required; UI behavior, actual XLSX package and API boundaries tested directly
- Exact GitHub/Vercel production commit, aliases and anonymous endpoint protection are recorded by `output/brand-directory-export/publication.json`
