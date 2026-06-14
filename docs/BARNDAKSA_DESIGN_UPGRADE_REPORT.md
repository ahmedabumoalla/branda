# تقرير ترقية تصميم منصة برندة

تاريخ التنفيذ: 2026-05-22  
حالة البناء: `npm run build` — نجح بدون أخطاء TypeScript.

---

## 1. ملخص تنفيذي

تم رفع مستوى واجهة **barndaksa-platform** إلى هوية إنتاجية موحّدة تعتمد:

- **Bento Grid** للوحات الرئيسية والتقارير والباقات والعملاء.
- **Cyber-Eco Dark Mode** في لوحة الأدمن والثيم `cyber-eco-dark`.
- **Neumorphism / Soft UI** في النماذج والكروت الداخلية ولوحة الكوفي.
- **شعارات برندة الحقيقية** من `public/brand/` بدون نصوص بديلة.

المنطق الحالي (mock + localStorage + الصلاحيات) محفوظ؛ أُضيفت طبقات للدفع الوهمي للاشتراك وربط الطلبات/الحجوزات بالأدمن.

---

## 2. الملفات التي تم إنشاؤها

| الملف | الغرض |
|-------|--------|
| `components/ui/barndaksa-logo.tsx` | مكوّن شعار موحّد (dark / brown / brown-bg) |
| `components/ui/design-system.tsx` | Bento، Shells، Soft UI، أزرار، فلاتر، شارات |
| `lib/ui/brand.ts` | ثوابت الألوان ومسارات الشعار |
| `lib/platform/subscription.ts` | دفع وهمي + سجل اشتراكات |
| `lib/platform/order-flow.ts` | إنشاء طلب من صفحة المنتج وربطه بالكوفي والأدمن |
| `lib/platform/reservation-flow.ts` | إنشاء حجز وربطه بالعمليات والعملاء |
| `app/admin/**` | صفحات ولوحة أدمن |
| `app/login/page.tsx` | دخول المنصة |
| `app/dashboard/subscription/page.tsx` | مسار الاشتراك |
| `components/dashboard/pages/subscription-page.tsx` | واجهة الاشتراك |
| `components/admin/**` | صفحات ومكوّنات الأدمن |
| `public/brand/barndaksa-logo-dark.png` | شعار للخلفيات الداكنة |
| `public/brand/barndaksa-logo-brown.png` | شعار للخلفيات الفاتحة |
| `public/brand/barndaksa-logo-brown-bg.png` | شعار بخلفية بنية للهيرو |
| `docs/BARNDAKSA_DESIGN_UPGRADE_REPORT.md` | هذا التقرير |

---

## 3. الملفات التي تم تعديلها

### جذر التطبيق
- `app/page.tsx` — صفحة رئيسية Bento + شعار + شرائح تلقائية
- `app/login/page.tsx` — دخول بشعار dark على بانل بني
- `app/register/page.tsx` — تسجيل بشعار brown / brown-bg
- `app/globals.css` — متغيرات هوية برندة + أنيميشن fade/slide

### لوحة الكوفي
- `app/dashboard/layout.tsx` — هامش جانبي 280px
- `app/dashboard/page.tsx` — Bento dashboard رئيسي
- `components/dashboard/DashboardSidebar.tsx` — إعادة تصميم كاملة + شعار + باقة + فلترة `cafeHasFeature`
- `components/dashboard/pages/*` — كل صفحات اللوحة (menu, offers, reservations, customers, loyalty, branches, reports, reviews, orders, pages, marketing, settings, theme, subscription)
- `lib/mock/cafe-theme.ts` — ثيمات جديدة + `normalizeThemeId` للتوافق مع القيم القديمة

### لوحة الأدمن
- `app/admin/layout.tsx` — خلفية Cyber-Eco داكنة
- `components/admin/AdminSidebar.tsx` — شعار dark + تدرجات ذهبية
- `components/admin/pages/*` — home, cafes, customers, revenue, operations, plans, options

### صفحات الكوفي العامة
- `components/cafe/cafe-page-client.tsx` — صفحة مختصرة، هيرو، تنقل أيقوني، بانر/منتج واحد بتناوب 5 ثوانٍ
- `components/cafe/product-detail-client.tsx` — طلب فعلي + ضريبة + ولاء + ثيم
- `app/c/[slug]/reserve/page.tsx` — حجز احترافي + `createReservationFlow`
- `app/c/[slug]/login/page.tsx` — شعار برندة + Soft UI

---

## 4. ماذا تغيّر في كل صفحة (مختصر)

| الصفحة | التغييرات |
|--------|-----------|
| `/` | Bento، شعار brown كبير، شرائح تلقائية، أيقونات خدمات |
| `/login` | شعار dark + نموذج Neumo |
| `/register` | شعار brown-bg في الهيرو |
| `/dashboard` | Bento إحصاءات + إجراءات + آخر حجوزات |
| `/dashboard/menu` … `/marketing` | `DashboardPageShell` + Bento + فلاتر + Soft UI |
| `/dashboard/theme` | 4 ثيمات جديدة تُحفظ في `CAFE_THEME_KEY` |
| `/dashboard/subscription` | تدفق: اختيار → فاتورة → دفع → تفعيل + سجل |
| `/dashboard/settings` | شعار مرفوع + Bento + حقول كاملة |
| `/admin` | Bento Cyber-Eco + إيرادات + عمليات |
| `/admin/cafes` | بحث، فلتر، إيقاف، تغيير باقة |
| `/admin/customers` | بحث، إيقاف، ربط بالكوفي |
| `/admin/plans` | CRUD باقات + ميزات + Bento فاخر |
| `/c/[slug]` | هيرو، تنقل، بانر/منتج carousel، ثيم من الإعدادات |
| `/c/[slug]/product/[id]` | كمية، ضريبة، زر طلب → `order-flow` |
| `/c/[slug]/reserve` | فروع من `BRANCHES_KEY` + ربط admin/operations |

---

## 5. مفاتيح localStorage

| المفتاح | الاستخدام |
|---------|-----------|
| `barndaksa_platform_plans` | باقات المنصة |
| `barndaksa_platform_cafes` | كوفيهات + إيرادات mock |
| `barndaksa_platform_customers` | عملاء المنصة (مرتبطون بكوفي) |
| `barndaksa_platform_operations` | سجل العمليات العامة |
| `barndaksa_platform_options` | خيارات المنصة |
| `barndaksa_qatrah_active_plan` | الباقة المفعّلة للكوفي (بعد الدفع فقط) |
| `barndaksa_qatrah_pending_subscription` | **جديد** — باقة مختارة بانتظار الدفع |
| `barndaksa_qatrah_subscription_history` | **جديد** — سجل اشتراكات |
| `barndaksa_qatrah_settings` | إعدادات الكوفي (اسم، وصف، لوجو، تواصل…) |
| `barndaksa_qatrah_theme` | ثيم صفحة الكوفي |
| `barndaksa_qatrah_menu` | المنيو |
| `barndaksa_qatrah_offers` | العروض |
| `barndaksa_qatrah_reservations` | الحجوزات |
| `barndaksa_qatrah_orders` | طلبات الكوفي (`CafeOrder`) |
| `barndaksa_customers_qatrah` | ملفات عملاء الكوفي |
| `barndaksa_qatrah_invoices` | فواتير العملاء |
| `barndaksa_qatrah_customer_transactions` | حركات العميل |
| `barndaksa_qatrah_loyalty_settings` | إعدادات الولاء |
| `barndaksa_qatrah_loyalty_rewards` | مكافآت الولاء |
| `barndaksa_qatrah_branches` | الفروع |
| `barndaksa_qatrah_reviews` | تقييمات وأسئلة |
| `barndaksa_qatrah_pages` | صفحات تعريفية |
| `barndaksa_qatrah_marketing` | حملات تسويق |
| `barndaksa_auth_session` | جلسة دخول المنصة (كوفي/أدمن) |
| `barndaksa_customer_{slug}` | جلسة عميل الكوفي |

---

## 6. منطق الباقات والاشتراكات

1. الأدمن يدير الباقات في `/admin/plans` → `PLATFORM_PLANS_KEY`.
2. الكوفي يرى الباقة الحالية من `ACTIVE_CAFE_PLAN_KEY` عبر `getActiveCafePlanId()`.
3. `cafeHasFeature(feature)` يقرأ الباقة النشطة ويخفي عناصر الـ sidebar غير المشمولة (مثلاً `branches`, `marketing`, `reports`).
4. في `/dashboard/subscription`:
   - **اختيار باقة** → `startPlanCheckout()` يكتب `pending` في `PENDING_SUBSCRIPTION_KEY` + سجل في `SUBSCRIPTION_HISTORY_KEY`.
   - **لا يُحدَّث** `ACTIVE_CAFE_PLAN_KEY` حتى الدفع.
   - **الدفع وتفعيل الباقة** → `completePlanPayment()` يحدّث السجل إلى `paid` ويستدعي `setActiveCafePlanId()`.
   - **فشل** → `failPlanPayment()` يضبط `failed` دون تغيير الباقة النشطة.

حالات `paymentStatus`: `pending` | `paid` | `failed`.

---

## 7. منطق الدفع الوهمي

- محاكاة تأخير 1.2 ثانية عند الضغط على «الدفع وتفعيل الباقة».
- زر «محاكاة فشل الدفع» لاختبار عدم تغيير `activePlan`.
- عند النجاح: `reload` لتطبيق إخفاء/إظهار عناصر الـ sidebar حسب الميزات الجديدة.

---

## 8. منطق الصلاحيات (Features)

المصدر: `lib/platform/permissions.ts` + `allPlatformFeatures` في `admin-data.ts`.

| Feature | يظهر في Sidebar عند وجوده في الباقة |
|---------|-------------------------------------|
| menu | الرئيسية، المنيو |
| offers | العروض |
| reservations | الحجوزات |
| customers | العملاء |
| loyalty | الولاء |
| branches | الفروع |
| reports | التقارير |
| reviews | الأسئلة والتقييمات |
| orders | طلبات الكوفي |
| pages | الصفحات التعريفية |
| marketing | التسويق |
| theme | ثيم الكوفي |
| settings | الإعدادات + الاشتراك |

---

## 9. توجيه تسجيل الدخول حسب الدور

`lib/platform/auth.ts` — `loginWithRole(email, password)`:

| الحساب التجريبي | التوجيه |
|-----------------|---------|
| `owner@qatrah.com` / `123456` | `/dashboard` |
| `admin@barndaksa.com` / `admin123` | `/admin` |

يُحفظ في `barndaksa_auth_session`.

عملاء الكوفي: `/c/{slug}/login` → `barndaksa_customer_{slug}` مع `?next=` للعودة للمنتج أو الحجز.

---

## 10. ربط العميل بالكوفي

- عند تسجيل دخول العميل: `setCustomerSession(slug, …)` في `lib/customer/session.ts`.
- عند أول طلب: `order-flow.ts` يضيف `PlatformCustomer` إن لم يكن موجودًا مع `cafeId: cafe_qatrah`.
- عند الحجز: `reservation-flow.ts` يربط العميل بنفس المنطق + عملية في `PLATFORM_OPERATIONS_KEY`.

---

## 11. ربط الطلبات والحجوزات

### طلب منتج (`createCafeOrderFromProduct`)
يكتب إلى:
- `barndaksa_qatrah_orders` — `CafeOrder` كامل (منتج، كمية، ضريبة 15%، إجمالي، نقاط ولاء)
- `barndaksa_qatrah_orders` (نسخة عميل مبسطة)
- `barndaksa_qatrah_invoices`
- `barndaksa_qatrah_customer_transactions`
- `barndaksa_platform_operations` — نوع «طلب»
- `barndaksa_platform_cafes` — زيادة `totalRevenue` و `totalOrders`
- `barndaksa_platform_customers` — زيادة إنفاق ونقاط

### حجز (`createReservationFlow`)
- `barndaksa_qatrah_reservations`
- `barndaksa_qatrah_customer_transactions`
- `barndaksa_platform_operations` — نوع «حجز»
- ربط عميل بالمنصة إن لم يكن مسجّلًا

---

## 12. استخدام الشعار

| الموقع | ملف الشعار |
|--------|------------|
| خلفيات داكنة (Admin sidebar، login hero، dashboard sidebar header) | `barndaksa-logo-dark.png` |
| خلفيات فاتحة (landing، register، subscription، settings) | `barndaksa-logo-brown.png` |
| هيرو بني (landing slide، login/register hero، cafe hero) | `barndaksa-logo-brown-bg.png` |
| صفحة الكوفي العامة | لوجو الكوفي من الإعدادات إن وُجد، وإلا `barndaksa-logo-brown.png` |
| Dashboard sidebar — كوفي بدون لوجو مرفوع | `barndaksa-logo-brown.png` داخل بطاقة الكوفي |

مكوّن: `<BarndaksaLogo variant="dark|brown|brown-bg" />` — لا يستخدم حرف «ق» أو نص «برندة» كبديل.

---

## 13. ثيمات صفحة الكوفي

| ID | الاسم | التأثير (`getThemeClasses`) |
|----|-------|------------------------------|
| `classic-barndaksa` | كلاسيك برندة | كريمي + بني كلاسيكي |
| `cyber-eco-dark` | سايبر إيكو داكن | خلفية داكنة + ذهبي + حدود شفافة |
| `soft-cream-3d` | كريمي ناعم 3D | ظلال neumo على الكروت |
| `luxury-brown-gold` | فاخر بني وذهبي | تدرج بني فاخر في الهيرو |

**ترحيل تلقائي:** القيم القديمة `classic`, `luxury`, `minimal`, `dark` تُحوَّل عبر `normalizeThemeId()`.

يُطبَّق على: `page`, `hero`, `card`, `button`, `nav`, `banner` في `cafe-page-client` و `product-detail-client`.

---

## 14. ما يُستبدَل عند ربط Supabase / DB حقيقية

| الطبقة الحالية | الاستبدال المقترح |
|----------------|-------------------|
| كل مفاتيح `localStorage` أعلاه | جداول Supabase + RLS حسب `cafe_id` / `user_id` |
| `loginWithRole` mock | Supabase Auth + جدول أدوار |
| `createCafeOrderFromProduct` | Edge Function أو API + Stripe/ZATCA للفواتير |
| `completePlanPayment` | بوابة دفع حقيقية + webhooks لتحديث `subscription` |
| `mockPlatformCafes` | جدول `cafes` متعدد المستأجرين (استبدال `cafe_qatrah` الثابت) |
| رفع الصور base64 في الإعدادات | Supabase Storage |
| `crypto.randomUUID()` للمعرّفات | UUID من قاعدة البيانات |

---

## 15. ملاحظات للمطور القادم

1. **البناء:** شغّل `npm run build` بعد أي تعديل على الثيمات أو `design-system`.
2. **Next.js 16:** راجع `node_modules/next/dist/docs/` قبل تغيير APIs (مذكور في `AGENTS.md`).
3. **صور الشعار:** استخدم `object-contain` دائمًا؛ الهيرو فقط قد يستخدم `brown-bg` كزينة بشفافية.
4. **تعدد الكوفيهات:** `order-flow` و `reservation-flow` ما زالا يستخدمان `cafe_qatrah` ثابتًا — عمّمهما عند ربط قاعدة البيانات.
5. **Subscription:** بعد دفع حقيقي، احذف `PENDING_SUBSCRIPTION_KEY` من الخادم وليس من المتصفح فقط.
6. **Sidebar:** يعاد تحميل الصفحة بعد تفعيل باقة لتطبيق `cafeHasFeature` — يمكن لاحقًا Context بدل `reload`.
7. **حساب العميل:** مفتاح `barndaksa_customer_{slug}` منفصل لكل كوفي — مناسب لـ multi-tenant على الويب.

---

## 16. التحقق

```bash
npm run build
```

النتيجة: ✓ Compiled successfully — ✓ TypeScript — ✓ 28 routes generated.

---

## 17. تحديث الجولة الثانية (إصلاحات UX)

### إصلاح حقول الإدخال (white-on-white)

- **`components/ui/design-system.tsx`**: كلاسات موحّدة `inputLightClass` / `inputDarkClass` مع `placeholder` و`option` واضحة؛ مكوّنات `AdminInput` / `AdminSelect` / `AdminTextarea` للوحة الأدمن.
- **`app/globals.css`**: قواعد `.barndaksa-admin-fields` و`.brand-cafe-fields` لضمان قراءة الحقول حتى مع classNames قديمة.
- **`app/admin/layout.tsx`**: إضافة class `barndaksa-admin-fields` على منطقة المحتوى.
- صفحات الأدمن: `admin-cafes`, `admin-plans`, `admin-customers`, `admin-operations`, `admin-options` — استبدال `NeumoInput` + `darkInput` بـ `AdminInput` حيث يلزم.

### صفحة الكوفي العامة — إزالة شعار برندة الكبير

- **`components/cafe/cafe-page-client.tsx`**: تركيز كامل على هوية الكوفي؛ `CafeLogo` placeholder (حرف أول) بدون شعار برندة في الهيدر/الهيرو.
- **`components/cafe/cafe-logo.tsx`**: placeholder أنيق عند غياب لوجو الكوفي.
- **`components/cafe/cafe-footer.tsx`**: «صُمم بواسطة برندة» + «Powered by Barndaksa» + شعار صغير (~52px) فقط في الفوتر.

### مكوّنات مشتركة لصفحات العميل

| ملف | الغرض |
|-----|--------|
| `components/cafe/cafe-header.tsx` | هيدر sticky بدون نص «مدعوم من برندة» |
| `components/cafe/cafe-footer.tsx` | فوتر موحّد |
| `components/cafe/cafe-layout.tsx` | غلاف Header + محتوى + Footer + ثيم |

صفحات محدّثة: `product-detail-client`, `product-collection-page`, `login`, `register`, `reserve`, `account` (فوتر).

### لوحة تفاصيل الكوفي في الأدمن

- **`components/admin/pages/admin-cafes-page.tsx`**: قائمة قابلة للنقر + لوحة جانبية sticky بكل التفاصيل (مالك، باقة، خدمات، إيرادات، عمليات، عملاء، تغيير باقة، إيقاف، زيارة).

### تسجيل الخروج

| الموقع | السلوك |
|--------|--------|
| `components/admin/AdminSidebar.tsx` | زر أسفل القائمة → `logoutBarndaksaAuth()` → `/login` |
| `components/dashboard/DashboardSidebar.tsx` | نفس المنطق |
| `lib/platform/auth.ts` | يمسح `barndaksa_auth_session`, `barndaksa_admin_session`, `barndaksa_cafe_session` |

### ملفات معدّلة في هذه الجولة

`components/ui/design-system.tsx`, `app/globals.css`, `app/admin/layout.tsx`, `components/admin/AdminSidebar.tsx`, `components/dashboard/DashboardSidebar.tsx`, `components/admin/pages/admin-*.tsx`, `components/cafe/*`, `app/c/[slug]/*`, `lib/platform/auth.ts`, `docs/BARNDAKSA_DESIGN_UPGRADE_REPORT.md`.

### localStorage — جلسات إضافية (اختيارية)

- `barndaksa_admin_session` — يُمسح عند الخروج (جاهز لربط لاحق).
- `barndaksa_cafe_session` — يُمسح عند الخروج (جاهز لربط لاحق).

المفتاح الفعلي للدخول الموحّد: `barndaksa_auth_session`.

---

## 18. تحديث نظام ثيمات الكوفي والدومينات

### الثيمات العشرة (تخطيط كامل — ليس ألوانًا فقط)

| ID | الاسم | ما يميزه | مناسب لـ |
|----|--------|---------|----------|
| `marketplace-amazon` | ماركت بليس | هيدر + بحث، شبكة منتجات كثيفة، فلاتر بارزة | قوائم كبيرة |
| `premium-apple` | بريميوم | مساحات بيضاء، معارض منتجات كبيرة، minimal | كوفيهات فاخرة |
| `noon-commerce` | تجارة سريعة | شريط عروض، بطاقات خصم، أقسام سريعة | عروض يومية |
| `luxury-boutique` | بوتيك فاخر | هيرو سينمائي، storytelling، ذهبي/بني | كوفيهات راقية |
| `mobile-first-cafe` | تطبيق جوال | bottom navigation، كروت دائرية، CTA سريع | زوار الجوال |
| `cyber-eco-dark` | سايبر إيكو | داكن + glow أخضر، حدود شفافة، قراءة واضحة | شبابي/تقني |
| `soft-cream-3d` | كريمي 3D | Neumorphism، أزرار بارزة، خلفية كريمية | كوفيهات هادئة |
| `magazine-editorial` | مجلة | منتجات كقصص، عناوين تحريرية، صور كبيرة | مختص + قصة |
| `fast-order-kiosk` | كشك سريع | أسعار كبيرة، زر طلب واضح، بدون بانر | طلب داخل المحل |
| `reservation-lounge` | لاونج وحجز | هيرو للحجز، فروع، منتجات ثانوية | حجوزات وطاولات |

**توافق الثيمات القديمة (بدون كسر):**

| قديم | جديد |
|------|------|
| `classic-barndaksa` | `soft-cream-3d` |
| `luxury-brown-gold` | `luxury-boutique` |
| `minimal` | `premium-apple` |
| `dark` | `cyber-eco-dark` |

### CafeThemeRenderer

- **`components/cafe/cafe-page-client.tsx`**: يجمع البيانات والمنطق فقط (منيو، عروض، ولاء، عميل) ثم يمرّر إلى `CafeThemeRenderer`.
- **`components/cafe/themes/cafe-theme-renderer.tsx`**: يقرأ `themeId` ويحمّل مكوّن التخطيط المناسب.
- كل ثيم في `components/cafe/themes/*-theme.tsx` يستقبل `CafeThemePageProps` الموحّدة ويحافظ على نفس المسارات (`/c/[slug]/products/*`, `reserve`, `login`, …).

### معاينة واعتماد الثيم

| الإجراء | السلوك |
|---------|--------|
| **معاينة** (لوحة `/dashboard/theme`) | يعرض لوحة معاينة كبيرة داخل الصفحة — **لا** يكتب `CAFE_THEME_KEY` |
| **اعتماد الثيم** | `localStorage.setItem(CAFE_THEME_KEY, themeId)` + رسالة نجاح |
| **فتح صفحة الكوفي بهذا الثيم** | `/c/qatrah?previewTheme=themeId` |
| **صفحة الكوفي** | إن وُجد `previewTheme` في الـ query يُعرض للمعاينة فقط؛ وإلا يُقرأ من `CAFE_THEME_KEY` |

شريط تنبيه أصفر يظهر في وضع المعاينة على الصفحة العامة.

### مفاتيح localStorage

| المفتاح | الاستخدام |
|---------|-----------|
| `barndaksa_qatrah_theme` (`CAFE_THEME_KEY`) | الثيم **المعتمد** — لم يُغيّر الاسم |
| `barndaksa_qatrah_settings` | إعدادات الكوفي + `customDomain` + `domainStatus` |
| `barndaksa_qatrah_domain_settings` | مفتاح احتياطي للدومين (جاهز لربط لاحق) |

المعاينة: state في لوحة الثيم + `previewTheme` query — **بدون** مفتاح معاينة إلزامي.

### منطق الدومين (`lib/platform/cafe-domain.ts`)

| الدالة | الغرض |
|--------|--------|
| `getPlatformPublicDomain()` | من `NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN` أو fallback `barndaksa.local` |
| `getCafeSubdomainHost(slug)` | عرض: `qatrah.barndaksa.local` |
| `getCafeDisplayDomain(slug, settings?)` | subdomain أو custom domain إن كان `مربوط` |
| `getCafePublicUrl(slug, options?)` | رابط فعلي fallback: `{origin}/c/{slug}` + `?previewTheme=` |
| `resolveCafeSlugFromHost(hostname, pathname)` | جاهز لـ middleware مستقبلي |
| `normalizeCafeDomainInput` | تنظيف إدخال الدومين |
| `getDomainSetupInstructions` | CNAME → `cname.vercel-dns.com` |

**الوضع الحالي:**

- **Fallback route:** `/c/qatrah` (يعمل في التطوير والإنتاج).
- **Display للعميل:** `qatrah.{NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN}`.
- **Custom domain (mock):** حقل في الإعدادات + حالة ربط — بدون DNS حقيقي بعد.

### Vercel / DNS (لاحقًا)

1. إضافة **wildcard domain** على Vercel: `*.barndaksa.sa` (أو الدومين المُعرّف في env).
2. **Middleware / rewrite** يقرأ `hostname` → `resolveCafeSlugFromHost` → يوجّه داخليًا إلى `/c/[slug]`.
3. التحقق من custom domain من لوحة برندة بعد CNAME إلى `cname.vercel-dns.com`.

### صفحات الكوفي الداخلية (محدّث — تجربة كاملة)

**كل صفحات العميل** تستخدم الآن `ThemedCafeShell` عبر `CafeLayout` + **Theme Experience Layer**:

| الصفحة | المكوّنات |
|--------|-----------|
| `/c/[slug]` | `CafeThemeRenderer` — 10 layouts كاملة |
| `/login`, `/register` | `ThemedAuthPanel` |
| `/account` | `ThemedAccountPanel` (تبويبات/بطاقات حسب الثيم) |
| `/products/[view]` | `ThemedFilterBar` + `ThemedProductCard` + شبكات حسب الثيم |
| `/product/[id]` | `ThemedProductDetailLayout` + `ProductReviews` مُلوّنة |
| `/reserve` | `ThemedReservationPanel` |

**previewTheme** يعمل على كل الصفحات عبر `useCafeThemePage` + `lib/cafe/theme-links.ts` (`getCafePath`, `withThemePreview`, `appendPreviewToNextPath`).

### ملفات جديدة

`lib/mock/cafe-theme.ts` (موسّع), `lib/cafe/cafe-theme-types.ts`, `lib/cafe/use-resolved-cafe-theme.ts`, `lib/platform/cafe-domain.ts`, `components/cafe/themes/*` (11 ملفًا).

### ملفات معدّلة

`components/cafe/cafe-page-client.tsx`, `cafe-layout.tsx`, `cafe-footer.tsx`, `components/dashboard/pages/theme-page.tsx`, `settings-page.tsx`, `DashboardSidebar.tsx`, `marketing-page.tsx`, `admin-cafes-page.tsx`, `app/dashboard/page.tsx`, `components/ui/design-system.tsx` (`LinkButton` + `target`), `lib/mock/cafe-settings.ts`.

### ملاحظات Supabase (للمطور)

- عند الربط: جدول `cafe_settings` يحفظ `theme_id`, `custom_domain`, `domain_status`.
- مزامنة `CAFE_THEME_KEY` من API بعد تسجيل الدخول للوحة.
- التحقق من custom domain عبر job أو webhook من Vercel Domains API.

### Build

`npm run build` — **ناجح** (Next.js 16.2.6).

---

## 19. Theme Experience Layer — صفحات العميل الكاملة

### الملفات الجديدة (طبقة الثيم)

| الملف | الوظيفة |
|-------|---------|
| `lib/cafe/theme-links.ts` | `getCafePath`, `withThemePreview`, `preservePreviewSearchParams`, `appendPreviewToNextPath` |
| `lib/cafe/theme-experience.ts` | `getThemeExperience(themeId)` — تخطيط account/auth/collection/detail/reserve لكل ثيم |
| `lib/cafe/use-cafe-theme-page.ts` | Hook موحّد: ثيم + إعدادات + preview + مسارات |
| `components/cafe/themes/themed-cafe-shell.tsx` | غلاف كل صفحات العميل + banner معاينة + bottom nav للجوال |
| `components/cafe/themes/themed-cafe-header.tsx` | هيدر بروابط تحافظ على previewTheme |
| `components/cafe/themes/themed-cafe-footer.tsx` | فوتر «صُمم بواسطة برندة» |
| `components/cafe/themes/themed-preview-banner.tsx` | شريط «وضع معاينة الثيم» |
| `components/cafe/themes/themed-auth-panel.tsx` | login/register حسب الثيم |
| `components/cafe/themes/themed-account-panel.tsx` | حساب العميل (طلبات، حجوزات، فواتير، ولاء) |
| `components/cafe/themes/themed-filter-bar.tsx` | فلاتر المنتجات |
| `components/cafe/themes/themed-product-card.tsx` | بطاقة منتج + `getCollectionGridClass` |
| `components/cafe/themes/themed-product-detail.tsx` | تخطيط تفاصيل المنتج |
| `components/cafe/themes/themed-reservation-panel.tsx` | واجهة الحجز |

### الملفات المعدّلة

`components/cafe/cafe-layout.tsx` (يستخدم `ThemedCafeShell`), `app/c/[slug]/account/page.tsx`, `login/page.tsx`, `register/page.tsx`, `reserve/page.tsx`, `product-collection-page.tsx`, `product-detail-client.tsx`, `product-reviews.tsx`, `cafe-page-client.tsx`, `theme-shared.tsx` (روابط preview).

### قراءة الثيم

1. `useSearchParams().get("previewTheme")` — إن وُجد وصالح → يُعرض دون حفظ.
2. وإلا `localStorage.getItem("barndaksa_qatrah_theme")` عبر `normalizeThemeId`.
3. `getThemeExperience(themeId)` يحدد تخطيط الصفحات الداخلية.
4. `getThemeClasses(themeId)` يحدد ألوان Tailwind.

### اعتماد الثيم (لم يتغير)

- فقط من `/dashboard/theme` → `localStorage.setItem(CAFE_THEME_KEY, id)`.
- المعاينة: state في اللوحة + query `previewTheme` — **لا كتابة** على المفتاح.

---

## 20. خريطة التخزين والسياسات وقاعدة البيانات المستقبلية

> **حالة المشروع الحالية:** كل ما يلي mock عبر `localStorage` في المتصفح. لا يوجد Supabase/Postgres مفعّل بعد. هذا القسم وثيقة تسليم لمهندس قاعدة البيانات.

### أ) مفاتيح localStorage الفعلية

| المفتاح | ماذا يخزن | النوع | يُكتب في | يُقرأ في | النطاق | جدول DB مقترح |
|---------|----------|-------|---------|---------|--------|----------------|
| `barndaksa_qatrah_theme` | `CafeThemeId` (string) | string | `theme-page.tsx` | كل صفحات `/c/*`, `useCafeThemePage` | كوفي | `cafe_settings.theme_id` أو `cafe_themes` |
| `barndaksa_qatrah_settings` | `CafeSettings` JSON | object | `settings-page.tsx` | shell, header, themes | كوفي | `cafe_settings` |
| `barndaksa_qatrah_domain_settings` | (احتياطي) | object | — | — | كوفي | `cafe_domains` |
| `barndaksa_qatrah_menu` | `MenuProduct[]` | array | `menu-page.tsx` | cafe public, collection, detail | كوفي | `menu_products` |
| `barndaksa_qatrah_offers` | `CafeOffer[]` | array | `offers-page.tsx` | cafe home, collection | كوفي | `offers` |
| `barndaksa_qatrah_branches` | `CafeBranch[]` | array | `branches-page.tsx` | reserve, collection/branches | كوفي | `branches` |
| `barndaksa_qatrah_reservations` | حجوزات | array | `reservations-page.tsx`, `reservation-flow.ts` | reserve, account, reports | كوفي+عميل | `reservations` |
| `barndaksa_qatrah_orders` | `CafeOrder[]` + طلبات عميل | array | `orders-page.tsx`, `order-flow.ts` | account, reports, dashboard | كوفي | `orders`, `order_items` |
| `barndaksa_qatrah_invoices` | `CustomerInvoice[]` | array | `order-flow.ts` | account, customers | كوفي+عميل | `invoices` |
| `barndaksa_qatrah_customer_transactions` | `CustomerTransaction[]` | array | `order-flow.ts`, `reservation-flow.ts` | account | عميل/كوفي | `customer_transactions` |
| `barndaksa_customers_qatrah` | `CustomerProfile[]` | array | `session.ts` upsert | customers dashboard | كوفي | `customer_profiles` |
| `barndaksa_customer_session_{slug}` | `BarndaksaCustomerSession` | object | `login/register` via `setCustomerSession` | كل صفحات العميل المحمية | عميل | جلسة auth (cookie/JWT) — **لا تُخزن كـ localStorage في الإنتاج** |
| `barndaksa_qatrah_loyalty_settings` | `LoyaltySettings` | object | `loyalty-page.tsx` | (mock ثابت في cafe home) | كوفي | `loyalty_settings` |
| `barndaksa_qatrah_loyalty_rewards` | `LoyaltyReward[]` | array | `loyalty-page.tsx` | cafe home renderer | كوفي | `loyalty_rewards` |
| `barndaksa_qatrah_reviews` | `CafeReview[]` | array | `reviews-page.tsx`, `product-reviews.tsx` | product detail | كوفي+عميل | `reviews`, `review_replies` |
| `barndaksa_qatrah_marketing` | حملات | array | `marketing-page.tsx` | marketing | كوفي | `marketing_campaigns` |
| `barndaksa_qatrah_pages` | صفحات تعريفية | array | `pages-manager-page.tsx` | (مستقبلي public) | كوفي | `cafe_pages` |
| `barndaksa_qatrah_active_plan` | plan id | string | `subscription.ts` بعد الدفع | `permissions.ts`, sidebar | كوفي | `cafe_subscriptions.plan_id` |
| `barndaksa_qatrah_subscription_history` | سجل اشتراكات | array | `subscription.ts` | subscription page | كوفي | `subscription_payments` |
| `barndaksa_qatrah_pending_subscription` | فاتورة معلقة | object | `subscription.ts` | subscription page | كوفي | `subscription_payments` (status=pending) |
| `barndaksa_platform_plans` | `PlatformPlan[]` | array | admin-plans | permissions, admin | منصة | `platform_plans` |
| `barndaksa_platform_cafes` | `PlatformCafe[]` | array | admin-cafes | admin | منصة | `cafes` |
| `barndaksa_platform_customers` | عملاء منصة | array | admin, flows | admin, customers | منصة | `platform_customers` أو view |
| `barndaksa_platform_operations` | عمليات | array | order/reservation flow | admin ops | منصة | `platform_operations` |
| `barndaksa_platform_options` | خيارات منصة | object | admin-options | admin | منصة | `platform_options` |
| `barndaksa_auth_session` | جلسة دخول موحدة | object | `auth.ts` login | login guard | منصة | Supabase Auth / `sessions` |
| `barndaksa_admin_session` | (يُمسح عند logout) | object | — | logout | admin | JWT claim `role=admin` |
| `barndaksa_cafe_session` | (يُمسح عند logout) | object | — | logout | كوفي | JWT claim `cafe_id` |

### ب) جداول Postgres/Supabase المقترحة

- **users** — `id`, `email`, `phone`, `created_at` (Supabase Auth)
- **profiles** — `user_id`, `full_name`, `avatar_url`
- **user_roles** — `user_id`, `role` (`admin` | `cafe_owner` | `cafe_staff` | `customer`)
- **cafes** — `id`, `slug`, `name`, `owner_user_id`, `status`, `created_at`
- **cafe_members** — `cafe_id`, `user_id`, `role`, `permissions[]`
- **cafe_settings** — `cafe_id`, `theme_id`, `logo_url`, `description`, tax fields, social
- **cafe_domains** — `cafe_id`, `subdomain`, `custom_domain`, `status`, `verified_at`
- **cafe_themes** — كتالوج الثيمات العشرة (seed)
- **cafe_theme_history** — `cafe_id`, `theme_id`, `applied_by`, `applied_at`
- **platform_plans** — `id`, `name`, `price_monthly`, `features jsonb`
- **platform_plan_features** — `plan_id`, `feature_key`
- **cafe_subscriptions** — `cafe_id`, `plan_id`, `status`, `current_period_end`
- **subscription_payments** — `cafe_id`, `amount`, `status`, `provider_ref`, `paid_at`
- **menu_products** — `cafe_id`, `name`, `price`, `category`, `image_url`, `available`, `loyalty_points`
- **product_categories** — `cafe_id`, `name`, `sort_order`
- **offers** — `cafe_id`, `title`, `status`, `placement`, `linked_product_id`, `banner_url`
- **branches** — `cafe_id`, `name`, `address`, `map_url`, `active`
- **reservations** — `cafe_id`, `customer_id`, `branch_id`, `type`, `guests`, `date`, `time`, `status`
- **orders** — `cafe_id`, `customer_id`, `total`, `status`, `tax`, `branch_id`
- **order_items** — `order_id`, `product_id`, `qty`, `unit_price`
- **invoices** — `cafe_id`, `customer_id`, `order_id`, `amount`, `status`, `pdf_url`
- **customer_profiles** — `cafe_id`, `user_id`, `phone`, `loyalty_balance`
- **customer_transactions** — `customer_id`, `cafe_id`, `type`, `points`, `amount`, `meta`
- **loyalty_settings** — `cafe_id`, `points_per_sar`, `welcome_points`, `enabled`
- **loyalty_rewards** — `cafe_id`, `title`, `points`, `active`
- **reviews** — `cafe_id`, `product_id`, `customer_id`, `rating`, `comment`, `status`
- **review_replies** — `review_id`, `body`, `replied_by`
- **marketing_campaigns** — `cafe_id`, `code`, `status`, metrics
- **cafe_pages** — `cafe_id`, `slug`, `content`, `published`
- **platform_operations** — `cafe_id`, `type`, `payload`, `created_at`
- **audit_logs** — `actor_id`, `action`, `entity`, `entity_id`, `meta`
- **storage_objects** — `bucket`, `path`, `owner_cafe_id`, `visibility`

### ج) علاقات أساسية

- `cafes.owner_user_id` → `users.id`
- `cafe_members.cafe_id` → `cafes.id`
- `menu_products.cafe_id` → `cafes.id`
- `orders.cafe_id` + `orders.customer_id` → `customer_profiles`
- `reservations` → `cafes`, `branches`, `customer_profiles`
- `reviews` → `menu_products`, `customer_profiles`, `cafes`
- `cafe_subscriptions.cafe_id` → `cafes.id`, `plan_id` → `platform_plans.id`
- `cafe_domains.cafe_id` → `cafes.id`
- `cafe_settings.cafe_id` → `cafes.id`, `theme_id` → `cafe_themes.id`

### د) سياسات RLS المقترحة (Supabase)

| الدور | القراءة | الكتابة |
|------|---------|---------|
| **admin** | كل الجداول | كل الجداول + إيقاف كوفي/عميل + تعديل `platform_plans` |
| **cafe_owner** | صفوف `cafe_id = membership.cafe_id` فقط | منيو، عروض، فروع، إعدادات، ثيم، حجوزات، طلبات كوفيه |
| **cafe_staff** | حسب `permissions` في `cafe_members` | محدود (مثلاً حجوزات فقط) |
| **customer** | بياناته في `customer_profiles`, طلباته، حجوزاته، فواتيره | تقييم، حجز، طلب — لا يرى غيره |
| **public (anon)** | `cafes` نشط + `menu_products.available` + `offers` ظاهرة + `cafe_pages` منشورة | لا شيء |

قواعد حرجة:

- **لا** تفعيل `active_plan` من العميل — فقط `subscription_payments.status = paid` عبر webhook.
- **لا** الاعتماد على `role` من localStorage — من JWT/Supabase فقط.
- `government_documents` — قراءة: `admin` + `cafe_owner` فقط.

### هـ) Storage buckets

| Bucket | محتوى | سياسة |
|--------|--------|--------|
| `brand-assets` | شعارات برندة | public read |
| `cafe-logos` | `/{cafe_id}/logo` | public read للكوفي النشط؛ write owner |
| `product-images` | `/{cafe_id}/products/` | public read |
| `offer-banners` | `/{cafe_id}/offers/` | public read |
| `government-documents` | `/{cafe_id}/docs/` | private — owner + admin |
| `customer-avatars` | `/{cafe_id}/customers/` | authenticated read/write own |

**لا base64 في DB** — URLs فقط بعد رفع عبر signed upload.

### و) Edge/API routes لاحقًا

| Route | الغرض |
|-------|--------|
| Supabase Auth / `POST /api/auth/*` | دخول مالك/أدمن/عميل |
| `GET /api/public/cafes/[slug]` | منيو + عروض + إعدادات عامة |
| `POST /api/orders` | إنشاء طلب (server validates price) |
| `POST /api/reservations` | حجز |
| `POST /api/subscriptions/checkout` | بدء دفع |
| `POST /api/payments/webhook` | تفعيل باقة بعد `paid` |
| `POST /api/domain/verify` | تحقق CNAME |
| `POST /api/uploads/sign` | رفع صور |

### ز) تحويل localStorage → DB (عينة)

| localStorage | Table | Columns | ملاحظة migration |
|--------------|-------|---------|------------------|
| `barndaksa_qatrah_theme` | `cafe_settings` | `theme_id` | قراءة عند تحميل dashboard/public |
| `barndaksa_qatrah_settings` | `cafe_settings` | `name`, `logo_url`, `description`, … | دمج مع صف واحد per cafe |
| `barndaksa_qatrah_menu` | `menu_products` | product fields | `imageDataUrl` → رفع ثم `image_url` |
| `barndaksa_customer_session_qatrah` | — | — | **استبدال بـ Supabase session cookie** |
| `barndaksa_qatrah_active_plan` | `cafe_subscriptions` | `plan_id`, `status` | فقط بعد webhook |

### ح) مخاطر أمنية

1. Role من localStorage قابل للتزوير — يُستبدل بـ JWT.
2. تفعيل الباقة من الواجهة — ممنوع؛ webhook فقط.
3. مستندات حكومية في localStorage — نقل إلى storage خاص.
4. صور base64 في localStorage — تسبب بطء؛ استخدم Storage.
5. `service_role` فقط في Server Actions / Edge — لا في العميل.
6. تحقق توقيع webhook الدفع.
7. تحقق ملكية custom domain قبل `domain_status = مربوط`.
8. `audit_logs` لعمليات الأدمن (إيقاف كوفي، تغيير باقة).

### ط) الثيمات في DB لاحقًا

- `cafe_settings.theme_id` — الثيم المعتمد.
- `cafe_theme_history` — سجل كل اعتماد من لوحة التحكم.
- المعاينة تبقى **query-only** (`previewTheme`) — لا تُسجّل إلا إذا أضيف «حفظ مسودة» لاحقًا.

### ي) منطق القراءة/الكتابة في الكود (بعد هذا التحديث)

| العملية | الملف | الدالة/Hook |
|---------|-------|-------------|
| قراءة ثيم معتمد | `use-cafe-theme-page.ts` | `useCafeThemePage` → localStorage + searchParams |
| قراءة ثيم صفحة رئيسية | `use-resolved-cafe-theme.ts` | `useResolvedCafeTheme` |
| اعتماد ثيم | `theme-page.tsx` | `adoptTheme` → `CAFE_THEME_KEY` |
| روابط preview | `theme-links.ts` | `getCafePath`, `withThemePreview` |
| تجربة داخلية | `theme-experience.ts` | `getThemeExperience` |
| غلاف صفحات | `themed-cafe-shell.tsx` | `ThemedCafeShell` |

### Build (هذه الجولة)

`npm run build` — **ناجح** (Next.js 16.2.6).

---

## 21. Responsive & Device Compatibility Audit

> **النطاق:** 360px → 1536px+ لكل المسارات المطلوبة (`/`, `/login`, `/register`, `/dashboard/*`, `/admin/*`, `/c/[slug]/*`) ومكوّنات `components/ui`, `dashboard`, `admin`, `cafe/themes`.

### الملفات الجديدة

| الملف | الوظيفة |
|-------|---------|
| `components/ui/responsive-app-shell.tsx` | غلاف موحّد: شريط علوي + drawer جانبي على الجوال، sidebar ثابتة `280px` من `lg`، قفل scroll للجسم عند فتح القائمة |
| `components/dashboard/dashboard-app-layout.tsx` | Client wrapper يربط `ResponsiveAppShell` + `DashboardSidebar` (لتجنب تمرير functions من Server Layout) |
| `components/admin/admin-app-layout.tsx` | نفس النمط لـ Admin |

### الملفات المعدّلة (أساسية)

| الملف | التعديل |
|-------|---------|
| `app/dashboard/layout.tsx`, `app/admin/layout.tsx` | استخدام `*AppLayout` client بدل تمرير render prop من Server Component |
| `components/dashboard/DashboardSidebar.tsx` | `onNavigate` لإغلاق drawer؛ عرض كامل داخل الدرج بدون `fixed` مزدوج |
| `components/admin/AdminSidebar.tsx` | نفس النمط |
| `components/ui/design-system.tsx` | `DashboardPageShell` / `AdminPageShell`: `px-4 sm:px-6 lg:px-8`, عناوين `text-2xl→4xl`, `BentoCard` padding أصغر على الجوال، `FilterBar` / `AdminFilterBar` مع `min-w-0` |
| `app/globals.css` | `html, body { overflow-x: hidden; max-width: 100% }` |
| `app/login/page.tsx`, `app/register/page.tsx` | padding متدرج؛ إخفاء لوحة التعريف على الجوال في login؛ عناوين أصغر |
| `app/dashboard/page.tsx` | أرقام إيرادات `text-3xl sm:text-4xl lg:text-5xl` |
| `components/dashboard/pages/theme-page.tsx` | معاينة الثيم: `scale-[0.52]→0.85` + `max-h-[min(70vh,640px)]` قابلة للتمرير |
| `components/dashboard/pages/*` | شبكات `md:grid-cols-3/4` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3/4` (marketing, offers, reservations, loyalty, settings, subscription) |
| `components/dashboard/offers/offer-card.tsx` | نفس نمط الشبكة |
| `components/admin/pages/admin-cafes-page.tsx` | فلاتر `min-w-0`؛ بطاقات قائمة `flex-col` على الجوال؛ panel التفاصيل أسفل القائمة تحت `xl` (جانبي sticky من `xl`) |
| `components/admin/pages/admin-customers-page.tsx`, `admin-operations-page.tsx` | فلاتر بدون `min-w-[240px]` ثابت |
| `components/cafe/themes/themed-cafe-shell.tsx` | `pb` مع `safe-area` لـ bottom nav؛ هامش للفوتر |
| `components/cafe/themes/themed-account-panel.tsx` | عناوين وشبكة إحصاءات متجاوبة |
| `components/cafe/themes/themed-reservation-panel.tsx` | حقول الحجز عمود واحد على الجوال |
| `components/cafe/themes/themed-filter-bar.tsx` | `min-w-0` للبحث |
| `components/cafe/themes/theme-shared.tsx` | بانر cinematic بارتفاع متدرج؛ صور `object-contain` |
| `components/cafe/product-collection-page.tsx` | عناوين `text-3xl sm:text-4xl lg:text-5xl` |
| `components/cafe/themes/magazine-editorial-theme.tsx`, `luxury-boutique-theme.tsx`, `reservation-lounge-theme.tsx` | عناوين كوفي مع `break-words` وتدرج أحجام |

### 1) القوائم الجانبية (Dashboard / Admin)

- **Desktop (`lg+`):** sidebar ثابتة يمينًا بعرض `280px`؛ المحتوى `lg:mr-[280px]` بدون `pt` علوي.
- **Mobile / Tablet (&lt;lg):**
  - شريط علوي `h-14` مع زر قائمة (☰) وعنوان مختصر.
  - drawer من اليمين بعرض `min(280px, 88vw)` — لا يأخذ الشاشة كاملة.
  - overlay للإغلاق؛ زر ✕ داخل الدرج.
  - إغلاق تلقائي عند تغيير `pathname` أو النقر على رابط (`onNavigate`).
  - `body overflow: hidden` أثناء فتح الدرج.
- **لا** يبدأ المحتوى تحت sidebar على الجوال (`pt-14` للمحتوى فقط).

### 2) Grids / Cards / Forms

- نمط موحّد: `grid-cols-1` → `sm:grid-cols-2` → `lg/xl:grid-cols-3/4`.
- إزالة/تخفيف `min-w-[240px]` في شريط فلاتر الأدمن.
- `BentoCard` / shells: `min-w-0`, `break-words`, padding `p-4 sm:p-6`.
- حقول الإدخال تبقى `w-full` عبر `inputLightClass` / `inputDarkClass` (لم تُضف مكتبات).

### 3) صفحات الكوفي والثيمات العشرة

- كل الصفحات الداخلية تمر عبر `ThemedCafeShell` (padding `px-4 sm:px-5`, `max-w-6xl`).
- **`mobile-first-cafe`:** bottom nav ثابت + `pb-[calc(5.75rem+env(safe-area-inset-bottom))]` حتى لا يغطي الفوتر/المحتوى.
- **`/c/qatrah?previewTheme=THEME_ID`:** يعمل عبر `useCafeThemePage` + روابط `getCafePath` (لم يُغيّر منطق المعاينة).
- بانرات carousel: نقاط تنقل بدون أسهم تغطي النص؛ صور `object-contain`.
- ثيمات بعناوين ضخمة (magazine, luxury, lounge) صُغّرت على 360px.

### 4) جداول / تفاصيل الأدمن

- `admin/cafes`: قائمة + panel؛ على الجوال التفاصيل section أسفل البطاقات؛ زر إغلاق `xl:hidden`؛ لا جدول عريض — بطاقات + `overflow-y-auto` داخل panel على الديسكتوب.

### 5) Typography & Spacing

- عناوين لوحات: `text-2xl sm:text-3xl lg:text-4xl`.
- مسافات صفحات: `px-4 sm:px-6 lg:px-8`, `py-6 sm:py-8`.
- RTL محفوظ (`dir="rtl"`) مع `break-words` حيث يلزم.

### 6) Helpers / Classes جديدة (بدون مكتبات)

- `ResponsiveAppShell` + `DashboardAppLayout` / `AdminAppLayout`.
- استخدام `min-w-0`, `overflow-x-hidden`, `100dvh`, `env(safe-area-inset-bottom)`, `lg:!translate-x-0` للدرج.

### 7) ملاحظات للجوال

- اختبر يدويًا على 360 / 390 / 768 / 1024 / 1280 / 1536 — البناء يمر لكن المعاينة البصرية على جهاز حقيقي موصى بها لـ carousel وtheme preview scale.
- صفحة `/` تُخفي العمود الأيسر (carousel) تحت `lg` — المحتوى الرئيسي يبقى قابل للاستخدام.
- `grid-cols-2` في marketplace/noon للمنتجات مقصود (تجربة متجر)؛ باقي الشبكات 3–4 أعمدة تنهار لعمود واحد.

### Build

`npm run build` — **ناجح** (Next.js 16.2.6، TypeScript بدون أخطاء، 28 route).

---

## 22. Domain Purchase via Vercel Registrar API

> **قرار المنتج:** برندة تدعم الآن شراء الدومين من داخل لوحة الكوفي (وليس فقط ربط دومين خارجي).

### Env Vars

```bash
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_ID=
VERCEL_DOMAIN_PURCHASE_LIVE=false
NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN=barndaksa.local
```

- `VERCEL_TOKEN` يُستخدم فقط في server routes ضمن `app/api/domains/*`.
- `VERCEL_DOMAIN_PURCHASE_LIVE=false` = **Mock checkout** (افتراضي وآمن للتطوير).
- عند `VERCEL_DOMAIN_PURCHASE_LIVE=true` يتم استدعاء Vercel Registrar API فعليًا.

### الملفات الجديدة

| الملف | الغرض |
|------|------|
| `lib/platform/domain-purchase.ts` | الأنواع + مفاتيح localStorage + helpers للـ mock |
| `lib/platform/domain-purchase-server.ts` | منطق server-only للاتصال بـ Vercel API وfallback mock |
| `app/api/domains/availability/route.ts` | فحص توفر الدومين |
| `app/api/domains/price/route.ts` | تسعير الدومين |
| `app/api/domains/search/route.ts` | endpoint مركّب (توفر + سعر) |
| `app/api/domains/buy/route.ts` | تنفيذ شراء (mock/live gated) |
| `app/api/domains/connect/route.ts` | ربط الدومين بمشروع Vercel |
| `app/api/domains/status/route.ts` | فحص الحالة (purchased/connected) |

### الملفات المعدّلة

- `components/dashboard/pages/settings-page.tsx`
- `lib/platform/cafe-domain.ts`
- `lib/mock/cafe-settings.ts`
- `lib/platform/admin-data.ts`
- `components/admin/pages/admin-cafes-page.tsx`
- `README.md`

### Domain Types / Keys (Mock)

- النوع الأساسي: `CafePurchasedDomain`
- الحالات: `DomainPurchaseStatus` (`available`, `mock_paid`, `purchased`, `connected`, ...)
- مفاتيح localStorage:
  - `barndaksa_qatrah_domain_searches`
  - `barndaksa_qatrah_domain_purchases`
  - `barndaksa_qatrah_purchased_domain_active`

### API Flow

1. `POST /api/domains/availability` → تحقق صيغة + TLD + توفر.
2. `POST /api/domains/price` → السعر/العملة/السنوات.
3. `POST /api/domains/buy` → شراء:
   - **Mock mode**: `orderId` وهمي + `status=purchased`.
   - **Live mode**: `POST https://api.vercel.com/v1/registrar/domains/{domain}/buy`.
4. `POST /api/domains/connect` → ربط الدومين بمشروع Vercel.
5. `POST /api/domains/status` → حالة الدومين.

### واجهة `/dashboard/settings`

داخل "رابط الكوفي" أصبح لدينا 3 خيارات واضحة:

1. **الرابط الافتراضي** (`qatrah.{NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN}`).
2. **ربط دومين يملكه الكوفي** (manual DNS).
3. **شراء دومين من برندة**:
   - بحث الدومين
   - فحص التوفر
   - عرض السعر + سنوات التسجيل + auto renew
   - ملخص الدفع
   - زر `الدفع وشراء الدومين`
   - زر `ربط الدومين بصفحة الكوفي`
   - أزرار نسخ/فتح الرابط

رسالة TLD غير المدعوم:

> "هذا الامتداد غير مدعوم للشراء المباشر حاليًا، يمكنك ربطه يدويًا من خيار الدومين الخارجي."

### التمييز بين مصادر الدومين

تمت إضافة `CafeDomainSource`:

- `platform_subdomain`
- `external_custom_domain`
- `purchased_domain`

منطق العرض:

- `getCafeDisplayDomain`:
  1) `purchased_domain` إذا حالته `مربوط`
  2) ثم `custom_domain` إذا حالته `مربوط`
  3) ثم subdomain الافتراضي

- `getCafePublicUrl`:
  - في local dev: fallback `/c/[slug]`
  - في production: يستخدم purchased/custom domain عند الاتصال، وإلا fallback.

### Admin Updates

- `/admin/cafes` detail panel:
  - subdomain
  - custom domain
  - purchased domain
  - status / source
  - createdAt / verifiedAt
  - فتح الدومين + إعادة تحقق (Mock)

- `/admin/operations`:
  - تظهر تلقائيًا عمليات:
    - `شراء دومين`
    - `ربط دومين`
  لأن الشراء/الربط يكتبان إلى `barndaksa_platform_operations`.

### Audit / Security

- لا يوجد أي استدعاء Vercel API من المتصفح.
- `VERCEL_TOKEN` يبقى server-side فقط.
- الشراء الحقيقي مقيّد بـ `VERCEL_DOMAIN_PURCHASE_LIVE=true`.
- قبل الإنتاج: الشراء يجب أن يرتبط بـ payment webhook مؤكد (`paid`) وليس من الزر مباشرة.
- تم تجهيز audit trail mock في `platform_operations` لكل شراء وربط.
- يجب حفظ سجلات ownership/purchase وربطها بالمستخدم/الكوفي في DB.
- يلزم policy واضحة لـ renewals/refunds/domain transfer قبل الإطلاق.
- دعم TLDs (خصوصًا `.sa`) يجب التحقق منه من Vercel Registrar قبل إظهار خيار الشراء.

### DB Tables المقترحة

- `cafe_domains`
- `domain_orders`
- `domain_payments`
- `domain_events`

### RLS (مستقبلي)

- `admin`: يرى كل الدومينات والطلبات.
- `cafe_owner`: يرى دومينات كوفيه فقط.
- منع أي شراء فعلي بدون دفع مؤكد (`payment_status = paid`).

### Live vs Mock

- **Mock (افتراضي):**
  - لا يوجد شراء فعلي.
  - checkout/order IDs وهمية.
  - مناسب للتطوير المحلي بدون تكلفة.

- **Live:**
  - يستخدم Vercel Registrar API فعليًا.
  - يتطلب `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, و`VERCEL_DOMAIN_PURCHASE_LIVE=true`.

### خطوات الإنتاج

1. دمج بوابة الدفع وربطها بـ webhook موثّق.
2. تنفيذ شرط server-side: لا buy إلا بعد `paid`.
3. إضافة retries + idempotency keys لعمليات الشراء/الربط.
4. إضافة شاشة renewals/refunds/transfer policy في لوحة الكوفي.
5. مراقبة failures من Vercel Registrar + تنبيهات تشغيلية.

### Build (هذه الجولة)

- `next build` (Turbopack): يمرّ على compile + TypeScript ثم يتوقف في بيئة التطوير الحالية بخطأ ذاكرة `Zone Allocation failed - process out of memory` أثناء `Collecting page data`.
- `next build --webpack`: يتجاوز خطأ الذاكرة لكنه يفشل في هذه البيئة بسبب شهادة TLS عند جلب خطوط Google (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`).
- لا توجد أخطاء TypeScript/Lint في الملفات المعدّلة الخاصة بنظام شراء الدومين.

---

## 23. Full Database, Storage, Security & RLS Audit

> هذا القسم مبني على مراجعة فعلية للملفات ضمن: `app/`, `components/`, `lib/`, `docs/`, `public/brand` + كل `app/api/*`.

### نطاق المراجعة (Coverage)

- `app/`: 41 ملف
- `components/`: 62 ملف
- `lib/`: 29 ملف
- `docs/`: 1 ملف
- `public/brand`: 3 ملفات
- **الإجمالي المفحوص:** 136 ملف

### النتائج العليا

- النظام الحالي يعمل بنمط **Mock + localStorage** لمعظم البيانات التشغيلية.
- `app/api/*` الحالي يقتصر على domain routes (6 routes) ولا يغطي باقي CRUD.
- المخاطر الأعلى: اعتماد العميل على localStorage للهوية والبيانات التشغيلية والمنطق المالي.
- توجد قابلية تداخل بيانات multi-tenant بسبب مفاتيح hardcoded مثل `barndaksa_qatrah_*`.

### جرد مفاتيح localStorage الفعلية في الكود

| Key | القراءة | الكتابة | النوع | النطاق | جدول DB مقترح | سياسة RLS/أمن |
|---|---|---|---|---|---|---|
| `barndaksa_auth_session` | `lib/platform/auth.ts`, صفحات login guards | `lib/platform/auth.ts` | session object | platform | `sessions`/auth claims | لا client authority; cookie/JWT فقط |
| `barndaksa_admin_session` | logout cleanup | logout cleanup | session flag | admin | auth claims | لا localStorage role |
| `barndaksa_cafe_session` | logout cleanup | logout cleanup | session flag | cafe | auth claims | لا localStorage role |
| `barndaksa_customer_session_{slug}` | `lib/customer/session.ts` + صفحات `/c/[slug]/*` | `lib/customer/session.ts` | customer session | customer/cafe | `customer_sessions` | customer self only |
| `barndaksa_qatrah_settings` | settings/theme/cafe public/sidebar | settings page save | `CafeSettings` | cafe | `cafe_settings` | owner/staff by `cafe_id` |
| `barndaksa_qatrah_domain_settings` | domain display logic | settings page save | custom/purchased domain flags | cafe | `cafe_domains` | owner read/write own cafe |
| `barndaksa_qatrah_domain_searches` | settings page | settings page | array history | cafe | `domain_events` | optional analytics, owner only |
| `barndaksa_qatrah_domain_purchases` | settings page | settings page | `CafePurchasedDomain[]` | cafe | `domain_orders` | owner read own; backend writes status |
| `barndaksa_qatrah_purchased_domain_active` | settings page | settings page | active purchase | cafe | `cafe_domains` + `domain_orders` | backend source of truth |
| `barndaksa_qatrah_theme` | theme hooks/public pages | theme page adopt | theme id | cafe/public | `cafe_settings.theme_id` | owner write, public read effective |
| `barndaksa_qatrah_menu` | dashboard/cafe public | menu page | products array | cafe/public | `menu_products` | owner write, public read available |
| `barndaksa_qatrah_offers` | dashboard/cafe public | offers page | offers array | cafe/public | `offers` | owner write, public read visible |
| `barndaksa_qatrah_orders` | dashboard/customer/account/reports | orders page + order-flow | orders array | cafe/customer | `orders`, `order_items` | customer own + cafe scope |
| `barndaksa_qatrah_invoices` | customer pages/reports | order-flow | invoices array | customer/cafe | `invoices` | customer own + cafe scope |
| `barndaksa_qatrah_customer_transactions` | account/customers/reports | order-flow/reservation-flow | transaction array | customer/cafe | `customer_transactions` | customer own + cafe scope |
| `barndaksa_qatrah_reservations` | dashboard/account/reports | reservations page + reservation-flow | reservations array | cafe/customer | `reservations` | customer own + cafe scope |
| `barndaksa_qatrah_reviews` | dashboard/product reviews/reports | reviews pages | reviews array | cafe/public | `reviews`, `review_replies` | public visible subset only |
| `barndaksa_qatrah_branches` | dashboard/cafe reserve | branches page | branches array | cafe/public | `branches` | owner write; public read active |
| `barndaksa_qatrah_loyalty_settings` | loyalty pages | loyalty page | object | cafe | `loyalty_settings` | cafe scope |
| `barndaksa_qatrah_loyalty_rewards` | loyalty pages/public | loyalty page | array | cafe/public | `loyalty_rewards` | cafe scope/public active subset |
| `barndaksa_qatrah_pages` | pages manager | pages manager | pages array | cafe/public | `cafe_pages` | public read published only |
| `barndaksa_qatrah_marketing` | marketing page | marketing page | campaigns array | cafe | `marketing_campaigns`, `campaign_codes` | cafe scope |
| `barndaksa_qatrah_active_plan` | permissions/subscription/admin | subscription/permissions/admin | string plan id | cafe/platform | `cafe_subscriptions` | webhook/admin authoritative |
| `barndaksa_qatrah_subscription_history` | subscription page | subscription module | array | cafe | `subscription_payments` | owner read; backend write |
| `barndaksa_qatrah_pending_subscription` | subscription module | subscription module | pending payment object | cafe | `payment_events`/checkout sessions | backend/webhook only updates final |
| `barndaksa_platform_plans` | admin + permissions + subscription | admin plans | platform plans array | platform | `platform_plans`, `platform_plan_features` | admin write only |
| `barndaksa_platform_cafes` | admin pages + settings sync | admin/settings flows | platform cafes array | platform | `cafes` | admin write only |
| `barndaksa_platform_customers` | admin pages/order/reservation flows | admin + flows | platform customers array | platform | `cafe_customers`/admin views | admin read/write, cafe scoped views |
| `barndaksa_platform_operations` | admin ops/home/cafes | order/reservation/settings flows | ops array | platform | `platform_operations`, `audit_logs` | backend writes trusted events |
| `barndaksa_platform_options` | admin options | admin options | platform options object | platform | `platform_options` | admin write only |
| `barndaksa_customers_qatrah` | customers dashboard/session helper | customer session + order/reservation flow | customer profiles | cafe | `cafe_customers` | cafe scoped, no cross-tenant |

### جرد الملفات: وظيفة كل جزء وما يحتاج DB/API/RLS

#### App layer
- `app/page.tsx`, `app/login/page.tsx`, `app/register/page.tsx`: واجهات عامة/دخول mock. تحتاج Auth server-side حقيقي.
- `app/dashboard/**`, `app/admin/**`: wrappers لصفحات تعتمد على مكونات client-heavy مع localStorage.
- `app/c/[slug]/**`: تجربة العميل (عرض/حساب/حجز/منتجات) تقرأ بيانات mock من localStorage.
- `app/api/domains/*`: routes server-side موجودة للدومينات فقط؛ تحتاج auth, ownership checks, rate limit, idempotency.

#### Components layer
- `components/dashboard/pages/*`: إدارة المنتجات/العروض/الحجوزات/العملاء/التقارير/الإعدادات/الثيم/الاشتراك — معظمها CRUD على localStorage.
- `components/admin/pages/*`: إدارة المنصة (cafes/customers/plans/options/operations/revenue) تعتمد على localStorage ويمكن تزويرها.
- `components/cafe/*` + `components/cafe/themes/*`: storefront rendering؛ البيانات تأتي من localStorage ويجب تحويلها إلى APIs عامة ومحمية.
- `components/ui/*`: UI primitives (لا تخزين مباشر غالبًا)؛ آمنة نسبيًا.

#### Lib layer
- `lib/platform/auth.ts`: مصادقة mock client-side (خطر عالي).
- `lib/platform/order-flow.ts`, `reservation-flow.ts`, `subscription.ts`, `permissions.ts`: منطق تشغيلي/مالي على العميل.
- `lib/platform/cafe-domain.ts`, `domain-purchase*.ts`: تجهيز جيد لبنية الدومين، لكن التوثيق/التحقق يجب أن يكون server-authoritative.
- `lib/mock/*`: تعريفات بيانات mock ومفاتيح localStorage.
- `lib/customer/session.ts`: جلسة عميل per-slug لكن تخزين client-side.
- `lib/cafe/*`: منطق تجربة الثيم/الروابط؛ جيد كطبقة view لكن مصدر البيانات يجب نقله للـ API.

### المخاطر الأمنية الواضحة في الوضع الحالي

1. مصادقة mock client-side مع مفاتيح قابلة للتزوير.
2. خطط الاشتراك/الميزات قابلة للتعديل عبر localStorage.
3. الطلبات/الإيرادات/العمليات التشغيلية قابلة للتلاعب من العميل.
4. شراء/ربط الدومين يمكن استدعاؤه دون توثيق ملكية كوفي داخل routes.
5. PII محفوظة في localStorage (owner/customer fields).
6. بيانات شبه مالية/هوية تسويقية ضمن client state.
7. مفاتيح tenant hardcoded (`qatrah`) تسبب مخاطر تداخل.
8. لا يوجد audit log server-enforced موحد.
9. لا يوجد webhook-authoritative flow للدفع/تفعيل الاشتراك.
10. logo/base64 على العميل بدل Storage URL.

### منع تداخل البيانات (Multi-Tenant Security Plan)

- كل جدول متعلق بالكوفي يجب أن يحتوي `cafe_id`.
- أي طلب cafe_owner/staff يتحقق من `cafe_members`.
- عدم استخدام `slug` للحماية؛ يستخدم فقط lookup عام ثم يتحول داخليًا إلى `cafe_id`.
- customer يرى بياناته داخل `cafe_id` فقط.
- cafe_owner لا يرى كوفي آخر.
- admin يرى الكل عبر دور منفصل.
- public/anon يرى فقط:
  - cafes active
  - menu_products available
  - offers visible
  - cafe_pages published
  - branches active
- public لا يرى العملاء/الطلبات/الفواتير/الدفعات/المستندات الحكومية/الإعدادات الداخلية.

### خطة RLS حسب الدور

- `admin`: full read/write tables الإدارية + read audit logs.
- `cafe_owner`: read/write rows حيث `cafe_id` ضمن عضويته.
- `cafe_staff`: حسب permissions granular + `cafe_id`.
- `customer`: own orders/reservations/invoices/transactions only.
- `anon/public`: read-only storefront filtered by status/visibility.

**Pseudo SQL مختصر:**
```sql
allow select on menu_products
where cafe_id in (select id from cafes where status='active') and available = true;

allow update on menu_products
where cafe_id in (select cafe_id from cafe_members where user_id = auth.uid() and active = true);

allow select on orders
where customer_id in (select id from cafe_customers where user_id = auth.uid());
```

### API/Server-side Migration Map (منطق يجب نقله من العميل)

| العملية | الملف الحالي | الخطر | API مقترح | جداول |
|---|---|---|---|---|
| login mock | `lib/platform/auth.ts` + `app/login/page.tsx` | spoofed role/session | `/api/auth/*` + Supabase Auth | `profiles`, `user_roles`, sessions |
| save cafe settings | `settings-page.tsx` | tamper + PII in browser | `PATCH /api/cafes/:id/settings` | `cafe_settings` |
| menu/offers CRUD | dashboard pages | forged catalog/pricing | `/api/cafes/:id/menu`, `/offers` | `menu_products`, `offers` |
| create order | `order-flow.ts` | amount/order forgery | `POST /api/orders` server-calculated totals | `orders`, `order_items`, `payments` |
| create reservation | `reservation-flow.ts` | fake reservation/events | `POST /api/reservations` | `reservations`, history |
| subscription activation | `subscription.ts` | paid status tampering | `/api/subscriptions/checkout` + `/api/payments/webhook` | `cafe_subscriptions`, `subscription_payments`, `payment_events` |
| theme adopt | `theme-page.tsx` | client truth only | `PATCH /api/cafes/:id/theme` | `cafe_settings`, `cafe_theme_history` |
| domain buy/connect | `app/api/domains/*` + settings | missing auth ownership | keep routes + enforce auth/ownership | `cafe_domains`, `domain_orders`, `domain_events` |
| logo/docs upload | `FileReader base64` | oversized/tampered payload | `POST /api/uploads/sign` | storage metadata tables |

### Storage Audit

- `public/brand/*`: أصول PNG كبيرة؛ يفضل WebP/AVIF variants.
- `logoDataUrl` في settings يُخزن client-side (base64) ويجب تحويله إلى signed upload + URL.
- buckets المقترحة:
  - `brand-assets`, `cafe-logos`, `product-images`, `offer-banners`, `customer-avatars`,
    `government-documents`, `review-attachments`, `cafe-page-assets`, `marketing-assets`.
- قواعد: MIME allowlist, max size, signed URLs, optional malware scan, retention/versioning.

### Domain & Vercel Security Audit

- **Mock الآن:** `VERCEL_DOMAIN_PURCHASE_LIVE=false` يفعل checkout/order mock.
- **Live لاحقًا:** استدعاءات Vercel Registrar API من السيرفر فقط عبر `domain-purchase-server.ts`.
- env vars المطلوبة:
  - `VERCEL_TOKEN`
  - `VERCEL_TEAM_ID`
  - `VERCEL_PROJECT_ID`
  - `VERCEL_DOMAIN_PURCHASE_LIVE`
  - `NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN`
- `VERCEL_TOKEN` يجب أن يبقى server-only.
- لا شراء دومين قبل دفع مؤكد (webhook verified).
- validate TLD + ownership + domain status transitions داخل backend.
- إضافة refunds/renewals/transfer policy قبل الإنتاج.

### Payments & Subscription Security Audit

- لا يمكن الاعتماد على localStorage لتفعيل الباقة.
- تدفق الإنتاج:
  1) إنشاء checkout server-side
  2) provider payment
  3) webhook signature verify
  4) update payment/subscription status
  5) apply plan entitlements
- الجداول: `cafe_subscriptions`, `subscription_payments`, `payment_events`.
- RLS: cafe_owner read only; status updates privileged backend/admin/webhook.

### Audit Logs المطلوبة

عمليات يجب تسجيلها:
- admin: إيقاف كوفي/عميل، تغيير باقة/خيارات منصة.
- cafe: شراء/ربط دومين، تغيير ثيم، تعديل إعدادات حساسة، رفع مستند حكومي.
- commerce: طلب جديد، حجز جديد، حذف منتج، تعديل سعر، رد على تقييم.

الحقول القياسية:
- `actor_id`, `actor_role`, `cafe_id`, `entity_type`, `entity_id`, `action`, `before`, `after`, `ip_address`, `user_agent`, `created_at`.

### مخرجات هذه الجولة

- تم إضافة ملف مرجعي تفصيلي: `docs/BARNDAKSA_DATABASE_BLUEPRINT.md`.
- لم يتم تغيير منطق التطبيق في هذه الجولة (تعديلات توثيق فقط).

---

## 24. Platform Upgrade v2

> **تاريخ:** 2026-05-30  
> **النطاق:** هوية بصرية موحّدة، تجربة عميل موسّعة، طلبات استلام، فئات منيو، ثيم مخصص، حملات تجربة، إشعارات، وشبكة اشتراك محسّنة.

### أ) لوحة الألوان الرسمية

| Token | Hex | الاستخدام |
|-------|-----|-----------|
| `espressoDark` | `#311912` | نصوص رئيسية، خلفيات داكنة |
| `coffeeBrown` | `#4A281D` | أزرار، تدرجات sidebar |
| `brandBrown` | `#6B3A25` | عناوين، روابط، focus |
| `goldAccent` | `#D9A33F` | تمييز، badges، rings |
| `softGold` | `#F0C568` | نص ذهبي على داكن |
| `creamBase` | `#FCF8F3` | خلفية لوحة الكوفي والصفحات الفاتحة |
| `warmSand` | `#F2E7D9` | خلفيات ثانوية، hints |
| `borderSand` | `#E7D7C6` | حدود الكروت والحقول |
| `mutedText` | `#806A5E` | نصوص ثانوية |

**المصدر:** `lib/ui/brand-colors.ts` — يُستورد في الصفحة الرئيسية (`app/page.tsx`) وصفحات الدخول/التسجيل.

### ب) الصفحة الرئيسية (`/`)

- إعادة بناء كاملة بهوية القهوة/الذهب الجديدة.
- هيدر sticky، أقسام مزايا، حلول، باقات، CTA.
- عنصر ولاء دائري (540 نقطة) بألوان `goldAccent` / `softGold`.
- روابط `/login` و `/register` بأزرار `coffeeBrown`.

### ج) منصة الدخول والتسجيل

| الملف | التحديث |
|-------|---------|
| `app/login/page.tsx` | خلفية `creamBase`، بانل hero بتدرج `coffeeBrown→espressoDark`، حقول Neumo |
| `app/register/page.tsx` | hero `warmSand→creamBase`، تبويب نشط `coffeeBrown` |
| `app/dashboard/layout.tsx` | خلفية `#FCF8F3` |
| `components/ui/design-system.tsx` | Bento white/gold، Shells، SoftCard، FilterBar، أزرار — ألوان v2 للوحة الكوفي؛ **Admin يبقى dark/cyber** |
| `components/dashboard/DashboardSidebar.tsx` | تدرج espresso/coffee/gold؛ badge الباقة **رابط** إلى `/dashboard/subscription` |

### د) ثيم الهوية المخصصة (`brand-identity-custom`)

- **ثيم رقم 11** في كatalog الثيمات — يسمح للكوفي ببناء هوية بصرية خاصة.
- **المفتاح:** `barndaksa_qatrah_custom_identity_theme` (`CUSTOM_IDENTITY_THEME_KEY`).
- **الحقول:** `palette` (6 ألوان)، `logoDataUrl`، `backgroundImageDataUrl`، `backgroundScope`، `backgroundFit`، `overlayStrength`، `featuredSectionMode`، `featuredCategoryId`.
- **الملفات:** `lib/mock/custom-identity-theme.ts`, `components/dashboard/theme/custom-identity-builder.tsx`, `components/cafe/themes/brand-identity-custom-theme.tsx`.
- **استخراج ألوان من الشعار:** `lib/cafe/color-extract.ts`.

### هـ) فئات المنيو (Menu Categories)

- **المفتاح:** `barndaksa_qatrah_menu_categories` (`MENU_CATEGORIES_KEY`).
- **النوع:** `MenuCategoryRecord` — اسم، وصف، صورة، أيقونة، `sortOrder`, `visible`, `featured`.
- **الإدارة:** `components/dashboard/pages/menu-page.tsx` + `product-modal.tsx`.
- **العرض:** صفحة الكوفي العامة، ثيم الهوية المخصصة، مجموعات المنتجات.

### و) طلبات الاستلام (Pickup Orders)

- **المفتاح:** `barndaksa_qatrah_orders` (محدّث — نوع `استلام` فقط).
- **الحقول الجديدة:** `pickupAt`, `status` (بانتظار/مقبول/مرفوض/ملغي), `paymentStatus` («الدفع عند الاستلام»), `rejectionReason`, `cafeResponseAt`.
- **من العميل:** `product-detail-client.tsx` — اختيار وقت الاستلام، بدون دفع إلكتروني.
- **من الكوفي:** `components/dashboard/pages/orders-page.tsx` — قبول/رفض/إلغاء.
- **التدفق:** `lib/platform/order-flow.ts` + إشعار `new_pickup_order`.

### ز) الحجوزات (Reservations)

- تدفق موجود مُحسّن مع ربط إشعارات `new_reservation`, `reservation_accepted`, `reservation_rejected`.
- **المفتاح:** `barndaksa_qatrah_reservations` (بدون تغيير اسم).
- **الواجهة:** `ThemedReservationPanel` + لوحة `/dashboard/reservations`.

### ح) الولاء (Loyalty)

- إعدادات ومكافآت موجودة + ربط نقاط الطلبات والحملات.
- **المفاتيح:** `barndaksa_qatrah_loyalty_settings`, `barndaksa_qatrah_loyalty_rewards`.
- إشعار `loyalty_points` عند منح نقاط.

### ط) حملات التجربة (Experience Campaigns)

- **المفاتيح:**
  - `barndaksa_qatrah_experience_campaigns` — تعريف الحملة (منصات TikTok/Instagram/Snapchat/YouTube Shorts/X، نقاط، شروط).
  - `barndaksa_qatrah_experience_submissions` — فيديوهات العملاء + حالة (`pending|approved|rejected`) + نقاط مُقترحة/ممنوحة.
- **الإدارة:** `components/dashboard/pages/marketing-page.tsx`.
- **الإشعارات:** `experience_submission`, `experience_approved`.

### ي) الإشعارات (Notifications)

- **المفتاح:** `barndaksa_qatrah_notifications` (`NOTIFICATIONS_KEY`).
- **النوع:** `AppNotification` — `audience` (customer|cafe), `type`, `read`, `meta`.
- **أنواع:** `new_pickup_order`, `new_reservation`, `order_accepted/rejected`, `reservation_accepted/rejected`, `loyalty_points`, `experience_*`, `new_review`.
- **الملف:** `lib/mock/notifications.ts`.

### ك) شبكة الاشتراك (`/dashboard/subscription`)

| قبل | بعد |
|-----|-----|
| Bento spans متفاوتة | شبكة `1 → sm:2 → lg:3 → xl:4` أعمدة |
| `max-h-40 overflow-y-auto` + 6 ميزات فقط | **كل** الميزات ظاهرة بدون scroll داخلي |
| تمييز بسيط | الباقة الحالية: gradient gold + ring + badge «الباقة الحالية» |
| — | checkmarks لكل ميزة (✓ أو —) |

**الملف:** `components/dashboard/pages/subscription-page.tsx`.

### ل) ملفات v2 الجديدة/المحدّثة (مختصر)

| ملف | الغرض |
|-----|--------|
| `lib/ui/brand-colors.ts` | لوحة الألوان الرسمية |
| `lib/mock/menu-categories.ts` | فئات المنيو |
| `lib/mock/custom-identity-theme.ts` | ثيم الهوية المخصصة |
| `lib/mock/experience-campaigns.ts` | حملات التجربة + التقديمات |
| `lib/mock/notifications.ts` | إشعارات الكوفي/العميل |
| `lib/mock/orders.ts` | طلبات استلام |
| `lib/cafe/color-extract.ts` | استخراج ألوان من الشعار |
| `lib/cafe/custom-identity-featured.ts` | منطق القسم المميز |
| `components/dashboard/theme/custom-identity-builder.tsx` | بناء الثيم المخصص |
| `components/cafe/themes/brand-identity-custom-theme.tsx` | عرض الثيم المخصص |

### م) Admin

- **`app/admin/layout.tsx`:** بدون تغيير جوهري — خلفية `#0f0c0a` (Cyber-Eco dark).
- **`design-system`:** `AdminPageShell`, `AdminFilterBar`, `AdminInput` — dark theme محفوظ؛ gold accent محدّث إلى `#D9A33F` حيث يلزم.

### Build

`npm run build` — يُنصح بتشغيله بعد دمج v2.

---

## 25. Custom Identity Persistence, Category Visibility & Customer Filtering Fix

### أ) سبب مشكلة عدم حفظ/تطبيق الثيم

1. **`useResolvedCafeTheme`** كان يقرأ `localStorage` داخل `useMemo` يعتمد فقط على `previewTheme`. أثناء SSR يُرجع الثيم الافتراضي `soft-cream-3d` ولا يُعاد حسابه بعد hydration إذا لم يتغيّر query param — فتبقى `/c/qatrah` على الثيم الافتراضي حتى بعد حفظ `brand-identity-custom`.
2. **زر «حفظ واعتماد»** كان يدمج الحفظ والاعتماد دون feedback واضح، وبدون فصل بين حفظ الهوية (`custom_identity_theme`) وتفعيل الثيم (`cafe_theme`).
3. **صفحات العميل الداخلية** (login/products/…) لم تكن تحقن متغيرات CSS `--ci-*` من الهوية المخصصة — فقط الصفحة الرئيسية عبر `brand-identity-custom-theme.tsx`.

### ب) الإصلاح

| الملف | التغيير |
|-------|---------|
| `lib/cafe/theme-storage-sync.ts` | **جديد** — `adoptCafeTheme`, `persistCustomIdentityTheme`, أحداث `barndaksa:theme-updated` و`barndaksa:custom-identity-updated` |
| `lib/cafe/use-resolved-cafe-theme.ts` | `useState` + `useEffect` + الاستماع للأحداث/storage |
| `lib/cafe/use-cafe-theme-page.ts` | نفس منطق إعادة القراءة |
| `components/dashboard/theme/custom-identity-builder.tsx` | زرّان منفصلان: **حفظ إعدادات الهوية** / **اعتماد الثيم وتطبيقه** + Toast + loading + badge «تغييرات غير محفوظة» |
| `components/ui/app-toast.tsx` | **جديد** — Toast موحد (success/error/loading) |
| `components/cafe/themes/themed-cafe-shell.tsx` | حقن `--ci-*` + خلفية + شعار الهوية على كل صفحات العميل |
| `components/cafe/themes/brand-identity-custom-theme.tsx` | الاستماع لتحديثات الهوية والتصنيفات |

### ج) مفاتيح localStorage

| المفتاح | الغرض | الكتابة | القراءة |
|---------|--------|---------|---------|
| `barndaksa_qatrah_theme` | الثيم المعتمد (`CAFE_THEME_KEY`) | `adoptCafeTheme`, `theme-page`, `custom-identity-builder` | `use-resolved-cafe-theme`, `use-cafe-theme-page` |
| `barndaksa_qatrah_custom_identity_theme` | palette/logo/background/featured | `persistCustomIdentityTheme` | `brand-identity-custom-theme`, `themed-cafe-shell` |
| `barndaksa_qatrah_menu_categories` | تصنيفات المنيو | `menu-page` → `saveMenuCategories` | `menu-category-utils`, `ThemeCategoryStrip`, `product-collection-page` |

### د) التصنيفات — ظهور كامل + fallback

- **`getVisibleCategoryNames`**: كل تصنيف `visible=true` مرتّب بـ `sortOrder` — **featured لا يخفي الباقي**.
- **`resolveProductCategoryId`**: `categoryId` أولًا، ثم مطابقة اسم `category` النصي، وإلا «غير مصنف».
- **`ThemeCategoryStrip`**: يعرض كل التصنيفات المرئية في **كل الثيمات** (11 ثيمًا).
- Toast «تم حفظ تصنيفات المنيو» من `/dashboard/menu`.

### هـ) فلاتر العميل — Dropdowns

- **`ThemedFilterBar`** أُعيد تصميمه: بحث + dropdown تصنيف + dropdown ترتيب + dropdown سعر + toggle عروض + «مسح الفilters».
- **`product-collection-page`**: شريط فلترة موحّد أعلى المنتجات (بدون sidebar inputs).
- empty state: «لا توجد منتجات مطابقة للفلاتر الحالية» + زر إعادة ضبط.

### Build

`npm run build` — **✅ ناجح** بعد هذا الإصلاح.

---

## 26. Local Image Asset Storage Fix & Future Storage Migration

### أ) سبب `QuotaExceededError`

- كان يتم تخزين `logoDataUrl` و`backgroundImageDataUrl` كـ **Base64 / Data URL** داخل `localStorage` تحت المفتاح `barndaksa_qatrah_custom_identity_theme` (وأحيانًا `barndaksa_qatrah_settings` للوجو العام).
- حد `localStorage` (~5MB) يُتجاوز بسرعة مع صورة خلفية أو شعار بحجم كبير → `QuotaExceededError` عند `setItem`.

### ب) الحل الحالي (mock بدون DB)

| الطبقة | ما يُخزَّن |
|--------|-----------|
| **localStorage** | palette، scope، fit، overlay، featured mode، **`logoAssetId`**، **`backgroundAssetId`** فقط — بدون أي `data:image` |
| **IndexedDB** (`barndaksa-local-assets` / store `assets`) | Blobs للصور |

**معرّفات الأصول الثابتة (استبدال in-place):**

| Kind | Asset ID |
|------|----------|
| شعار الهوية المخصصة | `barndaksa-qatrah-custom-theme-logo` |
| خلفية الهوية | `barndaksa-qatrah-custom-theme-background` |
| لوجو الكوفي (إعدادات) | `barndaksa-qatrah-cafe-logo` |

### ج) الملفات الجديدة / المحدّثة

| ملف | الغرض |
|-----|--------|
| `lib/cafe/local-asset-store.ts` | **جديد** — IndexedDB API: `saveLocalAsset`, `replaceLocalAsset`, `getLocalAssetObjectUrl`, … |
| `lib/cafe/local-storage-repair.ts` | **جديد** — migration + `repairLocalImageStorage` + زر «إصلاح التخزين المحلي» |
| `lib/cafe/cafe-settings-storage.ts` | **جديد** — حفظ إعدادات بدون base64 |
| `lib/cafe/use-custom-identity-visuals.ts` | **جديد** — resolve logo/background من IndexedDB |
| `lib/cafe/use-resolved-cafe-logo.ts` | **جديد** — resolve لوجو الكوفي |
| `lib/mock/custom-identity-theme.ts` | references فقط + guard يمنع `data:image` في JSON |
| `components/dashboard/theme/custom-identity-builder.tsx` | رفع → Blob preview → IndexedDB عند الحفظ |
| `components/cafe/themes/brand-identity-custom-theme.tsx` | عرض من asset IDs |
| `components/cafe/themes/themed-cafe-shell.tsx` | خلفية/شعار الهوية على كل صفحات العميل |
| `components/dashboard/pages/settings-page.tsx` | لوجو الكوفي → IndexedDB |
| `components/ui/barndaksa-logo.tsx` | إصلاح تحذير Next.js Image (aspect ratio) |

### د) Migration & Cleanup

- **`migrateLegacyCustomIdentityAssets()`** — عند فتح `/dashboard/theme` أو صفحات العميل: يحوّل base64 قديم إلى Blob في IndexedDB ويستبدله بـ asset IDs.
- **`repairLocalImageStorage()`** — زر «إصلاح التخزين المحلي» يظهر عند اكتشاف base64 أو خطأ quota؛ **لا** يستخدم `localStorage.clear()` — يمسح فقط المفاتيح المتضخمة (`barndaksa_qatrah_custom_identity_theme`, `barndaksa_qatrah_settings` إن احتوت base64).

### هـ) الانتقال لاحقًا إلى Supabase Storage

| Mock | Production |
|------|------------|
| IndexedDB blob | Supabase Storage URL |
| `logoAssetId` | `cafe_settings.logo_url` / `cafe_brand_identities.logo_url` |
| `backgroundAssetId` | `cafe_theme_assets.background_url` |

**Buckets:**

- `cafe-logos` — شعار الكوفي العام
- `cafe-theme-assets` — شعار/خلفية الهوية المخصصة

**RLS:** `cafe_owner` يرفع داخل مسار كوفيهه فقط؛ `public` يقرأ assets المعتمدة؛ `admin` يراجع عند الحاجة. **لا Base64 في DB أو localStorage في الإنتاج.**

### Build

`npm run build` — يُشغَّل بعد هذا الإصلاح.

---

## 27. Global Image Upload Pipeline & Asset Storage Final Fix

### أ) لماذا منع 2MB/6MB ليس حلًا مقبولًا

- القيود السابقة (`LOGO_MAX_BYTES` / `BACKGROUND_MAX_BYTES`) كانت ترفض صورًا صالحة قبل المعالجة.
- صاحب الكوفي يجب أن يرفع صورته بأي حجم منطقي؛ النظام يضغطها تلقائيًا.

### ب) Pipeline موحد — `lib/cafe/image-asset-pipeline.ts`

- **`optimizeImageForStorage(file, purpose)`** — Canvas/`createImageBitmap` → WebP (fallback JPEG).
- **حد أمان فقط:** 40MB للملف الأصلي.
- **أهداف الحجم المحسّن (ليست حد رفض):**
  - شعار/لوجو: ~500KB
  - خلفية/بانر/حملة: ~1.8MB
  - منتج/تصنيف: ~900KB
  - صورة شخصية: ~350KB
- SVG مرفوع من المستخدم: رسالة «ارفع PNG أو JPG أو WEBP».

### ج) IndexedDB — كل صور المشروع

| Kind | Asset ID pattern |
|------|------------------|
| ثيم شعار/خلفية، لوجو كوفي | IDs ثابتة (استبدال in-place) |
| منتج | `barndaksa-qatrah-product-{id}-image` |
| تصنيف | `barndaksa-qatrah-category-{id}-image` |
| عرض | `barndaksa-qatrah-offer-{id}-banner` |
| حملة | `barndaksa-qatrah-marketing-{id}-image` |
| عميل | `barndaksa-customer-{id}-avatar` |

### د) حقول Entity (Data URL → Asset ID)

| Entity | حقل جديد | legacy (migration فقط) |
|--------|----------|------------------------|
| Custom identity | `logoAssetId`, `backgroundAssetId` | `legacyLogoDataUrl`, … |
| Cafe settings | `logoAssetId` | `logoDataUrl` |
| MenuProduct | `imageAssetId` | `imageDataUrl` (http أو migration) |
| MenuCategory | `imageAssetId` | `imageDataUrl` |
| CafeOffer | `bannerAssetId` | `bannerImageUrl` (http) |
| Customer session | `avatarAssetId` | `avatarUrl` |

### هـ) الملفات الجديدة/المحدّثة

- **جديد:** `image-asset-pipeline.ts`, `entity-storage-sanitize.ts`, `menu-storage.ts`, `use-local-asset-url.ts`, `components/ui/local-asset-image.tsx`, `components/cafe/product-image.tsx`, `components/cafe/offer-banner-image.tsx`
- **محدّث:** `local-asset-store.ts`, `local-storage-repair.ts` (`migrateAllLegacyImageDataUrls`), builder ثيم، settings، product-modal، menu-page، offers-page، account avatar، كل بطاقات المنتجات

### و) Migration شامل

- **`migrateAllLegacyImageDataUrls()`** — يفحص: `custom_identity_theme`, `settings`, `menu`, `menu_categories`, `offers`, `marketing`, `barndaksa_customer_session_*`.
- زر **«إصلاح وتحسين الصور القديمة»** في `/dashboard/theme`.
- **لا** `localStorage.clear()`.

### ز) Supabase (لاحقًا)

Buckets: `cafe-logos`, `cafe-theme-assets`, `product-images`, `category-images`, `offer-banners`, `marketing-assets`, `customer-avatars`.

### Build

`npm run build` — **✅ ناجح** بعد pipeline الشامل.

---

## 28. Custom Identity Contrast System & Form Readability Fix

### سبب المشكلة

1. **`--ci-text` من لوحة العميل** كان يُطبَّق مباشرة على الصفحة والبطاقات والحقول دون حساب تباين — اختيار لون نص فاتح على خلفية فاتحة = نص غير مرئي.
2. **`BentoCard variant="gold"`** في `/dashboard/theme` يفرض `text-[#FCF8F3]` على كل المحتوى؛ الـ `<select>` داخل `SoftCard` كان يورث لونًا كريميًا على `bg-white`.
3. **بطاقات الثيم** استخدمت `--ci-background` + `--ci-text` نفسهما للصفحة والسطح، فلم تكن هناك tokens منفصلة للحقول والقوائم المنسدلة.

### الملفات المعدّلة

| ملف | دور |
|-----|-----|
| `lib/cafe/color-contrast.ts` | **جديد** — luminance WCAG، `buildCustomIdentityContrastTokens`, CSS vars |
| `lib/mock/custom-identity-theme.ts` | `buildCustomIdentityCssVars` يصدّر tokens كاملة |
| `lib/mock/cafe-theme.ts` | classes ثيم `brand-identity-custom` تستخدم `--ci-page-*`, `--ci-surface-*`, … |
| `lib/cafe/theme-experience.ts` | `formInput` للهوية المخصصة عبر `--ci-input-*` |
| `components/cafe/themes/themed-cafe-shell.tsx` | class `brand-identity-custom-theme` + حقن vars |
| `components/cafe/themes/brand-identity-custom-theme.tsx` | نفس class على الصفحة الرئيسية |
| `components/cafe/themes/themed-filter-bar.tsx` | حقول + `option` مقروءة |
| `components/dashboard/theme/custom-identity-builder.tsx` | `theme-builder-form-fields` + «فحص وضوح الهوية» |
| `app/globals.css` | قواعد scoped للحقول والـ options |

### حساب لون النص

- **`getLuminance(hex)`** — WCAG relative luminance.
- **`getContrastText(bg)`** — يقارن `#241610` vs `#FFF8F1` ويختار الأعلى contrast ratio (هدف AA قدر الإمكان).
- **`getReadableMutedText` / `getBorderForSurface`** — مشتقات آمنة لكل سطح.
- **`buildCustomIdentityContrastTokens(palette)`** — يشتق page/surface/primary/button/accent/input/dropdown tokens من ألوان العميل الأساسية فقط.

### CSS variables الجديدة

`--ci-page-bg/fg`, `--ci-surface-bg/fg`, `--ci-elevated-bg/fg`, `--ci-primary-bg/fg`, `--ci-secondary-bg/fg`, `--ci-button-bg/fg`, `--ci-accent-bg/fg`, `--ci-input-bg/fg/placeholder/border`, `--ci-muted-fg`, `--ci-border`, `--ci-dropdown-bg/fg/hover-bg`.

Legacy `--ci-text` = `pageForeground` المحسوب (ليس `palette.text` الخام).

### الحقول والقوائم المنسدلة

- كل سطح له foreground مستقل؛ لا `color: white` على root.
- `.brand-identity-custom-theme .brand-cafe-fields` يفرض tokens الحقول + `select option` صريحة.
- `.theme-builder-form-fields` يعزل builder عن نص gold BentoCard.
- فلترة `/c/*/products/*` تستخدم `experience.formInput` المحدّث + `brand-cafe-form-select`.

### palette العميل vs القراءة

- يُخزَّن `palette` الأصلية (HEX validated) في localStorage.
- **tokens المشتقة تُحسب عند العرض** — لا يلزم تخزينها في DB.
- «فحص وضوح الهوية» في builder يعرض معاينة حية + رسالة «تم تحسين لون النص تلقائيًا…» عند `paletteTextWasAutoCorrected`.

### اعتبارات الأمان (DB لاحقًا)

- لا CSS مخصص من المستخدم — **HEX فقط** مع `isValidHex`.
- palette الأصلية في DB؛ tokens مشتقة server-side أو client-side عند render.
- رفض أي payload يحتوي `data:image` أو قيم غير hex في حقول الألوان.

### Build

`npm run build` — **✅ ناجح** بعد نظام contrast.
