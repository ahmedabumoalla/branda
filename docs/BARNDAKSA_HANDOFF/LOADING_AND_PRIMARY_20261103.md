# Brand loading screens and primary WhatsApp sender

- BRAND LOADERS / PRIMARY SENDER / STICKY REPORT 2026-11-03T16:47:19.359Z: nine existing brand loading screens only; existing menus preserved. Operations tabs and headers stick inside bounded scrolling table. Primary WhatsApp sender preferred; backup401 restricted to OTP and owner credentials on disconnect/explicit rejection, no ambiguous duplicate retry. Production selector set primary; both providers authorized in read-only checks, zero messages sent. Supabase CLI renewed and project ACTIVE_HEALTHY. Release types/text/scoped lint, OTP69, operations UI/SSR regression and Node24 Next16.3.8 build PASS. Published 2026-11-03T16:52:10.008Z: GitHub main 3edb03e120321911405fa186b6272c108ddf8d67 matches Vercel dpl_AeuuLhViC8FAXjB1x42nN42VW4qQ READY on both production aliases; anonymous report remains protected. All eight live logo assets HTTP200. Follow-up replaces the Kawakib greeting with clearer coffee-focused wording at user request. See LOADING_AND_PRIMARY_20261103.md; input evidence output/loading-primary/inputs.json. No browser checks.

## Scope

- Deli Cake, Kawakib (legacy rast slug), French Corner, Double B, Basilico, Kath, Shahi w Hail, Barber55 and Fine Cut use their own identity during loading
- Existing menu composition, products, prices and loyalty rules unchanged
- Motion respects reduced-motion preferences; no artificial wait
- Operations table retains all views with sticky tabs and column headings
- Primary sender is the default for access messages; standby401 is restricted to verification codes and owner credentials
- Campaigns and loyalty welcomes remain on primary

## Validation

Executed 2026-11-03 in isolated release worktree with Node20.20.2 for checks and Node24 / Next16.3.8 for production build

- node scripts/check-otp-backup.cjs: PASS69 mocked scenarios
- node scripts/check-operations-report-ui.mjs: PASS including React SSR
- node scripts/check-text-integrity.mjs: PASS
- npx tsc --noEmit: PASS
- Scoped ESLint and git diff --check: PASS
- npx --yes --package=node@24 node node_modules/next/dist/bin/next build: PASS
- Nine registry lookups and eight logo assets: PASS
- Provider states authorized, production environment priority primary: verified without customer sends

Live evidence in root output/otp-backup/primary-priority.json and owner-senders.json
