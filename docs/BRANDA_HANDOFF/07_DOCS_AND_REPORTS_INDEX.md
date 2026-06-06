# Branda Handoff — Docs & Reports Index

**Status:** Code hardening complete at source level — database not initialized — runtime security validation pending.

## All docs/BRANDA*.md files

- `docs/BRANDA_DATABASE_BLUEPRINT.md`
- `docs/BRANDA_DESIGN_UPGRADE_REPORT.md`
- `docs/BRANDA_FINAL_SOURCE_SECURITY_AUDIT.md`
- `docs/BRANDA_HANDOFF/00_MASTER_INDEX.md`
- `docs/BRANDA_HANDOFF/01_COMPLETE_FILE_TREE.md`
- `docs/BRANDA_HANDOFF/02_ROUTES_AND_FEATURES_MAP.md`
- `docs/BRANDA_HANDOFF/03_DATABASE_AND_SECURITY_ARCHITECTURE.md`
- `docs/BRANDA_HANDOFF/04_DATA_FLOW_AND_STATE_MAP.md`
- `docs/BRANDA_HANDOFF/05_CHANGE_GUIDE_FOR_CHATGPT.md`
- `docs/BRANDA_HANDOFF/06_SECURITY_FINAL_STATUS.md`
- `docs/BRANDA_HANDOFF/07_DOCS_AND_REPORTS_INDEX.md`
- `docs/BRANDA_HANDOFF/SOURCE_BUNDLES/00_BUNDLE_MANIFEST.md`
- `docs/BRANDA_HANDOFF/SOURCE_BUNDLES/01_APP_ROUTES_AND_API_SOURCE.md`
- `docs/BRANDA_HANDOFF/SOURCE_BUNDLES/02_COMPONENTS_SOURCE.md`
- `docs/BRANDA_HANDOFF/SOURCE_BUNDLES/03_LIB_DATA_AUTH_SUPABASE_SOURCE.md`
- `docs/BRANDA_HANDOFF/SOURCE_BUNDLES/04_LIB_STORAGE_CAFE_UI_SOURCE.md`
- `docs/BRANDA_HANDOFF/SOURCE_BUNDLES/05_TYPES_CONFIG_PACKAGE_SOURCE.md`
- `docs/BRANDA_HANDOFF/SOURCE_BUNDLES/06_SUPABASE_MIGRATIONS_TESTS_SOURCE.md`
- `docs/BRANDA_PRODUCTION_DATABASE_MIGRATION_AUDIT.md`
- `docs/BRANDA_PRODUCTION_DATABASE_MIGRATION_REPORT.md`
- `docs/BRANDA_PRODUCTION_SECURITY_TEST_CHECKLIST.md`
- `docs/BRANDA_RLS_SECURITY_REVIEW.md`
- `docs/BRANDA_SECURITY_DEFINER_REVIEW.md`
- `docs/BRANDA_SERVER_SECURITY_REVIEW.md`
- `docs/BRANDA_STAGING_DEPLOYMENT_GUIDE.md`
- `docs/BRANDA_STAGING_SECURITY_VALIDATION_REPORT.md`

---

## Final security & handoff reports (full content)

# File: docs/BRANDA_FINAL_SOURCE_SECURITY_AUDIT.md

# Branda — Final Source Security Audit (Red Team)

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


---

# File: docs/BRANDA_PRODUCTION_DATABASE_MIGRATION_REPORT.md

# Branda Production Database Migration Report

**Status:** Code hardening complete at source level — database not initialized — runtime security validation pending.

---

## Executive Summary

Four SQL migration files (`001`–`004`) define the complete production schema, storage policies, security hardening, and critical RPC-only flows. **No migration has been executed** on Local, Staging, or Production.

---

## Migration Sequence

| Order | File | Lines (approx) | Focus |
| ----- | ---- | -------------- | ----- |
| 1 | `001_branda_production_schema.sql` | ~970 | Schema, enums, baseline RLS |
| 2 | `002_branda_storage_policies.sql` | ~660 | 8 buckets, public/private policies |
| 3 | `003_branda_security_hardening.sql` | ~260 | Role escalation, domain_orders |
| 4 | `004_branda_critical_security_fixes.sql` | ~1475 | RPC flows, policy replacement |

---

## Pre-Run Checklist (when user approves)

- [ ] Create isolated Supabase Staging project
- [ ] Apply 001 → 002 → 003 → 004 in order
- [ ] Run `supabase/tests/*.sql` (pgTAP)
- [ ] Run `supabase/seed/security_test_seed.sql`
- [ ] Execute manual checklist in `BRANDA_PRODUCTION_SECURITY_TEST_CHECKLIST.md`
- [ ] Document results in `BRANDA_STAGING_SECURITY_VALIDATION_REPORT.md`

---

## Key Architectural Decisions

1. **RPC-first** for orders, reservations, loyalty writes, experience lifecycle, notifications, customer profile create, avatar bind.
2. **RLS** on all tenant tables; sensitive reads scoped to owner/permission/admin.
3. **Storage** public assets bound to published DB rows via `can_access_public_storage_object`.
4. **Private storage** no UPDATE policy; object existence verified before DB path bind.
5. **SECURITY DEFINER** with `search_path = ''` only.

---

## Not Done

- SQL execution
- Supabase CLI
- Seed on any environment
- Staging/Production deployment

---

## Official Phrase

```txt
No SQL, migration, seed, Supabase CLI, Staging, or Production action was executed. Database remains uninitialized.
```


---

# File: docs/BRANDA_RLS_SECURITY_REVIEW.md

# Branda RLS Security Review

**Status:** Code hardening complete at source level — database not initialized — runtime security validation pending.

---

## Scope

Row Level Security policies across all tenant tables and `storage.objects`, as defined in migrations 001–004.

---

## Sensitive Tables — Final Policy Model

| Table | SELECT | INSERT | UPDATE | DELETE |
| ----- | ------ | ------ | ------ | ------ |
| `customer_profiles` | self / customers perm / owner / admin | **RPC only** | self / customers perm / owner / admin | not client |
| `experience_submissions` | self / marketing / owner / admin | **RPC only** | **RPC only** | not client |
| `notifications` | scoped by audience + permission | **RPC only** | **RPC only** (mark read) | not client |
| `audit_logs` | owner / admin | DEFINER only | none | none |
| `subscriptions` | owner / admin | admin flow | not client | not client |
| `domain_orders` | owner / admin | owner insert (003) | admin + cancel RPC | not client |
| `loyalty_accounts` | self / loyalty perm / owner / admin | via RPC side effects | **RPC only** | not client |
| `orders` | customer / cafe access | **RPC only** | **RPC only** | soft delete staff |

---

## has_cafe_access Usage

Retained only for **non-sensitive operational reads** (menu, offers, orders list, reservations list, cafe metadata). Replaced with `has_cafe_permission` or owner/admin for:

- notifications (cafe audience)
- audit_logs
- subscriptions
- domain_orders SELECT
- loyalty_accounts SELECT
- customer_profiles
- experience_submissions
- storage staff draft reads (via `storage_staff_can_read_cafe_asset`)

---

## storage.objects

- Public buckets: anon read via `can_access_public_storage_object`
- Staff draft read: permission per bucket domain
- `customer-avatars`: owner + admin only
- `experience-submissions`: submission owner / marketing / admin via `storage_can_access_experience_object`

---

## Validation Status

| Check | Source review | Runtime |
| ----- | ------------- | ------- |
| Policy syntax | ✅ | ⏳ pending |
| Cross-tenant isolation | ✅ design | ⏳ pending |
| RPC bypass paths | ✅ closed in source | ⏳ pending |

---

## Not Executed

Migrations, pgTAP, manual RLS tests.


---

# File: docs/BRANDA_SERVER_SECURITY_REVIEW.md

# Branda Server Security Review

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


---

# File: docs/BRANDA_PRODUCTION_SECURITY_TEST_CHECKLIST.md

# Branda Production Security Test Checklist

**Status:** Code hardening complete at source level — database not initialized — runtime security validation pending.

**Purpose:** Execute **after** migrations on isolated Staging. Items below are **written but not executed**.

---

## Prerequisites

- [ ] Staging Supabase project (empty)
- [ ] Apply migrations 001→004
- [ ] Load `security_test_seed.sql`
- [ ] Run pgTAP suite in `supabase/tests/`

---

## Auth & Roles

- [ ] Customer cannot UPDATE `profiles.role`
- [ ] Staff cannot access other cafe's data
- [ ] Anon cannot SELECT private tables

---

## Customer Flows

- [ ] Register only on active public cafe
- [ ] Duplicate profile per cafe blocked
- [ ] Avatar path without storage object rejected
- [ ] `avatar_url` remains NULL

---

## Orders & Reservations

- [ ] Direct order INSERT denied
- [ ] `create_pickup_order` computes totals
- [ ] Customer cannot accept own order
- [ ] Reservation INSERT via RPC only

---

## Loyalty & Experience

- [ ] Direct loyalty balance UPDATE denied
- [ ] `adjust_loyalty_points` requires permission
- [ ] Experience approve cannot double-reward
- [ ] Metrics RPC ignores client `suggested_points`
- [ ] Fake media path rejected

---

## Storage

- [ ] Path traversal blocked
- [ ] Unpublished public asset not readable
- [ ] Private signed URL denied for wrong user
- [ ] Video upload to experience bucket denied

---

## Sensitive Reads

- [ ] Staff without permission cannot read audit_logs
- [ ] Staff without permission cannot read subscriptions
- [ ] Cafe notifications require notifications permission

---

## Execution Log

| Date | Environment | Result |
| ---- | ----------- | ------ |
| — | — | **Not run — DB not initialized** |

---

## Official Phrase

Runtime validation and Staging tests remain mandatory before Production deployment.


---

# File: docs/BRANDA_STAGING_SECURITY_VALIDATION_REPORT.md

# Branda Staging Security Validation Report

**Status:** Code hardening complete at source level — database not initialized — runtime security validation pending.

---

## Summary

Staging security validation **has not been performed**. No Supabase project has received migrations. No pgTAP tests have been executed.

---

## Source-Level Preparation Complete

| Artifact | State |
| -------- | ----- |
| Migrations 001–004 | Written, reviewed |
| pgTAP tests (55 tests, 6 files) | Written, not run |
| Security test seed | Written, not run |
| `npm run build` | Passes |
| Handoff package | `docs/BRANDA_HANDOFF/` |

---

## Blocked Until User Approval

- `supabase db push` / migration apply
- `supabase test db`
- Staging environment deployment
- Production deployment

---

## Expected Validation Flow (future)

1. Provision Staging Supabase
2. Apply migrations in order
3. Seed test data
4. Run pgTAP
5. Manual checklist (`BRANDA_PRODUCTION_SECURITY_TEST_CHECKLIST.md`)
6. Update this report with pass/fail per scenario

---

## Official Phrase

```txt
Code hardening complete at source level — database not initialized — runtime security validation pending.
```

No claim of Production readiness or runtime security validation.


---

# File: docs/BRANDA_SECURITY_DEFINER_REVIEW.md

# Branda Security — SECURITY DEFINER Function Review

**Status:** Code hardening complete at source level — database not initialized — runtime security validation pending.

**Last reviewed:** 2026-05-30 (source files only)

---

## Verification

```bash
rg "search_path = public" supabase/migrations/   # → 0 matches (expected)
```

All SECURITY DEFINER functions use `SET search_path = ''` and qualified identifiers.

---

## Inventory

### 001 — Auth helpers

| Function | search_path | PUBLIC revoked | Grant |
| -------- | ----------- | -------------- | ----- |
| `is_platform_admin()` | `''` | yes | anon, authenticated, service_role |
| `is_cafe_owner(uuid)` | `''` | yes | anon, authenticated, service_role |
| `has_cafe_access(uuid)` | `''` | yes | anon, authenticated, service_role |
| `has_cafe_permission(uuid,text)` | `''` | yes | anon, authenticated, service_role |
| `get_customer_profile_id(uuid)` | `''` | yes | authenticated, service_role |
| `handle_new_user()` | `''` | yes | trigger only |

### 002 — Storage

| Function | search_path | Notes |
| -------- | ----------- | ----- |
| `storage_cafe_is_public` | `''` | Public cafe check |
| `storage_menu_product_is_public` | `''` | Published product |
| `storage_menu_category_is_public` | `''` | Published category |
| `storage_offer_is_public` | `''` | Published offer |
| `storage_marketing_is_public` | `''` | Published campaign asset |
| `storage_submission_cafe_id` | `''` | Experience path helper |
| `storage_can_write_cafe_asset` | `''` | Write permission |
| `storage_object_exists` | `''` | Object presence |
| `storage_staff_can_read_cafe_asset` | `''` | Staff draft read |
| `can_access_public_storage_object` | `''` | Anon public asset gate |
| `storage_can_access_experience_object` | `''` | Private experience SELECT |

**INVOKER (safe):** `storage_object_path_is_safe`, `storage_path_has_allowed_image_ext`, path segment helpers.

### 003 — Hardening

| Function | search_path |
| -------- | ----------- |
| `prevent_profile_role_escalation()` | `''` |
| `handle_new_user()` | `''` |

### 004 — Business RPCs

| Function | Authorization summary |
| -------- | --------------------- |
| `assert_cafe_open_to_customers` | internal |
| `write_audit_log` | internal DEFINER insert |
| `internal_notify_cafe` | internal |
| `internal_notify_customer` | internal |
| `get_cafe_public_settings` | anon-safe read |
| `create_pickup_order` | customer |
| `respond_to_pickup_order` | orders permission |
| `submit_experience_submission` | customer |
| `approve_experience_submission` | marketing/owner/admin |
| `attach_experience_submission_media` | customer + storage verify |
| `update_experience_submission_metrics` | marketing/owner/admin; DB points |
| `reject_experience_submission` | marketing/owner/admin |
| `create_customer_reservation` | customer |
| `mark_customer_notification_read` | customer |
| `mark_cafe_notification_read` | notifications perm |
| `create_cafe_notification` | notifications perm |
| `create_customer_notification` | notifications perm |
| `adjust_loyalty_points` | loyalty perm; audit |
| `enforce_review_owner_reply_only` | trigger |
| `set_review_owner_reply` | owner/admin |
| `set_customer_avatar_storage_path` | profile owner |
| `enforce_customer_profile_update_rules` | trigger |
| `cancel_domain_order` | owner/admin |
| `create_customer_profile` | auth user |

All 004 DEFINER functions: `REVOKE ALL FROM PUBLIC`; `GRANT EXECUTE TO authenticated` (or internal only).

---

## Risk Notes

| Risk | Mitigation |
| ---- | ---------- |
| DEFINER bypasses RLS | Each RPC re-checks `auth.uid()` + permission |
| search_path injection | Empty search_path + qualified names |
| Over-broad EXECUTE | REVOKE PUBLIC; minimal grants |

---

## Not Executed

Function behavior not validated at runtime until migrations run on Staging.


---

# File: docs/BRANDA_HANDOFF/00_MASTER_INDEX.md

# Branda Platform — Handoff Master Index

## Project

**Branda** is a multi-tenant SaaS platform for coffee shops (cafes): public storefront, customer accounts, owner dashboard, platform admin, menu/orders/reservations/loyalty/marketing/experience campaigns, custom domains, and Supabase-backed auth + Postgres + Storage.

## Stack

| Layer | Technology |
| ----- | ---------- |
| Frontend | Next.js 16 (App Router), React, TypeScript, Tailwind |
| Backend | Next.js Server Actions + Route Handlers |
| Database | Supabase Postgres + RLS |
| Auth | Supabase Auth |
| Storage | Supabase Storage (public + private buckets) |
| Validation | Zod |

## Current Status

```txt
Source-level hardening revised and statically gated — database not initialized — runtime validation pending.
```

- **Migrations written:** `001` → `002` → `003` → `004` (not executed)
- **pgTAP tests written:** `supabase/tests/` (not executed)
- **Build:** `npm run build` passes at source level
- **Production / Staging:** not deployed; no SQL run

## Handoff Files

| File | Purpose | Read when… |
| ---- | ------- | ---------- |
| [01_COMPLETE_FILE_TREE.md](./01_COMPLETE_FILE_TREE.md) | Full project tree | Locating any file |
| [02_ROUTES_AND_FEATURES_MAP.md](./02_ROUTES_AND_FEATURES_MAP.md) | Routes, features, permissions | Changing UI routes or pages |
| [03_DATABASE_AND_SECURITY_ARCHITECTURE.md](./03_DATABASE_AND_SECURITY_ARCHITECTURE.md) | DB, RLS, RPCs, Storage | Any schema/RLS/RPC change |
| [04_DATA_FLOW_AND_STATE_MAP.md](./04_DATA_FLOW_AND_STATE_MAP.md) | UI → Action → Data → DB | Tracing a feature end-to-end |
| [05_CHANGE_GUIDE_FOR_CHATGPT.md](./05_CHANGE_GUIDE_FOR_CHATGPT.md) | Rules for safe edits | Every modification task |
| [06_SECURITY_FINAL_STATUS.md](./06_SECURITY_FINAL_STATUS.md) | Security closure summary | Security review |
| [SOURCE_BUNDLES/00_BUNDLE_MANIFEST.md](./SOURCE_BUNDLES/00_BUNDLE_MANIFEST.md) | Full source code bundles | Need exact file contents |
| [../BRANDA_FINAL_SOURCE_SECURITY_AUDIT.md](../BRANDA_FINAL_SOURCE_SECURITY_AUDIT.md) | Red-team source audit | Threat modeling |

## Source Bundles (full code, no truncation)

| Bundle | Contents |
| ------ | -------- |
| `SOURCE_BUNDLES/01_APP_ROUTES_AND_API_SOURCE.md` | `app/**`, `proxy.ts` |
| `SOURCE_BUNDLES/02_COMPONENTS_SOURCE.md` | `components/**` |
| `SOURCE_BUNDLES/03_LIB_DATA_AUTH_SUPABASE_SOURCE.md` | `lib/data`, `lib/supabase`, `lib/branda`, `lib/customer`, `lib/platform` |
| `SOURCE_BUNDLES/04_LIB_STORAGE_CAFE_UI_SOURCE.md` | `lib/storage`, `lib/cafe`, `lib/ui` |
| `SOURCE_BUNDLES/05_TYPES_CONFIG_PACKAGE_SOURCE.md` | `types/**`, configs, `.env.example` |
| `SOURCE_BUNDLES/06_SUPABASE_MIGRATIONS_TESTS_SOURCE.md` | migrations, tests, supabase config |

Regenerate bundles after large changes:

```bash
node scripts/generate-handoff.mjs
```

## ChatGPT Quick Routing

| Task type | Read first |
| --------- | ---------- |
| Page / route change | `02` → bundle `01` → relevant `components` |
| Dashboard feature | `04` → `lib/data/*` → bundle `03` |
| Customer storefront | `02` → `app/c/[slug]/**` → `lib/data/customers.ts` |
| Upload / signed URL | `03` § Storage → `lib/storage/**` → bundle `04` |
| New table / RLS / RPC | `03` → migration `004` pattern → bundle `06` |
| Admin panel | `02` → `app/admin/**` → `lib/data/admin.ts` |
| Security change | `06` + `BRANDA_FINAL_SOURCE_SECURITY_AUDIT.md` |

## Hard Rules (never break)

1. Do **not** run SQL/migrations/Supabase until user explicitly approves.
2. Do **not** use `createAdminClient` / service role in customer flows or Storage signed URLs.
3. Sensitive writes go through **RPC** (SECURITY DEFINER, `search_path = ''`).
4. Do **not** trust client-supplied `userId`, `cafeId`, `role`, `total`, `points`.
5. Private Storage: `assertPrivateStorageAccess`; public: `assertAnonPublicStorageAccess`.
6. `avatar_url` always NULL; official avatar path: `avatar_storage_path` via RPC.
7. Minimize diff scope — match existing conventions.

## Related Docs (repo root `docs/`)

- `BRANDA_PRODUCTION_DATABASE_MIGRATION_REPORT.md`
- `BRANDA_RLS_SECURITY_REVIEW.md`
- `BRANDA_SERVER_SECURITY_REVIEW.md`
- `BRANDA_SECURITY_DEFINER_REVIEW.md`
- `BRANDA_PRODUCTION_SECURITY_TEST_CHECKLIST.md`
- `BRANDA_STAGING_SECURITY_VALIDATION_REPORT.md`
- `BRANDA_FINAL_SOURCE_SECURITY_AUDIT.md`


---

# File: docs/BRANDA_HANDOFF/03_DATABASE_AND_SECURITY_ARCHITECTURE.md

# Branda — Database & Security Architecture

**Status:** Source-level hardening revised and statically gated — database not initialized — runtime validation pending.

---

## Migration Order (mandatory)

| # | File | Purpose |
| - | ---- | ------- |
| 1 | `001_branda_production_schema.sql` | Core schema, enums, RLS baseline, auth helpers |
| 2 | `002_branda_storage_policies.sql` | Storage buckets, path helpers, public/private object policies |
| 3 | `003_branda_security_hardening.sql` | Profile escalation guard, cafe_members, domain_orders table |
| 4 | `004_branda_critical_security_fixes.sql` | RPC-only flows, policy tightening, triggers |

**Not executed.** Fresh install applies 001→004 in order. Migration 004 explicitly `DROP POLICY IF EXISTS` for replaced wide policies.

---

## Auth Roles

| Role | Source | Access |
| ---- | ------ | ------ |
| `anon` | Supabase | Public cafe pages, published assets via RPC |
| `authenticated` | Supabase Auth | Customer, cafe staff, owner |
| `platform_admin` | `profiles.role` | Cross-cafe admin |
| Cafe owner | `cafes.owner_user_id` | Full cafe ownership |
| Cafe staff | `cafe_members` + `cafe_member_permissions` | Permission-scoped |

Staff permissions (text keys): `settings`, `menu`, `offers`, `orders`, `reservations`, `customers`, `loyalty`, `marketing`, `notifications`, `branches`.

---

## Core Tables (summary)

`profiles`, `cafes`, `cafe_members`, `cafe_member_permissions`, `cafe_settings`, `branches`, `menu_categories`, `menu_products`, `offers`, `orders`, `order_items`, `reservations`, `reservation_responses`, `customer_profiles`, `loyalty_accounts`, `loyalty_rules`, `loyalty_rewards`, `loyalty_transactions`, `marketing_campaigns`, `experience_campaigns`, `experience_submissions`, `notifications`, `reviews`, `subscriptions`, `audit_logs`, `domain_orders`, `platform_plans`, `platform_settings`, `cafe_pages`, `cafe_themes`, `cafe_custom_identity`.

Full DDL: see `001` + `003` + bundle `06_SUPABASE_MIGRATIONS_TESTS_SOURCE.md`.

---

## Security Helpers (001)

| Function | Type | Purpose |
| -------- | ---- | ------- |
| `is_platform_admin()` | DEFINER | Admin check |
| `is_cafe_owner(cafe_id)` | DEFINER | Owner check |
| `has_cafe_access(cafe_id)` | DEFINER | Any cafe member (non-sensitive reads only) |
| `has_cafe_permission(cafe_id, perm)` | DEFINER | Staff permission |
| `get_customer_profile_id(cafe_id)` | DEFINER | Current user's customer profile in cafe |

All SECURITY DEFINER functions use `SET search_path = ''` and qualified names (`public.*`).

---

## RPC Catalog (004 — authenticated unless noted)

| RPC | Purpose | Authorization |
| --- | ------- | ------------- |
| `assert_cafe_open_to_customers` | Cafe active/public check | internal |
| `write_audit_log` | Audit insert | internal |
| `get_cafe_public_settings` | Anon-safe public settings | anon + authenticated |
| `create_pickup_order` | Order creation | customer session |
| `respond_to_pickup_order` | Accept/reject order | orders permission |
| `submit_experience_submission` | New submission | customer |
| `attach_experience_submission_media` | Link uploaded image | customer + object exists |
| `update_experience_submission_metrics` | Metrics + DB-calculated suggested_points | marketing/owner/admin |
| `approve_experience_submission` | Approve + loyalty credit | marketing/owner/admin |
| `reject_experience_submission` | Reject pending | marketing/owner/admin |
| `create_customer_reservation` | Reservation insert | customer |
| `respond_to_reservation` | Accept/reject reservation | reservations permission |
| `mark_customer_notification_read` | Mark read | customer owner |
| `mark_cafe_notification_read` | Mark read | notifications permission |
| `create_cafe_notification` | Staff notification | notifications permission |
| `create_customer_notification` | Staff → customer | notifications permission |
| `adjust_loyalty_points` | Manual balance adjust | loyalty permission |
| `set_review_owner_reply` | Owner reply on review | owner/admin |
| `set_customer_avatar_storage_path` | Avatar bind | profile owner + object exists |
| `create_customer_profile` | Profile create | auth user + open cafe |
| `update_customer_profile` | Profile update (name, email, phone only) | profile owner via `auth.uid()` + `p_cafe_id` |
| `create_customer_review` | Review insert | customer session |
| `create_domain_order` | Domain order insert | owner/admin |
| `cancel_domain_order` | Cancel pending domain order | owner/admin |

Internal (no PUBLIC grant): `internal_notify_cafe`, `internal_notify_customer`.

---

## Sensitive Table Policies (final after 004)

### notifications
- **SELECT:** customer own OR cafe audience with `notifications` permission / owner / admin
- **INSERT/UPDATE:** no direct client policies — RPC only

### audit_logs
- **SELECT:** owner or platform_admin only
- **INSERT:** via `write_audit_log` (DEFINER) only

### subscriptions
- **SELECT:** owner or platform_admin only

### domain_orders
- **SELECT:** owner or platform_admin
- **Cancel:** `cancel_domain_order` RPC (`pending_review` → `cancelled`)

### loyalty_accounts
- **SELECT:** customer own OR loyalty permission / owner / admin
- **UPDATE:** removed — `adjust_loyalty_points` + experience approve RPC

### customer_profiles
- **SELECT:** self OR customers permission / owner / admin
- **INSERT:** removed — `create_customer_profile` RPC only
- **UPDATE:** no direct client policy — `update_customer_profile` RPC only (full_name, email, phone)
- **avatar_url:** always NULL (trigger + RPC); avatar path via `set_customer_avatar_storage_path`

### experience_submissions
- **SELECT:** customer own OR marketing / owner / admin
- **INSERT/UPDATE:** removed — RPC only

---

## Storage Buckets

| Bucket | Public | Path pattern | Read |
| ------ | ------ | ------------ | ---- |
| cafe-logos | published | `{cafe_id}/{file}` | `can_access_public_storage_object` |
| cafe-backgrounds | published | `{cafe_id}/{file}` | same |
| menu-products | published | `{cafe_id}/{product_id}/{file}` | same |
| menu-categories | published | `{cafe_id}/{category_id}/{file}` | same |
| offer-banners | published | `{cafe_id}/{offer_id}/{file}` | same |
| marketing-assets | published | `{cafe_id}/{campaign_id}/{file}` | same |
| customer-avatars | **private** | `{user_id}/{file}` | owner + admin |
| experience-submissions | **private** | `{user_id}/{submission_id}/{file}` | owner / marketing / admin |

Staff draft reads on public buckets: `storage_staff_can_read_cafe_asset(cafe_id, permission)`.

Private buckets: **no UPDATE policy** (replace via new upload). INSERT requires safe path + allowed image ext.

Object binding RPCs verify row in `storage.objects` before profile/submission update.

---

## Signed URLs (application layer)

| Helper | TTL | Auth |
| ------ | --- | ---- |
| `createPublishedAssetSignedUrl` | 10 min | `assertAnonPublicStorageAccess` |
| `createPrivateAssetSignedUrl` | 10 min | `assertPrivateStorageAccess` |

No service role. No signed URL persisted in DB.

Routes: `GET /api/public/storage`, `GET /api/storage/signed`.

---

## Triggers

| Trigger | Table | Purpose |
| ------- | ----- | ------- |
| `prevent_profile_role_escalation` | profiles | Block role self-escalation |
| `customer_profiles_immutable_binding` | customer_profiles | avatar_url NULL; block cafe/user reassignment |
| `enforce_review_owner_reply_only` | reviews | Staff can only set owner_reply |
| `handle_new_user` | auth.users | Create profiles row |

---

## Policies Dropped in 004 (28 total)

`cafe_settings_public_read`, `orders_customer_insert`, `order_items_insert`, `orders_cafe_update`, `experience_submissions_insert`, `experience_submissions_customer`, `experience_submissions_review`, `reservations_customer_insert`, `notifications_update_read`, `notifications_cafe_update_read`, `notifications_insert`, `notifications_read`, `loyalty_transactions_insert_staff`, `loyalty_accounts_update`, `loyalty_accounts_read`, `loyalty_rules_staff`, `experience_campaigns_staff`, `branches_staff`, `reviews_cafe_update`, `profiles_insert_own`, `customer_profiles_own`, `customer_profiles_update`, `customer_profiles_insert`, `domain_orders_owner_cancel`, `audit_logs_read`, `subscriptions_cafe`, `domain_orders_select`.

---

## Not Yet Run

- Migrations on any environment
- pgTAP tests (`supabase/tests/`)
- Seed (`supabase/seed/security_test_seed.sql`)
- Staging security validation
- Production deployment

---

## Official Phrase

```txt
Source-level hardening revised and statically gated — database not initialized — runtime validation pending.
```


---

# File: docs/BRANDA_HANDOFF/06_SECURITY_FINAL_STATUS.md

# Branda — Security Final Status

**Date:** 2026-05-30  
**Phase:** Source-level hardening revised and statically gated

---

## Official Status

```txt
Source-level hardening revised and statically gated — database not initialized — runtime validation pending.
```

---

## Closed in This Phase

| Area | Closure |
| ---- | ------- |
| Sensitive SELECT policies | notifications, audit_logs, subscriptions, domain_orders, loyalty_accounts tightened in 004 §11 |
| Customer profile create/update | RPC `create_customer_profile` + `update_customer_profile`; no direct INSERT/UPDATE policies |
| Experience metrics | `suggested_points` computed in DB; client cannot forge |
| Private storage | UPDATE policies removed; INSERT path + ext validation |
| Avatar / experience media | Object must exist in `storage.objects` before DB bind |
| Experience submissions | RPC-only writes |
| Orders / reservations / notifications | RPC-only sensitive operations |
| SECURITY DEFINER | All use `search_path = ''`; zero `search_path = public` |
| Static source gate | `npm run security:source` — forbidden policies + required RPCs |
| Service role | Not used in storage or customer data paths |
| Signed URLs | 10-minute TTL; authorization before sign |

---

## Counts (source files)

| Metric | Count |
| ------ | ----- |
| Migration files | 4 |
| Policies dropped/replaced in 004 | 28 |
| SECURITY DEFINER RPCs (004) | 24 |
| Storage buckets | 8 |
| pgTAP test files | 7 (written, not run; includes `007_security_closure_test.sql`) |

---

## Known Gaps (require runtime DB)

| Gap | Why source-only is insufficient |
| --- | -------------------------------- |
| RLS behavior under real JWT | Needs Supabase auth + policy execution |
| Storage MIME enforcement | Bucket config + upload integration |
| pgTAP assertions | Needs `supabase test db` |
| IndexedDB vs Storage in dashboard UI | UI still has local preview path; verify after Storage migration |
| Domain provider APIs | External integration not security-tested |

---

## Red Team Result

See [BRANDA_FINAL_SOURCE_SECURITY_AUDIT.md](../BRANDA_FINAL_SOURCE_SECURITY_AUDIT.md).

| Severity | Known open |
| -------- | ---------- |
| Critical | 0 |
| High | 0 |
| Medium | 2 (documented) |
| Low | 1 (documented) |

---

## Build & Static Gate

```txt
npm run security:source → PASSED
npm run build → exit 0
Next.js 16.2.6
37 app routes (+ middleware)
```

---

## Database Execution

```txt
No SQL, migration, seed, Supabase CLI, Staging, or Production action was executed. Database remains uninitialized.
```

---

## Next Steps (user-controlled)

1. Review handoff package (`docs/BRANDA_HANDOFF/`)
2. Apply migrations on isolated Staging Supabase project
3. Run pgTAP + manual security checklist
4. Fix any runtime findings
5. Only then consider Production


---

