# BARNDAKSA_CAFE_LOGO_PRIORITY_FINAL_PATCH

يشغل من جذر المشروع فقط:

```bash
node BARNDAKSA_CAFE_LOGO_PRIORITY_FINAL_PATCH/apply-patch.cjs
```

ثم:

```bash
npm exec tsc -- --noEmit
npm run build
```

الأولوية بعد الباتش:

1. شعار العلامة من قسم إعدادات الكوفي.
2. شعار ثيم الكوفي إذا لم يوجد شعار في الإعدادات.
3. شعار برندة إذا لم يوجد أي شعار.

لا توجد تعديلات على قاعدة البيانات.
