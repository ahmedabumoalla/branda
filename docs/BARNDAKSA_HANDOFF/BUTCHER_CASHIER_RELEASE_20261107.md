# Butcher cashier release and maintenance session recovery

Updated 2026-11-07 UTC

## Published application baseline

- GitHub main `91a7eaec4a1fbd5725c6915f6cfa7b4d5cadf2b9` was independently verified on Vercel production deployment `dpl_8a3TkWvRoY5uPtJ3tvgMoUoswt5A` and both production aliases at 01:53:24 UTC
- Butcher products support individually priced units, meat type and optional origin; categories can be created inside the product editor
- Butcher-only product forms omit preparation, ingredients, visibility and promotion controls while preserving existing data
- Butcher cashier sales require no customer phone, messages or loyalty; shifts are optional
- Offline cashier uses durable local receipts and reconnect synchronization; open online once on each device to initialize it
- Finance has a dedicated cashier management section with phone login, active/inactive staff controls and narrowly authorized administrator maintenance access
- Sales-cashier passwords accept 8–128 nonblank characters including digits-only passwords; other account policies are unchanged
- Applied migrations: `20261107002713` butcher POS and `20261107014000` audited maintenance cashier access

## Production maintenance incident

- User confirmed the screenshot came from the published site
- Vercel runtime logs show two POST requests to `/admin/cafes` rejected with `Unauthorized`, preceded by `refresh_token_not_found`; affected requests came from an older deployment still serving the open tab
- The failed maintenance entry was caused by missing valid authentication; the exact reason the refresh token became invalid is not established
- Fix returns an explicit expired-session result with a full-page login link and clears the cached dashboard shell on that link
- Forbidden roles receive an explicit denial; unexpected failures still propagate; privileged reads and session creation remain after administrator authorization
- No real account was created, no customer message sent, no authentication settings changed and no live maintenance session initiated during verification
- The user must sign in again to recover an already invalid session; publication cannot restore an invalid refresh token

## Verification and continuity

- Evidence: `output/maintenance-session/` for runtime logs, scoped action/UI tests, TypeScript, text integrity, lint, isolated build and exact release verification
- Existing feature evidence: `output/butcher-pos/`, `output/inline-category/`, `output/butcher-product-simplify/`, `output/cashier-management/`, `output/cashier-maintenance/`, `output/cashier-password/`
- Stable local development URL is `http://localhost:3019`; source is `C:/Projects/branda-platform` with webpack development mode
- Do not build over the live development output or change ports to deliver edits
- Local authenticated slowness remains unresolved: an anonymous finance request succeeded at 01:53 UTC, but earlier development logs include slow admin renders and stack overflow errors; this does not prove the user's local hang is fixed
- Release checkout is `C:/Projects/branda-salon-design-release-20261028`; preserve unrelated dirty root and historical documentation changes
- Next action: verify the new production commit, then have the user sign in again and retry maintenance; separately investigate local authenticated slowness if it persists
