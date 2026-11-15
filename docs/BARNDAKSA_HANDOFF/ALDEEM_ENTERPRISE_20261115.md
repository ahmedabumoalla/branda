# Aldeem enterprise build - 2026-11-15

Account: سلسلة خيال الديم للحلويات, slug `khayal-aldeem`, cafe id `d027657c-c109-4b4f-9c89-53f8f652c28c`.
Work branch: `feat/aldeem-enterprise-20261115`, created from origin/main `9ca87fcd`. Author: Claude, on the owner's mandate of 2026-11-15.
Rule followed: changes apply to the Aldeem account only. Every new database object is gated by a per-brand settings row that exists for Aldeem only, and every new screen is reachable from the Aldeem navigation only. The exceptions are listed under "Platform-wide touch points".

## What was built

| Area | Route | Notes |
|---|---|---|
| Overview landing page | `/dashboard/system/overview` | First item of the sidebar and the landing page of the account. Invoice and customer search, six quick tiles, sales and profit by day, payments by method, low stock, upcoming lab deliveries, latest activity |
| Sidebar | `components/dashboard/aldeem-navigation.ts` | Reordered by daily flow. Hidden for Aldeem: bookings, contracting, installments, rentals, time tracking. Presentation only |
| Productive families | `/dashboard/system/families` | Family = supplier, receipt = posted purchase invoice, return = purchase return, payout = supplier payment. Three entry buttons: receive and pay cash, receive and pay after sale, receive and return. Per-family dashboard: received, sold, returned, on display, where displayed, where sold, paid, due now |
| Family portal | `/finance/khayal-aldeem/family` | Family signs in with the phone registered by the store and a verification code, sees only its own data |
| Loyalty points | `/dashboard/system/points` | One balance per customer phone across all branches. Limits: points per riyal, minimum invoice, point value, minimum redemption, maximum share of an invoice, expiry days. Ledger row per point movement with branch, invoice and actor. Manual adjustment needs a written reason |
| Points in the cashier | `components/finance/finance-pos-points.tsx` | Shows the customer's balance after the phone is typed and lets the cashier spend points as a discount. Needs a connection. Earning is automatic for every cashier sale that carries a customer phone |
| Live branch monitor | `/dashboard/system/tracking` | Per branch today: sales, invoices, refunds, purchases, expenses, open shifts with cashier and drawer cash, stock value, low stock count, pending lab orders. Refreshes every 20 seconds |
| Item trace | `/dashboard/system/tracking/items` | By barcode, code or name: identity, family or supplier, where it is now, totals in and out, every movement with document, branch, party, lot and actor |
| Cash trail | `/dashboard/system/tracking/cash` | Every journal line on cash, bank and network accounts: account, document, party, branch, who recorded it, cashier and shift |
| Food safety register | `/dashboard/system/food-safety` | Temperature, cleaning, pest control, staff health, receiving inspection, training, calibration, recall. A reading outside its limits is a deviation and needs a corrective action. Only owner or manager closes a deviation. Records cannot be edited or deleted |
| Employee portal | `/finance/khayal-aldeem/system` | The five new sections appear by role: cashier and warehouse get overview, tracking and food safety, warehouse also families, accountant and auditor also points |
| Help marks | `components/aldeem/aldeem-ui.tsx`, `aldeem-enhancer.tsx` | New screens: every button has a permanent question mark with an explanation. Older screens inside the Aldeem account: a question mark appears beside the control under the pointer or focus, with a text chosen from the control's label |
| Loading text | `aldeem-enhancer.tsx` | Inside the Aldeem account a "جار تحميل" text placeholder is drawn as a thin progress line. The data still loads on demand |
| Admin package sections | `/admin/plans` | For a package that includes finance: a switch "تحديد الأقسام" and three lists titled مزايا باقة برندة المالية, مزايا باقة برندة لإدارة الموظفين, مزايا برندة للتصنيع. Stored in `platform_plans.erp_modules`. NULL means every section, so no existing package changes |

## Database changes applied to production

All applied directly with the management CLI and not registered in the migration history table, same as the two earlier Claude migrations.

| File | Content |
|---|---|
| `20261115230000_productive_families.sql` | Schema `erp_family_private`, tables `erp_family_settings`, `erp_families`, `erp_family_items`, `erp_family_consignments`, `erp_family_events`, RPCs `erp_family_read`, `erp_family_execute`, `erp_family_portal`, `erp_family_portal_phone` |
| `20261115233000_enterprise_overview.sql` | Schema `erp_enterprise_private`, table `erp_enterprise_settings`, RPCs `erp_overview_read`, `erp_overview_search` |
| `20261115234500_enterprise_branch_tagging.sql` | Trigger `erp_enterprise_branch_tag` on `bf_documents` |
| `20261116000000_enterprise_points_ledger.sql` | Schema `erp_points_private`, tables `erp_points_settings`, `erp_points_ledger`, triggers `erp_points_earn` on `bf_sale_customers` and `erp_points_refund` on `bf_documents`, RPCs `erp_points_balance`, `erp_points_sale`, `erp_points_read`, `erp_points_execute` |
| `20261116003000_enterprise_tracking.sql` | RPCs `erp_trace_item`, `erp_trace_cash`, `erp_branch_monitor` |
| `20261116010000_enterprise_food_safety.sql` | Tables `erp_food_safety_records`, `erp_food_safety_closures`, RPCs `erp_food_safety_read`, `erp_food_safety_execute` |
| `20261116013000_plan_erp_modules.sql` | Column `platform_plans.erp_modules` |

Data rows set for Aldeem only: `erp_family_settings`, `erp_enterprise_settings`, `erp_points_settings` (enabled, 1 point per riyal, point worth 0.05 SAR, minimum 100 points, at most 50 percent of an invoice, 365 days), `erp_system_settings` kind `brand` (primary `#6b347e`, ink `#442b4e`, background `#fff9fc`).

## Finding fixed: cashier sales had no branch

Cashier sales, refunds, settlements and expenses are posted by `brand_finance_execute`, which does not enter the branch scope, so those documents had no row in `erp_branch_documents` and could not be reported per branch. For brands in `erp_enterprise_settings` the new trigger assigns the branch from, in order: the referenced document, the warehouse of the document, the shift, the recording employee's branch, the user's selected branch. An explicit branch scope still wins. Other brands are not affected.

## Demo data in the Aldeem account

Script: `supabase/seeds/aldeem_demo_20261115.sql`, run once. Every record went through the same database commands the screens call, acting as the brand owner account, so the audit trail names the owner account as the actor. Every created record is listed in `public.erp_enterprise_demo`.

- 4 branches added to the existing main branch, 5 branch warehouses bound to their branches
- 17 organization units, 20 employee records without sign-in accounts
- 1 demo bank account "حساب بنكي تجريبي" opened with 50,000 SAR, used for all demo payments
- 5 families, 10 family items each listed in the cashier, 10 receipts, 24 cashier sales in 3 shifts, 1 return, 1 payout
- Verified after the run: for each family received minus returned minus sold equals on display, and every document except the bank opening entry carries a branch

Removal needs a dedicated script: posted finance documents and ledger rows are immutable by trigger. Not written yet.

## Platform-wide touch points

These files or objects are shared by all brands. Each change is inert for other brands.

- `bf_documents` triggers `erp_enterprise_branch_tag`, `erp_points_refund` and `bf_sale_customers` trigger `erp_points_earn`: return at once unless the brand has an enterprise settings row
- `components/dashboard/finance-sidebar-menu.tsx`: a group marked `direct` renders as one link, and groups are filtered by package sections only when a package defines a list
- `components/dashboard/dashboard-app-layout.tsx`: instant section loading wrapper for the Aldeem and MIND slugs only
- `lib/data/brand-finance.ts`: a sale payload carrying `redeemPoints` is routed to `erp_points_sale`, other sales are unchanged
- `components/finance/finance-pos.tsx`: points hook is active only for the Aldeem slug
- `app/dashboard/page.tsx`: Aldeem lands on its overview
- `platform_plans.erp_modules`, `lib/data/admin.ts`, `components/admin/pages/admin-plans-page.tsx`, `app/actions/dashboard-shell.ts`

## Publication

- GitHub main moved from 9ca87fcd to a324d7a0bf8bebc1c7e4b72a8bdd9dad584cc921 as a fast-forward on 2026-11-15, after Vercel preview builds of the work branch succeeded
- Vercel production deployment dpl_4HiqphL5nK769L21qh1VbNaC6AXL completed. https://barndaksa.com returned 200 with that deployment id in its HTML, and https://www.barndaksa.com/finance/khayal-aldeem/family returned 200 with the family sign-in page
- Follow-up commit: the family portal page returns not found for brands without the families section. Function erp_family_portal_enabled added to production and to the families migration file
- A local production build cannot run in the work tree because node_modules is a directory junction that Turbopack rejects. Builds were verified on Vercel

## Not done or not verified

- No screen was opened in a browser by Claude. Verified: TypeScript, text integrity, lint on changed files, Vercel preview builds, and every new database read and command against live data inside rolled-back transactions
- The 69 existing Aldeem products have price 0 and the account VAT rate is 0 percent. Left untouched: real prices and the tax decision belong to the owner
- Family portal sign-in depends on the platform phone verification service being enabled for this brand in the production environment. No verification message was sent
- Package sections hide sidebar sections only. Database-level denial per section is not added
- Older ERP screens were not redesigned one by one. They take the Aldeem colours through the system appearance setting and the help mark through the enhancer
- Offline work exists for the cashier only, as before. Spending points and every management screen need a connection
- SFDA: the register provides the records. Conformity cannot be certified by software or by Claude
- The lab order screen is not linked to manufacturing orders or inventory lots
- One cashier drawer exists for all branches. A drawer per branch should be created from the treasury screen
- Employee sign-in accounts, per-role testing, real printers and scanners were not exercised
- AI: no new AI feature was added and no screen mentions AI. Existing platform AI settings are unchanged
