# Individual coupons from brand analytics

## Delivered behavior

- In `/admin/brand-analytics`, select a brand, create a campaign and choose `كوبون شخصي`
- Keep the existing inactive, loyal and custom absence segments, full audience review, immediate/Riyadh scheduled dispatch and original message/text-offer modes
- Configure a percentage or fixed SAR discount, minimum invoice, validity days and optional terms
- Each selected eligible customer receives a different single-use code bound to that brand and registered phone
- WhatsApp preview includes the same structured terms as the actual message with an explicit placeholder for the unique code
- Validity starts when the immediate campaign is created or at the selected scheduled time, as explained in the form
- The existing Branda sender/queue supplies each recipient's own persisted message without changing pacing, suppression or uncertain-attempt safeguards
- At `/cashier`, use `صرف كوبون خاص`: enter code, registered phone and invoice subtotal, review server-calculated discount/net, then explicitly confirm redemption
- Owners access the same flow through their existing open-operation-point action
- Redemption records the discount and remaining total; it does not collect payment or create an unrelated POS sale
- Successful coupon redemption counts as a visit for absence, return frequency, retention and peak hours, and appears in customer history as `صرف كوبون شخصي`
- Coupon visits do not add loyalty stamps or increase loyalty reward redemption totals

## Authorization and integrity

- Active platform admin required for creation; cashier session, current brand, permission and loyalty entitlement required for preview/redemption
- Codes live in a private ledger with RLS and no direct browser/service table access; service-only RPCs validate actor/session independently
- Atomic mint/enqueue, immutable customer/phone binding, one redemption and same-request reconciliation prevent duplicates or sharing between customers/brands
- Expired, disabled, canceled, unsent, blocked/conflicted and wrong-phone coupons cannot be redeemed
- Original segment is rechecked before message dispatch, but a returning customer may redeem their already-sent coupon after leaving that segment
- Zero-rounded discounts cannot consume coupons; fixed discounts are capped at invoice subtotal
- No real campaigns, coupons, redemptions or WhatsApp messages were created during verification

## Verification and evidence

- Migration `20261105080819_analytics_individual_coupons.sql`, normalized MD5 `f68e74f8d74fe52ea8d7e100cc18ed1f`, SHA256 `933e2259704808684c24ee7028ca4c04351671e8652ddd5acaf9cb5c67ed80a6`
- Root/release UTF-8 integrity, TypeScript, coupon server46, campaign server87, analytics47, campaign UI106, cashier coupon UI67, analytics UI66, scoped lint and Node24 production build passed
- SQL109 plus previous targeted56/analytics77 and original platform queue rollback suite passed, including code/message isolation, authorization, concurrency/idempotency, expiry, zero discount, existing scanner and analytics invariants
- Existing WhatsApp campaign, cashier phone/scanner and loyalty UI regression passed
- Branda PDF generated and checked with63 synthetic customers/32 pages after visit-definition update
- Scoped lint has one pre-existing unused test-image prop warning in `check-universal-loyalty-ui.mjs`, no errors
- Safe live rollback verified guards, no business row changes, identical analytics without coupons and restored previous SQL hashes before application
- No application browser used; affected UI handlers, responsive source, CSS, API and database boundaries checked
- Evidence: `output/analytics-coupons/{local,release,build}-checks.json`, `sql-checks.json`, `live-rollback.json`, `live-restored.json`, `live-application.json`, `publication.json`

## Next action

- Admin sets the intended discount/terms and explicitly confirms a real campaign; no campaign is launched automatically
- Exact live migration and production commit verification is appended below after publication
