# Editable finance quarterly discount

The finance plan's three-month discount is now editable from 0 to 100 percent, with two decimal places, like other plans. Removed the read-only 20% UI, forced-zero save normalization and fixed percentage in shared pricing, live quote and manual finance collection

Migration 20261031205340 converts the previously implicit 20% into stored plan configuration, retaining the current 1099 monthly price and effective quarterly total 2637.60 until the admin changes it. The finance term/upgrade restrictions remain. Historical subscriptions, quotes/payment requests, prices, expiry and function authorization are preserved

2026-10-31 verification, Windows/Node20.20.2 and Node24 build/PGlite:
- Admin UI handler edits 12.5 and submits it; server RPC/fallback save preserves that percentage
- Shared pricing, public catalog, subscription UI, manual collection UI and default-trial checks passed
- Isolated SQL119 includes configurable 0/12.5/100 percentages, unchanged month price, invalid percentages, forbidden user writes, manual collection and preservation of a payment request's saved price after later percentage changes
- Live rollback tests changed several percentages inside a transaction, verified authenticated quotes and unchanged historical rows/other plan fields/function privileges, then rolled back
- Migration applied and exact MD5 91f66b04daea9b7605534d334581ee44 verified
- Root/release TypeScript and text integrity passed; scoped lint has no errors and two existing unused compatibility-parameter warnings. Final Node24 production build passed
- No browser inspection needed for this numeric input fix; actual handlers and SQL were tested. No outgoing messages, payment initiation or permanent test records

Publication pending exact deployment verification. Evidence: output/finance-discount-verification.json and output/finance-discount-publication.json

This supersedes the fixed finance 20% rule in HOME_CATALOG_CONTACT_20261031.md

## Follow-up homepage requests

Six active cards now follow the requested order: loyalty, menu, menu+loyalty, marketing campaigns, finance, Plus. Presentation ordering leaves saved catalog order/data untouched; any additional purchasable plan follows these entries. Finance card lists ten real sections confirmed against components/finance/finance-navigation.ts. Removed the complete own-app promotion and phone illustration. Current user-edited prices (including finance189) and configured percentages stay live; no migration rerun or catalog writes. SSR confirms order, finance details, section removal and no input-array mutation. Final Node24 build and root/release TypeScript/text passed; no new browser inspection
