# Branda — start here after switching Codex accounts

Updated 2026-10-12 00:04 +03:00, Asia/Riyadh. This is the current handoff; old source bundles are historical.

## Resume without restarting

Latest application release COMPLETE: `393749df3c2794d1832e3389d53f3278b085f84f` on main, verified Production 2026-10-11 16:53 +03:00, GitHub deployment `6996484234`, Vercel `branda-2`. Universal package loyalty/offers and migration `20261011134719_universal_package_loyalty` are published and verified. No pending migration or deployment. See `../task-state.md` for evidence and local unpublished files. This handoff update changes documentation only and does not reverify live services.

**GREEN-API STOPPED at the user's explicit request** after they reported an outage. Partnership approval is UNKNOWN; the interrupted check did not reach account status. Do not resume checking, resubmit the application or send follow-up messages until the user asks. Earlier screenshots showed a Client account; they do not establish current approval or rejection.

**Preserve standalone menus**: Kawakib (`rast`) is the approved FUNCTIONAL reference for loyalty/rewards/cards/cashier/scanning/notifications and offers. All entitled brands now use that engine with their own identity and tenant-scoped data. Kawakib retains its distinct menu design and all other brands retain their existing Basilico-style menus. No redesign or replacement of those menus is authorized by the shared-service requirement.

Pager COMPLETE: published `984e8b8296b10e40845c710b071340c8bf4df026`, verified 2026-10-11 04:47 +03:00. Cron enabled every minute and authorized worker verified without sending messages. Staff can have loyalty, pager or both permissions and their assigned station. Exact invoice number and phone are recorded; ready starts nominal one-minute WhatsApp reminders until received/cancelled, then one rating invitation. Current Branda number is temporary. Floating browser mode is available; overlay above a native POS app and real WhatsApp delivery were not independently confirmed. Read `../pager-backend.md` for timing/provider limits. Only `test-cafe` received the existing technical administration plan for testing through 2026-11-11 05:22 +03:00, with no invented payment or changes to other subscriptions.

Loyalty customer directory COMPLETE: initial Kawakib release `44e8ba93a0d8f2099b184c825affe8f16b87d32d`, subsequently generalized by the latest release. Names-only searchable table; phone fetched only after selecting an individual customer through tenant-authorized server access. No bulk phone exposure in initial page data.

Shahi w Hail restoration COMPLETE: 11 deleted products restored and 40 products verified in the public menu. User-provided coffee-pot/small-teapot/large-teapot images attached; all 40 image responses decoded successfully after repairing 8 additional broken legacy images. No remaining known missing image. Menu refresh release `6b6c554227914d40d26eecb1840f131734e8b615` refreshes visible online menus every 30 seconds and on foreground/reconnect; tabs opened before that release need one reload. Never claim old remote tabs were forcibly reloaded.

Legacy storefront links COMPLETE17:11: published exact commit `dfe4f18db3bd252f0008687f450abf5905c2d43d` and verified Production plus live HTTP308 redirects/menu200/archived API404. GET/HEAD `/c/{slug}` child pages and `/app/{slug}` plus brand subdomains redirect to `/menu/{slug}`. Archived APIs/mutations stay blocked and subscription gating remains at the menu destination. Automatic deployment succeeded after delay; the temporary request to open the correct deployment account is obsolete and no user action remains.

Customer intelligence COMPLETE: `/admin/customers` premium directory and cross-brand profile published at `cd1eb8a5ec526818cf4bcda4f2235187a6db99a2` and exact Production verified04:14. Real audit/wallet history plus new authenticated browser/device/active-duration telemetry; migration `20261010010926_customer_intelligence` live. Tests/text/TypeScript/isolated build and production endpoint checks passed. See `docs/customer-intelligence.md` and task-state. Never invent historical usage/device data or attribute anonymous visits to known customers. Preserve unrelated offers/menu/loyalty changes.

Finance COMPLETE: `/admin/finance` published at `f67149a6b0627d30d7fb9550aafc64d5890f29fb`, exact Production verified03:52. Manual collection records payment AND activates the plan atomically; expenses/private receipts/category totals and idempotent retries are available. Source migrations `20261010004458_platform_finance` / `20261010004502_group_finance_summary` are live. Exclusive Address is `C:/Projects/pixis-group`; existing signed source bridge/local views now include Branda collections/payments without merging group receipt totals. Group frontend remains local on5173; no public hosting configured. See task-state for actual checks/evidence; preserve unrelated offers/menu/loyalty edits.

Read AGENTS.md and ../task-state.md, check git status, then continue with the user's next request. Do not rerun setup, regenerate bundles or reimplement completed work. The task-state record identifies the latest verified production release and any pending publication. A handoff-only commit does not change application behavior.

Earlier completed release: dedicated subscription-request review at `/admin/subscription-requests`, published at `84acc215ed7c25a5453282ae8f8aa622689dac50` and verified in Production. Shows brand/owner, plan/amount/term and private receipt links; approval activates immediately through the existing admin RPC, rejection closes the request without activating or cancelling the existing subscription. Rejected requests are displayed as cancelled after rejection and permit a new request. No migration required. See task-state for tests/build and live-verification limits. Prior maintenance navigation, annual offers, coupon dates/durations, expiry gating and persistent deletion remain published.

The earlier React441 package request/save issue was fixed by accepting IDs containing underscores and returning structured action errors. Do not revert this completed fix.

## Work the way the user expects

- Act promptly, preserve working behavior, finish and publish authorized changes. Short Arabic updates; no repeated permission questions or long plans.
- Design must look deliberate and polished: readable Arabic, clear content/hierarchy, coherent brand colors, good mobile layout and visible loading/error states. Avoid tiny text and generic crowded forms.
- Inspect only relevant files. Use proportionate checks; no unnecessary test suites, broad audits or repeated builds. Mandatory Arabic integrity and TypeScript still apply to code changes.
- Keep server authorization, tenant boundaries and payment approval intact. Do not turn a refused operation into a false success. No unsolicited customer messages.
- Keep handoff notes short. Detailed evidence is in history and should only be opened when needed.

## Product decisions already implemented

- Subscription pricing: plan price is the monthly base; purchase durations are 1, 3, 6 and 12 months. Only the annual duration gets the plan-level discount set by administration. A platform coupon applies after the annual discount and can be restricted to any selected durations, including monthly-only or annual-only. Coupon expiry includes the end of the chosen Saudi day. Bank requests reserve limited coupon slots and retain price snapshots; redemption is counted on approval. Trial/paid expiry blocks dashboard services without any replacement plan and leaves subscriptions reachable. Annual discounts default to zero until explicitly configured by administration.

- Platform copy uses no trailing periods or commas in headings, descriptions, hints or messages; remove unnecessary decorative separators while preserving meaningful lists, questions, numbers and URLs. This rule is recorded in AGENTS.md for future edits.
- Every brand uses one shared service catalog for sidebar and package features: menu/products, offers, loyalty/rewards, settings. Subscriptions remain accessible. Admin navigation is separate.
- Services require a current active package; no package/expiry closes public menu and other brand services. Positive overrides cannot add services missing from a package. Electronic storefronts remain archived with no branch/order reads or writes. Saved `/c` and `/app` navigation now redirects to the standalone menu; these links never reopen the old storefront.
- Signup: Arabic/English brand names, manager, email, WhatsApp phone, Google Maps link, optional coupon; WhatsApp verification first, then password/confirmation. Seven-day trial includes menu/settings; loyalty/offers require a suitable paid package. Registration design was completely refreshed.
- Owner subscription page shows current plan, remaining time, features and upgrades. Bank transfer is pending manual approval; receipt upload or WhatsApp to `966508424401`. Explain 24h package activation and 72h loyalty cards. Online payment is disabled. Creating a financial request currently requires the actual owner, not maintenance mode.
- Default standalone menu uses Basilico layout with actual products only, or an empty layout and transparent Branda logo. Uniform-background logo processing preserves originals.
- Admin operations includes brand metrics, separate standalone/storefront visits, filters and Arabic PDF export. Brand table distinguishes brand activity from actual subscription status/expiry.
- Maintenance mode has a visible banner and exits to `/admin/cafes`; its standalone admin navigation item was removed while brand-dialog entry remains. Loyalty → management of cashier → direct entry uses the owner's existing login, also works in valid maintenance mode. Maintenance cashier identity is separate and bound to the signed session/brand/expiry.

## Current manual subscription terms — already applied live

| Brand | Enabled services | Expiry, Saudi date |
| --- | --- | --- |
| Double B Bistro (`double-b-bistro`) | Menu only, annual from original subscription | 2027-08-30 |
| Basilico (`basilico`) | Menu only, annual from original subscription | 2027-08-24 |
| Kawakib (`rast`) | Menu + loyalty + offers, one calendar month from 2026-10-02 | 2026-11-02 |
| Other 20 existing brands | Menu only | End of 2026-10-31 |

The original bulk operation covered 23 brands; Kawakib's later instruction supersedes its October menu-only grant. No charge was created. Applied one-time SQL is under `supabase/operations/`; private before-state snapshots exist. **Do not replay these operations.**

## Only real outstanding items

- Await the user's retry of package deletion and the earlier save/request fix. Isolated checks and release build passed; the agent has not deleted a real package or submitted a financial request for testing.
- Bank details for “العنوان الحصري” are still missing: do not invent an IBAN. Current UI offers the configured WhatsApp route to request details.
- New phone-only accounts do not yet have phone-based password recovery. Email login is an alias, not a verified Auth email.
- Historical Google Wallet issuance was fixed; actual phone installation/display was not confirmed. Do not reset issuer approval or credentials. Read `../rast-wallet-operations.md` only if wallet work is requested.
- Remaining alternative menu CSS/generic-loyalty files remain local and unpublished; the approved universal loyalty/offers implementation is already published. Preserve them. See git status; do not stage everything. Local workspace continuity is not a claim that another device has these files or credentials.

## Exact workspace and release path

```text
Workspace: C:/Projects/branda-platform
GitHub: https://github.com/ahmedabumoalla/branda
Production branch: main
Site: https://barndaksa.com
Vercel project: branda-2
Vercel project ID: prj_kHe6mtiyO05loZn6PgMOSpjlv4Ow
Supabase project: kpguwjfkkylrdlvzeezz
Node: 24.21.0; Next: 16.3.8; TypeScript: 5.9.3
Known Node executable: C:/Users/pc/AppData/Local/npm-cache/_npx/538786c08bcb9442/node_modules/node/bin/node.exe
Latest isolated release workspace: C:/Projects/branda-universal-services-release-20261011
```

- `.vercel/project.json` points at the OLD project; do not blindly deploy with it. Push main, then verify the matching production deployment.
- Older isolated release workspaces may contain historical staged trees; inspect before reuse and never reset them blindly. Build only task-scoped release inputs and remove temporary environment copies afterward.
- Default local Node20 is unsuitable; use Node24. Paths and login sessions are machine-local and must be rechecked after switching accounts.
- GitHub push/status worked during the latest release. Vercel local CLI credentials later returned403; authenticated browser access and GitHub deployment evidence verified the correct project. Supabase migrations used the existing authorized Management API access after earlier CLI failures. Recheck current authorization only when needed; never print tokens or fabricate migration history.
- Latest live schema changes are already applied, including package service boundaries, verified signup, bank review and maintenance cashier entry. Consult the migration files and archived task evidence before proposing another database change.

## Where to look, only when relevant

```text
Packages: lib/platform/feature-access.ts; lib/data/admin.ts; lib/data/subscription.ts
Action errors: lib/platform/action-result.ts; app/actions/admin.ts; app/actions/subscription.ts
Packages UI: components/admin/pages/admin-plans-page.tsx; components/dashboard/pages/subscription-page.tsx
Signup: app/register/; lib/auth/owner-onboarding.ts
Cashier: lib/data/cashier.ts; app/actions/cashier.ts; lib/platform/maintenance.ts
Operations: app/admin/operations/; lib/data/operations-report.ts
Published shared loyalty/offers: latest main release; remaining unpublished alternatives: see ../task-state.md and actual git status
```

Detailed recent evidence: [history through October 11](history/task-state-through-20261011.md). Older evidence: [task history](history/task-state-through-20261009.md). Earlier visual/wallet context: [old handoff](history/handoff-before-20261009.md). Historical claims about navigation, storefronts or subscription terms are superseded by this document.
