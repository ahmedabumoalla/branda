# Unified loyalty entry delivery

Published 2026-11-05T14:29:07.573Z

- GitHub main: b4dadc3932cab06dcfa4b835cabe67194dc3e379
- Vercel: dpl_HUv5kKoDiG67apATGUH45DN3eqv6, READY; barndaksa.com and www.barndaksa.com point to this exact deployment
- User reference: compact Kawakib promotional banner, not the oversized Dabab preview

## Delivered behavior

One shared BrandLoyaltyEntry supplies a small tilted card stack on the left, readable RTL invitation on the right, inset outline and full-width cream download action below. It uses the actual brand name/logo and each identity palette. Eight identities (Korma, Hadiqa, Arabi, Masala, Damascus, Box, RAST and Sadeem) opt into a110x128 ivory outer card with94x88 logo area and readable single caption. Korma/RAST/Sadeem use light logo plates; light/gold marks use dark plates. Duplicate tiny name/icon removed only in this variant. User-approved Dabab/Deli/French banners retain their initial markup and CSS. French loading screen now references the exact published processed logo as official-logo-transparent-v1.webp, with real alpha, full Arabic/English lettering and no blend workaround. No logo was regenerated or edited. Mobile layout uses shrinkable text and a fixed small illustration; focus and reduced-motion behavior retained

Coverage: all Signature identities and future default Signature menus; Kawakib, Kath, Shahi, Taza, Deli; Loco; French Corner; legacy Bistro menus; all PublicSalon tenants; Together storefront. Existing unavailable/loyalty-only routes and inactive program gates remain intact

The entire banner follows the existing loyalty enrollment route with menu or salon source and router pending feedback. Normal and middle-click engagement remains tracked. This is a promotional invitation only, with no invented stamps or reward previews

No database, enrollment, wallet-card, stamp, reward, booking, catalog, financial, subscription or messaging mutation. Existing menu shortcuts and actual customer cards are preserved

## Verification

- Node v24.19.0, isolated release workspace, 174 input identities plus dependency manifests recorded in output/unified-loyalty/release-checks.json
- Text integrity, TypeScript, Signature671, universal-menu, Loco, French17, Salon66, Together behavior suites, scoped ESLint and production webpack build passed
- Local and production HTTP checked 26 canonical routes; production rendered 22 compact entries with available own logos and correct destinations; other routes retain their existing inactive/unavailable/loyalty-only gating
- Published CSS confirms compact mobile layout, 48px action, focus visibility and reduced-motion support; actual Dabab enrollment keeps the configured stamp count and owner reward
- Responsive/cascade/identity review by source and SSR; no browser inspection, real customer message or business mutation
- Evidence: output/unified-loyalty/{release-checks,local-runtime,production-runtime,publication}.json; scoped adapter evidence output/compact-loyalty/adapters-validation.json

## Clarity evidence

Source image bounds confirmed that Hadiqa previously appeared about57x19px and now about90x30px. Korma appears94x48px on a contrasting cream surface. Source layout review confirms fitting128px height and126/156/196px copy width at320/350/390px. Existing RAST/Sadeem horizontal source logos have small intrinsic content; larger presentation preserves the originals. Full first-release evidence is retained under output/unified-loyalty/initial-release. French asset provenance and alpha checks are under output/french-loading

## Remaining work

No remaining work for the requested promotional design unification
