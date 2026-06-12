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
