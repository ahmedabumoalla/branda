# Star and check stamps for every brand, and a logo stamp that suits any uploaded logo

2026-11-19 Riyadh, by Claude. Published 2026-11-20 after the user wrote "انشر", pushed to main from the release worktree `.codex-tmp/release-branches-aldeem-20261117`. No database change

## What the user asked

- Add a star and a check inside a circle to the stamp shape picker for every brand, beside the shapes each brand already has
- Make the brand logo choice work well with every brand logo, including logos uploaded from brand settings

## What changed

- `lib/loyalty/stamp-style.ts`: two new styles `star` and `check` with shared outlines, the list of choices every brand keeps (`brand`, `star`, `check`) and the address of the stamp rendition of a logo
- `lib/loyalty/brand-stamp-artwork.ts` and `lib/data/loyalty-cards.ts`: brand defaults (phone, shirt, plant, scissors) no longer override a saved star or check. Other defaults are unchanged
- `components/rast-loyalty/rast-dashboard.tsx`: the picker lists star and check for all brands before the logo choice. When no logo is saved every brand now sees the hint that links to brand settings (it was shown to one brand only)
- `lib/cafe/logo-stencil.ts` (new): turns any logo into a single colour mask. A plain mark keeps its silhouette, a badge keeps its shape and opens the lettering inside it, a rectangular plate or a file without transparency drops the backdrop and keeps what is drawn on it, an illustrated emblem keeps its drawing instead of becoming a blob
- `lib/wallet/logo.ts`: `walletStampLogo` returns a square 256 px transparent stencil, `walletStampLogoTint` fills it with one colour. Data URL logos now also accept GIF, AVIF and SVG. The host allow list for remote logos is unchanged
- `app/api/wallet/brand/[slug]/logo/route.ts`: `?shape=stamp` serves the stencil of the brand or branch logo. The header logo response is unchanged
- `components/rast-loyalty/stamp-glyph.tsx`, `rast-stamp-card.tsx`, `components/store/fawasel-loyalty-card.tsx`: logo stamps are a CSS mask filled with the stamp colour, so they contrast in filled and empty stamps on any card palette. Fawasel card now draws star, check and logo stamps too
- `lib/wallet/art.ts`: Apple and Google stamp artwork embeds the stencil tinted per slot colour. The artwork address of logo stamps carries `stamp-logo-v1` so wallets fetch the new image. `WALLET_ART_VERSION` is unchanged, so passes with other shapes are not touched
- Checks: `scripts/check-stamp-shapes.cjs` (new), two assertions updated in `check-approved-loyalty-design.cjs` and `check-universal-loyalty-ui.mjs` because logo stamps no longer render the header image

## Why the logo choice looked wrong before

The stamp reused the wide 640x200 header logo. Inside a round stamp a square logo shrank to about a third of the slot, empty stamps showed original colours that could vanish on the card background, and filled stamps used a silhouette that turned badges and logos with a background into a solid block

## Behaviour to know

- Logo stamps are single colour by design, like the other shapes. The card header still shows the logo in its original colours
- The bespoke Mqas77 wallet artwork still ignores the stamp shape, as it did for every shape before
- Installed passes get the new logo stamp on their next update. No refresh was queued and no message was sent
- No schema change is needed. The shape is stored in `card_design.stampStyle` and saved through the existing `set_rast_loyalty_settings` call

## Evidence

- Full TypeScript on the release worktree passed three times, last run after the final source change
- `node scripts/check-stamp-shapes.cjs`: PASS 148, synthetic images only
- `check-approved-loyalty-design.cjs`, `check-mobile-retail-loyalty.cjs` (47), `check-tea-loyalty.cjs` (25), `check-auto-loyalty-identity.mjs` (45), `check-loyalty-brand-snapshot.mjs` (18), `check-wallet-performance.mjs` (32) passed
- Text integrity check passed
- Local dev server on 127.0.0.1:3002 (this worktree): `/api/wallet/brand/<slug>/logo?shape=stamp` returned 200 image/png for 8 real brands, read only
- Images in `C:\مخرجات كلاود\أشكال الختم وشعار العلامة`: before and after for the 8 real logos, wallet strips for star, check and logo, and the edge case sheet
- No browser inspection was done

## Checks that fail on the untouched published source too

Compared against a clean copy of HEAD 276fbda8. These are stale harnesses, not caused by this change, and were left as they are: `check-universal-loyalty-ui.mjs` (theme assertion rejects the value `none`), `check-universal-loyalty-server.mjs` (stub lacks `stampStyles`), `check-rast-wallet-security.mjs` (logoText assertion), `check-salon-experience.mjs` (unmocked dependency), `check-finance-loyalty-sections.cjs` (stub lacks `isMobileRetailLoyalty`), `check-data-hot-paths.mjs`, `check-mqas77-wallet.mjs` (route stub lacks `getBranchLoyaltyBrand`)

## To publish when authorised

Commit the 13 modified files and the 2 new files listed by `git status` in this worktree, push to main, wait for the Vercel build to be READY and confirm `/api/wallet/brand/<slug>/logo?shape=stamp` returns 200 on production
