# Restaurant refresh - 2026-11-08

- RESTAURANT REFRESH 2026-11-08: Masala burgundy; 19 dark warmgray with white text and black logo; Rayhan identity blue; Arabi green with golden dallah and no dessert references. Reviewed 53 generated product assets mapped to 64 products. Diet Pepsi is 2 SAR as confirmed; Arabi 12 dessert rows and 2 categories soft-deleted. Migration 20261108093902 (MD5 ea0d7248e5a68bf73f51863bbee85d24) passed rollback test, applied, and fresh readback preserves all other fields across 122 products. Root/release TypeScript, text integrity, signature 730 and scoped lint pass on Node 24. Hadiqa replacement identity and breakfast assets unavailable per user; slogan already absent from source/live HTML. Published source 02b4a1dd7be7c417818ea334794ee751d4d1dd07; Vercel success for EbAFxqa6WTgWpSCzJsSAJzxxXvcs. Both public hosts verified for all four menus, 64 exact image hashes, hero assets, themes, diet price and dessert removal at 2026-11-08T09:43:21.274Z. Only Hadiqa replacement materials remain pending. See RESTAURANT_REFRESH_20261108.md

## Result

- Masala: all 13 food images close and consistent with Indian styling; shared beverages coordinated across the requested restaurants; diet Pepsi 2 SAR
- 19: original dark warmgray hero, white copy, black supplied logo; 26 drinks use one hot cup family and one cold cup family, with small espresso servings
- Arabi: green palette, golden dallah hero without desserts; consistent glass cups and golden thermoses with matching refills; both dessert categories removed from the menu using soft deletion; 20 drinks remain
- Rayhan: blue background from its existing supplied identity; shared bottled drinks and consistent cold juice cups
- Hadiqa: user confirms the replacement identity and new breakfast files do not exist; these changes remain pending source materials. The requested slogan is already absent from source and live HTML

## Evidence

- Source: output/restaurant-refresh/checks.json records input hashes, runtime and timestamps. The initial test still expected the old hero version; updated to v2, then all checks passed
- Media: output/restaurant-refresh/{masala,nineteen,arabi,rayhan,shared}/manifest.json stores prompts, built-in image generation paths, original/new SHA256 and review. 53 unique product assets map to 64 products. Conversion to lossless WebP only; original Storage files retained
- Database: supabase/migrations/20261108093902_restaurant_menu_photo_refresh.sql; tenant and concurrency guards; rollback-test.json, applied.json, history.json and database-verified.json. All 122 rows retained, with only approved images, one price and 12 soft deletions changed
- UI: source and contrast review plus individual image/contact-sheet review. No browser used. Root/release TypeScript, text integrity, 730 signature checks and scoped lint pass. Production build passed through the verified GitHub Vercel deployment
- Publication: exact commit and live evidence recorded in output/restaurant-refresh/{commit,github-status,publication}.json. Direct Vercel API returned 403; use GitHub commit status plus independent checks of both public hosts
