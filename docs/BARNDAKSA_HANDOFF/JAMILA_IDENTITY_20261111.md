# Jamila identity release

- Scope: Jamila only, cafe `8f4d6f70-83e9-4a28-98c7-da65ba8b501b`, slug `brand-406bf519a458`
- Isolated release baseline: production commit `546a555b49a220ae8533324cbfcc2ad48e34be05`, Vercel project `branda-2` (`prj_kHe6mtiyO05loZn6PgMOSpjlv4Ow`), verified against `barndaksa.com`
- Gray `#5c5c5c` and cream `#ffe8c5` identity, original two-line wordmark cleaned from the supplied image, transparent PNG at `public/menu-art/jamila/logo-v1.png`
- Empty menu shows the logo, coming-soon copy and the existing loyalty link; no sample categories, products or prices. Normal catalog routing resumes when products are published
- Shared card renderer retains Jamila logo colors and uses a larger mark, scoped to this slug. Existing six stamps and free-drink reward, member codes, wallet links and other brands remain unchanged
- Data-only activation uses `scripts/apply-jamila-identity.mjs --apply` with private environment and `JAMILA_EVIDENCE_DIR`. Writes only this account's custom identity and settings logo. No schema or authorization changes, no loyalty-program updates, no finance writes, no messages
- Management SQL inspection unavailable: stored Supabase access token returns 401. Data API identity reads work but INSERT is denied; account settings logo UPDATE succeeded and readback was verified. Finance tables correctly deny Data API access. No grants were changed. No SQL migration was applied
- Checks RUN on 2026-11-11, Windows / Node 24.19.0: TypeScript, text integrity, scoped ESLint, Next production webpack build, Jamila 24 behavior checks, signature-menu 776 checks, loyalty `--cards-only` 18 checks. Responsive/focus/contrast/reduced-motion review by source, no browser
- Earlier full loyalty suite stops at the existing cashier mock's missing `server-only` module; the relevant card-only suite passes. Signature route mock updated for the new Jamila import and full suite passes
- Local finance preservation: 336 finance-related source/test/migration file hashes compared before/after local Jamila integration; no differences. Release diff excludes all financial implementation files
- Evidence: private `.barndaksa-backups/jamila-evidence`, build logs and local finance hash manifest. Sanitized release input identities recorded alongside this handoff
- Published app commit `989e183c61e1cb32e82a864b90071eb7c45dd557`, Vercel `dpl_3fFuXtPwLMRAP9CZSwLrzixGLEgu` READY with production aliases verified. Account settings logo saved via guarded UPDATE; custom identity palette still pending renewed SQL access (20-token account limit). Owner settings now read the stored URL for Jamila, retaining upload priority and maintenance/auth guards. Follow-up deployment and live verification pending

## Asset provenance

Built-in image generation edit of the user-supplied logo. Prompt: preserve original Jamila cream italic lettering, black shadows and Bakery & CoffeeHouse line; remove gray background and print-shop font/measurement annotations; transparent background, no redesign or new graphics. Generated image visually inspected, copied into the release and root workspace, alpha and dimensions checked

## Finance boundary

The root workspace remains on its existing local branch with unrelated work intact. Only this release's explicit file changes are pushed. Previously published finance behavior stays at the production baseline; newer local invoice/settings work is not included
