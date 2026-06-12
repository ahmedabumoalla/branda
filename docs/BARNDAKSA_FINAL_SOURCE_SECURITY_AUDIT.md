# Barndaksa — Final Source Security Audit (Red Team)

**Status:** Source-level hardening revised and statically gated — database not initialized — runtime validation pending.

This document records **source-level** adversarial review only. No SQL, migrations, Supabase CLI, or runtime tests were executed.

---

## Summary

| Severity | Open after source review |
| -------- | ------------------------ |
| Critical | **0** known |
| High | **0** known |
| Medium | **2** (IndexedDB preview path in dashboard UI; domain purchase API stubs) |
| Low | **1** (`has_cafe_access` on non-sensitive SELECT policies in 001) |

---

## Attack Scenario Matrix

| # | Attack | Target | Protection | Bypass from client? | Result | File / fix |
| - | ------ | ------ | ---------- | ------------------- | ------ | ---------- |
| 1 | Customer sets role=admin | `profiles.role` | Trigger `prevent_profile_role_escalation`; RLS update own only | No direct escalation | **Blocked** | `003`, `profiles_update_own` |
| 2 | Staff reads another cafe | All tables | RLS scoped by `cafe_id` + permission/owner | No cross-cafe SELECT without membership | **Blocked** | RLS 001–004 |
| 3 | Staff without permission reads sensitive data | notifications, audit_logs, subscriptions, domain_orders, loyalty | Tightened policies in 004 §11 | No | **Blocked** | `004` §11 |
| 4 | Anon reads owner data | `cafe_settings`, private storage | Public settings via RPC; private buckets denied | No | **Blocked** | `004`, `002` |
| 5 | Customer forges order total | `orders` | `create_pickup_order` computes prices in DB | No direct INSERT | **Blocked** | `004` `create_pickup_order` |
| 6 | Customer accepts own order/reservation | status fields | No customer UPDATE on orders; reservation RPC staff-only response | No | **Blocked** | `004`, `003` |
| 7 | Customer adds loyalty points | `loyalty_accounts` | No client UPDATE; `adjust_loyalty_points` RPC | No | **Blocked** | `004` |
| 8 | Owner awards points above campaign max | experience approve | `approve_experience_submission` checks max + duplicate reward | No | **Blocked** | `004` |
| 9 | Customer self-approves submission | `experience_submissions` | No UPDATE policy; approve RPC permission check | No | **Blocked** | `004` |
| 10 | Staff edits notification body | `notifications` | No UPDATE policy; mark-read RPC only | No | **Blocked** | `004` |
| 11 | Upload to another user's path | `storage.objects` | Path prefix = `auth.uid()`; path safety checks | No | **Blocked** | `002` |
| 12 | Signed URL for other's private file | `/api/storage/signed` | `assertPrivateStorageAccess` + DB path binding | No | **Blocked** | `lib/storage/private-storage-access.ts` |
| 13 | Anon reads unpublished public asset | public buckets | `can_access_public_storage_object` DB binding | No | **Blocked** | `002` |
| 14 | Path traversal `..` or `\` | storage + RPCs | `storage_object_path_is_safe` (`chr(92)`) | No | **Blocked** | `002` |
| 15 | Direct video upload to experience | `experience-submissions` bucket | MIME allowlist images only; RPC image ext check | No | **Blocked** | `002`, `004` |
| 16 | Fake avatar path in profile | `customer_profiles` | RPC verifies `storage.objects` exists | No | **Blocked** | `004` `set_customer_avatar_storage_path` |
| 17 | Fake experience media path | `experience_submissions` | RPC verifies object + submission ownership | No | **Blocked** | `004` `attach_experience_submission_media` |
| 18 | Change `customer_profiles.cafe_id` | profile row | Trigger blocks reassignment | No | **Blocked** | `004` trigger |
| 19 | Staff reads audit/subscription/domain without role | sensitive SELECT | owner/admin or permission-scoped | No | **Blocked** | `004` §11 |
| 20 | API trusts client `total`/`points`/`userId` | Server Actions | Zod + server session + RPC authoritative calc | No | **Blocked** | `lib/data/*`, `app/actions/*` |
| 21 | Client sends forged `suggested_points` | experience metrics | Removed from RPC; DB calculates from campaign | No | **Blocked** | `004`, `lib/data/experience.ts` |
| 22 | Direct customer profile INSERT/UPDATE | `customer_profiles` | No INSERT/UPDATE policies; `create_customer_profile` + `update_customer_profile` RPC | No | **Blocked** | `004` §12 |
| 23 | Storage object UPDATE swap | private buckets | UPDATE policies dropped; new UUID upload | No | **Blocked** | `002` |
| 24 | Service role in signed URL path | storage routes | Session client only | No | **Blocked** | `lib/storage/resolve-storage-url.ts` |

---

## Residual Medium Items (documented, not runtime-verified)

| Item | Notes |
| ---- | ----- |
| Dashboard IndexedDB preview | `lib/cafe/local-asset-store.ts` still used for **browser preview** in theme/menu UI during migration. Production URLs should come from Supabase Storage + signed URLs. Not a DB bypass but dual-path asset handling. |
| Domain API routes | `app/api/domains/*` are integration stubs; must not run against production without provider auth review. |

---

## Residual Low Items

| Item | Notes |
| ---- | ----- |
| `has_cafe_access` on menu/offers/reservations SELECT | Intentional broad **read** for cafe staff on non-sensitive operational data. Writes use `has_cafe_permission`. |

---

## Verification Commands (source only — do not run DB)

```bash
npm run security:source                           # expect PASSED
rg "search_path = public" supabase/migrations/     # expect 0
rg "createAdminClient" lib/ app/ --glob "*.{ts,tsx}"  # admin.ts definition only
npm run build                                     # expect exit 0
```

---

## Official Status Phrase

```txt
Source-level hardening revised and statically gated — database not initialized — runtime validation pending.
```
