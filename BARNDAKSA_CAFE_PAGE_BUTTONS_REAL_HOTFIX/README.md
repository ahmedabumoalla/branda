# BARNDAKSA_CAFE_PAGE_BUTTONS_REAL_HOTFIX

يرجع أزرار صفحة الفرع الإلكتروني الأصلية:

- تصفح المنتجات
- العروض والخصومات
- الحجوزات

## طريقة التطبيق

انسخ مجلد `BARNDAKSA_CAFE_PAGE_BUTTONS_REAL_HOTFIX` داخل جذر المشروع ثم شغل:

```bash
node BARNDAKSA_CAFE_PAGE_BUTTONS_REAL_HOTFIX/apply-patch.cjs
```

بعدها:

```bash
npm exec tsc -- --noEmit
npm run build
```

لا يوجد تعديل على قاعدة البيانات.
