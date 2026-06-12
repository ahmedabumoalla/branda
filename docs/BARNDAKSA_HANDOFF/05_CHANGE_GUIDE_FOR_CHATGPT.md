# Barndaksa — Change Guide for ChatGPT

## Golden Rules

1. **Minimal diff** — change only files required by the request.
2. **No DB execution** — edit migration SQL files only; never run them unless user explicitly asks.
3. **No service role** in client components, storage routes, or customer auth.
4. **No mock/localStorage as production data** — `lib/mock/*` is types/fixtures; runtime data from Supabase.
5. **Preserve design** — match existing component patterns, Arabic copy, Tailwind classes.
6. **Trust server** — never accept client `userId`, `cafeId`, `role`, `total`, `points` as authoritative.

---

## Layer Map

```
UI (components/, app/)
  → Server Actions (app/actions/)
    → Data layer (lib/data/)
      → Supabase client (lib/supabase/server.ts)
        → Postgres RLS / RPC / Storage
```

---

## When to Touch What

| Change | Typical files |
| ------ | ------------- |
| Dashboard page UI | `components/dashboard/pages/*`, `app/dashboard/*/page.tsx` |
| Customer cafe page | `components/cafe/*`, `app/c/[slug]/**` |
| Admin | `components/admin/*`, `app/admin/**`, `lib/data/admin.ts` |
| New API route | `app/api/**` + `lib/data/*` |
| Auth | `app/actions/auth.ts`, `lib/data/customers.ts`, `app/auth/callback` |
| Upload | `app/actions/upload.ts`, `lib/storage/upload-server.ts`, `002` storage policies |
| Signed URL | `lib/storage/resolve-storage-url.ts`, `app/api/storage/signed/route.ts` |
| Schema change | `supabase/migrations/004_*` (append section) + `lib/data/*` + types |
| New RPC | `004` + matching `lib/data/*` `.rpc()` call |

---

## When NOT to Touch DB/RLS

- Pure UI copy/styling
- Component layout refactors
- Documentation-only tasks
- Build/config fixes unrelated to data

## When MUST Update Migration

- New table/column
- New/changed RLS policy
- New SECURITY DEFINER RPC
- Storage bucket or policy change

Pattern for replacing policies in 004:

```sql
DROP POLICY IF EXISTS old_policy ON table_name;
CREATE POLICY new_policy ON table_name ...;
```

---

## Security Patterns to Preserve

### Customer profile
- Create: `create_customer_profile` RPC only
- Avatar: upload → storage → `set_customer_avatar_storage_path`
- `avatar_url` always NULL

### Experience
- All writes via RPC (submit, attach, metrics, approve, reject)
- Metrics RPC calculates `suggested_points` — do not pass from TypeScript

### Orders
- `create_pickup_order`, `respond_to_pickup_order` only

### Loyalty
- `adjust_loyalty_points` only for manual adjustments

### Storage
- Public: `can_access_public_storage_object`
- Private: `assertPrivateStorageAccess`
- TTL: 600 seconds max

---

## File Discovery

1. Start with `docs/BARNDAKSA_HANDOFF/02_ROUTES_AND_FEATURES_MAP.md`
2. Use `04_DATA_FLOW_AND_STATE_MAP.md` for end-to-end trace
3. Read full source from `SOURCE_BUNDLES/` if needed

Regenerate bundles: `node scripts/generate-handoff.mjs`

---

## Commit / PR

Only commit when user asks. Do not push without explicit request.

---

## Status Phrase in Reports

Always include when documenting security state:

```txt
Code hardening complete at source level — database not initialized — runtime security validation pending.
```
