# BARNDAKSA_CUSTOMER_FAST_APP_PATCH

هذا الباتش مصحح ومغلف بدون ملفات TypeScript مكشوفة داخل مجلد الباتش، حتى لا يفحصها `tsc` أو `next build`.

## طريقة الاستخدام

1. فك الضغط.
2. انسخ مجلد `BARNDAKSA_CUSTOMER_FAST_APP_PATCH` كاملًا إلى جذر المشروع:

```text
E:\branda-platform\BARNDAKSA_CUSTOMER_FAST_APP_PATCH
```

3. من جذر المشروع شغل:

```bash
node BARNDAKSA_CUSTOMER_FAST_APP_PATCH/apply-patch.cjs
```

أو ادخل مجلد الباتش وشغل:

```bash
cd BARNDAKSA_CUSTOMER_FAST_APP_PATCH
node apply-patch.cjs
```

4. بعدها اختبر:

```bash
npm exec tsc -- --noEmit
npm run build
```

## مهم

السكربت ينظف تلقائيًا مجلد `patch-files` القديم الذي سبب خطأ TypeScript.
لا يوجد تعديل قاعدة بيانات في هذا الباتش.
