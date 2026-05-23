# تقرير ترقية تصميم منصة برندة

تاريخ التنفيذ: 2026-05-22  
حالة البناء: `npm run build` — نجح بدون أخطاء TypeScript.

---

## 1. ملخص تنفيذي

تم رفع مستوى واجهة **branda-platform** إلى هوية إنتاجية موحّدة تعتمد:

- **Bento Grid** للوحات الرئيسية والتقارير والباقات والعملاء.
- **Cyber-Eco Dark Mode** في لوحة الأدمن والثيم `cyber-eco-dark`.
- **Neumorphism / Soft UI** في النماذج والكروت الداخلية ولوحة الكوفي.
- **شعارات برندة الحقيقية** من `public/brand/` بدون نصوص بديلة.

المنطق الحالي (mock + localStorage + الصلاحيات) محفوظ؛ أُضيفت طبقات للدفع الوهمي للاشتراك وربط الطلبات/الحجوزات بالأدمن.

---

## 2. الملفات التي تم إنشاؤها

| الملف | الغرض |
|-------|--------|
| `components/ui/branda-logo.tsx` | مكوّن شعار موحّد (dark / brown / brown-bg) |
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
| `public/brand/branda-logo-dark.png` | شعار للخلفيات الداكنة |
| `public/brand/branda-logo-brown.png` | شعار للخلفيات الفاتحة |
| `public/brand/branda-logo-brown-bg.png` | شعار بخلفية بنية للهيرو |
| `docs/BRANDA_DESIGN_UPGRADE_REPORT.md` | هذا التقرير |

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
| `branda_platform_plans` | باقات المنصة |
| `branda_platform_cafes` | كوفيهات + إيرادات mock |
| `branda_platform_customers` | عملاء المنصة (مرتبطون بكوفي) |
| `branda_platform_operations` | سجل العمليات العامة |
| `branda_platform_options` | خيارات المنصة |
| `branda_qatrah_active_plan` | الباقة المفعّلة للكوفي (بعد الدفع فقط) |
| `branda_qatrah_pending_subscription` | **جديد** — باقة مختارة بانتظار الدفع |
| `branda_qatrah_subscription_history` | **جديد** — سجل اشتراكات |
| `branda_qatrah_settings` | إعدادات الكوفي (اسم، وصف، لوجو، تواصل…) |
| `branda_qatrah_theme` | ثيم صفحة الكوفي |
| `branda_qatrah_menu` | المنيو |
| `branda_qatrah_offers` | العروض |
| `branda_qatrah_reservations` | الحجوزات |
| `branda_qatrah_orders` | طلبات الكوفي (`CafeOrder`) |
| `branda_customers_qatrah` | ملفات عملاء الكوفي |
| `branda_qatrah_invoices` | فواتير العملاء |
| `branda_qatrah_customer_transactions` | حركات العميل |
| `branda_qatrah_loyalty_settings` | إعدادات الولاء |
| `branda_qatrah_loyalty_rewards` | مكافآت الولاء |
| `branda_qatrah_branches` | الفروع |
| `branda_qatrah_reviews` | تقييمات وأسئلة |
| `branda_qatrah_pages` | صفحات تعريفية |
| `branda_qatrah_marketing` | حملات تسويق |
| `branda_auth_session` | جلسة دخول المنصة (كوفي/أدمن) |
| `branda_customer_{slug}` | جلسة عميل الكوفي |

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
| `admin@branda.com` / `admin123` | `/admin` |

يُحفظ في `branda_auth_session`.

عملاء الكوفي: `/c/{slug}/login` → `branda_customer_{slug}` مع `?next=` للعودة للمنتج أو الحجز.

---

## 10. ربط العميل بالكوفي

- عند تسجيل دخول العميل: `setCustomerSession(slug, …)` في `lib/customer/session.ts`.
- عند أول طلب: `order-flow.ts` يضيف `PlatformCustomer` إن لم يكن موجودًا مع `cafeId: cafe_qatrah`.
- عند الحجز: `reservation-flow.ts` يربط العميل بنفس المنطق + عملية في `PLATFORM_OPERATIONS_KEY`.

---

## 11. ربط الطلبات والحجوزات

### طلب منتج (`createCafeOrderFromProduct`)
يكتب إلى:
- `branda_qatrah_orders` — `CafeOrder` كامل (منتج، كمية، ضريبة 15%، إجمالي، نقاط ولاء)
- `branda_qatrah_orders` (نسخة عميل مبسطة)
- `branda_qatrah_invoices`
- `branda_qatrah_customer_transactions`
- `branda_platform_operations` — نوع «طلب»
- `branda_platform_cafes` — زيادة `totalRevenue` و `totalOrders`
- `branda_platform_customers` — زيادة إنفاق ونقاط

### حجز (`createReservationFlow`)
- `branda_qatrah_reservations`
- `branda_qatrah_customer_transactions`
- `branda_platform_operations` — نوع «حجز»
- ربط عميل بالمنصة إن لم يكن مسجّلًا

---

## 12. استخدام الشعار

| الموقع | ملف الشعار |
|--------|------------|
| خلفيات داكنة (Admin sidebar، login hero، dashboard sidebar header) | `branda-logo-dark.png` |
| خلفيات فاتحة (landing، register، subscription، settings) | `branda-logo-brown.png` |
| هيرو بني (landing slide، login/register hero، cafe hero) | `branda-logo-brown-bg.png` |
| صفحة الكوفي العامة | لوجو الكوفي من الإعدادات إن وُجد، وإلا `branda-logo-brown.png` |
| Dashboard sidebar — كوفي بدون لوجو مرفوع | `branda-logo-brown.png` داخل بطاقة الكوفي |

مكوّن: `<BrandaLogo variant="dark|brown|brown-bg" />` — لا يستخدم حرف «ق» أو نص «برندة» كبديل.

---

## 13. ثيمات صفحة الكوفي

| ID | الاسم | التأثير (`getThemeClasses`) |
|----|-------|------------------------------|
| `classic-branda` | كلاسيك برندة | كريمي + بني كلاسيكي |
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
7. **حساب العميل:** مفتاح `branda_customer_{slug}` منفصل لكل كوفي — مناسب لـ multi-tenant على الويب.

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
- **`app/globals.css`**: قواعد `.branda-admin-fields` و`.brand-cafe-fields` لضمان قراءة الحقول حتى مع classNames قديمة.
- **`app/admin/layout.tsx`**: إضافة class `branda-admin-fields` على منطقة المحتوى.
- صفحات الأدمن: `admin-cafes`, `admin-plans`, `admin-customers`, `admin-operations`, `admin-options` — استبدال `NeumoInput` + `darkInput` بـ `AdminInput` حيث يلزم.

### صفحة الكوفي العامة — إزالة شعار برندة الكبير

- **`components/cafe/cafe-page-client.tsx`**: تركيز كامل على هوية الكوفي؛ `CafeLogo` placeholder (حرف أول) بدون شعار برندة في الهيدر/الهيرو.
- **`components/cafe/cafe-logo.tsx`**: placeholder أنيق عند غياب لوجو الكوفي.
- **`components/cafe/cafe-footer.tsx`**: «صُمم بواسطة برندة» + «Powered by Branda» + شعار صغير (~52px) فقط في الفوتر.

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
| `components/admin/AdminSidebar.tsx` | زر أسفل القائمة → `logoutBrandaAuth()` → `/login` |
| `components/dashboard/DashboardSidebar.tsx` | نفس المنطق |
| `lib/platform/auth.ts` | يمسح `branda_auth_session`, `branda_admin_session`, `branda_cafe_session` |

### ملفات معدّلة في هذه الجولة

`components/ui/design-system.tsx`, `app/globals.css`, `app/admin/layout.tsx`, `components/admin/AdminSidebar.tsx`, `components/dashboard/DashboardSidebar.tsx`, `components/admin/pages/admin-*.tsx`, `components/cafe/*`, `app/c/[slug]/*`, `lib/platform/auth.ts`, `docs/BRANDA_DESIGN_UPGRADE_REPORT.md`.

### localStorage — جلسات إضافية (اختيارية)

- `branda_admin_session` — يُمسح عند الخروج (جاهز لربط لاحق).
- `branda_cafe_session` — يُمسح عند الخروج (جاهز لربط لاحق).

المفتاح الفعلي للدخول الموحّد: `branda_auth_session`.

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
| `classic-branda` | `soft-cream-3d` |
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
| `branda_qatrah_theme` (`CAFE_THEME_KEY`) | الثيم **المعتمد** — لم يُغيّر الاسم |
| `branda_qatrah_settings` | إعدادات الكوفي + `customDomain` + `domainStatus` |
| `branda_qatrah_domain_settings` | مفتاح احتياطي للدومين (جاهز لربط لاحق) |

المعاينة: state في لوحة الثيم + `previewTheme` query — **بدون** مفتاح معاينة إلزامي.

### منطق الدومين (`lib/platform/cafe-domain.ts`)

| الدالة | الغرض |
|--------|--------|
| `getPlatformPublicDomain()` | من `NEXT_PUBLIC_BRANDA_PUBLIC_DOMAIN` أو fallback `branda.local` |
| `getCafeSubdomainHost(slug)` | عرض: `qatrah.branda.local` |
| `getCafeDisplayDomain(slug, settings?)` | subdomain أو custom domain إن كان `مربوط` |
| `getCafePublicUrl(slug, options?)` | رابط فعلي fallback: `{origin}/c/{slug}` + `?previewTheme=` |
| `resolveCafeSlugFromHost(hostname, pathname)` | جاهز لـ middleware مستقبلي |
| `normalizeCafeDomainInput` | تنظيف إدخال الدومين |
| `getDomainSetupInstructions` | CNAME → `cname.vercel-dns.com` |

**الوضع الحالي:**

- **Fallback route:** `/c/qatrah` (يعمل في التطوير والإنتاج).
- **Display للعميل:** `qatrah.{NEXT_PUBLIC_BRANDA_PUBLIC_DOMAIN}`.
- **Custom domain (mock):** حقل في الإعدادات + حالة ربط — بدون DNS حقيقي بعد.

### Vercel / DNS (لاحقًا)

1. إضافة **wildcard domain** على Vercel: `*.branda.sa` (أو الدومين المُعرّف في env).
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
2. وإلا `localStorage.getItem("branda_qatrah_theme")` عبر `normalizeThemeId`.
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
| `branda_qatrah_theme` | `CafeThemeId` (string) | string | `theme-page.tsx` | كل صفحات `/c/*`, `useCafeThemePage` | كوفي | `cafe_settings.theme_id` أو `cafe_themes` |
| `branda_qatrah_settings` | `CafeSettings` JSON | object | `settings-page.tsx` | shell, header, themes | كوفي | `cafe_settings` |
| `branda_qatrah_domain_settings` | (احتياطي) | object | — | — | كوفي | `cafe_domains` |
| `branda_qatrah_menu` | `MenuProduct[]` | array | `menu-page.tsx` | cafe public, collection, detail | كوفي | `menu_products` |
| `branda_qatrah_offers` | `CafeOffer[]` | array | `offers-page.tsx` | cafe home, collection | كوفي | `offers` |
| `branda_qatrah_branches` | `CafeBranch[]` | array | `branches-page.tsx` | reserve, collection/branches | كوفي | `branches` |
| `branda_qatrah_reservations` | حجوزات | array | `reservations-page.tsx`, `reservation-flow.ts` | reserve, account, reports | كوفي+عميل | `reservations` |
| `branda_qatrah_orders` | `CafeOrder[]` + طلبات عميل | array | `orders-page.tsx`, `order-flow.ts` | account, reports, dashboard | كوفي | `orders`, `order_items` |
| `branda_qatrah_invoices` | `CustomerInvoice[]` | array | `order-flow.ts` | account, customers | كوفي+عميل | `invoices` |
| `branda_qatrah_customer_transactions` | `CustomerTransaction[]` | array | `order-flow.ts`, `reservation-flow.ts` | account | عميل/كوفي | `customer_transactions` |
| `branda_customers_qatrah` | `CustomerProfile[]` | array | `session.ts` upsert | customers dashboard | كوفي | `customer_profiles` |
| `branda_customer_session_{slug}` | `BrandaCustomerSession` | object | `login/register` via `setCustomerSession` | كل صفحات العميل المحمية | عميل | جلسة auth (cookie/JWT) — **لا تُخزن كـ localStorage في الإنتاج** |
| `branda_qatrah_loyalty_settings` | `LoyaltySettings` | object | `loyalty-page.tsx` | (mock ثابت في cafe home) | كوفي | `loyalty_settings` |
| `branda_qatrah_loyalty_rewards` | `LoyaltyReward[]` | array | `loyalty-page.tsx` | cafe home renderer | كوفي | `loyalty_rewards` |
| `branda_qatrah_reviews` | `CafeReview[]` | array | `reviews-page.tsx`, `product-reviews.tsx` | product detail | كوفي+عميل | `reviews`, `review_replies` |
| `branda_qatrah_marketing` | حملات | array | `marketing-page.tsx` | marketing | كوفي | `marketing_campaigns` |
| `branda_qatrah_pages` | صفحات تعريفية | array | `pages-manager-page.tsx` | (مستقبلي public) | كوفي | `cafe_pages` |
| `branda_qatrah_active_plan` | plan id | string | `subscription.ts` بعد الدفع | `permissions.ts`, sidebar | كوفي | `cafe_subscriptions.plan_id` |
| `branda_qatrah_subscription_history` | سجل اشتراكات | array | `subscription.ts` | subscription page | كوفي | `subscription_payments` |
| `branda_qatrah_pending_subscription` | فاتورة معلقة | object | `subscription.ts` | subscription page | كوفي | `subscription_payments` (status=pending) |
| `branda_platform_plans` | `PlatformPlan[]` | array | admin-plans | permissions, admin | منصة | `platform_plans` |
| `branda_platform_cafes` | `PlatformCafe[]` | array | admin-cafes | admin | منصة | `cafes` |
| `branda_platform_customers` | عملاء منصة | array | admin, flows | admin, customers | منصة | `platform_customers` أو view |
| `branda_platform_operations` | عمليات | array | order/reservation flow | admin ops | منصة | `platform_operations` |
| `branda_platform_options` | خيارات منصة | object | admin-options | admin | منصة | `platform_options` |
| `branda_auth_session` | جلسة دخول موحدة | object | `auth.ts` login | login guard | منصة | Supabase Auth / `sessions` |
| `branda_admin_session` | (يُمسح عند logout) | object | — | logout | admin | JWT claim `role=admin` |
| `branda_cafe_session` | (يُمسح عند logout) | object | — | logout | كوفي | JWT claim `cafe_id` |

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
| `branda_qatrah_theme` | `cafe_settings` | `theme_id` | قراءة عند تحميل dashboard/public |
| `branda_qatrah_settings` | `cafe_settings` | `name`, `logo_url`, `description`, … | دمج مع صف واحد per cafe |
| `branda_qatrah_menu` | `menu_products` | product fields | `imageDataUrl` → رفع ثم `image_url` |
| `branda_customer_session_qatrah` | — | — | **استبدال بـ Supabase session cookie** |
| `branda_qatrah_active_plan` | `cafe_subscriptions` | `plan_id`, `status` | فقط بعد webhook |

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
