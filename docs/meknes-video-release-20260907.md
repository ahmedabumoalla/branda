# Meknes menu video release

- Published to https://barndaksa.com/menu/meknes-loung on 2026-09-07.
- Deployment: `dpl_6ejhDqd4eJL64DMEYFaEd6fTijxi`.
- Deployment URL: https://branda-2-7a39k8ykx-ahmedabumoallas-projects.vercel.app.
- Previous deployment for rollback: `dpl_HVvnxS3rrC3w8Z1UQnR4NRdWDG2b`.
- All 874 source files in the release base were checked against the active production deployment's SHA-1 manifest.
- Isolated release: `.codex-tmp/meknes-video-release-20260907`.
- Only `components/menu/bistro-menu.tsx` and `components/menu/bistro-menu.module.css` changed in the published snapshot.
- The separate local Kath white-background changes were excluded from this video release.

Video products now display their existing signed video in the menu card and first in product details. Playback is muted, inline, looping and controlled by viewport visibility and reduced-motion preference. Native controls remain available. Opening details pauses the card video. Video controls are outside the product-details button. Grid and list layouts support the video card, including 390px mobile width.

No database, storage permissions, media files, product prices or publication settings changed.

Verification: isolated source text integrity, TypeScript, scoped ESLint, standalone-menu and feedback regression checks passed. Vercel production build passed. The staged response contained 59 products and the original Dallah video. After promotion, anonymous Meknes and Kath menu responses returned 200 with 59 and 61 products respectively; login returned 200. The production browser confirmed Dallah video playback advancing, muted, with controls, readyState 4 and no media error.

Existing Node 20 deprecation warnings and dashboard static-render diagnostics did not block the successful build.
