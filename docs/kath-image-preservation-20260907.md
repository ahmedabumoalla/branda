# Kath image preservation status

The user supplied the original public collection at https://barndaksa.com/c/kat-coffe/products/popular

Browser inspection confirmed six image elements fail to decode with naturalWidth zero and external URLs returning HTTP 404

The collection uses the same product IDs and external URLs as the standalone menu

57 external images currently work and four products already reference private Storage assets

Prepared scripts/persist-kath-menu-images.cjs to preserve exact image bytes under tenant/product isolated paths with optimistic concurrency and no overwrite or deletion

Execution stopped on permission denied for table menu_products at the first UPDATE

No product records changed and zero images were linked

One content-hashed image copy was uploaded and verified in private Storage before the denied update and remains unreferenced for a later authorized retry

Pre-change product snapshot is stored locally under .codex-tmp/kath-image-preservation

The active dashboard session belongs to test-cafe rather than Kath and was not used for mutations

Needs a legitimate Kath editing session or an authorized database write connection to finish preservation

Still requires recoverable originals for the six broken images

Syntax check, text integrity and TypeScript passed before execution

## Authorized continuation

The user supplied an administrator login and explicitly requested the existing maintenance workflow

Entered Kath using maintenance code BR-KATC-FBD92CD0 through the platform UI

Used a separate non-persistent authenticated administrator API session for scoped product writes under existing RLS instead of changing grants or policies

The preservation script now supports that session and four concurrent downloads with byte-for-byte Storage verification and anonymous publication-access checks

The two explicitly requested products were set unavailable and assigned to a hidden category so both storefront and standalone menu exclude them without deletion

Original product fields and category assignments were backed up before changes under .codex-tmp/kath-image-preservation

To restore them after adding images move them back to the sandwich category and enable availability

No application deployment or schema changes are required for these operational updates

## Final verification

- 57 external originals now preserved in private Storage with identical bytes
- Four existing Storage-backed products unchanged
- 67 product records remain intact and 65 are available
- Product names, descriptions, prices, calories and ingredients match the pre-change snapshot
- Standalone menu has 65 cards and 57 preserved image references
- Normal production storefront catalog endpoint returns 65 products and 57 preserved references after CDN refresh
- Storefront browser shows 65 products and no links to either hidden product
- Hidden category saved through maintenance UI to invalidate menu surfaces
- Attempted no-change product form save was blocked by existing required-description validation and made no product change
- Maintenance session ended through the UI and returned to the maintenance entry page
- Four still-visible products have missing source images: Snickers, Galaxy, fruit waffle, cookies ice cream
- No invented substitute images were used and no additional products were hidden

## Subsequent user request: hide every imageless Kath product

The user explicitly requested hiding the remaining four broken-image products from both menus

Rechecked all six external originals still return 404 and have no gallery or stored image before updating

All six are now unavailable and assigned to the hidden category with no product deletion

The production storefront catalog returns 61 products and every one references a stored image

The standalone response excludes all six hidden product IDs

Existing names, prices and other product fields were preserved and pre-change records backed up
