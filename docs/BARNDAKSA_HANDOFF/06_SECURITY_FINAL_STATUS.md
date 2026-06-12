# Barndaksa — Security Final Status

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

See [BARNDAKSA_FINAL_SOURCE_SECURITY_AUDIT.md](../BARNDAKSA_FINAL_SOURCE_SECURITY_AUDIT.md).

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

1. Review handoff package (`docs/BARNDAKSA_HANDOFF/`)
2. Apply migrations on isolated Staging Supabase project
3. Run pgTAP + manual security checklist
4. Fix any runtime findings
5. Only then consider Production
