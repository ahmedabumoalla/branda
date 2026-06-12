# Barndaksa Production Security Test Checklist

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
