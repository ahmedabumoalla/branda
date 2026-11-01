# Together commerce activation and performance

## Verified operating state

- Brand `4e5a661a-7029-40ec-a3bc-dc75959a05bb`, storefront `/menu/brand-871ec6e243c0`
- No saved `gift_store_settings` row and zero orders at inspection; public settings are null, so ordering is intentionally disabled
- Menu and `finance` entitlements are active; approved zero-charge finance trial expires `2026-11-08T00:14:03.199768Z`. `brand_finance` is not the service key
- Owner role and settings/order authorization verified live without persistent mutations
- Acceptance changes fulfillment status. Confirming actual collection creates one paid sale, customer, balanced ledger, tax/cost and inventory effects. Retry and refund behavior passed 408 checks; relevant live function bodies match tested migration
- Evidence: `output/together/finance-audit-verification.json`, `output/together/commerce-inspect.json`

## Pending business configuration

- User previously required owner-controlled delivery/payment choices. Do not silently invent delivery fees, pickup promises, bank details or merchant credentials
- User explicitly deferred both fulfillment/payment configuration and merchant gateway choice; requested an icon only for now
- Added owner header delivery/payment shortcut and a read-only electronic-payment card marked unconnected; no gateway fields or automatic settings save
- No gateway keys requested in chat. Branda subscription Paymob credentials and webhook are reserved for platform subscriptions

## Independent merchant checkout design

1. Connect the brand's own approved merchant account through owner-authorized server configuration, with private credential storage and masked readiness metadata
2. Each checkout uses only that brand's provider credentials, server-calculated order total/currency and an opaque order/attempt reference. Never fall back to platform subscription credentials
3. Card entry occurs in the provider-hosted checkout or provider tokenization component; Branda does not receive raw card numbers
4. Verify the signed webhook and provider payment state against the bound merchant, order, amount and currency. Browser redirect alone is not proof of payment
5. Use an idempotent internal payment-to-ledger path with the configured collection account/warehouse; do not impersonate an owner session from a webhook. Preserve existing accounting/refund invariants
6. Verify test-mode success, failure, retry, duplicate callbacks, mismatched tenant/amount and refund before live activation

Official references checked during investigation:
- https://developers.paymob.com/paymob-docs/intention-apis/create-intention
- https://developers.paymob.com/paymob-docs/integration-paths/apis
- https://docs.moyasar.com/api/authentication

## Implemented fixes and validation

- Owner orders page opens settings automatically only when configuration is genuinely missing, with explicit activation instructions; load errors remain errors
- Together product images now use tenant-restricted responsive optimization, small thumbnails and stable post-authorization signatures; availability/pricing/entitlements are not cached
- Only the last product dialog remains mounted when closed, preserving the selected photo. It releases scroll/focus correctly and does not suppress the floating cart. Removed products and shrinking galleries are handled
- Prefetch only the next gallery image; browser-local decoded references capped at four images with five-minute reuse eligibility, no persistent private capability storage
- Local sample original102854B becomes128px2088B,384px10240B,828px29818B; reductions98%/90%/71%. Development cache timings are not production latency guarantees
- Finance settings/accounts/warehouse are lazily initialized by the existing owner snapshot. Cash collection still requires a real owner shift; no shift or tax-registration assumption was created
- Focused image/store/tenant-isolation/owner UI21 checks passed. Root/release TypeScript/text and scoped ESLint passed. Source/security review found no newly widened tenant access
- Publication and production optimizer header evidence are recorded in `output/together/commerce-speed-publication.json` and `output/together/photo-performance-after.json`
- Activation and online payment are deferred by explicit user instruction; owner will configure later
- Follow-up owner UI23, CSS compilation, text integrity, TypeScript and scoped lint passed; publication tag together-payment-placeholder-20261101
