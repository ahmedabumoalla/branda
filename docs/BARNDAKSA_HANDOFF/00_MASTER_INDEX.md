# Branda — start here after switching Codex accounts

Updated 2026-10-10, Asia/Riyadh. This is the current handoff; old source bundles are historical.

## Resume without restarting

Read AGENTS.md and ../task-state.md, check git status, then continue with the user's next request. Do not rerun setup, regenerate bundles or reimplement completed work. The task-state record identifies the latest verified production release and any pending publication. A handoff-only commit does not change application behavior.

Latest release: exiting maintenance returns to the brand directory and maintenance links are removed from the admin sidebar/home, published at `602aa1ccb0183d621e9cd9a5d14e509619fbbf4c` and verified in Production. Direct maintenance entry remains in brand details. Annual-offer cards, fixed coupon date inputs, annual pricing, duration-scoped coupons, expiry gating and persistent package deletion remain published. See task-state for evidence.

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
- Services require a current active package; no package/expiry closes public menu and other brand services. Positive overrides cannot add services missing from a package. Electronic storefronts are archived and disabled before reads/writes. Do not restore `/c` routes or branch/order fetching.
- Signup: Arabic/English brand names, manager, email, WhatsApp phone, Google Maps link, optional coupon; WhatsApp verification first, then password/confirmation. Seven-day trial includes menu/settings; loyalty/offers require a suitable paid package. Registration design was completely refreshed.
- Owner subscription page shows current plan, remaining time, features and upgrades. Bank transfer is pending manual approval; receipt upload or WhatsApp to `966508424401`. Explain 24h package activation and 72h loyalty cards. Online payment is disabled. Creating a financial request currently requires the actual owner, not maintenance mode.
- Default standalone menu uses Basilico layout with actual products only, or an empty layout and transparent Branda logo. Uniform-background logo processing preserves originals.
- Admin operations includes brand metrics, separate standalone/storefront visits, filters and Arabic PDF export. Brand table distinguishes brand activity from actual subscription status/expiry.
- Maintenance mode has a visible banner and an explicit exit to admin. Loyalty → management of cashier → direct entry uses the owner's existing login, also works in valid maintenance mode. Maintenance cashier identity is separate and bound to the signed session/brand/expiry.

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
- Preexisting offers/menu/generic-loyalty changes remain local and unpublished. Preserve them. See git status; do not stage everything. Local workspace continuity is not a claim that another device has these files or credentials.

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
Isolated release workspace: C:/Projects/branda-operations-release-20261009
```

- `.vercel/project.json` points at the OLD project; do not blindly deploy with it. Push main, then verify the matching production deployment.
- The release workspace HEAD is old but its index contains the cumulative published tree. **Do not reset it.** Copy/stage task files only and compare `git write-tree` with the root index before using its build. Remove its temporary environment copy afterward.
- Default local Node20 is unsuitable; use Node24. Paths and login sessions are machine-local and must be rechecked after switching accounts.
- GitHub push/status access works. Vercel CLI auth file allowed read-only REST during the latest task; earlier CLI failures do not prove current access. Never print tokens. Supabase CLI SQL returned403; necessary live SQL used the authenticated project editor with exact-file comparison. No migration-history rows were fabricated.
- Latest live schema changes are already applied, including package service boundaries, verified signup, bank review and maintenance cashier entry. Consult the migration files and archived task evidence before proposing another database change.

## Where to look, only when relevant

```text
Packages: lib/platform/feature-access.ts; lib/data/admin.ts; lib/data/subscription.ts
Action errors: lib/platform/action-result.ts; app/actions/admin.ts; app/actions/subscription.ts
Packages UI: components/admin/pages/admin-plans-page.tsx; components/dashboard/pages/subscription-page.tsx
Signup: app/register/; lib/auth/owner-onboarding.ts
Cashier: lib/data/cashier.ts; app/actions/cashier.ts; lib/platform/maintenance.ts
Operations: app/admin/operations/; lib/data/operations-report.ts
Unpublished local work: offers actions/data/pages, Rast spotlight/menu, generic loyalty scanner/components
```

Detailed previous evidence: [task history](history/task-state-through-20261009.md). Earlier visual/wallet context: [old handoff](history/handoff-before-20261009.md). Historical claims about navigation, storefronts or subscription terms are superseded by this document.
