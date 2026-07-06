# تدقيق منصة Barndaksa / Branda الكامل

تاريخ التدقيق: 2026-07-06

النطاق: وضع تدقيق فقط. لم يتم تعديل أي كود، ولم يتم إنشاء migration، ولم يتم تنفيذ أوامر git add أو commit أو reset أو clean، ولم يتم لمس بيانات حقيقية أو إرسال رسائل واتساب أو تعديل PWA. التعديل الوحيد هو إنشاء هذا التقرير.

## ملخص تنفيذي

المنصة غير جاهزة للإطلاق الإنتاجي حاليًا.

نسبة الجاهزية التقريبية: 55%.

السبب الأهم: الخادم المحلي ينهار عند أول طلب صفحة بسبب نفاد ذاكرة JavaScript أثناء تجميع Next.js. لذلك تعذر اختبار الأزرار والرحلات التفاعلية في المتصفح، وتحولت بقية المراجعة إلى تدقيق ثابت من المصدر وفحوصات الأوامر.

أكبر 10 مخاطر:

1. خادم التطوير لا يستطيع تحميل الصفحة الرئيسية أو صفحات الفرع الإلكتروني وينهار بنفاد الذاكرة.
2. فحص security:source يفشل على direct writes وجزء SQL ممنوع.
3. Webhook Paymob يمكن أن يفعل اشتراكًا عبر service role إذا لم يكن فرض HMAC مفعّلًا.
4. Webhook PayPal يعيد verified=true دون تحقق فعلي عند وجود PAYPAL_WEBHOOK_ID.
5. فحص سلامة النصوص يمر رغم وجود Arabic mojibake فعلي في ملفات TS/TSX.
6. صفحات Admin/Dashboard تعرض حالات fallback عند غياب Supabase، وبعضها mock data، وهذا خطر UX وأمني في بيئة سيئة الإعداد.
7. تدفق الدومينات يعمل mock عند عدم تفعيل الشراء الحي وقد يعطي connected=true دون ربط فعلي.
8. آثار mock/localStorage ومفاتيح qatrah ما زالت واسعة في مسارات العميل والداشبورد.
9. Branda Finance يحتوي صفحات كثيرة بحالة محلية أو انتظار جداول، وليس نظامًا محاسبيًا كامل الربط بعد.
10. الاختبار الأمني runtime وRLS غير مثبتين في هذه البيئة لأن قاعدة البيانات لم تُختبر ببيانات QA_TEST_.

## أوامر التحقق

حالة git قبل أي شيء:

```txt
git status --short
الناتج: فارغ
```

الفحوصات الأساسية:

```txt
npm run check:text
Text integrity check passed.

node --max-old-space-size=16384 .\node_modules\typescript\bin\tsc --noEmit --pretty false
الناتج: لا توجد أخطاء

git -c core.pager=cat diff --check
الناتج: لا توجد أخطاء
```

فحوصات إضافية:

```txt
npm run verify:source
Source verification passed
```

```txt
npm run security:source
FAILED
- supabase/migrations/20260617_104500_contact_request_final_fix.sql: forbidden fragment "SET search_path = public"
- lib/data/reservations.ts: reservations must use respond_to_reservation RPC
- lib/data/customers.ts: customer_profiles must use update_customer_profile RPC
- app/actions/customer-media.ts: customer_profiles must use update_customer_profile RPC
```

تشغيل الخادم المحلي بالطريقة المطلوبة:

```txt
$env:TEMP="E:\temp"
$env:TMP="E:\temp"
$env:NPM_CONFIG_CACHE="E:\npm-cache"
$env:NODE_OPTIONS="--max-old-space-size=4096 --max-semi-space-size=64"
npx next dev --webpack -p 3000
```

الخادم يبدأ، ثم ينهار عند الطلب:

```txt
▲ Next.js 16.2.6 (webpack)
✓ Ready
FATAL ERROR: NewSpace::EnsureCurrentCapacity Allocation failed - JavaScript heap out of memory
```

وعند طلب مسار الفرع الإلكتروني:

```txt
○ Compiling /c/[slug]/products/[view] ...
FATAL ERROR: Committing semi space failed. Allocation failed - JavaScript heap out of memory
```

## جدول شامل للمشاكل

| ID | الصفحة/النطاق | الدور | الخطورة | النوع | ماذا حدث | الدليل | السبب المحتمل | الملفات/الدوال المحتملة | توصية الإصلاح | Migration | اختبار بعد الإصلاح |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AUD-001 | كل الصفحات | كل الأدوار | Critical | Performance | الخادم ينهار عند أول طلب، فلا يمكن اختبار المنصة تفاعليًا | OOM في next dev حتى على `/` و`/c/qatrah/products/popular` | حجم bundle/imports أو webpack dev مع Next 16 أو preload entries | `app/page.tsx`, `app/c/[slug]/products/[view]/page.tsx`, `next.config.ts`, imports الواسعة | تحليل الذاكرة، تجربة Turbopack، تقليل barrel imports، تفعيل إعدادات memory من docs | لا | نعم |
| AUD-002 | CI/Security gate | Admin/DevOps | Critical | Security | فحص security:source يفشل | خرج npm run security:source | direct writes على جداول حساسة وsearch_path غير آمن | `lib/data/reservations.ts`, `lib/data/customers.ts`, `app/actions/customer-media.ts`, migration 20260617 | اجعل الكتابة عبر RPC المعتمد وأزل search_path public | غالبًا نعم | نعم |
| AUD-003 | Paymob webhook | Owner/Admin | Critical | Security/Payment | HMAC لا يُفرض إلا إذا PAYMOB_REQUIRE_HMAC=true، ثم يستخدم service role لتفعيل اشتراك | `app/api/payments/paymob/webhook/route.ts` الأسطر 37-83، `lib/payments/paymob.ts` 320-333 | الاعتماد على flag اختياري للتحقق من webhook | `verifyPaymobWebhookHmac`, `activatePaidSubscription` | اجعل HMAC إلزاميًا عند وجود Paymob، وارفض أي payload غير موثق | لا غالبًا | نعم |
| AUD-004 | PayPal webhook | Owner/Admin | High | Security/Payment | endpoint يعيد verified=true دون تحقق فعلي عندما يوجد webhook id | `app/api/payments/paypal/webhook/route.ts` الأسطر 3-15 | placeholder لم يكتمل | PayPal webhook route | نفذ تحقق PayPal الرسمي أو أرجع 501/ignored بدون verified=true | لا | نعم |
| AUD-005 | نصوص عربية | كل الأدوار | High | Text | يوجد mojibake في ملفات تشغيلية رغم نجاح check:text | أمثلة في `app/api/admin/email-test/route.ts`, `lib/data/cashier.ts`, `components/maps/google-map-picker.tsx`, `lib/platform/domain-purchase-server.ts` | قائمة check:text أضيق من الأنماط الموجودة | `scripts/check-text-integrity.mjs` | وسع أنماط الفحص واستخدم security gate كمصدر موحد | لا | نعم |
| AUD-006 | Admin fallback | Admin | High | Security/UI | عند عدم إعداد Supabase تعرض بعض صفحات الأدمن mock/fallback UI بدل منع الوصول الكامل | نتائج rg على `app/admin/*/page.tsx` | fallback مصمم للتطوير قد يظهر في إعداد خاطئ | `app/admin/cafes/page.tsx`, `app/admin/customers/page.tsx`, `app/admin/options/page.tsx` | اجعل صفحات الأدمن تتطلب مصادقة حتى عند missing config أو اعرض خطأ مجردًا | لا | نعم |
| AUD-007 | Domain APIs | Owner/Public | Medium | Integration/Security | search/price/availability غير مربوطة بمصادقة في route نفسها وتستخدم Vercel في live mode | `app/api/domains/search/route.ts`, `price`, `availability` | البحث قد يكون عامًا لكن يمكن استنزاف API عند live | Domain routes | أضف rate limiting و/أو auth حسب سياسة المنتج | لا | نعم |
| AUD-008 | Domain connect mock | Owner | High | Logic/Integration | عند VERCEL_DOMAIN_PURCHASE_LIVE غير true يرجع connectDomainToProject connected=true وmock id | `lib/platform/domain-purchase-server.ts` | mock production-like response | `connectDomainToProject` | ميّز mock بوضوح ولا تعرضه كربط حقيقي | لا | نعم |
| AUD-009 | localStorage/mock legacy | Customer/Owner | High | DB/Logic | مسارات كثيرة ما زالت تستورد mock وتستخدم مفاتيح qatrah/localStorage | rg أظهر عشرات النتائج | انتقال غير مكتمل من mock إلى DB | `lib/mock/*`, `lib/cafe/*`, صفحات dashboard/cafe | حصر mock في demo mode فقط وربط production ب Supabase | ربما | نعم |
| AUD-010 | Cashier service role | Cashier | Medium | Security | عمليات كاشير كثيرة تستخدم service role بعد تحقق كوكي الجلسة | `lib/data/cashier.ts` createAdminClient متكرر | تصميم server-side bypass لـ RLS يحتاج صرامة عالية | `requireCashierSessionContext`, `cashierUpdateOrderStatus` | أضف rate limit، تدوير token، audit إلزامي، وتحقق صلاحيات granular | لا غالبًا | نعم |
| AUD-011 | Not completed status | Cashier | Low | Logic | الكود يميز not_completed عن rejected، وهذا جيد، لكن لم يختبر runtime | `lib/data/cashier.ts` 591-626 | الخادم لا يعمل للاختبار | `cashierUpdateOrderStatus` | اختبر قبول/إكمال/عدم إكمال بعد حل OOM | لا | نعم |
| AUD-012 | PWA install | Customer | Medium | UI/Integration | لم يُختبر بسبب انهيار الخادم، والكود يستخدم localStorage لتعليم التثبيت | `components/cafe/brand-pwa-install-section.tsx` | حجب runtime | PWA component | اختبار install prompt وrefresh بعد حل OOM | لا | نعم |
| AUD-013 | Maps | Owner | Medium | Text/Integration | منطق الحماية جيد ضد private hosts، لكن UI الرسائل Mojibake وMapbox token يعتمد على env | `app/actions/maps.ts`, `components/maps/google-map-picker.tsx` | ترميز تالف وفشل محتمل عند غياب token | maps action/component | أصلح النصوص وأضف اختبار روابط Google المختصرة | لا | نعم |
| AUD-014 | Branda Finance | Owner | Medium | DB/Logic | صفحات عديدة معلنة كـ local أو بانتظار جداول؛ ليست نظامًا ماليًا مكتملًا | `lib/branda-finance/menu.ts`, صفحات finance | تكامل جزئي | `app/dashboard/branda-finance/*` | فصل ما هو جاهز عن ما هو roadmap، ومنع الحفظ غير المكتمل | ربما | نعم |
| AUD-015 | Dashboard/Admin auth runtime | Admin/Owner | Medium | Security | الاعتماد الأساسي داخل pages/data وليس layout شامل، ولم يثبت بالمتصفح | `app/admin/layout.tsx`, `app/dashboard/layout.tsx` لا يمنعان وحدهما | حماية موزعة | layouts + page loaders | أضف guard واضحًا في layout أو middleware للأدوار الحساسة | لا | نعم |

## خريطة الصفحات المختبرة

| الرابط | الحالة | الأزرار المختبرة | الملاحظات |
|---|---|---|---|
| `/` | فشل runtime | غير مختبر | الطلب أسقط خادم Next بسبب OOM |
| `/login` | غير مختبر runtime | غير مختبر | الخادم كان غير متاح بعد OOM |
| `/register` | غير مختبر runtime | غير مختبر | تمت مراجعة الكود فقط |
| `/careers` | غير مختبر runtime | غير مختبر | تمت مراجعة route ضمن الخريطة فقط |
| `/c/qatrah` | فشل runtime | غير مختبر | فرع إلكتروني محجوب بسبب OOM |
| `/c/qatrah/products/popular` | فشل runtime | غير مختبر | تجميع المسار نفسه أسقط الخادم |
| `/c/qatrah/offers` | غير مختبر runtime | غير مختبر | لم يصل بسبب سقوط الخادم |
| `/c/qatrah/rewards` | غير مختبر runtime | غير مختبر | لم يصل بسبب سقوط الخادم |
| `/c/qatrah/account` | غير مختبر runtime | غير مختبر | يحتاج جلسة عميل ولم يختبر |
| `/c/qatrah/reserve` | غير مختبر runtime | غير مختبر | يحتاج تفاعل وحفظ؛ Not tested with reason: OOM وعدم لمس بيانات حقيقية |
| `/dashboard` | غير مختبر runtime | غير مختبر | تمت مراجعة auth/data statically |
| `/dashboard/menu` | غير مختبر runtime | غير مختبر | تمت مراجعة source وsecurity gate |
| `/dashboard/orders` | غير مختبر runtime | غير مختبر | تم التحقق static من statuses |
| `/dashboard/reservations` | غير مختبر runtime | غير مختبر | security gate أشار لمسار update مباشر |
| `/dashboard/loyalty` | غير مختبر runtime | غير مختبر | تمت مراجعة feature gates |
| `/dashboard/branda-finance/*` | غير مختبر runtime | غير مختبر | أجزاء كثيرة local/empty state |
| `/admin/*` | غير مختبر runtime | غير مختبر | تمت مراجعة fallback/auth statically |
| `/cashier` | غير مختبر runtime | غير مختبر | تمت مراجعة كود الجلسة والعمليات |
| `/representative` | غير مختبر runtime | غير مختبر | redirect متوقع عند غياب dashboard |
| `/api/payments/paymob/webhook` | static only | لا يوجد | خطر HMAC موثق |
| `/api/payments/paypal/webhook` | static only | لا يوجد | placeholder موثق |
| `/api/domains/*` | static only | لا يوجد | بحث/سعر/ربط يحتاج rate limit وفصل mock |

## سيناريوهات المستخدمين

Admin: لم يختبر في المتصفح. المصدر يملك requirePlatformAdmin في طبقة البيانات لكثير من الصفحات، لكن layout لا يمنع وحده، وبعض صفحات fallback تظهر عند missing config.

Brand Owner: لم يختبر تسجيل الدخول والحفظ بسبب OOM. source يشير إلى requireOwnerCafeContext في معظم عمليات الداشبورد والدفع، لكن security gate يكشف direct writes يجب إغلاقها.

Cashier: لم يختبر UI. الكود يملك session cookie منفصل وRPC login ثم عمليات service role محصورة بـ cafe_id. حالة not_completed منفصلة عن rejected في الكود.

Customer: لم يختبر التسجيل/الطلب/الحجز. يوجد customer session cookie scoped by slug، لكن التجربة العامة ما زالت تعتمد على mock/localStorage في طبقات كثيرة.

Representative: لم يختبر. المسار يعيد login إذا لم تتوفر بيانات dashboard.

Maintenance account: لم يختبر. يوجد maintenance session في dashboard layout، لكن runtime محجوب.

## سيناريوهات التصنيفات

التصنيفات المتاحة لصاحب العلامة في التسجيل من المصدر:

```txt
cafes_coffee
restaurants
events_conferences
```

لم يتم اختبار أي تصنيف في المتصفح بسبب OOM. تمت مراجعة عامة لتفرعات business category في التسجيل والداشبورد والكاشير، لكن يلزم اختبار runtime لكل تصنيف بعد حل مشكلة الخادم.

## مشاكل قاعدة البيانات

- direct update على reservations وcustomer_profiles مرصود من security:source.
- migrations 065 و066 و067 موجودة:

```txt
065_cafe_operation_events.sql
066_brand_feature_overrides.sql
067_add_order_not_completed_status.sql
```

- لم يتم التحقق من تطبيقها على قاعدة فعلية.
- RLS موثق في docs لكنه runtime pending حسب وثائق المشروع.
- لم يتم إنشاء أو تعديل بيانات QA_TEST_.
- لم يتم اختبار الحفظ بعد refresh لأن الخادم ينهار.
- brand_feature_overrides يقرأ في `lib/data/feature-entitlements.ts` لكن انعكاسه runtime غير مثبت.

## مشاكل التصميم

لم يمكن فحص الجداول والمودالات والسايدبار على الشاشة بسبب OOM. من المصدر:

- يوجد `overflow-x-hidden` في layouts، لكن هذا لا يثبت عدم وجود horizontal overflow داخل الجداول.
- توجد مكونات كثيرة للجداول والمودالات في admin/dashboard/finance تحتاج لقطة شاشة فعلية.
- النصوص العربية التالفة ستظهر للمستخدم في رسائل أخطاء وخرائط وكاشير ودومينات.
- PWA install لم يختبر، ولم يتم لمسه.

## مشاكل الأمان

- Paymob webhook عالي الخطورة عند عدم فرض HMAC.
- PayPal webhook placeholder يعلن verified=true دون تحقق فعلي.
- service role مستخدم على نطاق واسع في server code؛ هذا مقبول فقط مع guards صارمة واختبارات.
- Admin fallback عند missing config يجب ألا يتحول إلى تجربة إدارة قابلة للتصفح في بيئات غير مضبوطة.
- direct writes على جداول حساسة تخالف بوابة security:source.
- .env.local يحتوي مفاتيح حساسة موجودة محليًا؛ لم أعرض القيم، لكن يجب التأكد من عدم تتبع الملف في Git.

## Quick Wins

1. إصلاح OOM أولًا أو تشغيل مسار تشخيص ذاكرة Next.
2. تشغيل security:source في CI كشرط مانع.
3. جعل Paymob HMAC إلزاميًا عند تفعيل Paymob.
4. جعل PayPal webhook لا يرجع verified=true قبل التحقق الرسمي.
5. توسيع check-text-integrity ليشمل أنماط mojibake الموجودة فعليًا.
6. تحويل رسائل maps/cashier/domain/payment المكسورة إلى UTF-8 صحيح.
7. إيقاف mock fallback في admin عند production أو missing config.

## Long-term Refactor

1. فصل demo/mock mode عن production mode بوضوح.
2. توحيد طبقة الصلاحيات بين layout وdata وserver actions.
3. نقل كل عمليات الجداول الحساسة إلى RPC مدققة.
4. بناء اختبارات Playwright بعد حل OOM لكل دور.
5. بناء seed QA_TEST_ كامل لاختبار الطلب والحجز والولاء والكاشير.
6. مراجعة Branda Finance كمنتج مستقل: ما هو حقيقي، ما هو read-only، وما هو roadmap.

## Not Tested

- كل الأزرار والروابط والمودالات بصريًا: Not tested with reason: خادم Next ينهار بنفاد الذاكرة عند أول طلب.
- تسجيل الدخول الحقيقي: Not tested with reason: لا توجد جلسات اختبار مصرح بها ولم أستخدم بيانات حقيقية.
- الحفظ في قاعدة البيانات: Not tested with reason: ممنوع لمس بيانات حقيقية، ولم يتم توفير seed QA_TEST_ نشط.
- Meta WhatsApp: Not tested with reason: ممنوع إرسال رسائل حقيقية.
- PWA install: Not tested with reason: ممنوع تعديل PWA والخادم غير مستقر.
- الدفع الحقيقي: Not tested with reason: لا يجب تنفيذ عمليات مالية في audit mode.
- RLS runtime: Not tested with reason: لم يتم تشغيل Supabase test DB أو بيانات QA_TEST_ في هذه الجلسة.

## الخلاصة

الأولوية قبل أي اختبار شامل هي جعل الخادم المحلي يحمل `/` و`/c/[slug]` دون OOM. بعد ذلك يجب إغلاق فشل security:source ومشكلة Paymob webhook وموجيباك النصوص. بعدها فقط يصبح اختبار الأزرار والرحلات منطقياً، لأن المنصة الآن لا تصل إلى مرحلة runtime مستقرة.
