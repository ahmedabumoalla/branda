# Barndaksa Stability Recovery Patch

This package stabilizes the current Barndaksa platform after the domain/rebrand/cache changes.

## Applied fixes
- Removed unsafe `unstable_cache()` usage from public cafe API routes that indirectly use `cookies()` through the Supabase server client.
- Fixed the public cafe/menu API routes so `/c/[slug]` can load locally and on `barndaksa.com` without 500 cache/cookies conflict.
- Regenerated the npm lock reference for `qrcode-generator` to use public npm registry instead of an internal OpenAI registry URL.
- Added Node 20 engine pin for Vercel stability.
- Added source verification script: `npm run verify:source`.
- Added full security audit command: `npm run audit:security`.
- Added deep read-only SQL audit file: `supabase/manual/999_barndaksa_full_security_audit.sql`.
- Preserved Arabic brand name as برندة and English/domain namespace as Barndaksa/barndaksa.com.

## Required after replacing files
1. Run `npm config set registry https://registry.npmjs.org/`.
2. Run `npm ci --registry=https://registry.npmjs.org/`.
3. Run `npm run verify:source`.
4. Run `npm run build`.
5. Run `npm run audit:security`.

For deep PostgreSQL policy/grant/function/storage audit from the same command, set `SUPABASE_DB_URL` before running `npm run audit:security`.
