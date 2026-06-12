# Barndaksa — Database & Security Architecture

**Status:** Source-level hardening revised and statically gated — database not initialized — runtime validation pending.

---

## Migration Order (mandatory)

| # | File | Purpose |
| - | ---- | ------- |
| 1 | `001_barndaksa_production_schema.sql` | Core schema, enums, RLS baseline, auth helpers |
| 2 | `002_barndaksa_storage_policies.sql` | Storage buckets, path helpers, public/private object policies |
| 3 | `003_barndaksa_security_hardening.sql` | Profile escalation guard, cafe_members, domain_orders table |
| 4 | `004_barndaksa_critical_security_fixes.sql` | RPC-only flows, policy tightening, triggers |

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
