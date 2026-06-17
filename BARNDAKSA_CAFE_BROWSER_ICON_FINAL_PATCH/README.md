# BARNDAKSA_CAFE_BROWSER_ICON_FINAL_PATCH

إصلاح نهائي لأيقونة المتصفح الخاصة بالفرع الإلكتروني `/c/[slug]`.

الأولوية المستخدمة للأيقونة:

1. شعار العلامة من إعدادات الكوفي.
2. إذا غير موجود، شعار ثيم الكوفي.
3. إذا غير موجود، شعار برندة.

طريقة التشغيل من جذر المشروع:

```bash
node BARNDAKSA_CAFE_BROWSER_ICON_FINAL_PATCH/apply-patch.cjs
npm exec tsc -- --noEmit
npm run build
```

بعد التشغيل افتح الفرع من نافذة Incognito أو امسح كاش الموقع، لأن Chrome قد يحفظ favicon القديم.
