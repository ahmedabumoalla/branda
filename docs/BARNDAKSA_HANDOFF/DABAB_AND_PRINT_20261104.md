# Dabab and current-account print delivery — 2026-11-04

## Scope and established rules

- Dabab existing account: `brand-8ad185ee82e3`, cafe `3813425d-db13-4d30-8b82-9d41aad12e36`
- Official source: `https://dabab-bakery.github.io/` and its published `data/menu.json`; the source QR's `/menu` route returns404, so the verified root/catalog was used
-104 source items in17 categories;102 priced items are published and2 unpriced coffee beans remain disabled in the owner's catalog, explicitly instructed by the user
-36 original item photographs retained; missing original photographs use a decorative brand placeholder, without fabricated dish pictures or nutrition
- Original code-native Arabic/Latin wordmark rendered with the official site's Cairo700 typeface; transparent white logo on forest green
- Decorative coffee/bakery hero is illustrative; provenance retained in `output/dabab`
- Loyalty: six stamps and an actual10%discount reward, with Apple/Google wallets; preserve existing account/category/subscription/customer data
- No customer passes or messages are created during setup or verification

## Implementation and evidence

- `data/imports/dabab-source-20261104.json`: original catalog, source hashes, verified prices, photo mapping, original wordmark provenance and dark loyalty palette
- `scripts/prepare-dabab-import.cjs` and `scripts/verify-dabab-import.cjs`: guarded import, private media and exact readback
- `supabase/migrations/20261103235834_dabab_catalog_loyalty.sql`: versioned catalog/identity/loyalty import
- `output/dabab/original-wordmark-provenance.json`: source CSS/font records, original HTML/PNG rendering and transparent WebP SHA256
- `output/care-et1/`: shared application check/build input hashes, command times, local/production runtime and exact deployment evidence
- Shared Arabic title word boundary fixed for Damascus and ET1; ET1 copy revised to the user's requested clearer phrase

## Print delivery

- Six A4 posters: Care Salon loyalty; Damascus menu; ET1 menu and loyalty; Dabab menu and loyalty
- Each poster includes vector PDF, PNG2480×3508 at300dpi and QR SVG
- Delivery: `C:/Users/pc/Downloads/Branda-New-Accounts-QR-20261104`
- Dabab has a separate two-page `Dabab-Menu-and-Loyalty-A4.pdf`
- Generators and final QR/dimensions/overflow/visual-review evidence: `output/current-account-print`

## Current status

- Original logo and source verification complete
- Root/release text integrity, TypeScript,529 SignatureMenu regressions, scoped lint and Node24 production build passed; command times and affected input identities recorded in the check reports
- Live import verified at2026-11-04T00:29:59Z:104 rows/102 public/17 categories/37 private assets; source prices and variants exact, two unpriced drafts disabled and68 image paths NULL
- Migration live history MD5: `c69becc434970ad93a4c8d2c8bd0e789`; rollback/repeat/owner-change protection, foreign writes, draft/media isolation and actual6-stamp/10%reward trigger passed
- All37 signed asset hashes/access and denied public paths passed; Google class approved and logo endpoint200, Apple credential readiness passed
- Evidence: `output/dabab/{applied,readback,import-verification,backend-rollback-result,backend-staged-media,loyalty-wallet-activation}.json`
- Final print PASS: A4 pages and vector QR,300dpi PNGs, no overflow, final PNG QR decoding at1600/794px and PDF renders at120dpi, all six destinations HTTP200 and visual review
- Dabab two-page PDF SHA256 `bf7665314aff79a6a48e1ad1fd53d6fe5d1702ede648e35deb60e70797bb107b`; merged six-page PDF `d80e39da83231bb2022833085acfc00e8ca7902faca97c998f1acfd74a453a20`; ZIP `9c94a651a300bbbdffcf723761a0eb730fa92ad1e092ed0b19c3e0e74a18c3b9`
- Application release 8dfe582a61da9cb5eedb242e1c3ed8ff673b487a published and verified 2026-11-04T00:33:53.990Z: Vercel dpl_6zMb3rAYaF6t7iJHdzDqsZ8oZdAt READY on both production aliases. Live routes confirm Care own salon logo, ET1 96 products/15 categories and corrected title, Dabab102 products/17 categories/2 disabled drafts/36 original photos, actual6/10 loyalty and exact identity assets. Damascus title spacing and existing Korma/19 preserved. Evidence output/care-et1/application-publication.json and production-runtime.json
- No application browser inspection used
