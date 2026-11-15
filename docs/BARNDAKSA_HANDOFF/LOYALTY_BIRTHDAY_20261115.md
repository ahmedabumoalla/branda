# Loyalty birth date and birthday greeting - مقص 77 - 2026-11-15

Author: Claude, on the owner's request of 2026-11-15. Brand: مقص 77, slug `brand-edbc2c01385b`, cafe id `d4a19dc5-ef99-4aec-86ae-0bebc7bbd59e`. Other brands are unchanged

## Behaviour

- Loyalty card page `/loyalty/brand-edbc2c01385b`: the enrollment form asks for name, phone and birth date. The birth date is required in the form for this brand only
- The birth date is stored once. A later enrollment with the same name and phone does not overwrite a stored date
- Customer registry: the customer file shows the phone and, for this brand, the birth date or "لم يسجل تاريخ الميلاد"
- Birthday greeting: on the customer's birthday, from 09:00 Riyadh time, one WhatsApp message is sent in the name of the brand through the platform loyalty sender, the same sender as the wallet welcome message. One greeting per customer per year. A birthday on 29 February is greeted on 28 February in non-leap years. A greeting that could not leave on the day is dropped, not sent late. An ambiguous delivery is never retried
- Greeting requires: active customer with an active loyalty card, valid Saudi mobile, active brand with loyalty enabled and not cancelled

## Database, applied to production

`supabase/migrations/20261116020000_loyalty_birthday_greetings.sql`, applied directly with the management CLI and not registered in the migration history table. Do not reapply

- Column `customer_profiles.birth_date`
- Tables `loyalty_audit_private.birthday_settings` (one row, مقص 77) and `loyalty_audit_private.birthday_greetings`
- Functions `loyalty_birthday_enabled`, `set_loyalty_customer_birth_date`, `claim_loyalty_birthday_greeting`, `finish_loyalty_birthday_greeting`
- `finance_loyalty_customer_detail` now also returns `birthdayEnabled` and `birthDate`

To enable the same for another brand: insert its cafe id into `birthday_settings` and add its slug to the form condition in `components/rast-loyalty/rast-enrollment.tsx`

## Code

- `lib/platform/maqas77.ts`, `lib/wallet/birthday.ts` new
- `components/rast-loyalty/rast-enrollment.tsx`, `app/actions/loyalty-experience.ts`, `lib/data/loyalty-enrollment.ts`: optional birth date
- `components/loyalty/customer-directory.tsx` and its CSS, `lib/data/loyalty-customers.ts`, `lib/loyalty/customer-directory-types.ts`: birth date in the customer file
- `app/api/wallet/jobs/route.ts`: the existing every-minute wallet job also dispatches birthday greetings. A failure there does not affect wallet notifications or welcomes

## Verified

- Migration and its functions exercised against live data inside a rolled-back transaction: future date rejected, other brand rejected, stored date not overwritten, claim returns the brand and customer, a second claim the same year returns nothing
- TypeScript and text integrity pass

## Not verified

- No browser test of the form or the customer file
- No real greeting was sent. The 17 existing customers have no birth date, so none is greeted until they or new customers enter one
- A customer who already opened the card on a device is not asked again on that device while the saved session lasts
