# تدقيق تفاعلي محلي كامل لمنصة Barndaksa

تاريخ التدقيق: 2026-07-06

وضع العمل: Audit Mode محلي. لم يتم تعديل أي كود، ولم يتم إنشاء أي migration، ولم يتم تنفيذ أي أمر Git يغير الحالة، ولم يتم حذف أو تعديل بيانات حقيقية، ولم يتم إرسال WhatsApp حقيقي، ولم يتم تعديل PWA. لم يتم إنشاء بيانات قاعدة بيانات لأن المسارات التي تحتاج حفظا لم تصل إلى حالة اختبار آمنة ومستقرة.

ملف التقرير الوحيد الذي تم إنشاؤه:

```txt
docs/audits/barndaksa-full-platform-interactive-audit-2026-07-06.md
```

## ملخص تنفيذي

المنصة ليست جاهزة لاختبار قبول تفاعلي كامل حاليا. صفحات عامة خفيفة مثل الصفحة الرئيسية وتسجيل الدخول والتسجيل ترجع استجابة، لكن مسارات جوهرية مثل الفرع الإلكتروني واللوحة والمنيو والأدمن تؤدي إلى فشل خادم التطوير أو أخطاء اتصال بقاعدة البيانات.

نسبة الجاهزية التقريبية: 38%.

أكبر مانعين:

- خادم التطوير ينهار بنفاد ذاكرة JavaScript عند تحميل مسارات محورية.
- الاتصال بقاعدة Supabase يفشل بسبب مشكلة شهادة TLS في Node، فتفشل واجهات الفرع العامة وقوائم البيانات.

نتيجة الفحوصات الأساسية قبل الاختبار:

```txt
git status --short
الناتج: فارغ

npm run check:text
Text integrity check passed.

node --max-old-space-size=16384 .\node_modules\typescript\bin\tsc --noEmit --pretty false
الناتج: لا توجد أخطاء

git -c core.pager=cat diff --check
الناتج: لا توجد أخطاء
```

فحوصات إضافية للسلامة:

```txt
npm run verify:source
Source verification passed

npm run security:source
security:source FAILED
- 20260617_104500_contact_request_final_fix.sql: forbidden fragment "SET search_path = public"
- lib/data/reservations.ts: reservations must use respond_to_reservation RPC
- lib/data/customers.ts: customer_profiles must use update_customer_profile RPC
- app/actions/customer-media.ts: customer_profiles must use update_customer_profile RPC
```

## قيود الاختبار

- تعذر استخدام المتصفح الداخلي بسبب خطأ في أداة الاتصال، لذلك تم الاعتماد على طلبات HTTP محلية وقراءة المصدر وسجلات خادم التطوير.
- لا توجد حزمة Playwright أو Puppeteer مثبتة في المشروع، ولم يتم تثبيت أي حزمة جديدة.
- لم يتم استخدام حسابات حقيقية، ولم يتم تنفيذ حفظ في قاعدة البيانات.
- لم يتم اختبار Meta WhatsApp عمليا لأن ذلك ممنوع في نطاق المهمة.
- تم فحص PWA كاستجابة manifest وservice worker فقط، دون أي تعديل أو تثبيت.

## تشغيل السيرفر

تم تشغيل السيرفر بالأمر المطلوب:

```powershell
$env:TEMP="E:\temp"
$env:TMP="E:\temp"
$env:NPM_CONFIG_CACHE="E:\npm-cache"
$env:NODE_OPTIONS="--max-old-space-size=4096 --max-semi-space-size=64"
npx next dev --webpack -p 3000
```

السيرفر بدأ بنجاح:

```txt
Next.js 16.2.6 (webpack)
Local: http://localhost:3000
Ready
```

ثم انهار عند مسارات متعددة برسائل من نوع:

```txt
RangeError: Array buffer allocation failed
FATAL ERROR: Committing semi space failed. Allocation failed - JavaScript heap out of memory
FATAL ERROR: NewSpace::EnsureCurrentCapacity Allocation failed - JavaScript heap out of memory
```

كما ظهرت أخطاء اتصال Supabase:

```txt
TypeError: fetch failed
UNABLE_TO_VERIFY_LEAF_SIGNATURE
unable to verify the first certificate
```

## Top Critical Issues

| ID | الرابط أو النطاق | الدور | النتيجة | النوع | الخطورة | Console errors | Network errors | حفظ بعد refresh | السبب المحتمل | ملفات أو دوال محتملة | توصية الإصلاح |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CR-001 | `/c/qatrah/products/popular` | عميل | أسقط خادم التطوير | Performance | Critical | نفاد ذاكرة وWorkerError | تعذر الاتصال بعد الانهيار | غير مختبر | تجميع webpack يستهلك ذاكرة عالية لمسارات الفرع | `app/c/[slug]/products/[view]/page.tsx`, `components/cafe/product-collection-page.tsx`, `next.config.ts` | تحليل imports وتقسيم المكونات الثقيلة وتجربة إعدادات Next 16 الرسمية للذاكرة |
| CR-002 | `/dashboard/menu` | مالك | أسقط خادم التطوير | Performance | Critical | نفاد ذاكرة أثناء cache pack | تعذر الاتصال بعد الانهيار | غير مختبر | صفحة المنيو ومودال الاستيراد ومنطق الصور كبير في dev bundle | `app/dashboard/menu/page.tsx`, `components/dashboard/pages/menu-page.tsx`, `components/dashboard/menu/product-modal.tsx`, `components/dashboard/menu/menu-import-modal.tsx` | فصل المودالات بالتحميل الكسول وتقليل bundle صفحة المنيو |
| CR-003 | واجهات الفرع العامة | عميل | فشل 500 | Integration | Critical | `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | 500 في fast وmenu | غير مختبر | Node لا يثق بشهادة Supabase المستخدمة محليا | `app/api/public/cafe/[slug]/fast/route.ts`, `app/api/public/cafe/[slug]/menu/route.ts`, `lib/supabase/*` | إصلاح trust store أو تشغيل Node بإعداد شهادة صحيح محليا ثم إعادة الاختبار |
| CR-004 | `npm run security:source` | أمان | فشل بوابة الأمان | Security | Critical | لا ينطبق | لا ينطبق | لا ينطبق | كتابات مباشرة على جداول حساسة وfragment SQL ممنوع | `lib/data/reservations.ts`, `lib/data/customers.ts`, `app/actions/customer-media.ts`, migration المذكور | نقل الكتابات إلى RPC آمنة وإزالة fragment المرفوض |
| CR-005 | نصوص عربية في الواجهة | كل الأدوار | يوجد mojibake ظاهر في ملفات تشغيلية | Text | Critical | لا ينطبق | لا ينطبق | لا ينطبق | ملفات متعددة تحتوي نصا عربيا تالفا رغم نجاح check:text | `app/login/page.tsx`, `components/dashboard/DashboardSidebar.tsx`, `components/admin/AdminSidebar.tsx`, `app/actions/auth.ts` | توسيع فحص النصوص ليكشف الأنماط الموجودة فعليا ثم إصلاح النصوص يدويا بعد مراجعة diff |

## High Issues

| ID | الرابط أو النطاق | الدور | النتيجة | النوع | الخطورة | السبب المحتمل | الملفات أو الدوال المحتملة | توصية الإصلاح |
|---|---|---|---|---|---|---|---|---|
| HI-001 | `/dashboard` | غير مصرح | رجع 200 مع configError بعد Unauthorized داخلي | Security / Logic | High | الصفحة تلتقط خطأ الصلاحية وتعرض واجهة بديلة بدل منع واضح | `app/dashboard/page.tsx`, `lib/data/cafes.ts` | التفريق بين خطأ الإعداد وخطأ الصلاحية وإرجاع redirect أو 403 للمستخدم غير المصرح |
| HI-002 | `/admin` | غير مصرح | محاولة التحميل أسقطت السيرفر في العينة الثانية | Performance / Security | High | صفحات الأدمن ثقيلة وتحتوي fallback عند فشل البيانات | `app/admin/page.tsx`, `components/admin/pages/*` | حماية مبكرة في layout أو middleware قبل تحميل بيانات الأدمن الثقيلة |
| HI-003 | Paymob webhook | دفع | HMAC اختياري حسب متغير بيئة | Security | High | `PAYMOB_REQUIRE_HMAC` إن لم يكن true يسمح بمعالجة payload غير موثق | `app/api/payments/paymob/webhook/route.ts`, `lib/payments/paymob.ts` | جعل HMAC إلزاميا عند تفعيل Paymob |
| HI-004 | PayPal webhook | دفع | يرجع `verified: true` عند وجود webhook id دون تحقق فعلي ظاهر | Security | High | endpoint placeholder | `app/api/payments/paypal/webhook/route.ts` | تنفيذ تحقق PayPal الرسمي أو إرجاع ignored/501 حتى يكتمل |
| HI-005 | feature disabled direct URL | مالك | غير مثبت runtime | Security | High | الاعتماد داخل الصفحة وليس guard موحد قبل المسار | `lib/data/feature-entitlements.ts`, `app/dashboard/*/page.tsx` | إضافة فحص موحد للميزات في server layer لكل direct URL |
| HI-006 | رسائل WhatsApp من الكاشير | كاشير | قد ترسل رسائل عند قبول أو رفض الطلبات والحجوزات | Integration | High | `sendWhatsAppMessage` يستدعى داخل عمليات الكاشير | `lib/data/cashier.ts` | إضافة وضع audit/test يمنع الإرسال الخارجي ويؤكد ذلك في الاختبارات |

## Quick Wins

- إصلاح إعداد شهادة Supabase محليا أو توثيق تشغيل Node مع trust store صحيح.
- رفع مشكلة الذاكرة إلى أولوية أولى قبل أي اختبار قبول تفاعلي.
- جعل صفحات dashboard وadmin تميز بوضوح بين غير مصرح وغير مهيأ.
- توسيع `check-text-integrity` لأن ملفات تشغيلية كثيرة ما زالت تعرض نصا عربيا تالفا.
- جعل مودالات المنيو والاستيراد lazy loaded لتقليل ذاكرة التجميع.
- تشغيل security gate كشرط مانع قبل أي إطلاق.
- إضافة وضع mock صريح غير إنتاجي للدومينات والدفع والرسائل.

## خريطة الصفحات المختبرة

| الرابط | الدور | الخطوات | الأزرار المختبرة | النتيجة | Console errors | Network errors | حفظ بعد refresh | نوع المشكلة | الخطورة |
|---|---|---|---|---|---|---|---|---|---|
| `/` | زائر | طلب HTTP محلي | لم تختبر بصريا | 200 وحجم استجابة 34029 | خطأ شهادة في `getPublicHomePromotions` | لا يوجد فشل HTTP | لا ينطبق | Integration | High |
| `/login` | زائر | طلب HTTP محلي وقراءة المصدر | لم تختبر بصريا | 200 وحجم استجابة 17990 | نصوص عربية تالفة في المصدر | لا يوجد | لا ينطبق | Text | Critical |
| `/register` | زائر | طلب HTTP محلي وقراءة المصدر | لم تختبر بصريا | 200 وحجم استجابة 34709 | لا يوجد في العينة | لا يوجد | لا ينطبق | غير مؤكد | Low |
| `/c/qatrah` | عميل | طلب HTTP بدون اتباع redirect | لم تختبر بصريا | 307 | تحذير metadataBase | redirect إلى مسار فرعي | لا ينطبق | UI / Integration | Medium |
| `/c/qatrah/products/popular` | عميل | طلب HTTP | لم تختبر | أسقط السيرفر | نفاد ذاكرة وWorkerError | تعذر الاتصال بعد الانهيار | غير مختبر | Performance | Critical |
| `/api/public/cafe/qatrah/fast` | عميل | GET | لا يوجد | 500 | خطأ شهادة Supabase | 500 | لا ينطبق | Integration | Critical |
| `/api/public/cafe/qatrah/menu` | عميل | GET | لا يوجد | 500 | خطأ شهادة Supabase | 500 | لا ينطبق | Integration | Critical |
| `/api/public/cafe/qatrah/reservation-branches` | عميل | GET | لا يوجد | 200 مع payload فارغ تقريبا | خطأ شهادة مسجل ثم fallback | لا يوجد | لا ينطبق | Integration / Empty state | Medium |
| `/api/pwa/qatrah/manifest.json` | عميل | GET فقط | لا يوجد | 200 | لا يوجد حرج | لا يوجد | لا ينطبق | Performance | Low |
| `/api/pwa/qatrah/manifest` | عميل | GET فقط | لا يوجد | 200 | لا يوجد حرج | لا يوجد | لا ينطبق | Performance | Low |
| `/api/pwa/qatrah/sw` | عميل | GET فقط | لا يوجد | 200 | لا يوجد حرج | لا يوجد | لا ينطبق | غير مؤكد | Low |
| `/dashboard` | مالك | GET دون جلسة | لم تختبر | 200 مع configError | `Unauthorized: no cafe access` | لا يوجد | غير مختبر | Security / Logic | High |
| `/dashboard/menu` | مالك | GET دون جلسة | لم تختبر | أسقط السيرفر | نفاد ذاكرة | تعذر الاتصال | غير مختبر | Performance | Critical |
| `/admin` | أدمن | GET دون جلسة بعد تشغيل جديد | لم تختبر | أسقط السيرفر في العينة | نفاد ذاكرة | تعذر الاتصال | غير مختبر | Performance / Security | High |
| `/cashier` | كاشير | قراءة المصدر وطلب سابق بعد انهيار | لم تختبر | غير مكتمل بسبب انهيار سابق | لا يتوفر | تعذر الاتصال | غير مختبر | Not tested | Medium |
| `/cashier/login` | كاشير | قراءة المصدر وطلب سابق بعد انهيار | لم تختبر | غير مكتمل بسبب انهيار سابق | لا يتوفر | تعذر الاتصال | غير مختبر | Not tested | Medium |
| `/representative` | مندوب | قراءة المصدر | لا يوجد | redirect متوقع إلى login عند غياب الجلسة | غير مختبر runtime | غير مختبر | لا ينطبق | Security | Medium |
| `/api/domains/status` | عام | GET | لا يوجد | 405 لأن route يستخدم POST | لا يوجد | 405 | لا ينطبق | API Method | Low |
| `/api/domains/availability` | عام | GET | لا يوجد | 405 لأن route يستخدم POST | لا يوجد | 405 | لا ينطبق | API Method | Low |
| `/api/domains/price` | عام | GET | لا يوجد | 405 لأن route يستخدم POST | لا يوجد | 405 | لا ينطبق | API Method | Low |

## الصفحة الرئيسية

الرابط:

```txt
/
```

الدور: زائر.

الخطوات: تم طلب الصفحة محليا ومراجعة الاستجابة وسجل الخادم. لم يمكن اختبار النقرات بصريا بسبب عدم توفر متصفح آلي مستقر ثم انهيار السيرفر لاحقا.

الأزرار والروابط المطلوبة: CTA، التسجيل، الدخول، روابط العلامات، responsive. النتيجة: Not tested with reason: لا توجد أداة متصفح تفاعلية متاحة، وخادم التطوير غير مستقر بعد مسارات الفرع واللوحات.

الأخطاء: الصفحة رجعت 200، لكن سجل الخادم أظهر فشل جلب عروض الصفحة بسبب شهادة Supabase. السبب المحتمل في إعداد trust store المحلي أو شهادة endpoint.

## الفرع الإلكتروني

الروابط:

```txt
/c/[slug]
/c/[slug]/products/popular
/c/[slug]/products/latest
/c/[slug]/products/offers
/c/[slug]/reserve
/c/[slug]/account
/c/[slug]/login
/c/[slug]/register
/c/[slug]/rewards
/c/[slug]/notifications
```

الدور: عميل.

النتيجة: لم يكتمل الاختبار التفاعلي. المسار الرئيسي أعاد redirect، ومسار المنتجات الشائعة أسقط الخادم بنفاد الذاكرة. واجهات `fast` و`menu` فشلت 500 بسبب شهادة Supabase.

المنتجات، التصنيفات، البحث، العروض، المكافآت، الحساب، السلة، الطلب، الحجز، تسجيل دخول العميل، الخرائط، QR، الولاء، وحالات البيانات الفارغة: Not tested with reason: الخادم انهار قبل الوصول الآمن للتفاعل، والواجهات العامة المعتمدة على Supabase فشلت بسبب TLS.

PWA install: تم فحص manifest وservice worker فقط بدون تعديل. الاستجابات 200، لكن لم يتم اختبار prompt أو تثبيت.

تصنيفات النشاط الموجودة من المصدر:

```txt
cafes_coffee
restaurants
events_conferences
```

لم يتم اختبار كل نوع بصريا، لكن التسجيل والأدمن والخطط تحتوي هذه التصنيفات في المصدر.

## لوحة العلامة

الروابط من سجل الميزات:

```txt
/dashboard
/dashboard/pages
/dashboard/menu
/dashboard/orders
/dashboard/reservations
/dashboard/offers
/dashboard/loyalty
/dashboard/cashier
/dashboard/branches
/dashboard/customers
/dashboard/reports
/dashboard/reviews
/dashboard/marketing
/dashboard/experience-reviews
/dashboard/branda-finance
/dashboard/settings
/dashboard/theme
/dashboard/subscription
```

الدور: مالك علامة.

النتيجة:

- `/dashboard` رجع 200 لكنه سجل خطأ صلاحية داخلي ثم عرض حالة بديلة.
- `/dashboard/menu` أسقط السيرفر.
- باقي عناصر sidebar لم تختبر runtime لأن السيرفر انهار.

feature overrides: موجودة في المصدر عبر `brand_feature_overrides` و`getEffectiveBrandFeatureCodes`. لم يتم اختبار حالة خدمة مقفلة أو مفعلة يدويا بعد refresh بسبب عدم وجود جلسة مالك مستقرة وعدم جواز تعديل بيانات حقيقية.

الحفظ ثم refresh: Not tested with reason: لا توجد جلسة QA_TEST مستقرة، ومسارات الحفظ لا يمكن اختبارها دون خطر لمس بيانات حقيقية.

## الكاشير

الروابط:

```txt
/cashier
/cashier/login
```

الدور: كاشير.

النتيجة: لم يكتمل runtime بسبب انهيار الخادم. من قراءة المصدر:

- يوجد تسجيل دخول كاشير منفصل.
- توجد عمليات قبول ورفض الطلب.
- توجد حالة `completed`.
- توجد حالة `not_completed` منفصلة عن `rejected`.
- توجد قراءة بطاقة ولاء وصرف/تسجيل عمليات ولاء.
- توجد QR check-in للحجوزات والتذاكر.
- توجد كتابة سجل عمليات وتدقيق.

ملاحظة مهمة: عمليات قبول/رفض الطلب والحجز واستعمال التذاكر تستدعي إرسال WhatsApp عند وجود رقم عميل. لم يتم لمسها عمليا التزاما بالمنع.

التصميم على الجوال وhorizontal overflow: Not tested with reason: لا يوجد متصفح تفاعلي، والخادم غير مستقر. المصدر يحتوي جداول بعرض أدنى كبير مع حاويات `overflow-x-auto` في بعض المواضع، وهذا يحتاج فحص بصري فعلي.

## الأدمن

روابط AdminSidebar:

```txt
/admin/client-brands
/admin
/admin/cafes
/admin/customers
/admin/finance
/admin/revenue
/admin/operations
/admin/operations-center
/admin/reservations
/admin/plans
/admin/platform-coupons
/admin/content
/admin/jobs
/admin/representatives
/admin/options
/admin/maintenance
/admin/support
```

الدور: أدمن منصة.

النتيجة: محاولة `/admin` بعد تشغيل جديد انتهت بتعذر الاتصال بسبب انهيار السيرفر. لم تختبر الجداول والمودالات أو تفاصيل العلامة أو تغيير الباقة أو feature overrides بصريا.

من قراءة المصدر توجد fallbacks في بعض صفحات الأدمن عند غياب إعداد Supabase أو فشل جلب البيانات. هذا مناسب للتطوير فقط، لكنه خطر إذا ظهر لمستخدم غير مصرح أو في بيئة إعدادها سيئ.

الصلاحيات: غير مثبتة runtime. يلزم اختبار customer/cashier/owner/admin بجلسات فعلية بعد إصلاح الاستقرار.

## المناديب

الرابط:

```txt
/representative
```

الدور: مندوب.

النتيجة من المصدر: الصفحة تطلب dashboard مندوب، وإذا لم يوجد تحول إلى تسجيل الدخول. لم يتم اختبار الدخول أو المهام أو حالات التسليم لأن الخادم غير مستقر ولا توجد بيانات QA_TEST.

## الاستيراد والخرائط

الاستيراد:

- يدعم iWaiter وYalla QR Codes وPHP catalog وHTML/JSON عام من المصدر.
- يوجد timeout عام 9000ms، وtimeout iWaiter 8000ms، وtimeout PHP catalog 8000ms.
- توجد حماية ضد private IP وprivate hostname في روابط الاستيراد.
- توجد حالات صور ناقصة `needs_review` وعدّاد `withoutImage` في المودال.

الخرائط:

- يوجد تحليل روابط Google Maps المباشرة والمختصرة.
- يوجد timeout 9000ms للروابط المختصرة.
- توجد حماية ضد host خاص وروابط غير مسموحة.
- Mapbox يعتمد على مفتاح عام في البيئة، ويعرض رسالة خطأ عند غيابه.

النتيجة: لم تختبر الروابط الصحيحة والخاطئة أو timeout عمليا لأن ذلك يتطلب تفاعل UI أو إرسال URL عبر server action. التوصية: بعد إصلاح الاستقرار، اختبر روابط Google Maps مباشرة، مختصرة، وروابط غير Google وروابط private network.

## الأمن والصلاحيات

| السيناريو | النتيجة | السبب |
|---|---|---|
| customer لا يدخل dashboard/admin | Not tested | لا توجد جلسة عميل QA مستقرة، والسيرفر ينهار |
| cashier لا يدخل admin/dashboard مالك | Not tested | لا توجد جلسة كاشير QA مستقرة |
| owner لا يشوف علامة ثانية | Not tested | يحتاج بيانات QA_TEST متعددة |
| feature disabled تمنع direct URL | Static only | المصدر يتحقق من الميزات داخل الصفحات، لكن runtime غير مثبت |
| APIs محمية | Partial | buy/connect تتطلب owner للslug، أما status/price/availability فهي POST عامة |
| env leak | Partial | لم تعرض قيم env. تمت قراءة أسماء المفاتيح فقط، ولم تظهر القيم في التقرير |
| RLS/security warnings | Static only | security:source فشل ويجب إغلاقه |

## قاعدة البيانات

لم يتم إنشاء أو تعديل بيانات لأن ذلك غير آمن في هذه الجلسة. السيناريوهات المطلوبة:

- حفظ منتج `QA_TEST_`.
- حفظ حجز `QA_TEST_`.
- حفظ طلب `QA_TEST_`.
- حفظ إعداد أو كاشير إن أمكن.
- refresh للتأكد من بقاء البيانات.

كلها Not tested with reason: عدم وجود جلسة اختبار مضمونة، وفشل اتصال Supabase بسبب TLS، وانهيار خادم التطوير في مسارات الحفظ. لا يجوز لمس بيانات حقيقية.

## السيناريوهات التي نجحت

- تشغيل خادم Next محليا بالمنفذ المطلوب.
- فحص text integrity قبل الاختبار.
- فحص TypeScript قبل الاختبار.
- فحص diff whitespace قبل الاختبار.
- تحميل `/` بنجاح مع وجود خطأ تكامل في الخلفية.
- تحميل `/login` و`/register` بنجاح كاستجابة HTTP.
- تحميل manifest وservice worker للفرع كفحص قراءة فقط.
- إثبات أن GET على واجهات الدومينات يرجع 405 لأنها مصممة كـ POST.
- إثبات أن `not_completed` منفصلة عن `rejected` في كود الكاشير.
- تشغيل `verify:source` بنجاح.

## السيناريوهات التي فشلت

- `/c/qatrah/products/popular` فشل بانهيار الخادم.
- `/dashboard/menu` فشل بانهيار الخادم.
- `/admin` فشل بانهيار الخادم في العينة الثانية.
- `/api/public/cafe/qatrah/fast` فشل 500 بسبب شهادة Supabase.
- `/api/public/cafe/qatrah/menu` فشل 500 بسبب شهادة Supabase.
- `security:source` فشل.
- النصوص العربية في عدة ملفات تشغيلية تالفة بصريا في المصدر.

## Not Tested With Reason

- كل الأزرار والروابط بصريا: لا يوجد متصفح آلي مستقر، وخادم التطوير ينهار.
- تسجيل الدخول الحقيقي: لا توجد بيانات QA_TEST مصرح بها، وتسجيل الدخول قد يلمس بيانات Auth حقيقية.
- تسجيل العلامة: قد ينشئ حسابا وبيانات حقيقية، لذلك لم ينفذ.
- الطلب والحجز والحفظ: يتطلب بيانات حية وجلسة مستقرة، لذلك لم ينفذ.
- صرف مكافأة أو قراءة بطاقة ولاء: قد يكتب في قاعدة البيانات ويرسل أحداثا، لذلك لم ينفذ.
- قبول ورفض الطلبات والحجوزات: قد يرسل WhatsApp أو يغير بيانات حقيقية، لذلك لم ينفذ.
- تفاصيل الأدمن وتغيير الباقة وfeature overrides: تحتاج صلاحية أدمن وبيانات اختبار.
- responsive desktop/mobile وhorizontal overflow: يحتاج متصفح بصري بعد إصلاح الخادم.
- PWA install prompt: فحص قراءة فقط دون تعديل أو تثبيت.

## توصيات ترتيب الإصلاح

1. إصلاح ثقة شهادة Supabase محليا ثم إعادة اختبار واجهات الفرع العامة.
2. معالجة نفاد الذاكرة في Next dev لمسارات الفرع والمنيو والأدمن.
3. إغلاق فشل `security:source`.
4. إصلاح النصوص العربية التالفة وتوسيع `check-text-integrity`.
5. إضافة seed أو حسابات QA_TEST منفصلة ومعلنة للاختبار المحلي.
6. إضافة وضع audit يمنع رسائل WhatsApp والدفع الخارجي أثناء اختبارات الكاشير والطلبات.
7. إعادة اختبار full interactive audit بمتصفح فعلي بعد أن تبقى الصفحات مستقرة.

