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
