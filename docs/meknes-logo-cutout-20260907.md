# Meknes transparent logo

User explicitly approved deterministic processing after two built-in image edits returned opaque checkerboard backgrounds. Neither generated image was adopted.

The original published 601 by 544 WebP was verified byte-for-byte against the local source before processing. `scripts/extract-meknes-logo.cjs` removes the outer navy backdrop while protecting the white circular emblem and its dark blue text. Orange lettering, original framing and source dimensions are retained. All 94,761 fully opaque output pixels preserve original RGB values; 229,436 pixels are fully transparent. PNG and lossless WebP outputs are saved under `public/menu-logos/meknes-transparent-v1.*`.

The standalone logo substitution is restricted to Meknes cafe ID and the SHA-256 of the reviewed original Storage path. Future logo replacements use their own originals. The account's original upload and other brands are unchanged.

Production deployment `dpl_EnwhpDAmQMTaHohNCALn154kZcaG` was promoted to https://barndaksa.com on 2026-09-07. Previous rollback deployment: `dpl_6ejhDqd4eJL64DMEYFaEd6fTijxi`.

Release source was verified against all 874 previous production files. The isolated release changes only `lib/menu/logo-variants.ts` and adds `public/menu-logos/meknes-transparent-v1.webp`. The video release remains intact.

Checks passed: text integrity, TypeScript, scoped ESLint, standalone-menu regressions, cloud production build, mobile visual review, staged logo and video references, 59 product cards, and anonymous production asset retrieval with byte equality and actual alpha transparency.
