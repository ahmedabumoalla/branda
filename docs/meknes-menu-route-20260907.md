# Meknes standalone menu at the storefront URL

The user requested the standalone menu at https://barndaksa.com/c/meknes-loung/products/popular and explicitly instructed implementation.

An exact `beforeFiles` rewrite in `next.config.ts` serves `/menu/meknes-loung` at the requested path, preserving the browser URL, query string and hash navigation. The original standalone URL remains usable. Other brands and routes are unchanged. The same standalone loader, publication gate, tenant isolation, signed media and metadata apply at both URLs.

Deployment: `dpl_8iQXkk324byQLp7w5J8E4pwjnHaX`, promoted on 2026-09-07.
Deployment URL: https://branda-2-rckcnt9yu-ahmedabumoallas-projects.vercel.app.
Rollback: `dpl_EnwhpDAmQMTaHohNCALn154kZcaG`.

The isolated release `.codex-tmp/meknes-route-release-20260907` was copied from 875 source files verified against the previous production SHA-1 manifest. Only `next.config.ts` changed; unrelated workspace changes were excluded.

Text integrity, TypeScript, scoped ESLint and cloud production build passed. Local and public HTTP requests confirmed both menu URLs return 200 without a redirect and contain the same 59 product IDs in the same order, the transparent Meknes logo and the original Dallah video. Browser verification confirmed the requested URL remains visible and standalone search works. The Kath storefront still uses its existing collection page.
