# BARNDAKSA Database Blueprint

## 1) Executive Summary

هذا المستند هو مخطط قاعدة البيانات والأمن والتخزين المستقبلي لمنصة `barndaksa-platform` بناءً على مراجعة الكود الحالي (app/components/lib/api/docs).  
الوضع الحالي في المشروع: **Mock + localStorage** لمعظم البيانات التشغيلية.

أهداف التحويل للإنتاج:
- جعل **الخادم** هو مصدر الحقيقة (Source of Truth).
- منع تداخل بيانات الكوفيهات (Multi-tenant isolation).
- تطبيق RLS صارم لكل دور.
- نقل الوسائط (logos/images/docs) من base64/localStorage إلى Storage URLs.
- ربط المدفوعات/الدومينات بسيرفر + webhooks بدل واجهة العميل.

---

## 2) Entity Map

- **Platform**: plans, options, operations, audit logs.
- **Identity**: profiles, roles, memberships, permissions.
- **Cafe**: cafes, settings, domains, theme history, staff, pages.
- **Commerce**: categories, products, offers, orders, order_items, invoices, payments.
- **Reservation**: branches, spaces/tables, reservations, status history.
- **Customer**: cafe_customers, profiles, transactions, loyalty modules.
- **Reviews**: reviews, replies, moderation/reports.
- **Marketing**: campaigns, codes, events, attribution.
- **Domains**: orders, payments, events, verification.
- **Storage metadata**: uploaded_files/government_docs/asset metadata.

---

## 3) Tables (Purpose, Keys, Constraints, Access)

## Auth & Roles

- `profiles`
  - **Purpose:** ملف المستخدم الأساسي.
  - **Core columns:** `id (uuid pk)`, `email`, `full_name`, `phone`, `avatar_url`, `created_at`.
  - **FKs:** `id -> auth.users.id`.
  - **Indexes:** unique(email), index(phone).
  - **Soft delete:** optional `deleted_at`.
  - **Access:** owner read/update self; admin read all.

- `user_roles`
  - **Purpose:** أدوار المستخدم (admin / cafe_owner / cafe_staff / customer).
  - **Columns:** `id`, `user_id`, `role`, `created_at`.
  - **Unique:** `(user_id, role)`.
  - **Access:** admin write; user read self.

- `cafe_members`
  - **Purpose:** ربط المستخدمين بالكوفيهات.
  - **Columns:** `id`, `cafe_id`, `user_id`, `member_role`, `active`, `created_at`.
  - **Unique:** `(cafe_id, user_id)`.
  - **Access:** cafe_owner/admin manage; member read self.

- `permissions`
  - **Purpose:** صلاحيات staff التفصيلية.
  - **Columns:** `id`, `member_id`, `permission_key`, `allowed`.
  - **Unique:** `(member_id, permission_key)`.
  - **Access:** owner/admin write; staff read own grants.

## Platform

- `platform_options`
  - **Purpose:** إعدادات المنصة العامة (signup/approval/commission/support...).
  - **Columns:** `id`, `allow_cafe_signup`, `require_cafe_approval`, `platform_commission_percent`, `support_email`, `default_plan_id`.
  - **Access:** admin read/write only.

- `platform_plans`
  - **Purpose:** باقات المنصة.
  - **Columns:** `id`, `name`, `price_monthly`, `description`, `active`, `created_at`.
  - **Access:** public/cafe read active; admin write all.

- `platform_plan_features`
  - **Purpose:** ميزات كل باقة.
  - **Columns:** `id`, `plan_id`, `feature_key`.
  - **Unique:** `(plan_id, feature_key)`.
  - **Access:** same as plans.

- `platform_operations`
  - **Purpose:** عمليات تشغيل المنصة (طلبات، حجوزات، شراء/ربط دومين...).
  - **Columns:** `id`, `cafe_id`, `customer_id?`, `type`, `title`, `amount`, `status`, `meta`, `created_at`.
  - **Indexes:** `(cafe_id, created_at desc)`, `(type, created_at desc)`.
  - **Access:** admin full; cafe_owner read own cafe only.

- `audit_logs`
  - **Purpose:** سجل تدقيق أمني.
  - **Columns:** `id`, `actor_id`, `actor_role`, `cafe_id`, `entity_type`, `entity_id`, `action`, `before`, `after`, `ip_address`, `user_agent`, `created_at`.
  - **Access:** admin read only; writes by backend only.

## Cafes

- `cafes`
  - **Purpose:** الكوفيهات المسجلة.
  - **Columns:** `id`, `slug`, `name`, `status`, `owner_user_id`, `plan_id`, `created_at`.
  - **Unique:** `slug`.
  - **Access:** public read active minimal fields; owner/admin scoped writes.

- `cafe_settings`
  - **Purpose:** إعدادات الكوفي (owner info, socials, docs refs, logo).
  - **Columns:** `id`, `cafe_id`, `owner_name`, `owner_email`, `owner_phone`, `description`, `logo_asset_id?`, `tax_number`, `commercial_register`, `maroof_certificate`, `instagram`, `whatsapp`, `updated_at`.
  - **Access:** owner/staff scoped write, admin read all.

- `cafe_domains`
  - **Purpose:** subdomain/custom/purchased domain state.
  - **Columns:** `id`, `cafe_id`, `domain`, `source(platform_subdomain|external_custom_domain|purchased_domain)`, `status`, `verified_at`, `provider_domain_id`, `created_at`.
  - **Unique:** `domain`, `(cafe_id, source)` partial by active.
  - **Access:** owner read own, admin all; verification by backend.

- `cafe_theme_history`
  - **Purpose:** سجل تغيير الثيم.
  - **Columns:** `id`, `cafe_id`, `theme_id`, `changed_by`, `changed_at`.
  - **Access:** owner/admin read; writes backend on theme change.

- `cafe_subscriptions`
  - **Purpose:** الاشتراك النشط.
  - **Columns:** `id`, `cafe_id`, `plan_id`, `status`, `current_period_start`, `current_period_end`, `updated_at`.
  - **Unique:** one active per cafe.
  - **Access:** owner read own; writes webhook/admin only.

- `subscription_payments`
  - **Purpose:** عمليات دفع الاشتراك.
  - **Columns:** `id`, `cafe_id`, `plan_id`, `amount`, `currency`, `provider`, `provider_ref`, `status`, `paid_at`, `created_at`.
  - **Access:** owner read own; write backend/webhook.

- `cafe_pages`
  - **Purpose:** الصفحات التعريفية المخصصة.
  - **Columns:** `id`, `cafe_id`, `slug`, `title`, `content`, `published`, `created_at`, `updated_at`.
  - **Unique:** `(cafe_id, slug)`.
  - **Access:** owner write; public read published only.

- `cafe_staff`
  - **Purpose:** read model لتسهيل إدارة الموظفين.
  - **Columns:** `id`, `cafe_id`, `profile_id`, `role`, `active`.
  - **Access:** owner/admin.

## Menu & Commerce

- `product_categories`
  - **Columns:** `id`, `cafe_id`, `name`, `sort_order`.
  - **Unique:** `(cafe_id, name)`.

- `menu_products`
  - **Columns:** `id`, `cafe_id`, `category_id`, `name`, `description`, `price`, `available`, `loyalty_points`, `image_asset_id?`, `created_at`.
  - **Indexes:** `(cafe_id, available)`, `(cafe_id, category_id)`.

- `product_images`
  - **Columns:** `id`, `product_id`, `asset_id`, `sort_order`.

- `offers`
  - **Columns:** `id`, `cafe_id`, `title`, `description`, `status`, `visible_in_cafe`, `placement`, `linked_product_id?`, `banner_asset_id?`, `starts_at`, `ends_at`.

- `orders`
  - **Columns:** `id`, `cafe_id`, `customer_id`, `status`, `subtotal`, `tax`, `total`, `source`, `created_at`.
  - **Indexes:** `(cafe_id, created_at desc)`, `(customer_id, created_at desc)`.

- `order_items`
  - **Columns:** `id`, `order_id`, `product_id`, `qty`, `unit_price`, `total`.

- `invoices`
  - **Columns:** `id`, `cafe_id`, `customer_id`, `order_id`, `amount`, `status`, `issued_at`.

- `payments`
  - **Columns:** `id`, `cafe_id`, `order_id?`, `invoice_id?`, `provider`, `provider_ref`, `amount`, `status`, `captured_at`.
  - **Writes:** backend/webhook only.

- `carts` (future)
  - **Columns:** `id`, `cafe_id`, `customer_id`, `status`, `updated_at`.

## Reservations

- `branches`
  - **Columns:** `id`, `cafe_id`, `name`, `city`, `address`, `phone`, `active`.

- `reservation_spaces`
  - **Columns:** `id`, `branch_id`, `name`, `capacity`, `active`.

- `reservations`
  - **Columns:** `id`, `cafe_id`, `branch_id`, `space_id?`, `customer_id`, `date`, `time`, `guests`, `status`, `notes`, `created_at`.

- `reservation_status_history`
  - **Columns:** `id`, `reservation_id`, `from_status`, `to_status`, `changed_by`, `changed_at`.

## Customers

- `cafe_customers`
  - **Columns:** `id`, `cafe_id`, `external_ref?`, `full_name`, `phone`, `email`, `status`, `total_spent`, `loyalty_points`, `created_at`.
  - **Unique:** `(cafe_id, phone)` optional.

- `customer_profiles`
  - **Columns:** `id`, `customer_id`, `avatar_asset_id?`, `preferences`, `updated_at`.

- `customer_transactions`
  - **Columns:** `id`, `cafe_id`, `customer_id`, `type`, `title`, `amount`, `points`, `meta`, `created_at`.

- `loyalty_settings`
  - **Columns:** `id`, `cafe_id`, `enabled`, `points_per_sar`, `min_redeem_points`, `updated_at`.

- `loyalty_rewards`
  - **Columns:** `id`, `cafe_id`, `title`, `points_cost`, `active`.

- `loyalty_redemptions`
  - **Columns:** `id`, `cafe_id`, `customer_id`, `reward_id`, `points_used`, `status`, `created_at`.

## Reviews

- `reviews`
  - **Columns:** `id`, `cafe_id`, `product_id`, `customer_id`, `rating`, `comment`, `status`, `created_at`.

- `review_replies`
  - **Columns:** `id`, `review_id`, `cafe_id`, `replied_by`, `body`, `created_at`.

- `review_reports`
  - **Columns:** `id`, `review_id`, `reported_by`, `reason`, `status`, `created_at`.

## Marketing

- `marketing_campaigns`
  - **Columns:** `id`, `cafe_id`, `title`, `type`, `channel`, `status`, `budget`, `starts_at`, `ends_at`.

- `campaign_codes`
  - **Columns:** `id`, `campaign_id`, `code`, `active`, `uses_count`.

- `campaign_events`
  - **Columns:** `id`, `campaign_id`, `event_type`, `customer_id?`, `meta`, `created_at`.

- `affiliate_codes` (or `influencer_codes`)
  - **Columns:** `id`, `cafe_id`, `code`, `owner_name`, `commission_rate`, `status`.

## Domains

- `domain_orders`
  - **Columns:** `id`, `cafe_id`, `domain`, `years`, `price`, `currency`, `provider_order_id`, `status`, `created_at`.

- `domain_payments`
  - **Columns:** `id`, `domain_order_id`, `provider`, `provider_ref`, `status`, `paid_at`.

- `domain_events`
  - **Columns:** `id`, `cafe_id`, `domain`, `event_type(search|buy|connect|verify|fail)`, `payload`, `created_at`.

- `domain_verifications`
  - **Columns:** `id`, `cafe_domain_id`, `method`, `status`, `verified_at`, `details`.

## Storage Metadata

- `uploaded_files`
  - **Columns:** `id`, `owner_type`, `owner_id`, `bucket`, `path`, `mime_type`, `size_bytes`, `sha256`, `visibility`, `created_at`.

- `government_documents`
  - **Columns:** `id`, `cafe_id`, `doc_type`, `file_id`, `status`, `verified_by?`, `verified_at`.

- `storage_objects_metadata`
  - **Columns:** `id`, `bucket`, `path`, `public_url`, `width?`, `height?`, `scan_status`, `deleted_at`.

---

## 4) Relationships

- `cafes.owner_user_id -> profiles.id`
- `cafe_members.cafe_id -> cafes.id`
- `cafe_members.user_id -> profiles.id`
- `cafe_settings.cafe_id -> cafes.id`
- `menu_products.cafe_id -> cafes.id`
- `offers.cafe_id -> cafes.id`
- `orders.cafe_id -> cafes.id`
- `orders.customer_id -> cafe_customers.id`
- `order_items.order_id -> orders.id`
- `reservations.cafe_id -> cafes.id`
- `reservations.branch_id -> branches.id`
- `customer_transactions.customer_id -> cafe_customers.id`
- `reviews.product_id -> menu_products.id`
- `reviews.customer_id -> cafe_customers.id`
- `cafe_domains.cafe_id -> cafes.id`
- `domain_orders.cafe_id -> cafes.id`
- `subscription_payments.cafe_id -> cafes.id`

---

## 5) RLS Policies (Plan)

> أمثلة pseudo SQL توضيحية فقط.

- **Admin sees all**
```sql
-- pseudo
allow select, update on cafes where current_role = 'admin';
```

- **Cafe owner/staff scoped by membership**
```sql
allow select, insert, update on menu_products
where cafe_id in (select cafe_id from cafe_members where user_id = auth.uid() and active = true);
```

- **Customer sees own orders only**
```sql
allow select on orders
where customer_id in (select id from cafe_customers where user_id = auth.uid());
```

- **Public read only active storefront data**
```sql
allow select on menu_products
where available = true and cafe_id in (select id from cafes where status = 'active');
```

- **Payment/subscription status protected**
```sql
deny update(status='paid') for user roles;
allow update by service_role_webhook only;
```

---

## 6) Storage Buckets

- `brand-assets`
  - visibility: public
  - path: `brand/{asset-name}`
  - upload: admin/devops only
  - read: public

- `cafe-logos`
  - visibility: public-read
  - path: `{cafe_id}/logo/{uuid}.webp`
  - upload: cafe_owner/staff signed upload
  - read: public
  - max size: 3MB, mime: webp/png/jpeg

- `product-images`
  - public-read, path `{cafe_id}/products/{product_id}/{uuid}`
  - max size 5MB

- `offer-banners`
  - public-read, path `{cafe_id}/offers/{offer_id}/{uuid}`
  - max size 6MB

- `customer-avatars`
  - private/signed-read
  - path `{cafe_id}/customers/{customer_id}/{uuid}`

- `government-documents`
  - private only
  - path `{cafe_id}/docs/{doc_type}/{uuid}`
  - signed URL required, malware/virus scan required

- `review-attachments`
  - private or moderated-public حسب سياسة المنتج

- `cafe-page-assets`
  - public-read controlled via published pages

- `marketing-assets`
  - mixed visibility حسب الحملة

**قواعد عامة**
- لا base64 في DB.
- حفظ URL + metadata فقط.
- signed upload URLs + size/type validation + optional virus scan.

---

## 7) API Routes (Target Server-Side)

- Auth/session:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/session`

- Cafe management:
  - `PATCH /api/cafes/:id/settings`
  - `PATCH /api/cafes/:id/theme`
  - `GET /api/cafes/:slug/public`

- Commerce:
  - `POST /api/orders`
  - `GET /api/orders/:id`
  - `PATCH /api/orders/:id/status` (owner/staff/admin)

- Reservations:
  - `POST /api/reservations`
  - `PATCH /api/reservations/:id/status`

- Admin platform:
  - `GET/PATCH /api/platform/plans`
  - `GET/PATCH /api/platform/options`
  - `GET /api/platform/operations`

- Domains:
  - keep `app/api/domains/*` but enforce auth/ownership/idempotency/rate limits.

- Subscriptions & payments:
  - `POST /api/subscriptions/checkout`
  - `POST /api/payments/webhook` (verified signature mandatory)
  - `GET /api/subscriptions/current`

- Storage:
  - `POST /api/uploads/sign`
  - `POST /api/uploads/complete`

---

## 8) LocalStorage -> DB Migration Map

- `barndaksa_qatrah_settings` -> `cafe_settings`
- `barndaksa_qatrah_theme` -> `cafe_settings.theme_id` + `cafe_theme_history`
- `barndaksa_qatrah_menu` -> `menu_products`
- `barndaksa_qatrah_offers` -> `offers`
- `barndaksa_qatrah_orders` -> `orders/order_items`
- `barndaksa_qatrah_invoices` -> `invoices`
- `barndaksa_qatrah_customer_transactions` -> `customer_transactions`
- `barndaksa_qatrah_reservations` -> `reservations`
- `barndaksa_qatrah_reviews` -> `reviews/review_replies`
- `barndaksa_qatrah_branches` -> `branches`
- `barndaksa_qatrah_loyalty_settings` -> `loyalty_settings`
- `barndaksa_qatrah_loyalty_rewards` -> `loyalty_rewards`
- `barndaksa_qatrah_pages` -> `cafe_pages`
- `barndaksa_qatrah_marketing` -> `marketing_campaigns`
- `barndaksa_qatrah_active_plan` -> `cafe_subscriptions`
- `barndaksa_qatrah_subscription_history` -> `subscription_payments`
- `barndaksa_qatrah_pending_subscription` -> `payment_events`/pending checkout table
- `barndaksa_platform_*` -> platform admin tables
- domain keys (`domain_searches/purchases/active`) -> `domain_orders/domain_events/cafe_domains`
- `barndaksa_customer_session_${slug}` -> secure server session/JWT + `customer_sessions`

---

## 9) Security Risks (Top)

1. الاعتماد على localStorage كـ source-of-truth.
2. إمكانية تزوير الدور/الجلسة client-side.
3. تزوير بيانات الطلب/الإيرادات/الحجوزات.
4. حفظ PII/financial-like fields في localStorage.
5. مفاتيح tenant hardcoded (`qatrah`) تسبب احتمالات تداخل.
6. شراء/ربط الدومين قبل تحقق دفع موثّق.
7. عدم وجود audit logs server-enforced.
8. عدم وجود idempotency لعمليات مالية/دومين.
9. base64 logos داخل client state.
10. عدم وجود rate limits/abuse protection على domain routes.

---

## 10) Production Checklist

- [ ] Supabase Auth + claims roles.
- [ ] نقل كل CRUD الحساس إلى API server-side.
- [ ] تطبيق RLS على كل جدول tenant-bound.
- [ ] تفعيل webhook payment verification.
- [ ] تحويل الأصول إلى Storage URL (بدون base64).
- [ ] إضافة audit logging middleware.
- [ ] إضافة idempotency + retry strategy.
- [ ] إضافة rate limiting على endpoints الحساسة.
- [ ] ربط domain purchase بالدفع المؤكد فقط.
- [ ] اختبارات صلاحيات (admin/owner/staff/customer/public).

---

## 11) Supabase Implementation Phases

- **Phase 1 (Foundation):**
  - auth, profiles, roles, cafes, cafe_members, RLS baseline.

- **Phase 2 (Core Cafe Data):**
  - settings, products, offers, branches, pages, reviews.

- **Phase 3 (Transactions):**
  - orders, reservations, invoices, payments, customer_transactions.

- **Phase 4 (Platform/Admin):**
  - plans/options/operations/audit.

- **Phase 5 (Domains + Subscription Hardening):**
  - domain_orders/events/verifications + verified payment webhooks.

- **Phase 6 (Storage & Compliance):**
  - signed upload, document verification, retention policies, security monitoring.

---

## 12) Platform Upgrade v2 — Tables & Keys

> **تاريخ:** 2026-05-30 — إضافات من ترقية v2 (فئات، استلام، ثيم مخصص، حملات تجربة، إشعارات).

### New / Extended localStorage Keys

| Key | Type | Written in | Read in | DB target |
|-----|------|------------|---------|-----------|
| `barndaksa_qatrah_menu_categories` | `MenuCategoryRecord[]` | `menu-page.tsx` | menu, cafe public, custom theme | `product_categories` |
| `barndaksa_qatrah_custom_identity_theme` | `CustomIdentityTheme` | `custom-identity-builder.tsx`, `theme-page.tsx` | `brand-identity-custom-theme.tsx` | `cafe_custom_identity` |
| `barndaksa_qatrah_experience_campaigns` | `ExperienceCampaign[]` | `marketing-page.tsx` | marketing, loyalty flows | `experience_campaigns` |
| `barndaksa_qatrah_experience_submissions` | `ExperienceSubmission[]` | marketing + approval flows | marketing, notifications | `experience_submissions` |
| `barndaksa_qatrah_notifications` | `AppNotification[]` | order/reservation/experience flows | dashboard (future bell), account | `notifications` |

### Extended Keys (schema changes)

| Key | New fields / behavior | DB columns |
|-----|----------------------|------------|
| `barndaksa_qatrah_menu` | `categoryId`, `availableForPickup`, `pickupLeadTimeMinutes` on `MenuProduct` | `menu_products.category_id`, `available_for_pickup`, `pickup_lead_minutes` |
| `barndaksa_qatrah_orders` | Pickup-only: `type=استلام`, `pickupAt`, `status`, `paymentStatus`, `rejectionReason`, `cafeResponseAt` | `orders.fulfillment_type`, `pickup_at`, `status`, `payment_status`, `rejection_reason`, `responded_at` |
| `barndaksa_qatrah_theme` | New theme id `brand-identity-custom` (11th theme) | `cafe_themes` seed + `cafe_settings.theme_id` |

### New Tables (Postgres / Supabase)

#### `product_categories` (extended from v1 stub)

- **Purpose:** فئات المنيو القابلة للإدارة (صورة، أيقونة، ترتيب، featured).
- **Columns:** `id`, `cafe_id`, `name`, `description`, `image_asset_id?`, `icon?`, `sort_order`, `visible`, `featured`, `created_at`, `updated_at`.
- **Unique:** `(cafe_id, name)`.
- **RLS:** owner/staff write; public read where `visible=true` and cafe active.

#### `cafe_custom_identity`

- **Purpose:** ثيم الهوية المخصصة (palette + background + featured section).
- **Columns:** `id`, `cafe_id`, `logo_asset_id?`, `palette jsonb`, `background_asset_id?`, `background_scope`, `background_fit`, `overlay_strength`, `featured_section_mode`, `featured_category_id?`, `created_at`, `updated_at`.
- **Unique:** one row per `cafe_id`.
- **RLS:** owner write; public read effective theme when `theme_id = brand-identity-custom`.

#### `experience_campaigns`

- **Purpose:** حملات فيديو/سوشيال للولاء.
- **Columns:** `id`, `cafe_id`, `title`, `description`, `start_date`, `end_date`, `terms`, `platforms text[]`, `min_followers?`, `base_points`, `points_per_view`, `points_per_like`, `points_per_comment`, `max_points_per_submission`, `requires_manual_approval`, `status`, `created_at`.
- **RLS:** owner write; public read active campaigns only.

#### `experience_submissions`

- **Purpose:** تقديمات العملاء على حملات التجربة.
- **Columns:** `id`, `campaign_id`, `cafe_id`, `customer_id`, `platform`, `video_url`, `platform_username?`, `note?`, `status`, `views?`, `likes?`, `comments?`, `shares?`, `suggested_points?`, `awarded_points?`, `rejection_reason?`, `created_at`, `reviewed_at?`.
- **FKs:** `campaign_id -> experience_campaigns.id`, `customer_id -> cafe_customers.id`.
- **RLS:** customer insert own; owner approve/reject; customer read own.

#### `notifications`

- **Purpose:** إشعارات الكوفي والعميل (طلب، حجز، ولاء، تجربة، تقييم).
- **Columns:** `id`, `cafe_id`, `audience`, `customer_id?`, `title`, `body`, `type`, `read`, `meta jsonb`, `created_at`.
- **Indexes:** `(cafe_id, audience, read, created_at desc)`, `(customer_id, read)`.
- **RLS:** cafe_owner read cafe audience; customer read own; writes by backend flows only.

#### `order_fulfillment` (optional normalize)

- **Purpose:** فصل بيانات الاستلام عن `orders` إن توسّع النظام لاحقًا.
- **Columns:** `order_id`, `fulfillment_type`, `pickup_at`, `branch_id?`, `responded_at`, `rejection_reason?`.
- **Note:** في mock الحالي تُدمج الحقول في `orders` مباشرة.

### Extended Table Columns (v2)

**`menu_products`**
- `category_id uuid FK -> product_categories.id`
- `available_for_pickup boolean default true`
- `pickup_lead_minutes int`

**`orders`**
- `fulfillment_type text default 'pickup'` — قيم: `pickup` (استلام)
- `pickup_at timestamptz`
- `payment_status text` — mock: «الدفع عند الاستلام»
- `rejection_reason text`
- `responded_at timestamptz`

**`cafe_themes` (seed)**
- إضافة صف `brand-identity-custom` — «هوية مخصصة»

### Migration Map (v2 additions)

| localStorage | Table | Notes |
|--------------|-------|-------|
| `barndaksa_qatrah_menu_categories` | `product_categories` | migrate before products FK |
| `barndaksa_qatrah_custom_identity_theme` | `cafe_custom_identity` | palette jsonb; images → Storage |
| `barndaksa_qatrah_experience_campaigns` | `experience_campaigns` | |
| `barndaksa_qatrah_experience_submissions` | `experience_submissions` | approval workflow server-side |
| `barndaksa_qatrah_notifications` | `notifications` | replace client-only writes with triggers |
| `barndaksa_qatrah_orders` (pickup fields) | `orders` + optional `order_fulfillment` | status transitions server-enforced |

### Notification Types (enum reference)

`order_accepted`, `order_rejected`, `reservation_accepted`, `reservation_rejected`, `loyalty_points`, `experience_approved`, `new_pickup_order`, `new_reservation`, `new_review`, `experience_submission`.

### RLS Notes (v2)

- **notifications:** customer `select` where `customer_id = self`; cafe `select` where `audience = 'cafe'` and `cafe_id` in membership; no client `insert` in production.
- **experience_submissions:** customer `insert` own; cafe owner `update status/awarded_points`; admin read all.
- **cafe_custom_identity:** public read limited palette/logo for storefront render; sensitive builder drafts owner-only.

### API Routes (v2 target)

| Route | Purpose |
|-------|---------|
| `GET/POST/PATCH /api/cafes/:id/categories` | CRUD فئات المنيو |
| `GET/PATCH /api/cafes/:id/custom-identity` | ثيم الهوية المخصصة |
| `GET/POST /api/cafes/:id/experience-campaigns` | حملات التجربة |
| `POST /api/experience-submissions` | تقديم فيديو عميل |
| `PATCH /api/experience-submissions/:id/review` | موافقة/رفض (owner) |
| `POST /api/orders` (extended) | pickup order + notify cafe |
| `PATCH /api/orders/:id/status` | accept/reject pickup |
| `GET /api/notifications` | قائمة إشعارات حسب audience |
| `PATCH /api/notifications/:id/read` | تعليم كمقروء |

---

## 13) Custom Identity Persistence, Category Visibility & Filtering Fix

### Root cause (theme not applying on `/c/[slug]`)

- Client hook cached default theme from SSR via `useMemo([previewTheme])` without re-reading `barndaksa_qatrah_theme` after hydration.
- Custom identity CSS variables were not injected on inner customer routes (`/login`, `/products/*`, etc.) — only on home theme component.

### Storage keys (actual)

| Key | Constant | Writers | Readers |
|-----|----------|---------|---------|
| `barndaksa_qatrah_theme` | `CAFE_THEME_KEY` | `lib/cafe/theme-storage-sync.ts` (`adoptCafeTheme`), `theme-page.tsx`, `custom-identity-builder.tsx` | `use-resolved-cafe-theme.ts`, `use-cafe-theme-page.ts`, `cafe-theme-renderer.tsx` |
| `barndaksa_qatrah_custom_identity_theme` | `CUSTOM_IDENTITY_THEME_KEY` | `persistCustomIdentityTheme` in `theme-storage-sync.ts` | `brand-identity-custom-theme.tsx`, `themed-cafe-shell.tsx`, `custom-identity-featured.ts` |
| `barndaksa_qatrah_menu_categories` | `MENU_CATEGORIES_KEY` | `menu-page.tsx` via `saveMenuCategories` + `notifyMenuCategoriesUpdated` | `menu-category-utils.ts`, `ThemeCategoryStrip`, `product-collection-page.tsx` |

### Cross-tab / same-tab sync

Custom events (same tab): `barndaksa:theme-updated`, `barndaksa:custom-identity-updated`, `barndaksa:menu-categories-updated`.  
`storage` event (other tabs): same keys.

### Category fallback (`menu_products`)

1. Use `category_id` when present and valid FK.
2. Else match legacy `category` text to `product_categories.name`.
3. Else bucket as «غير مصنف» in filters only — product still visible in «الكل».

### Tables (unchanged names, clarified usage)

- **`cafe_custom_identity`** ← `barndaksa_qatrah_custom_identity_theme` (palette jsonb; `logo_url`, `background_url` in Storage — **not** base64 in DB).
- **`product_categories`** ← `barndaksa_qatrah_menu_categories`.
- **`cafe_themes.active_theme_id`** ← `barndaksa_qatrah_theme` value e.g. `brand-identity-custom`.

### RLS (production)

| Table | Policy |
|-------|--------|
| `cafe_custom_identity` | Owner write; public read sanitized palette + public logo/background URLs only |
| `product_categories` | Owner CRUD; public read `visible=true` ordered by `sort_order` |
| `menu_products` | Public read `available=true`; join category by `category_id` |

### Storage buckets

- **`cafe-theme-assets`** — logo + background from custom identity builder (replace base64 localStorage).
- Existing **`cafe-logos`** — cafe settings logo.

### Client filtering (no DB)

Implemented in `ThemedFilterBar` + `menu-category-utils.ts` — server-side equivalent: query params `category_id`, `sort`, `price_band`, `offers_only` on `GET /api/cafes/:slug/products`.

---

## 14) Local Image Asset Storage Fix & Future Storage Migration

### Problem

`QuotaExceededError` when saving `barndaksa_qatrah_custom_identity_theme` because logo/background were stored as Base64 Data URLs in `localStorage` (same risk for `barndaksa_qatrah_settings.logoDataUrl`).

### Current mock architecture

| Layer | Contents |
|-------|----------|
| **localStorage** | Text/color theme settings + **`logoAssetId`** / **`backgroundAssetId`** references only |
| **IndexedDB** `barndaksa-local-assets` → store `assets` | Image Blobs (client-only mock) |

Fixed asset IDs (replace in place, no accumulation):

- `barndaksa-qatrah-custom-theme-logo`
- `barndaksa-qatrah-custom-theme-background`
- `barndaksa-qatrah-cafe-logo`

### New / updated files

- `lib/cafe/local-asset-store.ts` — IndexedDB CRUD + object URLs
- `lib/cafe/local-storage-repair.ts` — legacy base64 migration + targeted cleanup (never `localStorage.clear()`)
- `lib/cafe/cafe-settings-storage.ts` — sanitize settings before `setItem`
- `lib/cafe/use-custom-identity-visuals.ts`, `lib/cafe/use-resolved-cafe-logo.ts`
- `lib/mock/custom-identity-theme.ts` — strips `data:image` on save; throws if JSON contains base64
- Dashboard builder, cafe themes shell, settings page — consume asset IDs

### Migration

`migrateLegacyCustomIdentityAssets()` runs once per session on theme/customer routes. Converts legacy `logoDataUrl` / `backgroundImageDataUrl` to Blobs + asset IDs. `repairLocalImageStorage()` for manual repair UI.

### Future Supabase mapping

| Mock field | Production column / bucket |
|------------|----------------------------|
| `logoAssetId` (cafe settings) | `cafe_settings.logo_url` → bucket `cafe-logos` |
| `logoAssetId` (custom identity) | `cafe_brand_identities.logo_url` |
| `backgroundAssetId` | `cafe_theme_assets.background_url` → bucket `cafe-theme-assets` |

### RLS (production)

- **cafe_owner:** upload/update only under `{cafe_id}/…` prefix for owned cafe
- **public:** read approved/public storefront assets only
- **admin:** audit/review when needed
- **Never** persist Base64 in Postgres or browser localStorage in production

---

## 15) Global Image Upload Pipeline & Asset Storage Final Fix

### Why 2MB/6MB rejection was removed

Client-side size gates blocked valid uploads before optimization. Owners upload large originals; the browser compresses via Canvas → WebP before IndexedDB storage.

### Pipeline (`lib/cafe/image-asset-pipeline.ts`)

- `optimizeImageForStorage(file, purpose)` — resize (aspect ratio preserved), quality iteration toward target bytes.
- Hard safety cap: **40MB** original file only.
- SVG uploads rejected (no unsanitized SVG in mock storage).

### Entity field migration

| Storage key | Fields now reference IndexedDB |
|-------------|--------------------------------|
| `barndaksa_qatrah_custom_identity_theme` | `logoAssetId`, `backgroundAssetId` |
| `barndaksa_qatrah_settings` | `logoAssetId` |
| `barndaksa_qatrah_menu` | `MenuProduct.imageAssetId` |
| `barndaksa_qatrah_menu_categories` | `MenuCategoryRecord.imageAssetId` |
| `barndaksa_qatrah_offers` | `CafeOffer.bannerAssetId` + http `bannerImageUrl` |
| `barndaksa_customer_session_{slug}` | `avatarAssetId` |

External **http(s) URLs** remain valid without asset IDs (mock CDN / Unsplash defaults).

### IndexedDB store

- DB: `barndaksa-local-assets`, store: `assets`, keyPath: `id`
- Per-entity IDs for products/categories/offers/marketing/avatars; fixed IDs for cafe logo + custom theme assets

### Sanitization guards

- `entity-storage-sanitize.ts` + `menu-storage.ts` + `cafe-settings-storage.ts` — strip `data:image` before `localStorage.setItem`; throw if JSON still contains base64.

### Migration

`migrateAllLegacyImageDataUrls()` in `local-storage-repair.ts` — converts legacy base64 in all image keys, runs optimize when possible, never `localStorage.clear()`.

### Future Supabase buckets

`cafe-logos`, `cafe-theme-assets`, `product-images`, `category-images`, `offer-banners`, `marketing-assets`, `customer-avatars` — RLS: owner write under cafe prefix; public read approved assets only.

### Build

`npm run build` — **passed** after global pipeline rollout.

---

## 16) Custom Identity Contrast System & Form Readability Fix

### Problem

Single `--ci-text` from cafe palette applied to page, cards, and inputs without per-surface contrast — light text on light surfaces (especially dashboard builder selects inheriting gold BentoCard cream text).

### Storage model

| Field | Persist? | Notes |
|-------|----------|-------|
| `custom_identity.palette` (6 HEX colors) | **Yes** | Original owner choices; validate `#RRGGBB` only |
| Derived contrast tokens (`pageForeground`, `inputBackground`, …) | **No** (computed) | Recompute on read/render via `buildCustomIdentityContrastTokens` |
| Custom CSS / raw color strings | **Never** | Reject non-hex; no user-supplied CSS |

### Implementation files

- `lib/cafe/color-contrast.ts` — WCAG luminance, token builder, CSS var map
- Theme classes + `themed-cafe-shell` inject vars on `<main class="brand-identity-custom-theme">`
- Scoped `globals.css` for `.brand-identity-custom-theme .brand-cafe-fields` inputs/selects/options

### Security

- Store validated HEX only in `cafes.custom_identity` JSON (future).
- Do not persist computed tokens unless caching is needed for SSR — prefer derive-on-read.
- No SVG/CSS injection through theme builder.

### Build

`npm run build` — **passed** after contrast system.
