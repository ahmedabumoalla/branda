# Admin brands: pick packages on a new account, edit any account, see its package and price

2026-11-21 Riyadh, by Claude. PUBLISHED 2026-11-21 after the user wrote the publish word, pushed to main in the commit that carries this line, from an isolated branch based on `605be962`. No database migration and no data written by this work

## What the user asked

For every brand, from the brands page of the platform administration (`/admin/cafes`)

1. When creating a new account, choose the packages it is created on instead of the automatic trial package, with the same trial period rules
2. After creating any account, edit its data from the administration
3. See which package an account runs on and the subscription price that was calculated for it

## What changed

### 1 Packages on a new account

- The create form has a required الباقات section listing every active package. Trial rules are unchanged: the clock starts when the login details are sent, a month for the menu, loyalty, menu with loyalty and trial packages and 7 days for the others
- `lib/data/admin-brand-account.ts` `createAdminBrandAccountWithPlans`: verifies the picked packages are active, calls the existing untouched `createAdminBrandAccount`, then `replacePreparedBrandPlans` (new, in `lib/data/admin-brand-subscriptions.ts`) adds the picked packages and removes the automatic one through the existing `admin_add_brand_plans` and `admin_remove_brand_plans` functions with their revision guard
- If the account is created but the package step fails, the account stays on the default trial package and the administrator is told to adjust packages from the brand file
- Known side effect: when the default trial package is not among the picked ones it stays in the brand history as one cancelled row, so عدد الاشتراكات counts it. Creating the account directly on the picked packages needs a database change to `admin_prepare_brand_account` and `complete_account`, not done because database changes are not authorised

### 2 Editing any account

Brand file, section بيانات العلامة, two buttons

- تعديل بيانات العلامة: name, English name, activity, short link. Only changed fields are written through the administrator session. The short link can change only while the account waits for its login handoff, afterwards it is fixed so customer links and QR codes keep working
- تعديل بيانات المالك والدخول: owner name, login phone, email, password
  - account waiting for its handoff: the existing staged flow, unchanged
  - handoff being sent: refused until the send state is settled
  - delivered or self-registered account that signs in with a phone: phone and password change on the live login, then profile and settings
  - account that signs in with an email: phone and email are saved as contact details only, the login email is not changed, a new password still applies, and the administrator is told so
- An audit row `admin_brand_owner_updated` records which kinds of fields changed, never the values
- The welcome message now greets the owner with the saved brand name, so a brand renamed before sending is not greeted with its old name (`sendBrandOwnerWelcome` in `lib/data/admin-brand-onboarding.ts`)

### 3 Package and subscription price

- Brand file overview: a card with the package the account runs on and سعر الاشتراك المحسوب
- Section الباقات والاشتراك: every current package with the price recorded on its subscription, discount and base price when present, the list price of the package for comparison, duration, activation method and dates. Earlier subscriptions are under a collapsed list
- Source is `subscriptions.amount_sar` and related columns, read once per opened brand file by `lib/data/admin-brand-billing.ts`. On 2026-11-21 13 of 125 subscription rows carried an amount; packages activated by the administration without a price show بدون مبلغ مسجل. `platform_finance_entries` is empty, so nothing is read from it

## Files

New: `lib/data/admin-brand-account.ts`, `lib/data/admin-brand-billing.ts`, `components/admin/brand-account-editors.tsx`, `components/admin/brand-profile-editor.tsx`, `components/admin/brand-billing.tsx`, `components/admin/brand-billing.module.css`, `scripts/check-admin-brand-account.cjs`

Modified: `app/actions/admin-brand-onboarding.ts`, `components/admin/brand-account-create.tsx`, `components/admin/brand-details-dialog.tsx`, `components/admin/brand-onboarding.module.css`, `components/admin/brand-owner-editor.tsx`, `components/admin/pages/admin-cafes-page.tsx`, `lib/data/admin-brand-onboarding.ts`, `lib/data/admin-brand-subscriptions.ts`, `lib/data/admin.ts`, `lib/platform/admin-data.ts`, `lib/platform/brand-onboarding.ts`, `scripts/check-brand-owner-welcome-server.mjs`

## Evidence

- Full TypeScript on the release worktree passed, text integrity check passed, ESLint on the changed files 0 errors
- `node scripts/check-admin-brand-account.cjs`: 36 groups passed (stubbed, no database)
- `node scripts/check-brand-owner-welcome-server.mjs`: 35 checks passed (31 before, 4 added for the saved brand name)
- Still passing as before: `check-admin-brand-subscriptions.mjs`, `check-admin-owner-edit-server.mjs`, `check-barbershop-category.cjs`, `check-brand-directory.mjs`, `check-brand-owner-welcome-ui.mjs`
- Already failing before this work with the same error and left alone: `check-admin-cafes-freshness.mjs`, `check-admin-multi-plan-ui.mjs`, `check-brand-maintenance-entry.mjs`, `check-butcher-category.cjs`, `check-data-hot-paths.mjs`, `check-subscription-quotes-ui.cjs`
- Read only on the live database: the grants and policies the feature relies on exist (administrator session may update `cafes` and `cafe_settings` and run the package functions, the service role may update `profiles` and insert `audit_logs`), and the subscription price columns exist
- NOT done: no account was created or edited against the live database and no browser inspection, because a real test would leave a real account. The user tests on the local server

## Publication checks

On the release branch before the push: `scripts/check-admin-brand-account.cjs` 36 groups, `scripts/check-brand-owner-welcome-server.mjs` 35 checks, text integrity, and the full production build with TypeScript all pass. Deployment size guard: `scripts/check-deployment-size.mjs` passes and the build reports 266 routes, 6598 MB, 0 problems

Still for the user on the live site, because a real test leaves a real account: on `/admin/cafes` create one account with two packages and confirm the brand file shows both as ready, edit its name, and open الباقات والاشتراك for a paid brand to confirm the price
