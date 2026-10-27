# تشغيل برندة المالية

- INVENTORY IMAGE UPLOAD 2026-10-27T09:47:40.627Z: Explicit Arabic upload/change button replaces native file input; compact preview and gold circular real XHR upload percentage, separate server-processing state, confirmed success and retry feedback. Unknown total is indeterminate, timeout/abort/error cleanup, busy lock, private endpoint and raster validation retained. Accessible progress/status, keyboard button, 44px controls and reduced-motion support. Transport regression + editor14, root/release types/text, scoped lint, source/diff responsive/security review and Node24 webpack PASS. No browser or physical-device run. Evidence output/inventory-upload-verification.json; tag inventory-image-upload-20261027 identifies release

- INVENTORY CATALOG 2026-10-27T09:36:06.975Z: One warehouse for new additions (historical extras retained); inline units, unique six-digit generated Code128/manual/scanner/camera barcode, private sanitized images and multi-product consumption with full/equal analytical allocation. Physical stock and GL COGS always follow actual consumption; immutable components reconcile partial/full refunds. Purchase draft preserved during inline item creation, narrow catalog merge and offline component deductions; POS design unchanged. SQL352, editor13, UI43/roles8, inventory report, services/images, offline IndexedDB, root/release TypeScript/text, scoped lint and final Node24 webpack PASS. Live migration 20261027090955 MD5 a19470c8d5cdd43f3f31b29c346a36b2 and eight authenticated/catalog/privacy/legacy checks PASS in rollback transaction. No physical camera/reader test, real sale or parallel-session stress test. Evidence output/inventory-catalog-verification.json; tag inventory-catalog-components-20261027 identifies release

- CUSTOMER INVOICE WITH LOYALTY 2026-10-27T02:13:11.131Z: Successful eligible POS sale with optional customer phone now sends one private PDF attachment with the loyalty caption through the existing leased queue. Authoritative saved invoice lines/discount/tax/totals, embedded Arabic fonts and multipage support; no POS UI change, no replay of completed jobs, ambiguous sends remain review-only. SQL159, worker/transport/PDF, root/release types/text, scoped lint, webpack and deployment font traces PASS. Migration 050000 live MD5 c4d655e966caa694a2ca63d9e061d3aa; service-only queue, private receipt and saved totals verified read-only. No real customer test message. Evidence output/customer-receipt-verification.json; tag customer-invoice-loyalty-20261027 identifies release

## رقابة المالية والأدوار — ٢٧ أكتوبر ٢٠٢٦

- المالك يدير الصلاحيات والإقفال والموافقات الحساسة، ومدير التشغيل يدير العمليات، والمحاسب القيود والخزينة، وأمين المستودع المخزون، والمراجع يقرأ فقط
- الحماية مطبقة في قاعدة البيانات والخادم والواجهة مع عزل العلامات ومنع تغيير دور صاحب وردية مفتوحة
- إقفال الفترة يتطلب يومًا مكتملًا وسببًا وإنهاء الورديات واستلام العهد مع سجل دائم باسم المنفذ
- الرقابة تعرض اتزان القيود ومطابقة قيمة المخزون وأرصدة الضريبة وجودة التكلفة والربح الدفتري
- تقرير المخزون يفصل المستودعات ويعرض السالب والنواقص والتكلفة غير الموثقة مع تصفية وتصدير
- تصدير اليومية يجمع النتائج كاملة ويطابق عدد الصفوف والمدين والدائن قبل التنزيل حتى ٥٠ ألف سطر لكل تصدير
- التنقل يعيد استخدام التقارير المحملة ويظل التحديث الصريح متاحًا
- تصميم شاشة الكاشير محفوظ وأرصدة الضريبة لا تمثل إقرارًا أو اعتماد تكامل الفوترة الإلكترونية

دليل إصدار المالية بتاريخ ٢٦ أكتوبر ٢٠٢٦

## الدخول والإعداد

- يفتح مالك العلامة الكاشير من لوحة التحكم بعد التحقق من صلاحياته
- يدخل الموظف من صفحة كاشير المبيعات بكلمة المرور أو رمز واتساب مع التحقق من ارتباطه بالعلامة وصلاحياته
- دخول الموظف المالي لا يمنحه صلاحية لوحة مالك العلامة وتبقى حسابات الولاء منفصلة عن دخول الموظفين
- إعداد الطابعة قسم مستقل تحت المالية مع إعداد إيصال العميل ونسخة المطبخ على الطابعة نفسها أو طابعتين

## الخزينة والرسوم

- خزائن حتى ٣ وبنوك حتى ٥ ونقاط شبكة حتى ٣ مع اختيار الرئيسي لكل نوع
- صندوق الكاشير مستقل عن خزينة الفرع ويظهر بحركاته المالية ضمن الخزينة
- لكل حساب رصيد افتتاحي يسجل مرة واحدة وكشف حركة ومطابقة وسجل إجراءات
- سندات القبض والصرف تدعم التصنيف ومركز التكلفة الاختياري ومرفقات اختيارية متعددة
- لا يفرض التطبيق حد حجم أو عدد للمرفقات وتضغط الصور مع بقاء المستندات الأصلية دون تحويل وحدود مزود التخزين قائمة
- كل نقطة شبكة مرتبطة ببنك وتحفظ العمولة وضريبتها والاشتراك الشهري ويوم استحقاقه
- الفاتورة لا تنقص بسبب رسوم البنك وتظهر الرسوم المستحقة مستقلة حتى تسجيل خصم البنك الفعلي
- التصحيح والتصفير والعكس المحاسبي المحمي يتطلب أدمن برندة بالدخول بالنيابة ويحفظ المستند الأصلي
- التفاصيل في دليل إدارة الخزينة

## الورديات

- يربط بدء الوردية بصندوق الكاشير المستقل ويعد الموظف النقد دون عرض الرصيد المتوقع له
- لكل وردية رقم ووقت مسجل مع الموظف الحالي والسابق وفروق النقد وحالة إشعار المالك
- تسوية الفرق من حساب الموظف أو من الصندوق تسجل بقيد موثق وفق الصلاحيات
- الإغلاق يسجل النقد المعدود وتسليمه للوردية التالية أو محاسب الفرع أو شخص آخر ببياناته
- سند استلام نقد الوردية مرتبط برقمها ومستلمها ومبلغها لمنع تسجيل الاستلام مرتين

## البيع والعميل والطباعة

- صور الأصناف داخل السلة وإجمالي واضح وأزرار كاش وشبكة مع وسائل السداد الإضافية
- معاينة الإيصال قبل الحفظ لا تنشئ فاتورة أو قيدًا أو رسالة
- الضريبة المحسوبة تظهر منفصلة حتى عندما يكون سعر المنتج شاملًا لها وبحسب إعداد العلامة
- رقم العميل اختياري وحفظ فاتورة برقمه يربط الطلب بالبيجر وبمسار الولاء
- الختم يسجل مرة واحدة للفاتورة أو ينتظر استكمال تسجيل البطاقة الحالية ويظهر صرف المكافأة الجاهزة باختيار صريح
- مسار البيجر الأصلي ومسح بطاقة الولاء الحالي محفوظان دون تغيير
- بعد حفظ البيع ترسل نسختا العميل والمطبخ للطباعة وفق إعداد الجهاز ولا تعاد الطباعة بسبب المزامنة أو إعادة فتح السجل

## العمل دون اتصال

- يلزم فتح الكاشير وتسجيل الدخول مع الإنترنت أول مرة لتجهيز المنتجات والصور والهوية المحلية
- تحفظ المبيعات محليًا بمعرف ثابت وتزامن تلقائيًا بعد عودة الشبكة دون تكرار الفواتير
- التعارض أو انتهاء الصلاحية يحتفظ بالعملية للمراجعة ولا يمسحها
- لا تغلق الوردية مع مبيعات معلقة ولا تمسح بيانات المتصفح قبل إتمام المزامنة
- البيع في وردية قائمة متاح دون اتصال أما فتح وإغلاق الورديات والمرتجعات وصرف المكافآت فتحتاج اتصالًا
- ربط الطابعة المحلية يسمح بالطباعة دون الإنترنت بعد الإعداد أما خيار المتصفح فيحتاج تأكيد الطباعة

## التجهيز المتبقي

تثبيت خدمة الطابعة وربطها وتعريف الطابعة الحرارية مطلوب على جهاز كل كاشير ثم اختبار الورق فعليًا

اختبر التطوير الخط العربي والطباعة الافتراضية دون إنترنت ولم تتوفر طابعة حرارية فعلية

توسعة فواتير الموردين وتحليل الورديات في المسودات القديمة تحتاج دمجًا مستقلًا ولا يعد هذا الدليل إثباتًا لنشرها والتكامل مع مدار ما زال مقترحًا
