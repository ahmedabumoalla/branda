# Branda Finance Database Integration Audit

Date: 2026-06-28
Scope: DEMO workspace only. No Supabase CLI, no SQL execution, no applied migrations, no package changes, no commit/push.

## Current Safe State

Branda Finance is database-ready, but real finance writes are still disabled.

- Migration draft created but not applied: `supabase/migrations/061_branda_finance_core.sql`
- Readiness layer added:
  - `lib/branda-finance/db-types.ts`
  - `lib/branda-finance/db-readiness.ts`
  - `lib/branda-finance/queries.ts`
  - `lib/branda-finance/actions.ts`
- Create invoice and cashier sales pages now read readiness from `lib/branda-finance/queries.ts`.
- Server actions in `lib/branda-finance/actions.ts` intentionally return disabled results until the migration is reviewed and applied.

## Real Data Helpers Used Today

- `getOwnerMenu()` from `lib/data/menu.ts`
  - Reads real `menu_categories` and `menu_products`.
  - Used for product grid, invoice item product choices, category labels, prices, availability, image, and product ids.
- `getOwnerBranches()` from `lib/data/branches.ts`
  - Reads real `branches`.
  - Used for branch selectors.
- `getCafeCustomers()` from `lib/data/customers.ts`
  - Reads real `customer_profiles`.
  - Used for customer selectors.
- `getOwnerFeatureCodes()` from `lib/data/feature-entitlements.ts`
  - Used for owner/package gates, including Branda Finance and loyalty.
- `getPublicCafeFeatureCodesBySlug()` and `filterPublicCafePayloadByFeatures()`
  - Used to avoid exposing gated public loyalty data.
- `getLoyaltyCardViewByCode()` and `getCurrentCustomerLoyaltyCardView()`
  - Used for real loyalty card lookups only.

## Proposed Tables In The Draft Migration

The draft creates these additive tables:

- `finance_customers`
- `finance_suppliers`
- `finance_warehouses`
- `finance_sales_invoices`
- `finance_sales_invoice_items`
- `finance_payments`
- `finance_cash_sessions`
- `finance_invoice_sequences`
- `finance_accounts`
- `finance_journal_entries`
- `finance_journal_entry_lines`
- `finance_audit_events`

The draft includes UUID primary keys, `cafe_id`, created/updated metadata, status checks, indexes, RLS enablement, service-role policies, scoped staff read/write policies, append-only audit policies for authenticated users, same-cafe validation triggers, and `public.set_updated_at()` triggers.

## Linked Existing Tables

The migration references these existing tables:

- `public.cafes(id)` through `cafe_id`
- `public.branches(id)` through `branch_id`
- `public.customer_profiles(id)` through `customer_profile_id`
- `public.menu_products(id)` through `menu_product_id`
- `public.cafe_cashiers(id)` through `cashier_id`
- `auth.users(id)` through `created_by` and audit actor fields

## UI And Data Layer Changes

- `app/dashboard/branda-finance/invoicing/create/page.tsx`
  - Uses `getBrandaFinanceInvoiceWorkspace()`.
  - Enables persistence only from `readiness.canPersistSalesInvoices`, currently `false`.
- `app/dashboard/branda-finance/sales/page.tsx`
  - Uses `getBrandaFinanceSalesWorkspace()`.
  - Keeps loyalty button behind the real `loyalty` feature gate.
  - Enables invoice persistence only from readiness, currently `false`.
- `components/branda-finance/invoice-workspace.tsx`
  - Removed the unused local product modal from the real-facing sales invoice workspace.
  - Removed the fixed invoice number from the header.
  - Uses the shared disabled persistence message.
- `components/branda-finance/invoice-form.tsx`
  - Removed the fixed invoice number.
  - Attachment copy uses current-mode wording.
- `components/branda-finance/invoice-preview.tsx`
  - Replaced fixed invoice number and local QR language with non-persistent preview language.
- `components/branda-finance/cashier-sales-workspace.tsx`
  - Replaced cashier-session label with local/no-save wording.
- `components/branda-finance/add-branch-modal.tsx`
  - Removed the fallback address and added a local-only warning.

## Gating Locations

Branda Finance package access:

- `app/dashboard/branda-finance/layout.tsx`
- `lib/platform/feature-gates.ts`
- `lib/data/feature-entitlements.ts`

Loyalty access:

- `app/dashboard/branda-finance/sales/page.tsx`
- `components/branda-finance/cashier-sales-workspace.tsx`
- public/customer loyalty helpers that depend on real feature codes and real card lookups

## Remaining Preview-Only Demo Islands

These files/modules still intentionally contain preview/local data or legacy names because they do not yet have matching reviewed persistence:

- `lib/branda-finance/demo-data.ts`
- `lib/branda-finance/invoice-demo-data.ts`
- `lib/branda-finance/invoice-mock-data.ts`
- `lib/branda-finance/workflows.ts`
- `components/branda-finance/finance-module-page.tsx`
- `components/branda-finance/reports/finance-standard-report.tsx`
- `components/branda-finance/general-ledger-report.tsx`
- `components/branda-finance/hall-orders-workspace.tsx`
- `components/branda-finance/cost-centers-workspace.tsx`
- `components/branda-finance/loyalty-points-workspace.tsx`
- `components/branda-finance/purchase-invoice-workspace.tsx`
- `app/dashboard/branda-finance/invoicing/page.tsx`
- `app/dashboard/branda-finance/purchases/page.tsx`
- `app/dashboard/branda-finance/statements/[entityType]/[entityId]/page.tsx`

These are not the real-facing sales invoice/cashier persistence path and must stay clearly non-persistent until their own schema and server actions are reviewed.

## RLS Hardening In The Draft

- `cashier` no longer has broad write policies across all Branda Finance tables.
- Cashier-safe authenticated insert/update is limited to:
  - `finance_sales_invoices`
  - `finance_sales_invoice_items`
  - `finance_payments`
  - `finance_cash_sessions`
- Cashier delete is not allowed by the cashier-safe policies. Deletes remain limited to cafe owners or users with `branda_finance` permission, plus platform admins through the platform-admin policies on non-audit tables.
- Cashier cannot write these accounting/control tables:
  - `finance_accounts`
  - `finance_journal_entries`
  - `finance_journal_entry_lines`
  - `finance_audit_events`
- Accounting table writes are limited to cafe owners, users with `branda_finance` permission, platform admins, and `service_role`.
- Accounting reads are limited to cafe owners, users with `branda_finance` permission, users with `reports` permission, platform admins, and `service_role`.
- `finance_audit_events` is append-only for normal authenticated access:
  - `authenticated` receives only `SELECT` and `INSERT`.
  - `UPDATE` and `DELETE` are revoked from `authenticated`.
  - RLS exposes read to owner, finance, and reports staff.
  - RLS exposes insert to owner and finance staff.
  - `service_role` keeps full access for controlled server-side maintenance.

## Same-Cafe Validation In The Draft

The migration adds `public.finance_validate_same_cafe_refs()` as a `SECURITY DEFINER` trigger function and attaches it before insert/update on the finance tables that carry cross-table references.

Validated references:

- `branch_id` against `public.branches(cafe_id)`.
- `customer_profile_id` against `public.customer_profiles(cafe_id)`.
- `menu_product_id` against `public.menu_products(cafe_id)`.
- `warehouse_id` against `public.finance_warehouses(cafe_id)`.
- `account_id` against `public.finance_accounts(cafe_id)`.
- `customer_id` against `public.finance_customers(cafe_id)`.
- `invoice_id` against `public.finance_sales_invoices(cafe_id)`.
- `journal_entry_id` against `public.finance_journal_entries(cafe_id)`.

Additional same-cafe checks included:

- `cashier_id` on `finance_cash_sessions` against `public.cafe_cashiers(cafe_id)`.
- `parent_account_id` on `finance_accounts` against `public.finance_accounts(cafe_id)`.

These checks protect against linking a finance row in one cafe to branch, customer, menu, warehouse, account, invoice, journal-entry, cashier, or parent-account records owned by another cafe.

## Server-Side Calculation Requirements

Browser-provided totals must not be trusted. Before enabling persistence, server actions must recalculate and validate:

- Invoice item line totals.
- Subtotal.
- Discount total.
- VAT/tax total.
- Invoice total.
- Amount paid.
- Amount due.
- Payment allocation to invoices.
- Transactional invoice numbers from `finance_invoice_sequences`.
- Balanced journal entries where total debit equals total credit.

The browser may send draft UI state, but the server must be the source of truth for financial totals, VAT, balances, posting, and audit events.

## Remaining RLS And Rollout Risks To Review Before Applying

- Confirm `public.has_cafe_permission(cafe_id, 'branda_finance')` is a valid permission code in production.
- Confirm customer-facing invoice reads are intentionally not exposed through these policies.
- Confirm invoice numbers are generated transactionally from `finance_invoice_sequences`.
- Confirm the first production write path uses server actions that recalculate totals and create balanced accounting entries.
- Verify RLS behavior with owner, finance staff, reports staff, cashier, platform admin, service role, and unrelated authenticated users.

## Review Items Before Running The Migration

- Review every `CHECK` status value against product workflows.
- Decide whether purchase invoices and inventory movement tables should be included in the same rollout or a later migration.
- Decide whether `finance_customers` should mirror `customer_profiles` or remain a finance-specific profile table.
- Keep the same-cafe validation triggers in place and test them with cross-cafe references before production transfer.
- Run the migration only in a staging database first.
- Verify RLS with owner, staff, cashier, platform admin, and unrelated authenticated users.
- Verify indexes against the expected invoice list, customer statement, payment search, and journal report queries.

## Production Rollout Checklist

1. Apply `061_branda_finance_core.sql` in staging only.
2. Seed or create finance accounts, warehouses, and invoice sequences for a test cafe.
3. Add read queries for the new tables behind readiness detection.
4. Add write server actions for draft, approve, payment, cash session, and journal posting.
5. Test RLS with multiple cafes and roles.
6. Enable `canPersistSalesInvoices` only when the app can verify the schema is present.
7. Enable cashier invoice creation only after persisted invoice numbers and payment records are transactional.
8. Enable accounting posting only after balanced journal-entry transactions are tested.
9. Repeat the same checks in production before turning on real writes.

## Rollback Plan

Because the draft is additive, rollback should prefer disabling the app layer first:

- Set readiness back to inactive and keep all write actions disabled.
- Remove UI enablement flags for invoice persistence, payments, and accounting.
- If the migration was applied but no production data exists, a DBA can drop the new finance tables in reverse dependency order after backup.
- If production data exists, do not drop tables. Disable writes, export data, inspect audit events, and apply corrective migrations only after review.

## Transfer Checklist From Demo To Production

- Keep the Branda Finance feature gate active before showing the finance pages.
- Keep loyalty gated separately from finance.
- Do not migrate local preview values such as fixed invoice numbers, preview QR text, or local cart state.
- Create real invoice numbers only on the server from `finance_invoice_sequences`.
- Persist invoice items as snapshots so later menu product edits do not rewrite old invoices.
- Award loyalty points only after a persisted paid invoice exists.
- Generate reports only from persisted finance tables once enabled.
