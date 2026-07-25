# Phase 1.5 Local Stability Audit - 2026-07-06

## ملخص تنفيذي

تمت مراجعة تقرير Phase 1، ثم تشغيل baseline، ثم مقارنة وضع التطوير مع وضع production-like على نفس المسارات العامة المطلوبة فقط.

النتيجة المختصرة: وضع production-like نجح وثبت على المسارات الستة بدون OOM أو timeout. وضع dev نجح أيضا في هذه الجولة بعد ضبط TEMP و TMP و NPM cache و NODE_OPTIONS، لكنه كان أبطأ بوضوح في الصفحة الرئيسية، وتاريخ Phase 1 يثبت أنه كان غير مستقر تحت فحص تفاعلي أطول.

التوصية: نستخدم production-like عبر build ثم next start لباقي مراحل Audit، ولا نعتبر المنصة فاشلة بسبب تعثرات dev السابقة. تعتبر بيئة dev غير مستقرة للتدقيق التفاعلي الطويل.

## هل يمكن استكمال Phase 2؟

نعم، يمكن استكمال Phase 2 بشرط تشغيل الاختبارات على production-like server:

```text
npm run build
npx next start -p 3000
```

لا أوصي بالاعتماد على next dev لباقي مراحل Audit إلا إذا كان الهدف اختبار تجربة التطوير نفسها.

## وضع التشغيل الأنسب للتدقيق

الوضع الأنسب للتدقيق التالي:

```text
production-like: npm run build ثم npx next start -p 3000
```

السبب:

- build نجح بدون OOM.
- next start رجع كل مسارات Phase 1.5 بحالات صحيحة.
- مسارات الفرع في next start كانت أسرع بكثير من dev.
- dev كان مستقرا في الجولة القصيرة بعد ضبط الذاكرة والكاش، لكن تقرير Phase 1 أظهر انهيارات و timeouts تحت فحص أطول.

## استخراج أخطاء Phase 1

من تقرير Phase 1، الأخطاء والمسارات المتأثرة كانت:

| البند | المسار | الخطأ | النتيجة |
|---|---|---|---|
| ذاكرة Turbopack | عدة مسارات بعد طلبات Phase 1 | memory allocation failed | خروج الخادم أو فقدان الاستقرار |
| ذاكرة Webpack | الصفحة الرئيسية والفرع | RangeError: Array buffer allocation failed | تعليق و timeouts |
| مهلة | / | HOME_ERROR=The operation has timed out | فشل طلب لاحق في Phase 1 |
| مهلة | /c/qatrah/products/popular | POPULAR_ERROR=The operation has timed out | فشل طلب لاحق في Phase 1 |
| تكامل خارجي | / | UNABLE_TO_VERIFY_LEAF_SIGNATURE داخل getPublicHomePromotions | الصفحة ترجع 200 لكن مع فشل fetch للعروض |
| تحذير metadata | مسارات الفرع | metadataBase غير معرف | تحذير SEO، ليس فشل تشغيل |

المسارات التي لم يكتمل فحصها تفاعليا في Phase 1 بسبب الاستقرار:

```text
/
/c/qatrah/products/popular
/c/qatrah/offers
/c/qatrah/rewards
/c/qatrah/account
```

## Baseline

### git status --short

النتيجة: نجح الأمر برمز خروج 0.

```text
?? docs/audits/barndaksa-full-platform-interactive-audit-2026-07-06.md
?? docs/audits/phase-0-baseline-audit-2026-07-06.md
?? docs/audits/phase-1-public-branch-audit-2026-07-06.md
```

### npm run check:text

النتيجة: نجح الأمر برمز خروج 0.

```text
> check:text
> node scripts/check-text-integrity.mjs

Text integrity check passed.
```

### node --max-old-space-size=16384 .\node_modules\typescript\bin\tsc --noEmit --pretty false

النتيجة: نجح الأمر برمز خروج 0.

```text
```

### git -c core.pager=cat diff --check

النتيجة: نجح الأمر برمز خروج 0.

```text
```

## اختبار dev server

تم تشغيل dev server بالأمر المطلوب:

```text
$env:TEMP="E:\temp"
$env:TMP="E:\temp"
$env:NPM_CONFIG_CACHE="E:\npm-cache"
$env:NODE_OPTIONS="--max-old-space-size=4096 --max-semi-space-size=64"
npx next dev --webpack -p 3000
```

الخادم بدأ بنجاح:

```text
Next.js 16.2.6 (webpack)
Local: http://localhost:3000
Ready in 695ms
```

### جدول المسارات في dev

| المسار | الأمر | الحالة | الزمن | OOM | Timeout | ملاحظات |
|---|---|---:|---:|---|---|---|
| / | curl.exe -I http://localhost:3000/ | 200 | 22261ms | لا | لا | بطيء؛ فشل fetch للعروض بسبب شهادة TLS |
| /c/qatrah | curl.exe -I http://localhost:3000/c/qatrah | 307 | 2087ms | لا | لا | تحويل مؤقت إلى مسار الفرع |
| /c/qatrah/products/popular | curl.exe -I http://localhost:3000/c/qatrah/products/popular | 200 | 1883ms | لا | لا | نجح |
| /c/qatrah/offers | curl.exe -I http://localhost:3000/c/qatrah/offers | 200 | 2023ms | لا | لا | نجح |
| /c/qatrah/rewards | curl.exe -I http://localhost:3000/c/qatrah/rewards | 200 | 1793ms | لا | لا | نجح |
| /c/qatrah/account | curl.exe -I http://localhost:3000/c/qatrah/account | 200 | 1866ms | لا | لا | نجح |

### أخطاء dev وملاحظاته

لم يظهر OOM أو timeout في هذه الجولة القصيرة. ظهرت الملاحظات التالية:

```text
[getPublicHomePromotions] TypeError: fetch failed
UNABLE_TO_VERIFY_LEAF_SIGNATURE
metadataBase property in metadata export is not set
```

تفسير النتيجة: dev server لم يفشل في Phase 1.5 بعد ضبط الذاكرة والكاش، لكن الصفحة الرئيسية بقيت بطيئة جدا مقارنة بباقي المسارات، وتاريخ Phase 1 يثبت أن dev لا يصلح كبيئة موثوقة لفحص تفاعلي طويل.

## اختبار production-like

تم تشغيل build بالأمر المطلوب:

```text
$env:TEMP="E:\temp"
$env:TMP="E:\temp"
$env:NPM_CONFIG_CACHE="E:\npm-cache"
$env:NODE_OPTIONS="--max-old-space-size=8192"
npm run build
```

النتيجة: build نجح برمز خروج 0.

مخرجات مهمة:

```text
Compiled successfully in 7.1s
Finished TypeScript in 12.8s
Collecting page data using 1 worker in 2.2s
Generating static pages using 1 worker (87/87)
```

ملاحظة: ظهر عدد كبير من تحذيرات Dynamic server usage في مسارات dashboard بسبب استخدام cookies أثناء build. هذه المسارات خارج نطاق Phase 1.5، ولم تمنع build من النجاح.

بعد نجاح build تم تشغيل:

```text
npx next start -p 3000
```

الخادم بدأ بنجاح:

```text
Next.js 16.2.6
Local: http://localhost:3000
Ready in 280ms
```

### جدول المسارات في production-like

| المسار | الأمر | الحالة | الزمن | OOM | Timeout | ملاحظات |
|---|---|---:|---:|---|---|---|
| / | curl.exe -I http://localhost:3000/ | 200 | 17752ms | لا | لا | بطيء؛ فشل fetch للعروض بسبب شهادة TLS |
| /c/qatrah | curl.exe -I http://localhost:3000/c/qatrah | 307 | 67ms | لا | لا | تحويل مؤقت |
| /c/qatrah/products/popular | curl.exe -I http://localhost:3000/c/qatrah/products/popular | 200 | 62ms | لا | لا | ثابت وسريع |
| /c/qatrah/offers | curl.exe -I http://localhost:3000/c/qatrah/offers | 200 | 53ms | لا | لا | ثابت وسريع |
| /c/qatrah/rewards | curl.exe -I http://localhost:3000/c/qatrah/rewards | 200 | 47ms | لا | لا | ثابت وسريع |
| /c/qatrah/account | curl.exe -I http://localhost:3000/c/qatrah/account | 200 | 43ms | لا | لا | ثابت وسريع |

### أخطاء production-like وملاحظاته

لم يظهر OOM أو timeout في production-like. ظهرت الملاحظات التالية فقط:

```text
[getPublicHomePromotions] TypeError: fetch failed
UNABLE_TO_VERIFY_LEAF_SIGNATURE
metadataBase property in metadata export is not set
```

## أخطاء الذاكرة والمهلات

### مؤكدة من Phase 1

```text
memory allocation failed
RangeError: Array buffer allocation failed
HOME_ERROR=The operation has timed out.
POPULAR_ERROR=The operation has timed out.
```

### في Phase 1.5 dev

لم تتكرر أخطاء الذاكرة أو المهلات بعد ضبط:

```text
TEMP=E:\temp
TMP=E:\temp
NPM_CONFIG_CACHE=E:\npm-cache
NODE_OPTIONS=--max-old-space-size=4096 --max-semi-space-size=64
```

لكن الصفحة الرئيسية بقيت بطيئة، وكان سجلها يحتوي على فشل شهادة TLS.

### في Phase 1.5 production-like

لم تظهر أخطاء ذاكرة أو مهلات. الصفحة الرئيسية بقيت بطيئة بسبب فشل fetch خارجي، أما مسارات الفرع فكانت مستقرة وسريعة.

## الاستنتاج

production-like ثابت بما يكفي لاستكمال التدقيق. تعثرات Phase 1 لا تثبت فشل المنصة؛ تثبت أن بيئة dev السابقة كانت غير مستقرة للفحص التفاعلي الطويل، خصوصا مع Turbopack أو Webpack بدون ضبط الذاكرة والكاش.

يوجد عائق تكامل خارجي مستقل عن الاستقرار المحلي:

```text
UNABLE_TO_VERIFY_LEAF_SIGNATURE
```

هذا يؤثر على جلب عروض الصفحة الرئيسية ويشرح بطء الصفحة الرئيسية في dev و production-like.

## توصية التشغيل لباقي المراحل

استخدم production-like لباقي مراحل Audit:

```text
$env:TEMP="E:\temp"
$env:TMP="E:\temp"
$env:NPM_CONFIG_CACHE="E:\npm-cache"
$env:NODE_OPTIONS="--max-old-space-size=8192"
npm run build
npx next start -p 3000
```

لا تستخدم next dev كبوابة حكم على صحة المنصة. إن فشل dev فقط، يصنف ذلك كعدم استقرار بيئة التطوير وليس فشلا عاما في المنصة.

## git status النهائي

قبل إنشاء هذا التقرير، لم يظهر أي ملف كود معدل. بعد إنشاء التقرير كانت الحالة النهائية:

```text
?? docs/audits/barndaksa-full-platform-interactive-audit-2026-07-06.md
?? docs/audits/phase-0-baseline-audit-2026-07-06.md
?? docs/audits/phase-1-5-local-stability-audit-2026-07-06.md
?? docs/audits/phase-1-public-branch-audit-2026-07-06.md
```

شرط التسليم: التغيير الوحيد ضمن هذا الطلب هو تقرير Phase 1.5 الحالي، ولا توجد ملفات كود معدلة.

## فحوصات بعد إنشاء التقرير

تمت إعادة الفحوصات بعد إنشاء التقرير:

```text
npm run check:text
node --max-old-space-size=16384 .\node_modules\typescript\bin\tsc --noEmit --pretty false
git -c core.pager=cat diff --check
git -c core.pager=cat diff --stat
git -c core.pager=cat status --short
```

النتيجة: نجحت فحوصات سلامة النص و TypeScript و diff check. لم تظهر ملفات كود معدلة، و diff stat فارغ لأن التغييرات غير متتبعة.
