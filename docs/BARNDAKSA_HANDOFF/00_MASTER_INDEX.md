# Branda current handoff

- POS LAYOUT 2026-10-26T17:52:05.298Z: Cart starts at page top beside the header/catalog and stays sticky with bounded internal scroll on desktop; mobile remains single-column. Cloud-only 44px status control opens sync details and preserves retry/conflict access. Shift start/close/handover/accept, history and pager grouped beside refresh/logout. Node24 TypeScript, text integrity, scoped ESLint, UI37, offline pure regressions and webpack build PASS. IndexedDB adapter test NOT RUN (missing fake-indexeddb); offline engine/storage unchanged. Browser not run under repository policy. Evidence original workspace output/pos-compact-verification.json; release marker pos-layout-20261026 records final deployed SHA/alias verification

Updated 2026-10-26 Asia/Riyadh

Read [current task state](../task-state.md), repository AGENTS.md and actual git status first

## Finance publication

Release marker: release-finance-20261026 in ahmedabumoalla/branda main

Production target: branda-2 / prj_kHe6mtiyO05loZn6PgMOSpjlv4Ow at https://barndaksa.com and https://www.barndaksa.com

The annotated release marker records the exact deployed commit, deployment ID and domain verification after publication; a push alone does not prove deployment

This release combines completed treasury, cash-shift custody/difference handling, cashier access recovery, customer/pager/loyalty integration, receipt/VAT design, offline sales/sync and printer settings

The existing production OTP queue hotfix is preserved. Database migrations are already applied; do not rerun old cleanup or draft migration scripts

## Operating documents

- [Finance operating guide](BRANDA_FINANCE.md)
- [Treasury accounts, fees and attachments](TREASURY_MANAGEMENT.md)
- [Cashier printer service setup](../../desktop/finance-printer/README.md)
- [Madar integration proposal](MONEY_INTEGRATION.md) — planning only
- [Arabic Madar coordination brief](MADAR_INTEGRATION_BRIEF_AR.md) — planning only

## Remaining work and verification limits

- Install/pair and physically test each cashier's thermal printer using the printer setup section
- First online authenticated visit is required for offline preparation; retain pending sales until sync completes
- Expanded supplier-purchase/shift analytics draft is excluded pending reconciliation with deployed drawer/custody schema
- Original dirty workspace and unrelated menu/loyalty drafts remain preserved locally
- Existing legacy source-security findings remain documented in task state; relevant finance access/tenant tests and production build are separate verified checks

Use git history for earlier releases and root output/finance-publication-*.json for local verification evidence
