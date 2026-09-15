# Unified standalone menu design

Production deployment: dpl_CTxSYm7csYJizZtE5hXr5cow4XeE
URL: https://branda-2-qhxrtzlce-ahmedabumoallas-projects.vercel.app
Promoted to https://barndaksa.com on 2026-09-07

All brands now share the reference menu layout previously restricted to Double B
Shared cream catalogue, category tiles/counts, filters, search, card geometry, price placement, header controls and responsive behavior
The account's original logo is displayed in the header and closing signature
Brands without uploaded logos display their own names
Double B retains its existing decorative hero image
Other brands use their own first available product photograph in the hero
Empty catalogues do not borrow another brand's product photograph
No cart, login, order flow, source catalogue mutation or publication-rule change

## Deferred logo extraction

The user explicitly chose to complete the design and defer logo background removal after the built-in image editing output failed quality inspection
No generated logo assets are referenced by the application or included in the isolated production snapshot
Original account logos and their backgrounds are retained
Rejected workspace previews were moved out of public assets to .codex-tmp/rejected-menu-logos
Original account files were not overwritten
The exploratory built-in prompts and source output paths are recorded in menu-logo-generation-20260907.json
Those outputs are not approved production assets

## Checks

- TypeScript, Arabic text integrity and scoped ESLint passed
- Standalone menu and feedback regression checks passed
- Production build passed before promotion
- Browser checks at 320, 375 and 1440 pixel widths
- Basilico search, filtering panel, reset and product details checked
- Empty menu and long brand name checked
- Staged Basilico page verified to contain the shared theme, logo header and 31 product cards
- Post-promotion anonymous verification passed for all 22 routes with the shared theme and all 676 correctly isolated product cards
- Published Basilico header logo, no horizontal overflow and information dialog verified in the browser
- Known unrelated Node 20 deprecation and dashboard static-render diagnostics remain unchanged

## Skills

Frontend design and UI/UX review guided reuse of the approved visual system and responsive identity header
Image editing was attempted using the built-in tool but its output was rejected rather than published
