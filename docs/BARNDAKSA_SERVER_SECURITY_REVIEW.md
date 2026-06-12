# Barndaksa Server Security Review

**Status:** Code hardening complete at source level — database not initialized — runtime security validation pending.

---

## Server Layer

| Area | Pattern | Status |
| ---- | ------- | ------ |
| Server Actions | `@/lib/supabase/server` session client | ✅ |
| API Routes | Session + RPC/RLS; no service role in storage | ✅ |
| Auth callback | Standard Supabase exchange | ✅ |
| Admin client | `lib/supabase/admin.ts` — **not imported** in customer/order/storage paths | ✅ |

---

## Storage Routes

| Route | Auth | Gate |
| ----- | ---- | ---- |
| `GET /api/public/storage` | anon/auth | `assertAnonPublicStorageAccess` |
| `GET /api/storage/signed` | authenticated | `assertPrivateStorageAccess` |

TTL: 600 seconds. No signed URL stored in DB.

---

## Trust Boundaries

Server Actions validate with Zod; authoritative IDs from `auth.getUser()` and `requireOwnerCafeContext()` / `requireCustomerProfileForSession()`.

Client must not supply: `userId`, `cafeId`, `role`, order `total`, loyalty `points`, experience `suggested_points`.

---

## Residual Notes

| Item | Severity |
| ---- | -------- |
| `lib/cafe/local-asset-store.ts` used for dashboard preview | Medium — dual asset path |
| `app/api/domains/*` integration stubs | Medium — external review needed |

---

## createAdminClient Search Result

Only defined in `lib/supabase/admin.ts`. No active imports in `lib/data/*` or storage routes after cleanup.

---

## Not Executed

Runtime penetration testing, Staging validation.
