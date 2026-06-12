# Branda — Production Database Migration Audit

> **تاريخ الفحص:** 2026-05-30  
> **النطاق:** فحص كامل لـ `app/**`, `components/**`, `lib/**`, `docs/**`  
> **الهدف:** الانتقال من localStorage / IndexedDB / `lib/mock/*` إلى Supabase Postgres + Auth + Storage

---

## ملخص البنية الحالية

| البند | الحالة |
|-------|--------|
| **Supabase** | غير موجود (تم إنشاء `supabase/migrations/` في هذه الترقية) |
| **middleware.ts** | غير موجود → تم إنشاؤه |
| **sessionStorage** | غير مستخدم |
| **IndexedDB** | `branda-local-assets` → store `assets` (`lib/cafe/local-asset-store.ts`) |
| **lib/mock/** | 16 ملفًا — مصدر بيانات + أنواع |
| **مفاتيح localStorage** | 30+ مفتاحًا، معظمها hardcoded لـ `qatrah` |
| **Auth** | `mockAuthUsers` + `branda_auth_session` في localStorage |
| **عميل الكوفي** | `branda_customer_session_{slug}` في localStorage |
| **⚠️ تصادم** | `branda_qatrah_orders` يُستخدم لـ `CafeOrder[]` و`CustomerOrder[]` |

---

## جدول التدقيق حسب المجال

### إعدادات المقهى والدومينات والفروع والصفحات

| المجال | الملف الحالي | نوع التخزين الحالي | المفتاح أو المصدر الحالي | الجدول أو Storage Bucket البديل | الإجراء المطلوب |
|--------|-------------|-------------------|-------------------------|------------------------------|-----------------|
| إعدادات المقهى | `lib/mock/cafe-settings.ts` | localStorage + mock | `branda_qatrah_settings` | `cafe_settings` + `cafe-logos` | API CRUD عبر `lib/data/settings.ts` |
| إعدادات | `lib/cafe/cafe-settings-storage.ts` | localStorage | `branda_qatrah_settings` | `cafe_settings` | إزالة؛ استخدام Server Actions |
| إعدادات | `components/dashboard/pages/settings-page.tsx` | LS + IndexedDB | settings + domain keys | `cafe_settings`, `cafe_domains` | رفع شعار → Storage؛ حفظ عبر API |
| الشعار | `lib/cafe/local-asset-store.ts` | IndexedDB | `branda-qatrah-cafe-logo` | `cafe-logos/{cafe_id}/` | pipeline → Supabase Storage |
| فروع | `lib/mock/branches.ts` | localStorage | `branda_qatrah_branches` | `branches` | CRUD بـ `cafe_id` |
| صفحات معلومات | `lib/mock/cafe-pages.ts` | localStorage | `branda_qatrah_pages` | `cafe_pages` | CRUD + نشر عام |
| دومينات | `lib/platform/domain-purchase.ts` | localStorage | `branda_qatrah_domain_*` | `domain_orders`, `cafe_domains` | server-only بعد webhook |
| دومينات | `app/api/domains/**/route.ts` | Vercel API | env | `domain_orders` | persist + auth cafe owner |

### الهوية والثيم

| المجال | الملف الحالي | نوع التخزين الحالي | المفتاح أو المصدر الحالي | الجدول أو Storage Bucket البديل | الإجراء المطلوب |
|--------|-------------|-------------------|-------------------------|------------------------------|-----------------|
| ثيم نشط | `lib/mock/cafe-theme.ts` | localStorage | `branda_qatrah_theme` | `cafe_settings.theme_id` + seed `cafe_themes` | seed ثيمات؛ PATCH theme |
| هوية مخصصة | `lib/mock/custom-identity-theme.ts` | localStorage | `branda_qatrah_custom_identity_theme` | `cafe_custom_identity` | palette jsonb؛ صور → Storage |
| بناء الهوية | `custom-identity-builder.tsx` | LS + IndexedDB | custom identity + logo/bg IDs | `cafe_custom_identity` + `cafe-backgrounds` | upload pipeline → Storage |
| مزامنة | `lib/cafe/theme-storage-sync.ts` | localStorage | theme keys | `cafe_settings`, `cafe_custom_identity` | `adoptCafeTheme` → Server Action |

### المنيو والعروض

| المجال | الملف الحالي | نوع التخزين الحالي | المفتاح أو المصدر الحالي | الجدول أو Storage Bucket البديل | الإجراء المطلوب |
|--------|-------------|-------------------|-------------------------|------------------------------|-----------------|
| منتجات | `lib/mock/menu.ts` | LS + mock | `branda_qatrah_menu` | `menu_products` | CRUD + `category_id` FK |
| فئات | `lib/mock/menu-categories.ts` | LS + defaults | `branda_qatrah_menu_categories` | `menu_categories` | migrate قبل products |
| عروض | `lib/mock/offers.ts` | LS + mock | `branda_qatrah_offers` | `offers` | banner → `offer-banners` |
| صور منتج | `product-modal.tsx` | IndexedDB | `branda-qatrah-product-{id}-image` | `menu-products/{cafe_id}/` | signed upload |
| صور فئة | `category-manager.tsx` | IndexedDB | category asset IDs | `menu-categories/{cafe_id}/` | signed upload |
| واجهة عميل | `cafe-page-client.tsx` | localStorage | menu, offers, settings | public API by slug | SSR/fetch من Supabase |

### الطلبات والفواتير

| المجال | الملف الحالي | نوع التخزين الحالي | المفتاح أو المصدر الحالي | الجدول أو Storage Bucket البديل | الإجراء المطلوب |
|--------|-------------|-------------------|-------------------------|------------------------------|-----------------|
| طلبات | `lib/mock/orders.ts` | LS + mock | `branda_qatrah_orders` | `orders`, `order_items` | مصدر واحد؛ soft delete |
| نشاط عميل | `lib/mock/customer-activity.ts` | LS (نفس key!) | orders, invoices, transactions | `orders`, `invoices`, `loyalty_transactions` | فصل المفاتيح → جداول |
| تدفق طلب | `lib/platform/order-flow.ts` | localStorage | orders + platform keys | `orders` + triggers | `POST` server؛ حساب سعر من السيرفر |
| لوحة | `orders-page.tsx` | localStorage | `branda_qatrah_orders` | `orders` | fetch + PATCH status |

### الحجوزات

| المجال | الملف الحالي | نوع التخزين الحالي | المفتاح أو المصدر الحالي | الجدول أو Storage Bucket البديل | الإجراء المطلوب |
|--------|-------------|-------------------|-------------------------|------------------------------|-----------------|
| حجوزات | `lib/mock/reservations.ts` | LS + mock | `branda_qatrah_reservations` | `reservations`, `reservation_responses` | status server-enforced |
| تدفق | `lib/platform/reservation-flow.ts` | localStorage | reservations + hardcoded `cafe_qatrah` | `reservations` | `cafe_id` من auth/slug |
| حجز عميل | `app/c/[slug]/reserve/page.tsx` | localStorage | branches + flow | `branches`, `reservations` | public create API |

### الولاء

| المجال | الملف الحالي | نوع التخزين الحالي | المفتاح أو المصدر الحالي | الجدول أو Storage Bucket البديل | الإجراء المطلوب |
|--------|-------------|-------------------|-------------------------|------------------------------|-----------------|
| إعدادات | `lib/mock/loyalty.ts` | LS + mock | `branda_qatrah_loyalty_settings` | `loyalty_rules` (jsonb) | owner CRUD |
| مكافآت | `lib/mock/loyalty.ts` | LS + mock | `branda_qatrah_loyalty_rewards` | `loyalty_rewards` | derive from rules |
| حسابات | — | محسوب محليًا | transactions key | `loyalty_accounts`, `loyalty_transactions` | server-only points |

### الحملات والتسويق

| المجال | الملف الحالي | نوع التخزين الحالي | المفتاح أو المصدر الحالي | الجدول أو Storage Bucket البديل | الإجراء المطلوب |
|--------|-------------|-------------------|-------------------------|------------------------------|-----------------|
| تسويق | `lib/mock/marketing.ts` | LS + mock | `branda_qatrah_marketing` | `marketing_campaigns` | CRUD + images |
| تجربة | `lib/mock/experience-campaigns.ts` | LS + mock | experience keys | `experience_campaigns`, `experience_submissions` | approval server-side |
| تدفق | `lib/platform/experience-flow.ts` | localStorage | experience + points | `experience_submissions`, `loyalty_transactions` | customer submit API |

### الإشعارات

| المجال | الملف الحالي | نوع التخزين الحالي | المفتاح أو المصدر الحالي | الجدول أو Storage Bucket البديل | الإجراء المطلوب |
|--------|-------------|-------------------|-------------------------|------------------------------|-----------------|
| إشعارات | `lib/mock/notifications.ts` | localStorage | `branda_qatrah_notifications` | `notifications` | **لا insert من client** |
| تدفق | `lib/platform/notification-flow.ts` | LS push | notifications key | `notifications` | DB triggers / server flows |

### الاشتراكات والصلاحيات

| المجال | الملف الحالي | نوع التخزين الحالي | المفتاح أو المصدر الحالي | الجدول أو Storage Bucket البديل | الإجراء المطلوب |
|--------|-------------|-------------------|-------------------------|------------------------------|-----------------|
| اشتراك | `lib/platform/subscription.ts` | localStorage | subscription keys | `subscriptions` | webhook payment |
| خطط | `lib/platform/admin-data.ts` | LS + mock | `branda_platform_plans` | `platform_plans` | admin CRUD |
| صلاحيات | `lib/platform/permissions.ts` | LS + default `pro` | active plan key | `subscriptions` + claims | server feature gates |

### العملاء والمراجعات

| المجال | الملف الحالي | نوع التخزين الحالي | المفتاح أو المصدر الحالي | الجدول أو Storage Bucket البديل | الإجراء المطلوب |
|--------|-------------|-------------------|-------------------------|------------------------------|-----------------|
| جلسة عميل | `lib/customer/session.ts` | localStorage | `branda_customer_session_{slug}` | Supabase Auth + `customer_profiles` | OTP/email auth |
| ملفات | `lib/mock/customer-activity.ts` | LS | `branda_customers_qatrah` | `customer_profiles` | scoped by cafe |
| مراجعات | `lib/mock/reviews.ts` | LS + mock | `branda_qatrah_reviews` | `reviews` | moderation API |
| صورة شخصية | `account/page.tsx` | IndexedDB | avatar asset ID | `customer-avatars` | Storage upload |

### الإدارة والمنصة

| المجال | الملف الحالي | نوع التخزين الحالي | المفتاح أو المصدر الحالي | الجدول أو Storage Bucket البديل | الإجراء المطلوب |
|--------|-------------|-------------------|-------------------------|------------------------------|-----------------|
| Auth | `lib/platform/auth.ts` | LS + hardcoded passwords | `branda_auth_session` | Supabase Auth + `profiles` | إزالة mock passwords |
| مقاهٍ | `lib/platform/admin-data.ts` | LS + mock | `branda_platform_cafes` | `cafes` | admin API + RLS |
| عمليات | admin-operations-page | LS | `branda_platform_operations` | `audit_logs`, `platform_operations` | immutable audit |

---

## Storage Buckets (هدف الإنتاج)

| Asset | IndexedDB (حالي) | Bucket |
|-------|------------------|--------|
| شعار كوفي | `branda-qatrah-cafe-logo` | `cafe-logos` |
| خلفية/شعار ثيم | custom-theme IDs | `cafe-backgrounds`, `cafe-logos` |
| منتج | `product-{id}-image` | `menu-products` |
| فئة | `category-{id}-image` | `menu-categories` |
| عرض | `offer-{id}-banner` | `offer-banners` |
| تسويق | `marketing-{id}-image` | `marketing-assets` |
| عميل | `customer-{id}-avatar` | `customer-avatars` |
| تجربة | — | `experience-submissions` |

---

## أولويات التنفيذ

1. تطبيق `001_branda_production_schema.sql` في Supabase Dashboard
2. تعبئة `.env.local` من `.env.example`
3. تشغيل `supabase/seed/development_seed.sql` يدويًا في Dev فقط
4. إنشاء مستخدم admin + owner في Supabase Auth وربط `profiles` + `cafe_members`
5. اختبار تدفقات §9 في تقرير التنفيذ النهائي

**مرجع:** `docs/BRANDA_DATABASE_BLUEPRINT.md` — أقسام 8, 12, 15, 16
