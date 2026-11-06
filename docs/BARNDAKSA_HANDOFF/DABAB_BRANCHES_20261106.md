# Dabab three branches
Published application verified 2026-11-06T09:49:49.025Z

## Links and management

| Branch | Public menu | Owner products | Public products |
| --- | --- | ---: | ---: |
| بار ضباب | https://barndaksa.com/menu/brand-8ad185ee82e3?branch=bar | 28 | 28 |
| فرع الكوفي | https://barndaksa.com/menu/brand-8ad185ee82e3?branch=coffee | 79 | 77 |
| فرع المستشفى | https://barndaksa.com/menu/brand-8ad185ee82e3?branch=hospital | 79 | 77 |

The original brand URL still selects the primary Bar branch. All three are under the existing Dabab account, not new accounts. Owner controls use /dashboard/branches and the branch selector in /dashboard/menu. Coffee and Hospital initially share the same catalog content but have independent editable product/category IDs

## Established behavior

- Bar preserves its 28 product IDs, names, prices/options, photos, category and existing visual identity
- Coffee uses the original QR source 104 minus 25 reviewed Bar matches; Hospital receives the same 79 entries and 17 categories
- كيتكات برازيلي and قوجي إثيوبي have no confirmed source prices and stay unavailable in both owner menus; neither their draft data nor photo URLs reach public output
- Coffee has warm ivory/terracotta coffee-and-bakery artwork; Hospital uses a separate lighter ivory/sage split composition. Both use the real wheat logo and omit unverified branch location links
- The three-branch navigation preserves URL query context and resets client catalog selection when branches change
- All three retain the approved compact Kawakib-style loyalty entry and existing shared enrollment: https://barndaksa.com/loyalty/brand-8ad185ee82e3?source=menu
- Actual loyalty remains 6 stamps, custom iced-tea/hibiscus reward, 30-day validity. Historical 10% defaults were not restored
- Products/categories total 186/35, with 182 public products. Customer/card counts were 10/10 during the transaction; future customer activity is independent

## Images and source

Original source https://dabab-bakery.github.io/data/menu.json matched SHA256 c4ba9f978e6d79195a3661e1ba53adaf24d041a867b378f1451bf6005ce6b39f
Reviewed source is versioned at data/imports/dabab-branches-20261106.json
Both new menus share 79 unique private photos: 36 original photographs and 43 generated images, including images for the two hidden entries. Generated with the built-in image_gen tool; no public approximation labels were added
Final product files and generated originals: output/dabab-branches/generated
Complete source/image mapping and hashes: output/dabab-branches/assets-manifest.json
Exact saved prompt set and final paths: output/dabab-branches/image-prompts.json
Four public hero assets under public/menu-art/dabab: dabab-coffee-hero-v1.webp, dabab-coffee-hero-mobile-v1.webp, dabab-hospital-hero-v1.webp and dabab-hospital-hero-mobile-v1.webp. Hashes are in output/dabab-branches/assets-heroes.json
Private objects belong to the Dabab tenant in menu-products/3813425d-db13-4d30-8b82-9d41aad12e36/dabab-branches; Storage remains private

## Verification and publication

- Migration20261106090916_dabab_three_branch_catalog committed atomically with its history; MD5 a32b3e127969e7191896cc6660436845
- 43 local PostgreSQL checks, guarded live rollback, owner edits/anonymous RLS checks and independent exact catalog/media readback passed
- All 128 protected snapshots matched inside the transaction. A later concurrent change to the global wallet_passes table was observed separately; the import wrote no wallet rows and issued no passes or messages
- Release Node v24.19.0: text integrity, TypeScript, Signature 724, branch-switcher/navigation, SQL 43, scoped application lint and production build passed
- Local and production HTTP checks passed: three branch layouts, 105 unique visible product images, exact hero/logo bytes, hidden drafts, invalid/cross-brand isolation, owner-route protection and existing loyalty
- No browser check was performed under the project browser policy
- Application commit 26019663a7fb319e95ec8144e6e81978784c32b7; Vercel dpl_2HFeQ7XcUttz5g13AadduiDmCN9S READY, verified on barndaksa.com and www.barndaksa.com
- Evidence commands, execution times, source/config/dependency identities and logs are in output/dabab-branches/release-checks.json, sql-checks.json, applied.json, local-runtime.json, production-runtime.json and publication.json

No pending implementation work. New branches can now be maintained independently in the owner panel
