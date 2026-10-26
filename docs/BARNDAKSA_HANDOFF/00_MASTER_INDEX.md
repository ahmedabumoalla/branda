# Branda current handoff

- LOYALTY PHONE LOOKUP 2026-10-26T21:18:40.523Z: cashier can select phone or existing barcode/card mode for stamps/rewards. Exact normalized Saudi phone in authenticated brand only; active profile/card checks, existing audited preview and explicit confirmation, exact reward pinning and uncertain request id reuse preserved. No enrollment, stamps or messages from lookup. No schema change. Phone handler/security tests, scanner regressions, root/release types/text, scoped lint, live no-data read contracts and production build PASS. Browser not run. Evidence output/loyalty-phone-verification.json; tag loyalty-phone-20261027 identifies final publication

- LOYALTY HEADER 2026-10-26T21:10:52.399Z: single-row brand/language/logout header, screen-reader-only marketing heading, greeting below, 44px accessible logout icon on narrow containers. Scan/stamp/reward behavior unchanged. Scanner regression, root/release types/text, scoped lint and production build PASS. Browser not run per repository policy. Evidence output/loyalty-header-verification.json. Publication tag loyalty-header-20261027 will identify verified production commit. Prior shift1 closure completed at 2026-10-26 23:56:21 Riyadh, count and variance zero; supersedes historical pending-closure notes

- LOYALTY CASHIER COMPACT 2026-10-26T21:01:58.472Z: scoped compact header/scanner, 44px controls, container-aware single column and collapsible optional guidance. Scan/stamp/reward behavior unchanged. Scanner regression, root/release types/text, scoped lint and production build PASS. Browser not run per repository policy. Evidence output/loyalty-compact-verification.json. Publication tag loyalty-compact-20261027 will identify verified production commit. Prior shift1 closure completed at 2026-10-26 23:56:21 Riyadh, count and variance zero; supersedes historical pending-closure notes

- EMPTY SHIFT CLOSE 2026-10-26T20:54:19.241Z: explicit zero count now uses no_cash, no recipient or fictitious handover. Positive cash still requires custody. Migration 20261026234500 applied and history hash verified. SQL189, handover UI11, root/release TypeScript/text, scoped lint and webpack PASS. User requested test-cafe shift1 closure and confirmed actual cash zero; final closure pending UI execution/verification. Existing shift2 handover unchanged. Evidence output/empty-shift-close-verification.json; tag empty-shift-close-20261026 will record verified deployment

- SHIFT SUPERVISION 2026-10-26T20:27:34.821Z: all shift history paginated/searchable with live shifts first; green fresh and clear queue, yellow missing/stale heartbeat (90s), pending queue or administrative pause, red closed. Dashboard details support reasoned pause/resume and counted administrative closure/custody with immutable actor audit. Closed shifts cannot reopen; unsynced late invoices stay on device for review, paused queues retry after resume. Device changes reach offline cashiers only after reconnection. Migrations 20261026213000/20261026214500 applied with exact source hashes; no real financial records changed. SQL184, monitor UI, finance UI37, pure offline regressions, root/release types/text, scoped lint and webpack build PASS. IndexedDB adapter not run (missing fake-indexeddb). Evidence output/shift-supervision-verification.json; release marker shift-supervision-20261026 records exact publication verification

- POS FIXED CONTROLS 2026-10-26T20:12:48.202Z: compact wrapped title/shift actions, full-width search with inline warehouse, and categories remain above independent scrolling catalog. Cart retains separate scroll/actions. Narrow screens retain stacked cart with sticky catalog controls. Root/release TypeScript/text, UI37, scoped lint and webpack build PASS on Node24.21.0; source responsive review, no browser per policy. Evidence root output/pos-fixed-controls-verification.json; marker pos-fixed-controls-20261026 identifies final publication after verification

- CASH DRAWERS AND LIMITS 2026-10-26T20:02:27.064Z: migrations 20261026194000 and 20261026201000 applied to production Supabase via authenticated SQL Editor; exact history hashes verified. Concurrent shifts use separate device-selected cash drawers. Cash allowance is THREE total undeleted cash accounts INCLUDING cashier drawers and archived cash; existing excess retained, further creation blocked. Treasury offers WhatsApp increase request to 0508424401 and confirmed empty-account deletion (audit tombstone, zero-only opening allowed, real movements/shifts/reconciliation/attachments/links prohibited, primary/system safes protected). SQL146/UI34/handoverUI10/access, root+release TypeScript/text, scoped lint and webpack build PASS on Node24.21.0. Production release marker cash-lifecycle-20261026 will identify exact deployed SHA/aliases after verification. Evidence original workspace output/cash-lifecycle-verification.json


- CART FIT 2026-10-26T18:43:56.405Z: POS page inset8px, viewport-bounded flex cart with fixed header/action footer and scrolling body. Reduced empty/summary/field/payment spacing, paired account/customer selectors; total remains32px and controls at least44px. Original root scoped changes mirrored. Node24 TypeScript/text/scoped ESLint/UI37 and webpack build PASS; source responsive review, no browser per policy. Evidence output/pos-cart-fit-verification.json; pos-cart-fit-20261026 tag records publication verification

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
