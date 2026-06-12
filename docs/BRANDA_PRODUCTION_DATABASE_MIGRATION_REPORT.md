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
