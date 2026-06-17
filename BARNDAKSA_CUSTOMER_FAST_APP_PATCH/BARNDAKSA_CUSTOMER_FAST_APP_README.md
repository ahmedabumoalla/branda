# BARNDAKSA_CUSTOMER_FAST_APP_PATCH

يفتح طبقة عميل سريعة مستقلة على المسار:

`/app/[slug]`

ويجعل تثبيت PWA الخاص بالعلامة يبدأ من التطبيق السريع بدل الفرع الإلكتروني الثقيل.

طريقة التطبيق من جذر المشروع:

```bash
node apply-patch.cjs
npm exec tsc -- --noEmit
npm run build
```

لا توجد تعديلات قاعدة بيانات في هذا الباتش.
