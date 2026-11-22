# Al Cafe trial on the MIND options, 2026-11-22 (Claude)

## What the user asked

Open for the brand «ال كافيه» the same options that are open for MIND, as a trial counted from the day the account was created, then publish to GitHub and Vercel, update the handoff files and keep the deployment guard

The first wording was a 14-day trial. After hearing that the platform keeps one end date for all packages of a brand, the user approved the database change and chose to keep the brand's current end date, 2026-12-19, instead of shortening the whole account

## What was found, read only

- MIND (slug `mind-hospital`) holds one package, `plan-0f39875b` «باقة الادارة التقنية», active, with three services closed by the brand's service switches: offers, pager and marketing campaigns. So the options open for MIND are menu, loyalty, branches, finance and settings
- «ال كافيه» (slug `l-cafe-59cfdc54`, id `8a826ee6-d3d2-4538-8c5e-41109cc072c5`) signed up on 2026-11-19 at 18:56 Riyadh. It held the signup trial alone (package `-`: menu, offers, loyalty, pager, branches, settings) until 2026-12-19, with no service switches. Compared with MIND it lacked finance, which is the integrated system and the point of sale
- A service switch can only close a service (`getEffectiveBrandFeatureAccess` in `lib/platform/feature-access.ts`). Finance has to come from a package that carries it
- The platform keeps one end date for all packages of a brand: trigger `zz_synchronize_brand_subscription_deadline` on `public.subscriptions`. One package cannot end earlier than the others

## The code

Commit `323e6a0a` on main

- `lib/finance/sales-features.ts`: the MIND presentation (`isMindSalesSimplified`) is keyed on a short list of brands, MIND and `l-cafe-59cfdc54`. Add a brand only on the user's word
- `components/dashboard/integrated-system-navigation.ts`: the second brand shows the same ten sections as MIND. Two entries stay with the hospital account alone through `isHospitalStore`: the point of sale settings entry, which holds the WhatsApp invoice switch, and the loyalty registry placed under customers. The second brand keeps the standard point of sale entries and its own loyalty registry link
- `app/dashboard/system/customers/[[...segments]]/page.tsx` and `components/erp/customers/workspace.tsx`: the customer sections MIND does not show (appointments, contacts, CRM, settings) are hidden for the second brand too
- Every other screen that already follows `isMindSalesSimplified` follows it for the second brand with no further change: sales views, finance tabs, report families, purchase options, invoice settings
- This is presentation only. It grants nothing. Access comes from the brand's packages, so when the trial ends the standard sidebar returns by itself

Checks on Node 20.20.2: `scripts/check-mind-navigation.cjs` extended for the second brand, 165 assertions pass. `check-finance-pos-settings`, `check-loyalty-branch-rollout` and `check-auto-loyalty-identity` pass. TypeScript exit 0, text integrity passed, deployment guard check passed. No browser, no message sent

Seven check scripts fail the same way on main before this change and were left as they are: `check-fawasel-dashboard`, `check-finance-loyalty-settings`, `check-loyalty-guide`, `check-invoice-detail-navigation`, `check-integrated-sidebar`, `check-customer-detail-navigation`, `check-erp-navigation-coverage`

Production: Vercel pending 14:02:06Z to success 14:02:57Z, 51 seconds

## The package

Applied on 2026-11-22 at 14:11Z on the user's explicit word, from `supabase/migrations/20261122140500_lcafe_mind_trial_packages.sql`. It writes the same rows the admin package tools write, and changes nothing if run again

1. Package `plan-0f39875b` added to the brand as a trial that started with the account and ends on the brand's current end date, 2026-12-19 at 18:56 Riyadh
2. Two services closed like MIND, because this package would otherwise open them: marketing campaigns and the pager. The pager sends WhatsApp notices to customers, so it stays closed until the user says otherwise. The brand file in the admin panel can open either one
3. One audit line, `admin_brand_plans_added`, with a note that it came from the user's request through Claude

Verified read only after the change: two standing packages with one end date, services open for the brand are menu, offers, loyalty, branches, settings and finance, pager and marketing campaigns closed. The signup trial row was not touched. Migration history holds version 20261122140500 with the file's checksum `7b0e9e4424b46d709723287020842c3f`

Not verified: nobody signed in as the brand owner to look at the sidebar or open the point of sale. The finance workspace prepares itself on first use, as it does for any brand that takes the finance package

## For whoever continues

- To end the trial earlier or extend it, change the end date from the brand file in the admin panel. It moves both packages together
- To take the MIND options away before the end date, remove the package «باقة الادارة التقنية» from the brand file. The signup trial stays
- If the brand later buys the finance package, decide with the user whether it keeps the MIND presentation or goes back to the standard sidebar, by removing its slug from `mindPresentationSlugs`
