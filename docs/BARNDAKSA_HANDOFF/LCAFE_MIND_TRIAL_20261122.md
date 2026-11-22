# Al Cafe trial on the MIND options, 2026-11-22 (Claude)

## What the user asked

Open for the brand «ال كافيه» the same options that are open for MIND, as a 14-day trial counted from the day the account was created, then publish to GitHub and Vercel, update the handoff files and keep the deployment guard

## What was found, read only

- MIND (slug `mind-hospital`) holds one package, `plan-0f39875b` «باقة الادارة التقنية», active, with three services closed by the brand's service switches: offers, pager and marketing campaigns. So the options open for MIND are menu, loyalty, branches, finance and settings
- «ال كافيه» (slug `l-cafe-59cfdc54`, id `8a826ee6-d3d2-4538-8c5e-41109cc072c5`) signed up on 2026-11-19 at 18:56 Riyadh. It holds the signup trial alone (package `-`: menu, offers, loyalty, pager, branches, settings) until 2026-12-19, with no service switches. Compared with MIND it lacks finance, which is the integrated system and the point of sale
- A service switch can only close a service (`getEffectiveBrandFeatureAccess` in `lib/platform/feature-access.ts`). Finance has to come from a package that carries it
- The platform keeps one end date for all packages of a brand: trigger `zz_synchronize_brand_subscription_deadline` on `public.subscriptions`. One package cannot end earlier than the others. A 14-day trial from the creation day therefore ends the whole account on 2026-12-03 at 18:56 Riyadh, 16 days earlier than the signup trial would have

## Published: the code

Commit `323e6a0a` on main

- `lib/finance/sales-features.ts`: the MIND presentation (`isMindSalesSimplified`) is keyed on a short list of brands, MIND and `l-cafe-59cfdc54`. Add a brand only on the user's word
- `components/dashboard/integrated-system-navigation.ts`: the second brand shows the same ten sections as MIND. Two entries stay with the hospital account alone through `isHospitalStore`: the point of sale settings entry, which holds the WhatsApp invoice switch, and the loyalty registry placed under customers. The second brand keeps the standard point of sale entries and its own loyalty registry link
- `app/dashboard/system/customers/[[...segments]]/page.tsx` and `components/erp/customers/workspace.tsx`: the customer sections MIND does not show (appointments, contacts, CRM, settings) are hidden for the second brand too
- Every other screen that already follows `isMindSalesSimplified` follows it for the second brand with no further change: sales views, finance tabs, report families, purchase options, invoice settings
- This is presentation only. It grants nothing. Access still comes from the brand's packages, so until the package step below is done the brand sees no change, and when the trial ends the standard sidebar returns by itself

Checks on Node 20.20.2: `scripts/check-mind-navigation.cjs` extended for the second brand, 165 assertions pass. `check-finance-pos-settings`, `check-loyalty-branch-rollout` and `check-auto-loyalty-identity` pass. TypeScript exit 0, text integrity passed, deployment guard check passed. No browser, no message sent

Seven check scripts fail the same way on main before this change and were left as they are: `check-fawasel-dashboard`, `check-finance-loyalty-settings`, `check-loyalty-guide`, `check-invoice-detail-navigation`, `check-integrated-sidebar`, `check-customer-detail-navigation`, `check-erp-navigation-coverage`

Production: Vercel pending 14:02:06Z to success 14:02:57Z, 51 seconds

## Not done: the package

The database step was prepared and reviewed read only, then refused by the session's permission guard when Claude tried to apply it. Nothing changed in the database. It waits for the user's explicit word

What the step writes, the same rows the admin package tools write:

1. Package `plan-0f39875b` added to the brand as a trial that started with the account
2. One end date for the brand's packages: 2026-12-03 at 18:56 Riyadh
3. Two services closed like MIND, because this package would otherwise open them: marketing campaigns and the pager. Nothing the brand already has is taken away

The same result from the admin panel, in the brand file of «ال كافيه»: add the package «باقة الادارة التقنية», set the end date to 2026-12-03 18:56, close the pager and marketing campaigns

The prepared file is `supabase/migrations/20261122140500_lcafe_mind_trial_packages.sql`, kept out of main until it is applied so that nobody applies it by accident. It changes nothing when the brand already holds the package

Open point for the user: the single end date. If the signup trial should stay until 2026-12-19, the finance options stay until that day as well, because the platform cannot end one package earlier than the others
