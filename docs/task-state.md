# Current task state

- POS FIXED CONTROLS 2026-10-26T20:12:48.202Z: compact wrapped title/shift actions, full-width search with inline warehouse, and categories remain above independent scrolling catalog. Cart retains separate scroll/actions. Narrow screens retain stacked cart with sticky catalog controls. Root/release TypeScript/text, UI37, scoped lint and webpack build PASS on Node24.21.0; source responsive review, no browser per policy. Evidence root output/pos-fixed-controls-verification.json; marker pos-fixed-controls-20261026 identifies final publication after verification

- CASH DRAWERS AND LIMITS 2026-10-26T20:02:27.064Z: migrations 20261026194000 and 20261026201000 applied to production Supabase via authenticated SQL Editor; exact history hashes verified. Concurrent shifts use separate device-selected cash drawers. Cash allowance is THREE total undeleted cash accounts INCLUDING cashier drawers and archived cash; existing excess retained, further creation blocked. Treasury offers WhatsApp increase request to 0508424401 and confirmed empty-account deletion (audit tombstone, zero-only opening allowed, real movements/shifts/reconciliation/attachments/links prohibited, primary/system safes protected). SQL146/UI34/handoverUI10/access, root+release TypeScript/text, scoped lint and webpack build PASS on Node24.21.0. Production release marker cash-lifecycle-20261026 will identify exact deployed SHA/aliases after verification. Evidence original workspace output/cash-lifecycle-verification.json


- POS sync placement 2026-10-26: compact cloud moved from the header toolbar to below the cart receipt actions. Sale guards and sync behavior unchanged. Root/release TypeScript and text integrity plus finance UI 37 groups passed on Node 24.21.0. Production deployment evidence is recorded in the working handoff after exact commit/alias verification

- CART FIT 2026-10-26T18:43:56.405Z: POS page inset8px, viewport-bounded flex cart with fixed header/action footer and scrolling body. Reduced empty/summary/field/payment spacing, paired account/customer selectors; total remains32px and controls at least44px. Original root scoped changes mirrored. Node24 TypeScript/text/scoped ESLint/UI37 and webpack build PASS; source responsive review, no browser per policy. Evidence output/pos-cart-fit-verification.json; pos-cart-fit-20261026 tag records publication verification

- POS LAYOUT 2026-10-26T17:52:05.298Z: Cart starts at page top beside the header/catalog and stays sticky with bounded internal scroll on desktop; mobile remains single-column. Cloud-only 44px status control opens sync details and preserves retry/conflict access. Shift start/close/handover/accept, history and pager grouped beside refresh/logout. Node24 TypeScript, text integrity, scoped ESLint, UI37, offline pure regressions and webpack build PASS. IndexedDB adapter test NOT RUN (missing fake-indexeddb); offline engine/storage unchanged. Browser not run under repository policy. Evidence original workspace output/pos-compact-verification.json; release marker pos-layout-20261026 records final deployed SHA/alias verification

Updated 2026-10-26 Asia/Riyadh — finance publication

## Release and continuity

- User authorized publishing all completed local work and updating GitHub/Vercel/handoff
- Release marker: release-finance-20261026 on main in ahmedabumoalla/branda
- Public project: branda-2 / prj_kHe6mtiyO05loZn6PgMOSpjlv4Ow, barndaksa.com and www.barndaksa.com
- Root .vercel/project.json points to an older project and must not select the deployment target
- Release assembled in C:/Projects/branda-public-finance-20261026 from origin/main f2e5d5ab74685a8b784c1518f6feb7186d69fed3 plus hash-verified completed snapshot C:/Projects/branda-pos-offline-local-20261026
- Preserve the dirty original workspace and unrelated drafts; do not stage all of it or reset it to main
- Publish procedure: push the tested release, deploy that exact Git SHA, verify READY plus apex/www aliases and public HTTP guards, then annotate release marker with deployment ID and verification time
- Deployment evidence is retained in original workspace output/finance-publication-*.json and the annotated release marker; absence of that marker is not proof of a completed deployment

## Completed release scope

- Separate sales/loyalty logins, WhatsApp/password/recovery, owner-authorized dashboard navigation and employee isolation
- Treasury accounts, openings, primary choices, private optional voucher attachments, transfers, reconciliation/audit, linked terminal fees and monthly due dates
- Dedicated cashier drawer, blind opening counts, numbered cash differences, owner-only notification status, settlements, custody handovers and linked receipt vouchers
- Customer phone on POS invoices, shared pager, invoice loyalty stamps and explicit ready-reward redemption; current scanner/enrollment retained
- Receipt preview, inclusive VAT breakdown, item photos, large total, cash/network buttons, currency formatting
- Offline persisted sales/menu/media, stable local references and automatic deduplicated sync; customer/kitchen automatic print orchestration and finance printer settings
- Existing encrypted OTP queue hotfix retained; finance outbox cron added alongside OTP/pager/wallet/marketing crons

## Verification and database

- Node 24.21.0: TypeScript, text integrity and isolated Next webpack production build passed on assembled release
- Affected finance/auth/treasury/shift/customer/offline/printer tests run; older UI harnesses updated for payment buttons, dedicated drawer and offline hooks
- Existing source security gate still reports three unchanged baseline findings: contact-request migration search_path and two legacy customer profile RPC assertions; no new finding introduced
- Applied migration history audited live through 20261025223826; all included migrations already applied, none replayed for publication
- Prior offline SQL29/customerSQL112, isolated offline browser durability and native Arabic PDF evidence reused only for matching source/test/runtime hashes
- Full evidence: output/finance-publication-checks.json, output/pos-offline-verification.json, output/publication-build.log

## Established limits and pending work

- First authenticated online visit prepares a device; offline sales require an existing shift. Shift opening/closing, refunds and reward redemption need connectivity
- Printer preferences are per brand/browser/device. Silent direct printing requires the paired running local service and installed thermal driver; browser fallback needs print confirmation
- No real thermal printer installed on development device, no physical print or real sale/message performed as deployment tests
- Storage app count/size caps removed; provider limits still apply, images compressed while other documents remain unchanged
- Earlier expanded supplier-purchase/shift-report draft and migrations 20261024094856/20261024094900/20261024095316 are NOT in this release and must be rebased against current shifts before use
- Madar integration remains a proposal, not a deployed dependency
- Start with docs/BARNDAKSA_HANDOFF/00_MASTER_INDEX.md and actual git status before further work
