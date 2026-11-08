# Hulm identity and close product framing

- Existing brand: `brand-96f3dda4f1ea`, cafe `948d09e1-93bd-4b23-be49-f1599603f4ba`
- Direction follows the owner's November 8 storefront photograph: pale sage, darker green text/actions, antique gold details and off-white surfaces; original gold logo and arches retained
- Scoped colors cover hero, menu, loading, footer and product details; other brand palettes are unchanged
- All 21 current product images were downloaded and visually reviewed; 12 distant photos receive individual CSS framing, while the 9 existing close photos retain their framing
- Framing applies to cards and product details and is bound to both product identity and immutable filename; replacement uploads and other brands do not inherit old zoom values
- Original image files, product names, current prices, availability and other product fields are preserved
- Category order: croissants (9), cheesecake (2), cake (8), remaining pastries (2)
- Applied guarded migration `20261108000100_hulm_catalog_order.sql`, MD5 `a5d753fa07e560ae5e0802d27743f26b`; rollback test and fresh readback verified categories and preservation of all 21 product records outside category/update timestamp
- Checks: root/release TypeScript and text integrity, 730 signature menu tests including tenant/replacement framing guards, scoped lint, CSS compilation, diagnostic framing sheet and isolated Node24 webpack build
- No application browser, messages, account changes, image regeneration or Storage writes
- Evidence: `output/hulm-refresh/` including catalog-before, framing-preview, rollback-test, applied, database-verified, checks, build and publication records
- Root source remains on the stable local3019 development server; isolated builds are separate
- Publish through GitHub main and verify Vercel's commit status plus live menu/assets on both hosts; direct Vercel API credentials currently return403, so do not claim API alias verification
