# Shahi wa Hail transparent logo and menu alias

The user requested direct background removal and the same standalone-menu storefront URL arrangement as Meknes.

`scripts/extract-shahi-logo.cjs` processes the exact reviewed original, guarded by its SHA-256. Black pixels, letter counters and leaf cutouts become transparent while original RGB values are retained for all 127,755 fully opaque pixels. Source dimensions remain 1280 by 1133; 1,311,298 pixels become fully transparent. PNG and lossless WebP are saved as `public/menu-logos/shahi-transparent-v1.*`.

The standalone logo override is guarded by cafe ID and source-path hash, preserving future uploads and other brands. Original Storage content was not changed.

An exact `beforeFiles` rewrite serves `/menu/shahi-w-hail` at `/c/shahi-w-hail/products/popular` without redirecting. Both URLs remain valid. Meknes's existing rewrite is retained.

Production deployment: `dpl_2N1X7DXSGdapJ5ujLkr1ePjw5wJZ`.
URL: https://branda-2-mx8he0zek-ahmedabumoallas-projects.vercel.app.
Promoted on 2026-09-07 to https://barndaksa.com.
Rollback: `dpl_8iQXkk324byQLp7w5J8E4pwjnHaX`.

The isolated `.codex-tmp/shahi-release-20260907` snapshot was checked against all 875 source hashes from the previous production deployment. Only `lib/menu/logo-variants.ts`, `next.config.ts` and the new WebP asset were included.

Passed checks: text integrity, TypeScript, scoped ESLint, standalone-menu regressions, cloud build, logo visual inspection and mobile layout review. Local and staged requests confirmed HTTP 200 without redirects, 29 products and the new logo. Anonymous production checks confirmed equal product IDs and ordering at both URLs, byte-identical served logo with true alpha, and the existing Meknes route with 59 products. Browser review confirmed the requested Shahi storefront URL remains visible and the transparent header logo loads.
