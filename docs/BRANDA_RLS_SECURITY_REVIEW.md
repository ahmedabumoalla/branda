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
