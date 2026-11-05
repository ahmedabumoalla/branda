# Unified loyalty entry delivery

Published 2026-11-05T14:08:14.702Z

- GitHub main: 350cdf9601898d192dd144b3d6290fb232f58d6f
- Vercel: dpl_9cW5DmknAnXarTADZqKsQsw5AqnZ, READY; barndaksa.com and www.barndaksa.com point to this exact deployment
- User reference: compact Kawakib promotional banner, not the oversized Dabab preview

## Delivered behavior

One shared BrandLoyaltyEntry supplies a small tilted card stack on the left, readable RTL invitation on the right, inset outline and full-width cream download action below. It uses the actual brand name/logo and each identity palette. Dark surfaces support white/gold marks while the action remains light and readable. Mobile layout uses shrinkable text and a fixed small illustration; focus and reduced-motion behavior retained

Coverage: all Signature identities and future default Signature menus; Kawakib, Kath, Shahi, Taza, Deli; Loco; French Corner; legacy Bistro menus; all PublicSalon tenants; Together storefront. Existing unavailable/loyalty-only routes and inactive program gates remain intact

The entire banner follows the existing loyalty enrollment route with menu or salon source and router pending feedback. Normal and middle-click engagement remains tracked. This is a promotional invitation only, with no invented stamps or reward previews

No database, enrollment, wallet-card, stamp, reward, booking, catalog, financial, subscription or messaging mutation. Existing menu shortcuts and actual customer cards are preserved

## Verification

- Node v24.19.0, isolated release workspace, 172 input identities plus dependency manifests recorded in output/unified-loyalty/release-checks.json
- Text integrity, TypeScript, Signature643, universal-menu, Loco, French16, Salon66, Together behavior suites, scoped ESLint and production webpack build passed
- Local and production HTTP checked 26 canonical routes; production rendered 22 compact entries with available own logos and correct destinations; other routes retain their existing inactive/unavailable/loyalty-only gating
- Published CSS confirms compact mobile layout, 48px action, focus visibility and reduced-motion support; actual Dabab enrollment keeps the configured stamp count and owner reward
- Responsive/cascade/identity review by source and SSR; no browser inspection, real customer message or business mutation
- Evidence: output/unified-loyalty/{release-checks,local-runtime,production-runtime,publication}.json; scoped adapter evidence output/compact-loyalty/adapters-validation.json

## Remaining work

No remaining work for the requested promotional design unification
