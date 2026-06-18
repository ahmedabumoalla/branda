# BARNDAKSA_ACCOUNT_STABILITY_AND_DASHBOARD_AUTH_FIX_PATCH

يشمل إصلاحات ثبات بعد طبقة السرعة:

- تحويل صفحة حساب عميل العلامة إلى طلب واحد مجمع بدل 4 طلبات منفصلة.
- عدم تحميل الولاء أو توثيق التجارب إذا الخدمة ليست ضمن باقة العلامة.
- منع 500 في لوحة العلامة عند عدم وجود جلسة صاحب علامة، والتحويل إلى /login بدل رمي Unauthorized.
- تهدئة خطأ صورة شعار برندة بإجبار العرض والارتفاع معًا داخل CafeLogo.
- لا يوجد SQL.

التطبيق من جذر المشروع:

```bash
node BARNDAKSA_ACCOUNT_STABILITY_AND_DASHBOARD_AUTH_FIX_PATCH/apply-patch.cjs
npm exec tsc -- --noEmit
npm run build
```
