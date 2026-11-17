# Loyalty logo identity and branches — 2026-11-18

Implementation committed; production deployment pending

- Branch manager: /dashboard/loyalty/branches, visible under loyalty for Fawasel and for entitled branch+loyalty brands; existing menu branches link to it
- Add/edit branch, actual location/nearby text, transparent logo, derived colors, optional wallet artwork, QR and cashier assignment
- Canonical cafe/customer unique key retained; first issuing branch is immutable; later scans and redemption across branches use the original ledger
- No branch names/locations were provided, so no real branches were invented
- Automatic logos accept common raster/vector image formats, rasterize locally with size/pixel limits, reject external SVG assets, remove only confidently uniform backgrounds and retain enclosed white details
- Save settings applies logo+palette atomically with same-tenant storage validation and existing owner/service guards; wallet updates are queued for previously installed cards
- Native Apple logos retain their colors; Google branch classes use origin logos; Fawasel clothing icon is an explicit stamp option
- Wallet proximity uses active branch coordinates (provider maximum10); appearance and proximity notifications remain subject to wallet/device settings, not guaranteed on every pass-by
- Separate post-download WhatsApp welcome disabled, pending queue expired; link/OTP/other program messages retained

## Verification

Full release TypeScript and original scoped text passed.41automatic logo/identity checks across7formats; mocked wallet integration, synchronization, branch locations, welcome disable and18staff workspace checks passed
Database compile and live rollback checks cover owner and cross-tenant/anonymous permission, optimistic revision, one-card cross-branch balance, immutable origin, closed branch rejection, original issuer compatibility, stored logo scope, atomic rollback and public palette projection
Actual authenticated branch-dashboard read passed after discovering legacy direct table RLS intentionally denies loyalty-only accounts; narrow authorized RPC added without weakening existing RLS
No real messages, retained financial/customer/branch/assets fixtures or browser tests

Migrations applied:20261118000600 at23:29:25Z,601–603 at23:41:46Z,604 at23:44:39Z; owner read verified23:44:42Z
Source inputs/runtime hashes: output/wallet-identity-20261118/inputs.json
Live evidence: output/fawasel-branches-20261118/wallet-identity-postcheck.json and wallet-branches-owner-rls.json
Unrelated concurrent financial receipt commit72e631a7 preserved through merge
Authoritative implementation is in isolated release worktree; divergent local root source was not overwritten
